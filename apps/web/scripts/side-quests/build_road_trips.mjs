// Builds public/side-quests/road-trips.json: driving routes for road trips that predate the
// Timeline export, from the waypoints in data/side-quests-road-trips.json.
// Routes come from OSRM (OpenStreetMap routing), simplified to ~1 km so the file stays small.
// Usage: node scripts/side-quests/build_road_trips.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const OSRM = "https://router.project-osrm.org/route/v1/driving/";

export const distanceKm = (a, b) => {
    const r = (x) => (x * Math.PI) / 180;
    const h = Math.sin(r(b[0] - a[0]) / 2) ** 2 + Math.cos(r(a[0])) * Math.cos(r(b[0])) * Math.sin(r(b[1] - a[1]) / 2) ** 2;
    return 12742 * Math.asin(Math.sqrt(h));
};

// OSRM [lng, lat] coordinates -> [lat, lng] points rounded to ~1 km, at least 1.5 km apart, keeping the end
export function simplifyRoute(coordinates) {
    const round = ([lng, lat]) => [Math.round(lat * 100) / 100, Math.round(lng * 100) / 100];
    const points = [];
    for (const c of coordinates) {
        const p = round(c);
        if (!points.length || distanceKm(points[points.length - 1], p) >= 1.5) points.push(p);
    }
    if (coordinates.length) {
        const end = round(coordinates[coordinates.length - 1]);
        const last = points[points.length - 1];
        if (last[0] !== end[0] || last[1] !== end[1]) points.push(end);
    }
    return points;
}

export const osrmUrl = (stops) => `${OSRM}${stops.map(([, lat, lng]) => `${lng},${lat}`).join(";")}?overview=full&geometries=geojson`;

export async function buildRoadTrips(trips, { fetchImpl = fetch, pause = 1100, log = () => { } } = {}) {
    const out = [];
    for (const trip of trips) {
        const res = await fetchImpl(osrmUrl(trip.stops), { signal: AbortSignal.timeout(60000) });
        const data = await res.json();
        if (data.code !== "Ok") {
            log(`✗ ${trip.name}: ${data.code} ${data.message || ""}`);
            continue;
        }
        const route = data.routes[0];
        const points = simplifyRoute(route.geometry.coordinates);
        out.push({ name: trip.name, km: Math.round(route.distance / 1000), stops: trip.stops.map(([name]) => name), points });
        log(`✓ ${trip.name}: ${Math.round(route.distance / 1000)} km, ${points.length} points`);
        if (pause) await new Promise((r) => setTimeout(r, pause)); // be gentle with the public demo server
    }
    return out;
}

async function main() {
    const trips = JSON.parse(readFileSync("data/side-quests-road-trips.json", "utf8"));
    const out = await buildRoadTrips(trips, { log: console.log });
    writeFileSync("public/side-quests/road-trips.json", JSON.stringify(out));
    console.log(`${out.length}/${trips.length} routes -> public/side-quests/road-trips.json`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
