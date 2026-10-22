import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { MODULES, STAMP, sourcesHash } from '../scripts/build-native.mjs';

describe('the native modules', () => {
    it('are built from the current sources (run `pnpm --filter @xlibraries/bot-lab build:native` after changing native/ or the engine)', () => {
        const stamp = new URL(`../${STAMP}`, import.meta.url);
        expect(existsSync(stamp), 'dist/sources.sha256 is missing: run a full build').toBe(true);
        expect(readFileSync(stamp, 'utf8').trim(), 'native sources changed since the last full build').toBe(sourcesHash());
        for (const name of Object.keys(MODULES)) expect(existsSync(new URL(`../dist/${name}/headless.wasm`, import.meta.url)), name).toBe(true);
    });
});
