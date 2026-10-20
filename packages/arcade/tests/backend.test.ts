import { describe, expect, it } from 'vitest';
import { pickBackend, webgl2Available, webgpuAvailable } from '../src/backend';

const support = (webgpu: boolean, webgl2: boolean) => ({ webgpu: async () => webgpu, webgl2: () => webgl2 });

describe('pickBackend', () => {
    it('prefers WebGPU on auto, falling back to WebGL2', async () => {
        expect(await pickBackend('auto', support(true, true))).toBe('webgpu');
        expect(await pickBackend('auto', support(false, true))).toBe('webgl2');
        expect(await pickBackend('auto', support(false, false))).toBeNull();
    });
    it('honours a forced backend only if the browser supports it', async () => {
        expect(await pickBackend('webgl2', support(true, true))).toBe('webgl2');
        expect(await pickBackend('webgpu', support(false, true))).toBeNull();
    });
});

describe('feature detection', () => {
    it('needs a WebGPU adapter, not just navigator.gpu', async () => {
        expect(await webgpuAvailable(undefined)).toBe(false);
        expect(await webgpuAvailable({ requestAdapter: async () => null })).toBe(false);
        expect(await webgpuAvailable({ requestAdapter: async () => { throw new Error('blocked'); } })).toBe(false);
        expect(await webgpuAvailable({ requestAdapter: async () => ({}) })).toBe(true);
    });
    it('checks for a WebGL2 context', () => {
        expect(webgl2Available(() => ({ getContext: () => ({}) }))).toBe(true);
        expect(webgl2Available(() => ({ getContext: () => null }))).toBe(false);
    });
});
