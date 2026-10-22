"""Bot Lab's Arduino compile service: POST a sketch, get the Uno's Intel HEX or the compiler's errors with lines.

Runs in the arduino-compiler image (a Hugging Face Docker Space). Standard library only.

    POST /compile   Authorization: Bearer <COMPILER_SECRET>   {"sketch": "...", "board": "uno"}
        200 {"ok": true, "hex": "...", "size": 924, "warnings": [...]}
        200 {"ok": false, "errors": [{"line": 5, "column": 3, "severity": "error", "message": "..."}], "log": "..."}
        400 bad request, 401 wrong secret, 413 too big, 429 busy
    GET /healthz    200 ok

The compiler's messages quote source lines, so a sketch that #includes a file would echo it. Three guards keep the
secret out of reach: includes of absolute paths or paths with .. are refused before compiling; the compiler gets an
empty environment; and this process marks itself non-dumpable, which makes its /proc files (environ included)
readable only by root. Where the container runs as root (Docker locally), compiles also drop to the
unprivileged `builder` user; on Hugging Face Spaces the container already runs as that user (uid 1000).
"""
import hmac
import json
import os
import re
import shutil
import signal
import subprocess
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

MAX_SKETCH = 64 * 1024
TIMEOUT = 45                    # seconds for one compile (a warm core takes a few)
BOARDS = {"uno": "arduino:avr:uno"}
SKETCH = "sketch"               # the sketch's name inside the job folder: errors refer to sketch.ino
CONCURRENT = 2                  # compiles at once (more queue for a slot, up to 20 s)

_slots = threading.BoundedSemaphore(CONCURRENT)

_INCLUDE = re.compile(r'^\s*#\s*include\s*[<"]([^>"]*)[>"]', re.MULTILINE)
_MESSAGE = re.compile(r"(?:^|[\\/])" + SKETCH + r"\.ino:(\d+):(?:(\d+):)?\s*(error|warning|note|fatal error):\s*(.*)$")


class BadRequest(Exception):
    def __init__(self, status, message):
        super().__init__(message)
        self.status = status


def parse_request(body: bytes) -> tuple[str, str]:
    """The sketch and the board's FQBN from a request body, or BadRequest."""
    if len(body) > MAX_SKETCH + 1024:
        raise BadRequest(413, f"sketches are limited to {MAX_SKETCH // 1024} KB")
    try:
        data = json.loads(body or b"{}")
    except ValueError:
        raise BadRequest(400, "the body must be JSON")
    if not isinstance(data, dict):
        raise BadRequest(400, "the body must be a JSON object")
    sketch = data.get("sketch")
    if not isinstance(sketch, str) or not sketch.strip():
        raise BadRequest(400, "sketch must be a non-empty string")
    if len(sketch.encode()) > MAX_SKETCH:
        raise BadRequest(413, f"sketches are limited to {MAX_SKETCH // 1024} KB")
    board = data.get("board", "uno")
    if board not in BOARDS:
        raise BadRequest(400, f"unknown board {board!r}; known: {', '.join(BOARDS)}")
    for path in _INCLUDE.findall(sketch):
        if path.startswith(("/", "\\")) or ".." in path or ":" in path:
            raise BadRequest(400, f"#include \"{path}\": only libraries and headers by name can be included")
    return sketch, BOARDS[board]


def parse_messages(log: str) -> list[dict]:
    """Compiler messages about the sketch, with their lines; notes are kept, duplicates dropped."""
    out, seen = [], set()
    for raw in log.splitlines():
        m = _MESSAGE.search(raw)
        if not m:
            continue
        line, column, severity, message = int(m.group(1)), int(m.group(2) or 0), m.group(3), m.group(4).strip()
        severity = "error" if severity == "fatal error" else severity
        key = (line, column, severity, message)
        if key not in seen:
            seen.add(key)
            out.append({"line": line, "column": column, "severity": severity, "message": message})
    return out


def clean_log(log: str, job: str) -> str:
    """The compiler's output without the job's temporary paths (and short enough to send)."""
    log = log.replace(os.path.join(job, SKETCH) + os.sep, "").replace(job + os.sep, "")
    return log[-8000:]


def _demote():
    """In the compiler's child process: become the unprivileged builder user (when we are root)."""
    if os.getuid() == 0:
        import pwd
        user = pwd.getpwnam(os.environ.get("BUILDER_USER", "builder"))
        os.setgroups([])
        os.setgid(user.pw_gid)
        os.setuid(user.pw_uid)


def compile_sketch(sketch: str, fqbn: str, cli: str = "arduino-cli", timeout: int = TIMEOUT) -> dict:
    """Compiles one sketch; returns the response body."""
    job = tempfile.mkdtemp(prefix="job-")
    try:
        folder = os.path.join(job, SKETCH)
        os.mkdir(folder)
        with open(os.path.join(folder, SKETCH + ".ino"), "w") as f:
            f.write(sketch)
        out = os.path.join(job, "out")
        os.mkdir(out)
        if os.getuid() == 0:
            shutil.chown(job, os.environ.get("BUILDER_USER", "builder"))
            for d in (folder, out):
                shutil.chown(d, os.environ.get("BUILDER_USER", "builder"))
        env = {k: os.environ[k] for k in ("PATH",) if k in os.environ}
        env.update({k: v for k, v in os.environ.items() if k.startswith("ARDUINO_")})
        env["HOME"] = job
        # its own process group, so a timeout also ends the compilers arduino-cli started (they hold the pipes)
        proc = subprocess.Popen([cli, "compile", "--fqbn", fqbn, "--output-dir", out, "--warnings", "default", folder],
                                stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, env=env, preexec_fn=_demote, start_new_session=True)
        try:
            stdout, stderr = proc.communicate(timeout=timeout)
        except subprocess.TimeoutExpired:
            os.killpg(proc.pid, signal.SIGKILL)
            proc.communicate()
            return {"ok": False, "errors": [{"line": 0, "column": 0, "severity": "error", "message": f"the build took longer than {timeout} s"}], "log": ""}
        log = clean_log(stdout + stderr, job)
        messages = parse_messages(log)
        hexes = [n for n in os.listdir(out) if n.endswith(".ino.hex") and "bootloader" not in n]
        if proc.returncode != 0 or not hexes:
            errors = [m for m in messages if m["severity"] == "error"] or [{"line": 0, "column": 0, "severity": "error", "message": (log.strip().splitlines() or ["the build failed"])[-1]}]
            return {"ok": False, "errors": errors, "log": log}
        with open(os.path.join(out, hexes[0])) as f:
            hex_text = f.read()
        size = sum(int(line[1:3], 16) for line in hex_text.splitlines() if line.startswith(":") and line[7:9] == "00")
        return {"ok": True, "hex": hex_text, "size": size, "warnings": [m for m in messages if m["severity"] == "warning"]}
    finally:
        shutil.rmtree(job, ignore_errors=True)


class Handler(BaseHTTPRequestHandler):
    secret = ""
    compile = staticmethod(compile_sketch)

    def _send(self, status, body):
        data = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path == "/healthz":
            return self._send(200, {"ok": True})
        if self.path == "/":
            return self._send(200, {"service": "Bot Lab's Arduino compiler", "source": "https://github.com/xlibraries/Xlib/tree/master/services/arduino-compiler"})
        self._send(404, {"error": "not found"})

    def do_POST(self):
        if self.path != "/compile":
            return self._send(404, {"error": "not found"})
        given = self.headers.get("Authorization", "")
        if not self.secret or not hmac.compare_digest(given.encode(), f"Bearer {self.secret}".encode()):
            return self._send(401, {"error": "unauthorized"})
        length = int(self.headers.get("Content-Length") or 0)
        if length > MAX_SKETCH + 1024:
            return self._send(413, {"error": f"sketches are limited to {MAX_SKETCH // 1024} KB"})
        try:
            sketch, fqbn = parse_request(self.rfile.read(length))
        except BadRequest as e:
            return self._send(e.status, {"error": str(e)})
        if not _slots.acquire(timeout=20):
            return self._send(429, {"error": "the compiler is busy; try again in a moment"})
        try:
            self._send(200, self.compile(sketch, fqbn))
        finally:
            _slots.release()

    def log_message(self, fmt, *args):       # one line per request, no bodies
        print(f"{self.address_string()} {fmt % args}", flush=True)


def protect_environment() -> bool:
    """Makes this process non-dumpable (Linux): its /proc/<pid>/environ, where the secret is, becomes root-only, so
    a compile running as the same user can't read it. Returns whether it worked."""
    try:
        import ctypes
        libc = ctypes.CDLL(None, use_errno=True)
        PR_SET_DUMPABLE, PR_GET_DUMPABLE = 4, 3
        return libc.prctl(PR_SET_DUMPABLE, 0, 0, 0, 0) == 0 and libc.prctl(PR_GET_DUMPABLE, 0, 0, 0, 0) == 0
    except (OSError, AttributeError):
        return False


def main():
    if not protect_environment() and os.environ.get("ALLOW_DUMPABLE") != "1":
        raise SystemExit("could not make the process non-dumpable (Linux prctl); set ALLOW_DUMPABLE=1 to run anyway (development only)")
    secret = os.environ.pop("COMPILER_SECRET", "")
    if not secret:
        raise SystemExit("COMPILER_SECRET is not set")
    Handler.secret = secret
    port = int(os.environ.get("PORT", "8080"))
    print(f"arduino-compiler listening on :{port}", flush=True)
    ThreadingHTTPServer(("", port), Handler).serve_forever()


if __name__ == "__main__":
    main()
