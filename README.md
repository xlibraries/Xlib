# Xlib: an Ubuntu desktop in the browser

Aman Agrawal's personal site, built as an Ubuntu 20.04 desktop: windows you can drag, a dock, a terminal and
a set of apps. Live at **[xlibraries.com](https://xlibraries.com)**.

Next.js 16 (pages router) · React 19 · Tailwind CSS · deployed on Vercel.

## The apps

| App | What it does |
| --- | --- |
| **About Aman** | Experience, projects, education and the resume, laid out like the Ubuntu Files app (a simplified view is one click away). |
| **Side Quests** | The non-work side: road trips drawn on a map with India's official boundaries, travel stats, quests, music and videos. |
| **Brave** | A tabbed browser inside the desktop. Sites that refuse to be framed fall back to a YouTube embed, a GitHub page, github1s or a reader view. |
| **Music** | Ad-free, sign-up-free YouTube playlists (via Invidious), with search, video and synced lyrics. |
| **Terminal** | A small shell: `ls`, `cd`, `pwd`, `echo`, `mkdir` and commands that open the other apps (`code`, `music`, …). |
| **Calc** | A terminal-style calculator with variables. |
| **VS Code** | This repo in an embedded VS Code (github1s). |
| **Settings, Trash, Todoist, Contact Me** | Wallpapers, a trash can, a to-do embed and a contact form (EmailJS). |

Also on the site:

- **Photo Drop** (`/drop`, or the terminal command `upload`): a passcode-protected uploader that sends
  photos and videos into Aman's Google Photos. Its backend is a Google Apps Script in
  [`backend/photo-drop/`](backend/photo-drop/README.md).
- **Privacy page** at `/privacy`.

## Run it locally

You need Node 20.9+ and pnpm 9 (`corepack enable` gives you the right version from `package.json`).

```sh
pnpm install          # also installs the git hook and copies browser libraries into public/vendor/
cp .env.example .env.local   # optional: analytics and the contact form
pnpm dev              # http://localhost:3000
```

Use pnpm only. `npm install` would create a second lockfile.

Environment variables are all optional and public (they're sent to the browser); see
[`.env.example`](.env.example). Without them, analytics are off and the contact form opens the visitor's
email app instead.

## Commands

| Command | |
| --- | --- |
| `pnpm dev` | Dev server (Turbopack). Next 16 allows one dev server per folder. |
| `pnpm build` | Production build: refreshes the music snapshot, then `next build --webpack`. |
| `pnpm start` | Serve the production build. |
| `pnpm lint` / `pnpm typecheck` | ESLint / TypeScript. |
| `pnpm test` / `pnpm test:coverage` | Unit tests (Vitest). |
| `pnpm test:python` | Python tests for the travel-data script. |
| `pnpm test:e2e` | Browser tests (Playwright) against a production build; run `pnpm exec next build --webpack` first. |
| `pnpm verify` | Everything above, in order. |

## Tests

Every change ships with tests, and `pnpm verify` must pass before a commit. The pre-commit hook in
[`.githooks/`](.githooks/pre-commit) runs it for you (about a minute), and CI runs the same steps on every
pull request.

- **Unit** (`tests/unit/`): the logic in `lib/`, the API routes, the data scripts and the Apps Script backend
  (run in a sandbox with fake Google services).
- **Python** (`tests/python/`): the travel-data builder, including the checks that keep private places out.
- **End to end** (`tests/e2e/`): every app's main interactions in Chrome. Outside services are mocked, and
  any test fails if the page breaks the Content Security Policy.

## Project layout

```
pages/              Next.js pages: the desktop (index) and two API routes for the Brave app
components/
  apps/             one file per desktop app
  screen/, base/    desktop, windows, dock, top bar, boot and lock screens
lib/                pure logic, unit-tested (browser routing, lyrics, distances, security headers, …)
apps.config.ts      the list of apps: titles, icons, dock and desktop placement
public/             static files, plus standalone pages: drop/, privacy/, brave/newtab.html
backend/photo-drop/ Google Apps Script for Photo Drop (deployed by hand)
scripts/, data/     generators for the music snapshot and the Side Quests map data
tests/              unit, Python and e2e tests
```

## More docs

- [Architecture](docs/architecture.md): how the desktop, the apps, the server routes and the security policy fit together.
- [Data scripts](scripts/README.md): what each script generates, when to run it and the privacy rules for travel data.
- [Photo Drop backend](backend/photo-drop/README.md): setting up and deploying the Apps Script.

## Deployment

Vercel builds and deploys `master` on every push; pull requests get preview deployments.
`xlibraries.com` is the main domain, and `www.xlibraries.com` and `xlibraries.club` redirect to it
(see `next.config.ts`). The old GitHub Pages site (`gh-pages` branch) only redirects to xlibraries.com.

The Photo Drop Apps Script isn't deployed by Vercel: after changing
[`backend/photo-drop/Code.gs`](backend/photo-drop/Code.gs), paste it into Apps Script and publish a new
version (steps in its README).

## License

[MIT](LICENSE).

<a href="https://www.buymeacoffee.com/xlibraries" target="_blank"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" height="40" width="140"></a>
