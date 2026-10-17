// Saves the Music app's playlists to public/music/snapshot.json so the app can show
// them instantly instead of waiting on the (slow, free) Invidious servers.
// Runs before every build; playlists that fail to fetch keep their previous snapshot, and the whole
// refresh gives up after TIME_BUDGET so a slow server can't stall deploys. Usage: node scripts/update-music-snapshot.mjs
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const OUT = "public/music/snapshot.json";
const TIME_BUDGET = 90 * 1000;
const deadline = Date.now() + TIME_BUDGET;
const playlists = JSON.parse(readFileSync("data/music-playlists.json", "utf8"));
const previous = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : { playlists: {} };

const fetchJson = async (url) => {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new Error("time budget exceeded");
    const res = await fetch(url, { signal: AbortSignal.timeout(Math.min(30000, remaining)) });
    if (!res.ok) throw new Error(`${res.status} ${url}`);
    return res.json();
};

const instances = ["https://invidious.f5.si"];
try {
    const list = await fetchJson("https://api.invidious.io/instances.json?sort_by=health");
    for (const [, info] of list) {
        if (info.type === "https" && info.api && !instances.includes(info.uri)) instances.push(info.uri);
    }
} catch (e) { }

const fetchPlaylist = async (id) => {
    for (const base of instances) {
        if (Date.now() >= deadline) return null;
        try {
            const data = await fetchJson(`${base}/api/v1/playlists/${id}`);
            const tracks = (data.videos || []).map(v => ({ id: v.videoId, title: v.title, author: v.author || "", duration: v.lengthSeconds || 0 }));
            if (tracks.length) return tracks;
        } catch (e) { }
    }
    return null;
};

const snapshot = { updated: new Date().toISOString(), playlists: {} };
let fresh = 0;
for (const { id, title } of playlists) {
    const tracks = await fetchPlaylist(id);
    if (tracks) fresh++;
    console.log(`${tracks ? "✓" : "✗ (kept previous)"} ${title}${tracks ? ` — ${tracks.length} songs` : ""}`);
    snapshot.playlists[id] = tracks || previous.playlists[id] || [];
}

if (fresh === 0) {
    console.log("No playlists could be fetched; snapshot left unchanged.");
} else {
    writeFileSync(OUT, JSON.stringify(snapshot));
    console.log(`Updated ${fresh}/${playlists.length} playlists → ${OUT}`);
}
