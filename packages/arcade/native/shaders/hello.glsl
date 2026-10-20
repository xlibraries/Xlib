// Hello cube: vertex colours, a little rim glow. Compiled by sokol-shdc for GLSL ES 3.0 (WebGL2) and WGSL (WebGPU).
@ctype mat4 HMM_Mat4

@vs vs
layout(binding=0) uniform vs_params {
    mat4 mvp;
    mat4 model;
};
in vec4 position;
in vec4 color0;
in vec3 normal;
out vec4 color;
out vec3 world_normal;
void main() {
    gl_Position = mvp * position;
    color = color0;
    world_normal = mat3(model) * normal;
}
@end

@fs fs
layout(binding=1) uniform fs_params {
    float time;
};
in vec4 color;
in vec3 world_normal;
out vec4 frag_color;
void main() {
    vec3 n = normalize(world_normal);
    float light = 0.6 + 0.5 * max(dot(n, normalize(vec3(0.4, 0.8, 0.6))), 0.0);
    float rim = pow(1.0 - abs(n.z), 3.0) * (0.6 + 0.4 * sin(time * 2.0));
    frag_color = vec4(color.rgb * light + vec3(1.0, 0.35, 0.65) * rim, 1.0);
}
@end

@program hello vs fs
