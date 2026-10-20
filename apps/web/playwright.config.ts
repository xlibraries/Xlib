import { defineConfig } from '@playwright/test';

// Smoke tests against a production build: run `pnpm build` (or `pnpm exec next build`) first.
export default defineConfig({
    testDir: './tests/e2e',
    timeout: 60_000,
    retries: process.env.CI ? 1 : 0,
    // one browser at a time: parallel workers contend for the single local server and run slower
    workers: 1,
    reporter: process.env.CI ? 'github' : 'list',
    use: {
        baseURL: 'http://localhost:3100',
        viewport: { width: 1400, height: 1000 },
        // locally use the installed Chrome; CI installs Playwright's Chromium
        channel: process.env.CI ? undefined : 'chrome',
        // lets the Arcade's WebGPU builds run where the machine has a usable GPU adapter
        launchOptions: { args: ['--enable-unsafe-webgpu'] },
    },
    webServer: {
        command: 'pnpm exec next start -p 3100',
        url: 'http://localhost:3100',
        reuseExistingServer: !process.env.CI,
        timeout: 60_000,
        // A test admin passcode and an in-memory store: e2e runs never touch the real ones in .env.local
        env: {
            ADMIN_PASSCODE: 'e2e-admin-passcode',
            ADMIN_SESSION_SECRET: 'e2e-session-secret-0123456789abcdef0123456789',
            XLIB_MEMORY_STORE: '1',
            PHOTO_DROP_ADMIN_KEY: '',   // never call the real Photo Drop script from tests
        },
    },
});
