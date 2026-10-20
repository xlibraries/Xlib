import { describe, expect, it, vi } from 'vitest';
import { buildSnapshot, discoverInstances, fetchPlaylist, sameTracks } from '../scripts/snapshot.mjs';

const video = (id) => ({ videoId: id, title: 'Song ' + id, author: 'A', lengthSeconds: 200 });

describe('update-music-snapshot', () => {
    it('discovers healthy https API instances after the default', async () => {
        const fetchJson = vi.fn().mockResolvedValue([
            ['a', { type: 'https', api: true, uri: 'https://a.example' }],
            ['b', { type: 'https', api: false, uri: 'https://b.example' }],
            ['c', { type: 'onion', api: true, uri: 'http://c.onion' }],
        ]);
        expect(await discoverInstances(fetchJson)).toEqual(['https://invidious.f5.si', 'https://a.example']);
        expect(await discoverInstances(vi.fn().mockRejectedValue(new Error('down')))).toEqual(['https://invidious.f5.si']);
    });

    it('falls through to the next instance when one fails', async () => {
        const fetchJson = vi.fn()
            .mockRejectedValueOnce(new Error('500'))
            .mockResolvedValueOnce({ videos: [video('x')] });
        expect(await fetchPlaylist('PL1', ['https://one', 'https://two'], fetchJson)).toEqual([{ id: 'x', title: 'Song x', author: 'A', duration: 200 }]);
        expect(fetchJson).toHaveBeenLastCalledWith('https://two/api/v1/playlists/PL1');
    });

    it('keeps the previous tracks for playlists that fail', async () => {
        const fetchJson = vi.fn(async (url) => {
            if (url.includes('instances.json')) return [];
            if (url.endsWith('/good')) return { videos: [video('g')] };
            throw new Error('down');
        });
        const { snapshot, fresh } = await buildSnapshot({
            playlists: [{ id: 'good', title: 'Good' }, { id: 'bad', title: 'Bad' }],
            previous: { playlists: { bad: [{ id: 'old' }] } },
            fetchJson,
            now: new Date('2026-10-20T00:00:00Z'),
        });
        expect(fresh).toBe(1);
        expect(snapshot.updated).toBe('2026-10-20T00:00:00.000Z');
        expect(snapshot.playlists.good[0].id).toBe('g');
        expect(snapshot.playlists.bad).toEqual([{ id: 'old' }]);
    });

    it('only counts track changes, not the timestamp', () => {
        const tracks = { PL1: [{ id: 'a' }] };
        expect(sameTracks({ updated: 'old', playlists: tracks }, { updated: 'new', playlists: { PL1: [{ id: 'a' }] } })).toBe(true);
        expect(sameTracks({ playlists: tracks }, { playlists: { PL1: [{ id: 'b' }] } })).toBe(false);
        expect(sameTracks({}, { playlists: tracks })).toBe(false);
    });
});
