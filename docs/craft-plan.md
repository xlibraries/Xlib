# Craft suite: plan

A free, Adobe-style creative suite on the desktop. The apps come from the Craft suite by the ArtCraft team
([github.com/storytold](https://github.com/storytold)): PhotoCraft (a photo editor), CADCraft, GridCraft (a
spreadsheet), PdfCraft, WordCraft, VectorCraft, FilmCraft and others. They're open source under MIT or Apache-2.0.
This plan covers how they become a package here: `packages/craft` (`@xlibraries/craft`).

## What we found

Research was done on 23 Oct 2026 by reading the repositories and release zips. Nothing was built or run.

- **The apps already run in a browser.** Each is a Rust Cargo workspace with egui/eframe on wgpu (WebGPU, then
  WebGL2, then a CPU fallback). Each has an `apps/<app>-web` crate, a CI job that checks wasm32, and a web size gate.
- **Every release ships a static web bundle**, `<app>-web-<version>.zip`, with `index.html`, the wasm and the JS
  glue. Upstream hosts no live demo: getartcraft.com offers the zip "to host yourself", and the hosting guide
  (`photocraft/packaging/web/README.md`) has a section on embedding the app in an iframe.
- **No special headers are needed.** The apps use no SharedArrayBuffer, so no cross-origin isolation. Threads are
  replaced by cooperative jobs on the web. Files go through browser file pickers, OPFS (the browser's private file
  system) or IndexedDB.
- **One thing clashes with our Content-Security-Policy.** Each bundle's `index.html` boots with a short inline
  `<script type="module">`, and production allows no inline scripts. Everything else is already allowed:
  `'wasm-unsafe-eval'`, inline styles, `worker-src 'self' blob:`, `frame-src 'self'`.
- **The bundles are big.** The table covers the latest releases at the time of research.

| App | Like | Web zip | Notes |
| --- | --- | --- | --- |
| PhotoCraft | Photoshop | 12.0 MB | The flagship, with the most polished web packaging. Its wasm is gzipped and split into parts, and a small loader joins them |
| GridCraft | Excel | 7.6 MB | The smallest app |
| CADCraft | AutoCAD | 8.7 MB | One 23 MB wasm file, not split |
| PdfCraft | Acrobat | 15.7 MB | Useful for showing a CV. Its update checker needs auditing on the web first |
| WordCraft | Word | 17.0 MB | |
| DeckCraft | PowerPoint | 10.9 MB | |
| VectorCraft | Illustrator | 28.4 MB | |
| FilmCraft | Premiere | 13.4 MB | Uses WebCodecs, AudioWorklet and OPFS |
| LightCraft | Lightroom | 71 MB | Bundles a 16 MB CJK font. Safari and Firefox are untested upstream |

Not for us:
- **craft-launcher** only lists desktop downloads, fetched from GitHub's API.
- **artcraft** and **artcraftx** are Tauri desktop apps. artcraft runs against a paid hosted backend, and artcraftx has no licence.
- **artcraft-services** has a restrictive custom licence.
- **craft-ai-integrations** needs API keys.

**A caution on maturity.** The code is substantial: 100k–660k lines of Rust per app, with tests. But it appeared
very fast. The repositories were created between 30 September and 16 October 2026, and PhotoCraft reached about
5,300 commits in three weeks, much of it marked as AI-assisted. The star and fork counts look inorganic, and
releases ship almost daily. Treat each app as early alpha, pin exact versions, and judge each one by running it.

**Licence and brand.** The code is MIT OR Apache-2.0, and both licence files ship in each zip. The ArtCraft name
and logos are trademarks (`docs/brand/LICENSE-brand.txt`). They may appear only unmodified in official builds. So we
serve the official builds, keep their licences beside them, credit "by the ArtCraft team", and draw our own dock
icons.

## How it fits

```
packages/craft/
  craft.manifest.json       app, version, release URL, sha256 of the zip, sha256 of each served file
  scripts/sync.mjs          pnpm sync:craft: download, verify, rewrite the boot script, write dist/
  dist/<app>/               the served bundle (committed): index.html, boot.js, wasm parts, LICENSE-*
  src/CraftApp.tsx          the component: { host } → an iframe on /vendor/craft/<app>/index.html
  src/index.ts              one entry per app, so each can be registered as its own desktop app
```

- **Official builds, served by us.** `sync.mjs` reads the manifest, downloads each pinned release zip, and checks
  its SHA-256. It then moves the inline bootstrap from `index.html` into `boot.js`, a mechanical rewrite of four to
  six lines, so the page loads every script from a file. The result goes to `dist/<app>/`. We don't rebuild from
  source: that would take a Rust toolchain, Trunk and a pinned wasm-bindgen, with fat-LTO builds that upstream gives
  60 minutes in CI. It would gain nothing over the official artifacts, and the brand terms cover official builds.
- **Committed `dist/`**, like the Arcade and Bot Lab. `scripts/vendor.mjs` copies it to `public/vendor/craft/`.
  Builds and tests never reach GitHub. A unit test checks every file in `dist/` against the manifest's hashes, and
  that `index.html` holds no inline script.
- **Each app is a desktop app.** It gets its own entry in `apps.config.ts` and a "Craft" folder on the desktop. The
  component renders a same-origin iframe with upstream's recommended sandbox (`allow-scripts allow-same-origin
  allow-downloads allow-popups`), sized to the window. The iframe unloads when the window closes, which frees the
  module's memory. There is one instance per app.
- **The host contract is thin.** The apps are self-contained canvases and offer no postMessage API. So `host` is
  used only for `track` (an "opened PhotoCraft" analytics event), not for volume or wallpaper.
- **A loading screen** shows the download size and a note that the first load fetches about 12 MB. A fallback
  message appears when neither WebGPU nor WebGL2 is available.

## Phases (one PR each)

| | What you get |
| --- | --- |
| **0. Pilot: PhotoCraft** | `packages/craft` with the manifest, `sync.mjs`, the boot-script rewrite and PhotoCraft's committed bundle. The iframe component, its loading screen and the desktop entry. Unit tests: the manifest hashes, no inline scripts, the rewrite on a fixture `index.html`. An e2e test: the app opens, its canvas appears, there are no CSP violations, and closing the window removes the iframe. A Vercel preview checked on Chrome, Safari and Firefox, and a phone |
| **1. Two small apps** | GridCraft and CADCraft, with the Craft folder on the desktop. The sync handles both packaging styles (split parts and a single wasm) |
| **2. Documents** | PdfCraft, after auditing its update checker and any other network calls on the web, and WordCraft. Optionally, "Open my CV in PdfCraft" from About Aman |
| **3. Media, if it holds up** | FilmCraft and VectorCraft, once size and upstream stability allow. LightCraft waits for upstream's Safari and Firefox support |
| **Upkeep** | A monthly workflow runs `pnpm sync:craft --check` and opens an issue when a newer release exists. Upgrades are deliberate: bump the manifest, sync, review the diff, run verify |

## Risks and how they're handled

- **Repository and deployment size.** Each app adds 8–28 MB to `dist/` and to git history on every upgrade. Vercel
  has no separate cap on `public/`, but Hobby accounts get 10 GB of deployment storage. Every retained deployment
  carries the bundles, and CLI uploads are limited to 100 MB
  ([Vercel limits](https://vercel.com/docs/limits)). Mitigations:
  - Keep to about four apps.
  - Upgrade rarely.
  - Watch storage after phase 0.
  - If needed, move the bundles to Git LFS, or serve them from a separate static host listed in the CSP.
- **Upgrades breaking the rewrite.** If a release changes how `index.html` boots, the sync fails loudly and the
  pinned version stays. A per-path CSP with a script hash is the fallback.
- **Weight in the browser.** Each app is a 20–60 MB module plus its heap, running on the main thread. We allow one
  instance per app, unload it on close, and warn before the first download on phones.
- **Third-party code on our origin.** The iframe shares our origin, so its sandbox isolates little. Pinned hashes
  stop silent changes. A subdomain such as `craft.` would isolate the apps properly, but needs another Vercel
  project, and could come later.
- **Upstream churn or disappearance.** We serve committed copies, so a deleted repository or a breaking release
  doesn't break the site. Our tests never fetch from upstream.
- **Branding.** We show official builds unmodified, apart from the boot script moving to a file. We keep the
  licence files, credit the ArtCraft team, and draw our own icons. The apps' own menus link to getartcraft.com and
  Discord.

## Open questions

- Which apps you want first, if not PhotoCraft, then GridCraft and CADCraft.
- Whether the apps should appear to visitors at once, or start hidden behind Site Settings' hidden-apps switch until
  each has been tried on a phone.
