#!/usr/bin/env node
// Saves a site's playlists to a snapshot JSON file so the Music app can show them instantly instead of
// waiting on the (slow, free) Invidious servers. Playlists that fail to fetch keep their previous tracks,
// and the whole refresh gives up after TIME_BUDGET so a slow server can't stall a deploy.
// Usage: xlib-music-snapshot --playlists data/music-playlists.json --out public/music/snapshot.json
import { readFileSync, writeFileSync, existsSync, realpathSync } from "node:fs";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";

const TIME_BUDGET = 90 * 1000;
const DEFAULT_INSTANCES = ["https://invidious.f5.si"];

// fetch JSON within an overall time budget
export function budgetedFetchJson(budgetMs, fetchImpl = fetch) {
    const deadline = Date.now() + budgetMs;
    const fetchJson = async (url) => {
        const remaining = deadline - Date.now();
        if (remaining <= 0) throw new Error("time budget exceeded");
        const res = await fetchImpl(url, { signal: AbortSignal.timeout(Math.min(30000, remaining)) });
        if (!res.ok) throw new Error(`${res.status} ${url}`);
        return res.json();
    };
    fetchJson.expired = () => Date.now() >= deadline;
    return fetchJson;
}

// default instance first, then healthy public instances with an API
export async function discoverInstances(fetchJson) {
    const instances = [...DEFAULT_INSTANCES];
    try {
        const list = await fetchJson("https://api.invidious.io/instances.json?sort_by=health");
        for (const [, info] of list) {
            if (info.type === "https" && info.api && !instances.includes(info.uri)) instances.push(info.uri);
        }
    } catch { /* keep the default */ }
    return instances;
}

export async function fetchPlaylist(id, instances, fetchJson) {
    for (const base of instances) {
        if (fetchJson.expired?.()) return null;
        try {
            const data = await fetchJson(`${base}/api/v1/playlists/${id}`);
            const tracks = (data.videos || []).map(v => ({ id: v.videoId, title: v.title, author: v.author || "", duration: v.lengthSeconds || 0 }));
            if (tracks.length) return tracks;
        } catch { /* try the next instance */ }
    }
    return null;
}

// Returns { snapshot, fresh }: playlists that fail keep their previous tracks
export async function buildSnapshot({ playlists, previous, fetchJson, now = new Date(), log = () => { } }) {
    const instances = await discoverInstances(fetchJson);
    const snapshot = { updated: now.toISOString(), playlists: {} };
    let fresh = 0;
    for (const { id, title } of playlists) {
        const tracks = await fetchPlaylist(id, instances, fetchJson);
        if (tracks) fresh++;
        log(`${tracks ? "✓" : "✗ (kept previous)"} ${title}${tracks ? ` — ${tracks.length} songs` : ""}`);
        snapshot.playlists[id] = tracks || previous.playlists?.[id] || [];
    }
    return { snapshot, fresh };
}

async function main() {
    const { values } = parseArgs({ options: { playlists: { type: "string" }, out: { type: "string" } } });
    if (!values.playlists || !values.out) throw new Error("usage: xlib-music-snapshot --playlists <file.json> --out <snapshot.json>");
    const playlists = JSON.parse(readFileSync(values.playlists, "utf8"));
    const previous = existsSync(values.out) ? JSON.parse(readFileSync(values.out, "utf8")) : { playlists: {} };
    const { snapshot, fresh } = await buildSnapshot({ playlists, previous, fetchJson: budgetedFetchJson(TIME_BUDGET), log: console.log });
    if (fresh === 0) {
        console.log("No playlists could be fetched; snapshot left unchanged.");
    } else {
        writeFileSync(values.out, JSON.stringify(snapshot));
        console.log(`Updated ${fresh}/${playlists.length} playlists → ${values.out}`);
    }
}

// Run as a CLI (also through the node_modules/.bin symlink), not when imported
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
