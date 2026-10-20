// Loading what the map needs: Leaflet (served from /vendor, see scripts/vendor.mjs), the India boundary
// corrector and the generated travel data. Each loads once, on first use.
import type * as Leaflet from "leaflet";
import type { RoadTrip } from "../../../lib/side-quests";

export type LeafletWithCorrector = typeof Leaflet & {
    tileLayer: typeof Leaflet.tileLayer & {
        indiaBoundaryCorrected(url: string, options: Leaflet.TileLayerOptions & { layerConfig: string; pmtilesUrl: string }): Leaflet.TileLayer;
    };
};

export interface Travel {
    period: { from: string; to: string };
    km: Partial<Record<"road" | "car" | "motorcycle" | "train" | "flight" | "bus", number>>;
    places: { name: string; state: string; lat: number; lng: number; months: string[] }[];
    states: string[];
    routes: { mode: string; points: [number, number][] }[];
    roadTrips: RoadTrip[];
}

declare global {
    interface Window { L?: typeof Leaflet }
}

let leafletPromise: Promise<typeof Leaflet> | null = null;
function loadLeaflet(): Promise<typeof Leaflet> {
    if (window.L) return Promise.resolve(window.L);
    if (!leafletPromise) {
        leafletPromise = new Promise((resolve, reject) => {
            const css = document.createElement("link");
            css.rel = "stylesheet";
            css.href = "/vendor/leaflet/leaflet.css";
            document.head.appendChild(css);
            const script = document.createElement("script");
            script.src = "/vendor/leaflet/leaflet.js";
            script.onload = () => resolve(window.L!);
            script.onerror = reject;
            document.body.appendChild(script);
        });
    }
    return leafletPromise;
}

// Redraws India's official boundaries over standard OSM tiles (disputed lines masked, J&K, Ladakh and
// Aksai Chin shown as part of India): https://github.com/ramSeraph/india_boundary_corrector
let correctorPromise: Promise<LeafletWithCorrector> | null = null;
export function loadMap(): Promise<LeafletWithCorrector> {
    if (!correctorPromise) {
        correctorPromise = loadLeaflet()
            .then(L => import("@india-boundary-corrector/leaflet-layer").then(module => {
                module.extendLeaflet(L);
                return L as LeafletWithCorrector;
            }))
            .catch(err => { correctorPromise = null; throw err; });
    }
    return correctorPromise;
}

let travelPromise: Promise<Travel | null> | null = null;
export function loadTravel(): Promise<Travel | null> {
    if (!travelPromise) {
        // GPS-tracked travel (last 12 months) + routed older road trips (scripts/side-quests/build_road_trips.mjs)
        const get = (url: string) => fetch(url).then(r => r.json()).catch(() => null);
        travelPromise = Promise.all([get("./side-quests/travel.json"), get("./side-quests/road-trips.json")])
            .then(([travel, roadTrips]) => travel && { ...travel, roadTrips: roadTrips || [] });
    }
    return travelPromise;
}
