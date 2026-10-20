import { expect, type Page } from '@playwright/test';

// Skip the boot animation and lock screen, and collect uncaught errors from our own page
export async function openDesktop(page: Page, storage: Record<string, string> = {}) {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    await page.addInitScript((extra) => {
        if (sessionStorage.getItem('__seeded')) return;   // only seed on the first load of each test
        sessionStorage.setItem('__seeded', '1');
        localStorage.setItem('booting_screen', 'false');
        localStorage.setItem('screen-locked', 'false');
        for (const [k, v] of Object.entries(extra)) localStorage.setItem(k, v);
    }, storage);
    await page.goto('/');
    await expect(page.locator('#sidebar-terminal')).toBeVisible();
    return errors;
}

export async function openApp(page: Page, id: string) {
    await page.locator(`#sidebar-${id}, #app-${id}`).first().click();
    const window = page.locator(`#${id}`).first();
    await expect(window).toBeVisible();
    await expect(window.getByText('Loading…', { exact: true })).toHaveCount(0, { timeout: 15_000 });
    return window;
}

// Type a command into the newest terminal-style prompt (Terminal or Calc)
export async function runCommand(page: Page, prefix: 'terminal' | 'calculator', command: string) {
    const input = page.locator(`input[id^="${prefix}-input-"]`).last();
    await input.click();
    await input.fill(command);
    await input.press('Enter');
}
