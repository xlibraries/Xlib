// The browser half of Bot Lab's builds: what apps.config.ts hands createBotLab as its `compile`.
import { parseCompileResult, type Compiler } from '@xlibraries/bot-lab';

export const compileSketch: Compiler = async (sketch) => {
    let res: Response;
    try {
        res = await fetch('/api/bot-lab/compile', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sketch }) });
    } catch {
        throw new Error('you seem to be offline');
    }
    const data: unknown = await res.json().catch(() => null);
    if (!res.ok) throw new Error((data as { error?: string } | null)?.error ?? `the server answered ${res.status}`);
    const result = parseCompileResult(data);
    if (!result) throw new Error('the server sent something unexpected');
    return result;
};
