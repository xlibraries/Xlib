import { afterEach, describe, expect, it, vi } from 'vitest';
import { memoryStore } from '@xlibraries/analytics/server';
import {
    ACTIONS_BUILDS_PER_HOUR, BUILDS_PER_WINDOW, JOB_SECONDS, MAX_SKETCH,
    availability, claimJob, compilerConfig, finishJob, jobStatus, startBuild, type CompilerConfig,
} from '../../lib/bot-lab-compile';

const HEX = ':100000000C9434000C943E000C943E000C943E0082\n:00000001FF\n';
const ok = { ok: true, hex: HEX, size: 16, warnings: [] };
const service: CompilerConfig = { kind: 'service', url: 'https://compiler.example', secret: 's3cret' };
const JOB_SECRET = 'j'.repeat(40);
const actions: CompilerConfig = { kind: 'actions', token: 'ghp_token', jobSecret: JOB_SECRET, ref: 'master' };
const auth = `Bearer ${JOB_SECRET}`;
const env = (vars: Record<string, string>) => vars as unknown as NodeJS.ProcessEnv;

function replying(reply: { status?: number; body?: unknown } = {}) {
    return vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => new Response(reply.status === 204 ? null : JSON.stringify(reply.body ?? ok), { status: reply.status ?? 200 }));
}

describe('compilerConfig', () => {
    it('prefers a compile service, else GitHub Actions, else nothing', () => {
        expect(compilerConfig(env({ BOT_LAB_COMPILER_URL: 'http://localhost:8080/', BOT_LAB_COMPILER_SECRET: 'dev', BOT_LAB_GITHUB_TOKEN: 't', BOT_LAB_JOB_SECRET: JOB_SECRET }))).toEqual({ kind: 'service', url: 'http://localhost:8080', secret: 'dev' });
        expect(compilerConfig(env({ BOT_LAB_GITHUB_TOKEN: ' t ', BOT_LAB_JOB_SECRET: JOB_SECRET }))).toEqual({ kind: 'actions', token: 't', jobSecret: JOB_SECRET, ref: 'master' });
        expect(compilerConfig(env({ BOT_LAB_GITHUB_TOKEN: 't', BOT_LAB_JOB_SECRET: 'short' }))).toBeNull();
        expect(compilerConfig(env({ BOT_LAB_COMPILER_URL: 'compiler.example', BOT_LAB_COMPILER_SECRET: 'x' }))).toBeNull();
        expect(compilerConfig(env({}))).toBeNull();
    });

    it('availability: Actions also needs the store', () => {
        expect(availability(actions, memoryStore()).body).toEqual({ available: true });
        expect(availability(actions, null).body).toEqual({ available: false });
        expect(availability(service, null).body).toEqual({ available: true });
        expect(availability(null, memoryStore()).body).toEqual({ available: false });
    });
});

describe('builds through a compile service', () => {
    it('sends the sketch with the secret, then serves the same sketch from the cache', async () => {
        const store = memoryStore(), fetch = replying();
        expect(await startBuild({ body: { sketch: 'void setup(){}' }, ip: 'a', config: service, store, fetch })).toEqual({ status: 200, body: ok });
        expect(await startBuild({ body: { sketch: 'void setup(){}' }, ip: 'b', config: service, store, fetch })).toEqual({ status: 200, body: ok });
        expect(fetch).toHaveBeenCalledTimes(1);
        const [url, init] = fetch.mock.calls[0];
        expect(url).toBe('https://compiler.example/compile');
        expect((init!.headers as Record<string, string>).authorization).toBe('Bearer s3cret');
    });

    it('turns service trouble into clear errors', async () => {
        const store = memoryStore();
        expect((await startBuild({ body: { sketch: 'x' }, ip: 'a', config: service, store, fetch: vi.fn(async () => { throw new TypeError('down'); }) })).status).toBe(502);
        expect(await startBuild({ body: { sketch: 'x' }, ip: 'a', config: service, store, fetch: replying({ status: 400, body: { error: 'only libraries by name' } }) })).toEqual({ status: 400, body: { error: 'only libraries by name' } });
        expect((await startBuild({ body: { sketch: 'x' }, ip: 'a', config: service, store, fetch: replying({ body: { ok: true, hex: 'nope' } }) })).status).toBe(502);
    });
});

describe('requests', () => {
    it('are checked before anything is called, and limited per visitor', async () => {
        const store = memoryStore(), fetch = replying();
        expect((await startBuild({ body: {}, ip: 'a', config: service, store, fetch })).status).toBe(400);
        expect((await startBuild({ body: { sketch: 'x'.repeat(MAX_SKETCH + 1) }, ip: 'a', config: service, store, fetch })).status).toBe(413);
        expect((await startBuild({ body: { sketch: 'x' }, ip: 'a', config: null, store, fetch })).status).toBe(503);
        expect((await startBuild({ body: { sketch: 'x' }, ip: 'a', config: actions, store: null, fetch })).status).toBe(503);
        expect(fetch).not.toHaveBeenCalled();
        for (let i = 0; i < BUILDS_PER_WINDOW; i++) expect((await startBuild({ body: { sketch: `s${i}` }, ip: '9', config: service, store, fetch })).status).toBe(200);
        expect((await startBuild({ body: { sketch: 'more' }, ip: '9', config: service, store, fetch })).status).toBe(429);
        expect((await startBuild({ body: { sketch: 'more' }, ip: '8', config: service, store, fetch })).status).toBe(200);
    });
});

describe('builds on GitHub Actions', () => {
    it('start the workflow with a job id; the run claims the sketch, posts the result; the browser sees it; the cache keeps it', async () => {
        const store = memoryStore(), fetch = replying({ status: 204 });
        const started = await startBuild({ body: { sketch: 'void setup(){}' }, ip: 'a', config: actions, store, fetch, now: 1000 });
        expect(started.status).toBe(202);
        const job = (started.body as { job: string }).job;
        expect(job).toMatch(/^[0-9a-f]{32}$/);
        const [url, init] = fetch.mock.calls[0];
        expect(url).toBe('https://api.github.com/repos/xlibraries/Xlib/actions/workflows/bot-lab-compile.yml/dispatches');
        expect((init!.headers as Record<string, string>).authorization).toBe('Bearer ghp_token');
        expect(JSON.parse(String(init!.body))).toEqual({ ref: 'master', inputs: { job } });   // the sketch isn't sent to GitHub

        expect((await jobStatus(store, job, 2000)).body).toEqual({ state: 'queued' });
        expect(await claimJob(actions, store, auth, job)).toEqual({ status: 200, body: { sketch: 'void setup(){}', board: 'uno' } });
        expect((await jobStatus(store, job, 3000)).body).toEqual({ state: 'running' });
        expect((await finishJob(actions, store, auth, job, ok)).status).toBe(200);
        expect((await jobStatus(store, job, 4000)).body).toEqual({ state: 'done', result: ok });
        expect((await claimJob(actions, store, auth, job)).status).toBe(404);    // done: the sketch is gone
        expect((await finishJob(actions, store, auth, job, ok)).status).toBe(404);

        expect(await startBuild({ body: { sketch: 'void setup(){}' }, ip: 'b', config: actions, store, fetch })).toEqual({ status: 200, body: ok });
        expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('the job endpoints need the job secret, a valid id and a real result', async () => {
        const store = memoryStore();
        const job = ((await startBuild({ body: { sketch: 'x' }, ip: 'a', config: actions, store, fetch: replying({ status: 204 }) })).body as { job: string }).job;
        expect((await claimJob(actions, store, 'Bearer wrong', job)).status).toBe(401);
        expect((await claimJob(actions, store, undefined, job)).status).toBe(401);
        expect((await claimJob(service, store, auth, job)).status).toBe(401);
        expect((await claimJob(actions, store, auth, 'not-an-id')).status).toBe(404);
        expect((await finishJob(actions, store, 'Bearer wrong', job, ok)).status).toBe(401);
        expect((await finishJob(actions, store, auth, job, { ok: true, hex: '<b>' })).status).toBe(400);
        expect((await jobStatus(store, 'f'.repeat(32))).status).toBe(404);
    });

    it('a job that never finishes fails after the deadline, and GitHub refusing is reported', async () => {
        const store = memoryStore();
        const job = ((await startBuild({ body: { sketch: 'x' }, ip: 'a', config: actions, store, fetch: replying({ status: 204 }), now: 0 })).body as { job: string }).job;
        expect((await jobStatus(store, job, JOB_SECONDS * 1000 + 1)).body).toMatchObject({ state: 'failed' });
        expect(await startBuild({ body: { sketch: 'y' }, ip: 'a', config: actions, store, fetch: replying({ status: 404, body: {} }) })).toEqual({ status: 502, body: { error: 'GitHub refused to start the build (404).' } });
    });

    it('all visitors together are limited per hour', async () => {
        const store = memoryStore(), fetch = replying({ status: 204 });
        const now = 7 * 3_600_000;
        for (let i = 0; i < ACTIONS_BUILDS_PER_HOUR; i++) await startBuild({ body: { sketch: `s${i}` }, ip: `ip${i}`, config: actions, store, fetch, now });
        expect((await startBuild({ body: { sketch: 'one more' }, ip: 'new', config: actions, store, fetch, now })).status).toBe(429);
        expect((await startBuild({ body: { sketch: 'next hour' }, ip: 'new', config: actions, store, fetch, now: now + 3_600_000 })).status).toBe(202);
    });
});

describe('the browser client', () => {
    afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

    it('returns a build at once, or polls a job until it is done, reporting progress', async () => {
        vi.useFakeTimers();
        const { compileSketch } = await import('../../lib/bot-lab-client');
        const replies = [
            new Response(JSON.stringify({ job: 'a'.repeat(32) }), { status: 202 }),
            new Response(JSON.stringify({ state: 'queued' })),
            new Response(JSON.stringify({ state: 'running' })),
            new Response(JSON.stringify({ state: 'done', result: ok })),
        ];
        const fetch = vi.fn(async () => replies.shift()!);
        vi.stubGlobal('fetch', fetch);
        const statuses: string[] = [];
        const result = compileSketch('void setup(){}', { onStatus: s => statuses.push(s) });
        await vi.advanceTimersByTimeAsync(7000);
        expect(await result).toEqual(ok);
        expect(statuses[0]).toBe('Queued on GitHub Actions…');
        expect(statuses.some(s => s.startsWith('Compiling'))).toBe(true);
        expect((fetch.mock.calls as unknown as [string][]).map(c => c[0])).toEqual(['/api/bot-lab/compile', ...Array(3).fill(`/api/bot-lab/compile?job=${'a'.repeat(32)}`)]);
    });

    it('a failed job or a refused request becomes an error', async () => {
        vi.useFakeTimers();
        const { compileSketch } = await import('../../lib/bot-lab-client');
        vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'That’s a lot of builds' }), { status: 429 })));
        await expect(compileSketch('x')).rejects.toThrow('That’s a lot of builds');
        const replies = [new Response(JSON.stringify({ job: 'b'.repeat(32) }), { status: 202 }), new Response(JSON.stringify({ state: 'failed', error: 'The build didn’t finish in time' }))];
        vi.stubGlobal('fetch', vi.fn(async () => replies.shift()!));
        const result = compileSketch('x');
        const check = expect(result).rejects.toThrow('didn’t finish in time');
        await vi.advanceTimersByTimeAsync(3000);
        await check;
    });
});
