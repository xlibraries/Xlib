// Turbo Trails: the game around physics.h / terrain.h / rules.h / eras.h / feel.h. Drawn with sokol_gl in metres
// (the camera maps the world to the window) into an offscreen texture, then a post-process pass (bloom, speed blur,
// grade, vignette) puts it on screen with the HUD (sokol_gl + sokol_debugtext) on top. Synthesized sound through
// xl_audio.h. The page's side panel (src/turbo-trails/Panel.tsx) reads the state through tt_state_json and drives
// the era/shop.
#define SOKOL_IMPL
#include "sokol_gfx.h"
#include "sokol_app.h"
#include "sokol_glue.h"
#include "sokol_log.h"
#include "sokol_gl.h"
#include "sokol_debugtext.h"
#define XL_IMPL
#include "xl.h"
#define XL_AUDIO_IMPL
#include "xl_audio.h"
#include "turbo-trails.glsl.h"
#include "eras.h"
#include "feel.h"
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
// per era: base pitch, how much speed raises it, square/triangle balance (0 = soft hum, 1 = rough), a rhythmic chuff
struct EngineVoice { float base, per_speed, rough, chuff; };
const EngineVoice ENGINES[] = {
    { 55, 4, 0.9f, 0 }, { 32, 2, 1.0f, 2.5f }, { 48, 3, 0.8f, 0 }, { 70, 7, 0.9f, 0.8f }, { 90, 10, 1.0f, 0 },
    { 110, 12, 0.9f, 0 }, { 60, 6, 1.0f, 0 }, { 95, 11, 0.7f, 0 }, { 160, 9, 0.1f, 0 }, { 240, 14, 0.0f, 0 },
};
EngineVoice engine = ENGINES[0];
uint32_t noise_seed = 777;

void play(float f0, float f1, float dur, float vol, int wave) { if (voices.size() < 16) voices.push_back({ f0, f1, 0, dur, vol, wave }); }

void mix_audio() {
    const int frames = xl::audio_expect();
    if (frames <= 0) return;
    static std::vector<float> buf;
    static float engine_phase = 0;
    buf.assign(frames, 0.0f);
    const float rate = static_cast<float>(xl::audio_sample_rate());
    static float chuff_phase = 0;
    for (int i = 0; i < frames; i++) {
        engine_phase = std::fmod(engine_phase + engine_pitch / rate, 1.0f);
        const float square = engine_phase < 0.5f ? 1.0f : -1.0f, triangle = 4.0f * std::fabs(engine_phase - 0.5f) - 1.0f;
        float s = square * engine.rough * 0.4f + triangle * (1.0f - engine.rough * 0.4f);
        if (engine.chuff > 0) { chuff_phase = std::fmod(chuff_phase + engine.chuff / rate, 1.0f); s *= 0.4f + 0.6f * (chuff_phase < 0.3f ? 1.0f : 0.2f); }
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
    xl::audio_push(buf.data(), frames);
}

// ---------- State ----------

enum ParticleKind { PUFF, SPARK, STAR };
struct Particle { float x, y, vx, vy, life, max_life, size; Rgb c; ParticleKind kind; };

struct {
    Progress progress;
    int era_index = 0;
    int attempt = 0;
    std::unique_ptr<World> world;
    Terrain terrain;
    Run run;
    Pose pose;
    VehicleSpec spec;
    Feel feel;
    float cam_x = 0, cam_y = 0, scale = 40;
    float time = 0, end_timer = 0;
    int earned = 0;                   // coins banked when the run ended
    std::string banner;               // landmark name shown briefly
    std::vector<Particle> particles;
    sgl_pipeline blend, hud_blend;
    sgl_context hud;                  // drawn in the swapchain pass, after the post-process
    // the offscreen scene and the pass that puts it on screen
    sg_image scene_color, scene_depth;
    sg_view scene_color_att, scene_depth_att, scene_tex;
    sg_sampler sampler;
    sg_pipeline post;
    int scene_w = 0, scene_h = 0;
    // input
    bool key_gas = false, key_brake = false, key_back = false, key_fwd = false, key_turbo = false;
    bool pointer_gas = false, pointer_brake = false, pointer_turbo = false;
    uint32_t state_version = 1;       // bumped whenever the panel should re-read
} st;

void save_progress() { xl::save("progress", st.progress.serialize()); st.state_version++; }

void start_run() {
    const Era& e = era(st.era_index);
    st.terrain = build_terrain(e.terrain, static_cast<uint32_t>(st.era_index * 1000 + st.attempt), e.landmark_count);
    st.spec = apply_upgrades(e.spec, st.progress.upgrades[st.era_index]);
    engine = ENGINES[st.era_index % 10];
    st.world = World::create();
    st.world->set_terrain(st.terrain.xs, st.terrain.ys);
    st.world->spawn(st.spec, 0, st.terrain.height(0) + st.spec.wheel_r - st.spec.wheel_y + 0.4f);
    st.run = Run{};
    st.feel = Feel{};
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

/** The Turbo button for mouse and touch: bottom-right of the canvas. */
struct Circle { float x, y, r; };
Circle turbo_button() { const float s = sapp_dpi_scale(), w = sapp_widthf(), h = sapp_heightf(); return { w - 58 * s, h - 58 * s, 40 * s }; }
bool in_turbo_button(float x, float y) { const Circle b = turbo_button(); return (x - b.x) * (x - b.x) + (y - b.y) * (y - b.y) <= b.r * b.r; }

struct Input { float throttle = 0, lean = 0; bool turbo = false; };

Input read_input() {
    Input in;
    if (xl::focused()) {
        if (st.key_gas || st.pointer_gas) in.throttle += 1;
        if (st.key_brake || st.pointer_brake) in.throttle -= 1;
        if (st.key_back) in.lean += 1;
        if (st.key_fwd) in.lean -= 1;
        in.turbo = st.key_turbo || st.pointer_turbo;
    }
    const xl::Gamepad& pad = xl::gamepad();
    if (pad.connected) {
        if (pad.down(xl::PAD_RT) || pad.down(xl::PAD_RIGHT)) in.throttle += 1;
        if (pad.down(xl::PAD_LT) || pad.down(xl::PAD_X) || pad.down(xl::PAD_LEFT)) in.throttle -= 1;
        if (in.throttle == 0 && pad.lx != 0) in.throttle = pad.lx;
        if (pad.down(xl::PAD_UP)) in.lean += 1;
        if (pad.down(xl::PAD_DOWN)) in.lean -= 1;
        if (in.lean == 0 && pad.ly != 0) in.lean = pad.ly;   // pull the stick back to lean back
        if (pad.down(xl::PAD_A) || pad.down(xl::PAD_RB)) in.turbo = true;
    }
    in.throttle = std::max(-1.0f, std::min(1.0f, in.throttle));
    in.lean = std::max(-1.0f, std::min(1.0f, in.lean));
    return in;
}

void emit(float x, float y, float vx, float vy, float life, float size, Rgb c, ParticleKind kind) {
    if (st.particles.size() < 700) st.particles.push_back({ x, y, vx, vy, life, life, size, c, kind });
}

void burst(float x, float y, Rgb c, int n, float speed, ParticleKind kind = SPARK) {
    for (int i = 0; i < n; i++) {
        const float a = (std::rand() % 1000) / 1000.0f * 6.2832f, sp = speed * (0.3f + (std::rand() % 1000) / 1000.0f);
        const float life = 0.3f + (std::rand() % 1000) / 1000.0f * 0.5f;
        emit(x, y, std::cos(a) * sp, std::sin(a) * sp + speed * 0.3f, life, kind == PUFF ? 0.25f : 0.09f, c, kind);
    }
}

/** A point in the world from chassis-local coordinates. */
void chassis_point(float lx, float ly, float& x, float& y) {
    const float c = std::cos(st.pose.angle), s = std::sin(st.pose.angle);
    x = st.pose.x + c * lx - s * ly;
    y = st.pose.y + s * lx + c * ly;
}

void handle_events() {
    const Era& e = era(st.era_index);
    for (RunEvent ev : st.run.events) {
        switch (ev) {
            case RunEvent::Coin: play(1200, 1800, 0.08f, 0.12f, 0); burst(st.pose.x, st.pose.y + 0.5f, { 1.0f, 0.9f, 0.4f }, 7, 2.5f, STAR); break;
            case RunEvent::Fuel: play(440, 880, 0.2f, 0.12f, 1); play(660, 1320, 0.25f, 0.08f, 1); burst(st.pose.x, st.pose.y + 0.3f, e.electric ? Rgb{ 0.4f, 0.9f, 1.0f } : Rgb{ 1.0f, 0.5f, 0.4f }, 10, 2.0f, STAR); break;
            case RunEvent::Flip: play(523, 1046, 0.25f, 0.14f, 1); play(784, 1568, 0.3f, 0.1f, 1); burst(st.pose.x, st.pose.y, { 1.0f, 0.6f, 0.9f }, 16, 3.5f, STAR); break;
            case RunEvent::Treasure: for (int i = 0; i < 5; i++) play(523.0f * (1 + i * 0.2f), 523.0f * (1 + i * 0.2f), 0.2f + i * 0.08f, 0.1f, 1); burst(st.pose.x, st.pose.y + 0.5f, e.accent, 30, 4.0f, STAR); break;
            case RunEvent::Landmark: play(880, 880, 0.3f, 0.06f, 1); st.banner = std::string(e.landmarks[st.run.last_landmark_index].name) + ": " + e.landmarks[st.run.last_landmark_index].fact; break;
            case RunEvent::Landing: play(0, 0, 0.12f, 0.1f, 2); for (int i = 0; i < 2; i++) burst(st.pose.wheel_x[i], st.pose.wheel_y[i] - 0.2f, art::lit(e.ground_top, 0.25f), 7, 2.2f, PUFF); break;
            case RunEvent::Crash: play(120, 30, 0.7f, 0.2f, 2); play(200, 40, 0.6f, 0.15f, 0); burst(st.pose.x, st.pose.y, e.body, 24, 5.0f); burst(st.pose.x, st.pose.y, art::lit(e.ground_top, 0.25f), 12, 3.0f, PUFF); end_run(); break;
            case RunEvent::OutOfFuel: play(300, 80, 0.8f, 0.12f, 1); end_run(); break;
            case RunEvent::Finished: for (int i = 0; i < 6; i++) play(392.0f * (1 + i * 0.25f), 392.0f * (1 + i * 0.25f), 0.25f + i * 0.1f, 0.1f, 1); end_run(); break;
            case RunEvent::Turbo: play(180, 1400, 0.45f, 0.16f, 2); play(220, 880, 0.5f, 0.08f, 1); break;
        }
    }
}

/** Dust from the wheels, smoke from the engine, sparks from the Turbo flame. */
void breathe(const Era& e, const Input& in, bool grounded, bool ended, float dt) {
    static float smoke_timer = 0, turbo_timer = 0;
    const float speed = std::fabs(st.pose.vx);
    if (grounded && in.throttle != 0 && !ended && (std::rand() % 3) == 0) {
        const int w = st.pose.vx >= 0 ? 0 : 1;
        emit(st.pose.wheel_x[w], st.pose.wheel_y[w] - st.spec.wheel_r * 0.6f, -st.pose.vx * 0.15f - 0.5f, 0.6f + (std::rand() % 100) / 100.0f, 0.5f, 0.12f + speed * 0.01f, art::lit(e.ground_top, 0.3f), PUFF);
    }
    const bool engine_era = st.era_index >= 1 && st.era_index <= 7 && st.era_index != 2;
    smoke_timer -= dt;
    if (engine_era && !ended && in.throttle > 0 && smoke_timer <= 0) {
        smoke_timer = st.era_index == 1 ? 0.12f : 0.07f;
        float x, y;
        if (st.era_index == 1) chassis_point(-st.spec.chassis_w * 0.2f, st.spec.chassis_h * 1.8f, x, y);
        else chassis_point(-st.spec.chassis_w * 0.55f, -st.spec.chassis_h * 0.2f, x, y);
        const Rgb smoke = st.era_index == 1 ? Rgb{ 0.95f, 0.95f, 0.95f } : Rgb{ 0.45f, 0.45f, 0.48f };
        emit(x, y, -st.pose.vx * 0.3f - 0.4f, st.era_index == 1 ? 1.5f : 0.6f, st.era_index == 1 ? 1.1f : 0.6f, st.era_index == 1 ? 0.22f : 0.12f, smoke, PUFF);
    }
    turbo_timer -= dt;
    if (st.run.boosting && turbo_timer <= 0) {
        turbo_timer = 0.03f;
        float x, y;
        chassis_point(-st.spec.chassis_w * 0.6f, 0, x, y);
        emit(x, y, -st.pose.vx * 0.5f - 3 - (std::rand() % 100) / 50.0f, (std::rand() % 100) / 50.0f - 1, 0.35f, 0.08f, (std::rand() % 2) ? Rgb{ 1.0f, 0.6f, 0.2f } : Rgb{ 0.7f, 0.9f, 1.0f }, SPARK);
    }
    for (Particle& p : st.particles) {
        p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt;
        if (p.kind == PUFF) { p.vx *= 1 - 2 * dt; p.vy += 0.8f * dt; p.size += 0.6f * dt; }
        else p.vy -= 6 * dt;
    }
    st.particles.erase(std::remove_if(st.particles.begin(), st.particles.end(), [](const Particle& p) { return p.life <= 0; }), st.particles.end());
}

// ---------- Drawing (world units; the modelview maps metres to pixels) ----------

void draw_pickups(const Era& e, float left, float right) {
    for (const Pickup& c : st.terrain.coins) if (!c.taken && c.x >= left && c.x <= right) art::draw_coin(c.x, c.y, st.time * 4 + c.x);
    for (const Pickup& f : st.terrain.fuel) if (!f.taken && f.x >= left && f.x <= right) art::draw_fuel(f.x, f.y, e.electric, st.time);
    if (!st.terrain.treasure.taken && st.terrain.treasure.x > left - 3 && st.terrain.treasure.x < right + 3) art::draw_treasure(st.terrain.treasure.x, st.terrain.treasure.y, st.time, e.accent);
}

void draw_particles() {
    for (const Particle& p : st.particles) {
        const float k = p.life / p.max_life;
        if (p.kind == PUFF) art::soft_disc(p.x, p.y, p.size, p.c, 0.55f * k, 0, 12);
        else if (p.kind == SPARK) { sgl_begin_quads(); art::col(p.c, k); art::quad(p.x - p.size, p.y - p.size, p.x + p.size, p.y + p.size); sgl_end(); }
        else {
            const float r = p.size * 2.2f * (0.5f + k);
            sgl_begin_triangles();
            art::col({ 1, 1, 1 }, k);
            for (int i = 0; i < 4; i++) { const float a = i * 1.5708f + st.time * 3; sgl_v2f(p.x, p.y); art::col(p.c, k); sgl_v2f(p.x + std::cos(a) * r, p.y + std::sin(a) * r); sgl_v2f(p.x + std::cos(a + 0.5f) * r * 0.35f, p.y + std::sin(a + 0.5f) * r * 0.35f); art::col({ 1, 1, 1 }, k); }
            sgl_end();
        }
    }
}

void bar(float x0, float y0, float x1, float y1, float fraction, Rgb c) {
    const float r = (y1 - y0) * 0.5f;
    art::up_sign = -1;
    art::rrect(x0 - 3, y0 - 3, x1 + 3, y1 + 3, r + 3, { 0.06f, 0.05f, 0.09f }, 0, -0.1f, -0.1f);
    if (fraction > 0.01f) art::rrect(x0, y0, x0 + std::max(y1 - y0, (x1 - x0) * fraction), y1, r, c, 0, 0.35f, -0.2f);
    art::up_sign = 1;
}

void draw_hud(const Era& e, float w, float h) {
    sgl_set_context(st.hud);
    sgl_defaults();
    sgl_load_pipeline(st.hud_blend);
    sgl_matrix_mode_projection();
    sgl_ortho(0, w, h, 0, -1, 1);
    sgl_matrix_mode_modelview();
    sgl_load_identity();
    art::speed_lines({ w, h, h * 0.62f, st.cam_x, st.scale, st.time }, st.feel.boost_glow);

    // fuel and Turbo meters
    const float s = sapp_dpi_scale();
    const float bx = 16 * s, by = 14 * s, bw = std::min(260.0f, w * 0.3f), bh = 14 * s;
    const Rgb fuel_col = st.run.fuel > 0.3f ? (e.electric ? Rgb{ 0.2f, 0.9f, 1.0f } : Rgb{ 0.35f, 0.9f, 0.4f }) : Rgb{ 1.0f, 0.3f, 0.2f };
    bar(bx, by, bx + bw, by + bh, st.run.fuel, fuel_col);
    const float tx = bx + bw + 14 * s, tw = std::min(150.0f, w * 0.18f);
    const float pulse = 0.5f + 0.5f * std::sin(st.time * 8);
    bar(tx, by, tx + tw, by + bh, st.run.turbo, st.run.boosting ? Rgb{ 1.0f, 0.75f + 0.25f * pulse, 0.3f } : Rgb{ 1.0f, 0.55f, 0.15f });

    // the Turbo button (touch / mouse); lit when there's Turbo to spend
    const Circle b = turbo_button();
    const float ready = st.run.turbo > 0 ? 1.0f : 0.35f;
    art::soft_disc(b.x, b.y, b.r * 1.3f, { 1.0f, 0.6f, 0.2f }, 0.25f * ready * (st.run.boosting ? 0.6f + 0.4f * pulse : 1));
    art::disc(b.x, b.y, b.r, { 0.08f, 0.06f, 0.1f }, 0.55f, 32);
    art::up_sign = -1;
    { art::Pt bolt[7] = { { b.x + 6 * s, b.y - 22 * s }, { b.x - 12 * s, b.y + 3 * s }, { b.x - 1 * s, b.y + 3 * s }, { b.x - 7 * s, b.y + 22 * s }, { b.x + 12 * s, b.y - 4 * s }, { b.x + 1 * s, b.y - 4 * s }, { b.x + 6 * s, b.y - 22 * s } }; art::fill(bolt, 7, { 1.0f, 0.75f, 0.25f }, 0.3f, -0.1f, ready); }
    art::up_sign = 1;
    sgl_set_context(sgl_default_context());

    // text layout (8 px cells at half resolution): labels on the bars, coins under them, distance and best in the
    // middle, flips on the right; nothing overlaps the window's own badge in the top-right corner
    const float cols = w / s * 0.5f / 8.0f;
    sdtx_canvas(w / s * 0.5f, h / s * 0.5f);
    sdtx_origin(1.25f, 0.65f);
    sdtx_color3f(1, 1, 1);
    sdtx_printf("%s", e.electric ? "CHARGE" : "FUEL");
    sdtx_pos(tx / s / 16 + 0.3f, 0.65f);
    sdtx_puts("TURBO");
    sdtx_pos(1, 2.3f);
    sdtx_color3f(1.0f, 0.82f, 0.2f);
    sdtx_printf("$%d", st.progress.coins + st.run.coins);
    // distance and best, centred under the bars (clear of the coins on the left and the window badge top-right)
    char dist[48];
    std::snprintf(dist, sizeof dist, "%d m", static_cast<int>(st.run.distance));
    sdtx_pos(cols / 2 - std::strlen(dist) / 2.0f, 2.3f);
    sdtx_color3f(1, 1, 1);
    sdtx_puts(dist);
    std::snprintf(dist, sizeof dist, "best %d m", st.progress.best[st.era_index]);
    sdtx_pos(cols / 2 - std::strlen(dist) / 2.0f, 3.4f);
    sdtx_color3f(0.8f, 0.85f, 0.95f);
    sdtx_puts(dist);

    const float rows = h / s * 0.5f / 8.0f;
    const char* msg = nullptr;
    char line[96];
    if (st.run.state == RunState::Ready) msg = xl::focused() || xl::gamepad().connected ? "GAS TO GO: -> or D" : "CLICK TO PLAY";
    else if (st.run.state == RunState::Crashed) { std::snprintf(line, sizeof line, "CRASHED!  +$%d   gas to retry", st.earned); msg = line; }
    else if (st.run.state == RunState::OutOfFuel) { std::snprintf(line, sizeof line, "OUT OF %s!  +$%d   gas to retry", e.electric ? "CHARGE" : "FUEL", st.earned); msg = line; }
    else if (st.run.state == RunState::Finished) { std::snprintf(line, sizeof line, "ROAD COMPLETE!  +$%d   gas to retry", st.earned); msg = line; }
    if (msg) {
        sdtx_pos(cols / 2 - std::strlen(msg) / 2.0f, rows * 0.45f);
        const float p = 0.7f + 0.3f * std::sin(st.time * 4);
        sdtx_color3f(p, p, 1.0f);
        sdtx_puts(msg);
        if (st.run.state == RunState::Ready && msg[0] == 'G') {
            const char* keys = "LEAN: ^ v    TURBO: SPACE";
            sdtx_pos(cols / 2 - std::strlen(keys) / 2.0f, rows * 0.45f + 1.3f);
            sdtx_color3f(0.75f, 0.8f, 0.95f);
            sdtx_puts(keys);
        }
    }
    if (st.run.landmark_timer > 0 && !st.banner.empty()) {
        const float a = std::min(1.0f, st.run.landmark_timer);
        sdtx_pos(1, rows - 2.2f);
        sdtx_color3f(a, a * 0.9f, a * 0.5f);
        sdtx_puts(st.banner.substr(0, static_cast<size_t>(cols) - 2).c_str());
    }
    if (st.run.flips > 0 && st.run.state == RunState::Driving) {
        sdtx_pos(cols / 2 - 3.5f, 4.5f);
        sdtx_color3f(1.0f, 0.5f, 0.8f);
        sdtx_printf("FLIPS %d", st.run.flips);
    }
}

/** (Re)creates the offscreen scene target at the framebuffer's size. */
void ensure_scene(int w, int h) {
    if (w == st.scene_w && h == st.scene_h) return;
    if (st.scene_w) { sg_destroy_view(st.scene_color_att); sg_destroy_view(st.scene_depth_att); sg_destroy_view(st.scene_tex); sg_destroy_image(st.scene_color); sg_destroy_image(st.scene_depth); }
    st.scene_w = w; st.scene_h = h;
    const sg_environment env = sglue_environment();
    sg_image_desc img = {};
    img.usage.color_attachment = true;
    img.width = w; img.height = h;
    img.pixel_format = env.defaults.color_format;
    img.sample_count = env.defaults.sample_count;
    st.scene_color = sg_make_image(&img);
    sg_image_desc depth = img;
    depth.usage = {};
    depth.usage.depth_stencil_attachment = true;
    depth.pixel_format = env.defaults.depth_format;
    st.scene_depth = sg_make_image(&depth);
    sg_view_desc view = {};
    view.color_attachment.image = st.scene_color;
    st.scene_color_att = sg_make_view(&view);
    view = {};
    view.depth_stencil_attachment.image = st.scene_depth;
    st.scene_depth_att = sg_make_view(&view);
    view = {};
    view.texture.image = st.scene_color;
    st.scene_tex = sg_make_view(&view);
}

// ---------- Frame ----------

void frame() {
    if (xl::paused()) return;
    const float dt = static_cast<float>(sapp_frame_duration());
    xl::report_frame(dt);
    st.time += dt;
    const Era& e = era(st.era_index);

    const Input in = read_input();
    xl::end_frame();
    const bool ended = st.run.state == RunState::Crashed || st.run.state == RunState::OutOfFuel || st.run.state == RunState::Finished;
    if (ended) {
        st.end_timer += dt;
        if (st.end_timer > 1.2f && in.throttle > 0) start_run();
    }
    // physics and rules in fixed steps, as many as real time asks for (so a slow frame rate doesn't slow the
    // world down), capped so a long stall doesn't fast-forward it
    static float accumulator = 0;
    accumulator = std::min(accumulator + dt, DT * 6);
    bool motor_on = false, grounded = true;
    float impact = 0;
    while (accumulator >= DT) {
        accumulator -= DT;
        const bool over = st.run.state == RunState::Crashed || st.run.state == RunState::OutOfFuel || st.run.state == RunState::Finished;
        motor_on = st.run.state == RunState::Driving || (st.run.state == RunState::Ready && in.throttle != 0);
        const bool has_fuel = st.run.fuel > 0;
        DriveInput drive;
        drive.throttle = over ? 0 : in.throttle;
        drive.lean = over ? 0 : in.lean;
        drive.boost = st.run.boosting ? 1.0f : 0.0f;
        drive.motor_on = motor_on && has_fuel;
        st.world->drive(drive);
        st.world->step(DT);
        st.pose = st.world->pose();
        grounded = st.world->wheel_grounded(0) || st.world->wheel_grounded(1);
        impact = std::max(impact, st.world->landing_impact());
        RunInput rin;
        rin.throttle = over || !has_fuel ? 0 : in.throttle;
        rin.lean = in.lean;
        rin.boost = in.turbo && !over;
        update_run(st.run, st.terrain, st.pose, grounded, st.world->chassis_hit(), st.world->landing_impact(), rin, DT, e.terrain.length);
        handle_events();
    }
    const bool has_fuel = st.run.fuel > 0;
    update_feel(st.feel, st.run, st.pose, grounded, impact, dt, st.time);

    // engine sound and the particles
    const float speed = std::fabs(st.pose.vx);
    engine_level = engine_level * 0.9f + (motor_on && has_fuel && in.throttle != 0 && !ended ? 1.0f : 0.15f) * 0.1f * (1 + 0.5f * st.feel.boost_glow);
    engine_pitch = (engine.base + speed * engine.per_speed + std::fabs(in.throttle) * engine.base * 0.4f) * (1 + 0.35f * st.feel.boost_glow);
    breathe(e, in, grounded, ended, dt);

    // camera: lead the vehicle, keep the ground in the lower half, shake on hard landings
    const float w = sapp_widthf(), h = sapp_heightf();
    st.scale = std::min(h / 9.5f, w / 17.0f);
    const float target_x = st.pose.x + 3.5f + std::min(4.0f, speed * 0.25f) + st.feel.boost_glow * 1.5f;
    const float target_y = std::max(st.pose.y, st.terrain.height(st.pose.x)) + 2.0f;
    st.cam_x += (target_x - st.cam_x) * std::min(1.0f, dt * 5.0f);
    st.cam_y += (target_y - st.cam_y) * std::min(1.0f, dt * 3.0f);
    const float shake_x = st.feel.shake * 0.25f * std::sin(st.time * 71), shake_y = st.feel.shake * 0.2f * std::sin(st.time * 97);
    const float cam_x = st.cam_x + shake_x, cam_y = st.cam_y + shake_y;
    const float left = cam_x - w / st.scale * 0.5f, right = cam_x + w / st.scale * 0.5f;

    // the scene, into the offscreen target
    ensure_scene(sapp_width(), sapp_height());
    sgl_set_context(sgl_default_context());
    sgl_defaults();
    sgl_load_pipeline(st.blend);
    sgl_matrix_mode_projection();
    sgl_ortho(0, w, h, 0, -1, 1);
    art::draw_backdrop(st.era_index, e, { w, h, h * 0.62f + shake_y * st.scale, cam_x, st.scale, st.time });
    sgl_matrix_mode_modelview();
    sgl_load_identity();
    sgl_translate(w / 2, h / 2, 0);
    sgl_scale(st.scale, -st.scale, 1);           // y up, metres
    sgl_translate(-cam_x, -cam_y, 0);
    art::draw_ground(e, st.terrain, left, right);
    art::draw_landmarks(st.era_index, e, st.terrain, left, right, st.time);
    draw_pickups(e, left, right);
    art::draw_shadow(st.terrain, st.pose.x, st.spec.chassis_w * 0.7f, st.pose.y - st.terrain.height(st.pose.x) - st.spec.wheel_r + st.spec.wheel_y);
    art::draw_vehicle(st.era_index, e, st.pose, st.spec, st.time, speed, st.feel.mood, st.feel.blink, st.feel.squash, st.feel.boost_glow);
    draw_particles();
    draw_hud(e, w, h);

    sg_pass scene = {};
    scene.action.colors[0].load_action = SG_LOADACTION_CLEAR;
    scene.action.colors[0].clear_value = { e.sky_top.r, e.sky_top.g, e.sky_top.b, 1 };
    scene.attachments.colors[0] = st.scene_color_att;
    scene.attachments.depth_stencil = st.scene_depth_att;
    sg_begin_pass(&scene);
    sgl_draw();
    sg_end_pass();

    // on screen: the post-processed scene, then the HUD
    sg_pass pass = {};
    pass.action.colors[0].load_action = SG_LOADACTION_DONTCARE;
    pass.swapchain = sglue_swapchain();
    sg_begin_pass(&pass);
    sg_apply_pipeline(st.post);
    sg_bindings bind = {};
    bind.views[VIEW_tex] = st.scene_tex;
    bind.samplers[SMP_smp] = st.sampler;
    sg_apply_bindings(&bind);
    fs_params_t params = {};
    params.texel[0] = 1.0f / w; params.texel[1] = 1.0f / h;
    params.boost = st.feel.boost_glow;
    params.centre[0] = 0.5f + (st.pose.x - cam_x) * st.scale / w;
    params.centre[1] = 0.5f - (st.pose.y - cam_y) * st.scale / h;
    params.flip_y = sg_query_features().origin_top_left ? 0.0f : 1.0f;
    sg_apply_uniforms(UB_fs_params, SG_RANGE(params));
    sg_draw(0, 3, 1);
    sgl_context_draw(st.hud);
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
            if (ev->key_code == SAPP_KEYCODE_RIGHT || ev->key_code == SAPP_KEYCODE_D) st.key_gas = down;
            if (ev->key_code == SAPP_KEYCODE_LEFT || ev->key_code == SAPP_KEYCODE_A) st.key_brake = down;
            if (ev->key_code == SAPP_KEYCODE_UP || ev->key_code == SAPP_KEYCODE_W) st.key_back = down;
            if (ev->key_code == SAPP_KEYCODE_DOWN || ev->key_code == SAPP_KEYCODE_S) st.key_fwd = down;
            if (ev->key_code == SAPP_KEYCODE_SPACE || ev->key_code == SAPP_KEYCODE_LEFT_SHIFT) st.key_turbo = down;
            break;
        }
        case SAPP_EVENTTYPE_MOUSE_DOWN:
        case SAPP_EVENTTYPE_MOUSE_UP: {
            const bool down = ev->type == SAPP_EVENTTYPE_MOUSE_DOWN;
            st.pointer_gas = st.pointer_brake = st.pointer_turbo = false;
            if (!down) break;
            if (in_turbo_button(ev->mouse_x, ev->mouse_y)) st.pointer_turbo = true;
            else if (ev->mouse_x > sapp_widthf() * 0.5f) st.pointer_gas = true;
            else st.pointer_brake = true;
            break;
        }
        case SAPP_EVENTTYPE_TOUCHES_BEGAN:
        case SAPP_EVENTTYPE_TOUCHES_MOVED: {
            st.pointer_gas = st.pointer_brake = st.pointer_turbo = false;
            for (int i = 0; i < ev->num_touches; i++) {
                if (in_turbo_button(ev->touches[i].pos_x, ev->touches[i].pos_y)) st.pointer_turbo = true;
                else if (ev->touches[i].pos_x > sapp_widthf() * 0.5f) st.pointer_gas = true;
                else st.pointer_brake = true;
            }
            break;
        }
        case SAPP_EVENTTYPE_TOUCHES_ENDED:
        case SAPP_EVENTTYPE_TOUCHES_CANCELLED:
            st.pointer_gas = st.pointer_brake = st.pointer_turbo = false;
            break;
        case SAPP_EVENTTYPE_UNFOCUSED:
            st.key_gas = st.key_brake = st.key_back = st.key_fwd = st.key_turbo = false;
            st.pointer_gas = st.pointer_brake = st.pointer_turbo = false;
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
    gl.max_vertices = 1 << 18;
    gl.max_commands = 1 << 15;
    gl.logger.func = slog_func;
    sgl_setup(&gl);
    sg_pipeline_desc pip = {};
    pip.colors[0].blend.enabled = true;
    pip.colors[0].blend.src_factor_rgb = SG_BLENDFACTOR_SRC_ALPHA;
    pip.colors[0].blend.dst_factor_rgb = SG_BLENDFACTOR_ONE_MINUS_SRC_ALPHA;
    st.blend = sgl_make_pipeline(&pip);
    sgl_context_desc_t hud = {};
    hud.max_vertices = 1 << 14;
    hud.max_commands = 1 << 12;
    st.hud = sgl_make_context(&hud);
    st.hud_blend = sgl_context_make_pipeline(st.hud, &pip);
    sdtx_desc_t text = {};
    text.fonts[0] = sdtx_font_oric();
    text.logger.func = slog_func;
    sdtx_setup(&text);

    // the post-process pass: a full-screen triangle sampling the scene
    sg_pipeline_desc post = {};
    post.shader = sg_make_shader(post_shader_desc(sg_query_backend()));
    post.primitive_type = SG_PRIMITIVETYPE_TRIANGLES;
    st.post = sg_make_pipeline(&post);
    sg_sampler_desc smp = {};
    smp.min_filter = smp.mag_filter = SG_FILTER_LINEAR;
    smp.wrap_u = smp.wrap_v = SG_WRAP_CLAMP_TO_EDGE;
    st.sampler = sg_make_sampler(&smp);

    xl::audio_setup(1);

    st.progress = Progress::parse(xl::load("progress", ""));
    st.era_index = std::min(st.progress.unlocked - 1, std::max(0, std::atoi(xl::load("era", "0").c_str())));
    std::srand(xl::seed());
    start_run();
}

void cleanup() {
    st.world.reset();
    xl::audio_shutdown();
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
        + ",\"coins\":" + std::to_string(st.run.coins) + ",\"flips\":" + std::to_string(st.run.flips)
        + ",\"turbo\":" + std::to_string(static_cast<int>(st.run.turbo * 100)) + ",\"boosting\":" + (st.run.boosting ? "true" : "false") + "},\"best\":[";
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
/** Fills the Turbo meter (the page's tests use it to try the boost without earning it first). */
EMSCRIPTEN_KEEPALIVE void tt_fill_turbo() { st.run.turbo = 1.0f; }
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
