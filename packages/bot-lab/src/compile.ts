// Building Arduino sketches. The app doesn't compile anything itself: the site hands createBotLab a `Compiler`
// (on xlibraries.com, a call to /api/bot-lab/compile, which proxies to the arduino-compiler service).

export interface CompileMessage { line: number; column: number; severity: 'error' | 'warning' | 'note'; message: string }

export type CompileResult =
    | { ok: true; hex: string; size: number; warnings: CompileMessage[] }
    | { ok: false; errors: CompileMessage[]; log?: string };

/** Builds a sketch for the Uno. Rejects only when the build couldn't be attempted (offline, rate-limited…).
 *  Slow builds (a queued GitHub Actions run) report progress through `onStatus`. */
export type Compiler = (sketch: string, options?: { onStatus?(text: string): void }) => Promise<CompileResult>;

/** The Uno's flash, minus the bootloader */
export const UNO_FLASH = 32_256;

/** A short fingerprint of a sketch's text (FNV-1a), to tell whether a project's hex was built from what's in the editor. */
export function sketchHash(sketch: string): string {
    let h = 0x811c9dc5;
    for (let i = 0; i < sketch.length; i++) { h ^= sketch.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return h.toString(16).padStart(8, '0');
}

/** True when the project has a build and the sketch has been edited since. */
export function buildIsStale(code: { sketch: string; hex: string; builtFrom?: string }): boolean {
    return !!code.hex && code.builtFrom !== undefined && code.builtFrom !== sketchHash(code.sketch);
}

/** Checks a compile response's shape (it crosses the network), keeping only what the app uses. */
export function parseCompileResult(input: unknown): CompileResult | null {
    if (typeof input !== 'object' || input === null) return null;
    const r = input as Record<string, unknown>;
    const messages = (v: unknown): CompileMessage[] => (Array.isArray(v) ? v : []).flatMap((m) => {
        if (typeof m !== 'object' || m === null) return [];
        const x = m as Record<string, unknown>;
        const severity = x.severity === 'warning' || x.severity === 'note' ? x.severity : 'error';
        return typeof x.message === 'string' ? [{ line: Number(x.line) || 0, column: Number(x.column) || 0, severity, message: x.message.slice(0, 500) } as CompileMessage] : [];
    }).slice(0, 50);
    if (r.ok === true && typeof r.hex === 'string' && /^(:[0-9A-Fa-f]+\s*)+$/.test(r.hex)) return { ok: true, hex: r.hex, size: Number(r.size) || 0, warnings: messages(r.warnings) };
    if (r.ok === false) {
        const errors = messages(r.errors);
        return { ok: false, errors: errors.length ? errors : [{ line: 0, column: 0, severity: 'error', message: 'the build failed' }], log: typeof r.log === 'string' ? r.log.slice(-8000) : undefined };
    }
    return null;
}
