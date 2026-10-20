# Restructuring plan: current vs proposed

Legend: 🔴 class component · 🟡 `@ts-nocheck` · 🟣 jQuery · ✅ hooks, typed, tested

## 0. Packages (revised plan)

The bigger apps become **self-contained packages** in a pnpm workspace. Each package owns everything it
needs (UI, logic, server code, static pages, scripts, tests, README) and imports nothing from the site, so it
can later move to its own repo and come back as a **git submodule** in `packages/` or as a **published pnpm
package**, without changing a line of the site.

### Coupling today

```mermaid
flowchart LR
    subgraph site["site (everything in one tree)"]
        window["base/window"]
        desktop["screen/desktop"]
        ubuntu["ubuntu.tsx"]
        terminal["apps/terminal"]
        settings["apps/settings"]
        music["apps/music"]
        brave["apps/brave"]
        others["aman · side-quests · gedit"]
        analytics["lib/analytics"]
        libb["lib/browser · frame-policy · safe-fetch"]
        libm["lib/music"]
        data["data/music-playlists.json"]
        api["pages/api/frame-check, reader"]
        newtab["public/brave/newtab.html"]
    end
    window -- "special case: imports it" --> terminal
    ubuntu -- "wallpaper props via desktop, window" --> settings
    terminal --> analytics
    others --> analytics
    music --> libm
    music --> data
    brave --> libb
    api --> libb
    brave -. iframe .-> newtab
```

### Proposed: packages talk to the site through one small contract

```mermaid
flowchart TB
    subgraph site["apps/web (the Next.js site)"]
        shell["components/shell<br/>desktop · window · dock"]
        config["apps.config.ts<br/>registers every app"]
        host["host implementation<br/>openApp · addFolder · setWallpaper · track"]
        local["components/apps/<br/>about · side-quests · settings · gedit · trash …"]
        content[("content/<br/>about.ts · side-quests.ts")]
        apiroutes["pages/api/*<br/>one-line re-exports"]
        pdata[("data/music-playlists.json")]
    end

    subgraph pkgs["packages/ (pnpm workspace)"]
        sdk["@xlibraries/app-sdk<br/>AppProps + Host types only"]
        browser["@xlibraries/browser<br/>UI · routing · newtab page<br/>server: frame-check, reader, safe-fetch"]
        musicp["@xlibraries/music<br/>UI · Invidious client · lyrics<br/>snapshot script"]
        term["@xlibraries/terminal<br/>Prompt · Terminal · Calc"]
        drop["@xlibraries/photo-drop<br/>upload page · service worker<br/>Apps Script backend"]
    end

    config --> browser & musicp & term & local
    apiroutes ~~~ drop
    shell -. "/drop page" .-> drop
    shell --> config
    shell --> host
    host -. implements .-> sdk
    browser --> sdk
    musicp --> sdk
    term --> sdk
    apiroutes --> browser
    local --> content
    pdata -. "passed in as config" .-> musicp
```

**Rules** (checked by a test, so they can't erode):

| From → To | Allowed? |
| --- | --- |
| site → any package | ✅ |
| package → `@xlibraries/app-sdk` | ✅ |
| package → site (`../../lib`, `components/`, `data/`) | ❌ |
| package → another app package | ❌ |

**The contract** (`@xlibraries/app-sdk`, types only, no runtime code):

```ts
export interface Host {
    openApp(id: string): void;
    addFolder(name: string): void;          // terminal's mkdir
    setWallpaper(name: string): void;       // settings
    track(event: { category: string; action: string; label?: string }): void;  // analytics, no-op if off
}
export interface AppProps { host: Host }
```

Every app gets `host` the same way, so `window.tsx` loses its Terminal special case and the wallpaper
props stop being threaded through three components.

### Repo layout

```
Xlib/
├─ package.json            workspace root: scripts that run across everything (verify, lint, test)
├─ pnpm-workspace.yaml     apps/*, packages/*
├─ apps/
│  └─ web/                 the Next.js site (today's repo root: pages, components, public, content, e2e tests)
├─ packages/
│  ├─ app-sdk/             @xlibraries/app-sdk
│  ├─ browser/             @xlibraries/browser
│  ├─ music/               @xlibraries/music
│  ├─ terminal/            @xlibraries/terminal
│  └─ photo-drop/          @xlibraries/photo-drop (static page + backend/ Apps Script)
├─ docs/                   architecture, this plan
└─ .github/, .githooks/    CI and the pre-commit hook (run the root verify)
```

**Vercel**: the project's *Root Directory* changes to `apps/web` (one setting in Vercel → Project →
Settings → Build and Deployment). It has to be switched at the moment PR 1 merges, since it applies to every
branch.

### Inside a package

```
packages/browser/
├─ package.json        name @xlibraries/browser · peerDependencies react · exports ".", "./server"
├─ README.md           what it is, how to use it in another site
├─ src/
│  ├─ Browser.tsx      the app (default export, takes AppProps)
│  ├─ routing.ts       today's lib/browser.ts
│  └─ server/          frame-check, reader, safe-fetch, frame-policy
├─ public/newtab.*     static files, copied into the site's public/ on install/build
└─ tests/              its own unit tests (run by the root vitest as a project)
```

- **No build step**: packages ship TypeScript source; the site compiles them via Next's `transpilePackages`.
- **Static files**: the existing `scripts/vendor.mjs` also copies each package's `public/` folder into the site.
- **e2e tests** stay in the site (they test the assembled desktop).
- **Moving one out later**: `git subtree split` the folder into its own repo, then either
  `git submodule add <repo> packages/browser` (the workspace keeps working as is) or publish it and change
  `"@xlibraries/browser": "workspace:*"` to a version number.

### Which apps become packages

| Package | Why |
| --- | --- |
| `@xlibraries/browser` | Big, generic, has server code and a static page; useful on any site. |
| `@xlibraries/music` | Big and generic; the playlists stay in the site and are passed in. |
| `@xlibraries/terminal` | Terminal and Calc share the prompt; generic. |
| `@xlibraries/photo-drop` | Already standalone: static page, service worker, Apps Script backend, its own tests. |

About Aman and Side Quests stay in the site: they're your personal content, not reusable apps. Their logic
still goes to `lib/` and their text to `content/`.

## 1. Component tree

### Current

```mermaid
flowchart TD
    index["pages/index.tsx"] --> ubuntu["components/ubuntu.tsx 🔴🟡"]
    ubuntu --> boot["screen/booting_screen"]
    ubuntu --> lock["screen/lock_screen"]
    ubuntu --> navbar["screen/navbar 🔴🟡"]
    ubuntu --> desktop["screen/desktop 🔴🟡🟣<br/>545 lines<br/>all window state in setState"]

    lock --> clock["util components/clock 🔴"]
    navbar --> clock
    navbar --> status["util components/status, status_card 🔴"]

    desktop --> bg["util components/background-image"]
    desktop --> sidebar["screen/side_bar 🟡<br/>(the dock)"]
    sidebar --> sideapp["base/side_bar_app 🔴🟡"]
    desktop --> icon["base/ubuntu_app 🔴<br/>(desktop icons)"]
    desktop --> grid["screen/all-applications 🔴🟡"]
    grid --> icon
    desktop --> menus["context menus/ 🟡<br/>desktop-menu, default"]
    desktop --> window["base/window 🔴🟡"]
    window --> config["apps.config.ts"]
    config --> apps["components/apps/*"]
```

### Proposed

```mermaid
flowchart TD
    index["pages/index.tsx"] --> ubuntu["shell/ubuntu.tsx ✅"]
    ubuntu --> boot["shell/boot-screen ✅"]
    ubuntu --> lock["shell/lock-screen ✅"]
    ubuntu --> navbar["shell/navbar ✅"]
    ubuntu --> desktop["shell/desktop ✅<br/>useReducer(windowReducer)"]

    wm[["lib/window-manager.ts<br/>pure reducer, unit-tested"]] -.-> desktop

    lock --> clock["util/clock ✅"]
    navbar --> clock
    navbar --> status["util/status, status-card ✅"]

    desktop --> bg["util/background-image"]
    desktop --> dock["shell/dock ✅"]
    dock --> dockapp["shell/dock-app ✅"]
    desktop --> icon["shell/desktop-icon ✅"]
    desktop --> grid["shell/app-grid ✅"]
    grid --> icon
    desktop --> menus["context-menus/ ✅"]
    desktop --> window["shell/window ✅"]
    window --> config["apps.config.ts"]
    config --> apps["components/apps/*"]
```

## 2. Window state

### Current: state and logic mixed into one class

```mermaid
flowchart LR
    subgraph desktop["screen/desktop.tsx (class)"]
        state["this.state<br/>closed_windows<br/>focused_windows<br/>minimized_windows<br/>overlapped_windows<br/>favourite_apps<br/>…"]
        methods["openApp() focus() hasMinimised()<br/>closeApp() checkAllMinimised()<br/>… each calls setState"]
        methods --> state
    end
    state -- props --> window["window"]
    state -- props --> dock["dock"]
    window -- callbacks --> methods
    dock -- callbacks --> methods
```

### Proposed: one pure reducer, components only dispatch

```mermaid
flowchart LR
    subgraph lib["lib/window-manager.ts (no React)"]
        reducer["windowReducer(state, action)<br/>open · focus · minimize · close · …"]
    end
    tests["tests/unit/window-manager.test.ts"] -.-> reducer
    reducer --> state["windows state"]
    state -- props --> window["shell/window"]
    state -- props --> dock["shell/dock"]
    window -- "dispatch({type, id})" --> reducer
    dock -- "dispatch({type, id})" --> reducer
```

## 3. Apps

### Current

```mermaid
flowchart LR
    aman["aman.tsx 🔴🟡<br/>1,288 lines<br/>content + explorer +<br/>simplified view + resume"]
    music["music.tsx 🔴🟡<br/>618 lines<br/>Invidious client + player +<br/>lyrics + playlists"]
    sq["side-quests.tsx 🟡<br/>580 lines<br/>quest text + map + tabs"]
    term["terminal.tsx 🔴🟡🟣<br/>454 lines"]
    calc["calc.tsx 🔴🟡🟣<br/>256 lines"]
    term -. "same prompt UI, copied" .- calc
    others["gedit 🔴🟡 · trash 🔴🟡🟣<br/>settings 🟣 · vscode · todoist"]
    brave["brave.tsx ✅"] --> libb["lib/browser.ts"]
```

### Proposed

```mermaid
flowchart LR
    subgraph about["apps/about/"]
        explorer["Explorer"]
        simple["SimplifiedView"]
        resume["Resume"]
    end
    about --> cabout[("content/about.ts<br/>experience, projects,<br/>education")]

    subgraph music["apps/music/"]
        player["Player"]
        lyrics["Lyrics"]
        playlists["Playlists"]
    end
    music --> inv[["lib/invidious.ts"]]
    music --> libm[["lib/music.ts"]]

    subgraph sq["apps/side-quests/"]
        map["Map"]
        tabs["Tabs"]
    end
    sq --> csq[("content/side-quests.ts<br/>quests, lore")]
    sq --> libsq[["lib/side-quests.ts"]]

    term["terminal.tsx ✅"] --> prompt["terminal/Prompt.tsx<br/>one shared prompt"]
    calc["calc.tsx ✅"] --> prompt
    term --> tc[["lib/terminal-commands.ts"]]
    calc --> lc[["lib/calc.ts"]]

    brave["brave.tsx ✅"] --> libb[["lib/browser.ts"]]
    others["gedit · trash · settings<br/>vscode · todoist ✅"]
```

`[[ ]]` = pure logic in `lib/` with unit tests · `[( )]` = your written content as typed data

## 4. Folder layout

| Now | Proposed |
| --- | --- |
| `components/ubuntu.tsx` | `components/shell/ubuntu.tsx` |
| `components/screen/desktop.tsx` | `components/shell/desktop.tsx` |
| `components/screen/navbar.tsx` | `components/shell/navbar.tsx` |
| `components/screen/booting_screen.tsx` | `components/shell/boot-screen.tsx` |
| `components/screen/lock_screen.tsx` | `components/shell/lock-screen.tsx` |
| `components/screen/side_bar.tsx` | `components/shell/dock.tsx` |
| `components/screen/all-applications.tsx` | `components/shell/app-grid.tsx` |
| `components/base/window.tsx` | `components/shell/window.tsx` |
| `components/base/side_bar_app.tsx` | `components/shell/dock-app.tsx` |
| `components/base/ubuntu_app.tsx` | `components/shell/desktop-icon.tsx` |
| `components/util components/*` | `components/util/*` (kebab-case) |
| `components/context menus/*` | `components/context-menus/*` |
| `components/apps/aman.tsx` | `components/apps/about/*` + `content/about.ts` |
| `components/apps/music.tsx` | `components/apps/music/*` + `lib/invidious.ts` |
| `components/apps/side-quests.tsx` | `components/apps/side-quests/*` + `content/side-quests.ts` |
| Terminal and Calc prompt code (twice) | `components/terminal/Prompt.tsx` + `lib/terminal-commands.ts`, `lib/calc.ts` |

Element ids the e2e tests and users rely on (`#sidebar-…`, `#terminal`, `#about-aman` …) stay the same.

## 5. Scorecard

| | Now | Proposed |
| --- | --- | --- |
| Files skipping type checks | 16 | 0 |
| Class components | 15 | 0 |
| Files using jQuery | 5 | 0 (dependency removed) |
| Largest component | 1,288 lines | about 300 |
| Copies of the terminal prompt | 2 | 1 |
| Window logic with unit tests | none | all of it |

## 6. Delivery

```mermaid
flowchart LR
    p1["PR 1: foundation<br/>site → apps/web · pnpm workspace ·<br/>@xlibraries/app-sdk · host contract ·<br/>renames · dependency-rule test"] --> p2["PR 2: packages<br/>terminal (shared Prompt, no jQuery) ·<br/>browser · music · photo-drop"] --> p3["PR 3: site apps<br/>about, side-quests split ·<br/>content/ · hooks"] --> p4["PR 4: shell<br/>desktop, window, dock to hooks ·<br/>window-manager reducer"]
```

Each PR passes `pnpm verify` (all 43 e2e tests stay green) and CI before it's merged.
