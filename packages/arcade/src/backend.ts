// Picks the graphics backend for this browser: WebGPU when an adapter is available, otherwise WebGL2.

export type Backend = 'webgpu' | 'webgl2';
export type BackendChoice = Backend | 'auto';

interface GpuLike { requestAdapter(): Promise<unknown> }

export async function webgpuAvailable(gpu: GpuLike | undefined = (globalThis.navigator as { gpu?: GpuLike } | undefined)?.gpu): Promise<boolean> {
    if (!gpu) return false;
    try {
        return !!(await gpu.requestAdapter());
    } catch {
        return false;
    }
}

export function webgl2Available(makeCanvas: () => { getContext(kind: string): unknown } = () => document.createElement('canvas')): boolean {
    try {
        return !!makeCanvas().getContext('webgl2');
    } catch {
        return false;
    }
}

/** The backend to run, or null if the browser supports neither. A forced choice is honoured if supported. */
export async function pickBackend(choice: BackendChoice, support: { webgpu: () => Promise<boolean>; webgl2: () => boolean } = { webgpu: () => webgpuAvailable(), webgl2: () => webgl2Available() }): Promise<Backend | null> {
    if (choice === 'webgpu') return (await support.webgpu()) ? 'webgpu' : null;
    if (choice === 'webgl2') return support.webgl2() ? 'webgl2' : null;
    if (await support.webgpu()) return 'webgpu';
    return support.webgl2() ? 'webgl2' : null;
}

export const BACKEND_LABEL: Record<Backend, string> = { webgpu: 'WebGPU', webgl2: 'WebGL2' };
