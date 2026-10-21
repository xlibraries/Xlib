# @xlibraries/arcade

Real-time games and graphics for the Xlib desktop ([xlibraries.com](https://xlibraries.com)), written in C++ with
[sokol](https://github.com/floooh/sokol) and compiled to WebAssembly twice: for **WebGPU** and **WebGL2**. The
Arcade app picks WebGPU when the browser has an adapter, otherwise WebGL2 (or whichever you force).

## Layout

```
native/runtime/xl.h       the bridge to the page: --canvas/--game arguments, focus, pause, saved values, frame stats
native/games/<id>/        each game's C++ (one sokol_main per game)
native/shaders/*.glsl     shaders, written once (sokol-shdc annotated GLSL), cross-compiled to GLSL ES 3.0 + WGSL
third_party/              sokol headers and HandmadeMath, pinned (see Versions)
scripts/build-native.mjs  sokol-shdc + em++ → dist/<id>/{webgpu,webgl2}.{js,wasm}
dist/                     committed build output (CI rebuilds and checks it matches; sources.sha256 stamps the inputs)
src/                      React: the Arcade launcher, GameView (canvas host), backend detection
```

## Use

```tsx
import { createArcade } from '@xlibraries/arcade';

const Arcade = createArcade({ baseUrl: '/arcade' });   // where dist/ is served
<Arcade host={host} />
```

Serve `dist/` at `baseUrl`, and allow WebAssembly in your Content Security Policy: `script-src 'self' 'wasm-unsafe-eval'`.

## Living in a window

- Each game gets its own canvas and WebAssembly instance (`-sMODULARIZE`), so it never touches the rest of the page.
- sokol listens for keys on the whole page; the runtime lets every key event through, and games react to keys
  only while their canvas has focus (`xl::focused()`).
- The page pauses a game while its window is hidden or the tab is in the background (`xl::paused()`).
- Leaving a game calls `sapp_quit()`, which releases its GPU resources.
- Gamepads: sokol_app doesn't read them on the web, so `GameView` polls the Gamepad API each frame (first pad,
  standard mapping, dead zone applied) and passes it to `xl::gamepad()`; `Gamepad::pressed()` detects new presses
  (call `xl::end_frame()` once per frame).

## Building

```sh
source ~/emsdk/emsdk_env.sh            # Emscripten 6.0.11 (see Versions)
pnpm --filter @xlibraries/arcade build:native
```

`sokol-shdc` is downloaded (pinned) into `.tools/` on first use. Build every game (no arguments) before committing: the
runtime headers are shared, and the unit tests compare `dist/sources.sha256` against the sources. Commit the updated `dist/`; CI rebuilds it with the
same toolchain and fails if it differs.

## Testing game logic

Rules that don't need a GPU live in `native/games/<id>/logic.cpp` and are unit-tested natively with
[doctest](https://github.com/doctest/doctest) (`tests/native/`): `pnpm --filter @xlibraries/arcade test:native`
compiles them with the system C++ compiler (also part of `test`/`verify`).

## Turbo Trails

A Hill Climb Racing–style drive through ten eras of transport (`native/games/turbo-trails`, plan in
`docs/turbo-trails-plan.md`). The physics is [Box2D v3.1.1](https://box2d.org) (vendored, scalar build) behind
`physics.h`, a small interface that issue #37 will reimplement with our own engine; `terrain.cpp` generates each
era's road from a seed; `rules.cpp` holds fuel, coins, flips, unlocks and the shop; `eras.cpp` is the data for
the ten eras. The page panel (`src/turbo-trails/Panel.tsx`) shows the story, the shop and the era list, and plays
the era's music (your own Chariots recordings, served from `dist/turbo-trails/`). `art.h` draws each era's backdrop,
landmark silhouettes and vehicle with sokol_gl. With `createArcade({ leaderboardUrl })`, the panel shows a global board
per era and posts a finished run's distance under the visitor's nickname when it beats what that device posted
(`GET ?game&board` → `{ entries }`, `POST { game, board, name, score }` → `{ entries, rank }`). Progress is saved on the device
(`arcade:turbo-trails:progress`).

## Side panels

A game can show a React panel beside its canvas (`Panel` in `src/games.ts`), which gets the running module and the
backend. The Shader Playground uses one for its editor: it validates your code in the page first (GLSL in a hidden
WebGL2 context, WGSL via WebGPU compilation info), so errors appear immediately with your line numbers, and only
valid shaders reach the game (`pg_set_shader`).

## Adding a game

1. `native/games/<id>/main.cpp` with a `sokol_main` that returns `xl::app_desc(argc, argv, desc)`; include `xl.h`
   with `XL_IMPL` once.
2. Its shaders in `native/shaders/`.
3. Register it in `scripts/build-native.mjs` (`GAMES`) and `src/games.ts`, then build.

## Versions

| | |
| --- | --- |
| Emscripten | 6.0.11 |
| sokol | `3d3dcbcb15edd54902f3b59472720a5bec78d74e` (2026-10-04) |
| sokol-shdc (sokol-tools-bin) | `11d0cf678105d614d675e6d9bd2aaf3eeff12f8c` |
| HandmadeMath | v2.0.0 |
| stb_truetype | v1.26 (public domain), bakes the Turbo Trails HUD font `native/fonts/LilitaOne-Regular.ttf` (Lilita One, OFL) |
| doctest | v2.5.3 |
| Box2D | v3.1.1 |
