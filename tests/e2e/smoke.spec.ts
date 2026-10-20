import { type Page } from '@playwright/test';
import { expect, openDesktop, test } from './helpers';

// Dock apps and the id of the element that opens them
const DOCK_APPS = ['brave', 'calc', 'about-aman', 'side-quests', 'vscode', 'terminal', 'music', 'settings'];


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

test('every page carries the security headers', async ({ request }) => {
    for (const path of ['/', '/drop/index.html', '/brave/newtab.html', '/api/frame-check']) {
        const res = await request.get(path, { maxRedirects: 0 });
        const headers = res.headers();
        const scriptSrc = headers['content-security-policy']?.split('; ').find(d => d.startsWith('script-src ')) ?? '';
        expect(scriptSrc, path).toContain("'self'");
        expect(scriptSrc, path).not.toMatch(/unsafe-inline|unsafe-eval/);   // the production policy allows neither
        expect(headers['x-content-type-options'], path).toBe('nosniff');
        expect(headers['x-frame-options'], path).toBe('SAMEORIGIN');
        expect(headers['strict-transport-security'], path).toContain('max-age=');
    }
});

test('bundled libraries are served from /vendor', async ({ request }) => {
    for (const path of ['/vendor/leaflet/leaflet.js', '/vendor/leaflet/leaflet.css', '/vendor/pdfjs/pdf.min.mjs', '/vendor/pdfjs/pdf.worker.min.mjs', '/vendor/india-boundary/india_boundary_corrections.pmtiles']) {
        expect((await request.head(path)).status(), path).toBe(200);
    }
});

test('Brave opens on the local start page', async ({ page }) => {
    await openDesktop(page);
    await page.locator('#sidebar-brave').click();
    await expect(page.locator('#brave-screen')).toHaveAttribute('src', './brave/newtab.html');
    const frame = page.frameLocator('#brave-screen');
    await expect(frame.locator('#q')).toBeVisible();
});

test.describe('Brave browser', () => {
    async function openBrave(page: Page) {
        await openDesktop(page);
        await page.locator('#sidebar-brave').click();
        await expect(page.locator('#brave-url-bar')).toBeVisible();
    }
    async function visit(page: Page, text: string) {
        await page.locator('#brave-url-bar').click();
        await page.locator('#brave-url-bar').fill(text);
        await page.locator('#brave-url-bar').press('Enter');
    }

    test('opens new tabs', async ({ page }) => {
        await openBrave(page);
        await page.getByRole('button', { name: 'New tab' }).click();
        await expect(page.getByRole('button', { name: 'Close tab' })).toHaveCount(2);
    });

    test('plays YouTube links through the embeddable player', async ({ page }) => {
        await openBrave(page);
        await visit(page, 'https://www.youtube.com/watch?v=aaHlegqIIik');
        await expect(page.locator('#brave-screen')).toHaveAttribute('src', /youtube-nocookie\.com\/embed\/aaHlegqIIik/);
    });

    test('shows a friendly page for sites that refuse framing', async ({ page }) => {
        await page.route('**/api/frame-check?**', route => route.fulfill({
            contentType: 'application/json',
            body: JSON.stringify({ embeddable: false, finalUrl: 'https://example.org/' }),
        }));
        await page.route('**/api/reader?**', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ readable: false }) }));
        await openBrave(page);
        await visit(page, 'example.org');
        await expect(page.getByText("example.org can't be shown inside this window")).toBeVisible();
        await expect(page.getByRole('link', { name: /Open example\.org in a new tab/ })).toHaveAttribute('href', 'https://example.org/');
        await page.getByRole('button', { name: 'Back' }).click();
        await expect(page.locator('#brave-screen')).toHaveAttribute('src', './brave/newtab.html');
    });

    test('opens GitHub repos in github1s', async ({ page }) => {
        await openBrave(page);
        await visit(page, 'github.com/xlibraries/Xlib');
        await expect(page.locator('#brave-screen')).toHaveAttribute('src', 'https://github1s.com/xlibraries/Xlib');
        await expect(page.locator('#brave-url-bar')).toHaveValue('https://github.com/xlibraries/Xlib');
    });

    test('shows GitHub profiles on a built-in page', async ({ page }) => {
        await page.route('https://api.github.com/**', route => {
            const repos = route.request().url().includes('/repos');
            route.fulfill({
                contentType: 'application/json',
                headers: { 'access-control-allow-origin': '*' },
                body: JSON.stringify(repos
                    ? [{ name: 'demo-repo', description: 'A test repo', language: 'C++', stargazers_count: 3, forks_count: 0, fork: false, pushed_at: '2026-10-01T00:00:00Z', html_url: 'https://github.com/octo/demo-repo' }]
                    : { login: 'octo', name: 'Octo Cat', avatar_url: '', bio: 'Testing', location: 'Earth', blog: null, followers: 1, following: 2, public_repos: 1, html_url: 'https://github.com/octo' }),
            });
        });
        await openBrave(page);
        await visit(page, 'github.com/octo');
        await expect(page.getByText('Octo Cat')).toBeVisible();
        await page.getByRole('button', { name: /demo-repo/ }).click();
        await expect(page.locator('#brave-screen')).toHaveAttribute('src', 'https://github1s.com/octo/demo-repo');
    });

    test('falls back to reader view for sites that refuse framing', async ({ page }) => {
        await page.route('**/api/frame-check?**', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ embeddable: false, finalUrl: 'https://news.example/' }) }));
        await page.route('**/api/reader?**', route => route.fulfill({
            contentType: 'application/json',
            body: JSON.stringify({ readable: true, url: 'https://news.example/', title: 'A Readable Story', byline: 'By Tester', siteName: 'news.example', content: '<p>Body text of the story.</p>' }),
        }));
        await openBrave(page);
        await visit(page, 'news.example');
        await expect(page.getByRole('heading', { name: 'A Readable Story' })).toBeVisible();
        await expect(page.getByText('Body text of the story.')).toBeVisible();
    });
});

test('frame check and reader refuse private and non-web addresses', async ({ request }) => {
    for (const api of ['frame-check', 'reader']) {
        for (const url of ['http://localhost:3000/', 'http://127.0.0.1/', 'http://169.254.169.254/', 'file:///etc/passwd']) {
            const res = await request.get(`/api/${api}?url=` + encodeURIComponent(url));
            expect(res.status(), `${api} ${url}`).toBe(400);
        }
    }
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
