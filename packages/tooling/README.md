# packages/tooling

Build and check tools, layer 0 of the dependency graph (`architecture/layers.json`): anything may use them, they use
nothing of the site's.

| Package | Does |
| --- | --- |
| `toolchain` | `xl-build`: builds the modules a package declares (`"xlibraries.modules"` in its `package.json`) through adapters, stamping each module with everything it's built from; skips what's current; `--check` for tests. Knows no compiler. |
| `adapter-cpp-wasm` | C++ to WebAssembly with the pinned Emscripten: WebGPU and WebGL2, or one headless build. Reads providers' `"xlibraries.native"`. |
| `adapter-shader-sokol` | sokol-shdc (pinned, downloaded into its `.tools/`): annotated GLSL to GLSL ES 3.0 and WGSL headers. |
| `adapter-native-test` | `xl-native-test`: a package's graphics-free C++ under doctest (its public header) with the system compilers. |
| `graph` | `pnpm graph`: the dependency-graph check against the layer map and its baseline. |

A new kind of module is a new adapter package (exporting `name`, `version`, `inputs`, `fingerprint`, `build`,
`outputs`); the core and the existing adapters don't change.
