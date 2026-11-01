// C++ to WebAssembly as a toolchain adapter: em++ (pinned Emscripten) builds a module twice, for WebGPU and WebGL2,
// into dist/<name>/{webgpu,webgl2}.{js,wasm}; or once, headless (no graphics; for pages, workers and Node), into
// dist/<name>/headless.{js,wasm}. Its shaders go through @xlibraries/adapter-shader-sokol first.
//
// A module (package.json "xlibraries.modules.<name>"):
//   sources      C++ files, relative to native/
//   shaders      GLSL files, relative to native/
//   uses         providers (packages offering native code), in link order; each describes itself in
//                "xlibraries.native", and using one links all of it:
//                  prefix     the name its paths are mapped to (reproducible builds)
//                  include    folders on the include path
//                  link       sources compiled into every module that uses it
//                  libraries  sets of sources compiled once and linked: { sources (a folder), isystem, defines }
//                  fonts      the folder fonts are embedded from
//                  assets     files copied beside every graphical build
//   fonts        provider fonts to embed, served at /<file>
//   cLibraries   C sources of the module's own: [{ sources (a folder), flags }], compiled with emcc
//   flags        extra em++ flags; assets: a folder under native/ copied beside the build
//   headless     no graphics: one build for pages, workers and Node; exportName: its factory's name
//
// Inputs (for the stamp): the sources, shaders, fonts and assets, the providers' linked and library sources, and
// every header they include, transitively, resolved like the compiler would.
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { dirname, join, posix, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileShaders, fingerprintLines as shaderFingerprint, headerOf } from '@xlibraries/adapter-shader-sokol';

const HERE = dirname(fileURLToPath(import.meta.url));
export const name = 'cpp-wasm';
export const version = JSON.parse(readFileSync(join(HERE, '../package.json'), 'utf8')).version;
export const EMSCRIPTEN_VERSION = '6.0.11';
export const BACKENDS = ['webgpu', 'webgl2'];

export const COMMON = [
    '-std=c++20', '-O2', '-fno-exceptions', '-fno-rtti', '-Wall', '-Wno-missing-field-initializers',
    '-sMODULARIZE=1', '-sEXPORT_ES6=1', '-sEXPORT_NAME=createGame', '-sENVIRONMENT=web',
    '-sDYNAMIC_EXECUTION=0',          // no eval / new Function: the site's security policy forbids them
    '-sALLOW_MEMORY_GROWTH=1', '-sSTACK_SIZE=1MB', '-sEXIT_RUNTIME=0', '-sASSERTIONS=0',
    '-sINCOMING_MODULE_JS_API=arguments,canvas,print,printErr,locateFile',
];

export const BACKEND_FLAGS = {
    webgl2: ['-DSOKOL_GLES3', '-sUSE_WEBGL2=1', '-sMIN_WEBGL_VERSION=2', '-sMAX_WEBGL_VERSION=2'],
    webgpu: ['-DSOKOL_WGPU', '--use-port=emdawnwebgpu'],
};

const toPosix = (p) => p.split(sep).join(posix.sep);

/** Files under a folder, sorted, as paths relative to base. */
function walk(base, dir, keep = () => true) {
    if (!existsSync(join(base, dir))) return [];
    return readdirSync(join(base, dir)).sort().flatMap((n) => {
        const rel = posix.join(dir, n);
        return statSync(join(base, rel)).isDirectory() ? walk(base, rel, keep) : keep(rel) ? [rel] : [];
    });
}

/**
 * The libraries a module's providers bring, compiled once each and linked.
 * @param ctx The module's context.
 * @return [{ provider, name, sources, isystem, defines }], in the providers' order.
 */
export function libraries(ctx) {
    return ctx.providers.flatMap((p) => Object.entries(p.native.libraries ?? {}).map(([name, spec]) => ({ provider: p, name, ...spec })));
}

const libraryFlags = (ctx) => libraries(ctx).flatMap((l) => [...(l.isystem ?? []).map((d) => `-isystem${join(l.provider.root, d)}`), ...(l.defines ?? [])]);

/** Include and path-mapping flags (paths stay reproducible across machines). */
export function includeFlags(ctx) {
    return [
        '-Inative', ...ctx.providers.flatMap((p) => (p.native.include ?? []).map((d) => `-I${join(p.root, d)}`)), '-Ibuild/gen',
        ...ctx.providers.map((p) => `-ffile-prefix-map=${p.root}=${p.native.prefix}`), `-ffile-prefix-map=${ctx.root}=.`,
    ];
}

/** The providers' `link` sources, in `uses` order. */
const linkedSources = (ctx) => ctx.providers.flatMap((p) => (p.native.link ?? []).map((s) => join(p.root, s)));
const fontFlags = (ctx) => (ctx.spec.fonts ?? []).flatMap((f) => {
    const p = ctx.providers.find((pr) => pr.native.fonts && existsSync(join(pr.root, pr.native.fonts, f)));
    if (!p) throw new Error(`${ctx.name}: no provider has the font ${f}`);
    return ['--embed-file', `${join(p.root, p.native.fonts, f)}@/${f}`];
});

/** The em++ arguments for one backend; `objects` are precompiled libraries. */
export function emArgs(ctx, backend, objects = []) {
    if (!BACKEND_FLAGS[backend]) throw new Error(`unknown backend: ${backend}`);
    const { spec } = ctx;
    return [...COMMON, ...includeFlags(ctx), ...BACKEND_FLAGS[backend], ...libraryFlags(ctx), ...(spec.flags ?? []), ...fontFlags(ctx), ...spec.sources.map((s) => `native/${s}`), ...linkedSources(ctx), ...objects, '-o', `dist/${ctx.name}/${backend}.js`];
}

/** The em++ arguments for a headless module: one build for pages, workers and Node, no graphics backend. */
export function headlessArgs(ctx, objects = []) {
    const { spec } = ctx;
    if (!spec.headless) throw new Error(`${ctx.name} isn't a headless module`);
    const common = COMMON.map((f) => f === '-sENVIRONMENT=web' ? '-sENVIRONMENT=web,worker,node' : f.startsWith('-sEXPORT_NAME=') ? `-sEXPORT_NAME=${spec.exportName ?? 'createModule'}` : f);
    return [...common, ...includeFlags(ctx), ...libraryFlags(ctx), ...(spec.flags ?? []), ...spec.sources.map((s) => `native/${s}`), ...linkedSources(ctx), ...objects, '-o', `dist/${ctx.name}/headless.js`];
}

export const outputs = (ctx) => ctx.spec.headless
    ? [`dist/${ctx.name}/headless.js`, `dist/${ctx.name}/headless.wasm`]
    : BACKENDS.flatMap((b) => [`dist/${ctx.name}/${b}.js`, `dist/${ctx.name}/${b}.wasm`]);

export function fingerprint(ctx) {
    const spec = Object.fromEntries(Object.entries(ctx.spec).filter(([k]) => k !== 'uses' && k !== 'adapter'));   // providers are stamped by the core
    return [`emscripten ${EMSCRIPTEN_VERSION}`, `common ${COMMON.join(' ')}`, `backends ${JSON.stringify(ctx.spec.headless ? 'headless' : BACKEND_FLAGS)}`, `module ${JSON.stringify(spec)}`, ...(ctx.spec.shaders?.length ? shaderFingerprint() : [])];
}

// ---- inputs: the sources and everything they include ----

const INCLUDE = /^\s*#\s*include\s*[<"]([^>"]+)[>"]/gm;
const scanned = new Map();
function includesOf(file) {
    if (!scanned.has(file)) scanned.set(file, [...readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '').matchAll(INCLUDE)].map((m) => m[1]));
    return scanned.get(file);
}

/** Every file `files` include, transitively, searching their own folder then `dirs`. Unresolved (system) headers are skipped. */
export function includeClosure(files, dirs) {
    const seen = new Set(), queue = [...files];
    while (queue.length) {
        const file = queue.pop();
        if (seen.has(file)) continue;
        seen.add(file);
        for (const spec of includesOf(file)) {
            const hit = [dirname(file), ...dirs].map((d) => join(d, spec)).find((p) => existsSync(p) && statSync(p).isFile());
            if (hit && !seen.has(hit)) queue.push(hit);
        }
    }
    return [...seen];
}

export function inputs(ctx) {
    const { root, spec } = ctx;
    const label = (path) => {
        for (const p of ctx.providers) if (path.startsWith(p.root + sep)) return `${p.name}/${toPosix(relative(p.root, path))}`;
        return toPosix(relative(root, path));
    };
    const flagDirs = (spec.flags ?? []).filter((f) => f.startsWith('-I')).map((f) => join(root, f.slice(2)));
    const libs = libraries(ctx);
    const dirs = [join(root, 'native'), ...ctx.providers.flatMap((p) => (p.native.include ?? []).map((d) => join(p.root, d))), ...flagDirs, ...libs.flatMap((l) => (l.isystem ?? []).map((d) => join(l.provider.root, d)))];
    const roots = [
        ...spec.sources.map((s) => join(root, 'native', s)),
        ...linkedSources(ctx),
        ...libs.flatMap((l) => walk(l.provider.root, l.sources, (f) => f.endsWith('.cpp')).map((f) => join(l.provider.root, f))),
        ...(spec.cLibraries ?? []).flatMap((c) => walk(root, c.sources, (f) => f.endsWith('.c')).map((f) => join(root, f))),
    ];
    const files = [
        ...includeClosure(roots, dirs),
        ...(spec.shaders ?? []).map((s) => join(root, 'native', s)),
        ...fontFlags(ctx).filter((_, i) => i % 2 === 1).map((f) => f.split('@')[0]),
        ...(spec.assets && !spec.headless ? walk(root, posix.join('native', spec.assets)).map((f) => join(root, f)) : []),
        ...(!spec.headless ? ctx.providers.flatMap((p) => (p.native.assets ?? []).map((a) => join(p.root, a))) : []),
    ];
    return files.map((path) => ({ label: label(path), path }));
}

// ---- building ----

/**
 * Checks that the pinned Emscripten is the one on the PATH.
 * @param exec Runs a command and returns its output (replaceable, for tests).
 * @throws If em++ is missing or a different version.
 */
export function checkEmscripten(exec = execFileSync) {
    let found = '';
    try {
        found = String(exec('em++', ['--version'], { encoding: 'utf8' }));
    } catch {
        throw new Error(`em++ not found. Activate Emscripten ${EMSCRIPTEN_VERSION}: source ~/emsdk/emsdk_env.sh`);
    }
    if (!found.includes(EMSCRIPTEN_VERSION)) throw new Error(`Emscripten ${EMSCRIPTEN_VERSION} required (found: ${found.split('\n')[0]}). Run: ~/emsdk/emsdk install ${EMSCRIPTEN_VERSION} && ~/emsdk/emsdk activate ${EMSCRIPTEN_VERSION}`);
}

/** Compiles a provider's library with em++ once (objects reused while newer than their sources) into its build/obj/<name>/. */
export function compileLibrary(lib, run) {
    const root = lib.provider.root;
    const outDir = join(root, 'build/obj', lib.name);
    mkdirSync(outDir, { recursive: true });
    return walk(root, lib.sources, (f) => f.endsWith('.cpp')).map((src) => {
        const obj = join(outDir, src.slice(lib.sources.length + 1).replace(/[/]/g, '_').replace(/\.cpp$/, '.o'));
        let fresh = false;
        try { fresh = statSync(obj).mtimeMs > statSync(join(root, src)).mtimeMs; } catch { /* not built yet */ }
        if (!fresh) run('em++', ['-std=c++20', '-O2', '-fno-exceptions', '-fno-rtti', `-ffile-prefix-map=${root}=${lib.provider.native.prefix}`, ...(lib.isystem ?? []).map((d) => `-isystem${join(root, d)}`), ...(lib.defines ?? []), '-c', join(root, src), '-o', obj], root);
        return obj;
    });
}

/** Compiles the module's own C libraries with emcc into build/obj/<folder>/. */
export function compileC(ctx, run) {
    return (ctx.spec.cLibraries ?? []).flatMap((c) => {
        const outDir = `build/obj/${c.sources.replace(/[\\/]/g, '_')}`;
        mkdirSync(join(ctx.root, outDir), { recursive: true });
        return readdirSync(join(ctx.root, c.sources)).filter((f) => f.endsWith('.c')).sort().map((file) => {
            const obj = `${outDir}/${file.replace(/\.c$/, '.o')}`;
            run('emcc', ['-O2', '-fno-exceptions', `-ffile-prefix-map=${ctx.root}=.`, ...(c.flags ?? []), '-c', `${c.sources}/${file}`, '-o', obj]);
            return obj;
        });
    });
}

/**
 * Builds a module: its shaders, its C libraries, its providers' libraries, then em++ for each backend (or once,
 * headless), and copies the assets beside the build.
 * @param ctx The module's context (from the toolchain).
 * @param options `log`; `exec` (runs a command) and `shdc` (the shader compiler) can be replaced, for tests.
 */
export async function build(ctx, { log = console.log, exec = execFileSync, shdc } = {}) {
    checkEmscripten(exec);
    const { root, spec } = ctx;
    const run = (cmd, args, cwd = root) => exec(cmd, args, { cwd, stdio: 'inherit' });
    await compileShaders(root, spec.shaders, log, { exec, shdc });
    const objects = [...compileC(ctx, run), ...libraries(ctx).flatMap((l) => compileLibrary(l, run))];
    rmSync(join(root, 'dist', ctx.name), { recursive: true, force: true });
    mkdirSync(join(root, 'dist', ctx.name), { recursive: true });
    if (spec.headless) {
        log('  em++ (headless)');
        run('em++', headlessArgs(ctx, objects));
        return;
    }
    for (const backend of BACKENDS) {
        log(`  em++ (${backend})`);
        run('em++', emArgs(ctx, backend, objects));
    }
    // sounds and images the page serves next to the build, and the providers' (e.g. the audio worklet)
    if (spec.assets) cpSync(join(root, 'native', spec.assets), join(root, 'dist', ctx.name), { recursive: true });
    for (const p of ctx.providers) for (const a of p.native.assets ?? []) cpSync(join(p.root, a), join(root, 'dist', ctx.name, posix.basename(a)));
}

export { headerOf };
