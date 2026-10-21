// Compiles a shader in the page before it's sent to the game, so errors come back immediately and with line
// numbers: GLSL in a hidden WebGL2 context, WGSL through WebGPU's compilation info.
import type { Backend } from '@xlibraries/engine';
import { compose, parseGlslLog, wgslErrors, type ShaderError } from './compose';

let gl: WebGL2RenderingContext | null = null;
let device: Promise<GPUDeviceLike | null> | null = null;

interface GPUDeviceLike {
    createShaderModule(desc: { code: string }): { getCompilationInfo(): Promise<{ messages: readonly { type: string; lineNum: number; message: string }[] }> };
}

function glsl(source: string, offset: number): ShaderError[] {
    gl ??= document.createElement('canvas').getContext('webgl2');
    if (!gl) return [];
    const shader = gl.createShader(gl.FRAGMENT_SHADER)!;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    const ok = gl.getShaderParameter(shader, gl.COMPILE_STATUS);
    const log = gl.getShaderInfoLog(shader) || '';
    gl.deleteShader(shader);
    return ok ? [] : parseGlslLog(log, offset);
}

async function wgsl(source: string, offset: number): Promise<ShaderError[]> {
    device ??= (async () => {
        const gpu = (navigator as unknown as { gpu?: { requestAdapter(): Promise<{ requestDevice(): Promise<GPUDeviceLike> } | null> } }).gpu;
        const adapter = await gpu?.requestAdapter();
        return adapter ? adapter.requestDevice() : null;
    })().catch(() => null);
    const dev = await device;
    if (!dev) return [];
    const info = await dev.createShaderModule({ code: source }).getCompilationInfo();
    return wgslErrors(info.messages, offset);
}

/** The full source if it compiles, otherwise its errors. */
export async function check(backend: Backend, code: string): Promise<{ source: string; errors: ShaderError[] }> {
    const { source, offset } = compose(backend, code);
    const errors = backend === 'webgl2' ? glsl(source, offset) : await wgsl(source, offset);
    return { source, errors };
}
