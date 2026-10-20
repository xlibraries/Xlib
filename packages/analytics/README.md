# @xlibraries/analytics

Cookie-free, self-hosted analytics for the Xlib desktop ([xlibraries.com](https://xlibraries.com)): a beacon
tracker for the browser, a recorder that keeps daily counters in Redis, and a dashboard component.

- **Private by design**: no cookies, nothing stored on the visitor's device, no IPs or user agents stored.
  Unique visitors are estimated per day with a HyperLogLog of a daily-salted hash, so nobody can be followed
  across days.
- **Counts**: visits, visitors, countries, referrers (host only), device size, screens and named events.

## Browser

```ts
import { trackVisit, track } from '@xlibraries/analytics';

trackVisit();                                        // once per page load
track({ type: 'view', path: '/about/Experience' });  // a screen inside the app
track({ type: 'event', name: 'Open App: music' });   // something the visitor did
```

Beacons go to `/api/track` (change with `configureTracker({ endpoint })`).

## Server

```ts
import { parseEvent, isBot, record, report, upstashStore } from '@xlibraries/analytics/server';

const store = upstashStore({ url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN });

// POST /api/track
const event = parseEvent(req.body);
if (event && !isBot(req.headers['user-agent'])) await record(store, event, { ip, userAgent, country }, SECRET);

// admin-only GET
const data = await report(store, 30);   // last 30 days
```

`Store` is a small interface (`hincrby`, `hgetall`, `pfadd`, `pfcount`, `incr`, `expire`); `upstashStore` talks to
Upstash's REST API with `fetch`, and `memoryStore` is for tests and local development.

## Dashboard

```tsx
import { Dashboard } from '@xlibraries/analytics';

<Dashboard load={(days) => fetch(`/api/admin/analytics?days=${days}`).then(r => r.json())} />
```

Styled with standard Tailwind utilities. Ships TypeScript source (Next.js: `transpilePackages`). Tests: `pnpm test`.
