import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';
import { memoryStore } from '@xlibraries/analytics/server';
import { cleanSettings, DEFAULT_SETTINGS, readSettings, writeSettings } from '../../lib/site-settings';
import { HIDEABLE_APPS } from '../../lib/app-ids';
import apps from '../../apps.config';

describe('cleanSettings', () => {
    it('keeps known apps once and a trimmed plain-text banner', () => {
        expect(cleanSettings({ hiddenApps: ['music', 'music', 'nope', 3], banner: { text: '  Back   soon!  ', tone: 'warn' } }, HIDEABLE_APPS))
            .toEqual({ hiddenApps: ['music'], banner: { text: 'Back soon!', tone: 'warn' } });
    });
    it('falls back for junk, empty banners and unknown tones', () => {
        expect(cleanSettings('junk', HIDEABLE_APPS)).toEqual(DEFAULT_SETTINGS);
        expect(cleanSettings({ banner: { text: '   ' } }, HIDEABLE_APPS).banner).toBeNull();
        expect(cleanSettings({ banner: { text: 'hi', tone: 'shout' } }, HIDEABLE_APPS).banner).toEqual({ text: 'hi', tone: 'info' });
        expect(cleanSettings({ banner: { text: 'x'.repeat(500) } }, HIDEABLE_APPS).banner?.text).toHaveLength(200);
    });
    it('covers every visitor app in apps.config', () => {
        expect([...HIDEABLE_APPS].sort()).toEqual(apps.map(a => a.id).sort());
    });
});

describe('readSettings / writeSettings', () => {
    it('round-trips through the store and survives a broken value', async () => {
        const store = memoryStore();
        expect(await readSettings(store, HIDEABLE_APPS)).toEqual(DEFAULT_SETTINGS);
        await writeSettings(store, { hiddenApps: ['trash'] }, HIDEABLE_APPS);
        expect(await readSettings(store, HIDEABLE_APPS)).toEqual({ hiddenApps: ['trash'], banner: null });
        await store.set('settings', '{broken');
        expect(await readSettings(store, HIDEABLE_APPS)).toEqual(DEFAULT_SETTINGS);
        expect(await readSettings(null, HIDEABLE_APPS)).toEqual(DEFAULT_SETTINGS);
    });
});

function call(handler: (req: NextApiRequest, res: NextApiResponse) => unknown, req: Partial<NextApiRequest>) {
    let status = 0; let body: unknown; const headers: Record<string, string> = {};
    const res = { status(c: number) { status = c; return this; }, json(d: unknown) { body = d; return this; }, setHeader(k: string, v: string) { headers[k.toLowerCase()] = v; return this; } } as unknown as NextApiResponse;
    return Promise.resolve(handler({ method: 'GET', query: {}, headers: {}, ...req } as unknown as NextApiRequest, res)).then(() => ({ status, body, headers }));
}

describe('settings API', () => {
    const SECRET = 's'.repeat(40);
    const SITE = { origin: 'https://xlibraries.com', host: 'xlibraries.com' };
    beforeEach(() => {
        vi.resetModules();
        vi.stubEnv('ADMIN_PASSCODE', 'p');
        vi.stubEnv('ADMIN_SESSION_SECRET', SECRET);
        vi.stubEnv('XLIB_MEMORY_STORE', '1');
    });
    afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
    const cookie = async () => `xlib_admin=${(await import('../../lib/admin-auth')).createSession(SECRET)}`;

    it('lets only the admin save, from this site, and serves the result publicly', async () => {
        const save = (await import('../../pages/api/admin/settings')).default;
        const pub = (await import('../../pages/api/settings')).default;
        const body = { hiddenApps: ['todoist'], banner: { text: 'Hello', tone: 'info' } };
        expect((await call(save, { method: 'POST', headers: SITE, body })).status).toBe(401);
        expect((await call(save, { method: 'POST', headers: { ...SITE, origin: 'https://evil.example', cookie: await cookie() }, body })).status).toBe(403);
        expect((await call(save, { method: 'POST', headers: { ...SITE, cookie: await cookie() }, body })).body).toEqual(body);
        const r = await call(pub, {});
        expect(r.body).toEqual(body);
        expect(r.headers['cache-control']).toContain('s-maxage');
    });

    it('opens and closes Photo Drop through the script', async () => {
        const fetch = vi.fn(async (_u: string, init: RequestInit) => ({ json: async () => ({ open: JSON.parse(init.body as string).open }) }));
        vi.stubGlobal('fetch', fetch);
        vi.stubEnv('PHOTO_DROP_ADMIN_KEY', 'k');
        const handler = (await import('../../pages/api/admin/photo-drop')).default;
        expect((await call(handler, { method: 'POST', headers: { ...SITE, cookie: await cookie() }, body: { open: false } })).body).toEqual({ open: false });
        expect(JSON.parse(fetch.mock.calls[0][1].body as string)).toEqual({ action: 'admin', adminKey: 'k', open: false });
        expect((await call(handler, { method: 'POST', headers: { ...SITE, cookie: await cookie() }, body: { open: 'yes' } })).status).toBe(400);
        expect((await call(handler, { method: 'POST', headers: { ...SITE, origin: 'https://evil.example', cookie: await cookie() }, body: { open: true } })).status).toBe(403);
    });
});
