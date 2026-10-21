// Turbo Trails post-processing: the scene is drawn into a texture, then this full-screen pass adds a soft bloom on
// bright things (sun, neon, coins, flames), a radial speed blur while Turbo is on, a warm grade and a vignette.
// Compiled by sokol-shdc for GLSL ES 3.0 (WebGL2) and WGSL (WebGPU).

@vs vs
out vec2 uv;
void main() {
    // one triangle covering the screen, from the vertex index alone (no buffers)
    vec2 p = vec2((gl_VertexIndex == 1) ? 3.0 : -1.0, (gl_VertexIndex == 2) ? 3.0 : -1.0);
    gl_Position = vec4(p, 0.0, 1.0);
    uv = p * 0.5 + 0.5;
}
@end

@fs fs
layout(binding=0) uniform fs_params {
    vec2 texel;      // 1 / resolution
    vec2 centre;     // where the vehicle is on screen (0..1, y down): the speed blur radiates from it
    float boost;     // 0..1 Turbo strength
    float flip_y;    // 1 when the texture's rows run bottom-up (GL), 0 when top-down (WebGPU)
};
layout(binding=0) uniform texture2D tex;
layout(binding=0) uniform sampler smp;
in vec2 uv;
out vec4 frag_color;

vec3 fetch(vec2 p) { return texture(sampler2D(tex, smp), p).rgb; }

void main() {
    vec2 p = vec2(uv.x, mix(1.0 - uv.y, uv.y, flip_y));
    vec3 col = fetch(p);

    // speed streaks while boosting: a horizontal blur that grows with the distance from the vehicle, so the car
    // stays sharp and the world rushes past it
    if (boost > 0.001) {
        float len = clamp((p.x - centre.x) * 0.06, -0.03, 0.03) * boost;
        vec3 sum = col * 1.5;
        for (int i = 1; i <= 4; i++) sum += fetch(vec2(p.x + len * float(i) / 4.0, p.y));
        col = sum / 5.5;
    }

    // bloom: bright parts of a wide ring of taps, blurred on top
    vec3 glow = vec3(0.0);
    for (int i = 0; i < 8; i++) {
        float a = float(i) * 0.7854;
        vec2 d = vec2(cos(a), sin(a)) * texel * 6.0;
        glow += max(fetch(p + d) - 0.92, 0.0);
        glow += max(fetch(p + d * 2.2) - 0.92, 0.0) * 0.5;
    }
    col += glow * 0.14;

    // grade: a touch more saturation and warmth, then a vignette
    float lum = dot(col, vec3(0.299, 0.587, 0.114));
    col = mix(vec3(lum), col, 1.14);
    col *= vec3(1.03, 1.0, 0.97);
    vec2 v = (uv - 0.5) * vec2(1.25, 1.1);
    col *= 1.0 - 0.32 * pow(dot(v, v), 1.3);
    frag_color = vec4(col, 1.0);
}
@end

@program post vs fs
