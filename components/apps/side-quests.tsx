// @ts-nocheck
import React from 'react';
import ReactGA from 'react-ga4';

// Life outside work, as an RPG: a world map of travels, a quest log, a character sheet and some lore.
// Travel data comes from public/side-quests/travel.json (built by scripts/side-quests/build_travel_data.py,
// town-level only, private places removed). Everything else is curated below.

// Bright, sunny palette (the app icon's navy and gold, plus candy accents)
const THEME = {
    bg: "#fff7ec",
    card: "#ffffff",
    ink: "#1d2340",
    muted: "#5d6683",
    line: "rgba(29, 35, 64, 0.08)",
    sunset: "linear-gradient(100deg, #ff8a3d 0%, #ff4f8b 55%, #7b5cff 100%)",
    coral: "#ff5a5f",
    pink: "#ff3d7f",
    orange: "#ff8a00",
    sky: "#0a9bff",
    violet: "#8b5cf6",
    teal: "#00b8a9",
    sun: "#ffc93c",
};

const RARITY = {
    Legendary: { color: "#e07a00", gradient: "linear-gradient(90deg, #ffc93c, #ff8a00)" },
    Epic: { color: "#a634d6", gradient: "linear-gradient(90deg, #c77dff, #ff4f8b)" },
    Rare: { color: "#0a84d6", gradient: "linear-gradient(90deg, #4cc9f0, #0a9bff)" },
    Common: { color: "#159a6a", gradient: "linear-gradient(90deg, #7ae582, #25c38b)" },
};

// A different pastel for every hobby card
const PASTELS = ["#ffe3d3", "#e3f4ff", "#efe4ff", "#dff7ea", "#fff1c9", "#ffe0ec", "#dff3f1"];

const QUESTS = [
    {
        title: "The Kedarnath Run",
        when: "Oct 2026",
        where: "Rajasthan · Haryana · Uttarakhand",
        rarity: "Legendary",
        tags: ["Road trip", "Himalayan trek"],
        at: [30.735, 79.067],
        story: "Eleven days and about 3,400 km behind the wheel: Jaipur out to Jodhpur, an overnight drive with a midnight dhaba stop at Murthal, then up the Ganga past Haridwar, Rishikesh and Devprayag to trek to Kedarnath at 3,583 m.",
    },
    {
        title: "Parvathamalai",
        when: "Jul 2026",
        where: "Tamil Nadu",
        rarity: "Epic",
        tags: ["Trek"],
        at: [12.44, 78.97],
        story: "One of the toughest temple treks in the south: a steep climb to the hilltop shrine, finishing on rock-cut steps and iron rails.",
    },
    {
        title: "Monsoon Goa",
        when: "Aug 2026",
        where: "South Goa",
        rarity: "Rare",
        tags: ["Train", "Monsoon"],
        at: [15.25, 73.93],
        story: "Overnight train to Madgaon and a few rain-soaked days in South Goa: Benaulim, Cavelossim and the green backroads towards Sanguem.",
    },
    {
        title: "Srirangapatna Ride",
        when: "Aug 2026",
        where: "Karnataka",
        rarity: "Common",
        tags: ["Day ride"],
        at: [12.42, 76.69],
        story: "A day out on the old Mysuru road: Channapatna, Srirangapatna and on to Mysuru.",
    },
    {
        title: "Arunachala Drive",
        when: "May 2026",
        where: "Tamil Nadu",
        rarity: "Common",
        tags: ["Road trip"],
        at: [12.23, 79.07],
        story: "A weekend drive to Tiruvannamalai, the temple town at the foot of Arunachala.",
    },
    {
        title: "Year-End Goa",
        when: "Dec 2025",
        where: "North Goa",
        rarity: "Rare",
        tags: ["Train", "Beaches"],
        at: [15.6, 73.74],
        story: "Train to Londa, then Christmas week in North Goa: Vagator, Morjim, Arambol and the old fort at Tiracol.",
    },
    {
        title: "Dudhsagar with the Team",
        when: "Dec 2025",
        where: "Goa",
        rarity: "Epic",
        tags: ["Trek", "Waterfall"],
        at: [15.31, 74.31],
        story: "A weekend with work friends: the trek to Dudhsagar falls, a boat ride at sunset and long evenings at the beach shacks.",
    },
    {
        title: "Puliyari Hills Off-Road",
        when: "Nov 2025",
        where: "Karnataka · Tamil Nadu border",
        rarity: "Rare",
        tags: ["Motorcycle", "Off-road"],
        at: [12.7, 78.0],
        story: "An impromptu ride that turned into a proper off-road trail. About 170 km on the bike that day.",
    },
    {
        title: "Kodaikanal Road Trip",
        when: "2025",
        where: "Bengaluru → Kodaikanal → Bengaluru",
        rarity: "Rare",
        tags: ["Road trip", "Hills"],
        at: [10.24, 77.49],
        story: "Bengaluru to Kodaikanal and back by car: hairpin bends up the Palani hills, misty viewpoints, pine forests and the lake.",
    },
    {
        title: "Rameswaram to Trivandrum",
        when: "Earlier",
        where: "Bengaluru → Rameswaram → Thiruvananthapuram → Bengaluru",
        rarity: "Epic",
        tags: ["Road trip", "Coast"],
        at: [9.29, 79.31],
        story: "A big loop down the peninsula by car: Bengaluru to Rameswaram across the Pamban bridge, over to Thiruvananthapuram on the Kerala coast, and home again.",
    },
    {
        title: "Edayilakkad Island Run",
        when: "Earlier",
        where: "Bengaluru → Edayilakkad → Bengaluru",
        rarity: "Rare",
        tags: ["Road trip", "Backwaters"],
        at: [12.15, 75.16],
        story: "A road trip to Edayilakkad, a tiny island in the Valiyaparamba backwaters of north Kerala, and back to Bengaluru by car.",
    },
];

// Earlier adventures, from memory rather than the Timeline export (approximate pins)
const MEMORIES = [
    { name: "Lohagad Fort", at: [18.71, 73.48] },
    { name: "Visapur Fort", at: [18.72, 73.49] },
    { name: "Sus Hill", at: [18.55, 73.75] },
    { name: "Marunji Hill", at: [18.62, 73.73] },
    { name: "Bhushi Dam", at: [18.76, 73.39] },
    { name: "Kasarsai Dam", at: [18.62, 73.66] },
    { name: "Pataleshwar Caves", at: [18.53, 73.85] },
    { name: "Lonavala", at: [18.75, 73.41] },
    { name: "Igatpuri", at: [19.7, 73.56] },
    { name: "Penukonda Fort", at: [14.08, 77.6] },
    { name: "Kolar Gold Fields", at: [12.96, 78.27] },
    { name: "Kotilingeshwara", at: [13.0, 78.26] },
    { name: "Nandi Hills", at: [13.37, 77.68] },
    { name: "Mysuru", at: [12.3, 76.64] },
    { name: "Ooty", at: [11.41, 76.7] },
    { name: "Kodaikanal", at: [10.24, 77.49] },
    { name: "Rameswaram", at: [9.29, 79.31] },
    { name: "Thiruvananthapuram", at: [8.52, 76.94] },
    { name: "Edayilakkad", at: [12.15, 75.16] },
    { name: "Kanha National Park", at: [22.33, 80.61] },
    { name: "Pench National Park", at: [21.7, 79.32] },
    { name: "Pachmarhi", at: [22.47, 78.43] },
    { name: "Kedarnath", at: [30.735, 79.067] },
];

const ORIGINS = [
    "Sahyadri forts: Lohagad, Visapur, Sus Hill, Marunji",
    "Bhushi & Kasarsai dams, Pataleshwar Caves",
    "Penukonda Fort & Kolar Gold Fields",
    "Mysuru, Ooty & Nandi Hills",
    "Kanha, Pench & Pachmarhi",
    "Lonavala & Igatpuri",
];

const SKILLS = [
    { icon: "🏍️", name: "Riding", note: "3,674 km on two wheels in the last year, off-road trails when the tarmac gets boring, and his own bike maintenance." },
    { icon: "🥾", name: "Trekking", note: "Kedarnath at 3,583 m, Parvathamalai, Dudhsagar and the Sahyadri forts." },
    { icon: "🎮", name: "Game design", note: "Builds game worlds for fun: Project Balod (a UE5 tactical squad shooter on a fictional island with dynamic weather), Legends of Emperor (a 1v1 arena battler with 18 warrior classes), a 2000 BCE chariot level and TowerStack." },
    { icon: "🎵", name: "Songwriting", note: "Writes original songs. Debugging Love is on YouTube (see Lore)." },
    { icon: "🎨", name: "Painting & digital art", note: "Paints on canvas and on screen." },
    { icon: "🏸", name: "Badminton", note: "Late-evening rallies, most weeks." },
    { icon: "🛼", name: "Roller skating", note: "Skated almost every day through 2022." },
    { icon: "♟️", name: "Chess", note: "Daily puzzles." },
    { icon: "💃", name: "Dance", note: "Never says no to a dance floor." },
    { icon: "🚀", name: "Model rocketry", note: "Builds and launches small rockets." },
    { icon: "🎤", name: "Stand-up comedy", note: "Open-mic regular (from the audience)." },
    { icon: "🗣️", name: "Public speaking", note: "Toastmasters, and welcoming freshers to the college robotics club back in the day." },
    { icon: "🎲", name: "Board games", note: "Shows up to board-game meetups." },
];

const LORE = [
    "Pick your constants carefully and play with variables.",
    "Stop trying to 'find' the Elite seat. Build the table.",
];

const SONG_ID = "aaHlegqIIik";

// Town centres, not addresses
const HOME_BASE = { name: "Katangi", detail: "Madhya Pradesh 481445", at: [21.77, 79.8] };
const WORK_BASE = { name: "Bengaluru", at: [12.97, 77.59] };

const MODE_STYLE = {
    car: { color: THEME.pink, label: "Road trips" },
    motorcycle: { color: THEME.orange, label: "Motorcycle" },
    train: { color: THEME.sky, label: "Rail", dash: "6 6" },
    bus: { color: THEME.violet, label: "Bus" },
};

const formatKm = (n) => (n || 0).toLocaleString("en-IN");
const monthLabel = (ym) => new Date(ym + "-01T00:00:00").toLocaleString("en-US", { month: "short", year: "numeric" });

// ---------- Leaflet (loaded from CDN on first use) ----------

let leafletPromise = null;
function loadLeaflet() {
    if (window.L) return Promise.resolve(window.L);
    if (!leafletPromise) {
        leafletPromise = new Promise((resolve, reject) => {
            const css = document.createElement("link");
            css.rel = "stylesheet";
            css.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
            document.head.appendChild(css);
            const script = document.createElement("script");
            script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
            script.onload = () => resolve(window.L);
            script.onerror = reject;
            document.body.appendChild(script);
        });
    }
    return leafletPromise;
}

// Redraws India's official boundaries over standard OSM tiles (disputed lines masked, J&K, Ladakh and
// Aksai Chin shown as part of India): https://github.com/ramSeraph/india_boundary_corrector
let correctorPromise = null;
function loadBoundaryCorrector(L) {
    if (!correctorPromise) {
        correctorPromise = import(/* webpackIgnore: true */ "https://cdn.jsdelivr.net/npm/@india-boundary-corrector/leaflet-layer@0.2.2/+esm")
            .then(module => { module.extendLeaflet(L); return L; })
            .catch(err => { correctorPromise = null; throw err; });
    }
    return correctorPromise;
}

let travelPromise = null;
function loadTravel() {
    if (!travelPromise) {
        // GPS-tracked travel (last 12 months) + routed older road trips (scripts/side-quests/build_road_trips.mjs)
        const get = (url) => fetch(url).then(r => r.json()).catch(() => null);
        travelPromise = Promise.all([get("./side-quests/travel.json"), get("./side-quests/road-trips.json")])
            .then(([travel, roadTrips]) => travel && { ...travel, roadTrips: roadTrips || [] });
    }
    return travelPromise;
}

function WorldMap({ travel, focus }) {
    const el = React.useRef(null);
    const mapRef = React.useRef(null);
    const [failed, setFailed] = React.useState(false);

    React.useEffect(() => {
        let cancelled = false;
        let observer = null;
        // No uncorrected fallback: if the corrector can't load, the map shows an error instead
        loadLeaflet().then(loadBoundaryCorrector).then(L => {
            if (cancelled || !el.current) return;
            const map = L.map(el.current, { zoomControl: false, attributionControl: true, worldCopyJump: true }).setView([21, 79], 5);
            mapRef.current = map;
            L.control.zoom({ position: "bottomright" }).addTo(map);
            // Standard full-colour OSM tiles (no API key), slightly softened so routes and pins pop
            L.tileLayer.indiaBoundaryCorrected("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
                maxZoom: 12,
                className: "side-quests-tiles",
                layerConfig: "osm-carto",
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors · India boundaries corrected with <a href="https://github.com/ramSeraph/india_boundary_corrector">india_boundary_corrector</a>',
            }).addTo(map);

            const bounds = [];
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
            const emojiIcon = (emoji) => L.divIcon({ className: "", html: `<div style="font-size:24px;line-height:24px;filter:drop-shadow(0 1px 2px rgba(0,0,0,.35))">${emoji}</div>`, iconSize: [24, 24], iconAnchor: [12, 12] });
            L.marker(HOME_BASE.at, { icon: emojiIcon("⭐") }).addTo(map).bindPopup(`<b>${HOME_BASE.name}</b><br/>${HOME_BASE.detail}<br/>Home base`);
            L.marker(WORK_BASE.at, { icon: emojiIcon("💼") }).addTo(map).bindPopup(`<b>${WORK_BASE.name}</b><br/>Work base`);

            if (focus) map.setView(focus, 9);
            else if (bounds.length) map.fitBounds(bounds, { padding: [30, 30], maxZoom: 6 });

            // The window can be resized or maximised; keep tiles filling it
            if (window.ResizeObserver) {
                observer = new ResizeObserver(() => map.invalidateSize());
                observer.observe(el.current);
            }
        }).catch(() => setFailed(true));
        return () => {
            cancelled = true;
            if (observer) observer.disconnect();
            if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
        };
    }, [travel]);

    React.useEffect(() => {
        if (focus && mapRef.current) mapRef.current.flyTo(focus, 9, { duration: 1.2 });
    }, [focus]);

    if (failed) return <div className="w-full h-full flex items-center justify-center" style={{ color: THEME.muted }}>The map couldn't load. Check your connection.</div>;
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

// Earlier road trips are stored one way unless they're loops; count the drive back too
const roadTripKm = (trips) => (trips || []).reduce((sum, t) => sum + (t.stops[0] === t.stops[t.stops.length - 1] ? t.km : 2 * t.km), 0);

function WorldTab({ travel, focus }) {
    const km = travel ? travel.km : {};
    const earlierKm = travel ? roadTripKm(travel.roadTrips) : 0;
    const roadKm = (km.road || 0) + earlierKm;
    const stats = [
        { icon: "🛣️", value: formatKm(Math.round(roadKm / 100) * 100), label: "km on the road", color: THEME.pink },
        { icon: "🏍️", value: formatKm(km.motorcycle), label: "km on two wheels", color: THEME.orange },
        { icon: "🚆", value: formatKm(km.train), label: "km by rail", color: THEME.sky },
        { icon: "✈️", value: formatKm(km.flight), label: "km flown", color: THEME.violet },
        { icon: "📍", value: travel ? travel.places.length : "–", label: `towns · ${travel ? travel.states.length : "–"} states`, color: THEME.coral },
    ];
    return (
        <div className="relative w-full h-full">
            <WorldMap travel={travel} focus={focus} />
            <div className="absolute top-2 left-2 right-2 flex flex-wrap gap-1.5 pointer-events-none" style={{ zIndex: 500 }}>
                {stats.map(s => (
                    <div key={s.label} className="px-2.5 py-1 rounded-full text-xs shadow-md" style={{ background: "#ffffff", color: THEME.ink, border: `2px solid ${s.color}` }}>
                        <span className="mr-1">{s.icon}</span>
                        <b style={{ color: s.color }}>{s.value}</b> <span style={{ color: THEME.muted }}>{s.label}</span>
                    </div>
                ))}
            </div>
            <div className="absolute bottom-2 left-2 px-3 py-2 rounded-xl text-xs space-y-1 shadow-md" style={{ zIndex: 500, background: "rgba(255,255,255,0.95)", color: THEME.ink }}>
                <div className="flex items-center gap-1.5"><Dot color={THEME.coral} /> Last 12 months{travel ? ` (${monthLabel(travel.period.from)} – ${monthLabel(travel.period.to)})` : ""}</div>
                {travel && (
                    <div style={{ color: THEME.muted }}>
                        🛣️ {formatKm(Math.round(km.road || 0))} km tracked by road + {formatKm(earlierKm)} km of earlier road trips
                    </div>
                )}
                <div className="flex items-center gap-1.5"><Dot color={THEME.teal} /> Earlier adventures <span className="inline-block w-4 rounded-full ml-1" style={{ height: 4, background: THEME.teal }} /> earlier road trips</div>
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 pt-0.5">
                    {Object.entries(MODE_STYLE).map(([mode, s]) => (
                        <span key={mode} className="flex items-center gap-1">
                            <span className="inline-block w-4 rounded-full" style={{ height: 4, background: s.color }} /> {s.label}
                        </span>
                    ))}
                </div>
            </div>
        </div>
    );
}

const Dot = ({ color }) => (
    <span className="inline-block w-3 h-3 rounded-full flex-shrink-0" style={{ background: color, boxShadow: "0 0 0 2px #fff, 0 0 0 3px rgba(29,35,64,.15)" }} />
);

function QuestsTab({ onShow }) {
    return (
        <div className="w-full h-full overflow-y-auto windowMainScreen p-3 md:p-5">
            <SectionTitle emoji="📜" color={THEME.pink}>Quest log</SectionTitle>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {QUESTS.map(q => {
                    const rarity = RARITY[q.rarity];
                    return (
                        <div key={q.title} className="rounded-2xl overflow-hidden flex flex-col shadow-md transform hover:-translate-y-0.5 transition-transform" style={{ background: THEME.card }}>
                            <div style={{ height: 6, background: rarity.gradient }} />
                            <div className="p-3.5 flex flex-col flex-grow">
                                <div className="flex items-start justify-between gap-2">
                                    <div>
                                        <div className="font-bold text-base" style={{ color: THEME.ink }}>{q.title}</div>
                                        <div className="text-xs" style={{ color: THEME.muted }}>{q.when} · {q.where}</div>
                                    </div>
                                    <span className="text-xs font-bold px-2.5 py-0.5 rounded-full whitespace-nowrap text-white shadow-sm" style={{ background: rarity.gradient }}>{q.rarity}</span>
                                </div>
                                <p className="text-sm mt-2 leading-snug flex-grow" style={{ color: "#3a4160" }}>{q.story}</p>
                                <div className="flex items-center justify-between mt-3">
                                    <div className="flex flex-wrap gap-1">
                                        {q.tags.map(t => <span key={t} className="text-xs px-2 py-0.5 rounded-full" style={{ background: `${rarity.color}14`, color: rarity.color }}>{t}</span>)}
                                    </div>
                                    <button type="button" onClick={() => onShow(q.at)} className="text-xs font-bold px-3 py-1 rounded-full text-white shadow-sm hover:opacity-90" style={{ background: THEME.sunset }}>
                                        Show on map →
                                    </button>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
            <SectionTitle emoji="🧭" color={THEME.teal} className="mt-6">Chapter zero · earlier adventures</SectionTitle>
            <div className="flex flex-wrap gap-2">
                {ORIGINS.map((o, i) => (
                    <span key={o} className="text-xs md:text-sm px-3 py-1 rounded-full font-medium" style={{ background: PASTELS[i % PASTELS.length], color: THEME.ink }}>{o}</span>
                ))}
            </div>
        </div>
    );
}

function CharacterTab({ travel }) {
    return (
        <div className="w-full h-full overflow-y-auto windowMainScreen p-3 md:p-5">
            <div className="rounded-2xl p-4 flex items-center gap-4 text-white shadow-lg" style={{ background: THEME.sunset }}>
                <img src="./images/logos/bitmoji.png" alt="" className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-white flex-shrink-0 shadow-md" style={{ boxShadow: "0 0 0 4px rgba(255,255,255,.6)" }} />
                <div className="min-w-0">
                    <div className="text-xl md:text-2xl font-bold">Aman</div>
                    <div className="text-sm font-medium">Class: Engineer · Wanderer · Storyteller</div>
                    <div className="text-xs mt-1 opacity-90">
                        Home base: {HOME_BASE.name}, MP · Work base: {WORK_BASE.name}{travel ? ` · ${travel.states.length} states explored this year` : ""}
                    </div>
                </div>
            </div>
            <SectionTitle emoji="✨" color={THEME.violet} className="mt-5">Skills & side hustles of the soul</SectionTitle>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {SKILLS.map((s, i) => (
                    <div key={s.name} className="rounded-2xl p-3 flex gap-3 transform hover:scale-[1.02] transition-transform" style={{ background: PASTELS[i % PASTELS.length] }}>
                        <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-xl flex-shrink-0 shadow-sm">{s.icon}</div>
                        <div className="min-w-0">
                            <div className="font-bold text-sm" style={{ color: THEME.ink }}>{s.name}</div>
                            <div className="text-xs mt-0.5 leading-snug" style={{ color: "#454d6b" }}>{s.note}</div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

function LoreTab() {
    const [playing, setPlaying] = React.useState(false);
    const notes = [{ bg: "#fff1a8", tilt: "-1.5deg" }, { bg: "#ffd6e7", tilt: "1.2deg" }];
    return (
        <div className="w-full h-full overflow-y-auto windowMainScreen p-3 md:p-5">
            <SectionTitle emoji="🪶" color={THEME.orange}>Scrolls</SectionTitle>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 px-1 py-2">
                {LORE.map((line, i) => (
                    <blockquote
                        key={line}
                        className="rounded-md p-5 text-lg md:text-xl italic leading-snug shadow-lg"
                        style={{ background: notes[i % notes.length].bg, color: THEME.ink, transform: `rotate(${notes[i % notes.length].tilt})`, fontFamily: "Georgia, 'Times New Roman', serif" }}
                    >
                        “{line}”
                    </blockquote>
                ))}
            </div>
            <SectionTitle emoji="🎸" color={THEME.pink} className="mt-6">Bard's corner</SectionTitle>
            <div className="rounded-2xl overflow-hidden max-w-xl shadow-lg" style={{ background: THEME.card }}>
                <div className="relative w-full" style={{ paddingTop: "56.25%" }}>
                    {playing ? (
                        <iframe
                            className="absolute inset-0 w-full h-full"
                            src={`https://www.youtube-nocookie.com/embed/${SONG_ID}?autoplay=1&rel=0`}
                            title="Debugging Love"
                            allow="autoplay; encrypted-media; picture-in-picture"
                            allowFullScreen
                        />
                    ) : (
                        <button type="button" onClick={() => setPlaying(true)} className="absolute inset-0 w-full h-full group bg-black" aria-label="Play Debugging Love">
                            <img src={`https://i.ytimg.com/vi/${SONG_ID}/hqdefault.jpg`} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                            <span className="absolute inset-0 flex items-center justify-center">
                                <span className="w-16 h-16 rounded-full flex items-center justify-center text-2xl text-white shadow-xl" style={{ background: THEME.sunset }}>▶</span>
                            </span>
                        </button>
                    )}
                </div>
                <div className="p-3 flex items-center justify-between">
                    <div>
                        <div className="font-bold" style={{ color: THEME.ink }}>Debugging Love</div>
                        <div className="text-xs" style={{ color: THEME.muted }}>An original song · xlibraries</div>
                    </div>
                    <a href="https://www.youtube.com/@xlibraries" target="_blank" rel="noreferrer noopener" className="text-xs font-bold px-3 py-1 rounded-full text-white shadow-sm hover:opacity-90" style={{ background: THEME.coral }}>
                        YouTube channel ↗
                    </a>
                </div>
            </div>
        </div>
    );
}

function SectionTitle({ children, emoji, color, className = "" }) {
    return (
        <div className={className + " text-sm font-bold uppercase tracking-wider mb-3 flex items-center gap-2"} style={{ color }}>
            <span className="text-base">{emoji}</span>
            <span>{children}</span>
            <span className="flex-grow rounded-full" style={{ height: 3, background: `linear-gradient(90deg, ${color}66, transparent)` }} />
        </div>
    );
}

const TABS = [
    { id: "world", label: "World", icon: "🗺️" },
    { id: "quests", label: "Quests", icon: "📜" },
    { id: "character", label: "Character", icon: "🧝" },
    { id: "lore", label: "Lore", icon: "🪶" },
];

export function SideQuests() {
    const [tab, setTab] = React.useState("world");
    const [travel, setTravel] = React.useState(null);
    const [focus, setFocus] = React.useState(null);

    React.useEffect(() => {
        try {
            const saved = localStorage.getItem("side-quests-tab");
            if (TABS.some(t => t.id === saved)) setTab(saved);
        } catch (e) { }
        loadTravel().then(setTravel);
    }, []);

    const open = (id) => {
        setTab(id);
        try { localStorage.setItem("side-quests-tab", id); } catch (e) { }
        ReactGA.send({ hitType: "pageview", page: "/side-quests/" + id, title: "Side Quests" });
    };

    const showOnMap = (at) => {
        setFocus([...at]);
        open("world");
    };

    return (
        <div className="w-full h-full flex flex-col select-none" style={{ background: THEME.bg, color: THEME.ink }}>
            <div className="flex items-center gap-1 px-2 py-1.5 overflow-x-auto windowMainScreen" style={{ background: THEME.sunset }}>
                {TABS.map(t => (
                    <button
                        key={t.id}
                        type="button"
                        onClick={() => open(t.id)}
                        className={(tab === t.id ? "bg-white shadow-md font-bold " : "text-white hover:bg-white hover:bg-opacity-20 ") + "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm whitespace-nowrap transition-colors"}
                        style={tab === t.id ? { color: THEME.pink } : undefined}
                    >
                        <span>{t.icon}</span>{t.label}
                    </button>
                ))}
                <div className="ml-auto pl-3 text-xs whitespace-nowrap hidden md:block text-white font-medium opacity-95">
                    Off the clock · things I do for fun ✌️
                </div>
            </div>
            <div className="flex-grow overflow-hidden">
                {tab === "world" && <WorldTab travel={travel} focus={focus} />}
                {tab === "quests" && <QuestsTab onShow={showOnMap} />}
                {tab === "character" && <CharacterTab travel={travel} />}
                {tab === "lore" && <LoreTab />}
            </div>
        </div>
    );
}

export default SideQuests;

export const displaySideQuests = () => {
    return <SideQuests />;
};
