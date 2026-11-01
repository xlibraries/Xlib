# packages/engine

The engine behind the desktop's real-time apps (the Arcade's games, Bot Lab's world and view), as separate packages.
Each is versioned, built and tested on its own, and a module links only the ones it uses (`"uses"` in its
`package.json` module; `docs/streams-plan.md`).

| Package | Layer | What | Native (`"xlibraries.native"`) |
| --- | --- | --- | --- |
| `engine-core` | 1 | The platform contract (`xl.h`: focus, pause, gamepad, tilt, haptics, saved values, frame stats, `app_desc`), `xl_color.h`; vendored sokol and HandmadeMath | `include/` |
| `engine-web` | 1 | `xl.h` in the browser (`src/xl_web.cpp`, Emscripten); the page side: backend choice (`pickBackend`), gamepad reading | links `xl_web.cpp` |
| `engine-react` | 1 | `EngineView`: hosts a module in a React component on WebGPU or WebGL2; drives focus, pause, gamepad, volume, tilt | (TypeScript only) |
| `engine-audio` | 2 | `xl_audio.h`: a push-model mixer API on an AudioWorklet, with a gain the desktop's volume drives | `include/`, links `xl_audio.cpp`, ships `xl-audio-worklet.js` |
| `engine-text` | 2 | `xl_font.h` (stb_truetype, kept private) and `xl_text.h` (sokol_gl); Lilita One is the primary font, a module can add its own | `include/`, links `xl_font.cpp`, `fonts/` |
| `physics-3d` | 2 | `xl_physics.h`: rigid bodies, joints with motors, ray casts, contacts; Jolt v5.6.0 behind it (deterministic); `xl_physics_fake.h` for tests | `include/`, links `backend_jolt.cpp`, library `jolt` |
| `physics-2d` | 2 | `xl_physics2d.h`: bodies, boxes, circles, chains, wheel joints with motors, contact events; Box2D v3.1.1 behind it; `xl_physics2d_fake.h` for tests | `include/`, links `backend_box2d.cpp`, C library `box2d` |

The physics headers name no backend (each package's tests check it), so code on them can move to another backend,
and can be tested on the fakes without simulating anything.

Nothing native depends on React: `engine-react` is the only package that does, and no module uses it (the Arcade's
tests check this).

## Using it from a package

```json
"xlibraries": { "modules": { "hello": {
  "adapter": "cpp-wasm",
  "uses": ["@xlibraries/engine-core", "@xlibraries/engine-web", "@xlibraries/engine-text"],
  "sources": ["games/hello/main.cpp"], "shaders": ["shaders/hello.glsl"], "fonts": ["LilitaOne-Regular.ttf"]
} } }
```

The module's sources include the public headers (`#include "sokol_app.h"`, `"xl.h"`, `"xl_text.h"`), and the build
links what each package it uses offers. A module's stamp covers only the files it's built from, so a change to one
package makes stale only the modules built from what changed.

```tsx
import { EngineView } from '@xlibraries/engine-react';
<EngineView id="hello" title="Hello" baseUrl="/native/arcade@1.0.0" choice="auto" volume={host.volume} onBack={...} renderPanel={(instance, backend) => ...} />
```

Native tests run through `@xlibraries/adapter-native-test` (`xl-native-test`): a package lists what it needs in
`"xlibraries.nativeTests.uses"` and gets those packages' test sources and libraries linked.

## Documentation

Public headers are documented in Doxygen style (`CLAUDE.md`, "Comments"); `pnpm docs:api` builds them.
