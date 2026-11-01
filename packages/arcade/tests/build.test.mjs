import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
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
    it('builds every registered game, and only those, with the C++/WebAssembly adapter on the engine it needs', () => {
        expect(Object.keys(GAMES).sort()).toEqual(REGISTERED.map(g => g.id).sort());
        for (const spec of Object.values(GAMES)) {
            expect(spec.adapter).toBe('cpp-wasm');
            expect(spec.uses.slice(0, 2)).toEqual(['@xlibraries/engine-core', '@xlibraries/engine-web']);   // the platform, in the browser
        }
        expect(GAMES.showcase.uses).toContain('@xlibraries/physics-3d');
        expect(GAMES.hello.uses).not.toContain('@xlibraries/engine-audio');   // silent: no worklet, no mixer linked
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

    it('has committed builds for every game and backend, with the audio worklet beside each game with sound', () => {
        for (const [game, spec] of Object.entries(GAMES)) {
            for (const backend of BACKENDS) {
                for (const ext of ['js', 'wasm']) expect(existsSync(join(ROOT, `dist/${game}/${backend}.${ext}`)), `${game}/${backend}.${ext}`).toBe(true);
            }
            expect(existsSync(join(ROOT, `dist/${game}/xl-audio-worklet.js`)), game).toBe(spec.uses.includes('@xlibraries/engine-audio'));
        }
    });

    it('ships Turbo Trails on physics-2d (Box2D behind it), with the HUD font and its music', () => {
        const c = ctx('turbo-trails');
        const args = emArgs(c, 'webgl2', ['/obj/box2d.o']);
        const physics = c.providers.find((p) => p.name === '@xlibraries/physics-2d');
        expect(physics).toBeDefined();
        expect(args).toContain(`-isystem${join(physics.root, 'third_party/box2d/include')}`);   // Box2D's headers come with it
        expect(args).toContain(join(physics.root, 'src/backend_box2d.cpp'));
        expect(args).toContain('/obj/box2d.o');
        expect(GAMES['turbo-trails'].cLibraries).toBeUndefined();   // the Arcade no longer carries Box2D
        expect(GAMES['turbo-trails'].sources).toContain('games/turbo-trails/vehicle.cpp');
        expect(GAMES['turbo-trails'].uses).toEqual(expect.arrayContaining(['@xlibraries/engine-text', '@xlibraries/engine-audio']));
        expect(args.join(' ')).toContain('LilitaOne-Regular.ttf@/LilitaOne-Regular.ttf');
        expect(args.join(' ')).toContain('xl_font.cpp');
        for (const f of ['chariots-bg.mp3', 'chariots-wheel.mp3']) expect(existsSync(join(ROOT, `dist/turbo-trails/${f}`)), f).toBe(true);
    });

    it('stamps each game with only what it is built from', () => {
        const jr = inputs(ctx('jyotirath')).map((i) => i.label);
        expect(jr).toContain('native/games/jyotirath/hints.cpp');
        expect(jr).toContain('native/games/jyotirath/assets/chariot.cpp');       // its own assets
        expect(jr).toContain('@xlibraries/render/shaders/render.glsl');          // the look it's drawn with
        expect(jr).toContain('@xlibraries/render/src/renderer_sokol.cpp');
        expect(jr).toContain('@xlibraries/asset-builder/src/mesh.cpp');          // what its models are built with
        expect(jr.some((l) => l.startsWith('native/shaders/'))).toBe(false);     // no shader of its own
        expect(jr).toContain('@xlibraries/engine-core/include/xl.h');         // included by the game
        expect(jr).toContain('@xlibraries/engine-text/src/xl_font.cpp');      // the text it uses, linked
        expect(jr).toContain('@xlibraries/engine-web/src/xl_web.cpp');        // the platform in the browser, linked
        expect(jr.some((l) => l.includes('turbo-trails'))).toBe(false);          // nothing of another game
        expect(jr.some((l) => l.includes('physics'))).toBe(false);   // no physics: not stale when physics changes
        const tt = inputs(ctx('turbo-trails')).map((i) => i.label);
        expect(tt.some((l) => l.includes('@xlibraries/render') || l.includes('asset-builder'))).toBe(false);   // not stale when render changes
    });

    it('builds no game on React: no provider a game uses depends on it, directly or through another provider', () => {
        const seen = new Map();
        const reactIn = (name, from) => {
            if (seen.has(name)) return seen.get(name);
            const json = JSON.parse(readFileSync(join(dirname(createRequire(join(from, 'package.json')).resolve(`${name}/package.json`)), 'package.json'), 'utf8'));
            const deps = Object.keys({ ...json.dependencies, ...json.peerDependencies });
            const dir = dirname(createRequire(join(from, 'package.json')).resolve(`${name}/package.json`));
            const found = deps.some((d) => d === 'react' || d === 'react-dom') || deps.filter((d) => d.startsWith('@xlibraries/')).some((d) => reactIn(d, dir));
            seen.set(name, found);
            return found;
        };
        for (const [game, spec] of Object.entries(GAMES)) for (const p of spec.uses) expect(reactIn(p, ROOT), `${game} uses ${p}`).toBe(false);
    });

    it('has builds that match their sources (after changing a game, `pnpm build:native` rebuilds just that one)', async () => {
        for (const game of Object.keys(GAMES)) {
            const { current } = await check(ROOT, game);
            expect(current, `dist/${game} is out of date: run \`pnpm --filter @xlibraries/arcade build:native\``).toBe(true);
        }
    });
});
