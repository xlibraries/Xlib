// The toolchain's core: builds a package's modules with adapters, and stamps each module with everything that went
// into it. It knows nothing about C++, shaders or Emscripten; adapters do.
//
// A package declares its modules in package.json:
//
//   "xlibraries": { "modules": { "jyotirath": { "adapter": "cpp-wasm", "uses": ["@xlibraries/engine"], … } } }
//
// `adapter: "cpp-wasm"` is the package @xlibraries/adapter-cpp-wasm, which the package must declare as a dependency.
// `uses` names the packages whose native code the module builds on (providers); each provider describes what it
// offers in its own package.json ("xlibraries": { "native": … }), so the module never reaches into its files.
//
// An adapter is a module exporting { name, version, inputs(ctx, module), fingerprint(ctx, module), build(ctx, module),
// outputs(ctx, module) }. A new kind of module is a new adapter package; nothing here changes.
//
// Stamps: dist/<module>/stamp.json holds a hash of the toolchain's and the adapter's versions, the adapter's
// fingerprint (compiler versions, flags, backends), every provider's name and version, and every input file's path
// and contents (the module's sources, what they include, transitively, from the package and its providers). A build
// skips a module whose stamp is current and whose outputs exist; `check` tells a package's tests whether its committed
// builds match their sources.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const TOOLCHAIN_VERSION = JSON.parse(readFileSync(join(HERE, '../package.json'), 'utf8')).version;
export const STAMP_FILE = 'stamp.json';

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));

/** A package's manifest: its name, version, root and declared modules. */
export function manifest(root) {
    const json = readJson(join(root, 'package.json'));
    return { root, name: json.name, version: json.version, json, modules: json.xlibraries?.modules ?? {} };
}

/** A provider (a package another builds on): its root, version and what it offers natively. */
export function provider(fromRoot, name) {
    const require = createRequire(join(fromRoot, 'package.json'));
    const root = dirname(require.resolve(`${name}/package.json`));
    const json = readJson(join(root, 'package.json'));
    if (!json.xlibraries?.native) throw new Error(`${name} offers no native code ("xlibraries": { "native": … } in its package.json)`);
    return { root, name: json.name, version: json.version, native: json.xlibraries.native };
}

/** The adapter a module names, from the package's own dependencies. */
export async function adapter(root, name) {
    const require = createRequire(join(root, 'package.json'));
    let entry;
    try {
        entry = require.resolve(`@xlibraries/adapter-${name}`);
    } catch {
        throw new Error(`adapter "${name}": add @xlibraries/adapter-${name} to ${relative(process.cwd(), join(root, 'package.json'))}'s devDependencies`);
    }
    const mod = await import(pathToFileURL(entry).href);
    for (const key of ['name', 'version', 'inputs', 'fingerprint', 'build', 'outputs']) if (!(key in mod)) throw new Error(`@xlibraries/adapter-${name} doesn't export ${key}`);
    return mod;
}

/** What an adapter needs to know about the module: the package, the module's spec and its providers. */
export function context(pkg, name) {
    const spec = pkg.modules[name];
    if (!spec) throw new Error(`unknown module: ${name} (${pkg.name} declares ${Object.keys(pkg.modules).join(', ') || 'none'})`);
    return { root: pkg.root, pkg, name, spec, providers: (spec.uses ?? []).map((p) => provider(pkg.root, p)) };
}

/** The stamp's hash and what went into it (paths relative to the package, providers' as <name>/<path>). */
export async function stamp(pkg, name, ad) {
    const ctx = context(pkg, name);
    ad ??= await adapter(pkg.root, ctx.spec.adapter);
    const hash = createHash('sha256');
    const head = [`toolchain@${TOOLCHAIN_VERSION}`, `adapter-${ad.name}@${ad.version}`, ...ad.fingerprint(ctx), ...ctx.providers.map((p) => `provider ${p.name}@${p.version}`)];
    for (const line of head) { hash.update(line); hash.update('\n'); }
    const inputs = [...new Map(ad.inputs(ctx).map((i) => [i.label, i])).values()].sort((a, b) => a.label.localeCompare(b.label));
    for (const input of inputs) { hash.update(input.label); hash.update('\0'); hash.update(readFileSync(input.path)); hash.update('\0'); }
    return { hash: hash.digest('hex'), head, inputs: inputs.map((i) => i.label) };
}

const stampPath = (pkg, name) => join(pkg.root, 'dist', name, STAMP_FILE);

/** Whether a module's committed build matches its sources: { current, expected, found }. */
export async function check(root, name) {
    const pkg = manifest(root);
    const { hash } = await stamp(pkg, name);
    const found = existsSync(stampPath(pkg, name)) ? readJson(stampPath(pkg, name)).hash : null;
    return { current: found === hash, expected: hash, found };
}

/** Builds `only` (or every) module of the package at root, skipping those whose stamps are current (unless force). */
export async function build({ root, only = [], force = false, log = console.log }) {
    const pkg = manifest(root);
    const names = only.length ? only : Object.keys(pkg.modules);
    const built = [], skipped = [];
    for (const name of names) {
        const ctx = context(pkg, name);
        const ad = await adapter(root, ctx.spec.adapter);
        const { hash, head } = await stamp(pkg, name, ad);
        const outputs = ad.outputs(ctx).map((o) => join(root, o));
        const previous = existsSync(stampPath(pkg, name)) ? readJson(stampPath(pkg, name)).hash : null;
        if (!force && previous === hash && outputs.every((o) => existsSync(o))) { skipped.push(name); continue; }
        log(`▶ ${name} (${ad.name})`);
        await ad.build(ctx, { log });
        mkdirSync(join(root, 'dist', name), { recursive: true });
        writeFileSync(stampPath(pkg, name), JSON.stringify({ hash, toolchain: head }, null, 2) + '\n');
        built.push(name);
    }
    log(`✓ built ${built.join(', ') || 'nothing'}${skipped.length ? `; up to date: ${skipped.join(', ')}` : ''}`);
    return { built, skipped };
}
