// Bot Lab's Arduino builds, server side. Two ways to reach the compiler (services/arduino-compiler):
//
// - GitHub Actions (production): POST /api/bot-lab/compile stores the sketch under a random job id in Redis for a few
//   minutes and starts the bot-lab-compile workflow with that id (BOT_LAB_GITHUB_TOKEN, a token that may only run
//   workflows). The run fetches the sketch from /api/bot-lab/compile-job and posts the result back, both with
//   BOT_LAB_JOB_SECRET; the browser polls GET /api/bot-lab/compile?job=… meanwhile. Builds take about a minute.
// - A compile service (local development): BOT_LAB_COMPILER_URL + BOT_LAB_COMPILER_SECRET point at the image's HTTP
//   mode, and builds come back at once.
//
// Either way, builds are rate-limited per visitor (and, for Actions, overall) and cached by sketch: the same text
// always builds the same way, so templates and re-runs cost nothing.
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Store } from '@xlibraries/analytics/server';
import { parseCompileResult, type CompileResult } from '@xlibraries/bot-lab';

export const MAX_SKETCH = 64 * 1024;
export const BUILDS_PER_WINDOW = 30;
export const BUILD_WINDOW_SECONDS = 10 * 60;
/** All visitors together, per hour (each one is a GitHub Actions run) */
export const ACTIONS_BUILDS_PER_HOUR = 200;
export const CACHE_SECONDS = 7 * 24 * 3600;
/** How long a job may take before the browser is told it failed */
export const JOB_SECONDS = 4 * 60;
const SERVICE_TIMEOUT_MS = 55_000;
const REPO = 'xlibraries/Xlib';
const WORKFLOW = 'bot-lab-compile.yml';

export type CompilerConfig =
    | { kind: 'service'; url: string; secret: string }
    | { kind: 'actions'; token: string; jobSecret: string; ref: string };

/** How builds are done here, or null when neither way is set up. */
export function compilerConfig(env: NodeJS.ProcessEnv = process.env): CompilerConfig | null {
    const url = env.BOT_LAB_COMPILER_URL?.trim().replace(/\/+$/, ''), secret = env.BOT_LAB_COMPILER_SECRET?.trim();
    if (url && secret && /^https?:\/\//.test(url)) return { kind: 'service', url, secret };
    const token = env.BOT_LAB_GITHUB_TOKEN?.trim(), jobSecret = env.BOT_LAB_JOB_SECRET?.trim();
    if (token && jobSecret && jobSecret.length >= 32) return { kind: 'actions', token, jobSecret, ref: env.BOT_LAB_WORKFLOW_REF?.trim() || 'master' };
    return null;
}

/** A build's state as the browser sees it */
export type JobView = { state: 'queued' | 'running' } | { state: 'done'; result: CompileResult } | { state: 'failed'; error: string };

interface Job { state: 'queued' | 'running' | 'done'; sketch?: string; hash: string; created: number; result?: CompileResult }

export interface Response_ { status: number; body: CompileResult | JobView | { job: string } | { error: string } | { available: boolean } | { sketch: string; board: 'uno' } }

const sha = (text: string) => createHash('sha256').update(text).digest('hex');
const jobKey = (id: string) => `bl:job:${id}`;
const cacheKey = (hash: string) => `bl:build:${hash}`;
const VALID_JOB = /^[0-9a-f]{32}$/;

function safeJson(text: string | null | undefined): unknown {
    if (!text) return null;
    try { return JSON.parse(text); } catch { return null; }
}

async function limited(store: Store, key: string, max: number, seconds: number): Promise<boolean> {
    const n = await store.incr(key);
    if (n === 1) await store.expire(key, seconds);
    return n > max;
}

export interface StartRequest {
    body: unknown;
    ip: string;
    config: CompilerConfig | null;
    store: Store | null;
    fetch?: typeof fetch;
    now?: number;
}

/** POST /api/bot-lab/compile: a cached build, a build from the service, or a started job ({ job }, status 202). */
export async function startBuild({ body, ip, config, store, fetch: fetchImpl = fetch, now = Date.now() }: StartRequest): Promise<Response_> {
    if (!config) return { status: 503, body: { error: 'The compiler isn’t set up here.' } };
    if (config.kind === 'actions' && !store) return { status: 503, body: { error: 'The compiler needs the site’s store, which isn’t set up here.' } };
    const sketch = (body as { sketch?: unknown } | null)?.sketch;
    if (typeof sketch !== 'string' || !sketch.trim()) return { status: 400, body: { error: 'Send { sketch } with the sketch’s text.' } };
    if (Buffer.byteLength(sketch) > MAX_SKETCH) return { status: 413, body: { error: `Sketches are limited to ${MAX_SKETCH / 1024} KB.` } };

    const hash = sha(sketch);
    const cached = store ? parseCompileResult(safeJson(await store.get(cacheKey(hash)))) : null;
    if (cached) return { status: 200, body: cached };

    const secretForKeys = config.kind === 'service' ? config.secret : config.jobSecret;
    if (store && await limited(store, `rl:compile:${sha(`${ip}:${secretForKeys}`).slice(0, 24)}`, BUILDS_PER_WINDOW, BUILD_WINDOW_SECONDS)) {
        return { status: 429, body: { error: 'That’s a lot of builds: try again in a few minutes.' } };
    }
    if (config.kind === 'service') return buildWithService(config, sketch, hash, store, fetchImpl);

    if (await limited(store!, `rl:compile:all:${Math.floor(now / 3_600_000)}`, ACTIONS_BUILDS_PER_HOUR, 3600)) {
        return { status: 429, body: { error: 'The compiler has had a busy hour: try again later.' } };
    }
    const id = randomBytes(16).toString('hex');
    const job: Job = { state: 'queued', sketch, hash, created: now };
    await store!.set(jobKey(id), JSON.stringify(job));
    await store!.expire(jobKey(id), JOB_SECONDS + 300);
    let res: Response;
    try {
        res = await fetchImpl(`https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW}/dispatches`, {
            method: 'POST',
            headers: { authorization: `Bearer ${config.token}`, accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28', 'content-type': 'application/json', 'user-agent': 'xlibraries-bot-lab' },
            body: JSON.stringify({ ref: config.ref, inputs: { job: id } }),
        });
    } catch {
        return { status: 502, body: { error: 'Couldn’t reach GitHub to start the build.' } };
    }
    if (res.status !== 204) return { status: 502, body: { error: `GitHub refused to start the build (${res.status}).` } };
    return { status: 202, body: { job: id } };
}

async function buildWithService(config: Extract<CompilerConfig, { kind: 'service' }>, sketch: string, hash: string, store: Store | null, fetchImpl: typeof fetch): Promise<Response_> {
    let res: Response;
    try {
        res = await fetchImpl(`${config.url}/compile`, {
            method: 'POST',
            headers: { authorization: `Bearer ${config.secret}`, 'content-type': 'application/json' },
            body: JSON.stringify({ sketch, board: 'uno' }),
            signal: AbortSignal.timeout(SERVICE_TIMEOUT_MS),
        });
    } catch {
        return { status: 502, body: { error: 'The compile service didn’t answer.' } };
    }
    if (res.status === 429) return { status: 503, body: { error: 'The compiler is busy: try again in a moment.' } };
    if (res.status === 400 || res.status === 413) {
        const data = safeJson(await res.text()) as { error?: unknown } | null;
        return { status: res.status, body: { error: typeof data?.error === 'string' ? data.error : 'The sketch was refused.' } };
    }
    const result = res.ok ? parseCompileResult(safeJson(await res.text())) : null;
    if (!result) return { status: 502, body: { error: 'The compile service failed.' } };
    if (store) await remember(store, hash, result);
    return { status: 200, body: result };
}

async function remember(store: Store, hash: string, result: CompileResult) {
    await store.set(cacheKey(hash), JSON.stringify(result));
    await store.expire(cacheKey(hash), CACHE_SECONDS);
}

async function readJob(store: Store, id: string): Promise<Job | null> {
    if (!VALID_JOB.test(id)) return null;
    const job = safeJson(await store.get(jobKey(id))) as Job | null;
    return job && typeof job.hash === 'string' ? job : null;
}

/** GET /api/bot-lab/compile?job=…: where a build is. */
export async function jobStatus(store: Store | null, id: string, now = Date.now()): Promise<Response_> {
    if (!store) return { status: 503, body: { error: 'No store.' } };
    const job = await readJob(store, id);
    if (!job) return { status: 404, body: { state: 'failed', error: 'That build is unknown or expired: build again.' } };
    if (job.state === 'done' && job.result) return { status: 200, body: { state: 'done', result: job.result } };
    if (now - job.created > JOB_SECONDS * 1000) return { status: 200, body: { state: 'failed', error: 'The build didn’t finish in time: build again.' } };
    return { status: 200, body: { state: job.state === 'running' ? 'running' : 'queued' } };
}

/** GET /api/bot-lab/compile: whether this site can build at all (the editor hides Build otherwise). */
export function availability(config: CompilerConfig | null, store: Store | null): Response_ {
    return { status: 200, body: { available: !!config && (config.kind === 'service' || !!store) } };
}

function authorized(config: CompilerConfig | null, header: string | undefined): config is Extract<CompilerConfig, { kind: 'actions' }> {
    if (config?.kind !== 'actions' || !header) return false;
    const given = Buffer.from(header), expected = Buffer.from(`Bearer ${config.jobSecret}`);
    return given.length === expected.length && timingSafeEqual(given, expected);
}

/** GET /api/bot-lab/compile-job?id=… (the workflow): the sketch to build. */
export async function claimJob(config: CompilerConfig | null, store: Store | null, auth: string | undefined, id: string): Promise<Response_> {
    if (!authorized(config, auth)) return { status: 401, body: { error: 'unauthorized' } };
    if (!store) return { status: 503, body: { error: 'No store.' } };
    const job = await readJob(store, id);
    if (!job || job.state === 'done' || job.sketch === undefined) return { status: 404, body: { error: 'no such job' } };
    await store.set(jobKey(id), JSON.stringify({ ...job, state: 'running' }));
    await store.expire(jobKey(id), JOB_SECONDS + 300);
    return { status: 200, body: { sketch: job.sketch, board: 'uno' } };
}

/** POST /api/bot-lab/compile-job?id=… (the workflow): the build's result. The sketch is dropped once it's built. */
export async function finishJob(config: CompilerConfig | null, store: Store | null, auth: string | undefined, id: string, body: unknown): Promise<Response_> {
    if (!authorized(config, auth)) return { status: 401, body: { error: 'unauthorized' } };
    if (!store) return { status: 503, body: { error: 'No store.' } };
    const job = await readJob(store, id);
    if (!job || job.state === 'done') return { status: 404, body: { error: 'no such job' } };
    const result = parseCompileResult(body);
    if (!result) return { status: 400, body: { error: 'not a build result' } };
    const done: Job = { state: 'done', hash: job.hash, created: job.created, result };
    await store.set(jobKey(id), JSON.stringify(done));
    await store.expire(jobKey(id), 600);
    await remember(store, job.hash, result);
    return { status: 200, body: { state: 'done', result } };
}
