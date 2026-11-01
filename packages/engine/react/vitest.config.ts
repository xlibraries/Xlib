import { defineConfig } from 'vitest/config';

export default defineConfig({
    esbuild: { jsx: 'automatic' },
    test: { include: ['tests/**/*.test.{ts,tsx,mjs}'], environment: 'node' },
});
