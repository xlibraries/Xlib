// Synced lyrics from LRCLIB (free, no key), matched to the video's title and length.
import { lyricQueries, parseLrc, pickLyrics, type LyricLine, type LyricsResult, type Track } from './tracks';

export interface Lyrics { synced: LyricLine[] | null; plain: string | null; name: string }

export async function findLyrics(track: Track, fetchImpl: typeof fetch = (input, init) => fetch(input, init)): Promise<Lyrics | null> {
    try {
        for (const query of lyricQueries(track.title)) {
            const results: LyricsResult[] = await (await fetchImpl(`https://lrclib.net/api/search?q=${encodeURIComponent(query)}`)).json();
            const found = pickLyrics(results, track.duration);
            if (found) {
                return {
                    synced: found.syncedLyrics ? parseLrc(found.syncedLyrics) : null,
                    plain: found.plainLyrics ?? null,
                    name: `${found.trackName} · ${found.artistName}`,
                };
            }
        }
    } catch { /* LRCLIB unavailable */ }
    return null;
}
