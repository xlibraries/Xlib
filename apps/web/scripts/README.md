# Scripts

Generators for data the site serves as static files. Their output is committed (except `vendor.mjs`'s),
so the site never calls these services at runtime. Each script exports its logic and is unit-tested in
[`tests/unit/scripts.test.mjs`](../tests/unit/scripts.test.mjs) or [`tests/python/`](../tests/python/).

| Script | Writes | Runs |
| --- | --- | --- |
| `vendor.mjs` | `public/vendor/`, `public/drop/` (gitignored) | Automatically: on install, `pnpm dev`, `pnpm build`, `pnpm verify` |
| `xlib-music-snapshot` (from `@xlibraries/music`) | `public/music/snapshot.json` | Automatically before `pnpm build` (so on every Vercel deploy) |
| `side-quests/build_road_trips.mjs` | `public/side-quests/road-trips.json` | By hand, after editing the road trips |
| `side-quests/build_travel_data.py` | `public/side-quests/travel.json` | By hand, with a new Google Maps Timeline export |

## vendor.mjs

Copies the Photo Drop page from `@xlibraries/photo-drop` into `public/drop/`, with this site's settings
(`content/photo-drop.json`) as `config.js`. It also copies the browser libraries the apps load at runtime
from `node_modules` into `public/vendor/`:
Leaflet (Side Quests map), pdf.js (resume preview) and the India boundary data used by
`@india-boundary-corrector/leaflet-layer`. The site serves them itself, so there are no CDN requests and the
Content Security Policy only has to allow `'self'`. Versions follow `package.json`; to upgrade one, bump it
with `pnpm add` and the next install or build copies the new files.

## xlib-music-snapshot

The snapshot CLI ships with `@xlibraries/music` (see its README). It fetches every playlist in
[`data/music-playlists.json`](../data/music-playlists.json) from public Invidious servers and saves the track
lists, so the Music app shows them instantly. A playlist that fails keeps its previous tracks, and the whole
refresh stops after 90 seconds. To add a playlist, add its YouTube playlist id and a title to the data file.

```sh
pnpm exec xlib-music-snapshot --playlists data/music-playlists.json --out public/music/snapshot.json
```

## side-quests/build_road_trips.mjs

Older road trips that predate the Timeline export are listed by hand in
[`data/side-quests-road-trips.json`](../data/side-quests-road-trips.json) as named stops. The script asks
OSRM (free OpenStreetMap routing, no key) for the driving route between the stops, simplifies it to points
about 1 km apart and records the distance. Add or edit a trip in the data file, then run:

```sh
node scripts/side-quests/build_road_trips.mjs
```

## side-quests/build_travel_data.py

Turns a Google Maps Timeline export into the places, routes and distance totals shown in Side Quests.
Place matching is done offline against GeoNames, so no location data is sent anywhere.

```sh
python3 scripts/side-quests/build_travel_data.py \
  --timeline ~/Downloads/Timeline.json \
  --geonames /path/to/geonames   # holds cities1000.txt and admin1CodesASCII.txt from download.geonames.org/export/dump/
```

**Privacy rules.** This is the only script that reads personal data, and it's written so that only coarse,
public-safe data comes out:

- Places are reported at town level (towns of 10,000+ people), at the town's centre, never at the actual
  visit location.
- Nothing is reported within 40 km of Bengaluru (home and work), within 30 km of the home and work places
  Google infers, or within 30 km of any place with more than 15 days of total stays (family homes).
- Routes are simplified to about 1 km precision; totals are per travel mode.

**Never commit the Timeline export** (`Timeline.json`) or the GeoNames files; only the generated
`travel.json` belongs in the repo. The Python tests check the exclusions above, so run
`pnpm test:python` after changing the script.
