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
dist/                     committed build output (CI rebuilds and checks it matches)
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

## Building

```sh
source ~/emsdk/emsdk_env.sh            # Emscripten 6.0.11 (see Versions)
pnpm --filter @xlibraries/arcade build:native
```

`sokol-shdc` is downloaded (pinned) into `.tools/` on first use. Commit the updated `dist/`; CI rebuilds it with the
same toolchain and fails if it differs.

## Testing game logic

Rules that don't need a GPU live in `native/games/<id>/logic.cpp` and are unit-tested natively with
[doctest](https://github.com/doctest/doctest) (`tests/native/`): `pnpm --filter @xlibraries/arcade test:native`
compiles them with the system C++ compiler (also part of `test`/`verify`).

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
| doctest | v2.5.3 |
