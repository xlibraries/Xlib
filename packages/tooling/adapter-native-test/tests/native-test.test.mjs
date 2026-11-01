import { afterAll, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { INCLUDE, MAIN, providers, testArgs } from '../src/index.mjs';

const roots = [];
afterAll(() => { for (const r of roots) rmSync(r, { recursive: true, force: true }); });

function setup() {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'native-test-')));   // as module resolution sees it (macOS: /private/var)
    roots.push(root);
    const write = (path, body = '') => { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), typeof body === 'string' ? body : JSON.stringify(body)); };
    write('game/package.json', { name: '@s/game', version: '1.0.0', xlibraries: { nativeTests: { uses: ['@s/engine'], includes: ['-Ivendor/x'] } } });
    write('game/native/logic.cpp');
    write('game/native/main.cpp');
    write('game/tests/native/logic_test.cpp');
    write('game/node_modules/@s/engine/package.json', { name: '@s/engine', version: '1.0.0', xlibraries: { native: { include: ['runtime'], testSources: 'runtime', libraries: { phys: { sources: 'lib', isystem: ['lib'], defines: ['-DPHYS'] } } } } });
    write('game/node_modules/@s/engine/runtime/xl_font.cpp');
    write('engine/package.json', { name: '@s/engine', version: '1.0.0', xlibraries: { native: { include: ['runtime'], testSources: 'runtime' } } });
    write('engine/native/runtime/xl.cpp');
    return root;
}

describe('native tests', () => {
    it('compile the logic (not main.cpp), the providers\' test sources, the tests and doctest\'s main, with its libraries\' flags', () => {
        const root = join(setup(), 'game');
        const args = testArgs(root);
        const engine = join(root, 'node_modules/@s/engine');
        expect(args).toEqual(expect.arrayContaining(['-Inative', `-I${join(engine, 'runtime')}`, `-I${INCLUDE}`, `-isystem${join(engine, 'lib')}`, '-DPHYS', '-Ivendor/x', 'native/logic.cpp', join(engine, 'runtime/xl_font.cpp'), 'tests/native/logic_test.cpp', MAIN]));
        expect(args).not.toContain('native/main.cpp');
        expect(existsSync(join(INCLUDE, 'doctest.h'))).toBe(true);   // doctest is this package's public header
    });

    it('treat a provider testing itself as its own provider, without linking its runtime twice', () => {
        const root = join(setup(), 'engine');
        expect(providers(root).map((p) => p.self)).toEqual([true]);
        const args = testArgs(root);
        expect(args.filter((a) => a.endsWith('xl.cpp'))).toEqual(['native/runtime/xl.cpp']);
    });
});
