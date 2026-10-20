import { test, expect } from '@playwright/test';
import { openApp, openDesktop, runCommand } from './helpers';

test.describe('Terminal', () => {
    test('runs commands', async ({ page }) => {
        await openDesktop(page);
        const terminal = await openApp(page, 'terminal');
        await runCommand(page, 'terminal', 'pwd');
        await expect(terminal).toContainText('/home/aman');
        await runCommand(page, 'terminal', 'echo hello portfolio');
        await expect(terminal).toContainText('hello portfolio');
        await runCommand(page, 'terminal', 'nonsense');
        await expect(terminal).toContainText("Command 'nonsense' not found");
        await runCommand(page, 'terminal', 'clear');
        await expect(terminal).not.toContainText('hello portfolio');
    });

    test('opens apps by name', async ({ page }) => {
        await openDesktop(page);
        await openApp(page, 'terminal');
        await runCommand(page, 'terminal', 'code');
        await expect(page.locator('#vscode')).toBeVisible();
    });

    test('escapes HTML in echo', async ({ page }) => {
        await openDesktop(page);
        const terminal = await openApp(page, 'terminal');
        await runCommand(page, 'terminal', 'echo <b id="injected">x</b>');
        await expect(page.locator('#injected')).toHaveCount(0);
        await expect(terminal).toContainText('<b id');
    });
});

test.describe('Calc', () => {
    test('evaluates expressions, variables and help', async ({ page }) => {
        await openDesktop(page);
        const calc = await openApp(page, 'calc');
        await runCommand(page, 'calculator', '2+3*4');
        await expect(calc).toContainText('14');
        await runCommand(page, 'calculator', 'x=5');
        await runCommand(page, 'calculator', 'x*x');
        await expect(calc).toContainText('25');
        await runCommand(page, 'calculator', 'help');
        await expect(calc).toContainText('Square root of x');
    });
});

test.describe('About Aman', () => {
    test('explorer: folders, files, breadcrumb and back', async ({ page }) => {
        await openDesktop(page);
        const about = await openApp(page, 'about-aman');
        await about.getByTitle('Experience', { exact: true }).click();
        await about.getByTitle('Flam', { exact: true }).click();
        await about.getByTitle('Talking Avatar.md').click();
        await expect(about).toContainText('time-to-first-frame');
        await about.getByRole('button', { name: 'Back' }).click();
        await expect(about.getByTitle('Talking Avatar.md')).toBeVisible();
        await about.getByRole('button', { name: 'Home', exact: true }).first().click();
        await expect(about.getByTitle('Resume.pdf')).toBeVisible();
    });

    test('switches to the simplified view and back', async ({ page }) => {
        await openDesktop(page);
        const about = await openApp(page, 'about-aman');
        await about.getByRole('button', { name: 'Switch to simplified view' }).click();
        await page.locator('#experience').click();
        await expect(about).toContainText('Persistent Systems');
        await about.getByRole('button', { name: 'Switch to explorer view' }).click();
        await expect(about.getByRole('button', { name: 'Switch to simplified view' })).toBeVisible();
    });
});

test.describe('Side Quests', () => {
    test('tabs, quest cards, show on map and the song', async ({ page }) => {
        await openDesktop(page);
        const app = await openApp(page, 'side-quests');
        await app.getByRole('button', { name: /Quests/ }).click();
        await expect(app.getByText('The Kedarnath Run')).toBeVisible();
        expect(await app.getByRole('button', { name: 'Show on map →' }).count()).toBeGreaterThanOrEqual(10);
        await app.getByRole('button', { name: 'Show on map →' }).first().click();
        await expect(app.getByText('km on the road')).toBeVisible();
        await app.getByRole('button', { name: /Character/ }).click();
        await expect(app).toContainText('Engineer · Wanderer · Storyteller');
        await app.getByRole('button', { name: /Lore/ }).click();
        await app.getByRole('button', { name: 'Play Debugging Love' }).click();
        await expect(app.locator('iframe[title="Debugging Love"]')).toHaveAttribute('src', /youtube-nocookie\.com\/embed\/aaHlegqIIik/);
    });
});

test.describe('Music', () => {
    test('shows a playlist from the snapshot, searches and opens the lyrics view', async ({ page }) => {
        await page.route('**/api/v1/search?**', route => route.fulfill({
            contentType: 'application/json',
            headers: { 'access-control-allow-origin': '*' },
            body: JSON.stringify([{ type: 'video', videoId: 'abc123xyz00', title: 'Test Song Result', author: 'Tester', lengthSeconds: 200 }]),
        }));
        await page.route('**/api/v1/playlists/**', route => route.abort());   // force the bundled snapshot
        await openDesktop(page);
        const music = await openApp(page, 'music');
        await expect(music).toContainText(/\d+ songs/);
        await music.getByPlaceholder('Search any song or artist…').fill('test song');
        await music.getByPlaceholder('Search any song or artist…').press('Enter');
        await expect(music.getByText('Test Song Result')).toBeVisible();
        await music.getByRole('button', { name: /Video & Lyrics/ }).click();
        await expect(music).toContainText('Play a song to see its lyrics here.');
    });
});

test.describe('Settings', () => {
    test('changes and remembers the wallpaper', async ({ page }) => {
        await openDesktop(page);
        const settings = await openApp(page, 'settings');
        const tiles = settings.locator('[data-path]');
        const target = await tiles.nth(2).getAttribute('data-path');
        await tiles.nth(2).focus();
        await expect.poll(() => page.evaluate(() => localStorage.getItem('bg-image'))).toBe(target);
    });
});

test.describe('Trash', () => {
    test('empties and stays empty after reload', async ({ page }) => {
        await openDesktop(page);
        await page.locator('#app-trash').dblclick();
        const trash = page.locator('#trash');
        await trash.getByText('Empty', { exact: true }).click();
        await expect(trash).toContainText('Trash is Empty');
        await page.reload();
        await page.locator('#app-trash').dblclick();
        await expect(page.locator('#trash')).toContainText('Trash is Empty');
    });
});

test.describe('Contact Me', () => {
    test('validates the form before sending', async ({ page }) => {
        await openDesktop(page);
        await page.locator('#app-gedit').dblclick();
        const form = page.locator('#gedit');
        await expect(form).toBeVisible();
        await form.getByText(/^(Send|Open Email App)$/).click();
        await expect(form).toContainText('Please add your name');
        await form.locator('#sender-name').fill('Tester');
        await form.locator('#sender-email').fill('not-an-email');
        await form.getByText(/^(Send|Open Email App)$/).click();
        await expect(form).toContainText('Please enter a valid email address.');
    });
});

test.describe('Desktop', () => {
    test('creates a folder from the context menu', async ({ page }) => {
        await openDesktop(page);
        // right-click the desktop background itself (the menu only opens there); retry until the
        // desktop has attached its context-menu listener after mounting
        const menu = page.locator('#desktop-menu');
        await expect(async () => {
            await page.locator('[data-context="desktop-area"]').click({ button: 'right', position: { x: 600, y: 400 } });
            await expect(menu).toBeVisible({ timeout: 1000 });
        }).toPass({ timeout: 15_000 });
        await menu.getByText('New Folder').click();
        await page.locator('#folder-name-input').fill('Test Folder');
        await page.getByText('Create', { exact: true }).click();
        await expect(page.getByText('Test Folder')).toBeVisible();
    });

    test('opens apps from the app grid', async ({ page }) => {
        await openDesktop(page);
        await page.getByAltText('Ubuntu view app').click();
        await page.locator('#app-todoist').dblclick();
        await expect(page.locator('#todoist')).toBeVisible();
    });

    test('locks and unlocks', async ({ page }) => {
        await openDesktop(page);
        await page.locator('#status-bar').click();
        await page.getByText('Lock', { exact: true }).click();
        await expect.poll(() => page.evaluate(() => localStorage.getItem('screen-locked'))).toBe('true');
        await page.waitForTimeout(500);
        await page.keyboard.press('Enter');
        await expect.poll(() => page.evaluate(() => localStorage.getItem('screen-locked'))).toBe('false');
        await expect(page.locator('#sidebar-terminal')).toBeVisible();
    });

    test('powers off and back on', async ({ page }) => {
        await openDesktop(page);
        await page.locator('#status-bar').click();
        await page.getByText('Power Off / Log Out').click();
        const power = page.getByAltText('Power Button');
        await expect(power).toBeVisible();
        await power.click();
        await expect(page.locator('#sidebar-terminal')).toBeVisible({ timeout: 15_000 });
    });
});

test('privacy page loads', async ({ page }) => {
    await page.goto('/privacy');
    await expect(page.getByRole('heading', { name: 'Privacy Policy' })).toBeVisible();
});

test.describe('Photo Drop upload', () => {
    test('uploads a photo through the backend and rejects non-media', async ({ page }) => {
        const calls: string[] = [];
        await page.route('https://script.google.com/**', async route => {
            const body = JSON.parse(route.request().postData() || '{}');
            calls.push(body.action);
            const reply = body.action === 'check' ? { ok: true, maxFileMb: 4096 }
                : body.action === 'start' ? { uploadId: 'u1', granularity: 262144 }
                    : body.action === 'chunk' ? (body.final ? { ok: true, done: true } : { ok: true })
                        : { error: 'unexpected' };
            await route.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(reply) });
        });
        await page.addInitScript(() => { delete (window as unknown as Record<string, unknown>).BackgroundFetchManager; });   // test the in-page path
        await page.goto('/drop/index.html#k=letmein');
        await expect(page.locator('#uploader')).toBeVisible();
        await page.locator('#files').setInputFiles([
            { name: 'photo.png', mimeType: 'image/png', buffer: Buffer.alloc(300_000, 7) },
            { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') },
        ]);
        await expect(page.locator('#queue')).toContainText('✓ Uploaded');
        await expect(page.locator('#queue')).toContainText('Not a photo or video');
        await expect(page.locator('#done')).toBeVisible();
        expect(calls).toEqual(['check', 'start', 'chunk']);
    });

    // Backend replies for the direct path: 'start' hands out Google's upload URL
    async function routeDirectBackend(page: import('@playwright/test').Page, calls: string[]) {
        await page.route('https://script.google.com/**', async route => {
            const body = JSON.parse(route.request().postData() || '{}');
            calls.push(body.action);
            const reply = body.action === 'check' ? { ok: true, maxFileMb: 4096 }
                : body.action === 'start' ? { uploadId: 'u1', granularity: 262144, uploadUrl: 'https://photos.example/upload/s1' }
                    : body.action === 'finish' ? (body.uploadToken === 'token-s1' ? { ok: true, done: true } : { error: 'bad token', fatal: true })
                        : body.action === 'status' ? { received: 0, done: false }
                            : body.action === 'chunk' ? (body.final ? { ok: true, done: true } : { ok: true })
                                : { error: 'unexpected' };
            await route.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(reply) });
        });
        await page.addInitScript(() => { delete (window as unknown as Record<string, unknown>).BackgroundFetchManager; });
    }

    test('sends the bytes straight to Google, then adds the file to the album', async ({ page }) => {
        const calls: string[] = [];
        const google: { command: string; offset: string; size: number }[] = [];
        await routeDirectBackend(page, calls);
        await page.route('https://photos.example/**', async route => {
            const req = route.request();
            const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' };
            if (req.method() === 'OPTIONS') return route.fulfill({ status: 200, headers });
            google.push({ command: req.headers()['x-goog-upload-command'], offset: req.headers()['x-goog-upload-offset'], size: req.postDataBuffer()?.length ?? 0 });
            await route.fulfill({ status: 200, headers, body: req.headers()['x-goog-upload-command'].includes('finalize') ? 'token-s1' : '' });
        });
        await page.goto('/drop/index.html#k=letmein');
        await page.locator('#files').setInputFiles([{ name: 'clip.mp4', mimeType: 'video/mp4', buffer: Buffer.alloc(300_000, 7) }]);
        await expect(page.locator('#queue')).toContainText('✓ Uploaded');
        expect(calls).toEqual(['check', 'start', 'finish']);
        expect(google).toEqual([{ command: 'upload, finalize', offset: '0', size: 300_000 }]);
    });

    test('falls back to the Apps Script relay when Google blocks the browser', async ({ page }) => {
        const calls: string[] = [];
        await routeDirectBackend(page, calls);
        await page.route('https://photos.example/**', route => route.abort());   // what a CORS refusal looks like to the page
        await page.goto('/drop/index.html#k=letmein');
        await page.locator('#files').setInputFiles([{ name: 'clip.mp4', mimeType: 'video/mp4', buffer: Buffer.alloc(300_000, 7) }]);
        await expect(page.locator('#queue')).toContainText('✓ Uploaded', { timeout: 15_000 });
        expect(calls).toEqual(['check', 'start', 'status', 'chunk']);
    });
});
