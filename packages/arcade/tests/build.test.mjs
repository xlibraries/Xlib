import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { check, context, manifest } from '@xlibraries/toolchain';
import { BACKENDS, emArgs, inputs } from '@xlibraries/adapter-cpp-wasm';
import { GAMES as REGISTERED } from '../src/games';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = manifest(ROOT);
const GAMES = pkg.modules;
const ctx = (name) => context(pkg, name);

describe('the games as modules (package.json "xlibraries.modules")', () => {
    it('builds every registered game, and only those, with the C++/WebAssembly adapter on the engine', () => {
        expect(Object.keys(GAMES).sort()).toEqual(REGISTERED.map(g => g.id).sort());
        for (const spec of Object.values(GAMES)) {
            expect(spec.adapter).toBe('cpp-wasm');
            expect(spec.uses).toEqual(['@xlibraries/engine']);
        }
    });

    it('compiles each backend with the right sokol define and no eval', () => {
        const gl = emArgs(ctx('hello'), 'webgl2');
        const gpu = emArgs(ctx('hello'), 'webgpu');
        expect(gl).toContain('-DSOKOL_GLES3');
        expect(gpu).toContain('-DSOKOL_WGPU');
        for (const args of [gl, gpu]) {
            expect(args).toContain('-sDYNAMIC_EXECUTION=0');
            expect(args.slice(-2)).toEqual(['-o', `dist/hello/${args.includes('-DSOKOL_WGPU') ? 'webgpu' : 'webgl2'}.js`]);
        }
        expect(() => context(pkg, 'nope')).toThrow(/unknown module/);
    });

    it('has committed builds for every game and backend, with the audio worklet beside each', () => {
        for (const game of Object.keys(GAMES)) {
            for (const backend of BACKENDS) {
                for (const ext of ['js', 'wasm']) expect(existsSync(join(ROOT, `dist/${game}/${backend}.${ext}`)), `${game}/${backend}.${ext}`).toBe(true);
            }
            expect(existsSync(join(ROOT, `dist/${game}/xl-audio-worklet.js`)), game).toBe(true);
        }
    });

    it('ships Turbo Trails with Box2D compiled in, the HUD font and its music', () => {
        const args = emArgs(ctx('turbo-trails'), 'webgl2', ['build/obj/x.o']);
        expect(args).toContain('-Ithird_party/box2d/include');
        expect(args).toContain('build/obj/x.o');
        expect(GAMES['turbo-trails'].cLibraries[0].flags).toContain('-DBOX2D_DISABLE_SIMD');
        expect(GAMES['turbo-trails'].features).toEqual(['text']);
        expect(args.join(' ')).toContain('LilitaOne-Regular.ttf@/LilitaOne-Regular.ttf');
        expect(args.join(' ')).toContain('xl_font.cpp');
        for (const f of ['chariots-bg.mp3', 'chariots-wheel.mp3']) expect(existsSync(join(ROOT, `dist/turbo-trails/${f}`)), f).toBe(true);
    });

    it('stamps each game with only what it is built from', () => {
        const jr = inputs(ctx('jyotirath')).map((i) => i.label);
        expect(jr).toContain('native/games/jyotirath/hints.cpp');
        expect(jr).toContain('native/shaders/jyotirath.glsl');
        expect(jr).toContain('@xlibraries/engine/native/runtime/xl.h');          // included by the game
        expect(jr).toContain('@xlibraries/engine/native/runtime/xl_font.cpp');   // its text feature
        expect(jr.some((l) => l.includes('turbo-trails'))).toBe(false);          // nothing of another game
        expect(jr.some((l) => l.includes('jolt') || l.includes('xl_physics'))).toBe(false);   // no physics: not stale when physics changes
    });

    it('has builds that match their sources (after changing a game, `pnpm build:native` rebuilds just that one)', async () => {
        for (const game of Object.keys(GAMES)) {
            const { current } = await check(ROOT, game);
            expect(current, `dist/${game} is out of date: run \`pnpm --filter @xlibraries/arcade build:native\``).toBe(true);
        }
    });
});
