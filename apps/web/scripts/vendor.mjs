// Copies files the site serves but doesn't own into public/ (both folders are gitignored):
// - public/vendor/: browser libraries from node_modules, so the site serves them itself (no CDN, and the
//   security policy only has to allow 'self'). Versions come from package.json via the lockfile.
// - public/drop/: the Photo Drop page from @xlibraries/photo-drop, plus this site's settings for it.
// Runs on install (prepare), before dev and before every build.
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(ROOT, 'package.json'));
const pkgDir = (name) => dirname(require.resolve(`${name}/package.json`));

// The corrector's data ships in a dependency of the leaflet layer, not a direct dependency of ours
function boundaryData() {
    const layer = createRequire(require.resolve('@india-boundary-corrector/leaflet-layer'));
    return layer.resolve('@india-boundary-corrector/data/pmtiles');
}

// Folders under public/ that this script owns (emptied and refilled on every run)
export const MANAGED = ['vendor', 'drop'];

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
        [join(ROOT, 'content/photo-drop.config.js'), 'drop/config.js'],
    ];
}

export function vendor(publicDir = join(ROOT, 'public')) {
    for (const dir of MANAGED) rmSync(join(publicDir, dir), { recursive: true, force: true });
    for (const [from, to] of vendorFiles()) {
        mkdirSync(dirname(join(publicDir, to)), { recursive: true });
        cpSync(from, join(publicDir, to), { recursive: true });
    }
    return publicDir;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    vendor();
}
