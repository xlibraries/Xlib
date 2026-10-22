// Bot Lab's 3D view: flat-shaded meshes under a sun and a sky ambient; per-draw tint for parts that change colour.
@ctype mat4 HMM_Mat4
@ctype vec4 HMM_Vec4

@vs vs
layout(binding=0) uniform vs_params {
    mat4 mvp;
    mat4 model;
    vec4 tint;          // multiplies the vertex colour (rgb), a: 1
};
in vec3 position;
in vec3 normal;
in vec4 color0;
out vec3 world_normal;
out vec4 color;
void main() {
    world_normal = mat3(model) * normal;
    color = vec4(color0.rgb * tint.rgb, color0.a);
    gl_Position = mvp * vec4(position, 1.0);
}
@end

@fs fs
layout(binding=1) uniform fs_params {
    vec4 sun_dir;       // xyz: towards the sun
    vec4 ambient;
};
in vec3 world_normal;
in vec4 color;
out vec4 frag_color;
void main() {
    vec3 n = normalize(world_normal);
    float diffuse = max(dot(n, normalize(sun_dir.xyz)), 0.0);
    frag_color = vec4(color.rgb * (ambient.rgb + vec3(0.75) * diffuse), 1.0);
}
@end

@program view vs fs
