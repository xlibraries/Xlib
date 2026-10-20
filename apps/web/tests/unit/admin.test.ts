import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';
import { adminConfig, createSession, passcodeMatches, readCookie, sameOrigin, SESSION_SECONDS, verifySession } from '../../lib/admin-auth';

const SECRET = 's'.repeat(40);

describe('admin sessions', () => {
    it('accepts its own fresh token and rejects tampered, foreign or expired ones', () => {
        const now = Date.parse('2026-10-20T00:00:00Z');
        const token = createSession(SECRET, now);
        expect(verifySession(token, SECRET, now)).toBe(true);
        expect(verifySession(token, SECRET, now + (SESSION_SECONDS - 60) * 1000)).toBe(true);
        expect(verifySession(token, SECRET, now + (SESSION_SECONDS + 60) * 1000)).toBe(false);   // 7 days later
        expect(verifySession(token, 'x'.repeat(40), now)).toBe(false);
        const [payload, sig] = token.split('.');
        const forged = Buffer.from(JSON.stringify({ exp: 9e9 })).toString('base64url');
        expect(verifySession(`${forged}.${sig}`, SECRET, now)).toBe(false);
        expect(verifySession(`${payload}.`, SECRET, now)).toBe(false);
        expect(verifySession(undefined, SECRET, now)).toBe(false);
    });

    it('compares passcodes exactly', () => {
        expect(passcodeMatches('open sesame', 'open sesame')).toBe(true);
        expect(passcodeMatches('open sesam', 'open sesame')).toBe(false);
    });

    it('needs both env vars and a long enough secret', () => {
        expect(adminConfig({ ADMIN_PASSCODE: 'p', ADMIN_SESSION_SECRET: SECRET } as unknown as NodeJS.ProcessEnv)).toEqual({ passcode: 'p', secret: SECRET });
        expect(adminConfig({ ADMIN_PASSCODE: 'p', ADMIN_SESSION_SECRET: 'short' } as unknown as NodeJS.ProcessEnv)).toBeNull();
        expect(adminConfig({} as unknown as NodeJS.ProcessEnv)).toBeNull();
    });

    it('reads cookies and checks the request origin', () => {
        expect(readCookie('a=1; xlib_admin=abc.def; b=2', 'xlib_admin')).toBe('abc.def');
        expect(sameOrigin({ headers: { origin: 'https://xlibraries.com', host: 'xlibraries.com' } })).toBe(true);
        expect(sameOrigin({ headers: { origin: 'https://evil.example', host: 'xlibraries.com' } })).toBe(false);
        expect(sameOrigin({ headers: { host: 'xlibraries.com' } })).toBe(false);
    });
});

// ---------- API routes ----------

function call(handler: (req: NextApiRequest, res: NextApiResponse) => unknown, req: Partial<NextApiRequest>) {
    let status = 0; let body: unknown; const headers: Record<string, string> = {};
    const res = {
        status(code: number) { status = code; return this; },
        json(data: unknown) { body = data; return this; },
        end() { return this; },
        setHeader(k: string, v: string) { headers[k.toLowerCase()] = v; return this; },
    } as unknown as NextApiResponse;
    const full = { method: 'GET', query: {}, headers: {}, socket: { remoteAddress: '9.9.9.9' }, ...req } as unknown as NextApiRequest;
    return Promise.resolve(handler(full, res)).then(() => ({ status, body, headers }));
}

const SITE = { origin: 'https://xlibraries.com', host: 'xlibraries.com', 'user-agent': 'Mozilla/5.0 Chrome/130' };

describe('admin API', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.stubEnv('ADMIN_PASSCODE', 'correct horse');
        vi.stubEnv('ADMIN_SESSION_SECRET', SECRET);
        vi.stubEnv('XLIB_MEMORY_STORE', '1');
    });
    afterEach(() => vi.unstubAllEnvs());

    it('logs in with the right passcode and sets a 7-day HttpOnly cookie', async () => {
        const login = (await import('../../pages/api/admin/login')).default;
        const r = await call(login, { method: 'POST', headers: SITE, body: { passcode: 'correct horse' } });
        expect(r.status).toBe(200);
        expect(r.headers['set-cookie']).toMatch(/^xlib_admin=[\w-]+\.[\w-]+; Path=\/; HttpOnly; Secure; SameSite=Strict; Max-Age=604800$/);
    });

    it('rejects wrong passcodes, other sites and too many attempts', async () => {
        const login = (await import('../../pages/api/admin/login')).default;
        expect((await call(login, { method: 'POST', headers: { ...SITE, origin: 'https://evil.example' }, body: { passcode: 'correct horse' } })).status).toBe(403);
        const attempts = [];
        for (let i = 0; i < 6; i++) attempts.push((await call(login, { method: 'POST', headers: { ...SITE, 'x-forwarded-for': '7.7.7.7' }, body: { passcode: 'nope' } })).status);
        expect(attempts).toEqual([401, 401, 401, 401, 401, 429]);
        // even the right passcode waits out the lockout
        expect((await call(login, { method: 'POST', headers: { ...SITE, 'x-forwarded-for': '7.7.7.7' }, body: { passcode: 'correct horse' } })).status).toBe(429);
    });

    it('says admin is not set up without the env vars', async () => {
        vi.stubEnv('ADMIN_PASSCODE', '');
        const login = (await import('../../pages/api/admin/login')).default;
        expect((await call(login, { method: 'POST', headers: SITE, body: { passcode: 'x' } })).status).toBe(503);
    });

    it('records visits, skips bots and the admin, and shows the report only to the admin', async () => {
        const track = (await import('../../pages/api/track')).default;
        const analytics = (await import('../../pages/api/admin/analytics')).default;
        const { createSession: sign } = await import('../../lib/admin-auth');
        const adminCookie = `xlib_admin=${sign(SECRET)}`;

        expect((await call(track, { method: 'POST', headers: { ...SITE, 'x-vercel-ip-country': 'IN' }, body: { type: 'visit', path: '/', width: 1440 } })).status).toBe(204);
        await call(track, { method: 'POST', headers: { ...SITE, 'user-agent': 'Googlebot/2.1' }, body: { type: 'visit', path: '/' } });
        await call(track, { method: 'POST', headers: { ...SITE, cookie: adminCookie }, body: { type: 'visit', path: '/' } });
        await call(track, { method: 'POST', headers: SITE, body: 'not json' });

        expect((await call(analytics, { headers: SITE, query: { days: '7' } })).status).toBe(401);
        const r = await call(analytics, { headers: { ...SITE, cookie: adminCookie }, query: { days: '7' } });
        expect(r.status).toBe(200);
        expect(r.body).toMatchObject({ totals: { visits: 1, visitors: 1 }, countries: [['IN', 1]] });
    });

    it('reports the session state', async () => {
        const session = (await import('../../pages/api/admin/session')).default;
        const { createSession: sign } = await import('../../lib/admin-auth');
        expect((await call(session, { headers: SITE })).body).toEqual({ configured: true, admin: false });
        expect((await call(session, { headers: { ...SITE, cookie: `xlib_admin=${sign(SECRET)}` } })).body).toEqual({ configured: true, admin: true });
    });
});
