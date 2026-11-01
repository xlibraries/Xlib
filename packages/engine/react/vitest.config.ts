// Unit tests, with coverage held to a floor: new code ships with tests (CLAUDE.md, "Tests are mandatory").
import { defineConfig } from 'vitest/config';

export default defineConfig({
    esbuild: { jsx: 'automatic' },
    test: {
        include: ['tests/**/*.test.{ts,tsx,mjs}'],
        environment: 'node',
        coverage: {
            provider: 'v8',
            include: ['src/**'],
            exclude: ['**/*.d.mts', '**/*.d.ts'],   // declarations, not code
            reporter: ['text-summary'],
            thresholds: { lines: 95, statements: 95, functions: 85, branches: 80 },
        },
    },
});
