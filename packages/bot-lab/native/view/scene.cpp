#include "scene.h"

#define HANDMADE_MATH_USE_RADIANS
#include "HandmadeMath.h"

#include <algorithm>
#include <cmath>
#include <cstring>
#include <utility>

namespace bl::view {

namespace {

using namespace xl::render;

/** Bot Lab's colours are sRGB (0..1); the renderer tints in linear light. */
float linear(float c) { return std::pow(std::max(0.0f, c), 2.2f); }
Vec3 linear(float r, float g, float b) { return { linear(r), linear(g), linear(b) }; }

uint32_t rgba(int r, int g, int b) { return pack_color(r / 255.0f, g / 255.0f, b / 255.0f, 1); }
const uint32_t PLASTIC = pack_material(0.55f, 0, 0, PLAIN);

Mat4 mat4(const HMM_Mat4& m) { Mat4 r; std::memcpy(r.m, &m, sizeof r.m); return r; }

void push(MeshData& out, HMM_Vec3 p, HMM_Vec3 n, uint32_t col, uint32_t material = PLASTIC) {
    out.indices.push_back(static_cast<uint32_t>(out.vertices.size()));
    out.vertices.push_back({ { p.X, p.Y, p.Z }, { n.X, n.Y, n.Z }, col, material });
}

void quad(MeshData& out, HMM_Vec3 a, HMM_Vec3 b, HMM_Vec3 c, HMM_Vec3 d, uint32_t col, uint32_t material = PLASTIC) {
    const HMM_Vec3 n = HMM_NormV3(HMM_Cross(HMM_SubV3(b, a), HMM_SubV3(d, a)));
    for (HMM_Vec3 p : { a, b, c, a, c, d }) push(out, p, n, col, material);
}

HMM_Mat4 pose_at(const float* p) {   // position xyz, rotation xyzw
    return HMM_MulM4(HMM_Translate(HMM_V3(p[0], p[1], p[2])), HMM_QToM4(HMM_Q(p[3], p[4], p[5], p[6])));
}

HMM_Vec3 eye_of(const Orbit& o) {
    return HMM_V3(o.focus_x + std::cos(o.yaw) * std::cos(o.pitch) * o.distance, o.focus_y + std::sin(o.pitch) * o.distance, o.focus_z + std::sin(o.yaw) * std::cos(o.pitch) * o.distance);
}

} // namespace

MeshData cube() {
    MeshData v;
    const float s = 0.5f;
    const uint32_t w = rgba(255, 255, 255);
    quad(v, HMM_V3(-s, -s, s), HMM_V3(s, -s, s), HMM_V3(s, s, s), HMM_V3(-s, s, s), w);
    quad(v, HMM_V3(s, -s, -s), HMM_V3(-s, -s, -s), HMM_V3(-s, s, -s), HMM_V3(s, s, -s), w);
    quad(v, HMM_V3(-s, s, s), HMM_V3(s, s, s), HMM_V3(s, s, -s), HMM_V3(-s, s, -s), w);
    quad(v, HMM_V3(-s, -s, -s), HMM_V3(s, -s, -s), HMM_V3(s, -s, s), HMM_V3(-s, -s, s), w);
    quad(v, HMM_V3(s, -s, s), HMM_V3(s, -s, -s), HMM_V3(s, s, -s), HMM_V3(s, s, s), w);
    quad(v, HMM_V3(-s, -s, -s), HMM_V3(-s, -s, s), HMM_V3(-s, s, s), HMM_V3(-s, s, -s), w);
    return v;
}

MeshData cylinder(int segments) {
    MeshData v;
    for (int i = 0; i < segments; i++) {
        const float a0 = 2 * HMM_PI32 * i / segments, a1 = 2 * HMM_PI32 * (i + 1) / segments;
        const HMM_Vec3 p0 = HMM_V3(std::cos(a0), 0, std::sin(a0)), p1 = HMM_V3(std::cos(a1), 0, std::sin(a1));
        const uint32_t col = i == 0 ? rgba(150, 150, 150) : rgba(255, 255, 255);
        // the side, smooth: each edge's normal points straight out
        const HMM_Vec3 lo0 = HMM_AddV3(p0, HMM_V3(0, -0.5f, 0)), lo1 = HMM_AddV3(p1, HMM_V3(0, -0.5f, 0)), hi0 = HMM_AddV3(p0, HMM_V3(0, 0.5f, 0)), hi1 = HMM_AddV3(p1, HMM_V3(0, 0.5f, 0));
        for (auto [p, n] : { std::pair{ lo0, p0 }, { lo1, p1 }, { hi1, p1 }, { lo0, p0 }, { hi1, p1 }, { hi0, p0 } }) push(v, p, n, col);
        for (float y : { 0.5f, -0.5f }) {
            const HMM_Vec3 c = HMM_V3(0, y, 0), a = HMM_AddV3(p0, c), b = HMM_AddV3(p1, c);
            const float ny = y > 0 ? 1.0f : -1.0f;
            const uint32_t cap = i % 7 == 0 ? rgba(180, 180, 180) : rgba(230, 230, 230);
            for (HMM_Vec3 p : y > 0 ? std::initializer_list<HMM_Vec3>{ c, b, a } : std::initializer_list<HMM_Vec3>{ c, a, b }) push(v, p, HMM_V3(0, ny, 0), cap);
        }
    }
    return v;
}

MeshData sphere(int rings, int segments) {
    MeshData v;
    const auto at = [](float t, float p) { return HMM_V3(std::sin(t) * std::cos(p), std::cos(t), std::sin(t) * std::sin(p)); };
    for (int r = 0; r < rings; r++) for (int s = 0; s < segments; s++) {
        const float t0 = HMM_PI32 * r / rings, t1 = HMM_PI32 * (r + 1) / rings, p0 = 2 * HMM_PI32 * s / segments, p1 = 2 * HMM_PI32 * (s + 1) / segments;
        const HMM_Vec3 a = at(t0, p0), b = at(t0, p1), c = at(t1, p1), d = at(t1, p0);
        for (HMM_Vec3 p : { a, b, c, a, c, d }) push(v, p, p, rgba(255, 255, 255));
    }
    return v;
}

MeshData floor_mesh() {
    MeshData v;
    const float half = 3.0f, cell = 0.1f;
    const uint32_t boards = pack_material(0.8f, 0, 0, PLAIN);
    for (int i = 0; i < 60; i++) for (int j = 0; j < 60; j++) {
        const float x = -half + i * cell, z = -half + j * cell;
        const uint32_t col = (i + j) % 2 ? rgba(232, 227, 214) : rgba(224, 219, 205);
        quad(v, HMM_V3(x, 0, z + cell), HMM_V3(x + cell, 0, z + cell), HMM_V3(x + cell, 0, z), HMM_V3(x, 0, z), col, boards);
    }
    return v;
}

MeshData track_mesh(const float* pts, int n, float width, bool closed) {
    MeshData v;
    if (n < 2) return v;
    const auto P = [&](int i) { i = closed ? (i % n + n) % n : std::max(0, std::min(n - 1, i)); return HMM_V2(pts[i * 2], pts[i * 2 + 1]); };
    std::vector<HMM_Vec2> left(n), right(n);
    for (int i = 0; i < n; i++) {
        HMM_Vec2 d_in = HMM_SubV2(P(i), P(i - 1)), d_out = HMM_SubV2(P(i + 1), P(i));
        if (!closed && i == 0) d_in = d_out;
        if (!closed && i == n - 1) d_out = d_in;
        const HMM_Vec2 t = HMM_NormV2(HMM_AddV2(HMM_NormV2(d_in), HMM_NormV2(d_out)));
        const HMM_Vec2 normal = HMM_V2(-t.Y, t.X);
        const float miter = 1.0f / std::max(0.35f, HMM_DotV2(normal, HMM_V2(-HMM_NormV2(d_out).Y, HMM_NormV2(d_out).X)));
        left[i] = HMM_AddV2(P(i), HMM_MulV2F(normal, width / 2 * miter));
        right[i] = HMM_SubV2(P(i), HMM_MulV2F(normal, width / 2 * miter));
    }
    const uint32_t col = rgba(22, 22, 22), tape = pack_material(0.9f, 0, 0, PLAIN);   // matt: it stays black
    const int segs = closed ? n : n - 1;
    const float y = 0.0006f;
    for (int i = 0; i < segs; i++) {
        const int j = (i + 1) % n;
        quad(v, HMM_V3(right[i].X, y, right[i].Y), HMM_V3(right[j].X, y, right[j].Y), HMM_V3(left[j].X, y, left[j].Y), HMM_V3(left[i].X, y, left[i].Y), col, tape);
    }
    return v;
}

void Orbit::drag(float dx, float dy) {
    yaw += dx * 0.008f;
    pitch = std::max(0.1f, std::min(1.5f, pitch + dy * 0.008f));
}

void Orbit::zoom(float dy) { distance = std::max(0.25f, std::min(4.0f, distance * (1.0f - dy * 0.08f))); }

void Orbit::focus(float x, float y, float z) { focus_x = x; focus_y = std::max(0.03f, y); focus_z = z; }

void Scene::setup(Renderer& r) {
    const MeshData c = view::cube(), cy = view::cylinder(), s = view::sphere(), f = floor_mesh();
    cube = r.upload(c.vertices, c.indices);
    cylinder = r.upload(cy.vertices, cy.indices);
    sphere = r.upload(s.vertices, s.indices);
    floor = r.upload(f.vertices, f.indices);
}

void Scene::set_track(Renderer& r, const float* pts, int n, float width, bool closed) {
    r.release(track);
    const MeshData t = track_mesh(pts, n, width, closed);
    track = r.upload(t.vertices, t.indices);
}

Frame Scene::frame(int width, int height, bool zero_to_one, float time) const {
    Frame f;
    f.width = width;
    f.height = height;
    f.time = time;
    const HMM_Vec3 target = HMM_V3(orbit.focus_x, orbit.focus_y, orbit.focus_z), eye = eye_of(orbit);
    const float aspect = static_cast<float>(width) / static_cast<float>(std::max(1, height)), fov = HMM_AngleDeg(45.0f);
    const HMM_Mat4 proj = zero_to_one ? HMM_Perspective_RH_ZO(fov, aspect, 0.01f, 30.0f) : HMM_Perspective_RH_NO(fov, aspect, 0.01f, 30.0f);
    f.view_proj = mat4(HMM_MulM4(proj, HMM_LookAt_RH(eye, target, HMM_V3(0, 1, 0))));
    f.eye = { eye.X, eye.Y, eye.Z };
    // the sun, high and to one side; its shadow box covers what's in view round the focus
    const HMM_Vec3 sun = HMM_NormV3(HMM_V3(0.4f, 1.0f, 0.3f));
    const float half = std::max(0.4f, orbit.distance * 0.9f);
    const HMM_Mat4 light_view = HMM_LookAt_RH(HMM_AddV3(target, HMM_MulV3F(sun, 3)), target, HMM_V3(0, 1, 0));
    const HMM_Mat4 light_proj = zero_to_one ? HMM_Orthographic_RH_ZO(-half, half, -half, half, 0.5f, 5.5f) : HMM_Orthographic_RH_NO(-half, half, -half, half, 0.5f, 5.5f);
    f.light_vp = mat4(HMM_MulM4(light_proj, light_view));
    Lighting& l = f.lighting;
    l.sun_dir = { sun.X, sun.Y, sun.Z };
    l.sun_intensity = 1.6f;
    l.sun_color = linear(1.0f, 0.97f, 0.92f);
    l.sky_top = linear(0.55f, 0.62f, 0.72f);
    l.sky_horizon = linear(0.75f, 0.76f, 0.76f);
    l.ground = linear(0.42f, 0.40f, 0.36f);
    l.exposure = 0.9f;
    l.shadow_strength = 0.65f;
    l.shadow_bias = 0.0008f;
    f.backdrop.top = { 0.10f, 0.13f, 0.12f };
    f.backdrop.bottom = { 0.06f, 0.08f, 0.07f };
    f.post.bloom = 0.15f;
    f.post.vignette = 0.2f;
    f.post.saturation = 1.05f;
    f.post.grain = 0.01f;
    f.clear[0] = 0.08f; f.clear[1] = 0.11f; f.clear[2] = 0.10f;
    return f;
}

void Scene::draw(Pass& pass) const {
    const Mat4 identity;
    pass.draw(floor, identity);
    if (!pass.shadow()) pass.draw(track, identity);   // flat on the floor: it casts nothing
    const size_t n = std::min(shapes.size(), poses.size()) / 7;
    for (size_t i = 0; i < n; i++) {
        const float* sh = &shapes[i * 7];
        const HMM_Mat4 pose = pose_at(&poses[i * 7]);
        Look look;
        look.tint = linear(sh[4], sh[5], sh[6]);
        switch (static_cast<int>(sh[0])) {
            case 0: pass.draw(cube, mat4(HMM_MulM4(pose, HMM_Scale(HMM_V3(sh[1] * 2, sh[2] * 2, sh[3] * 2)))), look); break;
            case 1: pass.draw(cylinder, mat4(HMM_MulM4(pose, HMM_Scale(HMM_V3(sh[1], sh[2] * 2, sh[1])))), look); break;
            default: pass.draw(sphere, mat4(HMM_MulM4(pose, HMM_Scale(HMM_V3(sh[1], sh[1], sh[1])))), look); break;
        }
    }
    if (pass.shadow()) return;
    for (size_t i = 0; i + 2 < sensors.size(); i += 3) {
        const HMM_Mat4 m = HMM_MulM4(HMM_Translate(HMM_V3(sensors[i], 0.002f, sensors[i + 1])), HMM_Scale(HMM_V3(0.012f, 0.003f, 0.012f)));
        Look look;
        look.tint = sensors[i + 2] > 0.5f ? linear(1.0f, 0.23f, 0.19f) : linear(0.25f, 0.25f, 0.25f);
        pass.draw(cube, mat4(m), look);
    }
}

} // namespace bl::view
