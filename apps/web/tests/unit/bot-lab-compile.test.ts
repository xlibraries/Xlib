import { describe, expect, it, vi } from 'vitest';
import { memoryStore } from '@xlibraries/analytics/server';
import { BUILDS_PER_WINDOW, MAX_SKETCH, build, compilerConfig } from '../../lib/bot-lab-compile';

const HEX = ':100000000C9434000C943E000C943E000C943E0082\n:00000001FF\n';
const config = { url: 'https://compiler.example', secret: 's3cret' };
const ok = { ok: true, hex: HEX, size: 16, warnings: [] };

function service(reply: { status?: number; body?: unknown } = {}) {
    return vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => new Response(JSON.stringify(reply.body ?? ok), { status: reply.status ?? 200 }));
}

describe('compilerConfig', () => {
    it('needs both the URL and the secret', () => {
        expect(compilerConfig({ BOT_LAB_COMPILER_URL: 'https://c.run.app/', BOT_LAB_COMPILER_SECRET: ' x ' } as unknown as NodeJS.ProcessEnv)).toEqual({ url: 'https://c.run.app', secret: 'x' });
        expect(compilerConfig({ BOT_LAB_COMPILER_URL: 'https://c.run.app' } as unknown as NodeJS.ProcessEnv)).toBeNull();
        expect(compilerConfig({ BOT_LAB_COMPILER_URL: 'c.run.app', BOT_LAB_COMPILER_SECRET: 'x' } as unknown as NodeJS.ProcessEnv)).toBeNull();
    });
});

describe('build', () => {
    it('sends the sketch with the secret and returns the build', async () => {
        const fetch = service();
        const r = await build({ body: { sketch: 'void setup(){}' }, ip: '1.2.3.4', config, store: memoryStore(), fetch });
        expect(r).toEqual({ status: 200, body: ok });
        const [url, init] = fetch.mock.calls[0];
        expect(url).toBe('https://compiler.example/compile');
        expect((init!.headers as Record<string, string>).authorization).toBe('Bearer s3cret');
        expect(JSON.parse(String(init!.body))).toEqual({ sketch: 'void setup(){}', board: 'uno' });
    });

    it('serves the same sketch from the cache, errors included', async () => {
        const store = memoryStore();
        const fail = { ok: false, errors: [{ line: 3, column: 1, severity: 'error', message: 'nope' }] };
        const fetch = service({ body: fail });
        const first = await build({ body: { sketch: 'bad' }, ip: 'a', config, store, fetch });
        const second = await build({ body: { sketch: 'bad' }, ip: 'b', config, store, fetch });
        expect(first.body).toMatchObject({ ok: false, errors: [{ line: 3, message: 'nope' }] });
        expect(second.body).toEqual(first.body);
        expect(fetch).toHaveBeenCalledTimes(1);
        await build({ body: { sketch: 'bad ' }, ip: 'b', config, store, fetch });
        expect(fetch).toHaveBeenCalledTimes(2);
    });

    it('limits builds per visitor', async () => {
        const store = memoryStore();
        const fetch = service();
        for (let i = 0; i < BUILDS_PER_WINDOW; i++) expect((await build({ body: { sketch: `s${i}` }, ip: '9.9.9.9', config, store, fetch })).status).toBe(200);
        expect((await build({ body: { sketch: 'one more' }, ip: '9.9.9.9', config, store, fetch })).status).toBe(429);
        expect((await build({ body: { sketch: 'someone else' }, ip: '8.8.8.8', config, store, fetch })).status).toBe(200);
    });

    it('refuses bad requests before calling the service', async () => {
        const fetch = service();
        const store = memoryStore();
        expect((await build({ body: {}, ip: 'a', config, store, fetch })).status).toBe(400);
        expect((await build({ body: { sketch: '  ' }, ip: 'a', config, store, fetch })).status).toBe(400);
        expect((await build({ body: { sketch: 'x'.repeat(MAX_SKETCH + 1) }, ip: 'a', config, store, fetch })).status).toBe(413);
        expect((await build({ body: { sketch: 'x' }, ip: 'a', config: null, store, fetch })).status).toBe(503);
        expect(fetch).not.toHaveBeenCalled();
    });

    it('turns service trouble into clear errors, and never caches it', async () => {
        const store = memoryStore();
        const down = vi.fn(async () => { throw new TypeError('fetch failed'); });
        expect(await build({ body: { sketch: 'x' }, ip: 'a', config, store, fetch: down })).toEqual({ status: 502, body: { error: 'The compile service didn’t answer.' } });
        expect((await build({ body: { sketch: 'x' }, ip: 'a', config, store, fetch: service({ status: 429, body: { error: 'busy' } }) })).status).toBe(503);
        expect(await build({ body: { sketch: 'x' }, ip: 'a', config, store, fetch: service({ status: 400, body: { error: 'only libraries by name' } }) })).toEqual({ status: 400, body: { error: 'only libraries by name' } });
        expect((await build({ body: { sketch: 'x' }, ip: 'a', config, store, fetch: service({ status: 500, body: 'oops' }) })).status).toBe(502);
        expect((await build({ body: { sketch: 'x' }, ip: 'a', config, store, fetch: service({ body: { ok: true, hex: 'not hex' } }) })).status).toBe(502);
        const fetch = service();
        expect((await build({ body: { sketch: 'x' }, ip: 'a', config, store, fetch })).status).toBe(200);
        expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('works without a store (no limit, no cache)', async () => {
        const fetch = service();
        await build({ body: { sketch: 'x' }, ip: 'a', config, store: null, fetch });
        await build({ body: { sketch: 'x' }, ip: 'a', config, store: null, fetch });
        expect(fetch).toHaveBeenCalledTimes(2);
    });
});
