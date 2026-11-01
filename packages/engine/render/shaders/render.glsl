// @xlibraries/render's look (xl_render.h). Four programs:
//  - shadow: the sun's depth only (a depth texture, compared in hardware when sampled)
//  - lit: physically based specular (GGX) with a sky reflection, wrapped diffuse, warm subsurface on skin,
//    translucent foliage, animated water, soft PCF shadows, hemisphere ambient, per-vertex AO, a rim light,
//    haze below y = 0, ACES tone mapping
//  - sky: the backdrop
//  - post: tilt-shift, bloom, a streak, a split-tone grade, vignette and grain
// Compiled by sokol-shdc for GLSL ES 3.0 (WebGL2) and WGSL (WebGPU).
@ctype mat4 HMM_Mat4
@ctype vec4 HMM_Vec4

// ---------- shadow ----------

@vs vs_shadow
layout(binding=0) uniform shadow_params {
    mat4 light_mvp;
    vec4 depth_map;   // unused here (the lit pass maps clip z to depth itself)
};
in vec3 position;
void main() {
    gl_Position = light_mvp * vec4(position, 1.0);
}
@end

@fs fs_shadow
void main() { }
@end

@program shadow vs_shadow fs_shadow

// ---------- lit ----------

@vs vs_lit
layout(binding=0) uniform lit_vs_params {
    mat4 view_proj;
    mat4 model;
    mat4 light_vp;
    vec4 tint;        // rgb: colour multiplier, a: unused
    vec4 depth_map;   // x, y: clip z to 0..1 for the shadow map; z: time
    vec4 reveal;      // a wave of light: xy its centre (world x, z), z its radius, w 1 while it runs (0: off)
};
in vec3 position;
in vec3 normal;
in vec4 color0;
in vec4 material;
out vec3 world_pos;
out vec3 world_normal;
out vec4 color;
out vec4 mat_params;
out vec3 light_pos;
out vec3 tint_rgb;
void main() {
    vec4 wp = model * vec4(position, 1.0);
    // water breathes
    if (material.w > 0.9 && normal.y > 0.9) wp.y += 0.012 * sin(wp.x * 2.3 + depth_map.z * 1.6) * cos(wp.z * 1.7 - depth_map.z * 1.3);
    // the wave of light: beyond it things wait sunk below the ground, and they rise and glow as it passes
    float glow = 0.0;
    if (reveal.w > 0.5) {
        float d = distance(wp.xz, reveal.xy);
        wp.y -= smoothstep(reveal.z - 2.5, reveal.z, d) * 0.9;
        glow = exp(-(d - reveal.z + 1.2) * (d - reveal.z + 1.2) * 0.8);
    }
    world_pos = wp.xyz;
    world_normal = mat3(model) * normal;
    color = color0;
    mat_params = material;
    vec4 lp = light_vp * wp;
    light_pos = vec3(lp.xy * 0.5 + 0.5, lp.z * depth_map.x + depth_map.y);
    tint_rgb = tint.rgb * (1.0 + 2.5 * glow * vec3(1.0, 0.8, 0.45));
    gl_Position = view_proj * wp;
}
@end

@fs fs_lit
layout(binding=1) uniform lit_fs_params {
    vec4 sun_dir;       // xyz: towards the sun, w: intensity
    vec4 sun_color;     // linear; w: extra glow for emissive surfaces (lamps and flames at dusk)
    vec4 sky_top;       // linear; w: exposure
    vec4 sky_horizon;   // linear
    vec4 ground_color;  // linear (light bounced up from the ground)
    vec4 cam_pos;       // w: time
    vec4 shadow_info;   // x: 1 / map size, y: bias, z: 1 when texture rows run top-down, w: shadow strength
    vec4 haze;          // rgb (linear), a: strength below y = 0
};
@image_sample_type shadow_tex depth
@sampler_type shadow_smp comparison
layout(binding=0) uniform texture2D shadow_tex;
layout(binding=0) uniform sampler shadow_smp;
in vec3 world_pos;
in vec3 world_normal;
in vec4 color;
in vec4 mat_params;
in vec3 light_pos;
in vec3 tint_rgb;
out vec4 frag_color;

const float PI = 3.14159265;

float hash12(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

float shadow_at(vec3 lp, float ndl) {
    if (lp.x <= 0.0 || lp.x >= 1.0 || lp.y <= 0.0 || lp.y >= 1.0 || lp.z >= 1.0) return 1.0;
    vec2 uv = vec2(lp.x, mix(lp.y, 1.0 - lp.y, shadow_info.z));
    float bias = shadow_info.y * (1.0 + 3.0 * (1.0 - ndl));
    float a = hash12(world_pos.xz * 37.0) * 6.2831853;
    float c = cos(a), s = sin(a);
    float lit = 0.0;
    for (int i = 0; i < 12; i++) {
        // a spiral of taps, turned per pixel: soft edges without banding
        float r = sqrt((float(i) + 0.5) / 12.0) * 2.4;
        float t = float(i) * 2.39996;
        vec2 o = vec2(cos(t), sin(t)) * r;
        o = vec2(o.x * c - o.y * s, o.x * s + o.y * c) * shadow_info.x;
        lit += texture(sampler2DShadow(shadow_tex, shadow_smp), vec3(uv + o, lp.z - bias));
    }
    return mix(1.0, lit / 12.0, shadow_info.w);
}

vec3 env(vec3 r) {
    vec3 sky = mix(sky_horizon.rgb, sky_top.rgb, smoothstep(0.0, 0.65, r.y));
    vec3 c = mix(ground_color.rgb * 0.75, sky, smoothstep(-0.2, 0.06, r.y));
    c += sun_color.rgb * pow(max(dot(r, normalize(sun_dir.xyz)), 0.0), 80.0) * 3.0;
    return c;
}

vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }

void main() {
    vec3 base = pow(color.rgb, vec3(2.2)) * tint_rgb;
    float ao = color.a;
    float rough = max(mat_params.x, 0.05);
    float metal = mat_params.y;
    float emit = mat_params.z;
    float kind = mat_params.w;
    bool foliage = abs(kind - 0.1255) < 0.03;
    bool eye = abs(kind - 0.251) < 0.03;
    bool skin = abs(kind - 0.502) < 0.03;
    bool water = kind > 0.9;

    vec3 N = normalize(world_normal);
    vec3 V = normalize(cam_pos.xyz - world_pos);
    if (foliage && dot(N, V) < 0.0) N = -N;
    float t = cam_pos.w;
    if (water) {
        vec2 p = world_pos.xz;
        vec3 n = vec3(0.0, 1.0, 0.0);
        n.x += 0.07 * sin(p.x * 3.1 + p.y * 1.3 + t * 1.7) + 0.04 * sin(p.x * 7.3 - t * 2.3 + p.y * 2.1);
        n.z += 0.07 * cos(p.y * 2.7 - t * 2.4 + p.x * 0.9) + 0.04 * cos(p.y * 6.1 - t * 3.1);
        N = normalize(mix(N, n, N.y > 0.5 ? 1.0 : 0.3));
    }
    vec3 L = normalize(sun_dir.xyz);
    float ndl = dot(N, L);
    float sh = shadow_at(light_pos, max(ndl, 0.0));

    // diffuse: wrapped so forms turn softly; skin bleeds warm light across the terminator
    float wrap = skin ? 0.45 : foliage ? 0.5 : 0.2;
    float diff = clamp((ndl + wrap) / (1.0 + wrap), 0.0, 1.0);
    vec3 albedo = base * (1.0 - metal);
    vec3 direct = albedo * diff * sh;
    if (skin) {
        float sss = smoothstep(-0.45, 0.15, ndl) * (1.0 - smoothstep(0.15, 0.75, ndl));
        direct += base * vec3(1.0, 0.3, 0.16) * sss * 0.6 * mix(0.45, 1.0, sh);
    }
    if (foliage) {
        float back = pow(max(dot(-L, V), 0.0), 3.0);
        direct += base * vec3(1.15, 1.35, 0.55) * back * 0.7 * sh;
    }

    // specular: GGX, Smith, Schlick
    vec3 H = normalize(L + V);
    float ndh = max(dot(N, H), 0.0), ndv = max(dot(N, V), 1e-3), nl = max(ndl, 0.0), vdh = max(dot(V, H), 0.0);
    float a2 = rough * rough * rough * rough;
    float dd = ndh * ndh * (a2 - 1.0) + 1.0;
    float D = a2 / (PI * dd * dd);
    float k = (rough + 1.0) * (rough + 1.0) / 8.0;
    float G = (ndv / (ndv * (1.0 - k) + k)) * (nl / (nl * (1.0 - k) + k));
    vec3 F0 = mix(vec3(0.04), base, metal);
    if (eye) F0 = vec3(0.06);
    if (water) F0 = vec3(0.02);
    vec3 F = F0 + (1.0 - F0) * pow(1.0 - vdh, 5.0);
    vec3 spec = D * G * F / (4.0 * ndv * max(nl, 1e-3)) * nl * sh;
    vec3 sun = sun_color.rgb * sun_dir.w;
    vec3 col = (direct + spec) * sun;

    // ambient: sky above, ground bounce below, darkened in the crevices
    vec3 amb = mix(ground_color.rgb, mix(sky_horizon.rgb, sky_top.rgb, 0.7), N.y * 0.5 + 0.5);
    col += albedo * amb * ao;
    // reflections of the sky: what makes gold read as gold
    vec3 R = reflect(-V, N);
    vec3 Fr = F0 + (max(vec3(1.0 - rough), F0) - F0) * pow(1.0 - ndv, 5.0);
    col += mix(env(R), amb, rough * rough) * Fr * ao * mix(0.5, 1.0, metal);
    // a rim of sky light on silhouettes (stronger on the characters)
    float rim = pow(1.0 - ndv, 3.0) * (skin || eye ? 0.4 : 0.16);
    col += sky_horizon.rgb * rim * ao * (0.5 + 0.5 * sh);
    col += base * emit * 4.0 * (1.0 + sun_color.w);

    if (water) {
        float fres = 0.03 + 0.97 * pow(1.0 - ndv, 5.0);
        vec3 body = base * (amb * 0.7 + sun * diff * 0.35 * sh);
        float sparkle = pow(max(dot(R, L), 0.0), 400.0) * 6.0 * sh;
        col = mix(body, env(R), fres) + spec * 1.2 + sun * sparkle;
    }

    // below y = 0, things fade into the haze
    float below = clamp(-world_pos.y / 3.6, 0.0, 1.0);
    col = mix(col, haze.rgb, below * below * haze.a);

    col = aces(col * sky_top.w);
    frag_color = vec4(pow(col, vec3(1.0 / 2.2)), 1.0);
}
@end

@program lit vs_lit fs_lit

// ---------- sky ----------

@vs vs_sky
out vec2 uv;
void main() {
    vec2 p = vec2((gl_VertexIndex == 1) ? 3.0 : -1.0, (gl_VertexIndex == 2) ? 3.0 : -1.0);
    gl_Position = vec4(p, 0.0, 1.0);
    uv = p * 0.5 + 0.5;
}
@end

@fs fs_sky
layout(binding=0) uniform sky_params {
    vec4 top;      // display colours (already tone mapped)
    vec4 bottom;
    vec4 glow;     // rgb, a: strength
    vec4 centre;   // xy: the glow's centre (0..1), z: aspect
};
in vec2 uv;
out vec4 frag_color;
void main() {
    vec3 c = mix(bottom.rgb, top.rgb, smoothstep(0.0, 1.0, uv.y));
    vec2 d = (uv - centre.xy) * vec2(centre.z, 1.0);
    c += glow.rgb * glow.a * exp(-dot(d, d) * 2.2);
    frag_color = vec4(c, 1.0);
}
@end

@program sky vs_sky fs_sky

// ---------- post ----------

@vs vs_post
out vec2 uv;
void main() {
    vec2 p = vec2((gl_VertexIndex == 1) ? 3.0 : -1.0, (gl_VertexIndex == 2) ? 3.0 : -1.0);
    gl_Position = vec4(p, 0.0, 1.0);
    uv = p * 0.5 + 0.5;
}
@end

@fs fs_post
layout(binding=0) uniform post_params {
    vec4 texel;    // xy: 1 / resolution, z: 1 when GL (texture rows bottom-up), w: time
    vec4 focus;    // x: the sharp band's centre (0..1, y up), y: its half height, z: blur radius in pixels, w: bloom
    vec4 grade;    // x: vignette, y: saturation, z: grain, w: streak (0..1)
    vec4 centre;   // xy: where the streaks radiate from (0..1, y up)
};
layout(binding=0) uniform texture2D scene_tex;
layout(binding=0) uniform sampler scene_smp;
in vec2 uv;
out vec4 frag_color;

vec3 fetch(vec2 p) { return texture(sampler2D(scene_tex, scene_smp), vec2(p.x, mix(1.0 - p.y, p.y, texel.z))).rgb; }
float hash12(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

void main() {
    vec2 p = uv;
    // tilt-shift: sharp across a band, blurring above and below it like a macro lens on a model
    float blur = smoothstep(focus.y, focus.y + 0.4, abs(p.y - focus.x)) * focus.z;
    vec3 col = vec3(0.0);
    if (blur < 0.6) {
        col = fetch(p);
    } else {
        for (int i = 0; i < 16; i++) {
            float r = sqrt((float(i) + 0.5) / 16.0) * blur;
            float a = float(i) * 2.39996;
            col += fetch(p + vec2(cos(a), sin(a)) * r * texel.xy);
        }
        col /= 16.0;
    }
    // streaks radiating from a point
    if (grade.w > 0.01) {
        vec2 dir = (p - centre.xy) * 0.05 * grade.w;
        vec3 sum = col * 1.5;
        for (int i = 1; i <= 5; i++) sum += fetch(p - dir * float(i) / 5.0);
        col = sum / 6.5;
    }
    // bloom: the bright bits, from two rings of taps
    vec3 glow = vec3(0.0);
    for (int i = 0; i < 10; i++) {
        float a = float(i) * 0.6283 + 0.3;
        vec2 d = vec2(cos(a), sin(a)) * texel.xy;
        glow += max(fetch(p + d * 5.0) - 0.86, 0.0);
        glow += max(fetch(p + d * 13.0) - 0.86, 0.0) * 0.6;
    }
    col += glow * focus.w / 10.0;
    // grade: saturation, a gentle S-curve, cool shadows and warm highlights
    float lum = dot(col, vec3(0.299, 0.587, 0.114));
    col = mix(vec3(lum), col, grade.y);
    col = mix(col, col * col * (3.0 - 2.0 * col), 0.22);
    col += vec3(-0.012, 0.0, 0.02) * (1.0 - lum) * (1.0 - lum);
    col *= mix(vec3(1.0), vec3(1.035, 1.0, 0.955), lum);
    vec2 v = (uv - 0.5) * vec2(1.15, 1.0);
    col *= 1.0 - grade.x * pow(dot(v, v) * 1.9, 1.4);
    col += (hash12(uv * vec2(1931.0, 1129.0) + texel.w) - 0.5) * grade.z;
    frag_color = vec4(clamp(col, 0.0, 1.0), 1.0);
}
@end

@program post vs_post fs_post
