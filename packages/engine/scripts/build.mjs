#!/usr/bin/env node
// The engine's build pipeline, used by every package that ships C++/sokol modules (the Arcade's games, Bot Lab's
// world). Each module is built twice (WebGPU and WebGL2) into <root>/dist/<name>/{webgpu,webgl2}.{js,wasm}:
//
//   1. sokol-shdc cross-compiles the module's shaders (<root>/native/shaders/*.glsl) to GLSL ES 3.0 + WGSL headers
//   2. em++ compiles the module for each backend, with the engine's runtime and vendored headers on the include path
//
// Needs the pinned Emscripten (EMSCRIPTEN_VERSION) active in the shell: `source ~/emsdk/emsdk_env.sh`.
// sokol-shdc is downloaded (pinned) into the engine's .tools/ on first use. Paths are mapped and the toolchain
// pinned, so CI can rebuild and check a committed dist/ hasn't drifted from the sources. A full build stamps
// dist/sources.sha256 with every input (the consumer's and the engine's); the consumer's unit tests check it.
//
// A consumer's scripts/build-native.mjs is a few lines:
//   import { build } from '@xlibraries/engine/build';
//   export const MODULES = { hello: { sources: ['games/hello/main.cpp'], shaders: ['shaders/hello.glsl'] } };
//   build({ root, modules: MODULES, only: process.argv.slice(2) })
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const EMSCRIPTEN_VERSION = '6.0.11';
export const SOKOL_TOOLS_COMMIT = '11d0cf678105d614d675e6d9bd2aaf3eeff12f8c';
export const BACKENDS = ['webgpu', 'webgl2'];
export const STAMP = 'dist/sources.sha256';

/** Where the engine lives (its runtime, fonts and vendored libraries are shared by every consumer). */
export const ENGINE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const COMMON = [
    '-std=c++20', '-O2', '-fno-exceptions', '-fno-rtti', '-Wall', '-Wno-missing-field-initializers',
    '-sMODULARIZE=1', '-sEXPORT_ES6=1', '-sEXPORT_NAME=createGame', '-sENVIRONMENT=web',
    '-sDYNAMIC_EXECUTION=0',          // no eval / new Function: the site's security policy forbids them
    '-sALLOW_MEMORY_GROWTH=1', '-sSTACK_SIZE=1MB', '-sEXIT_RUNTIME=0', '-sASSERTIONS=0',
    '-sINCOMING_MODULE_JS_API=arguments,canvas,print,printErr,locateFile',
];

const BACKEND_FLAGS = {
    webgl2: ['-DSOKOL_GLES3', '-sUSE_WEBGL2=1', '-sMIN_WEBGL_VERSION=2', '-sMAX_WEBGL_VERSION=2'],
    webgpu: ['-DSOKOL_WGPU', '--use-port=emdawnwebgpu'],
};

/** Jolt Physics (third_party/jolt): compiled once per toolchain into the engine's build/obj, linked into modules with `physics: true`. */
export const JOLT_DEFINES = ['-DJPH_OBJECT_LAYER_BITS=32', '-DJPH_DISABLE_CUSTOM_ALLOCATOR', '-DJPH_CROSS_PLATFORM_DETERMINISTIC', '-DNDEBUG'];
export const JOLT_INCLUDE = `-isystem${join(ENGINE_ROOT, 'third_party/jolt')}`;

/** Jolt's sources: every .cpp under Jolt/ (the ObjectStream readers and writers compile to nothing without JPH_OBJECT_STREAM). */
export function joltSources() {
    const out = [];
    const walk = (dir) => { for (const name of readdirSync(join(ENGINE_ROOT, dir)).sort()) { const rel = `${dir}/${name}`; if (statSync(join(ENGINE_ROOT, rel)).isDirectory()) walk(rel); else if (name.endsWith('.cpp')) out.push(rel); } };
    walk('third_party/jolt/Jolt');
    return out;
}

/** Compiles Jolt with em++ once (objects are reused while the sources are older), returning the object paths. */
export function compileJolt(run) {
    const outDir = join(ENGINE_ROOT, 'build/obj/jolt');
    mkdirSync(outDir, { recursive: true });
    const objects = [];
    for (const src of joltSources()) {
        const obj = join(outDir, src.replace('third_party/jolt/Jolt/', '').replace(/[\/]/g, '_').replace(/\.cpp$/, '.o'));
        let fresh = false;
        try { fresh = statSync(obj).mtimeMs > statSync(join(ENGINE_ROOT, src)).mtimeMs; } catch { /* not built yet */ }
        if (!fresh) run('em++', ['-std=c++20', '-O2', '-fno-exceptions', '-fno-rtti', `-ffile-prefix-map=${ENGINE_ROOT}=engine`, JOLT_INCLUDE, ...JOLT_DEFINES, '-c', join(ENGINE_ROOT, src), '-o', obj], ENGINE_ROOT);
        objects.push(obj);
    }
    return objects;
}

/** Include and path-mapping flags for a consumer at `root` (paths stay reproducible across machines). */
export function includeFlags(root) {
    return [
        '-Inative', `-I${join(ENGINE_ROOT, 'native/runtime')}`, `-I${join(ENGINE_ROOT, 'third_party/sokol')}`, `-I${join(ENGINE_ROOT, 'third_party')}`, '-Ibuild/gen',
        `-ffile-prefix-map=${ENGINE_ROOT}=engine`, `-ffile-prefix-map=${root}=.`,
    ];
}

/**
 * The em++ arguments for one module and backend; `objects` are precompiled C sources. A module: `sources` (relative
 * to <root>/native), `shaders`, optional `flags`, `cSources`/`cFlags` (a C library compiled separately),
 * `assets` (a folder copied beside the build), `text` (link the engine's font renderer), `fonts` (engine fonts
 * embedded as /<name>), `physics` (link Jolt and the engine's xl_physics).
 */
export function emArgs(root, modules, name, backend, objects = []) {
    const spec = modules[name];
    if (!spec) throw new Error(`unknown module: ${name}`);
    if (!BACKEND_FLAGS[backend]) throw new Error(`unknown backend: ${backend}`);
    const runtime = [...(spec.text ? [join(ENGINE_ROOT, 'native/runtime/xl_font.cpp')] : []), ...(spec.physics ? [join(ENGINE_ROOT, 'native/runtime/xl_physics.cpp')] : [])];
    const physics = spec.physics ? [JOLT_INCLUDE, ...JOLT_DEFINES] : [];
    const fonts = (spec.fonts ?? []).flatMap(f => ['--embed-file', `${join(ENGINE_ROOT, 'native/fonts', f)}@/${f}`]);
    return [...COMMON, ...includeFlags(root), ...BACKEND_FLAGS[backend], ...physics, ...(spec.flags ?? []), ...fonts, ...spec.sources.map(s => `native/${s}`), ...runtime, ...objects, '-o', `dist/${name}/${backend}.js`];
}

/**
 * A headless module (`headless: true`): no graphics, built once for pages, workers and Node (so tests can drive it),
 * into dist/<name>/headless.js. For simulations that run off the main thread, like Bot Lab's physics world. Its
 * EXPORTED_FUNCTIONS come from the module's flags; there's no main loop.
 */
export function headlessArgs(root, modules, name, objects = []) {
    const spec = modules[name];
    if (!spec) throw new Error(`unknown module: ${name}`);
    if (!spec.headless) throw new Error(`${name} isn't a headless module`);
    const runtime = spec.physics ? [join(ENGINE_ROOT, 'native/runtime/xl_physics.cpp')] : [];
    const physics = spec.physics ? [JOLT_INCLUDE, ...JOLT_DEFINES] : [];
    const common = COMMON.map(f => f === '-sENVIRONMENT=web' ? '-sENVIRONMENT=web,worker,node' : f.startsWith('-sEXPORT_NAME=') ? `-sEXPORT_NAME=${spec.exportName ?? 'createModule'}` : f);
    return [...common, ...includeFlags(root), ...physics, ...(spec.flags ?? []), ...spec.sources.map(s => `native/${s}`), ...runtime, ...objects, '-o', `dist/${name}/headless.js`];
}

/** Compiles a module's C sources (e.g. Box2D) once into build/obj/<name>/, returning the object paths. */
export function compileC(root, spec, run) {
    if (!spec.cSources) return [];
    const outDir = `build/obj/${spec.cSources.replace(/[\\/]/g, '_')}`;
    mkdirSync(join(root, outDir), { recursive: true });
    const objects = [];
    for (const file of readdirSync(join(root, spec.cSources)).filter(f => f.endsWith('.c')).sort()) {
        const obj = `${outDir}/${file.replace(/\.c$/, '.o')}`;
        run('emcc', ['-O2', '-fno-exceptions', `-ffile-prefix-map=${root}=.`, ...(spec.cFlags ?? []), '-c', `${spec.cSources}/${file}`, '-o', obj]);
        objects.push(obj);
    }
    return objects;
}

export function shdcBinaryPath(platform = process.platform, arch = process.arch) {
    if (platform === 'darwin') return arch === 'arm64' ? 'bin/osx_arm64/sokol-shdc' : 'bin/osx/sokol-shdc';
    if (platform === 'linux') return arch === 'arm64' ? 'bin/linux_arm64/sokol-shdc' : 'bin/linux/sokol-shdc';
    if (platform === 'win32') return 'bin/win32/sokol-shdc.exe';
    throw new Error(`no sokol-shdc binary for ${platform}/${arch}`);
}

async function ensureShdc() {
    const local = join(ENGINE_ROOT, '.tools', `sokol-shdc-${SOKOL_TOOLS_COMMIT.slice(0, 12)}${process.platform === 'win32' ? '.exe' : ''}`);
    if (existsSync(local)) return local;
    const url = `https://raw.githubusercontent.com/floooh/sokol-tools-bin/${SOKOL_TOOLS_COMMIT}/${shdcBinaryPath()}`;
    console.log(`▶ downloading sokol-shdc (${SOKOL_TOOLS_COMMIT.slice(0, 7)})`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`sokol-shdc download failed: ${res.status} ${url}`);
    mkdirSync(dirname(local), { recursive: true });
    writeFileSync(local, Buffer.from(await res.arrayBuffer()));
    chmodSync(local, 0o755);
    return local;
}

function checkEmscripten() {
    let version = '';
    try {
        version = execFileSync('em++', ['--version'], { encoding: 'utf8' });
    } catch {
        throw new Error(`em++ not found. Activate Emscripten ${EMSCRIPTEN_VERSION}: source ~/emsdk/emsdk_env.sh`);
    }
    if (!version.includes(EMSCRIPTEN_VERSION)) {
        throw new Error(`Emscripten ${EMSCRIPTEN_VERSION} required (found: ${version.split('\n')[0]}). Run: ~/emsdk/emsdk install ${EMSCRIPTEN_VERSION} && ~/emsdk/emsdk activate ${EMSCRIPTEN_VERSION}`);
    }
}

function walk(base, dir, out, prefix) {
    if (!existsSync(join(base, dir))) return;
    for (const name of readdirSync(join(base, dir)).sort()) {
        const rel = `${dir}/${name}`;
        if (statSync(join(base, rel)).isDirectory()) walk(base, rel, out, prefix); else out.push([`${prefix}${rel}`, join(base, rel)]);
    }
}

/** Every file a consumer's build depends on, as [label, path]: its native/ and third_party/, its build script, and the engine's. */
export function sourceFiles(root) {
    const out = [];
    walk(root, 'native', out, '');
    walk(root, 'third_party', out, '');
    if (existsSync(join(root, 'scripts/build-native.mjs'))) out.push(['scripts/build-native.mjs', join(root, 'scripts/build-native.mjs')]);
    walk(ENGINE_ROOT, 'native', out, 'engine/');
    walk(ENGINE_ROOT, 'third_party', out, 'engine/');
    out.push(['engine/scripts/build.mjs', join(ENGINE_ROOT, 'scripts/build.mjs')]);
    return out;
}

/** A hash of every build input; written to dist/ by a full build, checked by the consumer's unit tests. */
export function sourcesHash(root) {
    const hash = createHash('sha256');
    for (const [label, path] of sourceFiles(root)) { hash.update(label); hash.update('\0'); hash.update(readFileSync(path)); hash.update('\0'); }
    return hash.digest('hex');
}

/** Builds `only` (or every module) of the consumer at `root`. */
export async function build({ root, modules, only = [] }) {
    const names = only.length ? only : Object.keys(modules);
    checkEmscripten();
    const shdc = await ensureShdc();
    const run = (cmd, args, cwd = root) => execFileSync(cmd, args, { cwd, stdio: 'inherit' });

    mkdirSync(join(root, 'build/gen'), { recursive: true });
    const jolt = names.some(n => modules[n]?.physics) ? (console.log('▶ Jolt (cached objects reused)'), compileJolt(run)) : [];
    for (const name of names) {
        const spec = modules[name];
        if (!spec) throw new Error(`unknown module: ${name}`);
        for (const shader of spec.shaders ?? []) {
            const out = `build/gen/${shader.split('/').pop()}.h`;
            console.log(`▶ sokol-shdc ${shader}`);
            run(shdc, ['--input', `native/${shader}`, '--output', out, '--slang', 'glsl300es:wgsl', '--reflection']);
        }
        rmSync(join(root, 'dist', name), { recursive: true, force: true });
        mkdirSync(join(root, 'dist', name), { recursive: true });
        const objects = [...compileC(root, spec, run), ...(spec.physics ? jolt : [])];
        if (spec.headless) {
            console.log(`▶ em++ ${name} (headless)`);
            run('em++', headlessArgs(root, modules, name, objects));
            continue;
        }
        for (const backend of BACKENDS) {
            console.log(`▶ em++ ${name} (${backend})`);
            run('em++', emArgs(root, modules, name, backend, objects));
        }
        // sounds and images the page serves next to the build, and the audio worklet every module may load
        if (spec.assets) cpSync(join(root, 'native', spec.assets), join(root, 'dist', name), { recursive: true });
        cpSync(join(ENGINE_ROOT, 'native/runtime/xl-audio-worklet.js'), join(root, 'dist', name, 'xl-audio-worklet.js'));
    }
    // a full build stamps dist/ with its inputs; a partial one leaves the stamp stale on purpose, so the unit tests
    // keep failing until every module has been rebuilt (a change to the shared runtime touches them all)
    if (names.length === Object.keys(modules).length) writeFileSync(join(root, STAMP), sourcesHash(root) + '\n');
    else console.log('▶ partial build: dist/sources.sha256 not updated; run a full build before committing');
    console.log('✓ built', names.join(', '));
}
