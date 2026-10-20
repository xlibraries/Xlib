#!/usr/bin/env node
// Compiles the games' graphics-free code with the system C++ compiler and runs its doctest unit tests.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CXX = process.env.CXX || 'c++';

// every game source except main.cpp (which needs sokol and a browser)
const logic = readdirSync(join(ROOT, 'native/games'))
    .flatMap(game => readdirSync(join(ROOT, 'native/games', game)).filter(f => f.endsWith('.cpp') && f !== 'main.cpp').map(f => `native/games/${game}/${f}`));
const tests = readdirSync(join(ROOT, 'tests/native')).filter(f => f.endsWith('.cpp')).map(f => `tests/native/${f}`);

mkdirSync(join(ROOT, 'build'), { recursive: true });
execFileSync(CXX, ['-std=c++20', '-O1', '-Wall', '-Wextra', '-Inative', '-Ithird_party', ...logic, ...tests, '-o', 'build/native-tests'], { cwd: ROOT, stdio: 'inherit' });
execFileSync(join(ROOT, 'build/native-tests'), ['--no-version'], { cwd: ROOT, stdio: 'inherit' });
