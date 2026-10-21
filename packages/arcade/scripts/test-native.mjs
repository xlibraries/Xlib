#!/usr/bin/env node
// The games' graphics-free code (every source except main.cpp, plus Box2D for Turbo Trails) under doctest, with the
// system compilers, through the engine's harness.
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runNativeTests } from '@xlibraries/engine/test';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
runNativeTests({
    root: ROOT,
    cLibraries: [{ sources: 'third_party/box2d/src', flags: ['-DBOX2D_DISABLE_SIMD', '-Ithird_party/box2d/include', '-Ithird_party/box2d/src'] }],
    includes: ['-Ithird_party/box2d/include'],
});
