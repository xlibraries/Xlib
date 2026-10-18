import { test, expect, type Page } from '@playwright/test';

// Dock apps and the id of the element that opens them
const DOCK_APPS = ['brave', 'calc', 'about-aman', 'side-quests', 'vscode', 'terminal', 'music', 'settings'];

// Skip the boot animation and lock screen, and collect uncaught errors from our own page
async function openDesktop(page: Page) {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    await page.addInitScript(() => {
        localStorage.setItem('booting_screen', 'false');
        localStorage.setItem('screen-locked', 'false');
    });
    await page.goto('/');
    await expect(page.locator('#sidebar-terminal')).toBeVisible();
    return errors;
}

test('desktop loads without errors', async ({ page }) => {
    const errors = await openDesktop(page);
    await expect(page.locator('#sidebar-brave')).toBeVisible();
    await page.waitForTimeout(1000);
    expect(errors).toEqual([]);
});

for (const id of DOCK_APPS) {
    test(`opens ${id}`, async ({ page }) => {
        const errors = await openDesktop(page);
        await page.locator(`#sidebar-${id}`).click();
        const window = page.locator(`#${id}`).first();
        await expect(window).toBeVisible();
        // lazy-loaded apps show a placeholder first; wait for it to go away
        await expect(window.getByText('Loading…', { exact: true })).toHaveCount(0, { timeout: 15_000 });
        expect(errors).toEqual([]);
    });
}

test('short URLs redirect to static pages', async ({ request }) => {
    for (const page of ['drop', 'privacy']) {
        const res = await request.get(`/${page}`, { maxRedirects: 0 });
        expect(res.status()).toBe(307);
        expect(res.headers()['location']).toBe(`/${page}/index.html`);
    }
});

test('Brave opens on the local start page', async ({ page }) => {
    await openDesktop(page);
    await page.locator('#sidebar-brave').click();
    await expect(page.locator('#brave-screen')).toHaveAttribute('src', './brave/newtab.html');
    const frame = page.frameLocator('#brave-screen');
    await expect(frame.locator('#q')).toBeVisible();
});

test.describe('Photo Drop', () => {
    // Stand-in for the Apps Script backend: passcode "letmein" is correct
    test.beforeEach(async ({ page }) => {
        await page.route('https://script.google.com/**', async (route) => {
            const body = JSON.parse(route.request().postData() || '{}');
            const reply = body.passcode === 'letmein'
                ? { ok: true, maxFileMb: 4096 }
                : { error: 'Wrong passcode', code: 'passcode', fatal: true };
            await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(reply) });
        });
    });

    test('rejects a wrong passcode', async ({ page }) => {
        await page.goto('/drop/index.html');
        await page.fill('#passcode', 'nope');
        await page.click('#unlock');
        await expect(page.locator('#lock-error')).toHaveText("That passcode isn't right.");
        await expect(page.locator('#uploader')).toBeHidden();
    });

    test('unlocks with the passcode from a share link', async ({ page }) => {
        await page.goto('/drop/index.html#k=letmein');
        await expect(page.locator('#uploader')).toBeVisible();
        await expect(page.locator('#subtitle')).toContainText("xlib's gallery");
        expect(page.url()).not.toContain('#k=');
    });
});
