// 3D Showcase: the procedurally generated island from scene.cpp, a car driving its road loop, a day/night cycle
// and an orbit camera (drag to orbit, scroll to zoom, C to follow the car, N to skip to night/day). A stack of
// crates by the road runs on the engine's physics (xl_physics.h, Jolt): the car is a kinematic body that knocks
// them over on every lap, and they tumble down the island's height field.
#define SOKOL_IMPL
#include "sokol_gfx.h"
#include "sokol_app.h"
#include "sokol_glue.h"
#include "sokol_log.h"
#include "sokol_debugtext.h"
#define HANDMADE_MATH_USE_RADIANS
#include "HandmadeMath.h"
#define XL_IMPL
#include "xl.h"
#include "xl_physics.h"
#include "scene.h"
#include "showcase.glsl.h"
#include <memory>
#include <vector>

#include <algorithm>
#include <cmath>

using namespace showcase;

namespace {

constexpr float DAY_SECONDS = 70.0f;

constexpr int CRATES = 10;

struct {
    Scene scene;
    sg_pipeline pip;
    sg_buffer world_buf, car_buf, crate_buf;
    int world_count = 0, car_count = 0, crate_count = 0;
    std::unique_ptr<xl::phys::World> physics;
    xl::phys::Body car_body;
    xl::phys::Body crates[CRATES];
    float crate_s = 0;         // where along the road the crates stand
    HMM_Mat4 pallet_model;     // the flat pallet they stand on
    float time = 0;
    float day = 0.3f;          // 0..1, 0.25 = noon-ish rise
    float car_s = 0;           // distance along the road
    float yaw = 0.8f, pitch = 0.6f, distance = 30.0f;
    bool dragging = false, follow = false;
    float idle = 0;            // seconds since the last camera input (auto-rotate when idle)
} st;

HMM_Vec3 v3(V3 p) { return HMM_V3(p.x, p.y, p.z); }
HMM_Vec4 rgb4(HMM_Vec3 c, float w = 1.0f) { return HMM_V4(c.X, c.Y, c.Z, w); }
HMM_Vec3 mix3(HMM_Vec3 a, HMM_Vec3 b, float t) { return HMM_AddV3(HMM_MulV3F(a, 1 - t), HMM_MulV3F(b, t)); }

void setup_physics();

sg_buffer upload(const std::vector<Vertex>& vertices) {
    sg_buffer_desc bd = {};
    bd.data = { vertices.data(), vertices.size() * sizeof(Vertex) };
    return sg_make_buffer(&bd);
}

void init() {
    sg_desc gfx = {};
    gfx.environment = sglue_environment();
    gfx.logger.func = slog_func;
    sg_setup(&gfx);

    sdtx_desc_t text = {};
    text.fonts[0] = sdtx_font_oric();
    text.logger.func = slog_func;
    sdtx_setup(&text);

    st.scene = build_scene(xl::seed() % 100000);
    const auto car = build_car();
    st.world_buf = upload(st.scene.world);
    st.world_count = static_cast<int>(st.scene.world.size());
    st.car_buf = upload(car);
    st.car_count = static_cast<int>(car.size());
    const auto crate = build_crate();
    st.crate_buf = upload(crate);
    st.crate_count = static_cast<int>(crate.size());
    setup_physics();

    sg_pipeline_desc pd = {};
    pd.shader = sg_make_shader(showcase_shader_desc(sg_query_backend()));
    pd.layout.attrs[ATTR_showcase_position].format = SG_VERTEXFORMAT_FLOAT3;
    pd.layout.attrs[ATTR_showcase_normal].format = SG_VERTEXFORMAT_FLOAT3;
    pd.layout.attrs[ATTR_showcase_color0].format = SG_VERTEXFORMAT_UBYTE4N;
    pd.depth.write_enabled = true;
    pd.depth.compare = SG_COMPAREFUNC_LESS_EQUAL;
    pd.cull_mode = SG_CULLMODE_NONE;
    st.pip = sg_make_pipeline(&pd);
}

/** The island as a height field, the car as a kinematic box, a pyramid of crates beside the road a quarter lap ahead. */
void setup_physics() {
    namespace ph = xl::phys;
    st.physics = ph::World::create();
    // the terrain grid is (GRID+1)² samples; Jolt wants an even count, so the last row and column are repeated
    const int n = GRID + 2;
    std::vector<float> heights(static_cast<size_t>(n) * n);
    for (int j = 0; j < n; j++) for (int i = 0; i < n; i++) heights[j * n + i] = st.scene.heights[std::min(j, GRID) * (GRID + 1) + std::min(i, GRID)];
    const float spacing = WORLD / GRID;
    st.physics->add_height_field(heights, n, { -WORLD / 2, 0, -WORLD / 2 }, spacing, { 0.8f, 0.1f });
    st.car_body = st.physics->add_box(ph::Motion::Kinematic, { 0, 5, 0 }, {}, { 0.5f, 0.22f, 0.26f });
    st.crate_s = st.scene.road.length * 0.12f;
    const V3 at = st.scene.road.at(st.crate_s), dir = st.scene.road.dir(st.crate_s);
    const V3 side = { -dir.z, 0, dir.x };   // across the road
    // a flat pallet, level however the road slopes, so the pyramid stands until the car arrives
    const float yaw = std::atan2(-dir.z, dir.x);
    const float pallet_y = at.y + 0.05f;
    st.physics->add_box(ph::Motion::Static, { at.x, pallet_y, at.z }, ph::axis_angle({ 0, 1, 0 }, yaw), { 0.7f, 0.05f, 0.9f }, 0, { 0.8f, 0.1f });
    st.pallet_model = HMM_MulM4(HMM_MulM4(HMM_Translate(HMM_V3(at.x, pallet_y, at.z)), HMM_Rotate_RH(yaw, HMM_V3(0, 1, 0))), HMM_Scale(HMM_V3(0.7f / 0.16f, 0.05f / 0.16f, 0.9f / 0.16f)));
    int k = 0;
    for (int row = 0; row < 4 && k < CRATES; row++) for (int col = 0; col < 4 - row && k < CRATES; col++, k++) {
        const float across = (col - (3 - row) * 0.5f) * 0.34f;
        st.crates[k] = st.physics->add_box(ph::Motion::Dynamic, { at.x + side.x * across, pallet_y + 0.05f + 0.17f + row * 0.34f, at.z + side.z * across }, {}, { 0.16f, 0.16f, 0.16f }, 2.0f, { 0.6f, 0.15f });
    }
}

HMM_Mat4 pose_matrix(const xl::phys::Pose& p) {
    const HMM_Quat q = HMM_Q(p.rotation.x, p.rotation.y, p.rotation.z, p.rotation.w);
    return HMM_MulM4(HMM_Translate(HMM_V3(p.position.x, p.position.y, p.position.z)), HMM_QToM4(q));
}

void frame() {
    if (xl::paused()) return;
    const float dt = static_cast<float>(sapp_frame_duration());
    xl::report_frame(dt);
    st.time += dt;
    st.day = std::fmod(st.day + dt / DAY_SECONDS, 1.0f);
    st.car_s += dt * 4.2f;
    st.idle += dt;
    // gamepad: either stick orbits, triggers zoom, Y follows the car, X skips ahead
    const xl::Gamepad& pad = xl::gamepad();
    if (pad.connected) {
        const float ox = pad.rx != 0 ? pad.rx : pad.lx, oy = pad.ry != 0 ? pad.ry : pad.ly;
        if (ox != 0 || oy != 0) {
            st.yaw += ox * dt * 2.2f;
            st.pitch = std::max(0.08f, std::min(1.45f, st.pitch + oy * dt * 1.5f));
            st.idle = 0;
        }
        const float zoom = (pad.down(xl::PAD_RT) ? 1.0f : 0.0f) - (pad.down(xl::PAD_LT) ? 1.0f : 0.0f);
        if (zoom != 0) { st.distance = std::max(6.0f, std::min(60.0f, st.distance * (1.0f - zoom * dt * 1.2f))); st.idle = 0; }
        if (pad.pressed(xl::PAD_Y)) st.follow = !st.follow;
        if (pad.pressed(xl::PAD_X)) st.day = std::fmod(st.day + 0.25f, 1.0f);
    }
    xl::end_frame();
    if (!st.dragging && st.idle > 4.0f) st.yaw += dt * 0.08f;

    // Sun and sky across the day
    const float sun_angle = st.day * 2 * HMM_PI32;
    const HMM_Vec3 sun = HMM_NormV3(HMM_V3(std::cos(sun_angle), std::sin(sun_angle), 0.35f));
    const float daylight = std::max(0.0f, std::min(1.0f, std::sin(sun_angle) * 2.5f + 0.15f));
    const float dusk = std::max(0.0f, 1.0f - std::fabs(std::sin(sun_angle)) * 3.0f) * (std::sin(sun_angle) > -0.3f ? 1.0f : 0.0f);
    const HMM_Vec3 night_sky = HMM_V3(0.02f, 0.025f, 0.07f), day_sky = HMM_V3(0.55f, 0.75f, 0.95f), dusk_sky = HMM_V3(0.95f, 0.45f, 0.35f);
    const HMM_Vec3 sky = mix3(mix3(night_sky, day_sky, daylight), dusk_sky, dusk * 0.7f);
    HMM_Vec3 sun_col = mix3(HMM_V3(1.0f, 0.97f, 0.9f), HMM_V3(1.0f, 0.55f, 0.3f), dusk);
    const HMM_Vec3 amb = mix3(HMM_V3(0.13f, 0.15f, 0.26f), HMM_V3(0.35f, 0.38f, 0.45f), daylight);
    // after sunset a cool moon lights the scene from the opposite side
    HMM_Vec3 light_dir = sun;
    float light_strength = daylight;
    if (std::sin(sun_angle) < 0.0f) {
        light_dir = HMM_NormV3(HMM_V3(-sun.X, -sun.Y, sun.Z));
        light_strength = 0.35f * std::min(1.0f, -std::sin(sun_angle) * 3.0f);
        sun_col = HMM_V3(0.55f, 0.65f, 1.0f);
    }

    // Car on the road
    const V3 car_p = st.scene.road.at(st.car_s);
    const V3 car_d = st.scene.road.dir(st.car_s);
    const float heading = std::atan2(-car_d.z, car_d.x);
    const float pitch_car = std::asin(std::max(-1.0f, std::min(1.0f, car_d.y)));
    const HMM_Mat4 car_model = HMM_MulM4(HMM_MulM4(HMM_Translate(v3(car_p)), HMM_Rotate_RH(heading, HMM_V3(0, 1, 0))), HMM_Rotate_RH(pitch_car, HMM_V3(0, 0, 1)));
    // physics: the car body follows the drawn car; the crates do what crates do
    st.physics->move_kinematic(st.car_body, { car_p.x, car_p.y + 0.22f, car_p.z }, xl::phys::euler(heading, pitch_car, 0), std::max(dt, 1e-3f));
    st.physics->step(std::min(dt, 0.05f), 2);
    // a crate that fell into the sea comes back to the stack on the next lap
    for (int i = 0; i < CRATES; i++) if (st.physics->pose(st.crates[i]).position.y < WATER_LEVEL - 2) {
        const V3 at = st.scene.road.at(st.crate_s);
        st.physics->remove(st.crates[i]);
        st.crates[i] = st.physics->add_box(xl::phys::Motion::Dynamic, { at.x, at.y + 3 + i * 0.4f, at.z }, {}, { 0.16f, 0.16f, 0.16f }, 2.0f, { 0.6f, 0.15f });
    }
    const HMM_Vec3 head_pos = HMM_AddV3(v3(car_p), HMM_AddV3(HMM_MulV3F(v3(car_d), 0.55f), HMM_V3(0, 0.25f, 0)));

    // Camera: orbit around the island centre, or around the car when following
    const HMM_Vec3 target = st.follow ? v3(car_p) : HMM_V3(0, 1.0f, 0);
    const float dist = st.follow ? std::min(st.distance, 9.0f) : st.distance;
    const HMM_Vec3 eye = HMM_AddV3(target, HMM_V3(std::cos(st.yaw) * std::cos(st.pitch) * dist, std::sin(st.pitch) * dist, std::sin(st.yaw) * std::cos(st.pitch) * dist));
    const float w = sapp_widthf(), h = sapp_heightf();
    const HMM_Mat4 view_proj = HMM_MulM4(HMM_Perspective_RH_NO(HMM_AngleDeg(50.0f), w / h, 0.1f, 200.0f), HMM_LookAt_RH(eye, target, HMM_V3(0, 1, 0)));

    fs_params_t fs = {};
    fs.sun_dir = rgb4(light_dir, light_strength);
    fs.sun_color = rgb4(sun_col);
    fs.ambient = rgb4(amb);
    fs.fog = rgb4(sky, 0.00022f);
    fs.cam_pos = rgb4(eye);
    fs.head_pos = rgb4(head_pos);
    fs.head_dir = rgb4(HMM_NormV3(HMM_AddV3(v3(car_d), HMM_V3(0, -0.18f, 0))), 1.0f - daylight * 0.9f);

    sg_pass pass = {};
    pass.action.colors[0].load_action = SG_LOADACTION_CLEAR;
    pass.action.colors[0].clear_value = { sky.X, sky.Y, sky.Z, 1 };
    pass.swapchain = sglue_swapchain();
    sg_begin_pass(&pass);
    sg_apply_pipeline(st.pip);
    sg_apply_uniforms(UB_fs_params, SG_RANGE(fs));

    sg_bindings world = {};
    world.vertex_buffers[0] = st.world_buf;
    sg_apply_bindings(&world);
    vs_params_t vs_world = { view_proj, HMM_M4D(1.0f) };
    sg_apply_uniforms(UB_vs_params, SG_RANGE(vs_world));
    sg_draw(0, st.world_count, 1);

    sg_bindings car = {};
    car.vertex_buffers[0] = st.car_buf;
    sg_apply_bindings(&car);
    vs_params_t vs_car = { HMM_MulM4(view_proj, car_model), car_model };
    sg_apply_uniforms(UB_vs_params, SG_RANGE(vs_car));
    sg_draw(0, st.car_count, 1);

    sg_bindings crates = {};
    crates.vertex_buffers[0] = st.crate_buf;
    sg_apply_bindings(&crates);
    {   // the pallet: the crate mesh, flattened
        vs_params_t vs_pallet = { HMM_MulM4(view_proj, st.pallet_model), st.pallet_model };
        sg_apply_uniforms(UB_vs_params, SG_RANGE(vs_pallet));
        sg_draw(0, st.crate_count, 1);
    }
    for (int i = 0; i < CRATES; i++) {
        const HMM_Mat4 model = pose_matrix(st.physics->pose(st.crates[i]));
        vs_params_t vs_crate = { HMM_MulM4(view_proj, model), model };
        sg_apply_uniforms(UB_vs_params, SG_RANGE(vs_crate));
        sg_draw(0, st.crate_count, 1);
    }

    // HUD
    sdtx_canvas(w / sapp_dpi_scale() * 0.5f, h / sapp_dpi_scale() * 0.5f);
    const int minutes = static_cast<int>(std::fmod(st.day * 24 * 60 + 6 * 60, 24 * 60));
    // drawn twice: a dark shadow, then the text, so it reads over a bright sky too
    for (int layer = 0; layer < 2; layer++) {
        const bool shadow = layer == 0;
        sdtx_origin(shadow ? 1.15f : 1.0f, shadow ? 1.15f : 1.0f);
        sdtx_home();
        const auto color = [&](float r, float g, float b) { if (shadow) sdtx_color3f(0.02f, 0.02f, 0.06f); else sdtx_color3f(r, g, b); };
        color(1.0f, 0.79f, 0.24f);
        sdtx_printf("%02d:%02d  ", minutes / 60, minutes % 60);
        color(0.95f, 0.96f, 1.0f);
        sdtx_printf("%s\n", daylight > 0.4f ? "DAY" : daylight > 0.05f ? "DUSK" : "NIGHT");
        color(0.85f, 0.88f, 1.0f);
        sdtx_printf("drag: orbit  scroll: zoom\nC: %s  N: skip ahead\n", st.follow ? "free camera" : "follow car");
    }
    sdtx_draw();

    sg_end_pass();
    sg_commit();
}

void event(const sapp_event* e) {
    switch (e->type) {
        case SAPP_EVENTTYPE_MOUSE_DOWN: st.dragging = true; st.idle = 0; break;
        case SAPP_EVENTTYPE_MOUSE_UP: st.dragging = false; break;
        case SAPP_EVENTTYPE_MOUSE_MOVE:
            if (st.dragging) {
                st.yaw += e->mouse_dx * 0.006f;
                st.pitch = std::max(0.08f, std::min(1.45f, st.pitch + e->mouse_dy * 0.006f));
                st.idle = 0;
            }
            break;
        case SAPP_EVENTTYPE_MOUSE_SCROLL:
            st.distance = std::max(6.0f, std::min(60.0f, st.distance * (1.0f - e->scroll_y * 0.08f)));
            st.idle = 0;
            break;
        case SAPP_EVENTTYPE_TOUCHES_MOVED:
            if (e->num_touches == 1) {
                static float last_x = e->touches[0].pos_x, last_y = e->touches[0].pos_y;
                st.yaw += (e->touches[0].pos_x - last_x) * 0.006f;
                st.pitch = std::max(0.08f, std::min(1.45f, st.pitch + (e->touches[0].pos_y - last_y) * 0.006f));
                last_x = e->touches[0].pos_x; last_y = e->touches[0].pos_y;
                st.idle = 0;
            }
            break;
        case SAPP_EVENTTYPE_KEY_DOWN:
            if (!xl::focused()) break;
            if (e->key_code == SAPP_KEYCODE_C) st.follow = !st.follow;
            if (e->key_code == SAPP_KEYCODE_N) st.day = std::fmod(st.day + 0.25f, 1.0f);
            break;
        default: break;
    }
}

void cleanup() {
    st.physics.reset();
    sdtx_shutdown();
    sg_shutdown();
}

} // namespace

extern "C" {
/** For the page's tests: a crate's height above the island (its index 0..9). */
EMSCRIPTEN_KEEPALIVE float showcase_crate_height(int i) {
    if (!st.physics || i < 0 || i >= CRATES) return 0;
    const xl::phys::V3 p = st.physics->pose(st.crates[i]).position;
    return p.y - st.scene.height(p.x, p.z);
}
/** For the page's tests: how far the car is from the crates along the road (metres, 0 when passing them). */
EMSCRIPTEN_KEEPALIVE float showcase_car_to_crates() { return std::fmod(st.crate_s - std::fmod(st.car_s, st.scene.road.length) + st.scene.road.length, st.scene.road.length); }
}

sapp_desc sokol_main(int argc, char* argv[]) {
    sapp_desc desc = {};
    desc.init_cb = init;
    desc.frame_cb = frame;
    desc.event_cb = event;
    desc.cleanup_cb = cleanup;
    desc.window_title = "3D Showcase";
    desc.sample_count = 4;
    desc.logger.func = slog_func;
    return xl::app_desc(argc, argv, desc);
}
