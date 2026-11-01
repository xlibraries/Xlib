// The dependency graph of a pnpm workspace, and the rules it has to follow. Every workspace package (and, inside a
// package, every "unit": a folder or file prefix that is to become a package of its own) gets a layer from a layer
// map. Edges come from TypeScript/JavaScript imports and C/C++ #includes. The rules:
//
//   undeclared  an edge to another workspace package that isn't in package.json's dependencies
//   private     an edge into another package's internals: a TypeScript path that isn't in its "exports", or a C/C++
//               header outside its include/ folder (between units of one package too: they're packages to be)
//   upward      an edge to a higher layer
//   sideways    an edge between two different units on the same layer, unless the layer map allows that pair
//   impure      a unit marked pure importing React or the engine, or touching the DOM
//   forbidden   an edge the layer map rules out by name (`forbid`: from/to patterns, `*` matching anything)
//   cycle       units that depend on each other, round in a loop
//   unmapped    a workspace package the layer map doesn't mention
//
// Violations are keyed (rule, from, to, detail), so a baseline of known ones can be kept while they're fixed, and
// anything new fails. Knows nothing about this repo: the layer map says everything.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { dirname, join, posix, relative, resolve, sep } from 'node:path';

const SCRIPT = /\.(m?[jt]sx?)$/;
const NATIVE = /\.(h|hh|hpp|c|cc|cpp)$/;
const HEADER = /\.(h|hh|hpp)$/;
const SKIP = new Set(['node_modules', 'dist', 'build', 'coverage', 'test-results', '__pycache__', 'fixtures']);   // fixtures: test data, not code
const IMPURE_MODULES = /^(react|react-dom|@xlibraries\/engine(-[\w-]+)?)(\/|$)/;
const DOM = /\b(window|document|navigator|localStorage|sessionStorage)\.\w/;

const toPosix = (p) => p.split(sep).join(posix.sep);

/** Files under dir (posix paths relative to it), skipping dependencies, outputs and dot-folders. */
export function files(dir, base = dir) {
    if (!existsSync(dir)) return [];
    return readdirSync(dir).flatMap((name) => {
        if (SKIP.has(name) || name.startsWith('.')) return [];
        const path = join(dir, name);
        return statSync(path).isDirectory() ? files(path, base) : [toPosix(relative(base, path))];
    });
}

/** The workspace's packages from pnpm-workspace.yaml (simple `dir/*` and `dir` patterns). */
export function workspacePackages(root) {
    const yaml = readFileSync(join(root, 'pnpm-workspace.yaml'), 'utf8');
    const patterns = [...yaml.matchAll(/^\s*-\s*['"]?([^'"\n]+?)['"]?\s*$/gm)].map((m) => m[1]);
    const dirs = patterns.flatMap((p) => {
        if (!p.endsWith('/*')) return [p];
        const parent = join(root, p.slice(0, -2));
        return existsSync(parent) ? readdirSync(parent).map((d) => posix.join(p.slice(0, -2), d)) : [];
    });
    return dirs.filter((d) => existsSync(join(root, d, 'package.json'))).map((dir) => {
        const json = JSON.parse(readFileSync(join(root, dir, 'package.json'), 'utf8'));
        return { name: json.name, dir, json };
    });
}

/** Every module a script names: static imports and re-exports, dynamic imports, requires, side-effect imports. */
export function scriptImports(src) {
    const found = [...src.matchAll(/(?:^|[\s;])(?:import|export)[^'"`;]*?from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|require\(\s*['"]([^'"]+)['"]\s*\)|^\s*import\s+['"]([^'"]+)['"]/gm)];
    return found.map((m) => m[1] ?? m[2] ?? m[3] ?? m[4]);
}

/** #include "…" and #include <…> (outside comments). */
export function nativeIncludes(src) {
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    return [...code.matchAll(/^\s*#\s*include\s*[<"]([^>"]+)[>"]/gm)].map((m) => m[1]);
}

const packageName = (spec) => spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0];

/** The file a bare import of a package resolves to through its "exports" (or main), or null if it isn't exported. */
export function exportedFile(json, spec) {
    const sub = '.' + spec.slice(packageName(spec).length);
    const field = json.exports;
    const clean = (p) => (typeof p === 'string' ? p : p?.import ?? p?.default ?? '').replace(/^\.\//, '');
    if (field === undefined) return sub === '.' ? clean(json.main ?? 'index.js') : null;
    if (typeof field === 'string') return sub === '.' ? clean(field) : null;
    if (field[sub] !== undefined) return clean(field[sub]);
    const star = Object.keys(field).find((key) => key.endsWith('/*') && sub.startsWith(key.slice(0, -1)));
    return star ? clean(field[star]).replace('*', sub.slice(star.length - 1)) : null;
}

/**
 * Builds the graph: units, and edges between them (plus edges to outside modules, for the purity rule).
 * config: { packages: { [name]: { layer, as? , pure? } }, units: { [name]: { [prefix]: { as, layer, pure? } } },
 *           allowSameLayer: [[from, to], …] }
 */
export function scan(root, config) {
    const packages = workspacePackages(root);
    const byName = new Map(packages.map((p) => [p.name, p]));
    const unitOf = (pkg, file) => {
        const units = config.units?.[pkg.name] ?? {};
        // a unit is a folder ("native/games/jyotirath") or a file-name prefix ("tests/native/jyotirath" covers
        // jyotirath_test.cpp); the longest match wins
        const matches = (u) => file === u || file.startsWith(u + '/') || (file.startsWith(u) && /[._-]/.test(file[u.length] ?? ''));
        const prefix = Object.keys(units).filter(matches).sort((a, b) => b.length - a.length)[0];
        const p = config.packages?.[pkg.name];
        if (prefix) return { name: units[prefix].as, layer: units[prefix].layer, pure: !!units[prefix].pure, pkg: pkg.name };
        return { name: p?.as ?? pkg.name, layer: p?.layer, pure: !!p?.pure, pkg: pkg.name };
    };

    // every header in the workspace (vendored ones too), by basename, to resolve #includes
    const headers = new Map();
    const fileLists = new Map();
    for (const pkg of packages) {
        const list = files(join(root, pkg.dir));
        fileLists.set(pkg.name, list);
        for (const f of list) {
            if (!HEADER.test(f)) continue;
            const base = posix.basename(f);
            if (!headers.has(base)) headers.set(base, []);
            headers.get(base).push({ pkg, file: f });
        }
    }
    const resolveInclude = (pkg, file, spec) => {
        const here = posix.join(posix.dirname(file), spec);
        if (fileLists.get(pkg.name).includes(here)) return { pkg, file: here };
        const candidates = (headers.get(posix.basename(spec)) ?? []).filter((h) => h.file === spec || h.file.endsWith('/' + spec));
        return candidates.find((c) => c.pkg === pkg) ?? candidates[0];
    };

    const units = new Map();
    const edges = [];
    const note = (u) => { if (!units.has(u.name)) units.set(u.name, u); };
    for (const pkg of packages) {
        const pkgRoot = join(root, pkg.dir);
        const declared = new Set(Object.keys({ ...pkg.json.dependencies, ...pkg.json.peerDependencies, ...pkg.json.devDependencies }));
        for (const file of fileLists.get(pkg.name)) {
            const script = SCRIPT.test(file) && !file.endsWith('.d.ts');
            const native = NATIVE.test(file);
            if (!script && !native) continue;
            if (/(^|\/)third_party\//.test(file)) continue;   // vendored code: included, not scanned
            const from = unitOf(pkg, file);
            note(from);
            const src = readFileSync(join(pkgRoot, file), 'utf8');
            const where = posix.join(pkg.dir, file);
            if (script && from.pure && DOM.test(src)) edges.push({ from: from.name, to: null, external: 'the DOM', kind: 'dom', file: where });
            const specs = script ? scriptImports(src) : nativeIncludes(src);
            for (const spec of specs) {
                if (script) {
                    if (spec.startsWith('.')) {
                        const target = toPosix(relative(pkgRoot, resolve(dirname(join(pkgRoot, file)), spec)));
                        if (target.startsWith('..')) { edges.push({ from: from.name, to: null, external: spec, kind: 'escape', file: where }); continue; }
                        const to = unitOf(pkg, target);
                        note(to);
                        if (to.name !== from.name) edges.push({ from: from.name, to: to.name, kind: 'script', spec, file: where, internal: true });
                        continue;
                    }
                    if (spec.startsWith('node:') || builtinModules.includes(spec)) continue;
                    const name = packageName(spec);
                    const target = byName.get(name);
                    if (!target || target === pkg) {
                        if (!target) edges.push({ from: from.name, to: null, external: spec, kind: 'module', file: where });
                        continue;
                    }
                    const entry = exportedFile(target.json, spec);
                    const to = unitOf(target, entry ?? spec.slice(name.length + 1));
                    note(to);
                    edges.push({ from: from.name, to: to.name, kind: 'script', spec, file: where, declared: declared.has(name), public: entry !== null });
                } else {
                    const hit = resolveInclude(pkg, file, spec);
                    if (!hit) continue;   // the system's, the compiler's, or generated at build time
                    const to = unitOf(hit.pkg, hit.file);
                    note(to);
                    if (hit.pkg === pkg) {
                        if (to.name !== from.name) edges.push({ from: from.name, to: to.name, kind: 'include', spec: posix.basename(spec), file: where, internal: true, public: /(^|\/)include\//.test(hit.file) });
                        continue;
                    }
                    edges.push({ from: from.name, to: to.name, kind: 'include', spec: posix.basename(spec), file: where, declared: declared.has(hit.pkg.name), public: hit.file.startsWith('include/') });
                }
            }
        }
    }
    return { packages, units, edges };
}

/** Strongly connected components with more than one unit (Tarjan). */
function cycles(units, edges) {
    const next = new Map([...units.keys()].map((u) => [u, new Set()]));
    for (const e of edges) if (e.to && e.to !== e.from) next.get(e.from)?.add(e.to);
    let index = 0;
    const idx = new Map(), low = new Map(), stack = [], on = new Set(), out = [];
    const visit = (v) => {
        idx.set(v, index); low.set(v, index); index++;
        stack.push(v); on.add(v);
        for (const w of next.get(v) ?? []) {
            if (!idx.has(w)) { visit(w); low.set(v, Math.min(low.get(v), low.get(w))); }
            else if (on.has(w)) low.set(v, Math.min(low.get(v), idx.get(w)));
        }
        if (low.get(v) === idx.get(v)) {
            const scc = [];
            let w;
            do { w = stack.pop(); on.delete(w); scc.push(w); } while (w !== v);
            if (scc.length > 1) out.push(scc.sort());
        }
    };
    for (const v of next.keys()) if (!idx.has(v)) visit(v);
    return out;
}

const glob = (pattern, name) => new RegExp('^' + pattern.split('*').map((p) => p.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$').test(name);

/** Every rule broken, merged by key (the files that break it listed with each). */
export function check(graph, config) {
    const found = new Map();
    const add = (rule, from, to, detail, file) => {
        const key = `${rule}: ${from}${to ? ` -> ${to}` : ''}${detail ? ` (${detail})` : ''}`;
        if (!found.has(key)) found.set(key, { key, rule, from, to, detail, files: [] });
        if (file && !found.get(key).files.includes(file)) found.get(key).files.push(file);
    };
    const allowed = new Set((config.allowSameLayer ?? []).map(([a, b]) => `${a}|${b}`));
    for (const pkg of graph.packages) if (!config.packages?.[pkg.name]) add('unmapped', pkg.name, null, null, pkg.dir);
    for (const e of graph.edges) {
        const from = graph.units.get(e.from);
        if (e.kind === 'escape') { add('private', e.from, null, `reaches outside its package: ${e.external}`, e.file); continue; }
        if (e.kind === 'dom') { if (from?.pure) add('impure', e.from, null, e.external, e.file); continue; }
        if (e.kind === 'module') { if (from?.pure && IMPURE_MODULES.test(e.external)) add('impure', e.from, null, packageName(e.external), e.file); continue; }
        const to = graph.units.get(e.to);
        if (from?.pure && to && IMPURE_MODULES.test(to.pkg) && to.pkg !== from.pkg) add('impure', e.from, null, to.pkg, e.file);
        if (!e.internal && !e.declared) add('undeclared', e.from, e.to, to?.pkg, e.file);
        if (e.public === false) add('private', e.from, e.to, e.spec, e.file);
        for (const f of config.forbid ?? []) if (glob(f.from, e.from) && glob(f.to, e.to)) add('forbidden', e.from, e.to, f.why, e.file);
        if (from?.layer === undefined || to?.layer === undefined) continue;
        if (to.layer > from.layer) add('upward', e.from, e.to, `layer ${from.layer} -> ${to.layer}`, e.file);
        else if (to.layer === from.layer && !allowed.has(`${e.from}|${e.to}`)) add('sideways', e.from, e.to, `layer ${from.layer}`, e.file);
    }
    for (const scc of cycles(graph.units, graph.edges)) add('cycle', scc.join(', '), null, null, null);
    return [...found.values()].sort((a, b) => a.key.localeCompare(b.key));
}

/** What's new since the baseline (fails), and what the baseline lists that's gone (to drop from it). */
export function compare(violations, baseline) {
    const now = new Set(violations.map((v) => v.key));
    const known = new Set(baseline);
    return {
        added: violations.filter((v) => !known.has(v.key)),
        resolved: baseline.filter((k) => !now.has(k)),
    };
}
