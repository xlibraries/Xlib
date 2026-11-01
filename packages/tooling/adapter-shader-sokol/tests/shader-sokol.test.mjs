import { describe, expect, it } from 'vitest';
import { SLANGS, SOKOL_TOOLS_COMMIT, fingerprint, headerOf, inputs, name, outputs, shdcBinaryPath } from '../src/index.mjs';

describe('sokol-shdc', () => {
    it('knows where the pinned binary lives for each platform', () => {
        expect(shdcBinaryPath('darwin', 'arm64')).toBe('bin/osx_arm64/sokol-shdc');
        expect(shdcBinaryPath('linux', 'x64')).toBe('bin/linux/sokol-shdc');
        expect(shdcBinaryPath('win32', 'x64')).toBe('bin/win32/sokol-shdc.exe');
        expect(() => shdcBinaryPath('aix', 'ppc')).toThrow(/no sokol-shdc binary/);
    });

    it('writes each shader to a header on the build include path, for WebGL2 and WebGPU', () => {
        expect(headerOf('shaders/jyotirath.glsl')).toBe('build/gen/jyotirath.glsl.h');
        expect(SLANGS).toBe('glsl300es:wgsl');
    });

    it('as an adapter: its shaders in, their headers out, the pinned tool in its fingerprint', () => {
        const ctx = { root: '/pkg', name: 'fx', spec: { adapter: name, shaders: ['shaders/a.glsl'] } };
        expect(inputs(ctx)).toEqual([{ label: 'native/shaders/a.glsl', path: '/pkg/native/shaders/a.glsl' }]);
        expect(outputs(ctx)).toEqual(['build/gen/a.glsl.h']);
        expect(fingerprint(ctx)).toContain(`sokol-shdc ${SOKOL_TOOLS_COMMIT}`);
    });
});
