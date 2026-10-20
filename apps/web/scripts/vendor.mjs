// Copies the browser libraries we load at runtime from node_modules into public/vendor/, so the site
// serves them itself (no CDN, and the security policy only has to allow 'self'). Versions come from
// package.json via the lockfile. Runs on install (prepare), before dev and before every build.
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

// [source in node_modules, destination under public/vendor]
export function vendorFiles() {
    const leaflet = pkgDir('leaflet');
    const pdfjs = pkgDir('pdfjs-dist');
    return [
        [join(leaflet, 'dist/leaflet.js'), 'leaflet/leaflet.js'],
        [join(leaflet, 'dist/leaflet.css'), 'leaflet/leaflet.css'],
        [join(leaflet, 'dist/images'), 'leaflet/images'],
        [join(pdfjs, 'legacy/build/pdf.min.mjs'), 'pdfjs/pdf.min.mjs'],
        [join(pdfjs, 'legacy/build/pdf.worker.min.mjs'), 'pdfjs/pdf.worker.min.mjs'],
        [boundaryData(), 'india-boundary/india_boundary_corrections.pmtiles'],
    ];
}

export function vendor(outDir = join(ROOT, 'public/vendor')) {
    rmSync(outDir, { recursive: true, force: true });
    for (const [from, to] of vendorFiles()) {
        mkdirSync(dirname(join(outDir, to)), { recursive: true });
        cpSync(from, join(outDir, to), { recursive: true });
    }
    return outDir;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    vendor();
}
