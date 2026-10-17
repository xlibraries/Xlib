// Saves the Music app's playlists to public/music/snapshot.json so the app can show
// them instantly instead of waiting on the (slow, free) Invidious servers.
// Playlists that fail to fetch keep their previous snapshot. Usage: node scripts/update-music-snapshot.mjs
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const OUT = "public/music/snapshot.json";
const playlists = JSON.parse(readFileSync("data/music-playlists.json", "utf8"));
const previous = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : { playlists: {} };

const fetchJson = async (url) => {
    const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
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
