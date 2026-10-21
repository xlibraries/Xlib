"""Tests for the compile service. The HTTP layer and the parsing run anywhere; compile_sketch runs against a fake
arduino-cli (a script that writes a hex or prints errors), so no toolchain is needed."""
import json
import os
import stat
import sys
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer

sys.path.insert(0, os.path.dirname(__file__))
import server  # noqa: E402

HEX = ":100000000C9434000C943E000C943E000C943E0082\n:00000001FF\n"


def fake_cli(behaviour: str) -> str:
    """A stand-in for arduino-cli: 'ok' writes a hex into --output-dir, 'error' prints gcc-style errors, 'env' dumps its environment."""
    path = os.path.join(tempfile.mkdtemp(), "arduino-cli")
    with open(path, "w") as f:
        f.write(f"""#!{sys.executable}
import os, sys
args = sys.argv[1:]
out = args[args.index('--output-dir') + 1]
folder = args[-1]
behaviour = {behaviour!r}
if behaviour == 'ok':
    open(os.path.join(out, 'sketch.ino.hex'), 'w').write({HEX!r})
    open(os.path.join(out, 'sketch.ino.with_bootloader.hex'), 'w').write('nope')
    print(folder + '/sketch.ino:3:5: warning: unused variable \\'x\\' [-Wunused-variable]', file=sys.stderr)
elif behaviour == 'error':
    print(folder + '/sketch.ino: In function \\'void loop()\\':', file=sys.stderr)
    print(folder + '/sketch.ino:7:3: error: \\'digitalWrit\\' was not declared in this scope', file=sys.stderr)
    print(folder + '/sketch.ino:7:3: note: suggested alternative: \\'digitalWrite\\'', file=sys.stderr)
    print(folder + '/sketch.ino:7:3: error: \\'digitalWrit\\' was not declared in this scope', file=sys.stderr)
    sys.exit(1)
elif behaviour == 'env':
    print(folder + '/sketch.ino:1:1: error: ' + ' '.join(sorted(os.environ)), file=sys.stderr)
    sys.exit(1)
""")
    os.chmod(path, os.stat(path).st_mode | stat.S_IEXEC)
    return path


class ParseRequest(unittest.TestCase):
    def test_accepts_a_sketch_for_the_uno(self):
        self.assertEqual(server.parse_request(b'{"sketch": "void setup(){}"}'), ("void setup(){}", "arduino:avr:uno"))

    def test_refuses_bad_bodies(self):
        for body, status in [(b"nope", 400), (b"[]", 400), (b'{"sketch": ""}', 400), (b'{"sketch": 3}', 400),
                             (b'{"sketch": "x", "board": "mega"}', 400),
                             (json.dumps({"sketch": "x" * (server.MAX_SKETCH + 1)}).encode(), 413)]:
            with self.assertRaises(server.BadRequest) as e:
                server.parse_request(body)
            self.assertEqual(e.exception.status, status, body[:40])

    def test_includes_by_name_only(self):
        ok = '#include <Servo.h>\n#include "notes.h"\n#  include <avr/io.h>\nvoid setup(){}'
        self.assertEqual(server.parse_request(json.dumps({"sketch": ok}).encode())[0], ok)
        for path in ["/proc/1/environ", "../server.py", "C:/x.h", "\\\\host\\x", "a/../../b"]:
            with self.assertRaises(server.BadRequest, msg=path):
                server.parse_request(json.dumps({"sketch": f'#include "{path}"\nvoid setup(){{}}'}).encode())


class ParseMessages(unittest.TestCase):
    def test_lines_columns_and_severities_without_duplicates(self):
        log = ("sketch.ino: In function 'void loop()':\n"
               "sketch.ino:7:3: error: 'digitalWrit' was not declared in this scope\n"
               "sketch.ino:7:3: error: 'digitalWrit' was not declared in this scope\n"
               "/tmp/job-1/sketch/sketch.ino:9: fatal error: Servo2.h: No such file or directory\n"
               "sketch.ino:3:5: warning: unused variable 'x'\n"
               "other.cpp:1:1: error: not ours\n")
        self.assertEqual(server.parse_messages(log), [
            {"line": 7, "column": 3, "severity": "error", "message": "'digitalWrit' was not declared in this scope"},
            {"line": 9, "column": 0, "severity": "error", "message": "Servo2.h: No such file or directory"},
            {"line": 3, "column": 5, "severity": "warning", "message": "unused variable 'x'"},
        ])

    def test_clean_log_hides_the_job_folder(self):
        self.assertEqual(server.clean_log("/tmp/job-ab/sketch/sketch.ino:1:1: error: x\n/tmp/job-ab/out", "/tmp/job-ab"), "sketch.ino:1:1: error: x\nout")


class CompileSketch(unittest.TestCase):
    def test_a_good_sketch_returns_its_hex_size_and_warnings(self):
        r = server.compile_sketch("void setup(){}\nvoid loop(){}\n", "arduino:avr:uno", cli=fake_cli("ok"))
        self.assertTrue(r["ok"])
        self.assertEqual(r["hex"], HEX)
        self.assertEqual(r["size"], 16)
        self.assertEqual([w["line"] for w in r["warnings"]], [3])

    def test_errors_come_back_with_their_lines(self):
        r = server.compile_sketch("void loop(){}", "arduino:avr:uno", cli=fake_cli("error"))
        self.assertFalse(r["ok"])
        self.assertEqual(r["errors"], [{"line": 7, "column": 3, "severity": "error", "message": "'digitalWrit' was not declared in this scope"}])
        self.assertNotIn("/job-", r["log"])

    def test_the_compiler_never_sees_the_secret(self):
        os.environ["COMPILER_SECRET_LEAK_CHECK"] = "x"
        try:
            r = server.compile_sketch("x", "arduino:avr:uno", cli=fake_cli("env"))
        finally:
            del os.environ["COMPILER_SECRET_LEAK_CHECK"]
        names = r["errors"][0]["message"].split()
        self.assertNotIn("COMPILER_SECRET_LEAK_CHECK", names)
        self.assertIn("PATH", names)

    def test_a_build_that_hangs_times_out(self):
        path = os.path.join(tempfile.mkdtemp(), "arduino-cli")
        with open(path, "w") as f:
            f.write(f"#!{sys.executable}\nimport subprocess, time\nsubprocess.Popen(['sleep', '5'])\ntime.sleep(5)\n")   # a child, like avr-gcc
        os.chmod(path, 0o755)
        import time
        t0 = time.monotonic()
        r = server.compile_sketch("x", "arduino:avr:uno", cli=path, timeout=1)
        self.assertLess(time.monotonic() - t0, 3)   # the whole process group is killed, not left holding the pipes
        self.assertFalse(r["ok"])
        self.assertIn("longer than 1 s", r["errors"][0]["message"])


class Http(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        class H(server.Handler):
            secret = "s3cret"
            compile = staticmethod(lambda sketch, fqbn: {"ok": True, "hex": HEX, "size": 16, "warnings": [], "echo": [sketch, fqbn]})
            def log_message(self, *a):
                pass
        cls.httpd = ThreadingHTTPServer(("127.0.0.1", 0), H)
        cls.url = f"http://127.0.0.1:{cls.httpd.server_address[1]}"
        threading.Thread(target=cls.httpd.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()

    def post(self, body, secret="s3cret", path="/compile"):
        req = urllib.request.Request(self.url + path, data=json.dumps(body).encode(), method="POST",
                                     headers={"Content-Type": "application/json", **({"Authorization": f"Bearer {secret}"} if secret else {})})
        try:
            with urllib.request.urlopen(req) as r:
                return r.status, json.loads(r.read())
        except urllib.error.HTTPError as e:
            return e.code, json.loads(e.read())

    def test_compiles_with_the_secret(self):
        status, body = self.post({"sketch": "void setup(){}"})
        self.assertEqual(status, 200)
        self.assertEqual(body["echo"], ["void setup(){}", "arduino:avr:uno"])

    def test_refuses_without_the_secret(self):
        self.assertEqual(self.post({"sketch": "x"}, secret="wrong")[0], 401)
        self.assertEqual(self.post({"sketch": "x"}, secret=None)[0], 401)

    def test_bad_requests_and_unknown_paths(self):
        self.assertEqual(self.post({"sketch": '#include "/proc/self/environ"'})[0], 400)
        self.assertEqual(self.post({"sketch": "x"}, path="/nope")[0], 404)

    def test_health(self):
        with urllib.request.urlopen(self.url + "/healthz") as r:
            self.assertEqual(json.loads(r.read()), {"ok": True})


if __name__ == "__main__":
    unittest.main()
