import { describe, expect, it, vi } from 'vitest';
import { buildRoadTrips, distanceKm, osrmUrl, simplifyRoute } from '../../scripts/side-quests/build_road_trips.mjs';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { vendor, vendorFiles } from '../../scripts/vendor.mjs';

describe('music snapshot', () => {
    it('matches the committed playlist list', () => {
        const playlists = JSON.parse(readFileSync('data/music-playlists.json', 'utf8'));
        const snapshot = JSON.parse(readFileSync('public/music/snapshot.json', 'utf8'));
        for (const { id } of playlists) expect(Array.isArray(snapshot.playlists[id]), id).toBe(true);
    });
});

describe('build_road_trips', () => {
    it('measures great-circle distance', () => {
        expect(Math.round(distanceKm([12.9716, 77.5946], [13.0827, 80.2707]))).toBe(290);   // Bengaluru -> Chennai
    });
    it('simplifies routes to ~1 km points, at least 1.5 km apart, keeping the end', () => {
        const coords = [[77.59, 12.97], [77.591, 12.971], [77.6, 12.98], [77.7, 13.0], [77.7001, 13.0001]];
        const points = simplifyRoute(coords);
        expect(points[0]).toEqual([12.97, 77.59]);
        expect(points.at(-1)).toEqual([13, 77.7]);
        for (let i = 1; i < points.length - 1; i++) expect(distanceKm(points[i - 1], points[i])).toBeGreaterThanOrEqual(1.5);
    });
    it('builds OSRM URLs as lng,lat pairs', () => {
        expect(osrmUrl([['A', 12.97, 77.59], ['B', 10.24, 77.49]])).toContain('/driving/77.59,12.97;77.49,10.24?');
    });
    it('turns OSRM responses into trips and skips failures', async () => {
        const fetchImpl = vi.fn()
            .mockResolvedValueOnce({ json: async () => ({ code: 'Ok', routes: [{ distance: 407400, geometry: { coordinates: [[77.59, 12.97], [77.49, 10.24]] } }] }) })
            .mockResolvedValueOnce({ json: async () => ({ code: 'NoRoute', message: 'none' }) });
        const out = await buildRoadTrips([
            { name: 'Kodai', stops: [['Bengaluru', 12.97, 77.59], ['Kodaikanal', 10.24, 77.49]] },
            { name: 'Nowhere', stops: [['X', 0, 0], ['Y', 1, 1]] },
        ], { fetchImpl, pause: 0 });
        expect(out).toEqual([{ name: 'Kodai', km: 407, stops: ['Bengaluru', 'Kodaikanal'], points: [[12.97, 77.59], [10.24, 77.49]] }]);
    });
    it('every committed road trip has stops and a route', () => {
        const trips = JSON.parse(readFileSync('public/side-quests/road-trips.json', 'utf8'));
        expect(trips.length).toBeGreaterThan(0);
        for (const t of trips) { expect(t.points.length, t.name).toBeGreaterThan(1); expect(t.km, t.name).toBeGreaterThan(0); }
    });
});

describe('vendor', () => {
    it('finds every library file in node_modules', () => {
        for (const [from] of vendorFiles()) expect(existsSync(from), from).toBe(true);
    });

    it('copies the libraries the app loads from /vendor', () => {
        const out = join(mkdtempSync(join(tmpdir(), 'vendor-')), 'vendor');
        try {
            vendor(out);
            for (const file of ['leaflet/leaflet.js', 'leaflet/leaflet.css', 'leaflet/images/marker-icon.png',
                'pdfjs/pdf.min.mjs', 'pdfjs/pdf.worker.min.mjs', 'india-boundary/india_boundary_corrections.pmtiles']) {
                expect(existsSync(join(out, file)), file).toBe(true);
            }
            // the app references these exact paths
            const app = readFileSync('components/apps/side-quests.tsx', 'utf8') + readFileSync('components/apps/aman.tsx', 'utf8');
            for (const ref of app.match(/\/vendor\/[\w./-]+/g)) expect(existsSync(join(out, ref.slice('/vendor/'.length))), ref).toBe(true);
        } finally {
            rmSync(join(out, '..'), { recursive: true, force: true });
        }
    });
});
