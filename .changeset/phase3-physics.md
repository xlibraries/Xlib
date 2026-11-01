---
"@xlibraries/physics-2d": minor
"@xlibraries/physics-3d": minor
"@xlibraries/arcade": minor
"@xlibraries/adapter-cpp-wasm": minor
"@xlibraries/adapter-native-test": minor
---

physics-2d: a backend-free 2D contract (xl_physics2d.h) with Box2D v3.1.1 behind it and a fake for tests; Box2D moved here from the Arcade. physics-3d: the contract documented, Jolt as backend_jolt.cpp, a fake (xl_physics_fake.h). Turbo Trails drives on physics-2d (bit-identical). The adapters build C libraries a provider offers (`language: "c"`).
