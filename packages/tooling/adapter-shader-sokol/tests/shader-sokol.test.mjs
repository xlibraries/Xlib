import { afterAll, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SLANGS, SOKOL_TOOLS_COMMIT, build, compileShaders, ensureShdc, fingerprint, headerOf, inputs, name, outputs, shdcArgs, shdcBinaryPath } from '../src/index.mjs';

describe('sokol-shdc', () => {
    it('knows where the pinned binary lives for each platform', () => {
        expect(shdcBinaryPath('darwin', 'arm64')).toBe('bin/osx_arm64/sokol-shdc');
        expect(shdcBinaryPath('linux', 'x64')).toBe('bin/linux/sokol-shdc');
        expect(shdcBinaryPath('win32', 'x64')).toBe('bin/win32/sokol-shdc.exe');
        expect(() => shdcBinaryPath('aix', 'ppc')).toThrow(/no sokol-shdc binary/);
    });

    it('writes each shader to a header on the build include path, for WebGL2 and WebGPU', () => {
        expect(headerOf('shaders/jyotirath.glsl')).toBe('build/gen/jyotirath.glsl.h');
        expect(SLANGS).toBe('glsl300es:wgsl');
    });

    it('as an adapter: its shaders in, their headers out, the pinned tool in its fingerprint', () => {
        const ctx = { root: '/pkg', name: 'fx', spec: { adapter: name, shaders: ['shaders/a.glsl'] } };
        expect(inputs(ctx)).toEqual([{ label: 'native/shaders/a.glsl', path: '/pkg/native/shaders/a.glsl' }]);
        expect(outputs(ctx)).toEqual(['build/gen/a.glsl.h']);
        expect(fingerprint(ctx)).toContain(`sokol-shdc ${SOKOL_TOOLS_COMMIT}`);
    });
});

describe('getting and running sokol-shdc', () => {
    const dirs = [];
    afterAll(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); });
    const temp = () => { const d = mkdtempSync(join(tmpdir(), 'shdc-')); dirs.push(d); return d; };
    const quiet = () => {};

    it('downloads the pinned binary for the platform once, executable, then reuses it', async () => {
        const tools = temp(), urls = [];
        const get = async (url) => { urls.push(url); return { ok: true, arrayBuffer: async () => new TextEncoder().encode('binary').buffer }; };
        const path = await ensureShdc(quiet, { fetch: get, tools, platform: 'linux', arch: 'x64' });
        expect(urls).toEqual([`https://raw.githubusercontent.com/floooh/sokol-tools-bin/${SOKOL_TOOLS_COMMIT}/bin/linux/sokol-shdc`]);
        expect(readFileSync(path, 'utf8')).toBe('binary');
        expect(statSync(path).mode & 0o111).not.toBe(0);
        expect(await ensureShdc(quiet, { fetch: get, tools, platform: 'linux', arch: 'x64' })).toBe(path);
        expect(urls).toHaveLength(1);
    });

    it('fails loudly when the download fails', async () => {
        await expect(ensureShdc(quiet, { fetch: async () => ({ ok: false, status: 404 }), tools: temp(), platform: 'linux', arch: 'x64' })).rejects.toThrow(/download failed: 404/);
    });

    it('compiles each shader into build/gen with the binary it is given, and does nothing without shaders', async () => {
        const root = temp(), calls = [];
        const exec = (cmd, args, opts) => { calls.push([cmd, args, opts.cwd]); };
        await compileShaders(root, ['shaders/a.glsl', 'shaders/b.glsl'], quiet, { exec, shdc: '/bin/shdc' });
        expect(calls).toEqual([['/bin/shdc', shdcArgs('shaders/a.glsl'), root], ['/bin/shdc', shdcArgs('shaders/b.glsl'), root]]);
        expect(shdcArgs('shaders/a.glsl')).toEqual(['--input', 'native/shaders/a.glsl', '--output', 'build/gen/a.glsl.h', '--slang', 'glsl300es:wgsl', '--reflection']);
        expect(existsSync(join(root, 'build/gen'))).toBe(true);
        calls.length = 0;
        await compileShaders(root, [], quiet, { exec, shdc: '/bin/shdc' });
        await build({ root, spec: { shaders: ['shaders/a.glsl'] } }, { log: quiet, exec, shdc: '/bin/shdc' });
        expect(calls).toHaveLength(1);
    });
});

describe('defaults and platforms', () => {
    it('knows the binary for every platform it supports', () => {
        expect(shdcBinaryPath('darwin', 'x64')).toBe('bin/osx/sokol-shdc');
        expect(shdcBinaryPath('linux', 'arm64')).toBe('bin/linux_arm64/sokol-shdc');
        expect(typeof shdcBinaryPath()).toBe('string');   // this machine's
    });

    it('names a Windows binary .exe, and logs progress where told (the console by default)', async () => {
        const dir = mkdtempSync(join(tmpdir(), 'shdc-win-'));
        const lines = [];
        const get = async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(1) });
        const path = await ensureShdc((l) => lines.push(l), { fetch: get, tools: dir, platform: 'win32', arch: 'x64' });
        expect(path.endsWith('.exe')).toBe(true);
        expect(lines[0]).toMatch(/downloading sokol-shdc/);
        const log = vi.spyOn(console, 'log').mockImplementation(() => {});
        await compileShaders(dir, ['shaders/a.glsl'], undefined, { exec: () => {}, shdc: '/bin/shdc' });
        expect(log).toHaveBeenCalledWith('  sokol-shdc shaders/a.glsl');
        log.mockRestore();
        rmSync(dir, { recursive: true, force: true });
    });

    it('as an adapter, with nothing to compile', async () => {
        const ctx = { root: '/pkg', name: 'none', spec: {} };
        expect(inputs(ctx)).toEqual([]);
        expect(outputs(ctx)).toEqual([]);
        await build(ctx);   // no shaders: nothing runs, nothing downloads
    });
});
