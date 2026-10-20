import React from "react";
import type * as Leaflet from "leaflet";
import { HOME_BASE, MEMORIES, WORK_BASE, type LatLng } from "../../../content/side-quests";
import { monthLabel } from "../../../lib/side-quests";
import { loadMap, type Travel } from "./data";
import { MODE_STYLE, THEME } from "./theme";

export function WorldMap({ travel, focus }: { travel: Travel | null; focus: LatLng | null }) {
    const el = React.useRef<HTMLDivElement>(null);
    const mapRef = React.useRef<Leaflet.Map | null>(null);
    const [failed, setFailed] = React.useState(false);

    React.useEffect(() => {
        let cancelled = false;
        let observer: ResizeObserver | null = null;
        // No uncorrected fallback: if the corrector can't load, the map shows an error instead
        loadMap().then(L => {
            if (cancelled || !el.current) return;
            const map = L.map(el.current, { zoomControl: false, attributionControl: true, worldCopyJump: true }).setView([21, 79], 5);
            mapRef.current = map;
            L.control.zoom({ position: "bottomright" }).addTo(map);
            // Standard full-colour OSM tiles (no API key), slightly softened so routes and pins pop
            L.tileLayer.indiaBoundaryCorrected("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
                maxZoom: 12,
                className: "side-quests-tiles",
                layerConfig: "osm-carto",
                pmtilesUrl: "/vendor/india-boundary/india_boundary_corrections.pmtiles",
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors · India boundaries corrected with <a href="https://github.com/ramSeraph/india_boundary_corrector">india_boundary_corrector</a>',
            }).addTo(map);

            const bounds: Leaflet.LatLngTuple[] = [];
            (travel ? travel.routes : []).forEach(route => {
                const style = MODE_STYLE[route.mode] || MODE_STYLE.car;
                // white casing under a saturated line keeps routes readable over any map colour
                L.polyline(route.points, { color: "#ffffff", weight: 6, opacity: 0.95 }).addTo(map);
                L.polyline(route.points, { color: style.color, weight: 3.5, opacity: 1, dashArray: style.dash }).addTo(map);
                route.points.forEach(p => bounds.push(p));
            });
            (travel ? travel.roadTrips : []).forEach(trip => {
                L.polyline(trip.points, { color: "#ffffff", weight: 6, opacity: 0.95 }).addTo(map);
                L.polyline(trip.points, { color: THEME.teal, weight: 3.5, opacity: 1 }).addTo(map)
                    .bindPopup(`<b>${trip.name}</b><br/>${trip.stops.join(" → ")}<br/><span style="opacity:.7">~${trip.km.toLocaleString("en-IN")} km by road</span>`);
                trip.points.forEach(p => bounds.push(p));
            });
            (travel ? travel.places : []).forEach(place => {
                const marker = L.circleMarker([place.lat, place.lng], { radius: 6, color: "#ffffff", weight: 2.5, fillColor: THEME.coral, fillOpacity: 1 }).addTo(map);
                marker.bindPopup(`<b>${place.name}</b><br/>${place.state}<br/><span style="opacity:.7">${place.months.map(monthLabel).join(", ")}</span>`);
                bounds.push([place.lat, place.lng]);
            });
            MEMORIES.forEach(m => {
                L.circleMarker(m.at, { radius: 6, color: "#ffffff", weight: 2.5, fillColor: THEME.teal, fillOpacity: 1 })
                    .addTo(map).bindPopup(`<b>${m.name}</b><br/><span style="opacity:.7">Earlier adventure</span>`);
            });
            const emojiIcon = (emoji: string) => L.divIcon({ className: "", html: `<div style="font-size:24px;line-height:24px;filter:drop-shadow(0 1px 2px rgba(0,0,0,.35))">${emoji}</div>`, iconSize: [24, 24], iconAnchor: [12, 12] });
            L.marker(HOME_BASE.at, { icon: emojiIcon("⭐") }).addTo(map).bindPopup(`<b>${HOME_BASE.name}</b><br/>${HOME_BASE.detail}<br/>Home base`);
            L.marker(WORK_BASE.at, { icon: emojiIcon("💼") }).addTo(map).bindPopup(`<b>${WORK_BASE.name}</b><br/>Work base`);

            if (focus) map.setView(focus, 9);
            else if (bounds.length) map.fitBounds(bounds, { padding: [30, 30], maxZoom: 6 });

            // The window can be resized or maximised; keep tiles filling it
            if (typeof ResizeObserver !== "undefined") {
                observer = new ResizeObserver(() => map.invalidateSize());
                observer.observe(el.current);
            }
        }).catch(() => setFailed(true));
        return () => {
            cancelled = true;
            if (observer) observer.disconnect();
            if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
        };
        // focus only sets the first view here; later changes fly the map (next effect) instead of rebuilding it
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [travel]);

    React.useEffect(() => {
        if (focus && mapRef.current) mapRef.current.flyTo(focus, 9, { duration: 1.2 });
    }, [focus]);

    if (failed) return <div className="w-full h-full flex items-center justify-center" style={{ color: THEME.muted }}>The map couldn&apos;t load. Check your connection.</div>;
    return (
        <>
            <style>{`
                .side-quests-tiles { filter: saturate(0.75) brightness(1.04); }
                .side-quests-map .leaflet-popup-content-wrapper { border-radius: 12px; box-shadow: 0 6px 20px rgba(29,35,64,.18); }
                .side-quests-map .leaflet-popup-content { color: ${THEME.ink}; font-size: 13px; }
            `}</style>
            <div ref={el} className="side-quests-map w-full h-full" style={{ background: "#e8eef3" }} />
        </>
    );
}
