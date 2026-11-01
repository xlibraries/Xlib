---
"@xlibraries/render": minor
"@xlibraries/asset-builder": minor
"@xlibraries/arcade": minor
"@xlibraries/bot-lab": minor
"@xlibraries/adapter-cpp-wasm": minor
"@xlibraries/adapter-native-test": minor
"@xlibraries/adapter-shader-sokol": minor
---

render: a backend-free renderer contract (xl_render.h) with sokol_gfx behind it (shadow map, MSAA, backdrop, post) and a fake for tests. asset-builder: building models in code as render vertices, no models of its own. JyotiRath's models are its own assets module on plain parameters (all meshes byte-identical) and it draws through render; Bot Lab's 3D view draws through render and gains shadows. Providers can ship shaders (`xlibraries.native.shaders`); xl-native-test compiles them (runNativeTests is now async).
