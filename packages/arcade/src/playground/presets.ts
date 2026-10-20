// Starting points for the Shader Playground, each in GLSL (WebGL2) and WGSL (WebGPU).
// GLSL: write mainImage(out vec4 fragColor, in vec2 fragCoord) with iTime, iResolution, iMouse.
// WGSL: write fn mainImage(fragCoord: vec2f) -> vec4f with u.time, u.resolution, u.mouse.

export interface Preset { id: string; title: string; glsl: string; wgsl: string }

export const PRESETS: Preset[] = [
    {
        id: 'plasma',
        title: 'Plasma',
        glsl: `void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = fragCoord / iResolution.xy;
    float t = iTime * 0.6;
    float v = sin(uv.x * 10.0 + t) + sin((uv.y * 10.0 + t) * 0.7) + sin((uv.x + uv.y) * 8.0 + t * 1.3);
    vec2 c = uv * 2.0 - 1.0;
    v += sin(length(c) * 12.0 - t * 2.0);
    vec3 col = 0.5 + 0.5 * cos(v * 1.4 + vec3(0.0, 2.1, 4.2));
    fragColor = vec4(col, 1.0);
}
`,
        wgsl: `fn mainImage(fragCoord: vec2f) -> vec4f {
    let uv = fragCoord / u.resolution;
    let t = u.time * 0.6;
    var v = sin(uv.x * 10.0 + t) + sin((uv.y * 10.0 + t) * 0.7) + sin((uv.x + uv.y) * 8.0 + t * 1.3);
    let c = uv * 2.0 - 1.0;
    v += sin(length(c) * 12.0 - t * 2.0);
    let col = 0.5 + 0.5 * cos(v * 1.4 + vec3f(0.0, 2.1, 4.2));
    return vec4f(col, 1.0);
}
`,
    },
    {
        id: 'tunnel',
        title: 'Neon tunnel',
        glsl: `void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 p = (2.0 * fragCoord - iResolution.xy) / iResolution.y;
    float r = max(length(p), 0.001);
    float a = atan(p.y, p.x);
    vec2 uv = vec2(0.3 / r + iTime * 0.5, a / 3.14159);
    float lines = smoothstep(0.42, 0.5, abs(fract(uv.x * 4.0) - 0.5))
                + smoothstep(0.42, 0.5, abs(fract(uv.y * 6.0) - 0.5));
    vec3 col = mix(vec3(0.05, 0.02, 0.12), vec3(1.0, 0.25, 0.6), lines) * r * 1.6;
    col += vec3(0.1, 0.6, 1.0) * 0.002 / (r * r);
    fragColor = vec4(col, 1.0);
}
`,
        wgsl: `fn mainImage(fragCoord: vec2f) -> vec4f {
    let p = (2.0 * fragCoord - u.resolution) / u.resolution.y;
    let r = max(length(p), 0.001);
    let a = atan2(p.y, p.x);
    let uv = vec2f(0.3 / r + u.time * 0.5, a / 3.14159);
    let lines = smoothstep(0.42, 0.5, abs(fract(uv.x * 4.0) - 0.5))
              + smoothstep(0.42, 0.5, abs(fract(uv.y * 6.0) - 0.5));
    var col = mix(vec3f(0.05, 0.02, 0.12), vec3f(1.0, 0.25, 0.6), lines) * r * 1.6;
    col += vec3f(0.1, 0.6, 1.0) * 0.002 / (r * r);
    return vec4f(col, 1.0);
}
`,
    },
    {
        id: 'spheres',
        title: 'Raymarched spheres',
        glsl: `float map(vec3 p) {
    vec3 q = p;
    q.xz = mod(q.xz + 2.0, 4.0) - 2.0;
    vec2 cell = floor((p.xz + 2.0) / 4.0);   // each sphere bobs with its own phase
    float sphere = length(q - vec3(0.0, 0.6 + 0.3 * sin(iTime * 2.0 + cell.x * 1.7 + cell.y * 2.3), 0.0)) - 0.7;
    return min(sphere, p.y + 0.5);
}

vec3 normalAt(vec3 p) {
    vec2 e = vec2(0.001, 0.0);
    return normalize(vec3(map(p + e.xyy) - map(p - e.xyy), map(p + e.yxy) - map(p - e.yxy), map(p + e.yyx) - map(p - e.yyx)));
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = (2.0 * fragCoord - iResolution.xy) / iResolution.y;
    vec3 ro = vec3(sin(iTime * 0.3) * 3.0, 1.6, iTime * 1.5);
    vec3 rd = normalize(vec3(uv, 1.6));
    float t = 0.0;
    for (int i = 0; i < 96; i++) {
        float d = map(ro + rd * t);
        if (d < 0.001 || t > 40.0) break;
        t += d;
    }
    vec3 sky = mix(vec3(0.9, 0.4, 0.7), vec3(0.1, 0.05, 0.25), clamp(uv.y + 0.5, 0.0, 1.0));
    vec3 col = sky;
    if (t < 40.0) {
        vec3 p = ro + rd * t;
        vec3 n = normalAt(p);
        vec3 l = normalize(vec3(0.6, 0.8, -0.4));
        float c = floor(p.x) + floor(p.z);
        vec3 base = p.y < -0.49 ? vec3(0.15 + 0.15 * mod(c, 2.0)) : 0.5 + 0.5 * cos(vec3(0.0, 2.0, 4.0) + floor(p.z / 4.0));
        col = base * (0.25 + max(dot(n, l), 0.0)) + pow(max(dot(reflect(rd, n), l), 0.0), 24.0);
        col = mix(col, sky, 1.0 - exp(-0.002 * t * t));
    }
    fragColor = vec4(pow(col, vec3(0.4545)), 1.0);
}
`,
        wgsl: `fn glmod(x: f32, y: f32) -> f32 { return x - y * floor(x / y); }

fn map(p: vec3f) -> f32 {
    let q = vec3f(glmod(p.x + 2.0, 4.0) - 2.0, p.y, glmod(p.z + 2.0, 4.0) - 2.0);
    let cell = floor((p.xz + 2.0) / 4.0);   // each sphere bobs with its own phase
    let sphere = length(q - vec3f(0.0, 0.6 + 0.3 * sin(u.time * 2.0 + cell.x * 1.7 + cell.y * 2.3), 0.0)) - 0.7;
    return min(sphere, p.y + 0.5);
}

fn normalAt(p: vec3f) -> vec3f {
    let e = vec2f(0.001, 0.0);
    return normalize(vec3f(map(p + e.xyy) - map(p - e.xyy), map(p + e.yxy) - map(p - e.yxy), map(p + e.yyx) - map(p - e.yyx)));
}

fn mainImage(fragCoord: vec2f) -> vec4f {
    let uv = (2.0 * fragCoord - u.resolution) / u.resolution.y;
    let ro = vec3f(sin(u.time * 0.3) * 3.0, 1.6, u.time * 1.5);
    let rd = normalize(vec3f(uv, 1.6));
    var t = 0.0;
    for (var i = 0; i < 96; i++) {
        let d = map(ro + rd * t);
        if (d < 0.001 || t > 40.0) { break; }
        t += d;
    }
    let sky = mix(vec3f(0.9, 0.4, 0.7), vec3f(0.1, 0.05, 0.25), clamp(uv.y + 0.5, 0.0, 1.0));
    var col = sky;
    if (t < 40.0) {
        let p = ro + rd * t;
        let n = normalAt(p);
        let l = normalize(vec3f(0.6, 0.8, -0.4));
        let c = floor(p.x) + floor(p.z);
        var base = 0.5 + 0.5 * cos(vec3f(0.0, 2.0, 4.0) + floor(p.z / 4.0));
        if (p.y < -0.49) { base = vec3f(0.15 + 0.15 * glmod(c, 2.0)); }
        col = base * (0.25 + max(dot(n, l), 0.0)) + pow(max(dot(reflect(rd, n), l), 0.0), 24.0);
        col = mix(col, sky, 1.0 - exp(-0.002 * t * t));
    }
    return vec4f(pow(col, vec3f(0.4545)), 1.0);
}
`,
    },
];
