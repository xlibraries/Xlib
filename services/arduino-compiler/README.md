# arduino-compiler

The compiler behind Bot Lab's Arduino sketches: `arduino-cli` 1.2.2 with the `arduino:avr` 1.8.6 core and the
Servo library, in a container. Phase 4 of `docs/bot-lab-plan.md` puts an HTTP front on it and deploys it to Cloud
Run; until then it compiles the templates locally:

```sh
docker build -t xlib-arduino-compiler services/arduino-compiler
docker run --rm -v "$PWD/packages/bot-lab/templates:/sketch" xlib-arduino-compiler blink > packages/bot-lab/templates/blink/blink.hex
```

`pnpm --filter @xlibraries/bot-lab compile:templates` does that for every template (needs Docker running).
