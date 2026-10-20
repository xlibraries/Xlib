# Architecture

The site (`apps/web/`) is one Next.js page (`pages/index.tsx`) that renders a fake Ubuntu desktop entirely in the
browser, plus a few standalone static pages and two small API routes. This doc explains how the pieces fit
together; the [README](../README.md) covers setup and commands. Paths below are relative to `apps/web/`
unless they start with `packages/`. Terminal, Calc, Brave, Music and Photo Drop are self-contained packages in
`packages/` (each with its own README); the site passes them its content and wires up their endpoints.

## The desktop

```
pages/index.tsx
└─ components/shell/ubuntu.tsx    boot screen → lock screen → desktop; wallpaper, brightness, lock/power state
   ├─ shell/navbar.tsx            top bar: clock, status menu
   └─ shell/desktop.tsx           which windows are open, focused, minimized; dock; desktop icons; context menus
      └─ shell/window.tsx         one draggable, resizable window per open app (react-draggable)
         └─ <App host={host} />   the app's component, from apps.config.ts
```

- **`apps.config.ts`** lists every app: id, title, icon, whether it's in the dock or on the desktop, and the
  component that renders it. Each app is loaded with `next/dynamic` the first time its window opens, so the
  desktop itself stays small.
- **The app contract** (`packages/app-sdk`): every app is a component that receives one prop, `host`, with
  `openApp`, `addFolder`, `wallpaper` / `setWallpaper` and `track` (analytics). The desktop builds `host`;
  apps never import the shell. This is what lets self-contained apps live in `packages/` (see
  [the restructuring plan](restructure-plan.md)).
- **Window state** (open, focused, minimized, what the dock shows, when it hides) is one pure reducer,
  `lib/window-manager.ts`, which `shell/desktop.tsx` runs with `useReducer`; windows and the dock only
  dispatch. Every component is a typed function component. Anything worth keeping across visits goes to
  `localStorage`: wallpaper, brightness, lock state, new desktop folders, the About
  view and path, the Side Quests tab, Brave's tabs, cached Invidious responses and so on.
- **Logic vs UI.** Anything that can be tested without a browser lives in `lib/` as plain functions:
  Brave's URL routing (`browser.ts`), lyrics parsing (`music.ts`), distances (`side-quests.ts`), the clock
  (`clock.ts`) and
  the security headers. Components import them; unit tests cover them.

## The apps that talk to the outside world

### Brave (`packages/browser`)

A browser built on iframes; the site gives it a new-tab page, bookmarks and trusted hosts
(`content/browser.ts`). Each tab keeps its own history of entries, saved under `brave-tabs`.
`src/routing.ts` (`plan`) decides what to do with what the visitor typed:

1. **Not a URL** → Bing search (Bing is one of the few search engines that allow framing; Google answers
   framed searches with a captcha).
2. **YouTube video** → the `youtube-nocookie.com` embed. **GitHub** → a built-in profile page (GitHub API) or
   github1s for repos.
3. **Sites known to allow framing** → shown directly.
4. **Anything else** → the frame-check endpoint fetches the page's headers on the server and reports whether
   `X-Frame-Options` / `frame-ancestors` allow framing. If not, the reader endpoint fetches the page, extracts the
   article with Mozilla Readability and sanitizes it, and Brave shows that as a reader view. If even that
   fails, a friendly page offers to open the site in a real tab.

The new-tab page (`public/brave/newtab.html`) is a static page inside the frame; it asks the app to navigate
with `postMessage({ type: 'brave:navigate' })`.

**Server endpoints and SSRF.** The logic lives in `@xlibraries/browser/server` (`checkFrame`, `readArticle`)
without depending on Next.js; `pages/api/frame-check.ts` and `reader.ts` are five-line adapters. Both fetch
URLs that visitors choose, so every fetch goes through the package's `safeFetch`: http(s) only, the hostname is resolved and private, loopback and link-local addresses
are refused (including IPv4 written inside IPv6), every redirect is checked again, and there are time and
size limits. The reader's HTML is sanitized to plain article markup before it reaches the page.

### Music (`packages/music`)

- **Playlists** are listed in `data/music-playlists.json`. Their track lists come from
  `public/music/snapshot.json` (built before each deploy by the package's `xlib-music-snapshot` CLI) so they
  show instantly, then refresh from Invidious in the background.
- **Search and playlist updates** call Invidious directly from the browser. The app starts with one known
  server, discovers more from `api.invidious.io` and moves to the next when one fails; responses are cached in
  `localStorage`.
- **Playback** is the YouTube IFrame player on `youtube-nocookie.com` (no ads, no account).
- **Lyrics** come from LRCLIB; synced lyrics scroll with the song.

### Side Quests

Hand-written content (quests, earlier adventures, hobbies, lore, home base) is `content/side-quests.ts`; the
app is `components/apps/side-quests/` (one file per tab, plus the map and its loaders in `data.ts`). It reads
two generated files, `public/side-quests/travel.json` (from a Google Maps Timeline export, reduced to
town-level places) and `road-trips.json` (older trips routed with OSRM). The map is Leaflet with OpenStreetMap
tiles, and `@india-boundary-corrector/leaflet-layer` redraws India's official boundaries over the tiles using
a PMTiles file. Leaflet and that file are served from `public/vendor/`.

### About Aman

The write-ups are in `content/about/` (`sections.tsx`, `projects.ts`), and `tree.tsx` arranges them into the
folders the explorer shows (`lib/file-tree.ts` resolves paths). The UI is `components/apps/about/`: the Files-style
`Explorer`, the `SimplifiedView` and the `Resume` viewer. The resume preview renders `public/files/Aman-Agrawal-Resume.pdf` with
pdf.js from `public/vendor/`, loaded as a native module (bundling pdf.js through Next's dev server crashes).

## Photo Drop (`packages/photo-drop`)

A standalone page (served at `/drop/`, copied from the package's `web/` folder by `scripts/vendor.mjs`) for friends to upload photos and videos into Aman's Google Photos.
There is no server of our own: the page talks to a Google Apps Script web app
([`packages/photo-drop/backend/`](../packages/photo-drop/README.md)) that runs as Aman. The site's settings
(the script URL and album name) are in `content/photo-drop.config.js`, served as `/drop/config.js`.

```
browser                         Apps Script                        Google Photos
  check (passcode)        ──▶   validates
  start (file name, size) ──▶   opens a resumable upload  ──────▶  upload URL
                          ◀──   returns the upload URL
  bytes  ─────────────────────────────────────────────────────▶   (direct, in pieces)
  finish (upload token)   ──▶   adds the item to the album ─────▶  album
```

- If the browser can't reach Google directly, the page falls back to sending 8 MB pieces through the script
  (`chunk` / `status`).
- On Android Chrome, uploads are handed to Background Fetch (the package's `web/sw.js`), so they keep going when
  the visitor switches apps.
- The passcode travels in the URL fragment (`#k=…`), which browsers never send to servers.

## Admin mode and analytics

`/xlib` renders the same desktop with `admin` set: the lock screen asks for a passcode, `/api/admin/login`
checks it against `ADMIN_PASSCODE` (5 attempts per 15 minutes per IP) and sets a signed, HttpOnly,
`SameSite=Strict` cookie that expires after 7 days. With a valid session the desktop adds `adminApps` from
`apps.config.ts`. Admin endpoints check the cookie, and state-changing ones also check the `Origin`.

Analytics are the site's own (`packages/analytics`): pages send beacons to `/api/track`, which keeps daily
counters in Upstash Redis (no cookies, no IPs stored; bots and the admin aren't counted); the admin Analytics
app reads `/api/admin/analytics`. Details and the next phases: [admin-plan.md](admin-plan.md).

## Security headers

`lib/security-headers.ts` builds the headers that `next.config.ts` sends with every response: a Content
Security Policy plus HSTS, `nosniff`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy` and COOP.

- **Scripts** may only come from this site and the YouTube player. Production allows no
  inline scripts or `eval`. That's why production builds use webpack (`next build --webpack`; Turbopack's
  build adds an inline bootstrap script to each page) and why the static pages in `public/` load their
  JavaScript from files.
- **Connections, images, media and frames** are open to any https origin on purpose: Music discovers
  Invidious servers at runtime, Photo Drop uploads to whatever URL Google returns, and Brave frames
  arbitrary sites.
- **No CDNs.** Leaflet, pdf.js and the boundary data are copied into `public/vendor/` by `scripts/vendor.mjs`;
  the Ubuntu font comes from `next/font`, which downloads it at build time.

Adding a new third-party script, font or frame source means updating `lib/security-headers.ts`. The e2e
tests fail on any CSP violation, so a missed source shows up before it ships.

## Tests and deployment

- `pnpm verify` runs lint, typecheck, unit tests (Vitest), Python tests, a production build and the e2e
  tests (Playwright, against `next start`). The pre-commit hook and CI both run it.
- Vercel builds `master` on every push (`pnpm build`: vendor copy, music snapshot refresh, webpack build) and
  makes preview deployments for pull requests.
- The Apps Script backend is deployed by hand; see its README.
