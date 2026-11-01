import { afterAll, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { BACKENDS, EMSCRIPTEN_VERSION, build, checkEmscripten, emArgs, fingerprint, headlessArgs, includeClosure, inputs, outputs } from '../src/index.mjs';

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

describe('building', () => {
    /** A module on disk with a provider that has a library, link sources, a font and an asset. */
    function project() {
        const base = mkdtempSync(join(tmpdir(), 'cpp-build-'));
        roots.push(base);
        const write = (path, body = '') => { mkdirSync(dirname(join(base, path)), { recursive: true }); writeFileSync(join(base, path), body); };
        write('game/native/games/a/main.cpp', '#include "xl.h"\n');
        write('game/native/games/a/assets/song.mp3', 'la');
        write('game/native/shaders/a.glsl', '@vs vs\n@end\n');
        write('game/third_party/clib/src/one.c', '');
        write('game/third_party/clib/src/two.c', '');
        write('engine/include/xl.h', '#pragma once\n');
        write('engine/src/xl_web.cpp', '#include "xl.h"\n');
        write('engine/src/worklet.js', '');
        write('engine/lib/Lib/One.cpp', '');
        write('engine/lib/Lib/Sub/Two.cpp', '');
        const engine = { root: join(base, 'engine'), name: '@s/engine', version: '1.0.0', native: { prefix: 'engine', include: ['include'], link: ['src/xl_web.cpp'], assets: ['src/worklet.js'], libraries: { lib: { sources: 'lib/Lib', isystem: ['lib'], defines: ['-DLIB'] } } } };
        const ctx = (spec) => ({ root: join(base, 'game'), name: 'a', spec: { adapter: 'cpp-wasm', sources: ['games/a/main.cpp'], ...spec }, providers: [engine], pkg: {} });
        return { base, ctx, engine };
    }
    /** A stand-in for running commands: answers em++ --version, records the rest and creates what -o names. */
    function fakeExec(version = `emcc ${EMSCRIPTEN_VERSION}`) {
        const calls = [];
        const exec = (cmd, args, opts = {}) => {
            if (args[0] === '--version') { if (version === null) throw new Error('not found'); return version; }
            calls.push({ cmd, args, cwd: opts.cwd });
            const out = args[args.indexOf('-o') + 1];
            if (out) { const path = out.startsWith('/') ? out : join(opts.cwd, out); mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, ''); }
            return '';
        };
        return { exec, calls };
    }
    const quiet = () => {};

    it('compiles shaders, C libraries and the providers\' libraries, then each backend, and copies the assets', async () => {
        const { ctx, engine } = project();
        const { exec, calls } = fakeExec();
        const c = ctx({ shaders: ['shaders/a.glsl'], cLibraries: [{ sources: 'third_party/clib/src', flags: ['-DC'] }], assets: 'games/a/assets' });
        await build(c, { log: quiet, exec, shdc: '/bin/shdc' });
        const tools = calls.map((x) => x.cmd);
        expect(tools).toEqual(['/bin/shdc', 'emcc', 'emcc', 'em++', 'em++', 'em++', 'em++']);   // shader, 2 C files, 2 library files, 2 backends
        expect(calls[1].args).toEqual(['-O2', '-fno-exceptions', `-ffile-prefix-map=${c.root}=.`, '-DC', '-c', 'third_party/clib/src/one.c', '-o', 'build/obj/third_party_clib_src/one.o']);
        expect(calls[3]).toMatchObject({ cwd: engine.root });   // a provider's library builds in the provider
        expect(calls[3].args).toEqual(expect.arrayContaining([`-ffile-prefix-map=${engine.root}=engine`, `-isystem${join(engine.root, 'lib')}`, '-DLIB', join(engine.root, 'lib/Lib/One.cpp')]));
        expect(calls[4].args.at(-1)).toBe(join(engine.root, 'build/obj/lib/Sub_Two.o'));
        expect(calls[5].args).toEqual(emArgs(c, 'webgpu', ['build/obj/third_party_clib_src/one.o', 'build/obj/third_party_clib_src/two.o', join(engine.root, 'build/obj/lib/One.o'), join(engine.root, 'build/obj/lib/Sub_Two.o')]));
        expect(calls[6].args.slice(-2)).toEqual(['-o', 'dist/a/webgl2.js']);
        expect(readFileSync(join(c.root, 'dist/a/song.mp3'), 'utf8')).toBe('la');       // the module's assets
        expect(existsSync(join(c.root, 'dist/a/worklet.js'))).toBe(true);                 // the provider's
    });

    it('reuses a provider library\'s objects while they are newer than their sources', async () => {
        const { ctx } = project();
        const first = fakeExec();
        await build(ctx({}), { log: quiet, exec: first.exec });
        expect(first.calls.filter((x) => x.cwd !== ctx({}).root)).toHaveLength(2);
        const again = fakeExec();
        await build(ctx({}), { log: quiet, exec: again.exec });
        expect(again.calls.map((x) => x.cmd)).toEqual(['em++', 'em++']);   // just the two backends
    });

    it('builds a headless module once, with no assets, and empties dist first', async () => {
        const { ctx } = project();
        const c = ctx({ headless: true, assets: 'games/a/assets' });
        mkdirSync(join(c.root, 'dist/a'), { recursive: true });
        writeFileSync(join(c.root, 'dist/a/stale.js'), '');
        const { exec, calls } = fakeExec();
        await build(c, { log: quiet, exec });
        expect(calls.filter((x) => x.cmd === 'em++' && x.cwd === c.root).map((x) => x.args.slice(-2))).toEqual([['-o', 'dist/a/headless.js']]);
        expect(existsSync(join(c.root, 'dist/a/stale.js'))).toBe(false);
        expect(existsSync(join(c.root, 'dist/a/song.mp3'))).toBe(false);
    });

    it('stops before building without the pinned Emscripten', async () => {
        const { ctx } = project();
        expect(() => checkEmscripten(fakeExec(null).exec)).toThrow(/em\+\+ not found/);
        expect(() => checkEmscripten(fakeExec('emcc 3.1.0').exec)).toThrow(new RegExp(`Emscripten ${EMSCRIPTEN_VERSION} required`));
        const { exec, calls } = fakeExec('emcc 3.1.0');
        await expect(build(ctx({}), { log: quiet, exec })).rejects.toThrow(/required/);
        expect(calls).toEqual([]);
    });
});

describe('C libraries from a provider', () => {
    it('compile with emcc and their own flags, in the provider, cached like any library; their headers are inputs', async () => {
        const base = mkdtempSync(join(tmpdir(), 'cpp-c-'));
        roots.push(base);
        const write = (path, body = '') => { mkdirSync(dirname(join(base, path)), { recursive: true }); writeFileSync(join(base, path), body); };
        write('game/native/main.cpp', '#include "phys.h"\n');
        write('phys/include/phys.h', '#pragma once\n');
        write('phys/lib/inc/lib/lib.h', '#pragma once\n#include "core.h"\n');
        write('phys/lib/src/core.h', '#pragma once\n');
        write('phys/lib/src/a.c', '#include "lib/lib.h"\n');
        write('phys/lib/src/nested/b.c', '');
        write('phys/lib/src/ignored.cpp', '');
        const phys = { root: join(base, 'phys'), name: '@s/phys', version: '1.0.0', native: { prefix: 'phys', include: ['include'], libraries: { lib: { sources: 'lib/src', language: 'c', isystem: ['lib/inc'], flags: ['-std=gnu17', '-Ilib/inc', '-Ilib/src'] } } } };
        const ctx = { root: join(base, 'game'), name: 'g', spec: { adapter: 'cpp-wasm', sources: ['main.cpp'] }, providers: [phys], pkg: {} };
        const calls = [];
        const exec = (cmd, args, opts = {}) => {
            if (args[0] === '--version') return `emcc ${EMSCRIPTEN_VERSION}`;
            calls.push({ cmd, args, cwd: opts.cwd });
            const out = args[args.indexOf('-o') + 1];
            if (out) { const path = out.startsWith('/') ? out : join(opts.cwd, out); mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, ''); }
            return '';
        };
        await build(ctx, { log: () => {}, exec });
        const c = calls.filter((x) => x.cmd === 'emcc');
        expect(c.map((x) => x.args)).toEqual([
            ['-O2', '-fno-exceptions', `-ffile-prefix-map=${phys.root}=phys`, '-std=gnu17', '-Ilib/inc', '-Ilib/src', '-c', 'lib/src/a.c', '-o', join(phys.root, 'build/obj/lib/a.o')],
            ['-O2', '-fno-exceptions', `-ffile-prefix-map=${phys.root}=phys`, '-std=gnu17', '-Ilib/inc', '-Ilib/src', '-c', 'lib/src/nested/b.c', '-o', join(phys.root, 'build/obj/lib/nested_b.o')],
        ]);
        expect(c.every((x) => x.cwd === phys.root)).toBe(true);
        expect(calls.find((x) => x.cmd === 'em++').args).toContain(`-isystem${join(phys.root, 'lib/inc')}`);   // the module sees its headers
        const labels = inputs(ctx).map((i) => i.label);
        expect(labels).toEqual(expect.arrayContaining(['@s/phys/lib/src/a.c', '@s/phys/lib/src/nested/b.c', '@s/phys/lib/inc/lib/lib.h', '@s/phys/lib/src/core.h']));
        expect(labels).not.toContain('@s/phys/lib/src/ignored.cpp');
        calls.length = 0;
        await build(ctx, { log: () => {}, exec });
        expect(calls.filter((x) => x.cmd === 'emcc')).toEqual([]);   // fresh objects reused
    });
});

describe('shaders from a provider', () => {
    it('compile into the provider\'s build/gen/ (named from its root) before the module\'s; that folder is on the include path; they are inputs', async () => {
        const base = mkdtempSync(join(tmpdir(), 'cpp-shaders-'));
        roots.push(base);
        const write = (path, body = '') => { mkdirSync(dirname(join(base, path)), { recursive: true }); writeFileSync(join(base, path), body); };
        write('game/native/main.cpp', '#include "xl_render.h"\n');
        write('render/include/xl_render.h', '#pragma once\n');
        write('render/shaders/lit.glsl', '@vs vs\n@end\n');
        const render = { root: join(base, 'render'), name: '@s/render', version: '1.0.0', native: { prefix: 'render', include: ['include'], shaders: ['shaders/lit.glsl'] } };
        const ctx = { root: join(base, 'game'), name: 'g', spec: { adapter: 'cpp-wasm', sources: ['main.cpp'] }, providers: [render], pkg: {} };
        const calls = [];
        const exec = (cmd, args, opts = {}) => { if (args[0] === '--version') return `emcc ${EMSCRIPTEN_VERSION}`; calls.push({ cmd, args, cwd: opts.cwd }); return ''; };
        await build(ctx, { log: () => {}, exec, shdc: '/bin/shdc' });
        expect(calls[0]).toEqual({ cmd: '/bin/shdc', args: ['--input', 'shaders/lit.glsl', '--output', 'build/gen/lit.glsl.h', '--slang', 'glsl300es:wgsl', '--reflection'], cwd: render.root });
        expect(emArgs(ctx, 'webgl2')).toContain(`-I${join(render.root, 'build/gen')}`);
        expect(inputs(ctx).map((i) => i.label)).toEqual(expect.arrayContaining(['@s/render/shaders/lit.glsl', '@s/render/include/xl_render.h']));
        expect(fingerprint(ctx).join('\n')).toContain('sokol-shdc');   // the module has none of its own, but its provider does
        const plain = { ...ctx, providers: [{ ...render, native: { ...render.native, shaders: undefined } }] };
        expect(fingerprint(plain).join('\n')).not.toContain('sokol-shdc');
        expect(emArgs(plain, 'webgl2')).not.toContain(`-I${join(render.root, 'build/gen')}`);
    });
});
