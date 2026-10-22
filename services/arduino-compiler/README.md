# arduino-compiler

Bot Lab's Arduino compiler: `arduino-cli` 1.2.2 with the `arduino:avr` 1.8.6 core and the Servo library, in a
container that serves builds over HTTP on a Hugging Face Space and also compiles the committed templates.

## The service

`server.py` (standard library only), started when the image runs with no arguments:

- `POST /compile` with `Authorization: Bearer $COMPILER_SECRET` and `{"sketch": "...", "board": "uno"}` returns
  `{"ok": true, "hex", "size", "warnings"}` or `{"ok": false, "errors": [{line, column, severity, message}], "log"}`.
- `GET /healthz` returns `{"ok": true}`.
- Sketches are limited to 64 KB and 45 s of compiling, two builds at a time per instance.
- Compiler messages quote source, so a sketch that `#include`s a file would echo it. Three guards keep the secret
  out of reach: includes of absolute or `..` paths are refused up front, the compiler gets an empty environment, and
  the server makes itself non-dumpable, so its `/proc/<pid>/environ` is root-only. Hugging Face runs the container
  as uid 1000 (the image's `builder` user). Where it runs as root (Docker locally), compiles also drop to `builder`.
  A computed `#include` of `/proc/1/environ` gets "Permission denied" either way.
- The Arduino core is precompiled into the image, so a fresh instance builds a sketch in well under a second.

The site never exposes the secret. Browsers call `/api/bot-lab/compile` (`apps/web/lib/bot-lab-compile.ts`), which
rate-limits per visitor, caches builds by sketch in Redis, and forwards here with `BOT_LAB_COMPILER_URL` and
`BOT_LAB_COMPILER_SECRET`.

Tests: `pnpm --filter @xlibraries/arduino-compiler test` (part of `pnpm verify`; a fake `arduino-cli` stands in, so
no toolchain is needed). Try the real thing locally:

```sh
docker build -t xlib-arduino-compiler services/arduino-compiler
docker run --rm -p 8080:8080 --user 1000 -e COMPILER_SECRET=dev xlib-arduino-compiler
curl -s localhost:8080/compile -H 'Authorization: Bearer dev' -d '{"sketch":"void setup(){}\nvoid loop(){}"}'
```

Point a local site at it with `BOT_LAB_COMPILER_URL=http://localhost:8080 BOT_LAB_COMPILER_SECRET=dev pnpm dev`.

## Deploying (Hugging Face Spaces)

The service runs as a public Docker Space, on the free CPU tier (2 vCPU, 16 GB). Its `/compile` needs the secret, and
the code is public in this repo anyway. A free Space sleeps after 48 hours without requests, and the next build wakes
it in about a minute; the site tells visitors so.

`deploy-hf.sh` pushes the image's files to the Space, with a generated Space card (`sdk: docker`, `app_port: 8080`),
then waits until it runs and answers. `.github/workflows/arduino-compiler.yml` runs it whenever this folder changes on
`master`, using the `HF_TOKEN` secret and `HF_SPACE` variable.

One-time setup, with your **personal** Hugging Face account (the script refuses a flamapp.com one):

1. On huggingface.co: Settings → Access Tokens → create a token of type **Write**.
2. `gh auth switch --user xlibraries`
3. `services/arduino-compiler/setup-hf.sh` (asks for the token; the Space is named `bot-lab-compiler` unless you pass a name)

It creates the Space with a random `COMPILER_SECRET`, stores the token and Space name in the GitHub repo, does the
first deploy, and prints `BOT_LAB_COMPILER_URL` and `BOT_LAB_COMPILER_SECRET` for Vercel.

## The templates

With a sketch name, the image compiles `/sketch/<name>/<name>.ino` and prints the hex:

```sh
docker run --rm -v "$PWD/packages/bot-lab/templates:/sketch" xlib-arduino-compiler blink > packages/bot-lab/templates/blink/blink.hex
```

`pnpm --filter @xlibraries/bot-lab compile:templates` does that for every template (needs Docker), and CI checks
the committed hexes match (`.github/workflows/bot-lab-templates.yml`).
