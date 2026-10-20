# Xlib: project notes for Claude

Personal portfolio styled as an Ubuntu desktop. Next.js 16 (pages router), React 19, Tailwind, deployed on
Vercel from `master`. Package manager: **pnpm** only (`pnpm install`, never `npm install`).

## Tests are mandatory

- **Every change ships with tests.** Logic goes in `lib/` (or an exported function) with a Vitest unit test in
  `tests/unit/`; UI behaviour gets a Playwright test in `tests/e2e/`. Data scripts and the Apps Script backend
  have tests too (`tests/unit/scripts.test.mjs`, `tests/unit/photo-drop-backend.test.ts`, `tests/python/`).
- **Run `pnpm verify` before every commit** and only commit when it passes. It runs lint, typecheck, unit
  tests, Python tests, a production build and the e2e suite. The `.githooks/pre-commit` hook enforces this
  (installed by `pnpm install` via the `prepare` script).
- Fix flaky tests rather than retrying them; e2e tests must not depend on outside services (mock them with
  `page.route`).

## Commands

| | |
| --- | --- |
| `pnpm dev` | dev server (only one per folder in Next 16) |
| `pnpm lint` / `pnpm typecheck` | ESLint / tsc |
| `pnpm test` / `pnpm test:coverage` | unit tests (Vitest) |
| `pnpm test:python` | Python tests |
| `pnpm exec next build --webpack && pnpm test:e2e` | e2e tests (Playwright, against a production build) |
| `pnpm verify` | everything above |

## Layout

- `components/apps/*` – one file per desktop app; pure logic lives in `lib/`.
- `pages/api/*` – `frame-check` and `reader` for the Brave app (server-side fetches go through `lib/safe-fetch.ts`).
- `public/drop/`, `public/privacy/`, `public/brave/newtab.html` – standalone static pages.
- `backend/photo-drop/` – Google Apps Script for Photo Drop (deployed manually, see its README).
- `lib/security-headers.ts` – Content-Security-Policy and other headers (wired up in `next.config.ts`). Production
  allows no inline scripts, so production builds use webpack (Turbopack's build inlines a bootstrap script) and
  static pages in `public/` load their JS from files. A new script, font or frame source must be added there;
  every e2e test fails on a CSP violation.
- `scripts/vendor.mjs` – copies Leaflet, pdf.js and the India boundary data from node_modules into
  `public/vendor/` (gitignored; runs on install, dev and build). Don't load libraries from CDNs.
- `scripts/` + `data/` – generators for `public/music/snapshot.json` and `public/side-quests/*.json`.
