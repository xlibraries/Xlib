---
"@xlibraries/engine": major
---

The build pipeline and test harness moved to @xlibraries/toolchain and its adapters (the `./build` and `./test` exports are gone); the engine now describes what it offers native modules in package.json (`xlibraries.native`). doctest moved to @xlibraries/adapter-native-test.
