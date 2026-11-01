import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { check, manifest } from '@xlibraries/toolchain';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('the native modules', () => {
    it('are built from the current sources (run `pnpm --filter @xlibraries/bot-lab build:native` after changing native/ or what it uses)', async () => {
        const modules = manifest(ROOT).modules as Record<string, { headless?: boolean }>;
        expect(Object.keys(modules).sort()).toEqual(['view', 'world']);
        for (const [name, spec] of Object.entries(modules)) {
            const { current } = await check(ROOT, name);
            expect(current, `dist/${name} is out of date`).toBe(true);
            for (const file of spec.headless ? ['headless.wasm'] : ['webgpu.wasm', 'webgl2.wasm']) expect(existsSync(join(ROOT, 'dist', name, file)), `${name}/${file}`).toBe(true);
        }
    });
});
