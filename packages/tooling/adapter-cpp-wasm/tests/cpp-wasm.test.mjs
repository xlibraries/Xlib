import { afterAll, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { BACKENDS, EMSCRIPTEN_VERSION, emArgs, fingerprint, headlessArgs, includeClosure, inputs, outputs } from '../src/index.mjs';

const roots = [];
afterAll(() => { for (const r of roots) rmSync(r, { recursive: true, force: true }); });

/** A consumer and a provider on disk; returns a context for one of the consumer's modules. */
function setup() {
    const base = mkdtempSync(join(tmpdir(), 'cpp-wasm-'));
    roots.push(base);
    const write = (path, body = '') => { mkdirSync(dirname(join(base, path)), { recursive: true }); writeFileSync(join(base, path), body); };
    write('game/native/games/a/main.cpp', '#include "logic.h"\n#include "xl.h"\n#include <vector>\n#include "a.glsl.h"\n');
    write('game/native/games/a/logic.h', '#pragma once\n#include "shared/util.h"\n');
    write('game/native/shared/util.h', '#pragma once\n');
    write('game/native/games/b/main.cpp', '#include "xl.h"\n');
    write('game/native/shaders/a.glsl', '@vs vs\n@end\n');
    write('game/native/games/a/assets/song.mp3', 'la');
    write('engine/runtime/xl.h', '#pragma once\n#include "xl_color.h"\n');
    write('engine/runtime/xl_color.h', '#pragma once\n');
    write('engine/runtime/xl_font.cpp', '#include "xl.h"\n#include "stb_truetype.h"\n');
    write('engine/runtime/xl_physics.cpp', '#include <Jolt/Jolt.h>\n');
    write('engine/vendor/stb_truetype.h', '#pragma once\n');
    write('engine/jolt/Jolt/Jolt.h', '#pragma once\n#include "Core/Core.h"\n');
    write('engine/jolt/Jolt/Core/Core.h', '#pragma once\n');
    write('engine/jolt/Jolt/World.cpp', '#include <Jolt/Jolt.h>\n');
    write('engine/fonts/Hand.ttf', 'font');
    write('engine/runtime/worklet.js', '');
    const core = { root: join(base, 'engine'), name: '@s/core', version: '1.0.0', native: { prefix: 'core', include: ['runtime', 'vendor'], fonts: 'fonts', assets: ['runtime/worklet.js'] } };
    const text = { root: join(base, 'engine'), name: '@s/text', version: '1.0.0', native: { prefix: 'text', link: ['runtime/xl_font.cpp'] } };
    const physics = { root: join(base, 'engine'), name: '@s/physics', version: '1.0.0', native: { prefix: 'physics', link: ['runtime/xl_physics.cpp'], libraries: { jolt: { sources: 'jolt/Jolt', isystem: ['jolt'], defines: ['-DJOLT'] } } } };
    const all = { core, text, physics };
    const root = join(base, 'game');
    /** A module using `uses` (names in `all`; core by default). */
    return (name, spec, uses = ['core']) => ({ root, name, spec: { adapter: 'cpp-wasm', uses: uses.map((u) => all[u].name), ...spec }, providers: uses.map((u) => all[u]), pkg: {} });
}

describe('em++ arguments', () => {
    const ctx = setup();
    const plain = ctx('a', { sources: ['games/a/main.cpp'], shaders: ['shaders/a.glsl'] });

    it('builds each backend with its sokol define, the providers on the include path, mapped paths and no eval', () => {
        const gl = emArgs(plain, 'webgl2'), gpu = emArgs(plain, 'webgpu');
        expect(gl).toContain('-DSOKOL_GLES3');
        expect(gpu).toContain('-DSOKOL_WGPU');
        for (const args of [gl, gpu]) {
            expect(args).toContain('-sDYNAMIC_EXECUTION=0');
            expect(args).toContain(`-I${join(plain.providers[0].root, 'runtime')}`);
            expect(args).toContain(`-ffile-prefix-map=${plain.providers[0].root}=core`);
            expect(args).toContain(`-ffile-prefix-map=${plain.root}=.`);
        }
        expect(gl.slice(-2)).toEqual(['-o', 'dist/a/webgl2.js']);
        expect(BACKENDS).toEqual(['webgpu', 'webgl2']);
        expect(() => emArgs(plain, 'metal')).toThrow(/unknown backend/);
        expect(outputs(plain)).toEqual(['dist/a/webgpu.js', 'dist/a/webgpu.wasm', 'dist/a/webgl2.js', 'dist/a/webgl2.wasm']);
    });

    it('links what a module uses, and embeds a font only when asked, with a library and its defines', () => {
        const hud = ctx('a', { sources: ['games/a/main.cpp'], fonts: ['Hand.ttf'] }, ['core', 'text']);
        const world = ctx('w', { sources: ['games/b/main.cpp'] }, ['core', 'physics']);
        expect(emArgs(plain, 'webgl2').join(' ')).not.toMatch(/xl_font|xl_physics|JOLT|embed-file/);
        expect(emArgs(hud, 'webgl2').join(' ')).toContain('xl_font.cpp');
        expect(emArgs(hud, 'webgl2').join(' ')).toContain(`--embed-file ${join(hud.providers[0].root, 'fonts/Hand.ttf')}@/Hand.ttf`);
        const args = emArgs(world, 'webgpu', ['/obj/jolt_World.o']).join(' ');
        expect(args).toContain('xl_physics.cpp');
        expect(args).toContain(`-isystem${join(world.providers[0].root, 'jolt')}`);
        expect(args).toContain('-DJOLT');
        expect(args).toContain('/obj/jolt_World.o');
        expect(() => emArgs(ctx('x', { sources: [], fonts: ['Missing.ttf'] }), 'webgl2')).toThrow(/no provider has the font Missing.ttf/);
    });

    it('builds a headless module once for pages, workers and Node, with no graphics backend', () => {
        const sim = ctx('sim', { sources: ['games/b/main.cpp'], headless: true, exportName: 'createSim' }, ['physics']);
        const args = headlessArgs(sim);
        expect(args).toContain('-sENVIRONMENT=web,worker,node');
        expect(args).toContain('-sEXPORT_NAME=createSim');
        expect(args.join(' ')).not.toMatch(/SOKOL_|USE_WEBGL|emdawnwebgpu/);
        expect(args.slice(-2)).toEqual(['-o', 'dist/sim/headless.js']);
        expect(outputs(sim)).toEqual(['dist/sim/headless.js', 'dist/sim/headless.wasm']);
        expect(() => headlessArgs(plain)).toThrow(/isn't a headless module/);
    });

    it('fingerprints the pinned Emscripten and the module as declared', () => {
        const f = fingerprint(plain);
        expect(f).toContain(`emscripten ${EMSCRIPTEN_VERSION}`);
        expect(f.join('\n')).toContain('"shaders":["shaders/a.glsl"]');
        expect(f.join('\n')).toContain('sokol-shdc');
    });
});

describe('inputs', () => {
    const ctx = setup();

    it('follows includes transitively, skipping system and generated headers', () => {
        const a = ctx('a', { sources: ['games/a/main.cpp'] });
        const files = includeClosure([join(a.root, 'native/games/a/main.cpp')], [join(a.root, 'native'), join(a.providers[0].root, 'runtime')]);
        const rel = files.map((f) => f.slice(f.indexOf('cpp-wasm-') + 1).split('/').slice(1).join('/')).sort();
        expect(rel).toEqual(['engine/runtime/xl.h', 'engine/runtime/xl_color.h', 'game/native/games/a/logic.h', 'game/native/games/a/main.cpp', 'game/native/shared/util.h']);
    });

    it("are what the module is built from, and nothing else; providers' files under their name", () => {
        const a = ctx('a', { sources: ['games/a/main.cpp'], shaders: ['shaders/a.glsl'], assets: 'games/a/assets' });
        const labels = inputs(a).map((i) => i.label).sort();
        expect(labels).toEqual([
            '@s/core/runtime/worklet.js', '@s/core/runtime/xl.h', '@s/core/runtime/xl_color.h',
            'native/games/a/assets/song.mp3', 'native/games/a/logic.h', 'native/games/a/main.cpp', 'native/shaders/a.glsl', 'native/shared/util.h',
        ]);
        const b = ctx('b', { sources: ['games/b/main.cpp'], headless: true }, ['core', 'physics']);
        const bl = inputs(b).map((i) => i.label);
        expect(bl).toEqual(expect.arrayContaining(['@s/core/runtime/xl_physics.cpp', '@s/core/jolt/Jolt/World.cpp', '@s/core/jolt/Jolt/Jolt.h', '@s/core/jolt/Jolt/Core/Core.h']));
        expect(bl.some((l) => l.includes('games/a') || l.includes('worklet'))).toBe(false);   // not another game's; no assets headless
        const hud = inputs(ctx('a', { sources: ['games/a/main.cpp'], fonts: ['Hand.ttf'] }, ['core', 'text'])).map((i) => i.label);
        expect(hud).toEqual(expect.arrayContaining(['@s/core/runtime/xl_font.cpp', '@s/core/vendor/stb_truetype.h', '@s/core/fonts/Hand.ttf']));
    });
});
