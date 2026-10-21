# @xlibraries/engine

The C++/sokol WebAssembly engine behind the desktop's real-time apps (the Arcade's games; Bot Lab's world). It is
a library package: apps build on it, it imports no app.

```
native/runtime/     xl.h (page bridge: focus, pause, gamepad, tilt, haptics, saved values, frame stats),
                    xl_audio.h + xl-audio-worklet.js (sound through an AudioWorklet, the desktop's volume),
                    xl_font.h/.cpp + xl_text.h (TrueType text through sokol_gl), xl_color.h
native/fonts/       Lilita One (OFL)
third_party/        sokol · HandmadeMath · stb_truetype · doctest (pinned)
scripts/build.mjs   the build pipeline: sokol-shdc + em++ for WebGPU and WebGL2, reproducible, dist stamp
scripts/test.mjs    the native test harness (system compilers + doctest)
src/                EngineView (React canvas host: backend pick, focus, pause, gamepad, volume, tilt, fullscreen,
                    landscape on phones), backend.ts, gamepad.ts
```

## Using it from a package

```js
// scripts/build-native.mjs
import { build } from '@xlibraries/engine/build';
export const MODULES = { hello: { sources: ['games/hello/main.cpp'], shaders: ['shaders/hello.glsl'] } };
build({ root: ROOT, modules: MODULES, only: process.argv.slice(2) });
```

A module lists `sources` and `shaders` (relative to `native/`), optionally `flags`, a C library (`cSources`,
`cFlags`), `assets` copied beside the build, `text: true` to link the text renderer and `fonts` to embed. The
engine's headers are on the include path (`#include "xl.h"`, `"sokol_app.h"`, `"xl_text.h"`). A full build writes
`dist/sources.sha256` over every input, the consumer's and the engine's; the consumer's unit tests compare it, so a
change here fails every consumer's verify until it rebuilds. CI rebuilds with the pinned Emscripten
(`EMSCRIPTEN_VERSION`) and sokol-shdc (`SOKOL_TOOLS_COMMIT`) and diffs the committed `dist/`.

```tsx
import { EngineView } from '@xlibraries/engine';
<EngineView id="hello" title="Hello" baseUrl="/arcade" choice="auto" volume={host.volume} onBack={...} renderPanel={(instance, backend) => ...} />
```

Native tests: `runNativeTests({ root, cLibraries, includes })` from `@xlibraries/engine/test` compiles every
`.cpp` under `native/` (except `main.cpp`), the engine runtime, `tests/native/*.cpp` and the doctest main.
