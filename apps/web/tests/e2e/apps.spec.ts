import { type Page } from '@playwright/test';
import { expect, openApp, openDesktop, runCommand, test } from './helpers';

// Libraries and fonts are served from this site now (scripts/vendor.mjs, next/font), never from a CDN
const CDN = /unpkg\.com|cdn\.jsdelivr\.net|fonts\.googleapis\.com|fonts\.gstatic\.com/;
function watchCdnRequests(page: Page) {
    const hits: string[] = [];
    page.on('request', (req) => { if (CDN.test(req.url())) hits.push(req.url()); });
    return hits;
}

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

    test('mkdir creates a folder on the desktop', async ({ page }) => {
        await openDesktop(page);
        await openApp(page, 'terminal');
        await runCommand(page, 'terminal', 'mkdir Mixtapes');
        await expect(page.locator('#app-new-folder-mixtapes')).toBeVisible();
    });

    test('exit closes the window and ↑ recalls the last command', async ({ page }) => {
        await openDesktop(page);
        await openApp(page, 'terminal');
        await runCommand(page, 'terminal', 'pwd');
        const input = page.locator('input[id^="terminal-input-"]').last();
        await input.press('ArrowUp');
        await expect(input).toHaveValue('pwd');
        await runCommand(page, 'terminal', 'exit');
        await expect(page.locator('#terminal')).toHaveCount(0);
    });

    test('passcode shows the Photo Drop passcode only on a device that unlocked it', async ({ page }) => {
        await openDesktop(page);
        const terminal = await openApp(page, 'terminal');
        await runCommand(page, 'terminal', 'passcode');
        await expect(terminal).toContainText("This device hasn't unlocked Photo Drop yet");
        await page.evaluate(() => localStorage.setItem('drop-passcode', 'letmein'));
        await runCommand(page, 'terminal', 'passcode');
        await expect(terminal).toContainText('Photo Drop passcode: letmein');
        await expect(terminal).toContainText('/drop#k=letmein');
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
        await runCommand(page, 'calculator', 'clear');
        await expect(calc).not.toContainText('Square root of x');
        await runCommand(page, 'calculator', 'exit');
        await expect(page.locator('#calc')).toHaveCount(0);
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

    test('renders the resume with the bundled pdf.js', async ({ page }) => {
        const cdn = watchCdnRequests(page);
        await openDesktop(page);
        const about = await openApp(page, 'about-aman');
        await about.getByTitle('Resume.pdf').click();
        await expect(about.getByLabel('Resume page 1')).toBeVisible({ timeout: 15_000 });
        await expect(about).not.toContainText('Unable to render resume preview');
        expect(cdn).toEqual([]);
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

test.describe('Side Quests map', () => {
    test('draws the map with the bundled Leaflet and boundary data', async ({ page }) => {
        const cdn = watchCdnRequests(page);
        const pmtiles: string[] = [];
        page.on('request', (req) => { if (req.url().endsWith('.pmtiles')) pmtiles.push(new URL(req.url()).pathname); });
        // 1x1 transparent PNG for every map tile, so the test doesn't depend on OpenStreetMap
        const tile = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
        await page.route('https://tile.openstreetmap.org/**', route => route.fulfill({ contentType: 'image/png', body: tile, headers: { 'access-control-allow-origin': '*' } }));
        await openDesktop(page);
        const app = await openApp(page, 'side-quests');
        await expect(app.locator('.leaflet-container')).toBeVisible({ timeout: 15_000 });
        await expect(app.locator('.leaflet-tile-loaded').first()).toBeAttached({ timeout: 15_000 });
        await expect.poll(() => pmtiles).toContain('/vendor/india-boundary/india_boundary_corrections.pmtiles');
        expect(cdn).toEqual([]);
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

    test('desktop folders survive a reload', async ({ page }) => {
        await openDesktop(page);
        await openApp(page, 'terminal');
        await runCommand(page, 'terminal', 'mkdir Mixtapes');
        await expect(page.locator('#app-new-folder-mixtapes')).toBeVisible();
        await page.reload();
        await expect(page.locator('#app-new-folder-mixtapes')).toBeVisible();
        await expect(page.locator('#app-new-folder-new-folder-mixtapes')).toHaveCount(0);
    });

    test('minimizes to the dock and restores from it', async ({ page }) => {
        await openDesktop(page);
        const window = await openApp(page, 'settings');
        await window.getByAltText('ubuntu window minimize').click();
        await expect(window).toBeHidden();
        await page.locator('#sidebar-settings').click();
        await expect(window).toBeVisible();
    });

    test('maximizes and restores a window', async ({ page }) => {
        await openDesktop(page);
        const window = await openApp(page, 'settings');
        const before = (await window.boundingBox())!.width;
        await window.getByAltText('ubuntu window maximize').click();
        await expect.poll(async () => (await window.boundingBox())!.width).toBeGreaterThan(before + 50);
        await window.getByAltText('ubuntu window restore').click();
        await expect.poll(async () => Math.round((await window.boundingBox())!.width)).toBe(Math.round(before));
    });

    test('opens Settings from the top bar', async ({ page }) => {
        await openDesktop(page);
        await page.locator('#status-bar').click();
        await page.locator('#open-settings').click();
        await expect(page.locator('#settings')).toBeVisible();
    });

    test('app grid search narrows and widens again', async ({ page }) => {
        await openDesktop(page);
        await page.getByAltText('Ubuntu view app').click();
        const search = page.getByPlaceholder('Type to Search');
        await search.fill('mus');
        await expect(page.locator('#app-music')).toBeVisible();
        await expect(page.locator('#app-todoist')).toHaveCount(0);
        await search.fill('');
        await expect(page.locator('#app-todoist')).toBeVisible();
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

test.describe('Admin (/xlib)', () => {
    const PASSCODE = 'e2e-admin-passcode';   // set for the test server in playwright.config.ts

    test('visitors see no admin apps, and /xlib asks for the passcode', async ({ page }) => {
        await openDesktop(page);
        await expect(page.locator('#app-admin-analytics')).toHaveCount(0);
        await page.goto('/xlib');
        await expect(page.locator('#admin-passcode')).toBeVisible();
        await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow');
    });

    test('logs in, shows analytics, stays logged in and logs out', async ({ page }) => {
        await openDesktop(page);   // also records a visit
        await page.goto('/xlib');
        await page.locator('#admin-passcode').fill('wrong passcode');
        await page.getByRole('button', { name: 'Unlock' }).click();
        await expect(page.locator('#ubuntu-lock-screen').getByRole('alert')).toHaveText("That passcode isn't right.");

        await page.locator('#admin-passcode').fill(PASSCODE);
        await page.getByRole('button', { name: 'Unlock' }).click();
        await expect(page.locator('#admin-passcode')).toBeHidden();
        await page.locator('#app-admin-analytics').dblclick();
        const app = page.locator('#admin-analytics');
        await expect(app.getByText('Visits', { exact: true })).toBeVisible();
        await expect(app.getByText('Apps opened')).toBeVisible();

        await page.locator('#app-admin-photo-drop').dblclick();
        await expect(page.locator('#admin-photo-drop')).toContainText('PHOTO_DROP_ADMIN_KEY is not set');   // tests run without the key

        await page.reload();
        await expect(page.locator('#app-admin-analytics')).toBeVisible();   // the session cookie survives a reload

        await page.locator('#app-admin-analytics').dblclick();
        await page.getByRole('button', { name: 'Log out of admin' }).click();
        await expect(page.locator('#admin-passcode')).toBeVisible();
    });

    test('site switches: hide an app and show a banner for visitors, then undo', async ({ page, browser }) => {
        await page.goto('/xlib');
        await page.locator('#admin-passcode').fill(PASSCODE);
        await page.getByRole('button', { name: 'Unlock' }).click();
        await page.locator('#app-admin-settings').dblclick();
        const app = page.locator('#admin-settings');
        await expect(app.getByText('PHOTO_DROP_ADMIN_KEY is not set')).toBeVisible();   // no script in tests

        const todoist = app.locator('label', { hasText: 'Todoist' }).getByRole('checkbox');
        await expect(todoist).toBeChecked();
        await todoist.click();   // saves, then the box updates
        await expect(app.getByRole('status')).toHaveText('Todoist hidden.');
        await app.getByLabel('Banner text').fill('Back from the mountains on Monday');
        await app.getByRole('button', { name: 'Save banner' }).click();
        await expect(app.getByRole('status')).toHaveText('Banner saved.');

        const visitor = await (await browser.newContext()).newPage();
        await openDesktop(visitor);
        await expect(visitor.locator('#site-banner')).toContainText('Back from the mountains on Monday');
        await expect(visitor.locator('#sidebar-todoist, #app-todoist')).toHaveCount(0);
        await expect(visitor.locator('#app-brave')).toBeVisible();

        await todoist.click();
        await expect(app.getByRole('status')).toHaveText('Todoist shown.');
        await expect(todoist).toBeChecked();
        await app.getByRole('button', { name: 'Remove' }).click();
        await expect(app.getByRole('status')).toHaveText('Banner removed.');
    });
});

test.describe('Arcade', () => {
    const framesOf = (page: import('@playwright/test').Page) => page.locator('[data-game="hello"]').evaluate(el => Number((el as HTMLElement).dataset.frames));

    async function play(page: import('@playwright/test').Page, backend: 'webgl2' | 'webgpu') {
        await openDesktop(page, { 'arcade-backend': backend });
        const arcade = await openApp(page, 'arcade');
        await arcade.getByRole('button', { name: 'Play Hello Cube' }).click();
        await expect.poll(() => framesOf(page), { timeout: 20_000 }).toBeGreaterThan(10);
        await expect(page.locator('[data-game="hello"]')).toHaveAttribute('data-backend', backend);
        return arcade;
    }

    test('runs a sokol game on WebGL2, pauses when minimized, and goes back to the launcher', async ({ page }) => {
        const arcade = await play(page, 'webgl2');
        await expect(arcade.getByText('WebGL2 ·')).toBeVisible();

        await arcade.getByAltText('ubuntu window minimize').click();
        await page.waitForTimeout(1500);   // the page notices within 400 ms
        const paused = await framesOf(page);
        await page.waitForTimeout(1500);
        expect(await framesOf(page)).toBeLessThanOrEqual(paused + 30);   // at most one stats report in flight
        await page.locator('#sidebar-arcade').click();
        await expect.poll(() => framesOf(page), { timeout: 10_000 }).toBeGreaterThan(paused + 30);

        await arcade.getByRole('button', { name: '← Games' }).click();
        await expect(arcade.getByRole('button', { name: 'Play Hello Cube' })).toBeVisible();
    });

    test('runs on WebGPU where the browser has an adapter', async ({ page }) => {
        await page.goto('/');
        const hasAdapter = await page.evaluate(async () => !!((navigator as unknown as { gpu?: { requestAdapter(): Promise<unknown> } }).gpu && await (navigator as unknown as { gpu: { requestAdapter(): Promise<unknown> } }).gpu.requestAdapter()));
        test.skip(!hasAdapter, 'no WebGPU adapter in this browser');
        await play(page, 'webgpu');
    });

    test('Neon Breakout starts, takes keyboard input and keeps running', async ({ page }) => {
        await openDesktop(page, { 'arcade-backend': 'webgl2' });
        const arcade = await openApp(page, 'arcade');
        await arcade.getByRole('button', { name: 'Play Neon Breakout' }).click();
        const game = page.locator('[data-game="breakout"]');
        const frames = () => game.evaluate(el => Number((el as HTMLElement).dataset.frames));
        await expect.poll(frames, { timeout: 20_000 }).toBeGreaterThan(10);
        await game.locator('canvas').click();   // focus and launch
        await page.keyboard.down('ArrowLeft');
        await page.waitForTimeout(400);
        await page.keyboard.up('ArrowLeft');
        const before = await frames();
        await expect.poll(frames).toBeGreaterThan(before + 20);
        await expect(game.locator('canvas')).toBeFocused();
        // the click also unlocked audio: the AudioWorklet is up and the game has pushed samples to it
        type Audio = { xlGame: { xlAudio?: { ready: boolean; written: number; ctx: { state: string } } } };
        await expect.poll(() => game.evaluate(el => (el as unknown as Audio).xlGame.xlAudio?.ready)).toBe(true);
        await expect.poll(() => game.evaluate(el => (el as unknown as Audio).xlGame.xlAudio?.ctx.state)).toBe('running');
        await expect.poll(() => game.evaluate(el => (el as unknown as Audio).xlGame.xlAudio?.written)).toBeGreaterThan(0);
    });

    test('the Breakout paddle stays where the keys left it', async ({ page }) => {
        await openDesktop(page, { 'arcade-backend': 'webgl2' });
        const arcade = await openApp(page, 'arcade');
        await arcade.getByRole('button', { name: 'Play Neon Breakout' }).click();
        const game = page.locator('[data-game="breakout"]');
        await expect.poll(() => game.evaluate(el => Number((el as HTMLElement).dataset.frames)), { timeout: 20_000 }).toBeGreaterThan(10);
        const paddle = () => game.evaluate(el => (el as unknown as { xlGame: { _breakout_paddle_x(): number } }).xlGame._breakout_paddle_x());
        await game.locator('canvas').click();   // clicks the middle: focus, and the paddle starts centred
        expect(await paddle()).toBeCloseTo(320, 0);
        await page.keyboard.down('ArrowRight');
        await page.waitForTimeout(400);
        await page.keyboard.up('ArrowRight');
        const released = await paddle();
        expect(released).toBeGreaterThan(400);
        await page.waitForTimeout(500);
        expect(await paddle()).toBeCloseTo(released, 0);   // doesn't snap back to where the mouse last was
    });

    test('a gamepad moves the Breakout paddle and launches the ball', async ({ page }) => {
        // a fake standard-mapping gamepad the test can steer
        await page.addInitScript(() => {
            const state = { lx: 0, a: false };
            (window as unknown as { __pad: typeof state }).__pad = state;
            navigator.getGamepads = () => [{
                connected: true, id: 'test pad', index: 0, mapping: 'standard', timestamp: 0,
                axes: [state.lx, 0, 0, 0],
                buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: i === 0 && state.a, touched: false, value: i === 0 && state.a ? 1 : 0 })),
            } as unknown as Gamepad];
        });
        await openDesktop(page, { 'arcade-backend': 'webgl2' });
        const arcade = await openApp(page, 'arcade');
        await arcade.getByRole('button', { name: 'Play Neon Breakout' }).click();
        const game = page.locator('[data-game="breakout"]');
        await expect.poll(() => game.evaluate(el => Number((el as HTMLElement).dataset.frames)), { timeout: 20_000 }).toBeGreaterThan(10);
        await expect(game).toContainText('🎮');
        const paddle = () => game.evaluate(el => (el as unknown as { xlGame: { _breakout_paddle_x(): number } }).xlGame._breakout_paddle_x());
        const start = await paddle();
        await page.evaluate(() => { (window as unknown as { __pad: { lx: number } }).__pad.lx = 1; });
        await expect.poll(paddle).toBeGreaterThan(start + 100);
        await page.evaluate(() => { (window as unknown as { __pad: { lx: number; a: boolean } }).__pad.lx = 0; (window as unknown as { __pad: { a: boolean } }).__pad.a = true; });
        const stopped = await paddle();
        await page.waitForTimeout(300);
        expect(await paddle()).toBeCloseTo(stopped, 0);   // centred stick: the paddle stays put
    });

    test('Shader Playground: presets run and mistakes show their line', async ({ page }) => {
        await openDesktop(page, { 'arcade-backend': 'webgl2' });
        const arcade = await openApp(page, 'arcade');
        await arcade.getByRole('button', { name: 'Play Shader Playground' }).click();
        const status = arcade.locator('[data-status]');
        for (const preset of ['Plasma', 'Neon tunnel', 'Raymarched spheres']) {
            await arcade.getByRole('button', { name: preset, exact: true }).click();
            await expect(status).toHaveAttribute('data-status', 'ok', { timeout: 15_000 });
        }
        const editor = arcade.getByLabel('GLSL shader code');
        await editor.fill('void mainImage(out vec4 fragColor, in vec2 fragCoord) {\n    fragColor = vec4(nope);\n}\n');
        await expect(status).toHaveAttribute('data-status', 'error');
        await expect(arcade.getByRole('alert')).toContainText("line 2: 'nope' : undeclared identifier");
        await expect.poll(() => page.locator('[data-game="playground"]').evaluate(el => Number((el as HTMLElement).dataset.frames))).toBeGreaterThan(10);
    });

    test('3D Showcase renders, orbits and switches camera', async ({ page }) => {
        await openDesktop(page, { 'arcade-backend': 'webgl2' });
        const arcade = await openApp(page, 'arcade');
        await arcade.getByRole('button', { name: 'Play 3D Showcase' }).click();
        const game = page.locator('[data-game="showcase"]');
        const frames = () => game.evaluate(el => Number((el as HTMLElement).dataset.frames));
        await expect.poll(frames, { timeout: 20_000 }).toBeGreaterThan(10);
        const canvas = game.locator('canvas');
        const box = (await canvas.boundingBox())!;
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        await page.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2 + 30, { steps: 8 });
        await page.mouse.up();
        await page.keyboard.press('KeyC');
        await page.keyboard.press('KeyN');
        const before = await frames();
        await expect.poll(frames).toBeGreaterThan(before + 20);
    });

    test('Turbo Trails: the chariot drives, burns fuel, the panel shows eras and a shop', async ({ page }) => {
        await openDesktop(page, { 'arcade-backend': 'webgl2' });
        const arcade = await openApp(page, 'arcade');
        await arcade.getByAltText('ubuntu window maximize').click();
        await arcade.getByRole('button', { name: 'Play Turbo Trails' }).click();
        const game = page.locator('[data-game="turbo-trails"]');
        await expect.poll(() => game.evaluate(el => Number((el as HTMLElement).dataset.frames)), { timeout: 25_000 }).toBeGreaterThan(10);
        const state = () => game.evaluate(el => {
            const g = (el as unknown as { xlGame: { _tt_state_json(): number; UTF8ToString(p: number): string; _free(p: number): void } }).xlGame;
            const ptr = g._tt_state_json(); const text = g.UTF8ToString(ptr); g._free(ptr);
            return JSON.parse(text) as { era: number; unlocked: number; coins: number; run: { state: number; distance: number } };
        });
        expect(await state()).toMatchObject({ era: 0, unlocked: 1, run: { state: 0, distance: 0 } });

        // the panel: story, locked eras, a shop you can't afford yet
        await expect(arcade.getByText('2000 BCE · Chariots').first()).toBeVisible();
        await expect(arcade.getByRole('button', { name: /1769 · Steam/ })).toBeDisabled();
        await expect(arcade.getByRole('button', { name: /^Engine/ })).toBeDisabled();

        const box = (await game.locator('canvas').boundingBox())!;
        await page.mouse.click(box.x + box.width * 0.25, box.y + box.height * 0.5);   // focus (left half = brake)
        await page.keyboard.down('ArrowRight');
        await expect.poll(async () => (await state()).run.distance, { timeout: 10_000 }).toBeGreaterThan(15);
        await page.keyboard.up('ArrowRight');
        const after = await state();
        expect(after.run.state).toBe(1);   // driving
        // the chariot can't go faster than its motor allows (about 9 m/s)
        expect(after.run.distance).toBeLessThan(60);
    });

    test('Turbo Trails: unlocked eras switch the world, locked ones stay locked, the shop sells upgrades', async ({ page }) => {
        await openDesktop(page, { 'arcade-backend': 'webgl2', 'arcade:turbo-trails:progress': 'v1;coins=650;unlocked=3' });
        const arcade = await openApp(page, 'arcade');
        await arcade.getByAltText('ubuntu window maximize').click();
        await arcade.getByRole('button', { name: 'Play Turbo Trails' }).click();
        const game = page.locator('[data-game="turbo-trails"]');
        await expect.poll(() => game.evaluate(el => Number((el as HTMLElement).dataset.frames)), { timeout: 25_000 }).toBeGreaterThan(10);
        const panel = page.locator('[data-coins]');
        await expect(panel).toHaveAttribute('data-coins', '650');
        await arcade.getByRole('button', { name: /1769 · Steam/ }).click();
        await expect(panel).toHaveAttribute('data-era', '1');
        await expect(arcade.getByText('Shropshire, England')).toBeVisible();
        await expect(arcade.getByRole('button', { name: /1885 · Motorwagen/ })).toBeDisabled();
        // buy: Engine tier 1 costs 300, tier 2 costs 400 (can't afford after the first)
        const engine = arcade.getByRole('button', { name: /^Engine/ });
        await engine.click();
        await expect(panel).toHaveAttribute('data-coins', '350');
        await expect(engine).toContainText('●○○○ $400');
        await expect(engine).toBeDisabled();
        // it sticks: reload, the upgrade and coins are still there
        await page.reload();
        await openApp(page, 'arcade');
        await page.getByRole('button', { name: 'Play Turbo Trails' }).click();
        await expect(page.locator('[data-coins]')).toHaveAttribute('data-coins', '350', { timeout: 25_000 });
    });

    test('Turbo Trails: the global leaderboard shows posted runs and highlights your nickname', async ({ page }) => {
        // two runs already on the Chariots board (the test server keeps them in memory)
        for (const [name, score] of [['Asha', 820], ['Ravi', 640]] as const) {
            const res = await page.request.post('/api/arcade/leaderboard', { data: { game: 'turbo-trails', board: 0, name, score }, headers: { origin: 'http://localhost:3100' } });
            expect(res.ok()).toBe(true);
        }
        await openDesktop(page, { 'arcade-backend': 'webgl2', 'arcade:nickname': 'Ravi' });
        const arcade = await openApp(page, 'arcade');
        await arcade.getByAltText('ubuntu window maximize').click();
        await arcade.getByRole('button', { name: 'Play Turbo Trails' }).click();
        const board = arcade.getByTestId('leaderboard');
        await expect(board).toContainText('1.Asha820 m', { timeout: 25_000 });
        await expect(board.locator('[data-rank="2"]')).toContainText('Ravi');
        await expect(board.locator('[data-rank="2"]')).toHaveClass(/text-yellow-300/);
        await expect(board.locator('[data-rank="1"]')).not.toHaveClass(/text-yellow-300/);
        await expect(board.getByLabel('Nickname')).toHaveValue('Ravi');
        // posting is validated server-side
        const bad = await page.request.post('/api/arcade/leaderboard', { data: { game: 'turbo-trails', board: 0, name: 'X', score: 99999 }, headers: { origin: 'http://localhost:3100' } });
        expect(bad.status()).toBe(400);
    });

    test("a running game doesn't steal keys from the terminal", async ({ page }) => {
        await play(page, 'webgl2');
        await openApp(page, 'terminal');
        await runCommand(page, 'terminal', 'echo typing still works');
        await expect(page.locator('#terminal')).toContainText('typing still works');
    });
});

