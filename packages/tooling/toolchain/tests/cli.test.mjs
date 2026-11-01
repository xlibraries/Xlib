import { afterAll, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { main } from '../src/cli.mjs';

const BIN = join(dirname(fileURLToPath(import.meta.url)), '../bin/xl-build.mjs');
const roots = [];
afterAll(() => { for (const r of roots) rmSync(r, { recursive: true, force: true }); });

/** A package with two modules built by a fake adapter that copies a file; output collected. */
function setup() {
    const root = mkdtempSync(join(tmpdir(), 'xl-build-'));
    roots.push(root);
    const write = (path, body) => { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), typeof body === 'string' ? body : JSON.stringify(body)); };
    write('package.json', { name: '@s/game', version: '1.0.0', xlibraries: { modules: { one: { adapter: 'copy', source: 'one.txt' }, two: { adapter: 'copy', source: 'two.txt' } } } });
    write('one.txt', 'one');
    write('two.txt', 'two');
    write('node_modules/@xlibraries/adapter-copy/package.json', { name: '@xlibraries/adapter-copy', version: '1.0.0', type: 'module', exports: './index.mjs' });
    write('node_modules/@xlibraries/adapter-copy/index.mjs', `
        import { copyFileSync, mkdirSync } from 'node:fs';
        import { join } from 'node:path';
        export const name = 'copy', version = '1.0.0';
        export const inputs = (ctx) => [{ label: ctx.spec.source, path: join(ctx.root, ctx.spec.source) }];
        export const fingerprint = () => [];
        export const outputs = (ctx) => ['dist/' + ctx.name + '/out.txt'];
        export async function build(ctx) { mkdirSync(join(ctx.root, 'dist', ctx.name), { recursive: true }); copyFileSync(join(ctx.root, ctx.spec.source), join(ctx.root, 'dist', ctx.name, 'out.txt')); }
    `);
    const out = [], err = [];
    return { root, write, out, err, io: { cwd: root, log: (l) => out.push(l), error: (l) => err.push(l) } };
}

describe('xl-build', () => {
    it('builds what is out of date, then checks every module against its sources', async () => {
        const { root, write, out, err, io } = setup();
        expect(await main(['--check'], io)).toBe(1);
        expect(err.at(-1)).toBe('out of date: one, two (run xl-build)');
        expect(await main([], io)).toBe(0);
        expect(out.at(-1)).toBe('✓ built one, two');
        expect(await main(['--check'], io)).toBe(0);
        expect(out.at(-1)).toBe('✓ every module matches its sources');
        write('two.txt', 'changed');
        expect(await main(['--check', 'one'], io)).toBe(0);   // just the ones named
        expect(await main(['--check'], io)).toBe(1);
        expect(await main([], io)).toBe(0);
        expect(out.at(-1)).toBe('✓ built two; up to date: one');
        expect(readFileSync(join(root, 'dist/two/out.txt'), 'utf8')).toBe('changed');
    });

    it('rebuilds everything with --force, or just the modules named', async () => {
        const { out, io } = setup();
        await main([], io);
        expect(await main(['--force'], io)).toBe(0);
        expect(out.at(-1)).toBe('✓ built one, two');
        expect(await main(['one', '--force'], io)).toBe(0);
        expect(out.at(-1)).toBe('✓ built one');
    });

    it('fails with the reason: an unknown module, an adapter the package does not declare', async () => {
        const { write, err, io } = setup();
        expect(await main(['three'], io)).toBe(1);
        expect(err.at(-1)).toMatch(/unknown module: three/);
        write('package.json', { name: '@s/game', version: '1.0.0', xlibraries: { modules: { one: { adapter: 'nope', source: 'one.txt' } } } });
        expect(await main([], io)).toBe(1);
        expect(err.at(-1)).toMatch(/@xlibraries\/adapter-nope/);
    });

    it('exits with its code when run as a command', () => {
        const { root } = setup();
        expect(spawnSync(process.execPath, [BIN, '--check'], { cwd: root, encoding: 'utf8' }).status).toBe(1);
        const built = spawnSync(process.execPath, [BIN], { cwd: root, encoding: 'utf8' });
        expect(built.status).toBe(0);
        expect(built.stdout).toContain('✓ built one, two');
    });
});
