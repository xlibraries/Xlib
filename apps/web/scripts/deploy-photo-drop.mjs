// Deploys the Photo Drop backend for this site: the deployment id comes from content/photo-drop.json (its endpoint
// URL), the script id from PHOTO_DROP_SCRIPT_ID, and PHOTO_DROP_ADMIN_KEY (if set) lets the admin panel read the
// script's status. Run from the repo root: pnpm deploy:photo-drop
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export function deploymentIdFrom(endpoint) {
    const match = String(endpoint).match(/script\.google\.com\/macros\/s\/([\w-]+)\/exec/);
    if (!match) throw new Error('No Apps Script /exec URL in content/photo-drop.json');
    return match[1];
}

export const keyHash = (key) => createHash('sha256').update(key).digest('hex');

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const scriptId = process.env.PHOTO_DROP_SCRIPT_ID;
    if (!scriptId) {
        console.error('Set PHOTO_DROP_SCRIPT_ID (Apps Script editor → Project Settings → Script ID), e.g. in apps/web/.env.local');
        process.exit(1);
    }
    const { endpoint } = JSON.parse(readFileSync(join(ROOT, 'content/photo-drop.json'), 'utf8'));
    const args = ['--script-id', scriptId, '--deployment-id', deploymentIdFrom(endpoint)];
    if (process.env.PHOTO_DROP_ADMIN_KEY) args.push('--admin-key-hash', keyHash(process.env.PHOTO_DROP_ADMIN_KEY));
    else console.warn('PHOTO_DROP_ADMIN_KEY not set: the admin panel won\'t be able to read Photo Drop status.');
    const run = spawnSync('photo-drop-deploy', args, { cwd: ROOT, stdio: 'inherit', shell: process.platform === 'win32' });
    process.exit(run.status ?? 1);
}
