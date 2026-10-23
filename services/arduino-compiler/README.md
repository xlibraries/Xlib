# arduino-compiler

Bot Lab's Arduino compiler: `arduino-cli` 1.2.2 with the `arduino:avr` 1.8.6 core and the Servo, LiquidCrystal I2C and Adafruit SSD1306 (with GFX and BusIO) libraries, in a
container that builds visitors' sketches (one GitHub Actions run per build, or an HTTP service for local development)
and compiles the committed templates.

## Live builds on GitHub Actions

Visitors' builds run on GitHub Actions, which costs nothing for this public repo and needs no other host:

1. `POST /api/bot-lab/compile` (`apps/web/lib/bot-lab-compile.ts`) checks the sketch, answers from the cache when the
   same text was built before, and otherwise stores the sketch in Redis under a random job id for a few minutes.
   It then starts `.github/workflows/bot-lab-compile.yml` with that id, using `BOT_LAB_GITHUB_TOKEN`, a token that
   can only run workflows.
2. The run fetches the sketch from `/api/bot-lab/compile-job` with `BOT_LAB_JOB_SECRET`, compiles it with this image
   (`server.py compile-stdin`, with no network), and posts the result back. It prints nothing about the sketch,
   because Actions logs are public, and GitHub never receives the sketch in the run's inputs.
3. The browser polls `GET /api/bot-lab/compile?job=…` and shows the progress. A build takes about a minute, most of it
   waiting for a runner and pulling the image.

`.github/workflows/arduino-compiler.yml` publishes the image to `ghcr.io/xlibraries/arduino-compiler` whenever this
folder changes on `master`. Builds are limited per visitor and overall, and are cached by sketch for a week. Until the
site has `BOT_LAB_GITHUB_TOKEN` and `BOT_LAB_JOB_SECRET`, the editor hides Build and the Uno runs the templates' builds.

One-time setup: `gh auth switch --user xlibraries && services/arduino-compiler/setup-actions.sh`. It stores the job
secret and the site's address in the repo, publishes the image if needed, and lists the two values for Vercel.

## The HTTP service (local development)

`server.py`, started when the image runs with no arguments, serves builds directly:

- `POST /compile` with `Authorization: Bearer $COMPILER_SECRET` and `{"sketch": "...", "board": "uno"}` returns
  `{"ok": true, "hex", "size", "warnings"}` or `{"ok": false, "errors": [{line, column, severity, message}], "log"}`.
- `GET /healthz` returns `{"ok": true}`.

```sh
docker build -t xlib-arduino-compiler services/arduino-compiler
docker run --rm -p 8080:8080 --user 1000 -e COMPILER_SECRET=dev xlib-arduino-compiler
BOT_LAB_COMPILER_URL=http://localhost:8080 BOT_LAB_COMPILER_SECRET=dev pnpm dev
```

## Both modes

- Sketches are limited to 64 KB and 45 s of compiling. The Arduino core is precompiled into the image, so a sketch
  builds in well under a second once the image is running.
- Compiler messages quote source, so a sketch that `#include`s a file would echo it. Includes of absolute or `..`
  paths are refused up front, and the compiler gets an empty environment. As root, compiles drop to the `builder`
  user (uid 1000). The HTTP server also makes itself non-dumpable, so its environment, where the secret lives, is
  root-only. A computed `#include` of `/proc/1/environ` gets "Permission denied". On Actions, the container holds no
  secrets at all and has no network.

Tests: `pnpm --filter @xlibraries/arduino-compiler test`, part of `pnpm verify`. A fake `arduino-cli` stands in, so
no toolchain is needed.

## The templates

With a sketch name, the image compiles `/sketch/<name>/<name>.ino` and prints the hex:

```sh
docker run --rm -v "$PWD/packages/bot-lab/templates:/sketch" xlib-arduino-compiler blink > packages/bot-lab/templates/blink/blink.hex
```

`pnpm --filter @xlibraries/bot-lab compile:templates` does that for every template (needs Docker), and CI checks
the committed hexes match (`.github/workflows/bot-lab-templates.yml`).
