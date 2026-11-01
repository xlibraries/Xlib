import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { main } from '../src/cli.mjs';

describe('xl-native-test', () => {
    const root = mkdtempSync(join(tmpdir(), 'xl-native-test-'));
    writeFileSync(join(root, 'package.json'), JSON.stringify({ name: '@s/p', version: '1.0.0' }));

    it('exits 0 when the tests pass, 1 with the reason when they fail', () => {
        const ran = [];
        expect(main({ cwd: root, exec: (cmd) => { ran.push(cmd); } })).toBe(0);
        expect(ran.at(-1)).toBe(join(root, 'build/native-tests'));
        const errors = [];
        expect(main({ cwd: root, error: (e) => errors.push(e), exec: () => { throw new Error('3 failed'); } })).toBe(1);
        expect(errors).toEqual(['3 failed']);
    });
});
