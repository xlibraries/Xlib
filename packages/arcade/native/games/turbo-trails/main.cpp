// Turbo Trails: the game around physics.h / terrain.h / rules.h / eras.h. Drawn with sokol_gl in metres (the
// camera maps the world to the window), HUD with sokol_debugtext, synthesized sound with sokol_audio. The page's
// side panel (src/turbo-trails/Panel.tsx) reads the state through tt_state_json and drives the era/shop.
#define SOKOL_IMPL
#include "sokol_gfx.h"
#include "sokol_app.h"
#include "sokol_glue.h"
#include "sokol_log.h"
#include "sokol_audio.h"
#include "sokol_gl.h"
#include "sokol_debugtext.h"
#define XL_IMPL
#include "xl.h"
#include "eras.h"
#include "physics.h"
#include "rules.h"
#include "terrain.h"
#include "art.h"

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <cstring>
#include <string>
#include <vector>

using namespace tt;

namespace {

constexpr float DT = 1.0f / 60.0f;

// ---------- Sound ----------

struct Voice { float freq, freq_end, t, dur, vol; int wave; };
std::vector<Voice> voices;
float engine_level = 0, engine_pitch = 80;
uint32_t noise_seed = 777;

void play(float f0, float f1, float dur, float vol, int wave) { if (voices.size() < 16) voices.push_back({ f0, f1, 0, dur, vol, wave }); }

void mix_audio() {
    const int frames = saudio_expect();
    if (frames <= 0) return;
    static std::vector<float> buf;
    static float engine_phase = 0;
    buf.assign(frames, 0.0f);
    const float rate = static_cast<float>(saudio_sample_rate());
    for (int i = 0; i < frames; i++) {
        engine_phase = std::fmod(engine_phase + engine_pitch / rate, 1.0f);
        const float s = (engine_phase < 0.5f ? 1.0f : -1.0f) * 0.4f + (4.0f * std::fabs(engine_phase - 0.5f) - 1.0f) * 0.6f;
        buf[i] += s * engine_level * 0.08f;
    }
    for (Voice& v : voices) {
        for (int i = 0; i < frames && v.t < v.dur; i++) {
            const float k = v.t / v.dur, f = v.freq + (v.freq_end - v.freq) * k, phase = std::fmod(v.t * f, 1.0f);
            float s;
            if (v.wave == 0) s = phase < 0.5f ? 1.0f : -1.0f;
            else if (v.wave == 1) s = 4.0f * std::fabs(phase - 0.5f) - 1.0f;
            else { noise_seed = noise_seed * 1664525u + 1013904223u; s = (noise_seed >> 9) / 4194304.0f - 1.0f; }
            buf[i] += s * v.vol * (1.0f - k) * (1.0f - k);
            v.t += 1.0f / rate;
        }
    }
    voices.erase(std::remove_if(voices.begin(), voices.end(), [](const Voice& v) { return v.t >= v.dur; }), voices.end());
    for (float& s : buf) s = std::max(-1.0f, std::min(1.0f, s));
    saudio_push(buf.data(), frames);
}

// ---------- State ----------

struct Particle { float x, y, vx, vy, life, max_life; Rgb c; };

struct {
    Progress progress;
    int era_index = 0;
    int attempt = 0;
    std::unique_ptr<World> world;
    Terrain terrain;
    Run run;
    Pose pose;
    VehicleSpec spec;
    float cam_x = 0, cam_y = 0, scale = 40;
    float time = 0, end_timer = 0;
    int earned = 0;                   // coins banked when the run ended
    std::string banner;               // landmark name shown briefly
    std::vector<Particle> particles;
    sgl_pipeline blend;
    // input
    bool key_gas = false, key_brake = false, pointer_gas = false, pointer_brake = false;
    uint32_t state_version = 1;       // bumped whenever the panel should re-read
} st;

void save_progress() { xl::save("progress", st.progress.serialize()); st.state_version++; }

void start_run() {
    const Era& e = era(st.era_index);
    st.terrain = build_terrain(e.terrain, static_cast<uint32_t>(st.era_index * 1000 + st.attempt), e.landmark_count);
    st.spec = apply_upgrades(e.spec, st.progress.upgrades[st.era_index]);
    st.world = World::create();
    st.world->set_terrain(st.terrain.xs, st.terrain.ys);
    st.world->spawn(st.spec, 0, st.terrain.height(0) + st.spec.wheel_r - st.spec.wheel_y + 0.4f);
    st.run = Run{};
    st.end_timer = 0;
    st.earned = 0;
    st.banner.clear();
    st.particles.clear();
    st.cam_x = 0; st.cam_y = 0;
    st.state_version++;
}

void end_run() {
    st.earned = finish_run(st.progress, st.era_index, st.run);
    save_progress();
    st.attempt++;
}

float throttle_input() {
    float t = 0;
    if (xl::focused()) {
        if (st.key_gas || st.pointer_gas) t += 1;
        if (st.key_brake || st.pointer_brake) t -= 1;
    }
    const xl::Gamepad& pad = xl::gamepad();
    if (pad.connected) {
        if (pad.down(xl::PAD_RT) || pad.down(xl::PAD_A) || pad.down(xl::PAD_RIGHT)) t += 1;
        if (pad.down(xl::PAD_LT) || pad.down(xl::PAD_X) || pad.down(xl::PAD_LEFT)) t -= 1;
        if (t == 0 && pad.lx != 0) t = pad.lx;
    }
    return std::max(-1.0f, std::min(1.0f, t));
}

void burst(float x, float y, Rgb c, int n, float speed) {
    for (int i = 0; i < n && st.particles.size() < 600; i++) {
        const float a = (std::rand() % 1000) / 1000.0f * 6.2832f, sp = speed * (0.3f + (std::rand() % 1000) / 1000.0f);
        const float life = 0.3f + (std::rand() % 1000) / 1000.0f * 0.5f;
        st.particles.push_back({ x, y, std::cos(a) * sp, std::sin(a) * sp + speed * 0.3f, life, life, c });
    }
}

void handle_events() {
    const Era& e = era(st.era_index);
    for (RunEvent ev : st.run.events) {
        switch (ev) {
            case RunEvent::Coin: play(1200, 1800, 0.08f, 0.12f, 0); burst(st.pose.x, st.pose.y + 0.5f, e.accent, 6, 2.5f); break;
            case RunEvent::Fuel: play(440, 880, 0.2f, 0.12f, 1); play(660, 1320, 0.25f, 0.08f, 1); break;
            case RunEvent::Flip: play(523, 1046, 0.25f, 0.14f, 1); play(784, 1568, 0.3f, 0.1f, 1); break;
            case RunEvent::Treasure: for (int i = 0; i < 5; i++) play(523.0f * (1 + i * 0.2f), 523.0f * (1 + i * 0.2f), 0.2f + i * 0.08f, 0.1f, 1); break;
            case RunEvent::Landmark: play(880, 880, 0.3f, 0.06f, 1); st.banner = std::string(e.landmarks[st.run.last_landmark_index].name) + ": " + e.landmarks[st.run.last_landmark_index].fact; break;
            case RunEvent::Landing: play(0, 0, 0.12f, 0.1f, 2); burst(st.pose.x, st.pose.y - 0.4f, e.ground_top, 14, 3.0f); break;
            case RunEvent::Crash: play(120, 30, 0.7f, 0.2f, 2); play(200, 40, 0.6f, 0.15f, 0); burst(st.pose.x, st.pose.y, e.body, 30, 5.0f); end_run(); break;
            case RunEvent::OutOfFuel: play(300, 80, 0.8f, 0.12f, 1); end_run(); break;
            case RunEvent::Finished: for (int i = 0; i < 6; i++) play(392.0f * (1 + i * 0.25f), 392.0f * (1 + i * 0.25f), 0.25f + i * 0.1f, 0.1f, 1); end_run(); break;
        }
    }
}

// ---------- Drawing (world units; the modelview maps metres to pixels) ----------

void col(Rgb c, float a = 1) { sgl_c4f(c.r, c.g, c.b, a); }

void quad(float x0, float y0, float x1, float y1) { sgl_v2f(x0, y0); sgl_v2f(x1, y0); sgl_v2f(x1, y1); sgl_v2f(x0, y1); }

void disc(float cx, float cy, float r, Rgb c, float a = 1, int n = 18) {
    sgl_begin_triangles();
    col(c, a);
    for (int i = 0; i < n; i++) {
        const float a0 = i * 6.2832f / n, a1 = (i + 1) * 6.2832f / n;
        sgl_v2f(cx, cy); sgl_v2f(cx + std::cos(a0) * r, cy + std::sin(a0) * r); sgl_v2f(cx + std::cos(a1) * r, cy + std::sin(a1) * r);
    }
    sgl_end();
}

void draw_sky(const Era& e, float w, float h) {
    sgl_matrix_mode_modelview();
    sgl_load_identity();
    sgl_begin_quads();
    col(e.sky_top); sgl_v2f(0, 0); sgl_v2f(w, 0);
    col(e.sky_bottom); sgl_v2f(w, h); sgl_v2f(0, h);
    sgl_end();
}

void draw_ground(const Era& e, float left, float right) {
    const Terrain& t = st.terrain;
    const int i0 = std::max(0, static_cast<int>((left - t.xs.front()) / TERRAIN_STEP) - 1);
    const int i1 = std::min(static_cast<int>(t.xs.size()) - 2, static_cast<int>((right - t.xs.front()) / TERRAIN_STEP) + 1);
    sgl_begin_quads();
    for (int i = i0; i <= i1; i++) {
        col(e.ground); sgl_v2f(t.xs[i], t.ys[i] - 30); sgl_v2f(t.xs[i + 1], t.ys[i + 1] - 30);
        col(e.ground); sgl_v2f(t.xs[i + 1], t.ys[i + 1]); sgl_v2f(t.xs[i], t.ys[i]);
    }
    for (int i = i0; i <= i1; i++) {
        col(e.ground_top);
        sgl_v2f(t.xs[i], t.ys[i] - 0.35f); sgl_v2f(t.xs[i + 1], t.ys[i + 1] - 0.35f); sgl_v2f(t.xs[i + 1], t.ys[i + 1]); sgl_v2f(t.xs[i], t.ys[i]);
    }
    sgl_end();
}

void draw_pickups(const Era& e, float left, float right) {
    const float spin = std::fabs(std::sin(st.time * 5.0f));
    for (const Pickup& c : st.terrain.coins) {
        if (c.taken || c.x < left || c.x > right) continue;
        disc(c.x, c.y, 0.28f, { 1.0f, 0.82f, 0.2f });
        disc(c.x, c.y, 0.28f * (0.3f + 0.7f * spin), { 1.0f, 0.95f, 0.6f });
    }
    for (const Pickup& f : st.terrain.fuel) {
        if (f.taken || f.x < left || f.x > right) continue;
        sgl_begin_quads();
        col(e.electric ? Rgb{ 0.2f, 0.9f, 1.0f } : Rgb{ 0.9f, 0.15f, 0.15f }); quad(f.x - 0.35f, f.y - 0.45f, f.x + 0.35f, f.y + 0.45f);
        col({ 1, 1, 1 }); quad(f.x - 0.22f, f.y - 0.1f, f.x + 0.22f, f.y + 0.2f);
        col({ 0.2f, 0.2f, 0.2f }); quad(f.x - 0.15f, f.y + 0.45f, f.x + 0.15f, f.y + 0.6f);
        sgl_end();
    }
    if (!st.terrain.treasure.taken && st.terrain.treasure.x > left - 2 && st.terrain.treasure.x < right + 2) {
        const Pickup& tr = st.terrain.treasure;
        const float bob = std::sin(st.time * 2.0f) * 0.2f;
        disc(tr.x, tr.y + bob, 0.9f + spin * 0.3f, e.accent, 0.18f);
        disc(tr.x, tr.y + bob, 0.45f, e.accent);
        disc(tr.x, tr.y + bob, 0.2f, { 1, 1, 1 });
    }
}

void draw_particles() {
    sgl_begin_quads();
    for (const Particle& p : st.particles) { col(p.c, p.life / p.max_life); quad(p.x - 0.08f, p.y - 0.08f, p.x + 0.08f, p.y + 0.08f); }
    sgl_end();
}

void draw_hud(const Era& e, float w, float h) {
    sgl_matrix_mode_modelview();
    sgl_load_identity();
    // fuel bar
    const float bx = 16, by = 14, bw = std::min(260.0f, w * 0.35f), bh = 14;
    sgl_begin_quads();
    col({ 0, 0, 0 }, 0.45f); quad(bx - 3, by - 3, bx + bw + 3, by + bh + 3);
    const Rgb fuel_col = st.run.fuel > 0.3f ? (e.electric ? Rgb{ 0.2f, 0.9f, 1.0f } : Rgb{ 0.35f, 0.9f, 0.4f }) : Rgb{ 1.0f, 0.3f, 0.2f };
    col(fuel_col); quad(bx, by, bx + bw * st.run.fuel, by + bh);
    sgl_end();

    // text layout (8 px cells at half resolution): fuel label and coins on the left under the bar, distance and
    // best in the middle, flips on the right; nothing overlaps the window's own badge in the top-right corner
    const float cols = w / sapp_dpi_scale() * 0.5f / 8.0f;
    sdtx_canvas(w / sapp_dpi_scale() * 0.5f, h / sapp_dpi_scale() * 0.5f);
    sdtx_origin(1, 0.6f);
    sdtx_color3f(1, 1, 1);
    sdtx_printf("%s", e.electric ? "CHARGE" : "FUEL");
    sdtx_pos(1, 2.3f);
    sdtx_color3f(1.0f, 0.82f, 0.2f);
    sdtx_printf("$%d", st.progress.coins + st.run.coins);
    char dist[32];
    std::snprintf(dist, sizeof dist, "%d m", static_cast<int>(st.run.distance));
    sdtx_pos(cols / 2 - std::strlen(dist) / 2.0f, 0.6f);
    sdtx_color3f(1, 1, 1);
    sdtx_puts(dist);
    std::snprintf(dist, sizeof dist, "best %d m", st.progress.best[st.era_index]);
    sdtx_pos(cols / 2 - std::strlen(dist) / 2.0f, 1.7f);
    sdtx_color3f(0.8f, 0.85f, 0.95f);
    sdtx_puts(dist);

    const float rows = h / sapp_dpi_scale() * 0.5f / 8.0f;
    const char* msg = nullptr;
    char line[96];
    if (st.run.state == RunState::Ready) msg = xl::focused() || xl::gamepad().connected ? "GAS TO GO  (-> or D, click right half)" : "CLICK TO PLAY";
    else if (st.run.state == RunState::Crashed) { std::snprintf(line, sizeof line, "CRASHED!  +$%d   gas to retry", st.earned); msg = line; }
    else if (st.run.state == RunState::OutOfFuel) { std::snprintf(line, sizeof line, "OUT OF %s!  +$%d   gas to retry", e.electric ? "CHARGE" : "FUEL", st.earned); msg = line; }
    else if (st.run.state == RunState::Finished) { std::snprintf(line, sizeof line, "ROAD COMPLETE!  +$%d   gas to retry", st.earned); msg = line; }
    if (msg) {
        sdtx_pos(cols / 2 - std::strlen(msg) / 2.0f, rows * 0.45f);
        const float pulse = 0.7f + 0.3f * std::sin(st.time * 4);
        sdtx_color3f(pulse, pulse, 1.0f);
        sdtx_puts(msg);
    }
    if (st.run.landmark_timer > 0 && !st.banner.empty()) {
        const float a = std::min(1.0f, st.run.landmark_timer);
        sdtx_pos(1, rows - 2.2f);
        sdtx_color3f(a, a * 0.9f, a * 0.5f);
        sdtx_puts(st.banner.substr(0, static_cast<size_t>(cols) - 2).c_str());
    }
    if (st.run.flips > 0 && st.run.state == RunState::Driving) {
        sdtx_pos(cols / 2 + 9, 0.6f);
        sdtx_color3f(1.0f, 0.5f, 0.8f);
        sdtx_printf("FLIPS %d", st.run.flips);
    }
}

// ---------- Frame ----------

void frame() {
    if (xl::paused()) return;
    const float dt = static_cast<float>(sapp_frame_duration());
    xl::report_frame(dt);
    st.time += dt;
    const Era& e = era(st.era_index);

    const float throttle = throttle_input();
    xl::end_frame();
    const bool ended = st.run.state == RunState::Crashed || st.run.state == RunState::OutOfFuel || st.run.state == RunState::Finished;
    if (ended) {
        st.end_timer += dt;
        if (st.end_timer > 1.2f && throttle > 0) start_run();
    }
    const bool motor_on = st.run.state == RunState::Driving || (st.run.state == RunState::Ready && throttle != 0);
    const bool has_fuel = st.run.fuel > 0;
    st.world->drive(ended ? 0 : throttle, motor_on && has_fuel);
    st.world->step(DT);
    st.pose = st.world->pose();
    const bool grounded = st.world->wheel_grounded(0) || st.world->wheel_grounded(1);
    RunInput in; in.throttle = ended || !has_fuel ? 0 : throttle;
    update_run(st.run, st.terrain, st.pose, grounded, st.world->chassis_hit(), st.world->landing_impact(), in, DT, e.terrain.length);
    handle_events();

    // engine sound and dust
    const float speed = std::fabs(st.pose.vx);
    engine_level = engine_level * 0.9f + (motor_on && has_fuel && throttle != 0 && !ended ? 1.0f : 0.15f) * 0.1f;
    engine_pitch = 60.0f + speed * 9.0f + std::fabs(throttle) * 30.0f;
    if (grounded && throttle != 0 && !ended && (std::rand() % 3) == 0) burst(st.pose.wheel_x[0], st.pose.wheel_y[0] - 0.2f, e.ground_top, 1, 1.5f);
    for (Particle& p : st.particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy -= 6 * dt; p.life -= dt; }
    st.particles.erase(std::remove_if(st.particles.begin(), st.particles.end(), [](const Particle& p) { return p.life <= 0; }), st.particles.end());

    // camera: lead the vehicle, keep the ground in the lower half
    const float w = sapp_widthf(), h = sapp_heightf();
    st.scale = std::min(h / 11.5f, w / 21.0f);
    const float target_x = st.pose.x + 3.5f + std::min(4.0f, speed * 0.25f);
    const float target_y = std::max(st.pose.y, st.terrain.height(st.pose.x)) + 2.0f;
    st.cam_x += (target_x - st.cam_x) * std::min(1.0f, dt * 5.0f);
    st.cam_y += (target_y - st.cam_y) * std::min(1.0f, dt * 3.0f);
    const float left = st.cam_x - w / st.scale * 0.5f, right = st.cam_x + w / st.scale * 0.5f;

    sgl_defaults();
    sgl_load_pipeline(st.blend);
    sgl_matrix_mode_projection();
    sgl_ortho(0, w, h, 0, -1, 1);
    draw_sky(e, w, h);
    art::draw_backdrop(st.era_index, e, { w, h, h * 0.62f, st.cam_x, st.scale, st.time });
    sgl_matrix_mode_modelview();
    sgl_load_identity();
    sgl_translate(w / 2, h / 2, 0);
    sgl_scale(st.scale, -st.scale, 1);           // y up, metres
    sgl_translate(-st.cam_x, -st.cam_y, 0);
    draw_ground(e, left, right);
    art::draw_landmarks(st.era_index, e, st.terrain, left, right, st.time);
    draw_pickups(e, left, right);
    art::draw_vehicle(st.era_index, e, st.pose, st.spec, st.time, speed);
    draw_particles();
    draw_hud(e, w, h);

    sg_pass pass = {};
    pass.action.colors[0].load_action = SG_LOADACTION_CLEAR;
    pass.action.colors[0].clear_value = { e.sky_top.r, e.sky_top.g, e.sky_top.b, 1 };
    pass.swapchain = sglue_swapchain();
    sg_begin_pass(&pass);
    sgl_draw();
    sdtx_draw();
    sg_end_pass();
    sg_commit();
    mix_audio();
}

void event(const sapp_event* ev) {
    switch (ev->type) {
        case SAPP_EVENTTYPE_KEY_DOWN:
        case SAPP_EVENTTYPE_KEY_UP: {
            const bool down = ev->type == SAPP_EVENTTYPE_KEY_DOWN;
            if (ev->key_code == SAPP_KEYCODE_RIGHT || ev->key_code == SAPP_KEYCODE_D || ev->key_code == SAPP_KEYCODE_UP || ev->key_code == SAPP_KEYCODE_W || ev->key_code == SAPP_KEYCODE_SPACE) st.key_gas = down;
            if (ev->key_code == SAPP_KEYCODE_LEFT || ev->key_code == SAPP_KEYCODE_A || ev->key_code == SAPP_KEYCODE_DOWN || ev->key_code == SAPP_KEYCODE_S) st.key_brake = down;
            break;
        }
        case SAPP_EVENTTYPE_MOUSE_DOWN:
        case SAPP_EVENTTYPE_MOUSE_UP: {
            const bool down = ev->type == SAPP_EVENTTYPE_MOUSE_DOWN;
            const bool right_half = ev->mouse_x > sapp_widthf() * 0.5f;
            if (down) { st.pointer_gas = right_half; st.pointer_brake = !right_half; }
            else st.pointer_gas = st.pointer_brake = false;
            break;
        }
        case SAPP_EVENTTYPE_TOUCHES_BEGAN:
        case SAPP_EVENTTYPE_TOUCHES_MOVED: {
            st.pointer_gas = st.pointer_brake = false;
            for (int i = 0; i < ev->num_touches; i++) {
                if (ev->touches[i].pos_x > sapp_widthf() * 0.5f) st.pointer_gas = true; else st.pointer_brake = true;
            }
            break;
        }
        case SAPP_EVENTTYPE_TOUCHES_ENDED:
        case SAPP_EVENTTYPE_TOUCHES_CANCELLED:
            st.pointer_gas = st.pointer_brake = false;
            break;
        case SAPP_EVENTTYPE_UNFOCUSED:
            st.key_gas = st.key_brake = st.pointer_gas = st.pointer_brake = false;
            break;
        default: break;
    }
}

void init() {
    sg_desc gfx = {};
    gfx.environment = sglue_environment();
    gfx.logger.func = slog_func;
    sg_setup(&gfx);
    sgl_desc_t gl = {};
    gl.max_vertices = 1 << 17;
    gl.logger.func = slog_func;
    sgl_setup(&gl);
    sg_pipeline_desc pip = {};
    pip.colors[0].blend.enabled = true;
    pip.colors[0].blend.src_factor_rgb = SG_BLENDFACTOR_SRC_ALPHA;
    pip.colors[0].blend.dst_factor_rgb = SG_BLENDFACTOR_ONE_MINUS_SRC_ALPHA;
    st.blend = sgl_make_pipeline(&pip);
    sdtx_desc_t text = {};
    text.fonts[0] = sdtx_font_oric();
    text.logger.func = slog_func;
    sdtx_setup(&text);
    saudio_desc audio = {};
    audio.num_channels = 1;
    audio.logger.func = slog_func;
    saudio_setup(&audio);

    st.progress = Progress::parse(xl::load("progress", ""));
    st.era_index = std::min(st.progress.unlocked - 1, std::max(0, std::atoi(xl::load("era", "0").c_str())));
    std::srand(xl::seed());
    start_run();
}

void cleanup() {
    st.world.reset();
    saudio_shutdown();
    sdtx_shutdown();
    sgl_shutdown();
    sg_shutdown();
}

} // namespace

// ---------- Exports for the page's panel ----------

extern "C" {
/** JSON of everything the panel shows. The caller frees the string. */
EMSCRIPTEN_KEEPALIVE char* tt_state_json() {
    std::string s = "{\"version\":" + std::to_string(st.state_version) + ",\"era\":" + std::to_string(st.era_index)
        + ",\"unlocked\":" + std::to_string(st.progress.unlocked) + ",\"coins\":" + std::to_string(st.progress.coins)
        + ",\"run\":{\"state\":" + std::to_string(static_cast<int>(st.run.state)) + ",\"distance\":" + std::to_string(static_cast<int>(st.run.distance))
        + ",\"coins\":" + std::to_string(st.run.coins) + ",\"flips\":" + std::to_string(st.run.flips) + "},\"best\":[";
    for (int e = 0; e < ERA_COUNT; e++) s += (e ? "," : "") + std::to_string(st.progress.best[e]);
    s += "],\"upgrades\":[";
    for (int e = 0; e < ERA_COUNT; e++) {
        s += e ? ",[" : "[";
        for (int k = 0; k < UPGRADE_KINDS; k++) s += (k ? "," : "") + std::to_string(st.progress.upgrades[e][k]);
        s += "]";
    }
    s += "],\"unlockDistance\":" + std::to_string(unlock_distance(st.era_index)) + "}";
    return strdup(s.c_str());
}
EMSCRIPTEN_KEEPALIVE int tt_set_era(int index) {
    if (index < 0 || index >= st.progress.unlocked) return 0;
    st.era_index = index;
    xl::save("era", std::to_string(index));
    start_run();
    return 1;
}
EMSCRIPTEN_KEEPALIVE int tt_buy(int era_index, int kind) {
    if (!buy_upgrade(st.progress, era_index, kind)) return 0;
    save_progress();
    if (era_index == st.era_index && st.run.state == RunState::Ready) start_run();   // apply right away while waiting at the start
    return 1;
}
EMSCRIPTEN_KEEPALIVE void tt_restart() { start_run(); }
}

sapp_desc sokol_main(int argc, char* argv[]) {
    sapp_desc desc = {};
    desc.init_cb = init;
    desc.frame_cb = frame;
    desc.event_cb = event;
    desc.cleanup_cb = cleanup;
    desc.window_title = "Turbo Trails";
    desc.logger.func = slog_func;
    return xl::app_desc(argc, argv, desc);
}
