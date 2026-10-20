#!/usr/bin/env node
// Pushes backend/ (Code.gs, appsscript.json) to your Apps Script project and points your existing web-app
// deployment at the new version, so its /exec URL stays the same.
//
// One-time setup: enable the Apps Script API at https://script.google.com/home/usersettings, then run
// `pnpm exec clasp login` (opens a browser to authorize clasp for your Google account).
//
// Usage: photo-drop-deploy --script-id <id> --deployment-id <id> [--description "..."]
//   script id:     Apps Script editor → Project Settings → IDs → Script ID
//   deployment id: the part of the /exec URL between /s/ and /exec
import { spawnSync } from 'node:child_process';
import { existsSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const BACKEND = join(dirname(fileURLToPath(import.meta.url)), '..', 'backend');

// This package's own clasp (not whatever `clasp` happens to be on PATH)
function claspBin() {
    const local = join(dirname(fileURLToPath(import.meta.url)), '..', 'node_modules', '.bin', process.platform === 'win32' ? 'clasp.cmd' : 'clasp');
    return existsSync(local) ? local : 'clasp';
}

/** The .clasp.json and the clasp commands for one deploy. */
export function deployPlan({ scriptId, deploymentId, description = 'Deployed from the Xlib repo' }) {
    if (!scriptId) throw new Error('missing --script-id (Apps Script editor → Project Settings → Script ID)');
    if (!deploymentId) throw new Error('missing --deployment-id (the part of the /exec URL between /s/ and /exec)');
    return {
        claspJson: { scriptId, rootDir: '.' },
        commands: [
            ['push', '--force'],
            ['redeploy', deploymentId, '--description', description],
        ],
    };
}

function main() {
    const { values } = parseArgs({ options: { 'script-id': { type: 'string' }, 'deployment-id': { type: 'string' }, description: { type: 'string' } } });
    const plan = deployPlan({ scriptId: values['script-id'], deploymentId: values['deployment-id'], description: values.description });
    const claspFile = join(BACKEND, '.clasp.json');
    writeFileSync(claspFile, JSON.stringify(plan.claspJson));
    try {
        for (const args of plan.commands) {
            console.log('▶ clasp ' + args.join(' '));
            const run = spawnSync(claspBin(), args, { cwd: BACKEND, stdio: 'inherit', shell: process.platform === 'win32' });
            if (run.status !== 0) process.exit(run.status ?? 1);
        }
        console.log('✓ Photo Drop backend deployed; the /exec URL is unchanged.');
    } finally {
        rmSync(claspFile, { force: true });
    }
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) main();
