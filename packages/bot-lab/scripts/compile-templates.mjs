#!/usr/bin/env node
// Compiles every template sketch (templates/<name>/<name>.ino) to templates/<name>/<name>.hex with the compiler
// image in services/arduino-compiler (needs Docker), then regenerates src/templates/hex.ts.
import { execFileSync } from 'node:child_process';
import { readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SERVICE = join(ROOT, '../../services/arduino-compiler');
const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { stdio: ['ignore', 'pipe', 'inherit'], ...opts });

run('docker', ['build', '-q', '-t', 'xlib-arduino-compiler', SERVICE], { stdio: 'inherit' });
for (const name of readdirSync(join(ROOT, 'templates')).sort()) {
    const hex = run('docker', ['run', '--rm', '-v', `${join(ROOT, 'templates')}:/sketch`, 'xlib-arduino-compiler', name], { encoding: 'utf8' });
    writeFileSync(join(ROOT, 'templates', name, `${name}.hex`), hex);
    console.log(`✓ ${name}: ${hex.split('\n').length - 1} lines`);
}
run('node', [join(ROOT, 'scripts/sync-templates.mjs')], { stdio: 'inherit' });
