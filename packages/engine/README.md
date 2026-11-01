# @xlibraries/engine

The C++/sokol WebAssembly engine behind the desktop's real-time apps (the Arcade's games; Bot Lab's world). It is
a library package: apps build on it, it imports no app.

```
native/runtime/     xl.h (page bridge: focus, pause, gamepad, tilt, haptics, saved values, frame stats),
                    xl_audio.h + xl-audio-worklet.js (sound through an AudioWorklet, the desktop's volume),
                    xl_font.h/.cpp + xl_text.h (TrueType text through sokol_gl), xl_color.h
                    xl_physics.h/.cpp (rigid bodies, joints with motors, ray casts, contacts over Jolt; deterministic)
native/fonts/       Lilita One (OFL)
third_party/        sokol · HandmadeMath · stb_truetype · Jolt Physics v5.6.0 (pinned)
src/                EngineView (React canvas host: backend pick, focus, pause, gamepad, volume, tilt, fullscreen,
                    landscape on phones), backend.ts, gamepad.ts
```

## Using it from a package

The engine is a *provider* for `@xlibraries/toolchain` (`packages/tooling`): its `package.json` says what it offers
native modules (`"xlibraries": { "native": … }`): its include folders, the features a module can ask for (`text`
links the font renderer; `physics` links `xl_physics` and Jolt, compiled once into `build/obj/jolt` with
`JPH_CROSS_PLATFORM_DETERMINISTIC`, no RTTI or exceptions), its fonts, and the audio worklet copied beside every build.
A package names it in a module's `uses`:

```json
"xlibraries": { "modules": { "hello": { "adapter": "cpp-wasm", "uses": ["@xlibraries/engine"], "sources": ["games/hello/main.cpp"], "shaders": ["shaders/hello.glsl"] } } }
```

A module's stamp covers only the engine files it includes or links, so a change here makes stale just the modules
built from what changed (a change to `xl_physics` doesn't touch a game without physics).

```tsx
import { EngineView } from '@xlibraries/engine';
<EngineView id="hello" title="Hello" baseUrl="/native/arcade@1.0.0" choice="auto" volume={host.volume} onBack={...} renderPanel={(instance, backend) => ...} />
```

Native tests run through `@xlibraries/adapter-native-test` (`xl-native-test`): a package lists the engine in
`"xlibraries.nativeTests.uses"` and gets its runtime sources (`testSources`) and Jolt linked.
