# arduino-compiler

Bot Lab's Arduino compiler: `arduino-cli` 1.2.2 with the `arduino:avr` 1.8.6 core and the Servo library, in a
container that serves builds over HTTP on Cloud Run and also compiles the committed templates.

## The service

`server.py` (standard library only), started when the image runs with no arguments:

- `POST /compile` with `Authorization: Bearer $COMPILER_SECRET` and `{"sketch": "...", "board": "uno"}` returns
  `{"ok": true, "hex", "size", "warnings"}` or `{"ok": false, "errors": [{line, column, severity, message}], "log"}`.
- `GET /healthz` returns `{"ok": true}`.
- Sketches are limited to 64 KB and 45 s of compiling, two builds at a time per instance.
- Compiler messages quote source, so a sketch that `#include`s a file would echo it. Compiles therefore run as the
  unprivileged `builder` user with an empty environment, which can't read the service's environment, where the secret
  lives. Includes of absolute or `..` paths are also refused up front.
- The Arduino core is precompiled into the image, so a fresh instance builds a sketch in well under a second.

The site never exposes the secret. Browsers call `/api/bot-lab/compile` (`apps/web/lib/bot-lab-compile.ts`), which
rate-limits per visitor, caches builds by sketch in Redis, and forwards here with `BOT_LAB_COMPILER_URL` and
`BOT_LAB_COMPILER_SECRET`.

Tests: `pnpm --filter @xlibraries/arduino-compiler test` (part of `pnpm verify`; a fake `arduino-cli` stands in, so
no toolchain is needed). Try the real thing locally:

```sh
docker build -t xlib-arduino-compiler services/arduino-compiler
docker run --rm -p 8080:8080 -e COMPILER_SECRET=dev xlib-arduino-compiler
curl -s localhost:8080/compile -H 'Authorization: Bearer dev' -d '{"sketch":"void setup(){}\nvoid loop(){}"}'
```

Point a local site at it with `BOT_LAB_COMPILER_URL=http://localhost:8080 BOT_LAB_COMPILER_SECRET=dev pnpm dev`.

## Deploying (Cloud Run)

`.github/workflows/arduino-compiler.yml` builds the image, pushes it to Artifact Registry and deploys
`bot-lab-compiler` whenever this folder changes on `master`. It uses no keys: GitHub's OIDC token becomes the deploy
service account through Workload Identity Federation, and only `xlibraries/Xlib` may do that. The service scales to
zero (min 0, max 2 instances), which keeps it inside the free tier.

One-time setup, with your **personal** Google account (the script refuses a flamapp.com one):

```sh
gcloud auth login
gh auth switch --user xlibraries
services/arduino-compiler/setup-gcp.sh <project-id> [region, default us-central1]
```

It prints the last two steps: run the workflow, then put the service URL and the secret in Vercel.

## The templates

With a sketch name, the image compiles `/sketch/<name>/<name>.ino` and prints the hex:

```sh
docker run --rm -v "$PWD/packages/bot-lab/templates:/sketch" xlib-arduino-compiler blink > packages/bot-lab/templates/blink/blink.hex
```

`pnpm --filter @xlibraries/bot-lab compile:templates` does that for every template (needs Docker), and CI checks
the committed hexes match (`.github/workflows/bot-lab-templates.yml`).
