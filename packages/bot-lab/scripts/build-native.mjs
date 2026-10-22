#!/usr/bin/env node
// Builds Bot Lab's native modules with the engine's pipeline (@xlibraries/engine/build) into dist/<module>/.
// Usage: node scripts/build-native.mjs [module ...]   (a full build, no arguments, before committing; needs Emscripten)
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { STAMP, build, sourcesHash as engineHash } from '@xlibraries/engine/build';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export { STAMP };

const WORLD_EXPORTS = ['_bl_reset', '_bl_robot', '_bl_torque', '_bl_step', '_bl_state', '_bl_point', '_malloc', '_free'];

/** Each module: its sources (relative to native/) and em++ flags. */
const VIEW_EXPORTS = ['_main', '_malloc', '_free', '_bl_view_robot', '_bl_view_track', '_bl_view_start', '_bl_view_state'];

export const MODULES = {
    // the 3D view (WebGPU and WebGL2): draws the world from the page's snapshots, simulates nothing
    view: { sources: ['view/view.cpp'], shaders: ['shaders/view.glsl'], flags: [`-sEXPORTED_FUNCTIONS=${VIEW_EXPORTS.join(',')}`, '-sEXPORTED_RUNTIME_METHODS=HEAPF32'] },
    // the physics world: headless, run in the runtime worker (and in Node by the tests)
    world: { sources: ['world/world.cpp'], headless: true, physics: true, exportName: 'createWorld', flags: [`-sEXPORTED_FUNCTIONS=${WORLD_EXPORTS.join(',')}`, '-sEXPORTED_RUNTIME_METHODS=HEAPF32'] },
};

export const sourcesHash = () => engineHash(ROOT);

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    build({ root: ROOT, modules: MODULES, only: process.argv.slice(2) }).catch((err) => { console.error(err.message); process.exit(1); });
}
