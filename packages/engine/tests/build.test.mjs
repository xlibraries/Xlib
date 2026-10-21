import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { BACKENDS, ENGINE_ROOT, JOLT_DEFINES, emArgs, includeFlags, joltSources, shdcBinaryPath, sourceFiles, sourcesHash } from '../scripts/build.mjs';

const MODULES = {
    plain: { sources: ['games/plain/main.cpp'], shaders: [] },
    hud: { sources: ['games/hud/main.cpp'], shaders: ['shaders/hud.glsl'], text: true, fonts: ['LilitaOne-Regular.ttf'], flags: ['-sEXPORTED_FUNCTIONS=_main'] },
    world: { sources: ['world/main.cpp'], shaders: [], physics: true },
};
const ROOT = '/tmp/consumer';

describe('build pipeline', () => {
    it('builds each backend with the right sokol define, the engine on the include path, and no eval', () => {
        const gl = emArgs(ROOT, MODULES, 'plain', 'webgl2'), gpu = emArgs(ROOT, MODULES, 'plain', 'webgpu');
        expect(gl).toContain('-DSOKOL_GLES3');
        expect(gpu).toContain('-DSOKOL_WGPU');
        for (const args of [gl, gpu]) {
            expect(args).toContain('-sDYNAMIC_EXECUTION=0');
            expect(args).toContain(`-I${join(ENGINE_ROOT, 'native/runtime')}`);
            expect(args).toContain(`-ffile-prefix-map=${ROOT}=.`);
            expect(args.slice(-2)).toEqual(['-o', `dist/plain/${args.includes('-DSOKOL_WGPU') ? 'webgpu' : 'webgl2'}.js`]);
        }
        expect(BACKENDS).toEqual(['webgpu', 'webgl2']);
        expect(() => emArgs(ROOT, MODULES, 'nope', 'webgl2')).toThrow(/unknown module/);
        expect(() => emArgs(ROOT, MODULES, 'plain', 'metal')).toThrow(/unknown backend/);
    });

    it('links the text renderer and embeds engine fonts only for modules that ask', () => {
        const plain = emArgs(ROOT, MODULES, 'plain', 'webgl2').join(' '), hud = emArgs(ROOT, MODULES, 'hud', 'webgl2').join(' ');
        expect(plain).not.toContain('xl_font.cpp');
        expect(hud).toContain('xl_font.cpp');
        expect(hud).toContain(`--embed-file ${join(ENGINE_ROOT, 'native/fonts/LilitaOne-Regular.ttf')}@/LilitaOne-Regular.ttf`);
        expect(hud).toContain('-sEXPORTED_FUNCTIONS=_main');
        expect(includeFlags(ROOT)).toContain(`-ffile-prefix-map=${ENGINE_ROOT}=engine`);
    });

    it('links Jolt and xl_physics only for modules with physics, with deterministic, RTTI-free defines', () => {
        const plain = emArgs(ROOT, MODULES, 'plain', 'webgl2').join(' '), world = emArgs(ROOT, MODULES, 'world', 'webgpu', ['/obj/jolt_a.o']).join(' ');
        expect(plain).not.toContain('xl_physics.cpp');
        expect(plain).not.toContain('JPH_');
        expect(world).toContain('xl_physics.cpp');
        expect(world).toContain('/obj/jolt_a.o');
        for (const d of JOLT_DEFINES) expect(world).toContain(d);
        expect(JOLT_DEFINES).toContain('-DJPH_CROSS_PLATFORM_DETERMINISTIC');
        expect(world).toContain(`-isystem${join(ENGINE_ROOT, 'third_party/jolt')}`);
        const sources = joltSources();
        expect(sources.length).toBeGreaterThan(140);
        expect(sources).toContain('third_party/jolt/Jolt/RegisterTypes.cpp');
        expect(sources).toContain('third_party/jolt/Jolt/ObjectStream/SerializableObject.cpp');   // RTTI tables, needed even without ObjectStream
        expect(sources.every(s => s.endsWith('.cpp'))).toBe(true);
    });

    it('hashes the engine sources into every consumer stamp, and its inputs exist', () => {
        const files = sourceFiles(ROOT).map(([label]) => label);
        expect(files).toContain('engine/native/runtime/xl.h');
        expect(files).toContain('engine/native/runtime/xl-audio-worklet.js');
        expect(files).toContain('engine/native/fonts/LilitaOne-Regular.ttf');
        expect(files).toContain('engine/third_party/sokol/sokol_gfx.h');
        expect(files).toContain('engine/third_party/jolt/Jolt/Jolt.h');
        expect(files).toContain('engine/scripts/build.mjs');
        expect(sourcesHash(ROOT)).toMatch(/^[0-9a-f]{64}$/);
        expect(existsSync(join(ENGINE_ROOT, 'tests/native/main.cpp'))).toBe(true);
    });

    it('knows where sokol-shdc lives for each platform', () => {
        expect(shdcBinaryPath('darwin', 'arm64')).toBe('bin/osx_arm64/sokol-shdc');
        expect(shdcBinaryPath('linux', 'x64')).toBe('bin/linux/sokol-shdc');
        expect(() => shdcBinaryPath('aix', 'ppc')).toThrow();
    });
});
