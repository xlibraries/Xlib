// The browser half of Bot Lab's builds: what apps.config.ts hands createBotLab. A build either comes back at once
// (cached, or a compile service) or as a job that runs on GitHub Actions, which is polled until it's done.
import { parseCompileResult, type CompileResult, type Compiler } from '@xlibraries/bot-lab';

const POLL_MS = 2000;
const GIVE_UP_MS = 5 * 60_000;

async function call(input: string, init?: RequestInit): Promise<{ res: Response; data: unknown }> {
    let res: Response;
    try { res = await fetch(input, init); } catch { throw new Error('you seem to be offline'); }
    return { res, data: await res.json().catch(() => null) };
}

const errorOf = (data: unknown, status: number) => (data as { error?: string } | null)?.error ?? `the server answered ${status}`;
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const compileSketch: Compiler = async (sketch, options = {}) => {
    const { res, data } = await call('/api/bot-lab/compile', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sketch }) });
    if (res.status === 202) return waitFor(String((data as { job?: unknown }).job), options.onStatus);
    if (!res.ok) throw new Error(errorOf(data, res.status));
    return result(data);
};

async function waitFor(job: string, onStatus?: (text: string) => void): Promise<CompileResult> {
    const started = Date.now();
    onStatus?.('Queued on GitHub Actions…');
    while (Date.now() - started < GIVE_UP_MS) {
        await sleep(POLL_MS);
        const { res, data } = await call(`/api/bot-lab/compile?job=${encodeURIComponent(job)}`);
        const view = data as { state?: string; result?: unknown; error?: string } | null;
        if (!res.ok && view?.state !== 'failed') throw new Error(errorOf(data, res.status));
        if (view?.state === 'done') return result(view.result);
        if (view?.state === 'failed') throw new Error(view.error ?? 'the build failed');
        const seconds = Math.round((Date.now() - started) / 1000);
        onStatus?.(view?.state === 'running' ? `Compiling… ${seconds} s` : `Queued on GitHub Actions… ${seconds} s`);
    }
    throw new Error('the build took too long');
}

function result(data: unknown): CompileResult {
    const r = parseCompileResult(data);
    if (!r) throw new Error('the server sent something unexpected');
    return r;
}

/** Whether this site can build sketches (the editor hides Build otherwise). */
export async function compilerAvailable(): Promise<boolean> {
    try {
        const res = await fetch('/api/bot-lab/compile');
        return res.ok && ((await res.json()) as { available?: boolean }).available === true;
    } catch {
        return false;
    }
}
