// Turns the code you write in the Shader Playground into a complete fragment shader for the running backend, and
// maps compiler errors back to your lines. The uniform layout matches native/games/playground/main.cpp.
import type { Backend } from '@xlibraries/engine-react';

const GLSL_BEFORE = `#version 300 es
precision highp float;
uniform vec4 u_params[2];
#define iResolution vec3(u_params[0].xy, 1.0)
#define iTime u_params[0].z
#define iTimeDelta u_params[0].w
#define iMouse u_params[1]
out vec4 xl_frag_color;
`;
const GLSL_AFTER = `
void main() {
    vec4 c = vec4(0.0);
    mainImage(c, gl_FragCoord.xy);
    xl_frag_color = vec4(c.rgb, 1.0);
}
`;

const WGSL_BEFORE = `struct Params { resolution: vec2f, time: f32, time_delta: f32, mouse: vec4f };
@group(0) @binding(0) var<uniform> u: Params;
`;
// fragCoord with the origin at the bottom-left, as in GLSL/Shadertoy
const WGSL_AFTER = `
@fragment fn main(@builtin(position) pos: vec4f) -> @location(0) vec4f {
    let c = mainImage(vec2f(pos.x, u.resolution.y - pos.y));
    return vec4f(c.rgb, 1.0);
}
`;

const lines = (s: string) => s.split('\n').length - 1;

export const LANGUAGE: Record<Backend, 'GLSL' | 'WGSL'> = { webgl2: 'GLSL', webgpu: 'WGSL' };

/** The full shader, and how many lines come before your code. */
export function compose(backend: Backend, code: string): { source: string; offset: number } {
    const [before, after] = backend === 'webgl2' ? [GLSL_BEFORE, GLSL_AFTER] : [WGSL_BEFORE, WGSL_AFTER];
    return { source: before + code + after, offset: lines(before) };
}

export interface ShaderError { line: number | null; message: string }

/** Parses a WebGL info log ("ERROR: 0:12: 'x' : undeclared identifier") into errors on your lines. */
export function parseGlslLog(log: string, offset: number): ShaderError[] {
    return log.split('\n').map(l => l.trim()).filter(Boolean).map((l) => {
        const m = l.match(/^(?:ERROR|WARNING):\s*\d+:(\d+):\s*(.*)$/);
        if (!m) return { line: null, message: l };
        const line = Number(m[1]) - offset;
        return { line: line >= 1 ? line : null, message: m[2] };
    }).filter(e => e.message && !/compilation terminated/i.test(e.message));
}

/** WebGPU compilation messages (1-based lineNum) → errors on your lines. */
export function wgslErrors(messages: readonly { type: string; lineNum: number; message: string }[], offset: number): ShaderError[] {
    return messages.filter(m => m.type === 'error').map((m) => {
        const line = m.lineNum - offset;
        return { line: line >= 1 ? line : null, message: m.message };
    });
}
