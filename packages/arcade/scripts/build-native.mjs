#!/usr/bin/env node
// Builds every Arcade game twice (WebGPU and WebGL2) into dist/<game>/{webgpu,webgl2}.{js,wasm}.
//
//   1. sokol-shdc cross-compiles each game's shaders (native/shaders/*.glsl) to GLSL ES 3.0 + WGSL headers
//   2. em++ compiles the game for each backend
//
// Needs the pinned Emscripten (EMSCRIPTEN_VERSION) active in the shell: `source ~/emsdk/emsdk_env.sh`.
// sokol-shdc is downloaded (pinned) into .tools/ on first use. Paths are relative and the toolchain pinned, so CI
// can rebuild and check the committed dist/ hasn't drifted from the sources.
//
// Usage: node scripts/build-native.mjs [game ...]
import { execFileSync } from 'node:child_process';
import { chmodSync, cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const EMSCRIPTEN_VERSION = '6.0.11';
export const SOKOL_TOOLS_COMMIT = '11d0cf678105d614d675e6d9bd2aaf3eeff12f8c';
export const BACKENDS = ['webgpu', 'webgl2'];

/** Each game: its sources and shaders (paths relative to native/), and any extra em++ flags. */
export const GAMES = {
    hello: { sources: ['games/hello/main.cpp'], shaders: ['shaders/hello.glsl'] },
    breakout: { sources: ['games/breakout/main.cpp', 'games/breakout/logic.cpp'], shaders: [] },
    showcase: { sources: ['games/showcase/main.cpp', 'games/showcase/scene.cpp'], shaders: ['shaders/showcase.glsl'] },
    // the page passes shader source in, so it needs string helpers
    playground: { sources: ['games/playground/main.cpp'], shaders: [], flags: ['-sEXPORTED_RUNTIME_METHODS=stringToNewUTF8', '-sEXPORTED_FUNCTIONS=_main,_free'] },
    'turbo-trails': {
        sources: ['games/turbo-trails/main.cpp', 'games/turbo-trails/physics_box2d.cpp', 'games/turbo-trails/terrain.cpp', 'games/turbo-trails/rules.cpp', 'games/turbo-trails/eras.cpp', 'games/turbo-trails/feel.cpp', 'games/turbo-trails/font.cpp'],
        // Box2D v3 (C), compiled separately with emcc; scalar maths (its SIMD paths need SSE emulation)
        cSources: 'third_party/box2d/src',
        cFlags: ['-std=gnu17', '-DBOX2D_DISABLE_SIMD', '-Ithird_party/box2d/include', '-Ithird_party/box2d/src'],
        shaders: ['shaders/turbo-trails.glsl'],
        // the HUD font (Lilita One, OFL) rides inside the wasm
        flags: ['-Ithird_party/box2d/include', '-sEXPORTED_RUNTIME_METHODS=UTF8ToString', '-sEXPORTED_FUNCTIONS=_main,_free', '--embed-file', 'native/fonts/LilitaOne-Regular.ttf@/font.ttf'],
        assets: 'games/turbo-trails/assets',
    },
};

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const COMMON = [
    '-std=c++20', '-O2', '-fno-exceptions', '-fno-rtti', '-Wall', '-Wno-missing-field-initializers',
    '-Inative/runtime', '-Ithird_party/sokol', '-Ithird_party', '-Ibuild/gen',
    `-ffile-prefix-map=${ROOT}=.`,
    '-sMODULARIZE=1', '-sEXPORT_ES6=1', '-sEXPORT_NAME=createGame', '-sENVIRONMENT=web',
    '-sDYNAMIC_EXECUTION=0',          // no eval / new Function: the site's security policy forbids them
    '-sALLOW_MEMORY_GROWTH=1', '-sSTACK_SIZE=1MB', '-sEXIT_RUNTIME=0', '-sASSERTIONS=0',
    '-sINCOMING_MODULE_JS_API=arguments,canvas,print,printErr,locateFile',
];

const BACKEND_FLAGS = {
    webgl2: ['-DSOKOL_GLES3', '-sUSE_WEBGL2=1', '-sMIN_WEBGL_VERSION=2', '-sMAX_WEBGL_VERSION=2'],
    webgpu: ['-DSOKOL_WGPU', '--use-port=emdawnwebgpu'],
};

/** The em++ arguments for one game and backend (exported for tests); `objects` are precompiled C sources. */
export function emArgs(game, backend, objects = []) {
    const spec = GAMES[game];
    if (!spec) throw new Error(`unknown game: ${game}`);
    if (!BACKEND_FLAGS[backend]) throw new Error(`unknown backend: ${backend}`);
    return [...COMMON, ...BACKEND_FLAGS[backend], ...(spec.flags ?? []), ...spec.sources.map(s => `native/${s}`), ...objects, '-o', `dist/${game}/${backend}.js`];
}

/** Compiles a game's C sources (e.g. Box2D) once into build/obj/<name>/, returning the object paths. */
function compileC(spec, run) {
    if (!spec.cSources) return [];
    const outDir = `build/obj/${spec.cSources.replace(/[\\/]/g, '_')}`;
    mkdirSync(join(ROOT, outDir), { recursive: true });
    const objects = [];
    for (const file of readdirSync(join(ROOT, spec.cSources)).filter(f => f.endsWith('.c')).sort()) {
        const obj = `${outDir}/${file.replace(/\.c$/, '.o')}`;
        run('emcc', ['-O2', '-fno-exceptions', `-ffile-prefix-map=${ROOT}=.`, ...(spec.cFlags ?? []), '-c', `${spec.cSources}/${file}`, '-o', obj]);
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
    const local = join(ROOT, '.tools', `sokol-shdc-${SOKOL_TOOLS_COMMIT.slice(0, 12)}${process.platform === 'win32' ? '.exe' : ''}`);
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

async function main() {
    const games = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(GAMES);
    checkEmscripten();
    const shdc = await ensureShdc();
    const run = (cmd, args) => execFileSync(cmd, args, { cwd: ROOT, stdio: 'inherit' });

    mkdirSync(join(ROOT, 'build/gen'), { recursive: true });
    for (const game of games) {
        for (const shader of GAMES[game].shaders) {
            const out = `build/gen/${shader.split('/').pop()}.h`;
            console.log(`▶ sokol-shdc ${shader}`);
            run(shdc, ['--input', `native/${shader}`, '--output', out, '--slang', 'glsl300es:wgsl', '--reflection']);
        }
        rmSync(join(ROOT, 'dist', game), { recursive: true, force: true });
        mkdirSync(join(ROOT, 'dist', game), { recursive: true });
        const objects = compileC(GAMES[game], run);
        for (const backend of BACKENDS) {
            console.log(`▶ em++ ${game} (${backend})`);
            run('em++', emArgs(game, backend, objects));
        }
        // sounds and images the page serves next to the build, and the audio worklet every game may load
        if (GAMES[game].assets) cpSync(join(ROOT, 'native', GAMES[game].assets), join(ROOT, 'dist', game), { recursive: true });
        cpSync(join(ROOT, 'native/runtime/xl-audio-worklet.js'), join(ROOT, 'dist', game, 'xl-audio-worklet.js'));
    }
    console.log('✓ built', games.join(', '));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    main().catch((err) => { console.error(err.message); process.exit(1); });
}
