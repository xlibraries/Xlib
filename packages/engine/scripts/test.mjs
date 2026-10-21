#!/usr/bin/env node
// Native unit tests for a consumer (or the engine itself): compiles every .cpp under <root>/native except main.cpp
// files, the engine's runtime sources, <root>/tests/native/*.cpp and the engine's doctest main with the system
// compilers, then runs the binary from <root>.
//
//   import { runNativeTests } from '@xlibraries/engine/test';
//   runNativeTests({ root, cLibraries: [{ sources: 'third_party/box2d/src', flags: [...] }] });
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ENGINE_ROOT } from './build.mjs';

const CXX = process.env.CXX || 'c++';
const CC = process.env.CC || 'cc';

function cppFiles(base, dir) {
    if (!existsSync(join(base, dir))) return [];
    return readdirSync(join(base, dir)).sort().flatMap(name => {
        const rel = `${dir}/${name}`;
        if (statSync(join(base, rel)).isDirectory()) return cppFiles(base, rel);
        return name.endsWith('.cpp') && name !== 'main.cpp' ? [rel] : [];
    });
}

/** Compiles and runs the tests; `cLibraries` are C sources compiled once (objects cached by mtime). */
export function runNativeTests({ root, cLibraries = [], includes = [] }) {
    const run = (cmd, args) => execFileSync(cmd, args, { cwd: root, stdio: 'inherit' });
    mkdirSync(join(root, 'build/native-obj'), { recursive: true });
    const objects = [];
    for (const lib of cLibraries) {
        for (const file of readdirSync(join(root, lib.sources)).filter(f => f.endsWith('.c')).sort()) {
            const src = `${lib.sources}/${file}`, obj = `build/native-obj/${lib.sources.replace(/[\\/]/g, '_')}_${file.replace(/\.c$/, '.o')}`;
            let fresh = false;
            try { fresh = statSync(join(root, obj)).mtimeMs > statSync(join(root, src)).mtimeMs; } catch { /* not built yet */ }
            if (!fresh) run(CC, ['-std=gnu17', '-O1', ...(lib.flags ?? []), '-c', src, '-o', obj]);
            objects.push(obj);
        }
    }
    const logic = cppFiles(root, 'native');
    const tests = cppFiles(root, 'tests/native');
    const runtime = root === ENGINE_ROOT ? [] : cppFiles(ENGINE_ROOT, 'native/runtime').map(f => join(ENGINE_ROOT, f));
    const main = join(ENGINE_ROOT, 'tests/native/main.cpp');
    run(CXX, ['-std=c++20', '-O1', '-Wall', '-Wextra', '-Inative', `-I${join(ENGINE_ROOT, 'native/runtime')}`, `-I${join(ENGINE_ROOT, 'third_party')}`, ...includes, ...logic, ...runtime, ...tests, main, ...objects, '-o', 'build/native-tests']);
    run(join(root, 'build/native-tests'), ['--no-version']);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    // the engine's own tests
    runNativeTests({ root: ENGINE_ROOT });
}
