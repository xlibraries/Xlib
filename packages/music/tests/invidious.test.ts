import { describe, expect, it, vi } from 'vitest';
import { Invidious } from '../src/invidious';

const json = (data: unknown, ok = true) => Promise.resolve({ ok, status: ok ? 200 : 500, json: () => Promise.resolve(data) } as Response);

describe('Invidious', () => {
    it('uses the first instance that answers and moves it to the front', async () => {
        const fetch = vi.fn((url: string) => url.startsWith('https://a') ? json({}, false) : json({ ok: 1 }));
        const client = new Invidious({ instances: ['https://a', 'https://b'], fetch: fetch as unknown as typeof globalThis.fetch });
        expect(await client.get('/x')).toEqual({ ok: 1 });
        expect(client.known).toEqual(['https://b', 'https://a']);
        await client.get('/y');
        expect(fetch).toHaveBeenLastCalledWith('https://b/api/v1/y', expect.anything());
    });

    it('discovers healthy CORS-enabled instances when all known ones fail', async () => {
        const fetch = vi.fn((url: string) => {
            if (url.includes('instances.json')) return json([
                ['c', { type: 'https', api: true, cors: true, uri: 'https://c' }],
                ['d', { type: 'https', api: true, cors: false, uri: 'https://d' }],
                ['e', { type: 'onion', api: true, cors: true, uri: 'http://e.onion' }],
            ]);
            return url.startsWith('https://c') ? json(['found']) : json({}, false);
        });
        const client = new Invidious({ instances: ['https://a'], fetch: fetch as unknown as typeof globalThis.fetch });
        expect(await client.get('/search')).toEqual(['found']);
        expect(client.known).toEqual(['https://c', 'https://a']);
    });

    it('gives up when no instance answers', async () => {
        const fetch = vi.fn((url: string) => url.includes('instances.json') ? json([]) : Promise.reject(new Error('down')));
        const client = new Invidious({ instances: ['https://a'], fetch: fetch as unknown as typeof globalThis.fetch });
        await expect(client.get('/x')).rejects.toThrow('No Invidious instance available');
    });
});
