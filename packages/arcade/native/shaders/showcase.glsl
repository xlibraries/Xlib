// 3D Showcase: flat-shaded, sun + ambient + the car's headlight cone, exponential fog. Vertex colour alpha 0 marks
// emissive surfaces (lamps), which glow regardless of light.
@ctype mat4 HMM_Mat4
@ctype vec4 HMM_Vec4

@vs vs
layout(binding=0) uniform vs_params {
    mat4 mvp;
    mat4 model;
};
in vec3 position;
in vec3 normal;
in vec4 color0;
out vec3 world_pos;
out vec3 world_normal;
out vec4 color;
void main() {
    vec4 wp = model * vec4(position, 1.0);
    world_pos = wp.xyz;
    world_normal = mat3(model) * normal;
    color = color0;
    gl_Position = mvp * vec4(position, 1.0);
}
@end

@fs fs
layout(binding=1) uniform fs_params {
    vec4 sun_dir;       // xyz: towards the sun, w: intensity
    vec4 sun_color;
    vec4 ambient;
    vec4 fog;           // rgb, a: density
    vec4 cam_pos;
    vec4 head_pos;      // the headlight's position
    vec4 head_dir;      // xyz: direction, w: strength
};
in vec3 world_pos;
in vec3 world_normal;
in vec4 color;
out vec4 frag_color;
void main() {
    vec3 n = normalize(world_normal);
    vec3 base = color.rgb;
    vec3 light = ambient.rgb + sun_color.rgb * sun_dir.w * max(dot(n, normalize(sun_dir.xyz)), 0.0);

    vec3 to_frag = world_pos - head_pos.xyz;
    float d = length(to_frag);
    float cone = smoothstep(0.82, 0.97, dot(to_frag / max(d, 0.001), normalize(head_dir.xyz)));
    light += vec3(1.0, 0.92, 0.7) * head_dir.w * cone * max(dot(n, -to_frag / max(d, 0.001)), 0.0) * 6.0 / (1.0 + d * d);

    vec3 col = color.a < 0.5 ? base * 2.2 : base * light;
    float dist = length(world_pos - cam_pos.xyz);
    float f = 1.0 - exp(-fog.a * dist * dist);
    frag_color = vec4(mix(col, fog.rgb, f), 1.0);
}
@end

@program showcase vs fs
