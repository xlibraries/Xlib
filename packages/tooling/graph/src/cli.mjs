/**
 * @file The graph checker's command line (bin/graph.mjs runs it):
 *
 *   graph            fails on any violation the baseline doesn't list, and on any it lists that's been fixed
 *   graph --update   rewrites the baseline to what's there now (after fixing some, or with a reviewed reason)
 *   graph --report   lists every violation, grouped by rule, with the files behind each
 *
 * Options: --root <dir> (default: the nearest folder with pnpm-workspace.yaml), --config <file> (default
 * <root>/architecture/layers.json), --baseline <file> (default <root>/architecture/baseline.json).
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { check, compare, scan } from './graph.mjs';

/**
 * Runs the checker.
 * @param args The command-line arguments (without node and the script).
 * @param io `cwd`, and `log` / `error` for output (replaceable, for tests).
 * @return The exit code: 0 when the graph matches the baseline (or after --update / --report), 1 otherwise.
 */
export function main(args, { cwd = process.cwd(), log = console.log, error = console.error } = {}) {
    const option = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
    let root = option('--root') ? resolve(cwd, option('--root')) : cwd;
    while (!option('--root') && !existsSync(join(root, 'pnpm-workspace.yaml')) && dirname(root) !== root) root = dirname(root);
    const configFile = resolve(cwd, option('--config') ?? join(root, 'architecture/layers.json'));
    const baselineFile = resolve(cwd, option('--baseline') ?? join(root, 'architecture/baseline.json'));

    const config = JSON.parse(readFileSync(configFile, 'utf8'));
    const violations = check(scan(root, config), config);

    if (args.includes('--update')) {
        writeFileSync(baselineFile, JSON.stringify(violations.map((v) => v.key), null, 2) + '\n');
        log(`baseline: ${violations.length} known violations written to ${baselineFile}`);
        return 0;
    }

    if (args.includes('--report')) {
        for (const rule of [...new Set(violations.map((v) => v.rule))]) {
            const of = violations.filter((v) => v.rule === rule);
            log(`\n${rule} (${of.length})`);
            for (const v of of) log(`  ${v.key}${v.files.length ? `\n      ${v.files.slice(0, 3).join('\n      ')}${v.files.length > 3 ? `\n      … and ${v.files.length - 3} more` : ''}` : ''}`);
        }
        log(`\n${violations.length} violations`);
        return 0;
    }

    const baseline = existsSync(baselineFile) ? JSON.parse(readFileSync(baselineFile, 'utf8')) : [];
    const { added, resolved } = compare(violations, baseline);
    for (const v of added) error(`NEW ${v.key}${v.files.length ? `\n    ${v.files.slice(0, 3).join('\n    ')}` : ''}`);
    for (const k of resolved) error(`FIXED (drop it from the baseline with --update) ${k}`);
    if (added.length || resolved.length) {
        error(`\ndependency graph: ${added.length} new violation(s), ${resolved.length} fixed but still in the baseline`);
        return 1;
    }
    log(`dependency graph: OK (${violations.length} known violations in the baseline, none new)`);
    return 0;
}
