// Bot Lab's 3D view of the world: the floor, the track and every body in it. It doesn't simulate anything: the page
// passes the track (bl_view_track), the bodies' looks (bl_view_bodies: shape, size, colour, as native/world registers
// them) and each snapshot's poses (bl_view_poses), the robot's sensor spots (bl_view_sensors) and what to look at
// (bl_view_focus). Drag to orbit, scroll to zoom.
#define SOKOL_IMPL
#include "sokol_gfx.h"
#include "sokol_app.h"
#include "sokol_glue.h"
#include "sokol_log.h"
#define HANDMADE_MATH_USE_RADIANS
#include "HandmadeMath.h"
#include "xl.h"
#include "view.glsl.h"
#include <emscripten/emscripten.h>
#include <algorithm>
#include <cmath>
#include <vector>

namespace {

struct Vertex { float pos[3]; float normal[3]; uint32_t color; };

uint32_t rgba(int r, int g, int b) { return 0xff000000u | (b << 16) | (g << 8) | r; }

struct Mesh { sg_buffer buf = {}; int count = 0; };

struct {
    sg_pipeline pip;
    Mesh cube, cylinder, sphere, floor, track;
    std::vector<float> shapes;        // 7 per body: shape (0 box, 1 cylinder, 2 sphere), size a b c, colour r g b
    std::vector<float> poses;         // 7 per body: position xyz, rotation xyzw
    std::vector<float> sensors;       // 3 per spot: x, z on the floor, lit (0/1)
    float focus_x = 0, focus_y = 0.03f, focus_z = 0;
    // the page may send the track before sokol is up (its first frame): it's built then
    std::vector<float> track_points;
    float track_width = 0.019f;
    bool track_closed = true, track_dirty = false;
    float yaw = 2.3f, pitch = 0.75f, distance = 0.9f;
    bool dragging = false;
} st;

Mesh upload(const std::vector<Vertex>& v, Mesh old = {}) {
    if (old.buf.id) sg_destroy_buffer(old.buf);
    Mesh m;
    m.count = static_cast<int>(v.size());
    if (m.count == 0) return m;
    sg_buffer_desc bd = {};
    bd.data = { v.data(), v.size() * sizeof(Vertex) };
    m.buf = sg_make_buffer(&bd);
    return m;
}

void quad(std::vector<Vertex>& out, HMM_Vec3 a, HMM_Vec3 b, HMM_Vec3 c, HMM_Vec3 d, uint32_t col) {
    const HMM_Vec3 n = HMM_NormV3(HMM_Cross(HMM_SubV3(b, a), HMM_SubV3(d, a)));
    for (HMM_Vec3 p : { a, b, c, a, c, d }) out.push_back({ { p.X, p.Y, p.Z }, { n.X, n.Y, n.Z }, col });
}

/** A unit cube centred on the origin (−0.5..0.5) */
std::vector<Vertex> cube() {
    std::vector<Vertex> v;
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

/** A cylinder along y, radius 1, height 1 (−0.5..0.5), with a lighter stripe so it visibly turns */
std::vector<Vertex> cylinder(int segments = 28) {
    std::vector<Vertex> v;
    for (int i = 0; i < segments; i++) {
        const float a0 = 2 * HMM_PI32 * i / segments, a1 = 2 * HMM_PI32 * (i + 1) / segments;
        const HMM_Vec3 p0 = HMM_V3(std::cos(a0), 0, std::sin(a0)), p1 = HMM_V3(std::cos(a1), 0, std::sin(a1));
        const uint32_t col = i == 0 ? rgba(150, 150, 150) : rgba(255, 255, 255);
        quad(v, HMM_AddV3(p0, HMM_V3(0, -0.5f, 0)), HMM_AddV3(p1, HMM_V3(0, -0.5f, 0)), HMM_AddV3(p1, HMM_V3(0, 0.5f, 0)), HMM_AddV3(p0, HMM_V3(0, 0.5f, 0)), col);
        for (float y : { 0.5f, -0.5f }) {
            const HMM_Vec3 c = HMM_V3(0, y, 0), a = HMM_AddV3(p0, c), b = HMM_AddV3(p1, c);
            const float ny = y > 0 ? 1.0f : -1.0f;
            const uint32_t cap = i % 7 == 0 ? rgba(180, 180, 180) : rgba(230, 230, 230);
            for (HMM_Vec3 p : y > 0 ? std::initializer_list<HMM_Vec3>{ c, b, a } : std::initializer_list<HMM_Vec3>{ c, a, b }) v.push_back({ { p.X, p.Y, p.Z }, { 0, ny, 0 }, cap });
        }
    }
    return v;
}

/** A unit sphere (radius 1) */
std::vector<Vertex> sphere(int rings = 10, int segments = 16) {
    std::vector<Vertex> v;
    const auto at = [](float t, float p) { return HMM_V3(std::sin(t) * std::cos(p), std::cos(t), std::sin(t) * std::sin(p)); };
    for (int r = 0; r < rings; r++) for (int s = 0; s < segments; s++) {
        const float t0 = HMM_PI32 * r / rings, t1 = HMM_PI32 * (r + 1) / rings, p0 = 2 * HMM_PI32 * s / segments, p1 = 2 * HMM_PI32 * (s + 1) / segments;
        const HMM_Vec3 a = at(t0, p0), b = at(t0, p1), c = at(t1, p1), d = at(t1, p0);
        for (HMM_Vec3 p : { a, b, c, a, c, d }) v.push_back({ { p.X, p.Y, p.Z }, { p.X, p.Y, p.Z }, rgba(255, 255, 255) });
    }
    return v;
}

/** The floor: a 6 m square of light boards with faint 10 cm squares */
std::vector<Vertex> floor_mesh() {
    std::vector<Vertex> v;
    const float half = 3.0f, cell = 0.1f;
    for (int i = 0; i < 60; i++) for (int j = 0; j < 60; j++) {
        const float x = -half + i * cell, z = -half + j * cell;
        const uint32_t col = (i + j) % 2 ? rgba(232, 227, 214) : rgba(224, 219, 205);
        quad(v, HMM_V3(x, 0, z + cell), HMM_V3(x + cell, 0, z + cell), HMM_V3(x + cell, 0, z), HMM_V3(x, 0, z), col);
    }
    return v;
}

/** The track: a strip of `width` along the points (x, z), mitred at the corners, a hair above the floor */
std::vector<Vertex> track_mesh(const float* pts, int n, float width, bool closed) {
    std::vector<Vertex> v;
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
    const uint32_t col = rgba(22, 22, 22);
    const int segs = closed ? n : n - 1;
    const float y = 0.0006f;
    for (int i = 0; i < segs; i++) {
        const int j = (i + 1) % n;
        quad(v, HMM_V3(right[i].X, y, right[i].Y), HMM_V3(right[j].X, y, right[j].Y), HMM_V3(left[j].X, y, left[j].Y), HMM_V3(left[i].X, y, left[i].Y), col);
    }
    return v;
}

void init() {
    sg_desc gfx = {};
    gfx.environment = sglue_environment();
    gfx.logger.func = slog_func;
    sg_setup(&gfx);
    st.cube = upload(cube());
    st.cylinder = upload(cylinder());
    st.sphere = upload(sphere());
    st.floor = upload(floor_mesh());
    sg_pipeline_desc pd = {};
    pd.shader = sg_make_shader(view_shader_desc(sg_query_backend()));
    pd.layout.attrs[ATTR_view_position].format = SG_VERTEXFORMAT_FLOAT3;
    pd.layout.attrs[ATTR_view_normal].format = SG_VERTEXFORMAT_FLOAT3;
    pd.layout.attrs[ATTR_view_color0].format = SG_VERTEXFORMAT_UBYTE4N;
    pd.depth.write_enabled = true;
    pd.depth.compare = SG_COMPAREFUNC_LESS_EQUAL;
    pd.cull_mode = SG_CULLMODE_NONE;
    st.pip = sg_make_pipeline(&pd);
}

HMM_Mat4 pose_at(const float* p) {   // position xyz, rotation xyzw
    return HMM_MulM4(HMM_Translate(HMM_V3(p[0], p[1], p[2])), HMM_QToM4(HMM_Q(p[3], p[4], p[5], p[6])));
}

void draw(const Mesh& m, const HMM_Mat4& view_proj, const HMM_Mat4& model, HMM_Vec3 tint) {
    if (!m.count) return;
    sg_bindings b = {};
    b.vertex_buffers[0] = m.buf;
    sg_apply_bindings(&b);
    vs_params_t vs = { HMM_MulM4(view_proj, model), model, HMM_V4(tint.X, tint.Y, tint.Z, 1) };
    sg_apply_uniforms(UB_vs_params, SG_RANGE(vs));
    sg_draw(0, m.count, 1);
}

void frame() {
    if (st.track_dirty) {
        st.track = upload(track_mesh(st.track_points.data(), static_cast<int>(st.track_points.size() / 2), st.track_width, st.track_closed), st.track);
        st.track_dirty = false;
    }
    if (xl::paused()) return;
    const float dt = static_cast<float>(sapp_frame_duration());
    xl::report_frame(dt);
    xl::end_frame();
    const HMM_Vec3 target = HMM_V3(st.focus_x, st.focus_y, st.focus_z);
    const HMM_Vec3 eye = HMM_AddV3(target, HMM_V3(std::cos(st.yaw) * std::cos(st.pitch) * st.distance, std::sin(st.pitch) * st.distance, std::sin(st.yaw) * std::cos(st.pitch) * st.distance));
    const HMM_Mat4 view_proj = HMM_MulM4(HMM_Perspective_RH_NO(HMM_AngleDeg(45.0f), sapp_widthf() / sapp_heightf(), 0.01f, 30.0f), HMM_LookAt_RH(eye, target, HMM_V3(0, 1, 0)));

    sg_pass pass = {};
    pass.action.colors[0].load_action = SG_LOADACTION_CLEAR;
    pass.action.colors[0].clear_value = { 0.08f, 0.11f, 0.10f, 1 };
    pass.swapchain = sglue_swapchain();
    sg_begin_pass(&pass);
    sg_apply_pipeline(st.pip);
    fs_params_t fs = { HMM_V4(0.4f, 1.0f, 0.3f, 0), HMM_V4(0.45f, 0.47f, 0.5f, 1) };
    sg_apply_uniforms(UB_fs_params, SG_RANGE(fs));
    const HMM_Mat4 identity = HMM_M4D(1.0f);
    draw(st.floor, view_proj, identity, HMM_V3(1, 1, 1));
    draw(st.track, view_proj, identity, HMM_V3(1, 1, 1));
    const size_t n = std::min(st.shapes.size(), st.poses.size()) / 7;
    for (size_t i = 0; i < n; i++) {
        const float* sh = &st.shapes[i * 7];
        const HMM_Mat4 pose = pose_at(&st.poses[i * 7]);
        const HMM_Vec3 colour = HMM_V3(sh[4], sh[5], sh[6]);
        switch (static_cast<int>(sh[0])) {
            case 0: draw(st.cube, view_proj, HMM_MulM4(pose, HMM_Scale(HMM_V3(sh[1] * 2, sh[2] * 2, sh[3] * 2))), colour); break;
            case 1: draw(st.cylinder, view_proj, HMM_MulM4(pose, HMM_Scale(HMM_V3(sh[1], sh[2] * 2, sh[1]))), colour); break;
            default: draw(st.sphere, view_proj, HMM_MulM4(pose, HMM_Scale(HMM_V3(sh[1], sh[1], sh[1]))), colour); break;
        }
    }
    for (size_t i = 0; i + 2 < st.sensors.size(); i += 3) {
        const HMM_Mat4 m = HMM_MulM4(HMM_Translate(HMM_V3(st.sensors[i], 0.002f, st.sensors[i + 1])), HMM_Scale(HMM_V3(0.012f, 0.003f, 0.012f)));
        draw(st.cube, view_proj, m, st.sensors[i + 2] > 0.5f ? HMM_V3(1.0f, 0.23f, 0.19f) : HMM_V3(0.25f, 0.25f, 0.25f));
    }
    sg_end_pass();
    sg_commit();
}

void event(const sapp_event* e) {
    switch (e->type) {
        case SAPP_EVENTTYPE_MOUSE_DOWN: st.dragging = true; break;
        case SAPP_EVENTTYPE_MOUSE_UP: st.dragging = false; break;
        case SAPP_EVENTTYPE_MOUSE_MOVE:
            if (st.dragging) { st.yaw += e->mouse_dx * 0.008f; st.pitch = std::max(0.1f, std::min(1.5f, st.pitch + e->mouse_dy * 0.008f)); }
            break;
        case SAPP_EVENTTYPE_MOUSE_SCROLL: st.distance = std::max(0.25f, std::min(4.0f, st.distance * (1.0f - e->scroll_y * 0.08f))); break;
        case SAPP_EVENTTYPE_TOUCHES_MOVED:
            if (e->num_touches == 1) {
                static float last_x = e->touches[0].pos_x, last_y = e->touches[0].pos_y;
                st.yaw += (e->touches[0].pos_x - last_x) * 0.008f;
                st.pitch = std::max(0.1f, std::min(1.5f, st.pitch + (e->touches[0].pos_y - last_y) * 0.008f));
                last_x = e->touches[0].pos_x; last_y = e->touches[0].pos_y;
            }
            break;
        default: break;
    }
}

void cleanup() { sg_shutdown(); }

}  // namespace

extern "C" {

/** The track: n points (x, z pairs), its width, whether it loops */
EMSCRIPTEN_KEEPALIVE void bl_view_track(const float* pts, int n, float width, int closed) {
    st.track_points.assign(pts, pts + std::max(0, n) * 2);
    st.track_width = width;
    st.track_closed = closed != 0;
    st.track_dirty = true;
}

/** The bodies' looks: n × 7 floats (shape, size a b c, colour r g b) */
EMSCRIPTEN_KEEPALIVE void bl_view_bodies(const float* shapes, int n) { st.shapes.assign(shapes, shapes + std::max(0, n) * 7); }

/** The bodies' poses: n × 7 floats (position xyz, rotation xyzw) */
EMSCRIPTEN_KEEPALIVE void bl_view_poses(const float* poses, int n) { st.poses.assign(poses, poses + std::max(0, n) * 7); }

/** The robot's sensor spots: n × 3 floats (x, z on the floor, lit) */
EMSCRIPTEN_KEEPALIVE void bl_view_sensors(const float* spots, int n) { st.sensors.assign(spots, spots + std::max(0, n) * 3); }

/** What the camera looks at (it orbits this point on the floor) */
EMSCRIPTEN_KEEPALIVE void bl_view_focus(float x, float y, float z) { st.focus_x = x; st.focus_y = std::max(0.03f, y); st.focus_z = z; }

}  // extern "C"

sapp_desc sokol_main(int argc, char* argv[]) {
    sapp_desc desc = {};
    desc.init_cb = init;
    desc.frame_cb = frame;
    desc.event_cb = event;
    desc.cleanup_cb = cleanup;
    desc.window_title = "Bot Lab";
    desc.sample_count = 4;
    desc.logger.func = slog_func;
    return xl::app_desc(argc, argv, desc);
}
