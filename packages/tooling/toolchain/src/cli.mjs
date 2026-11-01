/**
 * @file `xl-build`: builds a package's native modules (its package.json "xlibraries.modules") from its folder.
 *
 *   xl-build                 every module whose stamp is out of date
 *   xl-build jyotirath …     just these
 *   xl-build --force         rebuild even if up to date
 *   xl-build --check         fail if any committed build doesn't match its sources (what the tests check)
 */
import { build, check, manifest } from './index.mjs';

/**
 * Runs xl-build.
 * @param args The command-line arguments (without node and the script).
 * @param io `cwd` (the package), and `log` / `error` for output (replaceable, for tests).
 * @return The exit code: 0 on success, 1 when a build fails or --check finds a stale module.
 */
export async function main(args, { cwd = process.cwd(), log = console.log, error = console.error } = {}) {
    const names = args.filter((a) => !a.startsWith('--'));
    try {
        if (args.includes('--check')) {
            const stale = [];
            for (const name of names.length ? names : Object.keys(manifest(cwd).modules)) if (!(await check(cwd, name)).current) stale.push(name);
            if (stale.length) { error(`out of date: ${stale.join(', ')} (run xl-build)`); return 1; }
            log('✓ every module matches its sources');
            return 0;
        }
        await build({ root: cwd, only: names, force: args.includes('--force'), log });
        return 0;
    } catch (err) {
        error(err.message);
        return 1;
    }
}
