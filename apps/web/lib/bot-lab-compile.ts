// Bot Lab's Arduino builds, server side: /api/bot-lab/compile hands sketches to the arduino-compiler service
// (services/arduino-compiler, on Cloud Run) with its shared secret, which never reaches the browser. Builds are
// rate-limited per visitor and cached by sketch (the same text always builds the same way, so templates and
// re-runs cost nothing).
import { createHash } from 'node:crypto';
import type { Store } from '@xlibraries/analytics/server';
import { parseCompileResult, type CompileResult } from '@xlibraries/bot-lab';

export const MAX_SKETCH = 64 * 1024;
export const BUILDS_PER_WINDOW = 30;
export const BUILD_WINDOW_SECONDS = 10 * 60;
export const CACHE_SECONDS = 7 * 24 * 3600;
const TIMEOUT_MS = 60_000;

export interface CompilerConfig { url: string; secret: string }

/** The service's address and secret (BOT_LAB_COMPILER_URL, BOT_LAB_COMPILER_SECRET), or null when it isn't set up. */
export function compilerConfig(env: NodeJS.ProcessEnv = process.env): CompilerConfig | null {
    const url = env.BOT_LAB_COMPILER_URL?.trim().replace(/\/+$/, ''), secret = env.BOT_LAB_COMPILER_SECRET?.trim();
    return url && secret && /^https?:\/\//.test(url) ? { url, secret } : null;
}

export interface BuildRequest {
    body: unknown;
    ip: string;
    config: CompilerConfig | null;
    store: Store | null;
    fetch?: typeof fetch;
}

export interface BuildResponse { status: number; body: CompileResult | { error: string } }

const sha = (text: string) => createHash('sha256').update(text).digest('hex');

export async function build({ body, ip, config, store, fetch: fetchImpl = fetch }: BuildRequest): Promise<BuildResponse> {
    if (!config) return { status: 503, body: { error: 'The compile service isn’t set up yet.' } };
    const sketch = (body as { sketch?: unknown } | null)?.sketch;
    if (typeof sketch !== 'string' || !sketch.trim()) return { status: 400, body: { error: 'Send { sketch } with the sketch’s text.' } };
    if (Buffer.byteLength(sketch) > MAX_SKETCH) return { status: 413, body: { error: `Sketches are limited to ${MAX_SKETCH / 1024} KB.` } };

    if (store) {
        const rl = `rl:compile:${sha(`${ip}:${config.secret}`).slice(0, 24)}`;
        const builds = await store.incr(rl);
        if (builds === 1) await store.expire(rl, BUILD_WINDOW_SECONDS);
        if (builds > BUILDS_PER_WINDOW) return { status: 429, body: { error: 'That’s a lot of builds: try again in a few minutes.' } };
    }
    const cacheKey = `bl:build:${sha(sketch)}`;
    const cached = store ? parseCompileResult(safeJson(await store.get(cacheKey))) : null;
    if (cached) return { status: 200, body: cached };

    let res: Response;
    try {
        res = await fetchImpl(`${config.url}/compile`, {
            method: 'POST',
            headers: { authorization: `Bearer ${config.secret}`, 'content-type': 'application/json' },
            body: JSON.stringify({ sketch, board: 'uno' }),
            signal: AbortSignal.timeout(TIMEOUT_MS),
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
    if (store) { await store.set(cacheKey, JSON.stringify(result)); await store.expire(cacheKey, CACHE_SECONDS); }
    return { status: 200, body: result };
}

function safeJson(text: string | null): unknown {
    if (!text) return null;
    try { return JSON.parse(text); } catch { return null; }
}
