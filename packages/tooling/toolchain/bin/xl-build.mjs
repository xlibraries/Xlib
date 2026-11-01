#!/usr/bin/env node
// Builds a package's native modules (its package.json "xlibraries.modules"), from the package's folder:
//
//   xl-build                 every module whose stamp is out of date
//   xl-build jyotirath …     just these
//   xl-build --force         rebuild even if up to date
//   xl-build --check         fail if any committed build doesn't match its sources (what the tests check)
import { build, check, manifest } from '../src/index.mjs';

const args = process.argv.slice(2);
const root = process.cwd();
const names = args.filter((a) => !a.startsWith('--'));

try {
    if (args.includes('--check')) {
        const stale = [];
        for (const name of names.length ? names : Object.keys(manifest(root).modules)) if (!(await check(root, name)).current) stale.push(name);
        if (stale.length) { console.error(`out of date: ${stale.join(', ')} (run xl-build)`); process.exit(1); }
        console.log('✓ every module matches its sources');
    } else {
        await build({ root, only: names, force: args.includes('--force') });
    }
} catch (err) {
    console.error(err.message);
    process.exit(1);
}
