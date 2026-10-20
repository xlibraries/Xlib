import { describe, expect, it, vi } from 'vitest';
import { findLyrics } from '../src/lyrics';

const track = { id: 'v', title: 'Kesariya (Official Video) - Arijit Singh', author: 'x', duration: 268 };
const respond = (data: unknown) => Promise.resolve({ json: () => Promise.resolve(data) } as Response);

describe('findLyrics', () => {
    it('tries cleaned-up titles until LRCLIB has a match of the right length', async () => {
        const fetch = vi.fn()
            .mockReturnValueOnce(respond([]))
            .mockReturnValueOnce(respond([{ duration: 270, syncedLyrics: '[00:01.00] Hello\n[00:05.50] World', plainLyrics: 'Hello\nWorld', trackName: 'Kesariya', artistName: 'Arijit Singh' }]));
        const lyrics = await findLyrics(track, fetch as unknown as typeof globalThis.fetch);
        expect(lyrics).toEqual({ synced: [{ t: 1, text: 'Hello' }, { t: 5.5, text: 'World' }], plain: 'Hello\nWorld', name: 'Kesariya · Arijit Singh' });
        expect(fetch.mock.calls[0][0]).toContain('lrclib.net/api/search?q=');
    });

    it('returns null when nothing matches or LRCLIB is down', async () => {
        expect(await findLyrics(track, vi.fn(() => respond([])) as unknown as typeof globalThis.fetch)).toBeNull();
        expect(await findLyrics(track, vi.fn(() => Promise.reject(new Error('down'))) as unknown as typeof globalThis.fetch)).toBeNull();
    });
});
