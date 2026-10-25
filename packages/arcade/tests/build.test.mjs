import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { BACKENDS, GAMES, STAMP, emArgs, shdcBinaryPath, sourceFiles, sourcesHash } from '../scripts/build-native.mjs';
import { GAMES as REGISTERED } from '../src/games';

describe('build-native', () => {
    it('builds every registered game, and only those', () => {
        expect(Object.keys(GAMES).sort()).toEqual(REGISTERED.map(g => g.id).sort());
    });

    it('compiles each backend with the right sokol define and no eval', () => {
        const gl = emArgs('hello', 'webgl2');
        const gpu = emArgs('hello', 'webgpu');
        expect(gl).toContain('-DSOKOL_GLES3');
        expect(gl).toContain('-sUSE_WEBGL2=1');
        expect(gpu).toContain('-DSOKOL_WGPU');
        expect(gpu).toContain('--use-port=emdawnwebgpu');
        for (const args of [gl, gpu]) {
            expect(args).toContain('-sDYNAMIC_EXECUTION=0');
            expect(args.slice(-2)).toEqual(['-o', `dist/hello/${args.includes('-DSOKOL_WGPU') ? 'webgpu' : 'webgl2'}.js`]);
        }
        expect(() => emArgs('nope', 'webgl2')).toThrow(/unknown module/);
    });

    it('has committed builds for every game and backend', () => {
        for (const game of Object.keys(GAMES)) {
            for (const backend of BACKENDS) {
                expect(existsSync(new URL(`../dist/${game}/${backend}.js`, import.meta.url)), `${game}/${backend}.js`).toBe(true);
                expect(existsSync(new URL(`../dist/${game}/${backend}.wasm`, import.meta.url)), `${game}/${backend}.wasm`).toBe(true);
            }
        }
    });

    it('ships the audio worklet beside every build', () => {
        for (const game of Object.keys(GAMES)) expect(existsSync(new URL(`../dist/${game}/xl-audio-worklet.js`, import.meta.url)), game).toBe(true);
    });

    it('ships Turbo Trails with Box2D compiled in and its music beside the build', () => {
        const args = emArgs('turbo-trails', 'webgl2', ['build/obj/x.o']);
        expect(args).toContain('-Ithird_party/box2d/include');
        expect(args).toContain('build/obj/x.o');
        expect(GAMES['turbo-trails'].cFlags).toContain('-DBOX2D_DISABLE_SIMD');
        expect(GAMES['turbo-trails'].shaders).toEqual(['shaders/turbo-trails.glsl']);   // the post-process pass
        expect(GAMES['turbo-trails'].sources).toContain('games/turbo-trails/feel.cpp');
        expect(GAMES['turbo-trails'].text).toBe(true);                        // the engine's text renderer
        expect(args.join(' ')).toContain('LilitaOne-Regular.ttf@/LilitaOne-Regular.ttf');   // the HUD font, embedded
        expect(args.join(' ')).toContain('xl_font.cpp');
        for (const f of ['chariots-bg.mp3', 'chariots-wheel.mp3']) expect(existsSync(new URL(`../dist/turbo-trails/${f}`, import.meta.url)), f).toBe(true);
    });

    it('ships JyotiRath with its shaders and the HUD font', () => {
        expect(GAMES.jyotirath.shaders).toEqual(['shaders/jyotirath.glsl']);   // shadow, lit, sky and post programs
        expect(GAMES.jyotirath.sources).toEqual(expect.arrayContaining(['games/jyotirath/story.cpp', 'games/jyotirath/go.cpp', 'games/jyotirath/boards.cpp', 'games/jyotirath/chapter.cpp']));
        expect(GAMES.jyotirath.text).toBe(true);
        expect(emArgs('jyotirath', 'webgpu').join(' ')).toContain('LilitaOne-Regular.ttf@/LilitaOne-Regular.ttf');
    });

    it('has builds that match the sources (rebuild every game after changing native/, third_party/ or the script)', () => {
        const files = sourceFiles();
        expect(files).toContain('engine/native/runtime/xl.h');            // the engine's inputs count too
        expect(files).toContain('engine/third_party/sokol/sokol_gfx.h');
        expect(files).toContain('native/games/breakout/main.cpp');
        expect(files).toContain('scripts/build-native.mjs');
        const stamp = new URL(`../${STAMP}`, import.meta.url);
        expect(existsSync(stamp), 'dist/sources.sha256: run a full `pnpm build:native`').toBe(true);
        expect(readFileSync(stamp, 'utf8').trim(), 'native sources changed since the committed builds: run a full `pnpm build:native`').toBe(sourcesHash());
    });

    it('knows where sokol-shdc lives for each platform', () => {
        expect(shdcBinaryPath('darwin', 'arm64')).toBe('bin/osx_arm64/sokol-shdc');
        expect(shdcBinaryPath('linux', 'x64')).toBe('bin/linux/sokol-shdc');
        expect(() => shdcBinaryPath('aix', 'ppc')).toThrow();
    });
});
