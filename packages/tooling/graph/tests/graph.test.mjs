import { afterAll, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { check, compare, exportedFile, nativeIncludes, scan, scriptImports } from '../src/graph.mjs';
import { NATIVE, RELATIVE, RULES, SCRIPT, UNITS } from './fixtures/workspaces.mjs';

const roots = [];
afterAll(() => { for (const r of roots) rmSync(r, { recursive: true, force: true }); });

/** A workspace on disk from { 'path': contents } (objects are written as JSON). */
function workspace(tree) {
    const root = mkdtempSync(join(tmpdir(), 'graph-'));
    roots.push(root);
    for (const [path, body] of Object.entries(tree)) {
        mkdirSync(dirname(join(root, path)), { recursive: true });
        writeFileSync(join(root, path), typeof body === 'string' ? body : JSON.stringify(body));
    }
    return root;
}

const keys = (root, config) => check(scan(root, config), config).map((v) => v.key);

describe('reading sources', () => {
    it('finds imports in every form, and includes outside comments', () => {
        expect(scriptImports(SCRIPT)).toEqual(['x', './y', 'z', 'w', 'side']);
        expect(nativeIncludes(NATIVE)).toEqual(['a.h', 'b/c.h']);
    });

    it('resolves a package import through its exports, or not at all', () => {
        const json = { name: '@s/p', exports: { '.': './src/index.ts', './build': './scripts/build.mjs', './parts/*': './src/parts/*.ts' } };
        expect(exportedFile(json, '@s/p')).toBe('src/index.ts');
        expect(exportedFile(json, '@s/p/build')).toBe('scripts/build.mjs');
        expect(exportedFile(json, '@s/p/parts/wheel')).toBe('src/parts/wheel.ts');
        expect(exportedFile(json, '@s/p/src/secret')).toBeNull();
        expect(exportedFile({ name: 'q', main: './lib.js' }, 'q')).toBe('lib.js');
    });
});

describe('the rules', () => {
    const config = {
        packages: { '@s/core': { layer: 1, as: 'core' }, '@s/a': { layer: 4, as: 'a' }, '@s/b': { layer: 4, as: 'b' }, '@s/app': { layer: 5, as: 'app' } },
        units: { '@s/app': { 'src/sim': { as: 'sim', layer: 3, pure: true } } },
        forbid: [{ from: 'app', to: 'a', why: 'no names' }],
    };

    it('flags undeclared, private, upward, sideways, impure, forbidden, cycles and unmapped packages', () => {
        const found = keys(workspace(RULES), config);
        expect(found).toContain('private: a -> core (@s/core/src/inner)');   // not an export
        expect(found).toContain('private: a -> core (detail.h)');            // a header outside include/
        expect(found).toContain('sideways: a -> b (layer 4)');               // games never depend on games
        expect(found).toContain('upward: b -> app (layer 4 -> 5)');
        expect(found).toContain('undeclared: b -> app (@s/app)');
        expect(found).toContain('impure: sim (react)');
        expect(found).toContain('impure: sim (the DOM)');
        expect(found).toContain('forbidden: app -> a (no names)');
        expect(found).toContain('cycle: a, app, b');   // a -> b -> app -> a
        expect(found).toContain('unmapped: @s/stray');
    });

    it('lets edges through that are declared, public and downward, and ignores system and generated headers', () => {
        const found = keys(workspace(RULES), config);
        expect(found.some((k) => k.startsWith('private: a -> core (core.h)'))).toBe(false);
        expect(found.some((k) => k.includes('-> core') && k.startsWith('upward'))).toBe(false);
        expect(found.some((k) => k.includes('vector') || k.includes('glsl'))).toBe(false);
        expect(found.some((k) => k.startsWith('undeclared: a'))).toBe(false);
    });

    it('treats units as packages to be: a file-name prefix or a folder, the longest match winning', () => {
        const root = workspace(UNITS);
        const cfg = {
            packages: { '@s/arcade': { layer: 5, as: 'arcade' } },
            units: { '@s/arcade': { 'games/one': { as: 'game-one', layer: 4 }, 'games/one/mesh': { as: 'render', layer: 2 }, 'games/one/physics_backend': { as: 'physics', layer: 2 }, 'tests/one': { as: 'game-one', layer: 4 } } },
        };
        const found = keys(root, cfg);
        expect(found).toContain('private: game-one -> render (mesh.h)');
        expect(found).toContain('upward: physics -> game-one (layer 2 -> 4)');   // the backend includes the game's header
        expect(found.some((k) => k.includes('arcade'))).toBe(false);              // the test belongs to its game
    });
});

describe('relative imports', () => {
    it('are edges between units when they cross one, nothing within one, and private when they leave the package', () => {
        const cfg = { packages: { '@s/lab': { layer: 5, as: 'lab' } }, units: { '@s/lab': { 'src/sim': { as: 'sim', layer: 3 }, 'src/app': { as: 'app', layer: 5 } } } };
        const graph = scan(workspace(RELATIVE), cfg);
        const edges = graph.edges.filter((e) => e.to).map((e) => `${e.from}->${e.to}`);
        expect(edges).toEqual(expect.arrayContaining(['app->sim', 'sim->app']));
        expect(edges).not.toContain('sim->sim');   // './util': the same unit
        const found = check(graph, cfg).map((v) => v.key);
        expect(found).toContain('upward: sim -> app (layer 3 -> 5)');
        expect(found).toContain('private: sim (reaches outside its package: ../../../other/secret)');
        expect(found).toContain('cycle: app, sim');
        expect(found.some((k) => k.includes('fs') || k.includes('path'))).toBe(false);   // Node's own modules
    });
});

describe('the baseline', () => {
    it('fails on what is new, and on what is fixed but still listed', () => {
        const violations = [{ key: 'upward: a -> b' }, { key: 'private: c -> d (x.h)' }];
        expect(compare(violations, ['upward: a -> b', 'cycle: e, f'])).toEqual({ added: [{ key: 'private: c -> d (x.h)' }], resolved: ['cycle: e, f'] });
        expect(compare(violations, violations.map((v) => v.key))).toEqual({ added: [], resolved: [] });
    });
});
