import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';
import { memoryStore } from '@xlibraries/analytics/server';
import { BOARDS, cleanName, postScore, readBoard, validBoard, validScore } from '../../lib/leaderboard';

const TT = BOARDS['turbo-trails'];

describe('validation', () => {
    it('cleans nicknames', () => {
        expect(cleanName('  Asha  Rao ')).toBe('Asha Rao');
        expect(cleanName('<script>alert(1)</script>')).toBe('scriptalert1scri');   // tags stripped, then capped at 16
        expect(cleanName('a')).toBeNull();
        expect(cleanName('x'.repeat(40))).toHaveLength(16);
        expect(cleanName(42)).toBeNull();
        expect(cleanName('राम_2')).toBe('राम_2');
    });
    it('accepts only sane integer scores and known boards', () => {
        expect(validScore(TT, 820)).toBe(820);
        expect(validScore(TT, 2401)).toBeNull();
        expect(validScore(TT, -1)).toBeNull();
        expect(validScore(TT, 12.5)).toBeNull();
        expect(validScore(TT, '820')).toBeNull();
        expect(validBoard('3', TT)).toBe(3);
        expect(validBoard(10, TT)).toBeNull();
    });
});

describe('boards', () => {
    it('keeps one best per name, sorted, with the rank of the poster', async () => {
        const store = memoryStore();
        await postScore(store, 'turbo-trails', 0, 'Ravi', 500);
        const first = await postScore(store, 'turbo-trails', 0, 'Asha', 820);
        expect(first.rank).toBe(1);
        const worse = await postScore(store, 'turbo-trails', 0, 'Asha', 300);
        expect(worse.entries).toEqual([{ name: 'Asha', score: 820 }, { name: 'Ravi', score: 500 }]);
        expect(await readBoard(store, 'turbo-trails', 1)).toEqual([]);
    });
});

function call(handler: (req: NextApiRequest, res: NextApiResponse) => unknown, req: Partial<NextApiRequest>) {
    let status = 0; let body: unknown;
    const res = { status(c: number) { status = c; return this; }, json(d: unknown) { body = d; return this; }, setHeader() { return this; } } as unknown as NextApiResponse;
    return Promise.resolve(handler({ method: 'GET', query: {}, headers: {}, socket: { remoteAddress: '9.9.9.9' }, ...req } as unknown as NextApiRequest, res)).then(() => ({ status, body }));
}

describe('/api/arcade/leaderboard', () => {
    const SITE = { origin: 'https://xlibraries.com', host: 'xlibraries.com' };
    beforeEach(() => { vi.resetModules(); vi.stubEnv('XLIB_MEMORY_STORE', '1'); });
    afterEach(() => vi.unstubAllEnvs());

    it('posts from this site only, validates, and serves the board', async () => {
        const handler = (await import('../../pages/api/arcade/leaderboard')).default;
        expect((await call(handler, { method: 'POST', headers: { ...SITE, origin: 'https://evil.example' }, body: { game: 'turbo-trails', board: 0, name: 'Asha', score: 100 } })).status).toBe(403);
        expect((await call(handler, { method: 'POST', headers: SITE, body: { game: 'nope', board: 0, name: 'Asha', score: 100 } })).status).toBe(400);
        expect((await call(handler, { method: 'POST', headers: SITE, body: { game: 'turbo-trails', board: 0, name: 'A', score: 100 } })).status).toBe(400);
        expect((await call(handler, { method: 'POST', headers: SITE, body: { game: 'turbo-trails', board: 0, name: 'Asha', score: 99999 } })).status).toBe(400);
        const posted = await call(handler, { method: 'POST', headers: SITE, body: { game: 'turbo-trails', board: 2, name: 'Asha', score: 640 } });
        expect(posted.body).toEqual({ entries: [{ name: 'Asha', score: 640 }], rank: 1 });
        expect((await call(handler, { query: { game: 'turbo-trails', board: '2' } })).body).toEqual({ entries: [{ name: 'Asha', score: 640 }] });
        expect((await call(handler, { query: { game: 'turbo-trails', board: '7' } })).body).toEqual({ entries: [] });
    });

    it('rate-limits a chatty poster', async () => {
        const handler = (await import('../../pages/api/arcade/leaderboard')).default;
        let last = 0;
        for (let i = 0; i < 21; i++) last = (await call(handler, { method: 'POST', headers: { ...SITE, 'x-forwarded-for': '7.7.7.7' }, body: { game: 'turbo-trails', board: 0, name: 'Spam' + i, score: 10 + i } })).status;
        expect(last).toBe(429);
    });
});
