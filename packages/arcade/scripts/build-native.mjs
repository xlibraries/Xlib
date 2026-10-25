#!/usr/bin/env node
// Builds the Arcade's games with the engine's pipeline (@xlibraries/engine/build) into dist/<game>/.
// Usage: node scripts/build-native.mjs [game ...]   (a full build, no arguments, before committing)
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BACKENDS, STAMP, build, emArgs as engineArgs, shdcBinaryPath, sourceFiles as engineSources, sourcesHash as engineHash } from '@xlibraries/engine/build';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export { BACKENDS, STAMP, shdcBinaryPath };

/** Each game: its sources and shaders (paths relative to native/), and any extra em++ flags. */
export const GAMES = {
    hello: { sources: ['games/hello/main.cpp'], shaders: ['shaders/hello.glsl'] },
    breakout: { sources: ['games/breakout/main.cpp', 'games/breakout/logic.cpp'], shaders: [] },
    showcase: { sources: ['games/showcase/main.cpp', 'games/showcase/scene.cpp'], shaders: ['shaders/showcase.glsl'], physics: true, flags: ['-sEXPORTED_FUNCTIONS=_main'] },
    // the page passes shader source in, so it needs string helpers
    playground: { sources: ['games/playground/main.cpp'], shaders: [], flags: ['-sEXPORTED_RUNTIME_METHODS=stringToNewUTF8', '-sEXPORTED_FUNCTIONS=_main,_free'] },
    'turbo-trails': {
        sources: ['games/turbo-trails/main.cpp', 'games/turbo-trails/physics_box2d.cpp', 'games/turbo-trails/terrain.cpp', 'games/turbo-trails/rules.cpp', 'games/turbo-trails/eras.cpp', 'games/turbo-trails/feel.cpp'],
        // Box2D v3 (C), compiled separately with emcc; scalar maths (its SIMD paths need SSE emulation)
        cSources: 'third_party/box2d/src',
        cFlags: ['-std=gnu17', '-DBOX2D_DISABLE_SIMD', '-Ithird_party/box2d/include', '-Ithird_party/box2d/src'],
        shaders: ['shaders/turbo-trails.glsl'],
        flags: ['-Ithird_party/box2d/include', '-sEXPORTED_RUNTIME_METHODS=UTF8ToString', '-sEXPORTED_FUNCTIONS=_main,_free'],
        // the HUD uses the engine's text renderer and font
        text: true,
        fonts: ['LilitaOne-Regular.ttf'],
        assets: 'games/turbo-trails/assets',
    },
    jyotirath: {
        sources: ['games/jyotirath/main.cpp', 'games/jyotirath/mesh.cpp', 'games/jyotirath/models.cpp', 'games/jyotirath/track.cpp', 'games/jyotirath/drive.cpp', 'games/jyotirath/story.cpp', 'games/jyotirath/go.cpp'],
        shaders: ['shaders/jyotirath.glsl'],
        flags: ['-sEXPORTED_RUNTIME_METHODS=UTF8ToString', '-sEXPORTED_FUNCTIONS=_main,_free'],
        text: true,
        fonts: ['LilitaOne-Regular.ttf'],
    },
};

export const emArgs = (game, backend, objects = []) => engineArgs(ROOT, GAMES, game, backend, objects);
export const sourceFiles = () => engineSources(ROOT).map(([label]) => label);
export const sourcesHash = () => engineHash(ROOT);

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    build({ root: ROOT, modules: GAMES, only: process.argv.slice(2) }).catch((err) => { console.error(err.message); process.exit(1); });
}
