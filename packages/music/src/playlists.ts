// Track lists show instantly from (1) this browser's cache or (2) the snapshot the site ships (built by
// scripts/snapshot.mjs), then refresh from Invidious in the background.
import type { Track } from './tracks';

export interface Playlist { id: string; title: string }
export interface Snapshot { updated?: string; playlists: Record<string, Track[]> }

export const CACHE_TTL = 6 * 60 * 60 * 1000;
const cacheKey = (id: string) => 'music-cache-' + id;

export function readCache(id: string): { t: number; tracks: Track[] } | null {
    try { return JSON.parse(localStorage.getItem(cacheKey(id)) || 'null'); } catch { return null; }
}

export function writeCache(id: string, tracks: Track[], now = Date.now()) {
    try { localStorage.setItem(cacheKey(id), JSON.stringify({ t: now, tracks })); } catch { /* storage full or blocked */ }
}

export const isFresh = (cached: { t: number } | null, now = Date.now()) => !!cached && now - cached.t < CACHE_TTL;

/** Loads the snapshot once per URL; resolves to null if it's missing. */
const snapshots = new Map<string, Promise<Snapshot | null>>();
export function loadSnapshot(url: string): Promise<Snapshot | null> {
    if (!snapshots.has(url)) {
        snapshots.set(url, fetch(url).then((res) => (res.ok ? res.json() : null)).catch(() => null));
    }
    return snapshots.get(url)!;
}
