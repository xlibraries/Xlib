# Xlib: project notes for Claude

Personal portfolio styled as an Ubuntu desktop. Next.js 16 (pages router), React 19, Tailwind, deployed on
Vercel from `master` (Vercel root directory: `apps/web`). A **pnpm workspace**: pnpm only (`pnpm install`,
never `npm install`).

## Tests are mandatory

- **Every change ships with tests.** Logic goes in `lib/` (or a package's `src/`) with a Vitest unit test;
  UI behaviour gets a Playwright test in `apps/web/tests/e2e/`. Data scripts and the Apps Script backend have
  tests too.
- **Run `pnpm verify` (at the repo root) before every commit** and only commit when it passes. It runs each
  workspace package's `verify`; the site's runs lint, typecheck, unit tests, Python tests, a production build
  and the e2e suite. The `.githooks/pre-commit` hook enforces this (installed by `pnpm install`).
- Fix flaky tests rather than retrying them; e2e tests must not depend on outside services (mock them with
  `page.route`).

## Packages and boundaries

The restructuring plan is in `docs/restructure-plan.md`.

- `apps/web/` – the Next.js site.
- `packages/*` – self-contained apps (`@xlibraries/...`) that can later move to their own repos (as a git
  submodule or a published package). **A package may import only its own files, its declared dependencies,
  Node built-ins and `@xlibraries/app-sdk`** – never the site or another app package. The site imports
  packages only through their entry points. `apps/web/tests/unit/boundaries.test.ts` enforces this.
- `packages/app-sdk` – the contract: every app is a component taking `{ host }` (`openApp`, `addFolder`,
  `wallpaper`/`setWallpaper`, `track`). Apps get what they need from `host`, not by importing the shell.
- Packages ship TypeScript source (no build step); the site compiles them via `transpilePackages`.

## Commands (repo root)

| | |
| --- | --- |
| `pnpm dev` | the site's dev server (only one per folder in Next 16) |
| `pnpm lint` / `pnpm typecheck` / `pnpm test` | across every workspace package |
| `pnpm --filter @xlibraries/web test:python` | Python tests |
| `pnpm --filter @xlibraries/web exec next build --webpack && pnpm --filter @xlibraries/web test:e2e` | e2e tests |
| `pnpm verify` | everything |

## Site layout (`apps/web/`)

More detail in `docs/architecture.md` and `apps/web/scripts/README.md`; keep them current when you change how
things work.

- `apps.config.ts` – registers every app; `components/shell/` – desktop, windows, dock, top bar, boot and
  lock screens; `components/apps/*` – apps not yet moved into packages; pure logic lives in `lib/`.
- `pages/api/*` – `frame-check` and `reader` for the Brave app (server-side fetches go through `lib/safe-fetch.ts`).
- `public/drop/`, `public/privacy/`, `public/brave/newtab.html` – standalone static pages.
- `backend/photo-drop/` (repo root, for now) – Google Apps Script for Photo Drop (deployed manually, see its README).
- `lib/security-headers.ts` – Content-Security-Policy and other headers (wired up in `next.config.ts`). Production
  allows no inline scripts, so production builds use webpack (Turbopack's build inlines a bootstrap script) and
  static pages in `public/` load their JS from files. A new script, font or frame source must be added there;
  every e2e test fails on a CSP violation.
- `scripts/vendor.mjs` – copies Leaflet, pdf.js and the India boundary data from node_modules into
  `public/vendor/` (gitignored; runs on install, dev and build). Don't load libraries from CDNs.
- `scripts/` + `data/` – generators for `public/music/snapshot.json` and `public/side-quests/*.json`.
