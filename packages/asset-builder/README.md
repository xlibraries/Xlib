# @xlibraries/asset-builder

Building mid-poly models in code for C++ modules (`include/xl_asset.h`), as meshes in `@xlibraries/render`'s vertex
format: smooth primitives (lathes, spheres, cylinders, capsules, tori, rounded boxes, swept tubes), affine transforms,
materials (`mat`, `vary`), modifiers (`wobble`, `ground_ao`) and a few shapes made of primitives (`ellipsoid`, `ring`,
`taper`), plus noise and a hash for deliberate imperfection.

It has **no models**. Each game builds its own in an assets module of its own (JyotiRath's is
`packages/arcade/native/games/jyotirath/assets/`) from plain parameters, so assets can be added and removed often
without touching this package or `render`. A game that wants another's model copies it.

```json
"uses": ["@xlibraries/engine-core", "@xlibraries/engine-web", "@xlibraries/render", "@xlibraries/asset-builder"]
```

```cpp
xl::asset::Mesh m;
m.lathe({ { 0, 0 }, { 0.3f, 0.1f }, { 0, 0.6f } }, 24, xl::asset::mat(0xB5562E, 0.72f));
m.wobble(0.01f, 6, seed);
const xl::render::Mesh pot = renderer->upload(m.vertices, m.indices);
```

Graphics-free: tested natively (`pnpm test`, `tests/native/`).
