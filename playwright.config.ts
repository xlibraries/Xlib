import { defineConfig } from '@playwright/test';

// Smoke tests against a production build: run `pnpm build` (or `pnpm exec next build`) first.
export default defineConfig({
    testDir: './tests/e2e',
    timeout: 60_000,
    retries: process.env.CI ? 1 : 0,
    reporter: process.env.CI ? 'github' : 'list',
    use: {
        baseURL: 'http://localhost:3100',
        viewport: { width: 1400, height: 1000 },
        // locally use the installed Chrome; CI installs Playwright's Chromium
        channel: process.env.CI ? undefined : 'chrome',
    },
    webServer: {
        command: 'pnpm exec next start -p 3100',
        url: 'http://localhost:3100',
        reuseExistingServer: !process.env.CI,
        timeout: 60_000,
    },
});
