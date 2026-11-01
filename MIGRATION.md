# Migration tracker: independent packages

The plan and its reasons are in [docs/streams-plan.md](docs/streams-plan.md); this file tracks the work. Tick a box
when it's merged with `pnpm verify` green. Each phase is one PR.

**Backlog:** `pnpm graph` → **12** known violations in [architecture/baseline.json](architecture/baseline.json)
(2 private, 5 upward, 2 cycles, 2 forbidden, 1 sideways). Run `pnpm graph --report` for the list with files. Update
the number here when a phase lands.

| Phase | Status | Violations left after it |
| --- | --- | --- |
| 0. Rules first | ✅ (registry: the "Needs you" items) | 72 (it only measures) |
| 1. Toolchain | ✅ | 66 |
| 2. Engine split | ✅ | 12 |
| 3. Physics | ⬜ | |
| 4. Render | ⬜ | |
| 5. Arcade | ⬜ | |
| 6. Bot Lab | ⬜ | |
| 7. Pipelines | ⬜ | 0 |

## Needs you (outside the repo)

- [ ] **Vercel:** add the variable `NPM_RC` (Production and Preview) with this content, so builds can install published
      `@xlibraries` versions (needed once a package pins one):
      `@xlibraries:registry=https://npm.pkg.github.com` and, on a second line,
      `//npm.pkg.github.com/:_authToken=<the read:packages token>`
- [x] **The token:** classic, `read:packages`, in `apps/web/.env.local` (git-ignored); checked against GitHub
      (2026-11-01). `xlibraries` is a user account, so packages publish under it; there are no org settings.
- [ ] **Your machine:** add `//npm.pkg.github.com/:_authToken=<the token>` to `~/.npmrc` (pnpm doesn't read
      `.env.local`, and the repo's `.npmrc` holds no token, so commands don't warn when it's missing).
- [ ] **Repo settings:** Settings → Actions → General → Workflow permissions: *Read and write* (the release workflow
      pushes its version commit and publishes with the built-in token).
- [ ] **Branch protection on `master`, if any:** the release workflow pushes a version commit to `master`; allow
      `github-actions[bot]` to push, or tell me and I'll switch it to a "Version packages" pull request instead.

## Phase 0: rules first

- [x] Layer map: [architecture/layers.json](architecture/layers.json) (every package and future package, with its layer)
- [x] Graph checker: `packages/graph`, `pnpm graph` (imports and `#include`s; declared, public, downward, acyclic,
      pure, forbidden)
- [x] Baseline of today's violations; anything new fails `pnpm verify` and CI
- [x] Changesets installed and configured; the four kinds of change in [.changeset/README.md](.changeset/README.md)
- [x] Registry config: [.npmrc](.npmrc) (`@xlibraries` → GitHub Packages)
- [x] Release workflow: [.github/workflows/release.yml](.github/workflows/release.yml) (version, commit, publish, tag)
- [ ] The "Needs you" items above
- [ ] First release run on `master` (versions `@xlibraries/graph` 0.1.0 → 0.2.0; publishes nothing while every package is private)

## Phase 1: toolchain

- [x] `packages/tooling/toolchain` (`@xlibraries/toolchain`, `xl-build`): the core (manifests, providers, adapters,
      stamps, skipping what's current), no C++ knowledge. In `packages/tooling/`, not `packages/engine/`: it's layer 0
      and serves more than the engine (the graph checker moved there too)
- [x] Adapters as their own packages: `adapter-cpp-wasm` (uses `adapter-shader-sokol`), `adapter-shader-sokol`,
      `adapter-native-test` (`xl-native-test`)
- [x] Manifests: `"xlibraries.modules"` in the Arcade and Bot Lab; the engine describes itself as a provider
      (`"xlibraries.native"`); native tests in `"xlibraries.nativeTests"`
- [x] Full stamps per module (`dist/<module>/stamp.json`): toolchain and adapter versions, pinned Emscripten and
      sokol-shdc, flags, backends, provider versions, and every file it's built from, includes followed transitively
- [x] One `.tools/` (in `adapter-shader-sokol`)
- [x] Serving at `/native/<package>@<version>/<module>/` from manifests (`vendor.mjs` names no package for native
      modules; Bot Lab's Pyodide and firmware are still named: they're vendored files, not modules); `lib/native.ts`;
      `createBotLab({ nativeBaseUrl })`
- [x] doctest is `adapter-native-test`'s public header (cleared the 6 `-> toolchain (doctest.h)` violations)
- [x] CI rebuilds with `--force` (stamps say up to date, so only a forced rebuild proves it reproduces)
- [ ] First publish: `@xlibraries/toolchain` and the three adapters are publish-ready (not private, `repository`,
      `publishConfig`); they publish when this branch merges to `master`
- **Done when:** every module rebuilds byte-identical ✅ (all 8, checked with `git status`); a JyotiRath-only edit
  rebuilds JyotiRath only ✅ (and an edit to the engine's physics makes stale only `showcase` and Bot Lab's `world`)

## Phase 2: engine split

- [x] Public headers documented in Doxygen style as they moved (`xl.h`, `xl_color.h`, `xl_audio.h`, `xl_font.h`,
      `xl_text.h`; `xl_physics.h` got its `@file` block, its declarations are documented with phase 3's new contract)
- [x] `engine-core`: the platform contract `xl.h` (declarations only), `xl_color.h`, sokol and HandmadeMath in `include/`
- [x] `engine-web`: `xl.h`'s browser implementation as its own source (`xl_web.cpp`, linked into every module that uses
      it; games no longer define `XL_IMPL`), backend choice, gamepad reading
- [x] `engine-react`: `EngineView` (the only package with React)
- [x] `engine-audio` (`xl_audio.h` + `xl_audio.cpp`; the worklet ships only with games that use it) and `engine-text`
      (`xl_font.h`, `xl_text.h`, stb private; Lilita One the primary font, games can add their own)
- [x] `physics-3d` moved as-is (Jolt and `xl_physics`); its backend-independent contract is phase 3
- [x] Using a package links it (`link` sources and libraries in `xlibraries.native`); the "features" switches are gone
- [x] Every module's `uses` lists exactly what it links (hello: core + web; JyotiRath: + audio + text; showcase and
      Bot Lab's world: + physics-3d)
- [ ] Meta-package `@xlibraries/engine`: not built; nothing needs it
- [ ] Phase 7: a CI check that every changeset names a package that exists (phase 2 deleted `@xlibraries/engine`
      while two changesets still named it, which would have failed the release; caught and fixed by hand)
- **Done when:** a native module builds with no React anywhere in its dependency tree ✅ (the Arcade's tests check every
  game's providers; 54 private-header violations cleared)

## Phase 3: physics

- [ ] Contracts first: `physics-3d` (World3D, Body3D, Collider3D, Joint, Contact3D, Raycast3D), `physics-2d`
      (World2D, Body2D, Collider2D, Contact2D, Raycast2D), each with a scripted fake
- [ ] Jolt behind `physics-3d` (from `engine/native/runtime/xl_physics`)
- [ ] Box2D behind `physics-2d` (from `arcade/third_party/box2d` and Turbo Trails' `physics_box2d.cpp`)
- [ ] Clears: `upward: physics-2d -> game-turbo-trails`, `private: … -> physics-3d (xl_physics.h)`
- **Done when:** no consumer header includes Jolt or Box2D; Turbo Trails and Bot Lab's world behave as before

## Phase 4: render

- [ ] Contracts first: Mesh, MeshBuilder, Material, Camera, Lighting, RenderTarget, RenderPipeline, PostProcess,
      and a null renderer
- [ ] JyotiRath's `mesh.*` and its lit pipeline (shadow map, MSAA, post) move behind `render`
- [ ] JyotiRath and Bot Lab's view use `render` (the view gains shadows)
- [ ] Clears: `private: game-jyotirath -> render (mesh.h)`, games' direct `sokol_gfx.h` includes
- **Done when:** JyotiRath's screenshots are unchanged; no consumer header includes sokol

## Phase 5: Arcade

- [ ] `arcade` (app, no C++), `arcade-sdk` (GameInfo, PanelProps, manifest type)
- [ ] One package per game: `game-turbo-trails`, `game-jyotirath`, `game-breakout`, each with its own native tests,
      shaders, dist and stamp; panels move into their games
- [ ] Samples: `arcade/samples/{hello,showcase,playground}`, not shipped by default
- [ ] Generated game registry from installed packages that declare `arcadeGame`; `apps.config.ts` lists no game
- [ ] `pnpm new:game <id>` scaffold
- [ ] Clears: `forbidden: arcade -> game-*`, `upward: game-turbo-trails -> arcade`, `upward: sample-playground -> arcade`,
      `cycle: arcade, game-turbo-trails, sample-playground`
- **Done when:** zero game → game edges; adding a game edits no existing package

## Phase 6: Bot Lab

- [ ] `bot-lab-sim` (pure TypeScript), `bot-lab-runtime`, `bot-lab-world`, `bot-lab-projects`, `bot-lab` (app)
- [ ] Challenges (laps, hover) move from `src/sim` to `bot-lab-projects`; the sim's world stops importing them
- [ ] Templates sync and compile from `bot-lab-projects` (`services/arduino-compiler` points there)
- [ ] Clears: `upward: bot-lab-sim -> bot-lab-projects`, `upward: bot-lab-projects -> bot-lab`,
      `sideways: bot-lab-runtime -> bot-lab-projects`, `cycle: bot-lab, bot-lab-projects, bot-lab-runtime, bot-lab-sim`
- **Done when:** the sim's tests run in Node with no React or DOM

## Phase 7: pipelines

- [ ] Verify: path-filtered jobs per package
- [ ] Compatibility: on a change, build and test each dependent against the new version, and report
- [ ] Release: already wired (phase 0); add `changeset status` to CI so a package change without a changeset fails
- [ ] Docs: `architecture.md`, `CLAUDE.md`, the plans
- **Done when:** a `render` change verifies `render`, reports on its dependents, and rebuilds no game; the baseline is empty

## Log

| Date | What |
| --- | --- |
| 2026-11-01 | Phase 0: graph checker, layer map, baseline (72), Changesets, registry config, release workflow; packages token verified |
| 2026-11-01 | Flaky tests: admin logins get their own client address; the engine keeps the volume for games whose audio starts later |
| 2026-11-01 | Phase 1: toolchain + adapters, per-module stamps, `/native/` serving; baseline 72 → 66 |
| 2026-11-01 | Doxygen-style comments (CLAUDE.md, "Comments"); `Doxyfile` + `pnpm docs:api` for the C/C++, checked in CI |
| 2026-11-01 | Phase 2: the engine as six packages under `packages/engine/`; baseline 66 → 12 |
