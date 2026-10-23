import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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

test.describe('Bot Lab', () => {
    test('Blink runs on the bench: the LED blinks, the multimeter reads the pin, wiring by clicking pins', async ({ page }) => {
        await openDesktop(page);
        const lab = await openApp(page, 'bot-lab');
        await lab.getByRole('button', { name: /^Blink An LED/ }).click();
        await expect(lab.getByTestId('bench')).toBeVisible();
        const led = lab.locator('[data-part="led1"]');
        await expect(led).toBeVisible();
        await lab.getByRole('button', { name: '▶ Run' }).click();
        const brightness = () => led.evaluate(el => Number((el as HTMLElement).dataset.brightness ?? 0));
        // sample fast: polling once a second against a once-a-second blink can keep landing on the same phase
        await expect.poll(brightness, { timeout: 15_000, intervals: [50] }).toBeGreaterThan(0.5);
        await expect.poll(brightness, { timeout: 15_000, intervals: [50] }).toBeLessThan(0.1);
        await expect.poll(brightness, { timeout: 15_000, intervals: [50] }).toBeGreaterThan(0.5);
        // the multimeter: the pin 13 net sits at 5 V while the LED is lit, with the LED's drop across the resistor
        await lab.getByRole('tab', { name: 'monitor' }).click();
        const pinNet = lab.locator('[data-net*="uno1.D13"] [data-volts]');
        await expect.poll(() => pinNet.getAttribute('data-volts').then(Number), { timeout: 5_000 }).toBeGreaterThan(4);
        await lab.getByRole('button', { name: '■ Stop' }).click();
        // wire two pins by clicking them, then remove the wire by clicking it
        await lab.getByRole('tab', { name: 'parts' }).click();
        await lab.locator('[data-part="uno1"] [data-pin="D12"]').click();
        await lab.locator('[data-part="led1"] [data-pin="a"]').click();
        await expect(lab.locator('[data-wire="uno1.D12-led1.a"]')).toHaveCount(1);
        await lab.locator('[data-wire="uno1.D12-led1.a"]').dispatchEvent('click');   // a curve's box centre isn't on the curve
        await expect(lab.locator('[data-wire="uno1.D12-led1.a"]')).toHaveCount(0);
    });

    test('Button: pressing it on the bench lights the LED and the sketch prints to the serial monitor', async ({ page }) => {
        await openDesktop(page);
        const lab = await openApp(page, 'bot-lab');
        await lab.getByRole('button', { name: /^Button(?! \(Raspberry)/ }).click();
        await lab.getByRole('button', { name: '▶ Run' }).click();
        await lab.getByRole('tab', { name: 'monitor' }).click();
        await expect(lab.getByTestId('serial')).toContainText('press the button', { timeout: 5_000 });
        const button = lab.locator('[data-part="button1"] [data-button]');
        const box = (await button.boundingBox())!;
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        await expect.poll(() => lab.locator('[data-part="led1"]').evaluate(el => Number((el as HTMLElement).dataset.brightness ?? 0)), { timeout: 5_000 }).toBeGreaterThan(0.5);
        await expect(lab.getByTestId('serial')).toContainText('pressed');
        await page.mouse.up();
        await expect(lab.getByTestId('serial')).toContainText('released', { timeout: 5_000 });
    });

    test('an LED without a resistor burns out, with a warning; projects persist on this device', async ({ page }) => {
        await openDesktop(page);
        const lab = await openApp(page, 'bot-lab');
        await lab.getByRole('button', { name: /^Blink An LED/ }).click();
        // short the resistor out: wire the pin straight to the LED and remove the resistor
        await lab.locator('[data-part="uno1"] [data-pin="D13"]').click();
        await lab.locator('[data-part="led1"] [data-pin="a"]').click();
        await lab.locator('[data-part="resistor1"]').click();
        await lab.getByRole('button', { name: 'remove' }).click();
        await expect(lab.locator('[data-part="resistor1"]')).toHaveCount(0);
        await lab.getByRole('button', { name: '▶ Run' }).click();
        await expect(lab.getByRole('alert')).toContainText('burnt out', { timeout: 8_000 });
        await expect(lab.locator('[data-part="led1"][data-dead="true"]')).toBeVisible();
        await lab.getByRole('button', { name: '■ Stop' }).click();
        await lab.getByRole('button', { name: '← Projects' }).click();
        await expect(lab.getByText('Your projects')).toBeVisible();
        await page.reload();
        const again = await openApp(page, 'bot-lab');
        await expect(again.locator('li').filter({ hasText: 'Blink' })).toContainText('2 parts');
    });

    test('Build: a job on GitHub Actions reports progress, errors point at their line, and a successful build is what the Uno runs', async ({ page }) => {
        // the site's compile endpoint is mocked: the first build fails with an error, the second runs as a job
        // (queued → running → done) and comes back with the Hello serial template's hex
        const helloHex = readFileSync(join(process.cwd(), '../../packages/bot-lab/templates/hello_serial/hello_serial.hex'), 'utf8');   // tests run from apps/web
        const sent: string[] = [];
        let polls = 0;
        await page.route('**/api/bot-lab/compile*', async route => {
            const request = route.request();
            if (request.method() === 'GET' && !request.url().includes('job=')) return route.fulfill({ json: { available: true } });
            if (request.method() === 'GET') {
                polls++;
                return route.fulfill({ json: polls < 2 ? { state: 'queued' } : polls < 3 ? { state: 'running' } : { state: 'done', result: { ok: true, hex: helloHex, size: 1830, warnings: [] } } });
            }
            const { sketch } = request.postDataJSON() as { sketch: string };
            sent.push(sketch);
            if (sent.length === 1) return route.fulfill({ json: { ok: false, errors: [{ line: 3, column: 3, severity: 'error', message: "'pinMod' was not declared in this scope" }] } });
            return route.fulfill({ status: 202, json: { job: 'c'.repeat(32) } });
        });
        await openDesktop(page);
        const lab = await openApp(page, 'bot-lab');
        await lab.getByRole('button', { name: /^Blink An LED/ }).click();
        await lab.getByRole('tab', { name: 'code' }).click();
        await expect(lab.getByTestId('code-note')).toContainText('The Uno runs this build');
        const editor = lab.getByLabel('Sketch');
        await editor.fill('// edited\nvoid setup() {\n  pinMod(13, OUTPUT);\n}\nvoid loop() {}\n');
        await expect(lab.getByTestId('code-note')).toContainText('changed since its last build');
        await lab.getByRole('button', { name: 'Build' }).click();
        await expect(lab.getByRole('status')).toHaveText('1 error');
        await lab.getByTestId('build-errors').getByRole('button', { name: /line 3:.*pinMod/ }).click();
        // the cursor jumps to line 3 (from its column to the end of the line)
        const selected = await editor.evaluate(el => { const t = el as HTMLTextAreaElement; return t.value.slice(t.selectionStart, t.selectionEnd); });
        expect(selected).toBe('pinMod(13, OUTPUT);');
        await editor.fill('void setup() { Serial.begin(9600); }\nvoid loop() {}\n');
        await lab.getByRole('button', { name: 'Build' }).click();
        await expect(lab.getByTestId('build-progress')).toContainText('GitHub Actions');
        await expect(lab.getByTestId('build-progress')).toContainText('Compiling', { timeout: 10_000 });
        await expect(lab.getByRole('status')).toContainText('Built: 1830 of 32256 bytes', { timeout: 10_000 });
        await expect(lab.getByTestId('code-note')).toContainText('The Uno runs this build');
        expect(sent).toHaveLength(2);
        await lab.getByRole('button', { name: '▶ Run' }).click();
        await lab.getByRole('tab', { name: 'monitor' }).click();
        await expect(lab.getByTestId('serial')).toContainText('hello from the bench', { timeout: 10_000 });
        await lab.getByRole('button', { name: '■ Stop' }).click();
        // the build is saved with the project
        await lab.getByRole('button', { name: '← Projects' }).click();
        await page.reload();
        const again = await openApp(page, 'bot-lab');
        await again.locator('li').filter({ hasText: 'Blink' }).getByRole('button').first().click();
        await again.getByRole('tab', { name: 'code' }).click();
        await expect(again.getByTestId('code-note')).toContainText('The Uno runs this build');
    });

    test('where the site can\u2019t compile, the editor has no Build button and says so', async ({ page }) => {
        // whether a local server has a compiler depends on its .env.local, so the answer is mocked
        await page.route('**/api/bot-lab/compile', route => route.request().method() === 'GET' ? route.fulfill({ json: { available: false } }) : route.abort());
        await openDesktop(page);
        const lab = await openApp(page, 'bot-lab');
        await lab.getByRole('button', { name: /^Blink An LED/ }).click();
        await lab.getByRole('tab', { name: 'code' }).click();
        await expect(lab.getByTestId('code-note')).toContainText('isn\u2019t set up here');
        await expect(lab.getByRole('button', { name: 'Build' })).toHaveCount(0);
    });

    test('the Raspberry Pi runs Python: gpiozero blinks the LED, Stop ends a sleeping script, the console shows prints', async ({ page }) => {
        test.slow();   // CPython (Pyodide) loads in the runtime worker
        await openDesktop(page);
        const lab = await openApp(page, 'bot-lab');
        await lab.getByRole('button', { name: /^Blink \(Raspberry Pi\)/ }).click();
        await expect(lab.locator('[data-part="pi1"]')).toBeVisible();
        await lab.getByRole('tab', { name: 'code' }).click();
        await expect(lab.getByLabel('Python script')).toHaveValue(/from gpiozero import LED/);
        await lab.getByRole('button', { name: '▶ Run' }).click();
        const led = lab.locator('[data-part="led1"]');
        const brightness = () => led.evaluate(el => Number((el as HTMLElement).dataset.brightness ?? 0));
        // sample fast: the LED blinks with a 1 s period, the default 1 s poll would always see the same phase
        await expect.poll(brightness, { timeout: 60_000, intervals: [50] }).toBeGreaterThan(0.5);
        await expect.poll(brightness, { timeout: 10_000, intervals: [50] }).toBeLessThan(0.1);
        await expect.poll(brightness, { timeout: 10_000, intervals: [50] }).toBeGreaterThan(0.5);
        // Stop reaches the script inside its while True / sleep loop
        await lab.getByRole('button', { name: '■ Stop' }).click();
        await expect(lab.getByRole('button', { name: '▶ Run' })).toBeVisible({ timeout: 10_000 });
        await expect(lab.getByTestId('bench')).toHaveAttribute('data-running', 'false');
        // a second run is a fresh script on a fresh bench: prints land in the console, and the pin is driven again
        await lab.getByLabel('Python script').fill('from gpiozero import LED\nfrom time import sleep\nled = LED(17)\nprint("hello from the pi")\nled.on()\nsleep(0.3)\nprint("value", led.value)\n');
        await lab.getByRole('button', { name: '▶ Run' }).click();
        await lab.getByRole('tab', { name: 'monitor' }).click();
        await expect(lab.getByTestId('serial')).toContainText('hello from the pi', { timeout: 30_000 });
        await expect(lab.getByTestId('serial')).toContainText('value 1', { timeout: 10_000 });
        await expect(lab.getByText('The script ended. Run starts it again.')).toHaveCount(0);   // that note is on the Code tab
        await lab.getByRole('tab', { name: 'code' }).click();
        await expect(lab.getByText('The script ended. Run starts it again.')).toBeVisible({ timeout: 10_000 });
        await expect.poll(brightness).toBeGreaterThan(0.5);   // the bench stays alive after the script ends
    });

    test('the Pi terminal: i2cdetect finds the sensor, the Python prompt reads it, python3 main.py runs and Ctrl+C stops it', async ({ page }) => {
        test.slow();
        await openDesktop(page);
        const lab = await openApp(page, 'bot-lab');
        await lab.getByRole('button', { name: /^Temperature \(Raspberry Pi/ }).click();
        await lab.getByRole('tab', { name: 'monitor' }).click();
        const term = lab.getByLabel('Terminal'), screen = lab.getByTestId('serial'), prompt = lab.getByTestId('prompt');
        await expect(prompt).toHaveText('pi@botlab:~ $');
        await term.fill('i2cdetect -y 1');
        await term.press('Enter');
        await expect(screen).toContainText('40: -- -- -- -- -- -- -- -- 48 --');
        await term.fill('python3');
        await term.press('Enter');
        await expect(prompt).toHaveText('>>>', { timeout: 60_000 });
        await term.fill('from smbus2 import SMBus');
        await term.press('Enter');
        await term.fill('hi, lo = SMBus(1).read_i2c_block_data(0x48, 0, 2); print((hi << 8 | lo) >> 4 >> 4)');
        await term.press('Enter');
        await expect(screen).toContainText(/\n22\n|\n22$/);   // 22 °C
        await term.fill('for i in range(2):');
        await term.press('Enter');
        await expect(prompt).toHaveText('...');
        await term.fill('    print("loop", i)');
        await term.press('Enter');
        await term.fill('');
        await term.press('Enter');
        await expect(screen).toContainText('loop 1');
        await term.fill('exit()');
        await term.press('Enter');
        await expect(prompt).toHaveText('pi@botlab:~ $');
        // the script itself, from the terminal; the temperature follows the inspector
        await term.fill('python3 main.py');
        await term.press('Enter');
        await expect(screen).toContainText('temperature: 22.00 C', { timeout: 30_000 });
        await expect(prompt).toHaveText('');
        await term.press('Control+c');
        await expect(screen).toContainText('^C');
        await expect(prompt).toHaveText('pi@botlab:~ $');
        await expect(lab.getByRole('button', { name: '▶ Run' })).toBeVisible();
    });

    test('the Uno reads a TMP102 over I²C with the Wire library', async ({ page }) => {
        await openDesktop(page);
        const lab = await openApp(page, 'bot-lab');
        await lab.getByRole('button', { name: /^Temperature \(I²C\)/ }).click();
        await lab.getByRole('button', { name: '▶ Run' }).click();
        await lab.getByRole('tab', { name: 'monitor' }).click();
        await expect(lab.getByTestId('serial')).toContainText('temperature: 22.00 C', { timeout: 10_000 });
        await lab.getByRole('tab', { name: 'parts' }).click();
        await lab.locator('[data-part="tmp1021"]').click();
        await lab.getByLabel(/Temperature \(°C\)/).fill('30');
        await lab.getByRole('tab', { name: 'monitor' }).click();
        await expect(lab.getByTestId('serial')).toContainText('temperature: 30.00 C', { timeout: 10_000 });
    });

    test('the Pico runs MicroPython: Blink blinks, Ctrl+C interrupts it, and its REPL answers', async ({ page }) => {
        test.slow();   // the firmware (about 700 KB) loads, MicroPython boots on the emulated RP2040
        await openDesktop(page);
        const lab = await openApp(page, 'bot-lab');
        await lab.getByRole('button', { name: /^Blink \(Pico/ }).click();
        await expect(lab.locator('[data-part="pico1"]')).toBeVisible();
        await lab.getByRole('button', { name: '▶ Run' }).click();
        const led = () => lab.locator('[data-part="led1"]').evaluate(el => Number((el as HTMLElement).dataset.brightness ?? 0));
        const boardLed = () => lab.locator('[data-part="pico1"] [data-led]').getAttribute('data-led');
        await expect.poll(led, { timeout: 60_000, intervals: [50] }).toBeGreaterThan(0.5);
        await expect.poll(led, { timeout: 10_000, intervals: [50] }).toBeLessThan(0.1);
        await expect.poll(boardLed, { timeout: 10_000, intervals: [50] }).toBe('on');
        await lab.getByRole('tab', { name: 'monitor' }).click();
        const term = lab.getByLabel('Terminal'), screen = lab.getByTestId('serial');
        await term.press('Control+c');
        await expect(screen).toContainText('KeyboardInterrupt', { timeout: 10_000 });
        await expect(screen).toContainText('>>>');
        await term.fill('print(6 * 7)');
        await term.press('Enter');
        await expect(screen).toContainText(/\n42(\n|$)/, { timeout: 10_000 });
        await lab.getByRole('button', { name: '■ Stop' }).click();
        await expect(lab.getByRole('button', { name: '▶ Run' })).toBeVisible();
    });

    test('Motor and driver: PWM through the TB6612 spins the motor up, then the other way', async ({ page }) => {
        await openDesktop(page);
        const lab = await openApp(page, 'bot-lab');
        await lab.getByRole('button', { name: /^Motor and driver A TB6612/ }).click();
        await lab.getByRole('button', { name: '▶ Run' }).click();
        const rpm = () => lab.locator('[data-part="motor1"] [data-rpm]').getAttribute('data-rpm').then(Number);
        await expect.poll(rpm, { timeout: 15_000, intervals: [100] }).toBeGreaterThan(150);
        await expect.poll(rpm, { timeout: 15_000, intervals: [100] }).toBeLessThan(-150);
        await lab.getByRole('button', { name: '■ Stop' }).click();
    });

    test('the Robot drives in the World: forwards, then it turns; the bench shows its motors', async ({ page }) => {
        await openDesktop(page);
        const lab = await openApp(page, 'bot-lab');
        await lab.getByRole('button', { name: /^Robot \(World\)/ }).click();
        await expect(lab.getByTestId('world')).toBeVisible();
        const robot = lab.locator('[data-robot]');
        const x0 = Number(await robot.getAttribute('data-x'));
        await lab.getByRole('button', { name: '▶ Run' }).click();
        await expect.poll(() => robot.getAttribute('data-x').then(Number), { timeout: 20_000, intervals: [100] }).toBeGreaterThan(x0 + 0.2);
        await expect.poll(() => robot.getAttribute('data-heading').then(h => Math.abs(Number(h))), { timeout: 10_000, intervals: [100] }).toBeGreaterThan(0.5);
        await lab.getByRole('tab', { name: 'bench' }).click();
        await expect(lab.getByTestId('bench')).toBeVisible();
        await expect.poll(() => lab.locator('[data-part="motor1"] [data-rpm]').getAttribute('data-rpm').then(r => Math.abs(Number(r))), { timeout: 10_000, intervals: [100] }).toBeGreaterThan(50);
        await lab.getByRole('button', { name: '■ Stop' }).click();
    });

    test('the line follower laps the oval in the World, timed, and its best lap is kept', async ({ page }) => {
        test.slow();   // a lap takes about ten simulated seconds
        await openDesktop(page);
        const lab = await openApp(page, 'bot-lab');
        await lab.getByRole('button', { name: /^Line follower \(World\)/ }).click();
        await expect(lab.getByTestId('world')).toBeVisible();
        await lab.getByRole('button', { name: '▶ Run' }).click();
        await expect(lab.getByTestId('laps')).toContainText('Lap 1', { timeout: 20_000 });
        await expect(lab.locator('[data-laps="1"]')).toBeVisible({ timeout: 40_000 });
        await expect(lab.getByTestId('laps')).toContainText('last');
        await expect(lab.getByTestId('laps')).not.toContainText('off the track');
        await expect(lab.locator('[data-best]')).toBeVisible();
        const best = Number(await lab.locator('[data-best]').getAttribute('data-best'));
        expect(best).toBeGreaterThan(5);
        expect(best).toBeLessThan(15);
        await lab.getByRole('button', { name: '■ Stop' }).click();
        await lab.getByRole('button', { name: '← Projects' }).click();
        await page.reload();
        const again = await openApp(page, 'bot-lab');
        await again.locator('li').filter({ hasText: 'Line follower' }).getByRole('button').first().click();
        await expect(again.locator('[data-best]')).toHaveAttribute('data-best', best.toFixed(2));
    });

    test('the World in 3D: the view module runs embedded and follows the robot while it drives', async ({ page }) => {
        await openDesktop(page, { 'arcade-backend': 'webgl2' });
        const lab = await openApp(page, 'bot-lab');
        await lab.getByRole('button', { name: /^Robot \(World\)/ }).click();
        await lab.getByRole('tab', { name: '3D' }).click();
        const view = lab.locator('[data-game="view"]');
        const frames = () => view.evaluate(el => Number((el as HTMLElement).dataset.frames));
        await expect.poll(frames, { timeout: 20_000 }).toBeGreaterThan(10);
        await expect(view).toHaveAttribute('data-backend', /webgl2|webgpu/);
        await expect(lab.getByRole('button', { name: /← / })).toHaveCount(1);   // only Bot Lab's own back button: the view is embedded
        await lab.getByRole('button', { name: '▶ Run' }).click();
        const before = await frames();
        await expect.poll(frames, { timeout: 10_000 }).toBeGreaterThan(before + 30);
        await lab.getByRole('button', { name: '■ Stop' }).click();
        await lab.getByRole('tab', { name: 'Top' }).click();
        await expect(lab.locator('[data-robot]')).toBeVisible();
    });

    test('pick and place: the belt brings cubes, the arm drops them in the bin, the score counts them', async ({ page }) => {
        test.slow();   // a cube every few simulated seconds
        await openDesktop(page);
        const lab = await openApp(page, 'bot-lab');
        await lab.getByRole('button', { name: /^Pick and place \(World\)/ }).click();
        await expect(lab.getByTestId('world')).toBeVisible();
        await expect.poll(() => lab.locator('[data-bodies]').getAttribute('data-bodies').then(Number), { timeout: 20_000 }).toBeGreaterThan(10);   // built on load: arm, belt, bin
        await lab.getByRole('button', { name: '▶ Run' }).click();
        const pick = lab.getByTestId('pick');
        await expect(pick).toBeVisible({ timeout: 20_000 });
        await expect(pick).toHaveAttribute('data-delivered', '1', { timeout: 40_000 });
        await expect(pick).toHaveAttribute('data-dropped', '0');
        await lab.getByRole('tab', { name: 'monitor' }).click();
        await expect(lab.getByTestId('serial')).toContainText('cube 1 in the bin', { timeout: 10_000 });
        await lab.getByRole('tab', { name: '3D' }).click();
        await expect.poll(() => lab.locator('[data-game="view"]').evaluate(el => Number((el as HTMLElement).dataset.frames)), { timeout: 20_000 }).toBeGreaterThan(10);
        await lab.getByRole('button', { name: '■ Stop' }).click();
    });

    test('screens: a character LCD, an OLED and a 7-segment digit show what their sketches draw', async ({ page }) => {
        await openDesktop(page);
        const lab = await openApp(page, 'bot-lab');
        await lab.getByRole('button', { name: /^Character LCD\b/ }).first().click();
        await lab.getByRole('button', { name: '▶ Run' }).click();
        const lcd = lab.locator('[data-screen="lcd"]');
        await expect(lcd).toHaveAttribute('data-text', /^Hello, Bot Lab \u25a1\n5\d\d/, { timeout: 20_000 });
        await expect(lcd).toHaveAttribute('data-backlight', 'on');
        await lab.getByRole('button', { name: '■ Stop' }).click();
        await lab.getByRole('button', { name: '← Projects' }).click();

        await lab.getByRole('button', { name: /^OLED graphics/ }).click();
        await lab.getByRole('button', { name: '▶ Run' }).click();
        const oled = lab.locator('[data-screen="oled"]');
        await expect(oled).toHaveAttribute('data-on', 'true', { timeout: 20_000 });
        await expect.poll(() => oled.getAttribute('data-runs').then(Number)).toBeGreaterThan(50);
        await lab.getByRole('button', { name: '■ Stop' }).click();
        await lab.getByRole('button', { name: '← Projects' }).click();

        await lab.getByRole('button', { name: /^7-segment counter/ }).click();
        await lab.getByRole('button', { name: '▶ Run' }).click();
        const digit = lab.locator('[data-screen="sevenseg"]');
        await expect(digit).toHaveAttribute('data-segments', /^0110000[01]$/, { timeout: 20_000 });   // 1
        await lab.getByRole('button', { name: '■ Stop' }).click();
    });

    test('the quadcopter: the Uno flight controller takes off, holds its hover, lands; the Monitor plots what it prints', async ({ page }) => {
        test.slow();   // about 20 simulated seconds of flight
        await openDesktop(page);
        const lab = await openApp(page, 'bot-lab');
        await lab.getByRole('button', { name: /^Quadcopter hover \(World\)/ }).click();
        await expect.poll(() => lab.locator('[data-bodies]').getAttribute('data-bodies').then(Number), { timeout: 20_000 }).toBeGreaterThan(0);
        await expect(lab.getByTestId('laps')).toContainText('Run to fly');
        await lab.getByRole('button', { name: '▶ Run' }).click();
        const hover = lab.getByTestId('hover');
        await expect(hover).toHaveAttribute('data-phase', 'flying', { timeout: 30_000 });
        await lab.getByRole('tab', { name: 'monitor' }).click();
        await lab.getByRole('tab', { name: 'Plot' }).click();
        await expect(lab.getByTestId('plot')).toHaveAttribute('data-series', 'roll,pitch,height,target');
        await expect(hover).toHaveAttribute('data-passed', 'true', { timeout: 90_000 });
        await expect(hover).toHaveAttribute('data-phase', 'landed');
        await expect(lab.getByText(/hover done · landed at/)).toBeVisible();
        await lab.getByRole('tab', { name: 'Text' }).click();
        await expect(lab.getByTestId('serial')).toContainText('roll:');
        await lab.getByRole('button', { name: '■ Stop' }).click();
    });

    test('the track editor: presets, drawing a line point by point, a loop, the robot\u2019s start', async ({ page }) => {
        await openDesktop(page);
        const lab = await openApp(page, 'bot-lab');
        await lab.getByRole('button', { name: /^Robot \(World\)/ }).click();
        const track = lab.locator('[data-track]');
        await lab.getByRole('button', { name: 'Figure 8' }).click();
        await expect(track).toHaveAttribute('data-track', '64');
        await lab.getByRole('button', { name: 'Draw' }).click();
        await expect(track).toHaveAttribute('data-track', '0');
        const box = (await lab.getByTestId('world').locator('svg').boundingBox())!;
        for (const [fx, fy] of [[0.3, 0.3], [0.7, 0.3], [0.7, 0.7], [0.3, 0.7]]) await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
        await expect(track).toHaveAttribute('data-track', '4');
        await lab.getByRole('button', { name: 'Undo point' }).click();
        await expect(track).toHaveAttribute('data-track', '3');
        await lab.getByRole('button', { name: 'Done drawing' }).click();
        await lab.getByLabel('loop').uncheck();
        await expect(lab.getByLabel('loop')).not.toBeChecked();
        // drag the robot to a new start
        const robot = lab.locator('[data-robot]');
        const before = Number(await robot.getAttribute('data-x'));
        const rb = (await robot.boundingBox())!;
        await page.mouse.move(rb.x + rb.width / 2, rb.y + rb.height / 2);
        await page.mouse.down();
        await page.mouse.move(rb.x + rb.width / 2 + 80, rb.y + rb.height / 2, { steps: 5 });
        await page.mouse.up();
        await expect.poll(() => robot.getAttribute('data-x').then(Number)).toBeGreaterThan(before + 0.05);
        await lab.getByLabel('Start heading').fill('90');
        await expect.poll(() => robot.getAttribute('data-heading').then(Number)).toBeCloseTo(Math.PI / 2, 1);
    });

    test('the Raspberry Pi Button template: a press reaches the script while it sits in pause()', async ({ page }) => {
        test.slow();
        await openDesktop(page);
        const lab = await openApp(page, 'bot-lab');
        await lab.getByRole('button', { name: /^Button \(Raspberry Pi\)/ }).click();
        await lab.getByRole('button', { name: '▶ Run' }).click();
        await lab.getByRole('tab', { name: 'monitor' }).click();
        await expect(lab.getByTestId('serial')).toContainText('press the button', { timeout: 60_000 });
        const led = () => lab.locator('[data-part="led1"]').evaluate(el => Number((el as HTMLElement).dataset.brightness ?? 0));
        expect(await led()).toBeLessThan(0.1);
        const button = lab.locator('[data-part="button1"] [data-button]');
        const box = (await button.boundingBox())!;
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        await expect.poll(led, { timeout: 5_000 }).toBeGreaterThan(0.5);
        await page.mouse.up();
        await expect.poll(led, { timeout: 5_000 }).toBeLessThan(0.1);
        await lab.getByRole('button', { name: '■ Stop' }).click();
        await expect(lab.getByRole('button', { name: '▶ Run' })).toBeVisible({ timeout: 10_000 });
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
        test.setTimeout(150_000);   // the car takes a while to reach the crates on a slow machine
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
        // the crates by the road run on the engine's physics: a pyramid the car knocks down every lap. The car drives
        // in wall-clock time, so on a slow machine it may already have passed by now; only the outcome is asserted
        type Showcase = { xlGame: { _showcase_crate_height(i: number): number; _showcase_car_to_crates(): number } };
        const top = () => game.evaluate(el => (el as unknown as Showcase).xlGame._showcase_crate_height(9));
        expect(await top()).toBeGreaterThan(0);   // resting on something, not fallen through the island
        await expect.poll(() => game.evaluate(el => (el as unknown as Showcase).xlGame._showcase_car_to_crates()), { timeout: 110_000 }).toBeLessThan(2);
        await expect.poll(top, { timeout: 20_000 }).toBeLessThan(0.6);
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
            return JSON.parse(text) as { era: number; unlocked: number; coins: number; run: { state: number; distance: number; turbo: number; boosting: boolean } };
        });
        expect(await state()).toMatchObject({ era: 0, unlocked: 1, run: { state: 0, distance: 0, turbo: 0, boosting: false } });

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

        // leaning (↑) and Turbo (Space) are not gas: on a fresh run neither starts it
        await game.evaluate(el => (el as unknown as { xlGame: { _tt_restart(): void } }).xlGame._tt_restart());
        await page.keyboard.down('ArrowUp');
        await page.keyboard.down('Space');
        await page.waitForTimeout(800);
        expect((await state()).run).toMatchObject({ state: 0, distance: 0, boosting: false });
        await page.keyboard.up('ArrowUp');
        await page.keyboard.up('Space');
        // with a full meter, Space boosts while held and spends the meter
        await game.evaluate(el => (el as unknown as { xlGame: { _tt_fill_turbo(): void } }).xlGame._tt_fill_turbo());
        await page.keyboard.down('ArrowRight');
        await page.keyboard.down('Space');
        await expect.poll(async () => (await state()).run.boosting).toBe(true);
        await expect.poll(async () => (await state()).run.turbo).toBeLessThan(90);
        await page.keyboard.up('Space');
        await expect.poll(async () => (await state()).run.boosting).toBe(false);
        await page.keyboard.up('ArrowRight');
    });

    test('Turbo Trails: the desktop volume slider sets the game volume, and gas rumbles a gamepad', async ({ page }) => {
        // a fake pad with a rumble motor that records what the game asks of it
        await page.addInitScript(() => {
            const effects: unknown[] = [];
            (window as unknown as { __effects: unknown[] }).__effects = effects;
            navigator.getGamepads = () => [{
                connected: true, id: 'test pad', index: 0, mapping: 'standard', timestamp: 0, axes: [0, 0, 0, 0],
                buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
                vibrationActuator: { playEffect: (type: string, params: unknown) => { effects.push({ type, ...(params as object) }); return Promise.resolve('complete'); } },
            } as unknown as Gamepad];
        });
        await openDesktop(page, { 'arcade-backend': 'webgl2', 'sound-level': '20' });
        const arcade = await openApp(page, 'arcade');
        await arcade.getByRole('button', { name: 'Play Turbo Trails' }).click();
        const game = page.locator('[data-game="turbo-trails"]');
        await expect.poll(() => game.evaluate(el => Number((el as HTMLElement).dataset.frames)), { timeout: 25_000 }).toBeGreaterThan(10);
        type Audio = { xlGame: { xlAudio?: { gain: { gain: { value: number } } }; xlVolume?: number } };
        await game.locator('canvas').click();
        await expect.poll(() => game.evaluate(el => (el as unknown as Audio).xlGame.xlAudio?.gain.gain.value)).toBeCloseTo(0.2, 2);
        // move the slider in the top bar's status card: the game follows live
        await page.locator('#status-bar').click();
        await page.locator('input[name="headphone_range"]').fill('60');
        await expect.poll(() => game.evaluate(el => (el as unknown as Audio).xlGame.xlAudio?.gain.gain.value)).toBeCloseTo(0.6, 2);
        await page.keyboard.press('Escape');

        await game.locator('canvas').click();
        await page.keyboard.down('ArrowRight');
        await page.waitForTimeout(700);
        await page.keyboard.up('ArrowRight');
        const effects = await page.evaluate(() => (window as unknown as { __effects: { type: string; strongMagnitude: number; weakMagnitude: number; duration: number }[] }).__effects);
        expect(effects.length).toBeGreaterThan(3);                 // the press tap, then the engine's rumble every ~90 ms
        expect(effects.every(e => e.type === 'dual-rumble' && e.duration > 0)).toBe(true);
        expect(Math.max(...effects.map(e => e.weakMagnitude))).toBeGreaterThan(0.1);
    });

    test('Turbo Trails: leaning back pulls a wheelie, and R restarts', async ({ page }) => {
        await openDesktop(page, { 'arcade-backend': 'webgl2' });
        const arcade = await openApp(page, 'arcade');
        await arcade.getByRole('button', { name: 'Play Turbo Trails' }).click();
        const game = page.locator('[data-game="turbo-trails"]');
        await expect.poll(() => game.evaluate(el => Number((el as HTMLElement).dataset.frames)), { timeout: 25_000 }).toBeGreaterThan(10);
        const state = () => game.evaluate(el => {
            const g = (el as unknown as { xlGame: { _tt_state_json(): number; UTF8ToString(p: number): string; _free(p: number): void } }).xlGame;
            const ptr = g._tt_state_json(); const text = g.UTF8ToString(ptr); g._free(ptr);
            return JSON.parse(text) as { run: { state: number; distance: number; wheelie: number; stunt: string } };
        });
        await game.locator('canvas').click();
        await page.keyboard.down('ArrowRight');
        await expect.poll(async () => (await state()).run.distance).toBeGreaterThan(5);
        await page.keyboard.down('ArrowUp');                                                        // lean back: the front wheel comes up
        await expect.poll(async () => (await state()).run.wheelie, { timeout: 5_000 }).toBeGreaterThan(3);   // tenths of a second
        await page.keyboard.up('ArrowUp');
        await page.keyboard.up('ArrowRight');
        await page.keyboard.press('r');
        await expect.poll(async () => (await state()).run).toMatchObject({ state: 0, distance: 0, wheelie: 0 });
    });

    test.describe('on a phone', () => {
        test.use({ hasTouch: true, viewport: { width: 420, height: 800 } });

        test('Turbo Trails asks for landscape, boosts with both thumbs, and leans with the gyro', async ({ page }) => {
            await openDesktop(page, { 'arcade-backend': 'webgl2' });
            const arcade = await openApp(page, 'arcade');
            await arcade.getByRole('button', { name: 'Play Turbo Trails' }).click();
            const game = page.locator('[data-game="turbo-trails"]');
            await expect.poll(() => game.evaluate(el => Number((el as HTMLElement).dataset.frames)), { timeout: 25_000 }).toBeGreaterThan(10);
            await expect(page.getByTestId('rotate-hint')).toBeVisible();
            await page.setViewportSize({ width: 800, height: 420 });
            await expect(page.getByTestId('rotate-hint')).toBeHidden();

            const state = () => game.evaluate(el => {
                const g = (el as unknown as { xlGame: { _tt_state_json(): number; UTF8ToString(p: number): string; _free(p: number): void; _tt_fill_turbo(): void } }).xlGame;
                const ptr = g._tt_state_json(); const text = g.UTF8ToString(ptr); g._free(ptr);
                return JSON.parse(text) as { lean: number; run: { state: number; boosting: boolean } };
            });
            const box = (await game.locator('canvas').boundingBox())!;
            await page.touchscreen.tap(box.x + box.width * 0.7, box.y + box.height * 0.5);   // focus (and the gyro's first touch)
            await game.evaluate(el => (el as unknown as { xlGame: { _tt_fill_turbo(): void } }).xlGame._tt_fill_turbo());
            // two thumbs, one on each half: gas and Turbo together
            const cdp = await page.context().newCDPSession(page);
            const points = [{ x: box.x + box.width * 0.2, y: box.y + box.height * 0.5, id: 1 }, { x: box.x + box.width * 0.8, y: box.y + box.height * 0.5, id: 2 }];
            await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points });
            await expect.poll(async () => (await state()).run.boosting).toBe(true);
            await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
            await expect.poll(async () => (await state()).run.boosting).toBe(false);
            // the gyro: the first reading is level, tilting from there leans
            await page.evaluate(() => { window.dispatchEvent(new DeviceOrientationEvent('deviceorientation', { beta: 40, gamma: 10 })); });
            await page.evaluate(() => { window.dispatchEvent(new DeviceOrientationEvent('deviceorientation', { beta: 40, gamma: 32 })); });
            await expect.poll(async () => (await state()).lean).toBe(100);
        });
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

