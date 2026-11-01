import { describe, expect, it } from 'vitest';
import { PICO_FILES, PICO_PATH, PYODIDE_PATH, SNAPSHOT_HZ, WORLD_FILE, worldUrl } from '../src/runtime/protocol';

describe('the runtime protocol', () => {
    it('loads the physics world from the native folder the site gives the app', () => {
        expect(worldUrl('https://xlibraries.com', '/native/bot-lab@1.2.0')).toBe('https://xlibraries.com/native/bot-lab@1.2.0/world/headless.js');
        expect(worldUrl('', '/native/bot-lab@1.2.0/')).toBe('/native/bot-lab@1.2.0/world/headless.js');   // a trailing slash is fine
        expect(WORLD_FILE).toBe('world/headless.js');
    });

    it('names the vendored runtimes and how often snapshots come', () => {
        expect(PYODIDE_PATH).toBe('/vendor/pyodide');
        expect(PICO_PATH).toBe('/vendor/pico');
        expect(Object.values(PICO_FILES)).toEqual(['rp2040-bootrom-b1-nofp.bin', 'micropython-rpi-pico-v1.29.0.uf2']);
        expect(SNAPSHOT_HZ).toBe(30);
    });
});
