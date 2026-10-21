import { describe, expect, it } from 'vitest';
import { compose, parseGlslLog, wgslErrors } from '../src/playground/compose';
import { PRESETS } from '../src/playground/presets';

describe('compose', () => {
    it('wraps GLSL code with the uniforms and a main that calls mainImage', () => {
        const { source, offset } = compose('webgl2', 'void mainImage(out vec4 c, in vec2 p) { c = vec4(1.0); }');
        expect(source.startsWith('#version 300 es\n')).toBe(true);
        expect(source).toContain('uniform vec4 u_params[2];');
        expect(source).toContain('mainImage(c, gl_FragCoord.xy);');
        expect(source.split('\n')[offset]).toContain('void mainImage');   // your line 1 is right after the prelude
    });

    it('wraps WGSL code with the uniform struct and a fragment entry point', () => {
        const { source, offset } = compose('webgpu', 'fn mainImage(p: vec2f) -> vec4f { return vec4f(1.0); }');
        expect(source).toContain('@group(0) @binding(0) var<uniform> u: Params;');
        expect(source).toContain('@fragment fn main(');
        expect(source.split('\n')[offset]).toContain('fn mainImage');
    });
});

describe('error mapping', () => {
    it('maps WebGL log lines to your lines', () => {
        const log = "ERROR: 0:12: 'foo' : undeclared identifier\nERROR: 0:3: 'x' : syntax error\nERROR: compilation terminated\n";
        expect(parseGlslLog(log, 8)).toEqual([
            { line: 4, message: "'foo' : undeclared identifier" },
            { line: null, message: "'x' : syntax error" },   // inside the prelude
        ]);
    });

    it('keeps only WGSL errors, on your lines', () => {
        expect(wgslErrors([{ type: 'error', lineNum: 5, message: 'unresolved identifier' }, { type: 'warning', lineNum: 6, message: 'unused' }], 2))
            .toEqual([{ line: 3, message: 'unresolved identifier' }]);
    });
});

describe('presets', () => {
    it('come in both languages with the right entry point', () => {
        for (const p of PRESETS) {
            expect(p.glsl, p.id).toMatch(/void mainImage\(out vec4 fragColor, in vec2 fragCoord\)/);
            expect(p.wgsl, p.id).toMatch(/fn mainImage\(fragCoord: vec2f\) -> vec4f/);
        }
    });
});

import { tiltLean } from '../src/GameView';

describe('tiltLean', () => {
    it('leans by the tilt from where the phone was first held, clamped, flipped for the other landscape', () => {
        expect(tiltLean(null, null, false)).toBe(0);
        expect(tiltLean(30, 30, false)).toBe(0);
        expect(tiltLean(41, 30, false)).toBeCloseTo(0.5);
        expect(tiltLean(-60, 30, false)).toBe(-1);
        expect(tiltLean(41, 30, true)).toBeCloseTo(-0.5);
    });
});
