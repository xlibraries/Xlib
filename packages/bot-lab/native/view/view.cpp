// Bot Lab's 3D view of the world: the floor, the track, the robot. It doesn't simulate anything: the page passes the
// track (bl_view_track), the robot's start (bl_view_start) and, while it runs, each snapshot's poses (bl_view_state,
// the same 26 floats native/world reports). Drag to orbit, scroll to zoom; the camera follows the robot.
#define SOKOL_IMPL
#include "sokol_gfx.h"
#include "sokol_app.h"
#include "sokol_glue.h"
#include "sokol_log.h"
#define HANDMADE_MATH_USE_RADIANS
#include "HandmadeMath.h"
#define XL_IMPL
#include "xl.h"
#include "view.glsl.h"
#include <emscripten/emscripten.h>
#include <algorithm>
#include <cmath>
#include <vector>

namespace {

struct Vertex { float pos[3]; float normal[3]; uint32_t color; };

uint32_t rgba(int r, int g, int b) { return 0xff000000u | (b << 16) | (g << 8) | r; }

// the robot's dimensions (the page sends sim/world.ts's ROBOT): chassis l/w/h, wheel radius/width, track, axle x,
// caster x, caster radius
struct Dims { float len = 0.16f, wid = 0.10f, hgt = 0.03f, wr = 0.0325f, ww = 0.026f, track = 0.14f, axle_x = 0.03f, caster_x = -0.06f, cr = 0.012f; };

struct Mesh { sg_buffer buf = {}; int count = 0; };

struct {
    sg_pipeline pip;
    Mesh cube, cylinder, sphere, floor, track;
    Dims dims;
    float state[26] = {};
    bool has_state = false;
    float start_x = 0, start_z = 0, start_heading = 0;
    std::vector<float> sensors;       // robot-frame x, z, then lit (0/1), per sensor
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
    const Dims& d = st.dims;
    // where the robot is: the last snapshot, or its start
    HMM_Mat4 chassis, left, right;
    HMM_Vec3 caster;
    if (st.has_state) {
        chassis = pose_at(st.state);
        left = pose_at(st.state + 7);
        right = pose_at(st.state + 14);
        caster = HMM_V3(st.state[21], st.state[22], st.state[23]);
    } else {
        const float cy = std::fmax(d.cr * 2 + 0.002f, d.wr * 0.5f) + d.hgt / 2;
        chassis = HMM_MulM4(HMM_Translate(HMM_V3(st.start_x, cy, st.start_z)), HMM_Rotate_RH(st.start_heading, HMM_V3(0, 1, 0)));
        const HMM_Mat4 turn = HMM_Rotate_RH(HMM_PI32 / 2, HMM_V3(1, 0, 0));
        left = HMM_MulM4(HMM_MulM4(chassis, HMM_Translate(HMM_V3(d.axle_x, d.wr - cy, -d.track / 2))), turn);
        right = HMM_MulM4(HMM_MulM4(chassis, HMM_Translate(HMM_V3(d.axle_x, d.wr - cy, d.track / 2))), turn);
        const HMM_Vec4 c = HMM_MulM4V4(chassis, HMM_V4(d.caster_x, d.cr - cy, 0, 1));
        caster = HMM_V3(c.X, c.Y, c.Z);
    }
    const HMM_Vec3 target = HMM_V3(chassis.Elements[3][0], 0.03f, chassis.Elements[3][2]);
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
    draw(st.cube, view_proj, HMM_MulM4(chassis, HMM_Scale(HMM_V3(d.len, d.hgt, d.wid))), HMM_V3(0.17f, 0.43f, 0.35f));
    // a nose so you can tell which way it faces
    draw(st.cube, view_proj, HMM_MulM4(chassis, HMM_MulM4(HMM_Translate(HMM_V3(d.len / 2 - 0.012f, d.hgt / 2 + 0.002f, 0)), HMM_Scale(HMM_V3(0.02f, 0.004f, 0.03f)))), HMM_V3(0.62f, 0.96f, 0.82f));
    for (const HMM_Mat4& wheel : { left, right }) draw(st.cylinder, view_proj, HMM_MulM4(wheel, HMM_Scale(HMM_V3(d.wr, d.ww, d.wr))), HMM_V3(0.12f, 0.12f, 0.12f));
    draw(st.sphere, view_proj, HMM_MulM4(HMM_Translate(caster), HMM_Scale(HMM_V3(d.cr, d.cr, d.cr))), HMM_V3(0.6f, 0.68f, 0.64f));
    for (size_t i = 0; i + 2 < st.sensors.size(); i += 3) {
        const HMM_Mat4 m = HMM_MulM4(chassis, HMM_MulM4(HMM_Translate(HMM_V3(st.sensors[i], -d.hgt / 2 - 0.004f, st.sensors[i + 1])), HMM_Scale(HMM_V3(0.012f, 0.008f, 0.012f))));
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

/** The robot's dimensions: chassis length, width, height; wheel radius, width; track; axle x; caster x; caster radius */
EMSCRIPTEN_KEEPALIVE void bl_view_robot(const float* p) { st.dims = { p[0], p[1], p[2], p[3], p[4], p[5], p[6], p[7], p[8] }; }

/** The track: n points (x, z pairs), its width, whether it loops */
EMSCRIPTEN_KEEPALIVE void bl_view_track(const float* pts, int n, float width, int closed) {
    st.track_points.assign(pts, pts + std::max(0, n) * 2);
    st.track_width = width;
    st.track_closed = closed != 0;
    st.track_dirty = true;
}

/** Where the robot starts (shown until a run's poses arrive) */
EMSCRIPTEN_KEEPALIVE void bl_view_start(float x, float z, float heading) { st.start_x = x; st.start_z = z; st.start_heading = heading; st.has_state = false; }

/** A snapshot: the world's 26 floats (null to go back to the start pose), and n sensors as robot-frame x, z, lit */
EMSCRIPTEN_KEEPALIVE void bl_view_state(const float* state, const float* sensors, int n) {
    st.has_state = state != nullptr;
    if (state) std::copy(state, state + 26, st.state);
    st.sensors.assign(sensors, sensors + std::max(0, n) * 3);
}

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
