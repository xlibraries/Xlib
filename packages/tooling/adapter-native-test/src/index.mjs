// Native unit tests as a toolchain adapter: compiles a package's graphics-free C++ (every .cpp under native/ except
// main.cpp files), its providers' test sources and libraries, tests/native/*.cpp and doctest's main with the system
// compilers, then runs the binary from the package's folder. doctest is this package's public header (include/).
//
// The package says what its tests need in package.json:
//   "xlibraries": { "nativeTests": { "uses": ["@xlibraries/engine"], "cLibraries": [{ "sources", "flags" }], "includes": [] } }
// A provider offers "testSources" (a folder of .cpp files tests link) and "libraries" (compiled once for the host).
// A package that is itself a provider gets its own include folders, test sources and libraries.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, posix } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const name = 'native-test';
export const version = JSON.parse(readFileSync(join(HERE, '../package.json'), 'utf8')).version;
export const INCLUDE = join(HERE, '../include');
export const MAIN = join(HERE, 'main.cpp');

const CXX = process.env.CXX || 'c++';
const CC = process.env.CC || 'cc';

function cppFiles(base, dir, keepMain = false) {
    if (!existsSync(join(base, dir))) return [];
    return readdirSync(join(base, dir)).sort().flatMap((n) => {
        const rel = posix.join(dir, n);
        if (statSync(join(base, rel)).isDirectory()) return cppFiles(base, rel, keepMain);
        return n.endsWith('.cpp') && (keepMain || n !== 'main.cpp') ? [rel] : [];
    });
}

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));

/** The providers a package's tests use (and the package itself, if it is one): [{ root, self, native }]. */
export function providers(root) {
    const json = readJson(join(root, 'package.json'));
    const require = createRequire(join(root, 'package.json'));
    const out = (json.xlibraries?.nativeTests?.uses ?? []).map((n) => {
        const proot = dirname(require.resolve(`${n}/package.json`));
        const native = readJson(join(proot, 'package.json')).xlibraries?.native;
        if (!native) throw new Error(`${n} offers no native code`);
        return { root: proot, self: false, native };
    });
    if (json.xlibraries?.native) out.push({ root, self: true, native: json.xlibraries.native });
    return out;
}

const libsOf = (provs) => provs.flatMap((p) => Object.entries(p.native.libraries ?? {}).map(([n, lib]) => ({ provider: p, name: n, ...lib })));

/** The compiler's arguments (without the library objects, appended at the end). */
export function testArgs(root) {
    const json = readJson(join(root, 'package.json'));
    const tests = json.xlibraries?.nativeTests ?? {};
    const provs = providers(root);
    const libFlags = libsOf(provs).flatMap((l) => [...(l.isystem ?? []).map((d) => `-isystem${join(l.provider.root, d)}`), ...(l.defines ?? [])]);
    const includes = provs.flatMap((p) => (p.native.include ?? []).map((d) => `-I${join(p.root, d)}`));
    // the package's logic, then every provider's test sources (its own too), each file once
    const logic = cppFiles(root, 'native');
    const seen = new Set(logic.map((f) => join(root, f)));
    const runtime = provs.filter((p) => p.native.testSources).flatMap((p) => cppFiles(p.root, p.native.testSources).map((f) => ({ path: join(p.root, f), own: p.self ? f : null })))
        .filter(({ path }) => !seen.has(path) && seen.add(path)).map(({ path, own }) => own ?? path);
    return ['-std=c++20', '-O1', '-Wall', '-Wextra', '-Inative', ...includes, `-I${INCLUDE}`, ...libFlags, ...(tests.includes ?? []), ...logic, ...runtime, ...cppFiles(root, 'tests/native'), MAIN];
}

/** Compiles a provider's library for the host once (objects cached by mtime) into its build/native-obj/<name>/. */
function hostLibrary(lib, run) {
    const outDir = join(lib.provider.root, 'build/native-obj', lib.name);
    mkdirSync(outDir, { recursive: true });
    return cppFiles(lib.provider.root, lib.sources, true).map((src) => {
        const obj = join(outDir, src.slice(lib.sources.length + 1).replace(/[/]/g, '_').replace(/\.cpp$/, '.o'));
        let fresh = false;
        try { fresh = statSync(obj).mtimeMs > statSync(join(lib.provider.root, src)).mtimeMs; } catch { /* not built yet */ }
        if (!fresh) run(CXX, ['-std=c++20', '-O1', '-fno-exceptions', '-fno-rtti', ...(lib.isystem ?? []).map((d) => `-isystem${join(lib.provider.root, d)}`), ...(lib.defines ?? []), '-c', join(lib.provider.root, src), '-o', obj]);
        return obj;
    });
}

/** Compiles and runs the package's native tests. */
export function runNativeTests(root) {
    const run = (cmd, args) => execFileSync(cmd, args, { cwd: root, stdio: 'inherit' });
    mkdirSync(join(root, 'build/native-obj'), { recursive: true });
    const tests = readJson(join(root, 'package.json')).xlibraries?.nativeTests ?? {};
    const objects = libsOf(providers(root)).flatMap((l) => hostLibrary(l, run));
    for (const lib of tests.cLibraries ?? []) {
        for (const file of readdirSync(join(root, lib.sources)).filter((f) => f.endsWith('.c')).sort()) {
            const src = `${lib.sources}/${file}`, obj = `build/native-obj/${lib.sources.replace(/[\\/]/g, '_')}_${file.replace(/\.c$/, '.o')}`;
            let fresh = false;
            try { fresh = statSync(join(root, obj)).mtimeMs > statSync(join(root, src)).mtimeMs; } catch { /* not built yet */ }
            if (!fresh) run(CC, ['-std=gnu17', '-O1', ...(lib.flags ?? []), '-c', src, '-o', obj]);
            objects.push(obj);
        }
    }
    run(CXX, [...testArgs(root), ...objects, '-o', 'build/native-tests']);
    run(join(root, 'build/native-tests'), ['--no-version']);
}
