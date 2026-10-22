import { describe, expect, it } from 'vitest';
import { buildIsStale, parseCompileResult, sketchHash } from '../src/compile';
import { parseProject } from '../src/sim/project';
import { TEMPLATES } from '../src/templates';

const HEX = ':100000000C9434000C943E000C943E000C943E0082\n:00000001FF\n';

describe('sketch fingerprints', () => {
    it('are 8 hex digits, stable, and change with the text', () => {
        expect(sketchHash('void setup(){}')).toMatch(/^[0-9a-f]{8}$/);
        expect(sketchHash('void setup(){}')).toBe(sketchHash('void setup(){}'));
        expect(sketchHash('void setup(){}')).not.toBe(sketchHash('void setup(){ }'));
    });

    it('a build is stale once the sketch is edited; no build or no fingerprint is never stale', () => {
        const code = { sketch: 'a', hex: HEX, builtFrom: sketchHash('a') };
        expect(buildIsStale(code)).toBe(false);
        expect(buildIsStale({ ...code, sketch: 'b' })).toBe(true);
        expect(buildIsStale({ ...code, hex: '' })).toBe(false);
        expect(buildIsStale({ sketch: 'b', hex: HEX })).toBe(false);
    });

    it('every Uno template ships a build of its own sketch, and the fingerprint survives storage', () => {
        for (const t of TEMPLATES) {
            const p = t.build();
            if (!p.code.hex) continue;
            expect(buildIsStale(p.code)).toBe(false);
            expect(parseProject(JSON.parse(JSON.stringify(p))).code.builtFrom).toBe(p.code.builtFrom);
        }
        expect(parseProject({ code: { sketch: 'x', builtFrom: 'not-a-hash' } }).code.builtFrom).toBeUndefined();
    });
});

describe('compile responses', () => {
    it('accepts a build and an error list', () => {
        expect(parseCompileResult({ ok: true, hex: HEX, size: 16, warnings: [{ line: 3, column: 5, severity: 'warning', message: 'unused' }] }))
            .toEqual({ ok: true, hex: HEX, size: 16, warnings: [{ line: 3, column: 5, severity: 'warning', message: 'unused' }] });
        expect(parseCompileResult({ ok: false, errors: [{ line: 7, column: 3, severity: 'error', message: 'nope' }], log: 'x' }))
            .toEqual({ ok: false, errors: [{ line: 7, column: 3, severity: 'error', message: 'nope' }], log: 'x' });
    });

    it('a failure without messages still says it failed; junk is refused', () => {
        expect(parseCompileResult({ ok: false })).toEqual({ ok: false, errors: [{ line: 0, column: 0, severity: 'error', message: 'the build failed' }], log: undefined });
        expect(parseCompileResult({ ok: true, hex: '<script>' })).toBeNull();
        expect(parseCompileResult('nope')).toBeNull();
        expect(parseCompileResult(null)).toBeNull();
    });

    it('drops malformed messages and caps the list', () => {
        const errors = [{ message: 'kept' }, { line: 2 }, 'junk', ...Array.from({ length: 80 }, (_, i) => ({ line: i, message: `m${i}` }))];
        const r = parseCompileResult({ ok: false, errors });
        expect(r && !r.ok && r.errors[0]).toEqual({ line: 0, column: 0, severity: 'error', message: 'kept' });
        expect(r && !r.ok && r.errors.length).toBe(50);
    });
});
