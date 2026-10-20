import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';
import { accessSummary } from '../../components/admin/photo-drop';

const DAY = 24 * 3600 * 1000;
const NOW = Date.parse('2026-10-20T12:00:00Z');

describe('accessSummary', () => {
    it('counts down to the 7-day expiry and warns in the last day', () => {
        expect(accessSummary({ access: { ok: true, error: null }, expiresAt: NOW + 3 * DAY + 5 * 3600000 }, NOW)).toMatchObject({ tone: 'ok', text: expect.stringContaining('Expires in 3 d 5 h') });
        expect(accessSummary({ access: { ok: true, error: null }, expiresAt: NOW + 2 * 3600000 }, NOW)).toMatchObject({ tone: 'warn', text: expect.stringContaining('Expires in 2 h') });
        expect(accessSummary({ access: { ok: true, error: null }, expiresAt: NOW - 1 }, NOW).tone).toBe('bad');
    });

    it('flags failing access and an unknown renewal date', () => {
        expect(accessSummary({ access: { ok: false, error: '401' }, expiresAt: NOW + DAY }, NOW)).toMatchObject({ tone: 'bad', text: expect.stringContaining('Uploads are failing') });
        expect(accessSummary({ access: { ok: true, error: null }, expiresAt: null }, NOW)).toMatchObject({ tone: 'warn', text: expect.stringContaining('Run setup') });
    });
});

function call(handler: (req: NextApiRequest, res: NextApiResponse) => unknown, headers: Record<string, string> = {}) {
    let status = 0; let body: unknown;
    const res = { status(c: number) { status = c; return this; }, json(d: unknown) { body = d; return this; }, setHeader() { return this; } } as unknown as NextApiResponse;
    return Promise.resolve(handler({ method: 'GET', headers, query: {} } as unknown as NextApiRequest, res)).then(() => ({ status, body }));
}

describe('/api/admin/photo-drop', () => {
    const SECRET = 's'.repeat(40);
    beforeEach(() => {
        vi.resetModules();
        vi.stubEnv('ADMIN_PASSCODE', 'p');
        vi.stubEnv('ADMIN_SESSION_SECRET', SECRET);
        vi.stubEnv('PHOTO_DROP_ADMIN_KEY', 'the-admin-key');
    });
    afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

    const adminCookie = async () => `xlib_admin=${(await import('../../lib/admin-auth')).createSession(SECRET)}`;

    it('is admin only', async () => {
        const handler = (await import('../../pages/api/admin/photo-drop')).default;
        expect((await call(handler)).status).toBe(401);
    });

    it("asks the Apps Script with the server's key and passes the status through", async () => {
        const fetch = vi.fn(async (_url: string, init: RequestInit) => ({ json: async () => ({ album: 'A', access: { ok: true, error: null }, sent: JSON.parse(init.body as string) }) }));
        vi.stubGlobal('fetch', fetch);
        const handler = (await import('../../pages/api/admin/photo-drop')).default;
        const r = await call(handler, { cookie: await adminCookie() });
        expect(r.status).toBe(200);
        expect(r.body).toMatchObject({ album: 'A', sent: { action: 'admin', adminKey: 'the-admin-key' } });
        expect(fetch.mock.calls[0][0]).toMatch(/^https:\/\/script\.google\.com\/macros\/s\/.+\/exec$/);
    });

    it('reports script errors and a missing key', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => ({ json: async () => ({ error: 'Forbidden', fatal: true }) })));
        let handler = (await import('../../pages/api/admin/photo-drop')).default;
        expect(await call(handler, { cookie: await adminCookie() })).toMatchObject({ status: 502, body: { error: 'Photo Drop: Forbidden' } });
        vi.stubEnv('PHOTO_DROP_ADMIN_KEY', '');
        vi.resetModules();
        handler = (await import('../../pages/api/admin/photo-drop')).default;
        expect((await call(handler, { cookie: await adminCookie() })).status).toBe(503);
    });
});
