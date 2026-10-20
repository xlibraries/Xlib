# @xlibraries/browser

A tabbed browser app for the Xlib desktop ([xlibraries.com](https://xlibraries.com)): tabs, history,
bookmarks and an address bar, with pages shown in iframes. Many sites refuse to be framed, so it falls back
in order to:

1. **YouTube videos** → the `youtube-nocookie.com` embed player
2. **GitHub** → a built-in profile page (GitHub API) or [github1s](https://github1s.com) for repos
3. **Anything else that refuses framing** → a reader view of the page's article
4. Otherwise a friendly page with an "open in a new tab" button

Search goes to Bing, which allows framing (Google answers framed searches with a captcha).

## Use

```tsx
import { createBrowser } from '@xlibraries/browser';

const Browser = createBrowser({
    newTabUrl: '/newtab.html',              // your start page (see below)
    bookmarks: [{ label: 'Wikipedia', icon: '📚', input: 'https://en.wikipedia.org/' }],
    trustedHosts: ['example.com'],          // hosts you know allow framing (skips the check)
    frameCheckUrl: '/api/frame-check',      // defaults shown
    readerUrl: '/api/reader',
});

<Browser host={host} />   // host from @xlibraries/app-sdk
```

The new-tab page is yours: any page that, when it wants to navigate, calls
`parent.postMessage({ type: 'brave:navigate', input: 'what the user typed' }, location.origin)`.

## Server endpoints

Two GET endpoints take `?url=` and are implemented, framework-free, in `@xlibraries/browser/server`:

```ts
import { checkFrame, readArticle } from '@xlibraries/browser/server';

// Next.js pages router, pages/api/frame-check.ts
export default async function handler(req, res) {
    const r = await checkFrame(String(req.query.url ?? ''), { embedderOrigin: 'https://example.com' });
    if (r.cacheControl) res.setHeader('Cache-Control', r.cacheControl);
    res.status(r.status).json(r.body);
}
// pages/api/reader.ts: the same with readArticle(url)
```

- `checkFrame` reads only response headers (`X-Frame-Options`, CSP `frame-ancestors`).
- `readArticle` extracts the article with Mozilla Readability and sanitizes it to plain markup, so no
  third-party script or style can run on your site.
- Both fetch through `safeFetch`: public http(s) URLs only, private and loopback addresses refused
  (including IPv4 inside IPv6), every redirect re-checked, time and size limits. They're safe to expose.

## Notes

- Styled with standard Tailwind utility classes: add `node_modules/@xlibraries/browser/src/**/*.tsx`
  (or the package path in a workspace) to your Tailwind `content`.
- Ships TypeScript source; compile it with your bundler (in Next.js: `transpilePackages`).
- Your Content Security Policy needs `frame-src https:` for the pages it shows.
- Tests: `pnpm test` (Vitest).
