import { defineConfig } from 'vitest/config';

// Unit tests (tests/unit). End-to-end tests live in tests/e2e and run with Playwright.
export default defineConfig({
    esbuild: { jsx: 'automatic' },
    test: {
        include: ['tests/unit/**/*.test.{ts,tsx,mjs}'],
        environment: 'node',
        coverage: {
            provider: 'v8',
            include: ['lib/**', 'pages/api/**', 'scripts/**/*.mjs'],
            reporter: ['text', 'html'],
            reportsDirectory: 'coverage',
        },
    },
});
