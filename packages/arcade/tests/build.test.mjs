import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { BACKENDS, GAMES, emArgs, shdcBinaryPath } from '../scripts/build-native.mjs';
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
        expect(() => emArgs('nope', 'webgl2')).toThrow(/unknown game/);
    });

    it('has committed builds for every game and backend', () => {
        for (const game of Object.keys(GAMES)) {
            for (const backend of BACKENDS) {
                expect(existsSync(new URL(`../dist/${game}/${backend}.js`, import.meta.url)), `${game}/${backend}.js`).toBe(true);
                expect(existsSync(new URL(`../dist/${game}/${backend}.wasm`, import.meta.url)), `${game}/${backend}.wasm`).toBe(true);
            }
        }
    });

    it('ships the audio worklet beside every build, and no longer sokol_audio', () => {
        for (const game of Object.keys(GAMES)) expect(existsSync(new URL(`../dist/${game}/xl-audio-worklet.js`, import.meta.url)), game).toBe(true);
        expect(existsSync(new URL('../third_party/sokol/sokol_audio.h', import.meta.url))).toBe(false);
    });

    it('ships Turbo Trails with Box2D compiled in and its music beside the build', () => {
        const args = emArgs('turbo-trails', 'webgl2', ['build/obj/x.o']);
        expect(args).toContain('-Ithird_party/box2d/include');
        expect(args).toContain('build/obj/x.o');
        expect(GAMES['turbo-trails'].cFlags).toContain('-DBOX2D_DISABLE_SIMD');
        expect(GAMES['turbo-trails'].shaders).toEqual(['shaders/turbo-trails.glsl']);   // the post-process pass
        expect(GAMES['turbo-trails'].sources).toContain('games/turbo-trails/feel.cpp');
        expect(args.join(' ')).toContain('--embed-file native/fonts/LilitaOne-Regular.ttf@/font.ttf');   // the HUD font
        for (const f of ['chariots-bg.mp3', 'chariots-wheel.mp3']) expect(existsSync(new URL(`../dist/turbo-trails/${f}`, import.meta.url)), f).toBe(true);
    });

    it('knows where sokol-shdc lives for each platform', () => {
        expect(shdcBinaryPath('darwin', 'arm64')).toBe('bin/osx_arm64/sokol-shdc');
        expect(shdcBinaryPath('linux', 'x64')).toBe('bin/linux/sokol-shdc');
        expect(() => shdcBinaryPath('aix', 'ppc')).toThrow();
    });
});
