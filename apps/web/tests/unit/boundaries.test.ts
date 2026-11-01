// Keeps packages/* independent, so any of them can move to its own repo (as a git submodule or a published
// package) without changes: a package may import only its own files, its declared dependencies, Node built-ins
// and the library packages @xlibraries/app-sdk and @xlibraries/engine (which themselves import no app package). The site may import packages only through their public entry points.
import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { dirname, join, relative, resolve } from 'node:path';

const ROOT = resolve(__dirname, '../../../..');
const PACKAGES = join(ROOT, 'packages');
const SITE = join(ROOT, 'apps/web');
const SOURCE = /\.(m?[jt]sx?)$/;
// packages other packages may build on; they must not import app packages themselves
const LIBRARIES = ['@xlibraries/app-sdk', '@xlibraries/engine'];

function sourceFiles(dir: string): string[] {
    if (!existsSync(dir)) return [];
    return readdirSync(dir).flatMap((name) => {
        if (name === 'node_modules' || name === 'fixtures' || name.startsWith('.')) return [];   // fixtures: test data, not code
        const path = join(dir, name);
        return statSync(path).isDirectory() ? sourceFiles(path) : SOURCE.test(name) ? [path] : [];
    });
}

// import x from '…', export … from '…', import('…'), require('…')
function importsOf(file: string): string[] {
    const src = readFileSync(file, 'utf8');
    const found = [...src.matchAll(/(?:^|[\s;])(?:import|export)[^'"`;]*?from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|require\(\s*['"]([^'"]+)['"]\s*\)|^\s*import\s+['"]([^'"]+)['"]/gm)];
    return found.map((m) => m[1] ?? m[2] ?? m[3] ?? m[4]);
}

const packageName = (spec: string) => spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0];
const packageDirs = existsSync(PACKAGES) ? readdirSync(PACKAGES).filter((d) => existsSync(join(PACKAGES, d, 'package.json'))) : [];

describe('package boundaries', () => {
    it('finds the workspace packages', () => {
        expect(packageDirs).toContain('app-sdk');
    });

    for (const dir of packageDirs) {
        it(`${dir} imports only itself, its dependencies and the library packages`, () => {
            const root = join(PACKAGES, dir);
            const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
            const declared = new Set([pkg.name, ...Object.keys({ ...pkg.dependencies, ...pkg.peerDependencies, ...pkg.devDependencies })]);
            const problems: string[] = [];
            for (const file of sourceFiles(root)) {
                const where = relative(ROOT, file);
                for (const spec of importsOf(file)) {
                    if (spec.startsWith('.')) {
                        const target = resolve(dirname(file), spec);
                        if (relative(root, target).startsWith('..')) problems.push(`${where}: '${spec}' reaches outside the package`);
                    } else if (spec.startsWith('node:') || builtinModules.includes(spec)) {
                        continue;
                    } else {
                        const name = packageName(spec);
                        if (name.startsWith('@xlibraries/') && name !== pkg.name && !LIBRARIES.includes(name)) {
                            problems.push(`${where}: imports another app package, ${name}`);
                        } else if (!declared.has(name)) {
                            problems.push(`${where}: '${name}' isn't declared in package.json`);
                        }
                    }
                }
            }
            expect(problems).toEqual([]);
        });
    }

    it("packages don't use the site's Tailwind theme tokens (ub-*, ubt-*)", () => {
        const problems = packageDirs.flatMap((dir) => sourceFiles(join(PACKAGES, dir, 'src')).flatMap((file) =>
            [...readFileSync(file, 'utf8').matchAll(/\b(?:bg|text|border|from|to|via|ring|fill|stroke)-ubt?-[\w-]+/g)].map((m) => `${relative(ROOT, file)}: ${m[0]}`)));
        expect(problems).toEqual([]);
    });

    it('the site imports packages only through their entry points', () => {
        const problems: string[] = [];
        for (const file of sourceFiles(SITE)) {
            for (const spec of importsOf(file)) {
                if (/^@xlibraries\/[^/]+\/src\//.test(spec)) problems.push(`${relative(ROOT, file)}: deep import ${spec}`);
                if (spec.startsWith('.') && resolve(dirname(file), spec).startsWith(PACKAGES)) problems.push(`${relative(ROOT, file)}: relative import into packages/, ${spec}`);
            }
        }
        expect(problems).toEqual([]);
    });
});
