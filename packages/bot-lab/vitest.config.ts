import { defineConfig } from 'vitest/config';

export default defineConfig({
    esbuild: { jsx: 'automatic' },
    // the bench and board tests emulate a 16 MHz chip plus a circuit solve 4800 times a second: slow on CI runners
    test: { include: ['tests/**/*.test.{ts,tsx,mjs}'], environment: 'node', testTimeout: 60_000 },
});
