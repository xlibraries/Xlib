import { afterAll, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { INCLUDE, MAIN, providers, runNativeTests, testArgs } from '../src/index.mjs';

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

    it('treat a provider testing itself as its own provider, without linking its sources twice', () => {
        const root = join(setup(), 'engine');
        expect(providers(root).map((p) => p.self)).toEqual([true]);
        expect(testArgs(root).filter((a) => a.endsWith('xl.cpp'))).toEqual(['native/runtime/xl.cpp']);   // under native/ and testSources: once
        const text = join(dirname(root), 'text');
        mkdirSync(join(text, 'src'), { recursive: true });
        writeFileSync(join(text, 'package.json'), JSON.stringify({ name: '@s/text', version: '1.0.0', xlibraries: { native: { include: ['include'], testSources: 'src' } } }));
        writeFileSync(join(text, 'src/font.cpp'), '');
        expect(testArgs(text)).toContain('src/font.cpp');   // a provider's own sources outside native/
    });
});

describe('running native tests', () => {
    /** Records commands and creates what -o names, so the object caches work. */
    function fakeExec() {
        const calls = [];
        const exec = (cmd, args, opts) => {
            calls.push({ cmd, args, cwd: opts.cwd });
            const i = args.indexOf('-o');
            if (i >= 0) { const out = args[i + 1].startsWith('/') ? args[i + 1] : join(opts.cwd, args[i + 1]); mkdirSync(dirname(out), { recursive: true }); writeFileSync(out, ''); }
        };
        return { exec, calls };
    }

    function game() {
        const root = join(setup(), 'game');
        const engine = join(root, 'node_modules/@s/engine');
        mkdirSync(join(engine, 'lib/Lib'), { recursive: true });
        writeFileSync(join(engine, 'lib/Lib/One.cpp'), '');
        mkdirSync(join(root, 'third_party/c'), { recursive: true });
        writeFileSync(join(root, 'third_party/c/a.c'), '');
        const json = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
        json.xlibraries.nativeTests.cLibraries = [{ sources: 'third_party/c', flags: ['-DC'] }];
        writeFileSync(join(root, 'package.json'), JSON.stringify(json));
        return { root, engine };
    }

    it('builds the providers\' libraries and the C libraries once, links everything, then runs the binary', () => {
        const { root, engine } = game();
        const { exec, calls } = fakeExec();
        runNativeTests(root, { exec });
        expect(calls.map((c) => c.cmd.split('/').pop())).toEqual([process.env.CXX || 'c++', process.env.CC || 'cc', process.env.CXX || 'c++', 'native-tests']);
        expect(calls[0].args).toEqual(expect.arrayContaining([`-isystem${join(engine, 'lib')}`, '-DPHYS', '-c', join(engine, 'lib/Lib/One.cpp'), '-o', join(engine, 'build/native-obj/phys/Lib_One.o')]));
        expect(calls[1].args).toEqual(['-std=gnu17', '-O1', '-DC', '-c', 'third_party/c/a.c', '-o', 'build/native-obj/third_party_c_a.o']);
        expect(calls[2].args.slice(0, -4)).toEqual(testArgs(root));
        expect(calls[2].args.slice(-4)).toEqual([join(engine, 'build/native-obj/phys/Lib_One.o'), 'build/native-obj/third_party_c_a.o', '-o', 'build/native-tests']);
        expect(calls[3]).toEqual({ cmd: join(root, 'build/native-tests'), args: ['--no-version'], cwd: root });
        const again = fakeExec();
        runNativeTests(root, { exec: again.exec });
        expect(again.calls).toHaveLength(2);   // the objects were fresh: just link and run
    });

    it('fails when a test fails (the binary exits non-zero)', () => {
        const { root } = game();
        const exec = (cmd, args, opts) => { if (cmd.endsWith('native-tests')) throw new Error('2 failed'); fakeExec().exec(cmd, args, opts); };
        expect(() => runNativeTests(root, { exec })).toThrow(/2 failed/);
    });
});
