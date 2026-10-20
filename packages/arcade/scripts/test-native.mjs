#!/usr/bin/env node
// Compiles the games' graphics-free code (every game source except main.cpp, plus Box2D for Turbo Trails) with
// the system compilers and runs the doctest unit tests.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CXX = process.env.CXX || 'c++';
const CC = process.env.CC || 'cc';

const logic = readdirSync(join(ROOT, 'native/games'))
    .flatMap(game => readdirSync(join(ROOT, 'native/games', game)).filter(f => f.endsWith('.cpp') && f !== 'main.cpp').map(f => `native/games/${game}/${f}`));
const tests = readdirSync(join(ROOT, 'tests/native')).filter(f => f.endsWith('.cpp')).map(f => `tests/native/${f}`);

mkdirSync(join(ROOT, 'build/native-obj'), { recursive: true });
const run = (cmd, args) => execFileSync(cmd, args, { cwd: ROOT, stdio: 'inherit' });

// Box2D, compiled once (objects are reused while the sources are older than them)
const box2d = [];
for (const file of readdirSync(join(ROOT, 'third_party/box2d/src')).filter(f => f.endsWith('.c')).sort()) {
    const src = `third_party/box2d/src/${file}`, obj = `build/native-obj/box2d_${file.replace(/\.c$/, '.o')}`;
    let fresh = false;
    try { fresh = statSync(join(ROOT, obj)).mtimeMs > statSync(join(ROOT, src)).mtimeMs; } catch { /* not built yet */ }
    if (!fresh) run(CC, ['-std=gnu17', '-O1', '-DBOX2D_DISABLE_SIMD', '-Ithird_party/box2d/include', '-Ithird_party/box2d/src', '-c', src, '-o', obj]);
    box2d.push(obj);
}

run(CXX, ['-std=c++20', '-O1', '-Wall', '-Wextra', '-Inative', '-Ithird_party', '-Ithird_party/box2d/include', ...logic, ...tests, ...box2d, '-o', 'build/native-tests']);
run(join(ROOT, 'build/native-tests'), ['--no-version']);
