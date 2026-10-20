// Deploys the Photo Drop backend for this site: the deployment id comes from content/photo-drop.config.js
// (its endpoint URL), the script id from PHOTO_DROP_SCRIPT_ID. Run from the repo root: pnpm deploy:photo-drop
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export function deploymentIdFrom(configJs) {
    const match = configJs.match(/script\.google\.com\/macros\/s\/([\w-]+)\/exec/);
    if (!match) throw new Error('No Apps Script /exec URL in content/photo-drop.config.js');
    return match[1];
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const scriptId = process.env.PHOTO_DROP_SCRIPT_ID;
    if (!scriptId) {
        console.error('Set PHOTO_DROP_SCRIPT_ID (Apps Script editor → Project Settings → Script ID), e.g. in apps/web/.env.local');
        process.exit(1);
    }
    const deploymentId = deploymentIdFrom(readFileSync(join(ROOT, 'content/photo-drop.config.js'), 'utf8'));
    const run = spawnSync('photo-drop-deploy', ['--script-id', scriptId, '--deployment-id', deploymentId], { cwd: ROOT, stdio: 'inherit', shell: process.platform === 'win32' });
    process.exit(run.status ?? 1);
}
