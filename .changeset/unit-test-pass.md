---
"@xlibraries/graph": patch
"@xlibraries/toolchain": patch
"@xlibraries/adapter-cpp-wasm": patch
"@xlibraries/adapter-shader-sokol": patch
"@xlibraries/adapter-native-test": patch
"@xlibraries/engine-react": minor
"@xlibraries/bot-lab": patch
---

Testable seams: the CLIs' logic is exported as main(); the adapters take an injected command runner (and sokol-shdc a fetch); EngineView takes an optional loadModule and support (backend probes); Bot Lab's worker gets its world URL from worldUrl(). No behaviour changes.
