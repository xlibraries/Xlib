// sokol-shdc as a toolchain adapter: cross-compiles annotated GLSL (native/<shader>.glsl) to a C header holding GLSL ES
// 3.0 and WGSL, for sokol_gfx. The pinned binary is downloaded once into this package's .tools/.
//
// Used directly by modules that are only shaders ("adapter": "shader-sokol", "shaders": [...]), and by other adapters
// (cpp-wasm compiles a module's shaders with it first).
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, posix } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const name = 'shader-sokol';
export const version = JSON.parse(readFileSync(join(HERE, '../package.json'), 'utf8')).version;
export const SOKOL_TOOLS_COMMIT = '11d0cf678105d614d675e6d9bd2aaf3eeff12f8c';
export const SLANGS = 'glsl300es:wgsl';
const TOOLS = join(HERE, '../.tools');

export function shdcBinaryPath(platform = process.platform, arch = process.arch) {
    if (platform === 'darwin') return arch === 'arm64' ? 'bin/osx_arm64/sokol-shdc' : 'bin/osx/sokol-shdc';
    if (platform === 'linux') return arch === 'arm64' ? 'bin/linux_arm64/sokol-shdc' : 'bin/linux/sokol-shdc';
    if (platform === 'win32') return 'bin/win32/sokol-shdc.exe';
    throw new Error(`no sokol-shdc binary for ${platform}/${arch}`);
}

/**
 * The pinned sokol-shdc, downloaded on first use.
 * @param log Where progress goes.
 * @param options `fetch` and `tools` (the folder it's kept in) can be replaced, for tests.
 * @return The binary's path.
 */
export async function ensureShdc(log = console.log, { fetch: get = fetch, tools = TOOLS, platform = process.platform, arch = process.arch } = {}) {
    const local = join(tools, `sokol-shdc-${SOKOL_TOOLS_COMMIT.slice(0, 12)}${platform === 'win32' ? '.exe' : ''}`);
    if (existsSync(local)) return local;
    const url = `https://raw.githubusercontent.com/floooh/sokol-tools-bin/${SOKOL_TOOLS_COMMIT}/${shdcBinaryPath(platform, arch)}`;
    log(`▶ downloading sokol-shdc (${SOKOL_TOOLS_COMMIT.slice(0, 7)})`);
    const res = await get(url);
    if (!res.ok) throw new Error(`sokol-shdc download failed: ${res.status} ${url}`);
    mkdirSync(tools, { recursive: true });
    writeFileSync(local, Buffer.from(await res.arrayBuffer()));
    chmodSync(local, 0o755);
    return local;
}

/** Where a shader's header goes (on the include path of the module that uses it). */
export const headerOf = (shader) => `build/gen/${posix.basename(shader)}.h`;

/**
 * The sokol-shdc arguments for one shader.
 * @param shader Its path, relative to `dir`.
 * @param dir The folder (relative to the package) shaders are named from: a module's native/, or a provider's own root.
 */
export const shdcArgs = (shader, dir = 'native') => ['--input', posix.join(dir, shader), '--output', headerOf(shader), '--slang', SLANGS, '--reflection'];

/**
 * Compiles shaders into build/gen/.
 * @param root The package's folder.
 * @param shaders Paths relative to `dir`.
 * @param log Where progress goes.
 * @param options `dir` (default native/; a provider's shaders are named from its root, '.'); `exec` (runs a command)
 * and `shdc` (the binary, skipping the download) can be replaced, for tests.
 */
export async function compileShaders(root, shaders, log = console.log, { exec = execFileSync, shdc, dir = 'native' } = {}) {
    if (!shaders?.length) return;
    const binary = shdc ?? await ensureShdc(log);
    mkdirSync(join(root, 'build/gen'), { recursive: true });
    for (const shader of shaders) {
        log(`  sokol-shdc ${shader}`);
        exec(binary, shdcArgs(shader, dir), { cwd: root, stdio: 'inherit' });
    }
}

/** For other adapters' fingerprints: what changes this adapter's output. */
export const fingerprintLines = () => [`sokol-shdc ${SOKOL_TOOLS_COMMIT}`, `slang ${SLANGS}`];

// ---- as an adapter of its own ----

export const inputs = (ctx) => (ctx.spec.shaders ?? []).map((s) => ({ label: `native/${s}`, path: join(ctx.root, 'native', s) }));
export const fingerprint = () => fingerprintLines();
export const outputs = (ctx) => (ctx.spec.shaders ?? []).map(headerOf);
export async function build(ctx, { log = console.log, exec, shdc } = {}) { await compileShaders(ctx.root, ctx.spec.shaders, log, { exec, shdc }); }
