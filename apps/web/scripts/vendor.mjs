// Copies files the site serves but doesn't own into public/ (both folders are gitignored):
// - public/vendor/: browser libraries from node_modules, so the site serves them itself (no CDN, and the
//   security policy only has to allow 'self'). Versions come from package.json via the lockfile.
// - public/native/<package>@<version>/<module>/: every native module of every package the site depends on that declares
//   modules (package.json "xlibraries.modules": the Arcade's games, Bot Lab's world and view), from its dist/. The
//   site names no package here; lib/native.ts gives an app its folder.
// - public/vendor/pyodide/: CPython for Bot Lab's Raspberry Pi (from the bot-lab package's pyodide dependency).
// - public/vendor/pico/: MicroPython and the RP2040 boot ROM for Bot Lab's Pico (the bot-lab package's firmware/).
// - public/drop/: the Photo Drop page from @xlibraries/photo-drop, plus config.js made from this site's settings
//   (content/photo-drop.json).
// Runs on install (prepare), before dev and before every build.
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(ROOT, 'package.json'));
const pkgDir = (name) => dirname(require.resolve(`${name}/package.json`));
/** A package's directory as seen from another workspace package (its own dependency). */
const depDir = (pkg, name) => dirname(createRequire(join(pkgDir(pkg), 'package.json')).resolve(`${name}/package.json`));

// The corrector's data ships in a dependency of the leaflet layer, not a direct dependency of ours
function boundaryData() {
    const layer = createRequire(require.resolve('@india-boundary-corrector/leaflet-layer'));
    return layer.resolve('@india-boundary-corrector/data/pmtiles');
}

// Folders under public/ that this script owns (emptied and refilled on every run)
export const MANAGED = ['vendor', 'drop', 'native'];

/** Where a package's native modules are served (lib/native.ts says the same, for the apps). */
export const nativeBase = ({ name, version }) => `/native/${name.replace(/^@xlibraries\//, '')}@${version}`;

/** [dist/<module>, native/<package>@<version>/<module>] for every dependency of the site that declares modules. */
export function nativeModules() {
    const deps = Object.keys(JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).dependencies ?? {});
    return deps.flatMap((name) => {
        let json;
        try { json = JSON.parse(readFileSync(join(pkgDir(name), 'package.json'), 'utf8')); } catch { return []; }   // no package.json export
        return Object.keys(json.xlibraries?.modules ?? {}).map((m) => [join(pkgDir(name), 'dist', m), `${nativeBase(json).slice(1)}/${m}`]);
    });
}

// [source, destination under public/]
export function vendorFiles() {
    const leaflet = pkgDir('leaflet');
    const pdfjs = pkgDir('pdfjs-dist');
    const drop = join(pkgDir('@xlibraries/photo-drop'), 'web');
    return [
        [join(leaflet, 'dist/leaflet.js'), 'vendor/leaflet/leaflet.js'],
        [join(leaflet, 'dist/leaflet.css'), 'vendor/leaflet/leaflet.css'],
        [join(leaflet, 'dist/images'), 'vendor/leaflet/images'],
        [join(pdfjs, 'legacy/build/pdf.min.mjs'), 'vendor/pdfjs/pdf.min.mjs'],
        [join(pdfjs, 'legacy/build/pdf.worker.min.mjs'), 'vendor/pdfjs/pdf.worker.min.mjs'],
        [boundaryData(), 'vendor/india-boundary/india_boundary_corrections.pmtiles'],
        [drop, 'drop'],
        // Bot Lab's Raspberry Pi: CPython in WebAssembly (loaded only when a project has a Pi)
        ...['pyodide.mjs', 'pyodide.asm.mjs', 'pyodide.asm.wasm', 'python_stdlib.zip', 'pyodide-lock.json'].map(f => [join(depDir('@xlibraries/bot-lab', 'pyodide'), f), `vendor/pyodide/${f}`]),
        // Bot Lab's Raspberry Pi Pico: MicroPython and the boot ROM without its float library (firmware/README.md)
        [join(pkgDir('@xlibraries/bot-lab'), 'firmware'), 'vendor/pico'],
        ...nativeModules(),
    ];
}

/** The Photo Drop page's settings script. The endpoint isn't a secret: uploads need the passcode. */
export function photoDropConfigJs(settings = JSON.parse(readFileSync(join(ROOT, 'content/photo-drop.json'), 'utf8'))) {
    return `// Generated from content/photo-drop.json by scripts/vendor.mjs\nwindow.PHOTO_DROP = ${JSON.stringify(settings, null, 4)};\n`;
}

export function vendor(publicDir = join(ROOT, 'public')) {
    for (const dir of MANAGED) rmSync(join(publicDir, dir), { recursive: true, force: true });
    for (const [from, to] of vendorFiles()) {
        mkdirSync(dirname(join(publicDir, to)), { recursive: true });
        cpSync(from, join(publicDir, to), { recursive: true });
    }
    writeFileSync(join(publicDir, 'drop/config.js'), photoDropConfigJs());
    return publicDir;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    vendor();
}
