import { afterAll, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { build, check, context, manifest, stamp } from '../src/index.mjs';

const roots = [];
afterAll(() => { for (const r of roots) rmSync(r, { recursive: true, force: true }); });

/** A package with two modules, a fake adapter that copies its source to dist/, and a provider. */
function workspace() {
    const root = mkdtempSync(join(tmpdir(), 'toolchain-'));
    roots.push(root);
    const write = (path, body) => { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), typeof body === 'string' ? body : JSON.stringify(body)); };
    write('package.json', { name: '@s/game', version: '1.0.0', xlibraries: { modules: {
        one: { adapter: 'copy', uses: ['@s/engine'], source: 'one.txt' },
        two: { adapter: 'copy', source: 'two.txt' },
        stray: { adapter: 'missing' },
    } } });
    write('one.txt', 'one');
    write('two.txt', 'two');
    write('node_modules/@s/engine/package.json', { name: '@s/engine', version: '1.0.0', xlibraries: { native: { prefix: 'engine' } } });
    write('node_modules/@s/plain/package.json', { name: '@s/plain', version: '1.0.0' });
    write('node_modules/@xlibraries/adapter-copy/package.json', { name: '@xlibraries/adapter-copy', version: '2.0.0', type: 'module', exports: './index.mjs' });
    write('node_modules/@xlibraries/adapter-copy/index.mjs', `
        import { copyFileSync, mkdirSync } from 'node:fs';
        import { join } from 'node:path';
        export const name = 'copy', version = '2.0.0';
        export const inputs = (ctx) => [{ label: ctx.spec.source, path: join(ctx.root, ctx.spec.source) }];
        export const fingerprint = (ctx) => ['copy v2', 'providers ' + ctx.providers.length];
        export const outputs = (ctx) => ['dist/' + ctx.name + '/out.txt'];
        export async function build(ctx) { mkdirSync(join(ctx.root, 'dist', ctx.name), { recursive: true }); copyFileSync(join(ctx.root, ctx.spec.source), join(ctx.root, 'dist', ctx.name, 'out.txt')); }
    `);
    return { root, write };
}

const quiet = () => {};

describe('the toolchain core', () => {
    it('builds each module through its adapter and stamps it; a second build skips what is up to date', async () => {
        const { root } = workspace();
        expect(await build({ root, only: ['one', 'two'], log: quiet })).toEqual({ built: ['one', 'two'], skipped: [] });
        expect(readFileSync(join(root, 'dist/one/out.txt'), 'utf8')).toBe('one');
        const saved = JSON.parse(readFileSync(join(root, 'dist/one/stamp.json'), 'utf8'));
        expect(saved.hash).toMatch(/^[0-9a-f]{64}$/);
        expect(saved.toolchain).toEqual(expect.arrayContaining(['adapter-copy@2.0.0', 'copy v2', 'provider @s/engine@1.0.0']));
        expect(await build({ root, only: ['one', 'two'], log: quiet })).toEqual({ built: [], skipped: ['one', 'two'] });
        expect((await build({ root, only: ['two'], force: true, log: quiet })).built).toEqual(['two']);
    });

    it('rebuilds only the module whose inputs changed, and check says which are stale', async () => {
        const { root, write } = workspace();
        await build({ root, only: ['one', 'two'], log: quiet });
        write('two.txt', 'two, changed');
        expect((await check(root, 'one')).current).toBe(true);
        expect((await check(root, 'two')).current).toBe(false);
        expect(await build({ root, only: ['one', 'two'], log: quiet })).toEqual({ built: ['two'], skipped: ['one'] });
        expect((await check(root, 'two')).current).toBe(true);
    });

    it('goes stale when a provider releases a new version', async () => {
        const { root, write } = workspace();
        await build({ root, only: ['one'], log: quiet });
        write('node_modules/@s/engine/package.json', { name: '@s/engine', version: '1.1.0', xlibraries: { native: { prefix: 'engine' } } });
        expect((await check(root, 'one')).current).toBe(false);
    });

    it('rebuilds a module whose outputs are missing, even with a current stamp', async () => {
        const { root } = workspace();
        await build({ root, only: ['one'], log: quiet });
        rmSync(join(root, 'dist/one/out.txt'));
        expect((await build({ root, only: ['one'], log: quiet })).built).toEqual(['one']);
    });

    it('says what is wrong: an unknown module, an adapter not declared, a provider with no native code', async () => {
        const { root, write } = workspace();
        expect(() => context(manifest(root), 'nope')).toThrow(/unknown module: nope/);
        await expect(build({ root, only: ['stray'], log: quiet })).rejects.toThrow(/@xlibraries\/adapter-missing/);
        write('package.json', { name: '@s/game', version: '1.0.0', xlibraries: { modules: { one: { adapter: 'copy', uses: ['@s/plain'], source: 'one.txt' } } } });
        expect(() => context(manifest(root), 'one')).toThrow(/@s\/plain offers no native code/);
    });

    it('lists what went into a stamp', async () => {
        const { root } = workspace();
        const s = await stamp(manifest(root), 'one');
        expect(s.inputs).toEqual(['one.txt']);
        expect(s.head[0]).toMatch(/^toolchain@/);
    });
});
