// @ts-nocheck
import React from 'react';
import ReactGA from 'react-ga4';

// Life outside work, as an RPG: a world map of travels, a quest log, a character sheet and some lore.
// Travel data comes from public/side-quests/travel.json (built by scripts/side-quests/build_travel_data.py,
// town-level only, private places removed). Everything else is curated below.

const THEME = {
    bg: "#0d1220",
    panel: "#151c2e",
    panel2: "#1b2438",
    line: "rgba(255, 255, 255, 0.08)",
    gold: "#ffb347",
    teal: "#3dd6c6",
    text: "#ece8e1",
    muted: "#9aa3b5",
};

const RARITY = {
    Legendary: "#ffb347",
    Epic: "#c084fc",
    Rare: "#60a5fa",
    Common: "#9aa3b5",
};

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
        title: "Kodaikanal",
        when: "2025",
        where: "Tamil Nadu",
        rarity: "Rare",
        tags: ["Hills"],
        at: [10.24, 77.49],
        story: "Hill-station escape with friends: misty viewpoints, pine forests and the lake.",
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
    { name: "Darjeeling", at: [27.04, 88.27] },
    { name: "Gangtok", at: [27.34, 88.61] },
    { name: "Kanha National Park", at: [22.33, 80.61] },
    { name: "Pench National Park", at: [21.7, 79.32] },
    { name: "Pachmarhi", at: [22.47, 78.43] },
    { name: "Gopalpur-on-Sea", at: [19.26, 84.91] },
    { name: "Kedarnath", at: [30.735, 79.067] },
    { name: "Sabaudia, Italy", at: [41.3, 13.02] },
];

const ORIGINS = [
    "Sahyadri forts: Lohagad, Visapur, Sus Hill, Marunji",
    "Bhushi & Kasarsai dams, Pataleshwar Caves",
    "Penukonda Fort & Kolar Gold Fields",
    "Darjeeling & Gangtok",
    "Mysuru, Ooty & Nandi Hills",
    "Kanha, Pench & Pachmarhi",
    "Lonavala & Igatpuri",
    "Gopalpur-on-Sea",
    "Sabaudia, Italy",
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

const MODE_STYLE = {
    car: { color: THEME.gold, label: "Road trips" },
    motorcycle: { color: "#ff7a59", label: "Motorcycle" },
    train: { color: THEME.teal, label: "Rail", dash: "4 6" },
    bus: { color: "#a78bfa", label: "Bus" },
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

let travelPromise = null;
function loadTravel() {
    if (!travelPromise) travelPromise = fetch("./side-quests/travel.json").then(r => r.json()).catch(() => null);
    return travelPromise;
}

function WorldMap({ travel, focus }) {
    const el = React.useRef(null);
    const mapRef = React.useRef(null);
    const [failed, setFailed] = React.useState(false);

    React.useEffect(() => {
        let cancelled = false;
        let observer = null;
        loadLeaflet().then(L => {
            if (cancelled || !el.current) return;
            const map = L.map(el.current, { zoomControl: false, attributionControl: true, worldCopyJump: true }).setView([21, 79], 5);
            mapRef.current = map;
            L.control.zoom({ position: "bottomright" }).addTo(map);
            // Standard OSM tiles (no API key), darkened with a CSS filter to match the theme
            L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
                maxZoom: 12,
                className: "side-quests-tiles",
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            }).addTo(map);

            const bounds = [];
            (travel ? travel.routes : []).forEach(route => {
                const style = MODE_STYLE[route.mode] || MODE_STYLE.car;
                L.polyline(route.points, { color: style.color, weight: 7, opacity: 0.12 }).addTo(map);
                L.polyline(route.points, { color: style.color, weight: 2, opacity: 0.85, dashArray: style.dash }).addTo(map);
                route.points.forEach(p => bounds.push(p));
            });
            (travel ? travel.places : []).forEach(place => {
                const marker = L.circleMarker([place.lat, place.lng], { radius: 5, color: THEME.gold, weight: 2, fillColor: THEME.gold, fillOpacity: 0.55 }).addTo(map);
                marker.bindPopup(`<b>${place.name}</b><br/>${place.state}<br/><span style="opacity:.7">${place.months.map(monthLabel).join(", ")}</span>`);
                bounds.push([place.lat, place.lng]);
            });
            MEMORIES.forEach(m => {
                L.circleMarker(m.at, { radius: 4, color: THEME.teal, weight: 2, fillColor: THEME.teal, fillOpacity: 0.35 })
                    .addTo(map).bindPopup(`<b>${m.name}</b><br/><span style="opacity:.7">Earlier adventure</span>`);
            });
            L.marker([12.97, 77.59], {
                icon: L.divIcon({ className: "", html: '<div style="font-size:20px;filter:drop-shadow(0 0 6px #ffb347)">⭐</div>', iconSize: [20, 20], iconAnchor: [10, 10] }),
            }).addTo(map).bindPopup("<b>Bengaluru</b><br/>Home base");

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
            <style>{`.side-quests-tiles { filter: invert(1) hue-rotate(200deg) brightness(0.62) contrast(1.15) saturate(0.5); }`}</style>
            <div ref={el} className="w-full h-full" style={{ background: THEME.bg }} />
        </>
    );
}

function WorldTab({ travel, focus }) {
    const km = travel ? travel.km : {};
    const stats = [
        { icon: "🏍️", value: formatKm(km.motorcycle), label: "km on two wheels" },
        { icon: "🚗", value: formatKm(km.car), label: "km road-tripping" },
        { icon: "🚆", value: formatKm(km.train), label: "km by rail" },
        { icon: "✈️", value: formatKm(km.flight), label: "km flown" },
        { icon: "📍", value: travel ? travel.places.length : "–", label: `towns · ${travel ? travel.states.length : "–"} states` },
    ];
    return (
        <div className="relative w-full h-full">
            <WorldMap travel={travel} focus={focus} />
            <div className="absolute top-2 left-2 right-2 flex flex-wrap gap-1.5 pointer-events-none" style={{ zIndex: 500 }}>
                {stats.map(s => (
                    <div key={s.label} className="px-2.5 py-1 rounded-lg text-xs backdrop-blur" style={{ background: "rgba(13, 18, 32, 0.78)", border: `1px solid ${THEME.line}` }}>
                        <span className="mr-1">{s.icon}</span>
                        <b style={{ color: THEME.gold }}>{s.value}</b> <span style={{ color: THEME.muted }}>{s.label}</span>
                    </div>
                ))}
            </div>
            <div className="absolute bottom-2 left-2 px-2.5 py-1.5 rounded-lg text-xs space-y-0.5" style={{ zIndex: 500, background: "rgba(13, 18, 32, 0.78)", border: `1px solid ${THEME.line}` }}>
                <div><span style={{ color: THEME.gold }}>●</span> Last 12 months{travel ? ` (${monthLabel(travel.period.from)} – ${monthLabel(travel.period.to)})` : ""}</div>
                <div><span style={{ color: THEME.teal }}>●</span> Earlier adventures</div>
                <div style={{ color: THEME.muted }}>
                    {Object.entries(MODE_STYLE).map(([mode, s]) => <span key={mode} className="mr-2"><span style={{ color: s.color }}>━</span> {s.label}</span>)}
                </div>
            </div>
        </div>
    );
}

function QuestsTab({ onShow }) {
    return (
        <div className="w-full h-full overflow-y-auto windowMainScreen p-3 md:p-5">
            <SectionTitle>Quest log</SectionTitle>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {QUESTS.map(q => (
                    <div key={q.title} className="rounded-xl p-3.5 flex flex-col" style={{ background: THEME.panel, border: `1px solid ${THEME.line}`, boxShadow: `inset 3px 0 0 ${RARITY[q.rarity]}` }}>
                        <div className="flex items-start justify-between gap-2">
                            <div>
                                <div className="font-bold text-base">{q.title}</div>
                                <div className="text-xs" style={{ color: THEME.muted }}>{q.when} · {q.where}</div>
                            </div>
                            <span className="text-xs px-2 py-0.5 rounded-full whitespace-nowrap" style={{ color: RARITY[q.rarity], border: `1px solid ${RARITY[q.rarity]}55` }}>{q.rarity}</span>
                        </div>
                        <p className="text-sm mt-2 leading-snug flex-grow" style={{ color: "#d6d2ca" }}>{q.story}</p>
                        <div className="flex items-center justify-between mt-3">
                            <div className="flex flex-wrap gap-1">
                                {q.tags.map(t => <span key={t} className="text-xs px-1.5 py-0.5 rounded" style={{ background: THEME.panel2, color: THEME.muted }}>{t}</span>)}
                            </div>
                            <button type="button" onClick={() => onShow(q.at)} className="text-xs px-2 py-1 rounded hover:bg-white hover:bg-opacity-10" style={{ color: THEME.gold }}>
                                Show on map →
                            </button>
                        </div>
                    </div>
                ))}
            </div>
            <SectionTitle className="mt-6">Chapter zero · earlier adventures</SectionTitle>
            <div className="flex flex-wrap gap-2">
                {ORIGINS.map(o => <span key={o} className="text-xs md:text-sm px-2.5 py-1 rounded-full" style={{ background: THEME.panel, border: `1px solid ${THEME.teal}44`, color: "#cfe9e5" }}>{o}</span>)}
            </div>
        </div>
    );
}

function CharacterTab({ travel }) {
    return (
        <div className="w-full h-full overflow-y-auto windowMainScreen p-3 md:p-5">
            <div className="rounded-xl p-4 flex items-center gap-4" style={{ background: `linear-gradient(135deg, ${THEME.panel2}, ${THEME.panel})`, border: `1px solid ${THEME.line}` }}>
                <img src="./images/logos/bitmoji.png" alt="" className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-white flex-shrink-0" />
                <div className="min-w-0">
                    <div className="text-xl md:text-2xl font-bold">Aman</div>
                    <div className="text-sm" style={{ color: THEME.gold }}>Class: Engineer · Wanderer · Storyteller</div>
                    <div className="text-xs mt-1" style={{ color: THEME.muted }}>
                        Home base: Bengaluru{travel ? ` · ${travel.states.length} states explored this year` : ""}
                    </div>
                </div>
            </div>
            <SectionTitle className="mt-5">Skills & side hustles of the soul</SectionTitle>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {SKILLS.map(s => (
                    <div key={s.name} className="rounded-xl p-3 flex gap-3" style={{ background: THEME.panel, border: `1px solid ${THEME.line}` }}>
                        <div className="text-2xl leading-none">{s.icon}</div>
                        <div className="min-w-0">
                            <div className="font-bold text-sm">{s.name}</div>
                            <div className="text-xs mt-0.5 leading-snug" style={{ color: THEME.muted }}>{s.note}</div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

function LoreTab() {
    const [playing, setPlaying] = React.useState(false);
    return (
        <div className="w-full h-full overflow-y-auto windowMainScreen p-3 md:p-5">
            <SectionTitle>Scrolls</SectionTitle>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {LORE.map(line => (
                    <blockquote key={line} className="rounded-xl p-5 text-lg md:text-xl italic leading-snug" style={{ background: THEME.panel, border: `1px solid ${THEME.gold}33`, fontFamily: "Georgia, 'Times New Roman', serif" }}>
                        <span style={{ color: THEME.gold }}>“</span>{line}<span style={{ color: THEME.gold }}>”</span>
                    </blockquote>
                ))}
            </div>
            <SectionTitle className="mt-6">Bard's corner</SectionTitle>
            <div className="rounded-xl overflow-hidden max-w-xl" style={{ background: THEME.panel, border: `1px solid ${THEME.line}` }}>
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
                        <button type="button" onClick={() => setPlaying(true)} className="absolute inset-0 w-full h-full group" aria-label="Play Debugging Love">
                            <img src={`https://i.ytimg.com/vi/${SONG_ID}/hqdefault.jpg`} alt="" className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" />
                            <span className="absolute inset-0 flex items-center justify-center">
                                <span className="w-14 h-14 rounded-full flex items-center justify-center text-xl text-black shadow-lg" style={{ background: THEME.gold }}>▶</span>
                            </span>
                        </button>
                    )}
                </div>
                <div className="p-3 flex items-center justify-between">
                    <div>
                        <div className="font-bold">Debugging Love</div>
                        <div className="text-xs" style={{ color: THEME.muted }}>An original song · xlibraries</div>
                    </div>
                    <a href="https://www.youtube.com/@xlibraries" target="_blank" rel="noreferrer noopener" className="text-xs px-2 py-1 rounded hover:bg-white hover:bg-opacity-10" style={{ color: THEME.gold }}>
                        YouTube channel ↗
                    </a>
                </div>
            </div>
        </div>
    );
}

function SectionTitle({ children, className = "" }) {
    return (
        <div className={className + " text-xs uppercase tracking-widest mb-3 flex items-center gap-2"} style={{ color: THEME.gold }}>
            <span>{children}</span>
            <span className="flex-grow h-px" style={{ background: `${THEME.gold}33` }} />
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
        <div className="w-full h-full flex flex-col select-none" style={{ background: THEME.bg, color: THEME.text }}>
            <div className="flex items-center gap-1 px-2 py-1.5 overflow-x-auto windowMainScreen" style={{ background: THEME.panel, borderBottom: `1px solid ${THEME.line}` }}>
                {TABS.map(t => (
                    <button
                        key={t.id}
                        type="button"
                        onClick={() => open(t.id)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm whitespace-nowrap transition-colors"
                        style={tab === t.id ? { background: `${THEME.gold}22`, color: THEME.gold, boxShadow: `inset 0 -2px 0 ${THEME.gold}` } : { color: THEME.muted }}
                    >
                        <span>{t.icon}</span>{t.label}
                    </button>
                ))}
                <div className="ml-auto pl-3 text-xs whitespace-nowrap hidden md:block" style={{ color: THEME.muted }}>
                    Off the clock · things I do for fun
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
