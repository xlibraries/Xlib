import { afterAll, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { main } from '../src/cli.mjs';
import { RULES } from './fixtures/workspaces.mjs';

const BIN = join(dirname(fileURLToPath(import.meta.url)), '../bin/graph.mjs');
const roots = [];
afterAll(() => { for (const r of roots) rmSync(r, { recursive: true, force: true }); });

const CONFIG = {
    packages: { '@s/core': { layer: 1, as: 'core' }, '@s/a': { layer: 4, as: 'a' }, '@s/b': { layer: 4, as: 'b' }, '@s/app': { layer: 5, as: 'app' }, '@s/stray': { layer: 5, as: 'stray' } },
    units: { '@s/app': { 'src/sim': { as: 'sim', layer: 3, pure: true } } },
};

/** The rules fixture on disk, with a layer map in architecture/; output collected. */
function setup() {
    const root = mkdtempSync(join(tmpdir(), 'graph-cli-'));
    roots.push(root);
    const write = (path, body) => { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), typeof body === 'string' ? body : JSON.stringify(body)); };
    for (const [path, body] of Object.entries(RULES)) write(path, body);
    write('architecture/layers.json', CONFIG);
    const out = [], err = [];
    const io = { cwd: root, log: (l) => out.push(l), error: (l) => err.push(l) };
    return { root, write, out, err, io };
}

describe('the graph command', () => {
    it('fails on violations the baseline does not list, and passes once they are in it', () => {
        const { root, out, err, io } = setup();
        expect(main([], io)).toBe(1);
        expect(err.join('\n')).toMatch(/^NEW sideways: a -> b \(layer 4\)/m);
        expect(err.at(-1)).toMatch(/new violation\(s\), 0 fixed/);
        expect(main(['--update'], io)).toBe(0);
        expect(JSON.parse(readFileSync(join(root, 'architecture/baseline.json'), 'utf8'))).toContain('sideways: a -> b (layer 4)');
        expect(main([], io)).toBe(0);
        expect(out.at(-1)).toMatch(/^dependency graph: OK \(\d+ known violations in the baseline, none new\)$/);
    });

    it('fails on a violation that is fixed but still in the baseline, so the baseline only shrinks on purpose', () => {
        const { write, err, io } = setup();
        main(['--update'], io);
        write('packages/a/src/index.ts', "import { core } from '@s/core';\nexport const a = core;\n");   // no more a -> b, nor the private import
        expect(main([], io)).toBe(1);
        expect(err.join('\n')).toContain('FIXED (drop it from the baseline with --update) sideways: a -> b (layer 4)');
    });

    it('reports every violation by rule, with up to three files each', () => {
        const { write, out, io } = setup();
        for (let i = 0; i < 5; i++) write(`packages/a/src/more${i}.ts`, "import { b } from '@s/b';\nexport const x = b;\n");
        expect(main(['--report'], io)).toBe(0);
        const text = out.join('\n');
        expect(text).toMatch(/\nsideways \(1\)\n {2}sideways: a -> b \(layer 4\)\n {6}packages\/a\/src\/index\.ts/);
        expect(text).toContain('… and 3 more');
        expect(out.at(-1)).toMatch(/^\n\d+ violations$/);
    });

    it('finds the workspace from a folder inside it, and takes the layer map and baseline from options', () => {
        const { root, write, out, io } = setup();
        write('elsewhere/layers.json', CONFIG);
        expect(main(['--update', '--config', 'elsewhere/layers.json', '--baseline', 'elsewhere/baseline.json'], io)).toBe(0);
        expect(out.at(-1)).toContain(join(root, 'elsewhere/baseline.json'));
        expect(main(['--config', join(root, 'elsewhere/layers.json'), '--baseline', join(root, 'elsewhere/baseline.json')], { ...io, cwd: join(root, 'packages/a/src') })).toBe(0);
        expect(main(['--root', '.', '--config', 'elsewhere/layers.json', '--baseline', 'elsewhere/baseline.json'], io)).toBe(0);
    });

    it('exits with its code when run as a command', () => {
        const { root } = setup();
        expect(spawnSync(process.execPath, [BIN], { cwd: root, encoding: 'utf8' }).status).toBe(1);
        expect(spawnSync(process.execPath, [BIN, '--update'], { cwd: root, encoding: 'utf8' }).status).toBe(0);
        expect(spawnSync(process.execPath, [BIN], { cwd: root, encoding: 'utf8' }).stdout).toMatch(/dependency graph: OK/);
    });
});
