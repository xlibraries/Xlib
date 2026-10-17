// Builds public/side-quests/road-trips.json: driving routes for road trips that predate the
// Timeline export, from the waypoints in data/side-quests-road-trips.json.
// Routes come from OSRM (OpenStreetMap routing), simplified to ~1 km so the file stays small.
// Usage: node scripts/side-quests/build_road_trips.mjs
import { readFileSync, writeFileSync } from "node:fs";

const OSRM = "https://router.project-osrm.org/route/v1/driving/";
const trips = JSON.parse(readFileSync("data/side-quests-road-trips.json", "utf8"));

const distanceKm = (a, b) => {
    const r = (x) => (x * Math.PI) / 180;
    const h = Math.sin(r(b[0] - a[0]) / 2) ** 2 + Math.cos(r(a[0])) * Math.cos(r(b[0])) * Math.sin(r(b[1] - a[1]) / 2) ** 2;
    return 12742 * Math.asin(Math.sqrt(h));
};

const out = [];
for (const trip of trips) {
    const coords = trip.stops.map(([, lat, lng]) => `${lng},${lat}`).join(";");
    const res = await fetch(`${OSRM}${coords}?overview=full&geometries=geojson`, { signal: AbortSignal.timeout(60000) });
    const data = await res.json();
    if (data.code !== "Ok") {
        console.log(`✗ ${trip.name}: ${data.code} ${data.message || ""}`);
        continue;
    }
    const route = data.routes[0];
    const points = [];
    for (const [lng, lat] of route.geometry.coordinates) {
        const p = [Math.round(lat * 100) / 100, Math.round(lng * 100) / 100];
        if (!points.length || distanceKm(points[points.length - 1], p) >= 1.5) points.push(p);
    }
    const last = route.geometry.coordinates.at(-1);
    points.push([Math.round(last[1] * 100) / 100, Math.round(last[0] * 100) / 100]);
    out.push({ name: trip.name, km: Math.round(route.distance / 1000), stops: trip.stops.map(([name]) => name), points });
    console.log(`✓ ${trip.name}: ${Math.round(route.distance / 1000)} km, ${points.length} points`);
    await new Promise((r) => setTimeout(r, 1100)); // be gentle with the public demo server
}
writeFileSync("public/side-quests/road-trips.json", JSON.stringify(out));
console.log(`${out.length}/${trips.length} routes -> public/side-quests/road-trips.json`);
