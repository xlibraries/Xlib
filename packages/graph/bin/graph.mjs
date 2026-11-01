#!/usr/bin/env node
// Checks the workspace's dependency graph against its layer map, and against the baseline of known violations:
//
//   graph            fails on any violation the baseline doesn't list, and on any it lists that's been fixed
//   graph --update   rewrites the baseline to what's there now (after fixing some, or with a reviewed reason)
//   graph --report   lists every violation, grouped by rule, with the files behind each
//
// Options: --root <dir> (default: the nearest folder with pnpm-workspace.yaml), --config <file> (default
// <root>/architecture/layers.json), --baseline <file> (default <root>/architecture/baseline.json).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { check, compare, scan } from '../src/graph.mjs';

const args = process.argv.slice(2);
const option = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
let root = option('--root') ? resolve(option('--root')) : process.cwd();
while (!option('--root') && !existsSync(join(root, 'pnpm-workspace.yaml')) && dirname(root) !== root) root = dirname(root);
const configFile = resolve(option('--config') ?? join(root, 'architecture/layers.json'));
const baselineFile = resolve(option('--baseline') ?? join(root, 'architecture/baseline.json'));

const config = JSON.parse(readFileSync(configFile, 'utf8'));
const violations = check(scan(root, config), config);

if (args.includes('--update')) {
    writeFileSync(baselineFile, JSON.stringify(violations.map((v) => v.key), null, 2) + '\n');
    console.log(`baseline: ${violations.length} known violations written to ${baselineFile}`);
    process.exit(0);
}

if (args.includes('--report')) {
    const rules = [...new Set(violations.map((v) => v.rule))];
    for (const rule of rules) {
        const of = violations.filter((v) => v.rule === rule);
        console.log(`\n${rule} (${of.length})`);
        for (const v of of) console.log(`  ${v.key}${v.files.length ? `\n      ${v.files.slice(0, 3).join('\n      ')}${v.files.length > 3 ? `\n      … and ${v.files.length - 3} more` : ''}` : ''}`);
    }
    console.log(`\n${violations.length} violations`);
    process.exit(0);
}

const baseline = existsSync(baselineFile) ? JSON.parse(readFileSync(baselineFile, 'utf8')) : [];
const { added, resolved } = compare(violations, baseline);
for (const v of added) console.error(`NEW ${v.key}${v.files.length ? `\n    ${v.files.slice(0, 3).join('\n    ')}` : ''}`);
for (const k of resolved) console.error(`FIXED (drop it from the baseline with --update) ${k}`);
if (added.length || resolved.length) {
    console.error(`\ndependency graph: ${added.length} new violation(s), ${resolved.length} fixed but still in the baseline`);
    process.exit(1);
}
console.log(`dependency graph: OK (${violations.length} known violations in the baseline, none new)`);
