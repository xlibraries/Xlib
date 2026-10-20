import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CACHE_TTL, isFresh, readCache, writeCache } from '../src/playlists';

beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) });
});

describe('playlist cache', () => {
    it('round-trips tracks with a timestamp', () => {
        const tracks = [{ id: 'a', title: 'A', author: 'B', duration: 1 }];
        writeCache('PL1', tracks, 1000);
        expect(readCache('PL1')).toEqual({ t: 1000, tracks });
        expect(readCache('missing')).toBeNull();
    });

    it('treats entries older than the TTL as stale', () => {
        expect(isFresh({ t: 0 }, CACHE_TTL - 1)).toBe(true);
        expect(isFresh({ t: 0 }, CACHE_TTL + 1)).toBe(false);
        expect(isFresh(null)).toBe(false);
    });

    it('survives blocked storage', () => {
        vi.stubGlobal('localStorage', { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } });
        expect(readCache('PL1')).toBeNull();
        expect(() => writeCache('PL1', [])).not.toThrow();
    });
});
