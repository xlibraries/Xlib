---
"@xlibraries/adapter-cpp-wasm": minor
"@xlibraries/adapter-native-test": patch
"@xlibraries/graph": patch
---

cpp-wasm: using a provider links its `link` sources and libraries (features are gone). native-test: a provider's own test sources outside native/ are compiled. graph: a pure unit may use the engine's native packages; only React, engine-react and engine-web are impure.
