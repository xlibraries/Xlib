// Pure helpers for the Music app: time formatting, Invidious → track, lyrics matching and parsing.

export type Track = { id: string; title: string; author: string; duration: number };
export type LyricsResult = { duration: number; instrumental?: boolean; syncedLyrics?: string | null; plainLyrics?: string | null; trackName?: string; artistName?: string };
export type LyricLine = { t: number; text: string };

// seconds -> "m:ss"
export function formatTime(secs: number | null | undefined): string {
    if (!secs || isNaN(secs)) return "0:00";
    const s = Math.floor(secs);
    return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
}

// Invidious video -> track
export function toTrack(v: { videoId: string; title: string; author?: string; lengthSeconds?: number }): Track {
    return { id: v.videoId, title: v.title, author: v.author || "", duration: v.lengthSeconds || 0 };
}

// YouTube titles are noisy ("Song - Artist | Movie (Official Video)"), so try a few cleaned variants.
export function lyricQueries(title: string): string[] {
    const base = title.replace(/\([^)]*\)|\[[^\]]*\]|【[^】]*】/g, " ").split(/[|｜]/)[0];
    const cleaned = base
        .replace(/\b(official|music|video|lyrics?|lyrical|audio|full song|full video|visualizer|hd|4k|mv)\b/gi, " ")
        .replace(/["“”]/g, "")
        .replace(/\s+/g, " ")
        .trim();
    const parts = cleaned.split(/\s[-–—]\s/).map(x => x.trim()).filter(Boolean);
    return [...new Set([cleaned, ...parts.slice(1), parts[0]])].filter(Boolean);
}

// Prefer synced lyrics whose length matches the video; reject obvious mismatches (> 30 s off).
export function pickLyrics<T extends LyricsResult>(results: T[] | null | undefined, duration: number): T | null {
    const scored = (results || [])
        .filter(r => !r.instrumental && (r.syncedLyrics || r.plainLyrics))
        .map(r => ({ r, diff: duration ? Math.abs(r.duration - duration) : 0 }))
        .filter(x => x.diff <= 30)
        .sort((a, b) => (a.diff - (a.r.syncedLyrics ? 10 : 0)) - (b.diff - (b.r.syncedLyrics ? 10 : 0)));
    return scored.length ? scored[0].r : null;
}

// "[mm:ss.xx] text" lines -> timed lines
export function parseLrc(lrc: string): LyricLine[] {
    return lrc.split("\n").flatMap(line => {
        const m = line.match(/^\[(\d+):(\d+(?:\.\d+)?)\]\s*(.*)$/);
        return m ? [{ t: parseInt(m[1], 10) * 60 + parseFloat(m[2]), text: m[3] }] : [];
    });
}

// Index of the lyric line playing at `time` (-1 before the first line)
export function currentLyricIndex(lines: LyricLine[], time: number): number {
    let active = -1;
    lines.forEach((l, i) => { if (l.t <= time + 0.3) active = i; });
    return active;
}
