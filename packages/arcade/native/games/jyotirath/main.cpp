// JyotiRath, Chapter I: Mohenjo-Daro. The journey (drive.h) along the road (track.h), told by the script (story.h),
// drawn from models.h. Three passes a frame: the sun's shadow map (a depth texture), the diorama into a 4× MSAA
// target (Pixar-styled lighting, shaders/jyotirath.glsl), then the post-process pass (tilt-shift, bloom, grade) on
// screen with the HUD and the dialogue (sokol_gl and the engine's baked font) on top. The land is built in chunks as
// you approach them. Synthesized sound through xl_audio.h. Exports for the page's tests at the bottom.
#define SOKOL_IMPL
#include "sokol_gfx.h"
#include "sokol_app.h"
#include "sokol_glue.h"
#include "sokol_log.h"
#include "sokol_gl.h"
#define HANDMADE_MATH_USE_RADIANS
#include "HandmadeMath.h"
#define XL_IMPL
#include "xl.h"
#define XL_AUDIO_IMPL
#include "xl_audio.h"
#include "xl_text.h"
#include "jyotirath.glsl.h"
#include "drive.h"
#include "models.h"
#include "story.h"
#include "track.h"

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <cstring>
#include <fstream>
#include <iterator>
#include <memory>
#include <string>
#include <vector>

using namespace jr;
using xl::Rgb;

namespace {

constexpr float DT = 1.0f / 120.0f;
constexpr int SHADOW_SIZE = 2048;
constexpr float SHADOW_HALF = 24.0f;    // the shadow map covers this far round the camera's target
constexpr int MSAA = 4;

// ---------- sound ----------

struct Voice { float freq, freq_end, t, dur, vol, delay; int wave; };
std::vector<Voice> voices;
float rumble_level = 0, rumble_tone = 60, hiss_level = 0;
uint32_t noise_seed = 99;

void play(float f0, float f1, float dur, float vol, int wave, float delay = 0) { if (voices.size() < 24) voices.push_back({ f0, f1, 0, dur, vol, delay, wave }); }

void mix_audio() {
    const int frames = xl::audio_expect();
    if (frames <= 0) return;
    static std::vector<float> buf;
    static float phase = 0, low = 0, high = 0;
    buf.assign(frames, 0.0f);
    const float rate = static_cast<float>(xl::audio_sample_rate());
    for (int i = 0; i < frames; i++) {
        noise_seed = noise_seed * 1664525u + 1013904223u;
        const float n = (noise_seed >> 9) / 4194304.0f - 1.0f;
        low += (n - low) * 0.04f;            // wheels on earth: a low rumble
        high += (n - high) * 0.5f;           // sliding on sand: a hiss
        phase = std::fmod(phase + rumble_tone / rate, 1.0f);
        const float tone = 4.0f * std::fabs(phase - 0.5f) - 1.0f;
        buf[i] += (low * 2.2f + tone * 0.25f) * rumble_level * 0.25f + (high - low) * hiss_level * 0.12f;
    }
    for (Voice& v : voices) {
        for (int i = 0; i < frames && v.t < v.dur; i++) {
            if (v.delay > 0) { v.delay -= 1.0f / rate; continue; }
            const float k = v.t / v.dur, f = v.freq + (v.freq_end - v.freq) * k, ph = std::fmod(v.t * f, 1.0f);
            float s;
            if (v.wave == 0) s = ph < 0.5f ? 1.0f : -1.0f;
            else if (v.wave == 1) s = 4.0f * std::fabs(ph - 0.5f) - 1.0f;
            else if (v.wave == 2) s = std::sin(ph * 6.2831853f);
            else { noise_seed = noise_seed * 1664525u + 1013904223u; s = (noise_seed >> 9) / 4194304.0f - 1.0f; }
            buf[i] += s * v.vol * (1.0f - k) * (1.0f - k);
            v.t += 1.0f / rate;
        }
    }
    voices.erase(std::remove_if(voices.begin(), voices.end(), [](const Voice& v) { return v.t >= v.dur; }), voices.end());
    for (float& s : buf) s = std::max(-1.0f, std::min(1.0f, s));
    xl::audio_push(buf.data(), frames);
}

// ---------- state ----------

struct GpuMesh { sg_buffer vbuf{}, ibuf{}; int count = 0; bool ready = false; };

enum ParticleKind { DUST, SPARK, SHARD, SMOKE };
struct Particle { HMM_Vec3 p, v; float life, max_life, size, spin; ParticleKind kind; HMM_Vec3 color; };

struct Dialogue {
    bool open = false;
    int line = 0;
    float shown = 0;      // characters revealed so far
    float idle = 0;       // seconds since the line was fully shown
};

struct {
    Track track;
    std::unique_ptr<Game> game;
    std::vector<GpuMesh> chunks;
    GpuMesh chariot, wheel, rider, iris, lid, guide, pot, shard, puff, tumbleweed, handcart;
    GpuMesh artifacts[6];
    sg_pipeline shadow_pip, lit_pip, sky_pip, post_pip;
    sg_image shadow_depth{};
    sg_view shadow_att{}, shadow_tex{};
    sg_sampler shadow_smp{}, post_smp{};
    sg_image scene_msaa{}, scene_resolve{}, scene_depth{};
    sg_view scene_msaa_att{}, scene_resolve_att{}, scene_depth_att{}, scene_tex{};
    int scene_w = 0, scene_h = 0;
    sgl_context hud;
    sgl_pipeline hud_blend;
    xl::txt::Text text;
    bool zo = false;              // WebGPU's clip space has z in 0..1

    bool waiting = true;          // the title over the desert until the first press
    bool autopilot = false;
    float time = 0, accumulator = 0;
    float cam_yaw = 0, zoom = 1, intro = 1;
    HMM_Vec3 cam_target{};
    HMM_Vec3 guide_at{};
    float guide_yaw = 0;
    float shake = 0;
    float blink = 0, next_blink = 2, squint = 0;
    float roll = 0, bob = 0;
    std::vector<Particle> particles;
    std::vector<float> artifact_gone;        // seconds since each artifact was collected (< 0 while it's there)
    std::vector<bool> pot_was_broken;
    Dialogue talk;
    std::string title;                       // the place just reached
    float title_timer = 0;
    std::string objective;
    std::string notice;                      // "Out of fuel!" and friends
    float notice_timer = 0;
    float best_time = 0;
    HMM_Vec2 car_screen = { { 0.5f, 0.5f } }, guide_screen = { { 0.5f, 0.5f } };

    bool key_gas = false, key_brake = false, key_left = false, key_right = false;
    bool advance = false, restart = false;
} st;

GpuMesh upload(const Mesh& m) {
    GpuMesh g;
    sg_buffer_desc vb = {};
    vb.usage.vertex_buffer = true;
    vb.data = { m.vertices.data(), m.vertices.size() * sizeof(Vertex) };
    g.vbuf = sg_make_buffer(&vb);
    sg_buffer_desc ib = {};
    ib.usage.index_buffer = true;
    ib.data = { m.indices.data(), m.indices.size() * sizeof(uint32_t) };
    g.ibuf = sg_make_buffer(&ib);
    g.count = static_cast<int>(m.indices.size());
    g.ready = true;
    return g;
}

void ensure_chunk(int i) {
    if (i < 0 || i >= static_cast<int>(st.chunks.size()) || st.chunks[i].ready) return;
    st.chunks[i] = upload(build_chunk(st.track, i * CHUNK, std::min(st.track.length, (i + 1) * CHUNK)));
}

HMM_Vec3 lin(uint32_t hex) {
    const auto c = [](float v) { return std::pow(v, 2.2f); };
    return HMM_V3(c(((hex >> 16) & 255) / 255.0f), c(((hex >> 8) & 255) / 255.0f), c((hex & 255) / 255.0f));
}
HMM_Vec4 v4(HMM_Vec3 v, float w = 1) { return HMM_V4(v.X, v.Y, v.Z, w); }
float rnd(float a, float b) { return a + (b - a) * (std::rand() / static_cast<float>(RAND_MAX)); }

void spawn(ParticleKind kind, HMM_Vec3 p, HMM_Vec3 v, float life, float size, HMM_Vec3 color) {
    if (st.particles.size() > 400) return;
    st.particles.push_back({ p, v, life, life, size, 0, kind, color });
}

std::string clock(float t) {
    char b[32];
    const int m = static_cast<int>(t / 60);
    std::snprintf(b, sizeof b, "%d:%02d", m, static_cast<int>(t - m * 60));
    return b;
}

// ---------- the journey ----------

void restart_journey() {
    st.game->reset();
    st.artifact_gone.assign(st.track.artifacts.size(), -1.0f);
    st.pot_was_broken.assign(st.game->pots.size(), false);
    st.particles.clear();
    st.talk = Dialogue{};
    st.objective.clear();
    st.title_timer = st.notice_timer = 0;
    st.intro = 1;
}

/** The next stop's place name and how far it is ("The Granary  120 m"). */
std::string next_place() {
    const std::vector<Stop>& stops = chapter_one();
    const Journey& j = st.game->j;
    for (int k = j.stop; k < static_cast<int>(stops.size()); k++) {
        if (stops[k].place[0] == 0) continue;
        return std::string(stops[k].place) + "  " + std::to_string(std::max(0, static_cast<int>(stops[k].s - j.s))) + " m";
    }
    return "";
}

void on_events() {
    Game& g = *st.game;
    const Journey& j = g.j;
    const Car& c = g.car;
    const uint32_t e = j.events;
    if (e & EV_LAND) {
        play(80, 40, 0.4f, 0.4f, 2); play(200, 60, 0.3f, 0.3f, 3);
        st.shake = 0.8f; st.squint = 0.8f;
        xl::rumble(0.8f, 0.5f, 220, true);
        for (int i = 0; i < 18; i++) { const float a = rnd(0, 6.283f); spawn(DUST, HMM_V3(c.x + std::cos(a) * 0.9f, c.y + 0.1f, c.z + std::sin(a) * 0.9f), HMM_V3(std::cos(a) * rnd(2.5f, 4.5f), rnd(0.2f, 0.8f), std::sin(a) * rnd(2.5f, 4.5f)), 0.9f, rnd(0.12f, 0.22f), HMM_V3(0.85f, 0.68f, 0.48f)); }
    }
    if (e & EV_STOP) {
        st.talk = Dialogue{};
        st.talk.open = true;
        const Stop& s = chapter_one()[j.stop];
        if (s.place[0]) { st.title = s.place; st.title_timer = 3.2f; play(523, 523, 0.3f, 0.1f, 1); play(784, 784, 0.4f, 0.1f, 1, 0.12f); }
    }
    if (e & EV_ARTIFACT) {
        play(1320, 1320, 0.08f, 0.12f, 1); play(1760, 1760, 0.2f, 0.12f, 1, 0.07f);
        xl::rumble(0.0f, 0.2f, 40);
    }
    if (e & EV_BONK) {
        const float k = std::min(1.0f, j.bonk / 10.0f);
        play(90, 40, 0.25f, 0.25f + 0.25f * k, 3); play(70, 50, 0.2f, 0.3f * k, 2);
        st.shake = std::max(st.shake, 0.3f + 0.7f * k); st.squint = 0.6f;
        xl::rumble(0.4f + 0.6f * k, 0.3f, 160, true);
        for (int i = 0; i < 8; i++) spawn(SMOKE, HMM_V3(j.event_at.x, c.y + 0.4f, j.event_at.z), HMM_V3(rnd(-2, 2), rnd(0.5f, 2), rnd(-2, 2)), 0.7f, 0.25f, HMM_V3(0.85f, 0.75f, 0.6f));
    }
    if (e & EV_POTHOLE) {
        play(110, 50, 0.18f, 0.35f, 2); play(300, 120, 0.12f, 0.15f, 3);
        st.shake = std::max(st.shake, 0.35f); st.squint = 0.4f;
        xl::rumble(0.5f, 0.2f, 90, true);
        for (int i = 0; i < 6; i++) spawn(DUST, HMM_V3(j.event_at.x, c.y + 0.1f, j.event_at.z), HMM_V3(rnd(-1, 1), rnd(0.5f, 1.5f), rnd(-1, 1)), 0.7f, 0.2f, HMM_V3(0.7f, 0.5f, 0.35f));
    }
    if (e & EV_TUMBLE) play(400, 200, 0.12f, 0.12f, 3);
    if (e & EV_POT_HIT) { play(300, 150, 0.12f, 0.2f, 3); xl::rumble(0.2f, 0.4f, 60); }
    if (e & EV_FALL) { play(500, 60, 0.9f, 0.2f, 1); st.squint = 1.2f; st.notice = "Whoops! Off the edge."; st.notice_timer = 2.2f; }
    if (e & EV_OUT_OF_FUEL) { play(300, 100, 0.8f, 0.2f, 1); st.notice = "Out of fuel! Back to the last checkpoint."; st.notice_timer = 2.5f; }
    if (e & EV_RESPAWN) play(440, 880, 0.25f, 0.12f, 1);
    if (e & EV_COMPLETE) {
        for (int i = 0; i < 5; i++) play(523 * std::pow(1.19f, static_cast<float>(i)), 523 * std::pow(1.19f, static_cast<float>(i)), 0.35f, 0.14f, 1, i * 0.11f);
        if (st.best_time == 0 || j.time < st.best_time) { st.best_time = j.time; char b[32]; std::snprintf(b, sizeof b, "%.2f", j.time); xl::save("best", b); }
        for (int i = 0; i < 60; i++) spawn(SPARK, HMM_V3(c.x, c.y + 2.5f, c.z), HMM_V3(rnd(-4, 4), rnd(3, 8), rnd(-4, 4)), 1.4f, 0.07f, HMM_V3(rnd(3, 6), rnd(2, 4), rnd(0.5f, 2)));
    }
    for (size_t i = 0; i < g.pots.size(); i++) {
        const Pot& p = g.pots[i];
        if (p.broken && !st.pot_was_broken[i]) {
            st.pot_was_broken[i] = true;
            play(2400, 600, 0.22f, 0.22f, 3); play(180, 90, 0.15f, 0.2f, 2);
            for (int k = 0; k < 10; k++) spawn(SHARD, HMM_V3(p.x, p.y + 0.15f, p.z), HMM_V3(rnd(-3, 3), rnd(2, 5), rnd(-3, 3)), 1.6f, 1.0f, HMM_V3(1, 1, 1));
        }
    }
    for (size_t i = 0; i < g.taken.size(); i++) {
        if (g.taken[i] && st.artifact_gone[i] < 0) {
            st.artifact_gone[i] = 0;
            const Artifact& a = st.track.artifacts[i];
            const float y = st.track.height(a.x, a.z, a.s) + 0.7f;
            for (int k = 0; k < 10; k++) spawn(SPARK, HMM_V3(a.x, y, a.z), HMM_V3(rnd(-2, 2), rnd(1.5f, 3.5f), rnd(-2, 2)), 0.6f, 0.05f, HMM_V3(5, 3.6f, 1.2f));
        }
    }
}

Input read_input() {
    if (st.autopilot) return autopilot(*st.game);
    Input in;
    const bool keys = xl::focused();
    float throttle = (keys && st.key_gas ? 1.0f : 0.0f) - (keys && st.key_brake ? 1.0f : 0.0f);
    float steer = (keys && st.key_right ? 1.0f : 0.0f) - (keys && st.key_left ? 1.0f : 0.0f);
    const xl::Gamepad& pad = xl::gamepad();
    if (pad.connected) {
        if (std::fabs(pad.lx) > 0.1f) steer = pad.lx;
        if (pad.down(xl::PAD_RIGHT)) steer = 1;
        if (pad.down(xl::PAD_LEFT)) steer = -1;
        if (pad.down(xl::PAD_RT)) throttle = 1;
        if (pad.down(xl::PAD_LT) || pad.down(xl::PAD_B)) throttle = -1;
        if (pad.pressed(xl::PAD_A)) st.advance = true;
        if (pad.pressed(xl::PAD_START)) st.restart = true;
    }
    in.throttle = throttle;
    in.steer = steer;
    return in;
}

/** Moves the dialogue on: finish revealing the line, or go to the next, or close it. */
void advance_dialogue() {
    Game& g = *st.game;
    if (!st.talk.open || g.j.phase != Phase::Talking) return;
    const Stop& s = chapter_one()[g.j.stop];
    const size_t len = std::strlen(s.lines[st.talk.line].text);
    if (st.talk.shown < len) { st.talk.shown = static_cast<float>(len); return; }
    if (st.talk.line + 1 < static_cast<int>(s.lines.size())) { st.talk.line++; st.talk.shown = 0; st.talk.idle = 0; play(660, 660, 0.04f, 0.05f, 1); return; }
    st.talk.open = false;
    st.objective = s.objective;
    g.finish_talking();
    on_events();
}

// ---------- drawing ----------

struct Frame {
    HMM_Mat4 view_proj, light_vp;
    float zscale, zoff;
    bool shadow_pass;
};
Frame frame_info;

void draw(const GpuMesh& m, const HMM_Mat4& model, HMM_Vec3 tint = HMM_V3(1, 1, 1)) {
    if (!m.ready) return;
    sg_bindings b = {};
    b.vertex_buffers[0] = m.vbuf;
    b.index_buffer = m.ibuf;
    if (frame_info.shadow_pass) {
        sg_apply_bindings(&b);
        shadow_params_t p = {};
        p.light_mvp = HMM_MulM4(frame_info.light_vp, model);
        sg_apply_uniforms(UB_shadow_params, SG_RANGE(p));
    } else {
        b.views[VIEW_shadow_tex] = st.shadow_tex;
        b.samplers[SMP_shadow_smp] = st.shadow_smp;
        sg_apply_bindings(&b);
        lit_vs_params_t p = {};
        p.view_proj = frame_info.view_proj;
        p.model = model;
        p.light_vp = frame_info.light_vp;
        p.tint = v4(tint);
        p.depth_map = HMM_V4(frame_info.zscale, frame_info.zoff, st.time, 0);
        sg_apply_uniforms(UB_lit_vs_params, SG_RANGE(p));
    }
    sg_draw(0, m.count, 1);
}

HMM_Mat4 T(float x, float y, float z) { return HMM_Translate(HMM_V3(x, y, z)); }
HMM_Mat4 R(float a, float x, float y, float z) { return HMM_Rotate_RH(a, HMM_V3(x, y, z)); }
HMM_Mat4 S(float s) { return HMM_Scale(HMM_V3(s, s, s)); }
HMM_Mat4 mul(std::initializer_list<HMM_Mat4> ms) { HMM_Mat4 r = HMM_M4D(1); for (const HMM_Mat4& m : ms) r = HMM_MulM4(r, m); return r; }

/** The land near s: the chunks from `behind` metres back to `ahead` metres on. */
void draw_land(float s, float behind, float ahead) {
    const int a = std::max(0, static_cast<int>((s - behind) / CHUNK)), b = std::min(static_cast<int>(st.chunks.size()) - 1, static_cast<int>((s + ahead) / CHUNK));
    for (int i = a; i <= b; i++) draw(st.chunks[i], HMM_M4D(1));
}

/** Everything that moves, in both passes. */
void draw_dynamic(float near_s) {
    const Game& g = *st.game;
    const Car& c = g.car;
    const Journey& j = g.j;
    const Track& t = st.track;
    const bool flicker = j.ghost > 0 && std::fmod(st.time, 0.16f) < 0.05f;
    if (!flicker && !(j.phase == Phase::Respawning && c.y < t.elevation(j.s) - 4)) {
        // the chariot follows the slope of the road
        const Sample here = t.at(j.s);
        const float slope = std::atan2(t.elevation(j.s + 1) - t.elevation(j.s - 1), 2.0f) * (std::cos(c.yaw) * here.tx + std::sin(c.yaw) * here.tz);
        const float jolt = c.jolt * 0.12f * std::sin(st.time * 40);
        const HMM_Mat4 body = mul({ T(c.x, c.y, c.z), R(-c.yaw, 0, 1, 0), R(st.roll + jolt, 1, 0, 0), R(slope, 0, 0, 1) });
        draw(st.chariot, body);
        draw(st.wheel, mul({ body, T(WHEEL_AT.x, WHEEL_AT.y, WHEEL_AT.z), R(-c.wheel, 0, 0, 1) }));
        draw(st.wheel, mul({ body, T(WHEEL_AT.x, WHEEL_AT.y, -WHEEL_AT.z), R(HMM_PI32, 0, 1, 0), R(c.wheel, 0, 0, 1) }));
        const HMM_Mat4 rider = mul({ body, T(RIDER_HIP.x, RIDER_HIP.y + st.bob, RIDER_HIP.z), R(-c.steer * 0.14f - st.roll * 0.8f, 1, 0, 0), T(-RIDER_HIP.x, -RIDER_HIP.y, -RIDER_HIP.z) });
        draw(st.rider, rider);
        if (!frame_info.shadow_pass) {
            // she looks where she steers, or at the Guide while he talks
            float glance = -c.steer * 0.35f;
            if (st.talk.open && j.stop + 1 == static_cast<int>(chapter_one().size())) glance = 0.4f;
            const float lid = LID_OPEN + (LID_SHUT - LID_OPEN) * std::max(st.blink, std::min(1.0f, st.squint) * 0.55f);
            for (int s = -1; s <= 1; s += 2) {
                const HMM_Mat4 eye = mul({ rider, T(EYE_AT.x, EYE_AT.y, s * EYE_AT.z) });
                draw(st.iris, mul({ eye, R(glance, 0, 1, 0) }));
                draw(st.lid, mul({ eye, R(lid, 0, 0, 1) }));
            }
        }
    }
    // the Guide waits in the plaza
    if (near_s > ROAD_END - 120) {
        const float sway = std::sin(st.time * 1.3f) * 0.02f;
        draw(st.guide, mul({ T(st.guide_at.X, st.guide_at.Y, st.guide_at.Z), R(-st.guide_yaw, 0, 1, 0), R(sway, 1, 0, 0) }));
    }
    // artifacts float and spin; collected ones fly up and shrink
    for (size_t i = 0; i < t.artifacts.size(); i++) {
        const Artifact& a = t.artifacts[i];
        if (a.s < near_s - 40 || a.s > near_s + 80) continue;
        const float gone = st.artifact_gone[i];
        if (gone > 0.35f) continue;
        const float y = t.height(a.x, a.z, a.s) + 0.75f + 0.1f * std::sin(st.time * 2.5f + i) + (gone > 0 ? gone * 6 : 0), s = (gone > 0 ? 1 - gone / 0.35f : 1) * 1.4f;
        draw(st.artifacts[static_cast<int>(a.kind)], mul({ T(a.x, y, a.z), R(st.time * 1.6f + i * 0.7f, 0, 1, 0), S(s) }));
    }
    for (const Pot& p : g.pots) {
        if (p.broken) continue;
        const float y = p.hit ? p.y : t.height(p.x, p.z, j.s) + 0.03f;
        draw(st.pot, mul({ T(p.x, y, p.z), R(p.spin, 1, 0, 0.4f), R(p.spin * 0.7f, 0, 1, 0) }));
    }
    for (const Tumbleweed& w : g.tumbleweeds) draw(st.tumbleweed, mul({ T(w.x, t.height(w.x, w.z, j.s) + 0.4f + 0.15f * std::fabs(std::sin(w.spin * 1.3f)), w.z), R(w.spin, w.vz, 0, -w.vx) }));
    for (const Mover& m : t.movers) {
        if (m.s < near_s - 40 || m.s > near_s + 80) continue;
        float yaw = 0;
        const V2 p = t.mover_at(m, g.clock, &yaw);
        draw(st.handcart, mul({ T(p.x, t.elevation(m.s), p.z), R(yaw, 0, 1, 0) }));
    }
    if (frame_info.shadow_pass) return;
    for (const Particle& p : st.particles) {
        const float k = p.life / p.max_life;
        if (p.kind == SHARD) { draw(st.shard, mul({ T(p.p.X, p.p.Y, p.p.Z), R(p.spin, 0.3f, 1, 0.5f) })); continue; }
        const float grow = p.kind == SPARK ? k : (1.0f + (1 - k) * 1.2f) * std::min(1.0f, k * 2.5f);
        const float fade = 1.0f;
        draw(st.puff, mul({ T(p.p.X, p.p.Y, p.p.Z), HMM_Scale(HMM_V3(p.size * grow, p.size * grow * (p.kind == SPARK ? 1.0f : 0.75f), p.size * grow)) }), HMM_MulV3F(p.color, fade));
    }
}

void update_particles(float dt) {
    for (Particle& p : st.particles) {
        p.life -= dt;
        if (p.kind == SPARK || p.kind == SHARD) p.v.Y -= 14 * dt;
        else { p.v = HMM_MulV3F(p.v, std::exp(-2.5f * dt)); p.v.Y += 0.3f * dt; }
        p.p = HMM_AddV3(p.p, HMM_MulV3F(p.v, dt));
        if (p.kind == SHARD) {
            p.spin += dt * 9;
            const float ground = st.track.height(p.p.X, p.p.Z, st.game->j.s) + 0.03f;
            if (p.p.Y < ground) { p.p.Y = ground; p.v = HMM_V3(p.v.X * 0.5f, -p.v.Y * 0.3f, p.v.Z * 0.5f); }
        }
    }
    st.particles.erase(std::remove_if(st.particles.begin(), st.particles.end(), [](const Particle& p) { return p.life <= 0; }), st.particles.end());
    for (float& g : st.artifact_gone) if (g >= 0) g += dt;
}

/** (Re)creates the MSAA scene target and its resolve texture at the framebuffer's size. */
void ensure_scene(int w, int h) {
    if (w == st.scene_w && h == st.scene_h) return;
    if (st.scene_w) {
        for (sg_view v : { st.scene_msaa_att, st.scene_resolve_att, st.scene_depth_att, st.scene_tex }) sg_destroy_view(v);
        for (sg_image i : { st.scene_msaa, st.scene_resolve, st.scene_depth }) sg_destroy_image(i);
    }
    st.scene_w = w; st.scene_h = h;
    const sg_environment env = sglue_environment();
    sg_image_desc img = {};
    img.usage.color_attachment = true;
    img.width = w; img.height = h;
    img.pixel_format = env.defaults.color_format;
    img.sample_count = MSAA;
    st.scene_msaa = sg_make_image(&img);
    sg_image_desc res = img;
    res.usage = {};
    res.usage.resolve_attachment = true;
    res.sample_count = 1;
    st.scene_resolve = sg_make_image(&res);
    sg_image_desc depth = img;
    depth.usage = {};
    depth.usage.depth_stencil_attachment = true;
    depth.pixel_format = SG_PIXELFORMAT_DEPTH;
    st.scene_depth = sg_make_image(&depth);
    sg_view_desc v = {};
    v.color_attachment.image = st.scene_msaa;
    st.scene_msaa_att = sg_make_view(&v);
    v = {};
    v.resolve_attachment.image = st.scene_resolve;
    st.scene_resolve_att = sg_make_view(&v);
    v = {};
    v.depth_stencil_attachment.image = st.scene_depth;
    st.scene_depth_att = sg_make_view(&v);
    v = {};
    v.texture.image = st.scene_resolve;
    st.scene_tex = sg_make_view(&v);
}

// ---------- the HUD and the dialogue ----------

void rect(float x0, float y0, float x1, float y1, float r, float g, float b, float a) {
    sgl_begin_quads();
    sgl_c4f(r, g, b, a);
    sgl_v2f(x0, y0); sgl_v2f(x1, y0); sgl_v2f(x1, y1); sgl_v2f(x0, y1);
    sgl_end();
}

/** A rounded panel: a cross of rectangles and four quarter discs. */
void panel(float x0, float y0, float x1, float y1, float rad, float r, float g, float b, float a) {
    rad = std::min(rad, std::min(x1 - x0, y1 - y0) / 2);
    rect(x0 + rad, y0, x1 - rad, y1, r, g, b, a);
    rect(x0, y0 + rad, x0 + rad, y1 - rad, r, g, b, a);
    rect(x1 - rad, y0 + rad, x1, y1 - rad, r, g, b, a);
    const float cx[4] = { x0 + rad, x1 - rad, x1 - rad, x0 + rad }, cy[4] = { y0 + rad, y0 + rad, y1 - rad, y1 - rad };
    for (int c = 0; c < 4; c++) {
        sgl_begin_triangles();
        sgl_c4f(r, g, b, a);
        for (int i = 0; i < 8; i++) {
            const float a0 = (c + 2) * 1.5708f + i * 1.5708f / 8, a1 = a0 + 1.5708f / 8;
            sgl_v2f(cx[c], cy[c]); sgl_v2f(cx[c] + std::cos(a0) * rad, cy[c] + std::sin(a0) * rad); sgl_v2f(cx[c] + std::cos(a1) * rad, cy[c] + std::sin(a1) * rad);
        }
        sgl_end();
    }
}

/** A speech bubble over a point on screen (pixels), with a tail pointing down at it. */
void bubble(float px, float py, const std::string& who, const std::string& full, const std::string& text, float w, float h, float s, Rgb name_col) {
    const xl::txt::Text& Tx = st.text;
    const float px_size = 16 * s, max_w = std::min(420 * s, w * 0.42f);
    const std::vector<std::string> sized = Tx.wrap(full, px_size, max_w);   // the bubble is sized for the whole line
    float bw = Tx.width(who, 13 * s);
    for (const std::string& l : sized) bw = std::max(bw, Tx.width(l, px_size));
    bw += 28 * s;
    const float bh = (24 + 21 * sized.size()) * s + 14 * s;
    const float x0 = std::max(10 * s, std::min(w - bw - 10 * s, px - bw / 2)), y1 = std::max(bh + 70 * s, std::min(h * 0.62f, py - 18 * s));
    const float y0 = y1 - bh;
    panel(x0 + 3 * s, y0 + 4 * s, x0 + bw + 3 * s, y1 + 4 * s, 14 * s, 0.1f, 0.06f, 0.04f, 0.25f);
    panel(x0, y0, x0 + bw, y1, 14 * s, 1.0f, 0.98f, 0.93f, 0.96f);
    sgl_begin_triangles();
    sgl_c4f(1.0f, 0.98f, 0.93f, 0.96f);
    const float tx = std::max(x0 + 20 * s, std::min(x0 + bw - 20 * s, px));
    sgl_v2f(tx - 10 * s, y1); sgl_v2f(tx + 10 * s, y1); sgl_v2f(px, std::max(y1 + 6 * s, std::min(py, y1 + 22 * s)));
    sgl_end();
    Tx.draw(who, x0 + 14 * s, y0 + 9 * s, 13 * s, name_col, xl::txt::LEFT, 1, false);
    float y = y0 + 28 * s;
    for (const std::string& l : Tx.wrap(text, px_size, max_w)) { Tx.draw(l, x0 + 14 * s, y, px_size, { 0.18f, 0.12f, 0.1f }, xl::txt::LEFT, 1, false); y += 21 * s; }
}

void draw_dialogue(float w, float h, float s) {
    const Game& g = *st.game;
    if (!st.talk.open || g.j.phase != Phase::Talking) return;
    const Stop& stop = chapter_one()[g.j.stop];
    const Line& line = stop.lines[st.talk.line];
    const std::string full = line.text, text = full.substr(0, static_cast<size_t>(st.talk.shown));
    const xl::txt::Text& Tx = st.text;
    const float pulse = 0.5f + 0.5f * std::sin(st.time * 5);
    if (line.who == Speaker::Narrator) {
        // the narrator: a parchment card along the bottom
        const float cw = std::min(760 * s, w - 40 * s), x0 = w / 2 - cw / 2;
        const std::vector<std::string> lines = Tx.wrap(full, 17 * s, cw - 48 * s);
        const float ch = (40 + 23 * lines.size()) * s + 18 * s, y0 = h - ch - 26 * s;
        panel(x0 + 4 * s, y0 + 5 * s, x0 + cw + 4 * s, y0 + ch + 5 * s, 16 * s, 0.1f, 0.06f, 0.04f, 0.3f);
        panel(x0, y0, x0 + cw, y0 + ch, 16 * s, 0.98f, 0.92f, 0.78f, 0.95f);
        rect(x0 + 18 * s, y0 + 32 * s, x0 + cw - 18 * s, y0 + 33.5f * s, 0.75f, 0.55f, 0.3f, 0.6f);
        Tx.draw("NARRATOR", x0 + 24 * s, y0 + 10 * s, 14 * s, { 0.72f, 0.36f, 0.12f }, xl::txt::LEFT, 1, false);
        float y = y0 + 42 * s;
        for (const std::string& l : Tx.wrap(text, 17 * s, cw - 48 * s)) { Tx.draw(l, x0 + 24 * s, y, 17 * s, { 0.2f, 0.13f, 0.08f }, xl::txt::LEFT, 1, false); y += 23 * s; }
        Tx.draw("space", x0 + cw - 24 * s, y0 + ch - 24 * s, 12 * s, { 0.6f, 0.4f, 0.2f }, xl::txt::RIGHT, 0.5f + 0.5f * pulse, false);
    } else {
        const bool guide = line.who == Speaker::Guide;
        const HMM_Vec2 at = guide ? st.guide_screen : st.car_screen;
        bubble(at.X * w, (1 - at.Y) * h, speaker_name(line.who), full, text, w, h, s, guide ? Rgb{ 0.82f, 0.4f, 0.1f } : Rgb{ 0.75f, 0.52f, 0.05f });
        Tx.draw("space to continue", w / 2, h - 30 * s, 13 * s, { 1, 1, 1 }, xl::txt::CENTRE, 0.5f + 0.5f * pulse);
    }
}

void draw_hud(float w, float h) {
    sgl_set_context(st.hud);
    sgl_defaults();
    sgl_load_pipeline(st.hud_blend);
    sgl_matrix_mode_projection();
    sgl_ortho(0, w, h, 0, -1, 1);
    sgl_matrix_mode_modelview();
    sgl_load_identity();
    const float s = sapp_dpi_scale();
    const xl::txt::Text& Tx = st.text;
    const Rgb white = { 1, 1, 1 }, gold = { 1.0f, 0.82f, 0.32f }, pale = { 0.9f, 0.92f, 1.0f }, saffron = { 1.0f, 0.62f, 0.22f };
    const Game& g = *st.game;
    const Journey& j = g.j;
    const float pulse = 0.5f + 0.5f * std::sin(st.time * 5);

    if (st.waiting) {
        const float a = std::min(1.0f, st.time * 1.2f);
        Tx.draw("JYOTIRATH", w / 2, h * 0.12f, 56 * s, gold, xl::txt::CENTRE, a);
        Tx.draw("Chapter I - Mohenjo-Daro", w / 2, h * 0.12f + 64 * s, 20 * s, pale, xl::txt::CENTRE, a);
        const std::string start = xl::focused() || xl::gamepad().connected ? "PRESS W TO BEGIN" : "CLICK TO PLAY";
        Tx.draw(start, w / 2, h * 0.78f, 26 * s, { 0.8f + 0.2f * pulse, 0.8f + 0.2f * pulse, 1.0f }, xl::txt::CENTRE);
        Tx.draw("W gas   S brake   A / D steer   space talk", w / 2, h * 0.78f + 36 * s, 14 * s, pale, xl::txt::CENTRE);
        sgl_set_context(sgl_default_context());
        return;
    }

    // top left: the chapter, what to do, where's next
    const float x = 18 * s, y = 14 * s;
    Tx.draw("Chapter I - Mohenjo-Daro", x, y, 15 * s, pale);
    if (!st.objective.empty() && j.phase == Phase::Driving) {
        std::string obj = st.objective;
        if (j.stop == 1) obj += "  (" + std::to_string(std::max(0, std::min(30, static_cast<int>(j.s - 4)))) + " / 30 m)";
        Tx.draw(obj, x, y + 22 * s, 22 * s, white);
        const std::string next = next_place();
        if (!next.empty() && j.stop >= 2) Tx.draw(next, x, y + 50 * s, 14 * s, gold);
    }
    // top centre: fuel; artifacts beneath
    const float bw = std::min(240.0f * s, w * 0.28f), bx = w / 2 - bw / 2, by = 22 * s;
    const bool low = j.fuel < 0.2f;
    panel(bx - 4 * s, by - 4 * s, bx + bw + 4 * s, by + 16 * s, 8 * s, 0.08f, 0.05f, 0.1f, 0.6f);
    const float fw = bw * std::max(0.0f, std::min(1.0f, j.fuel));
    if (fw > 1) panel(bx, by, bx + fw, by + 12 * s, 6 * s, 1.0f, low ? 0.3f + 0.3f * pulse : 0.66f, 0.2f, 1);
    Tx.draw("FUEL", w / 2, by + 18 * s, 13 * s, low ? Rgb{ 1.0f, 0.4f, 0.3f } : pale, xl::txt::CENTRE);
    Tx.draw("artifacts " + std::to_string(j.artifacts) + " / " + std::to_string(st.track.artifacts.size()), w / 2, by + 36 * s, 14 * s, gold, xl::txt::CENTRE);

    // a title for the place you've reached
    if (st.title_timer > 0) {
        const float k = std::min(1.0f, (3.2f - st.title_timer) * 4), a = std::min(1.0f, st.title_timer * 1.5f);
        Tx.draw(st.title, w / 2, h * 0.17f, 42 * s * (1 + 0.15f * (1 - k)), saffron, xl::txt::CENTRE, a);
    }
    if (st.notice_timer > 0) Tx.draw(st.notice, w / 2, h * 0.36f, 28 * s, white, xl::txt::CENTRE, std::min(1.0f, st.notice_timer * 2));
    draw_dialogue(w, h, s);

    if (j.phase == Phase::Complete) {
        const float cw = std::min(560 * s, w - 40 * s), ch = 230 * s, x0 = w / 2 - cw / 2, y0 = h * 0.18f;
        panel(x0, y0, x0 + cw, y0 + ch, 18 * s, 0.98f, 0.92f, 0.78f, 0.95f);
        Tx.draw("CHAPTER I COMPLETE", w / 2, y0 + 18 * s, 34 * s, saffron, xl::txt::CENTRE);
        Tx.draw("Mohenjo-Daro", w / 2, y0 + 60 * s, 18 * s, { 0.45f, 0.28f, 0.12f }, xl::txt::CENTRE, 1, false);
        Tx.draw("artifacts " + std::to_string(j.artifacts) + " / " + std::to_string(st.track.artifacts.size()) + "    time " + clock(j.time) + (st.best_time > 0 ? "    best " + clock(st.best_time) : ""), w / 2, y0 + 96 * s, 16 * s, { 0.25f, 0.16f, 0.1f }, xl::txt::CENTRE, 1, false);
        Tx.draw("Next: Checkpoint 2, the Ajanta Caves (coming soon)", w / 2, y0 + 134 * s, 16 * s, { 0.55f, 0.3f, 0.1f }, xl::txt::CENTRE, 1, false);
        Tx.draw("R to drive it again", w / 2, y0 + 180 * s, 16 * s, { 0.4f, 0.25f, 0.12f }, xl::txt::CENTRE, 0.6f + 0.4f * pulse, false);
    }
    sgl_set_context(sgl_default_context());
}

// ---------- frame ----------

HMM_Vec2 to_screen(HMM_Vec3 p) {
    const HMM_Vec4 c = HMM_MulM4V4(frame_info.view_proj, HMM_V4(p.X, p.Y, p.Z, 1));
    if (c.W <= 0) return HMM_V2(-1, -1);
    return HMM_V2(c.X / c.W * 0.5f + 0.5f, c.Y / c.W * 0.5f + 0.5f);
}

float wrap(float a) { while (a > HMM_PI32) a -= 2 * HMM_PI32; while (a < -HMM_PI32) a += 2 * HMM_PI32; return a; }

void frame() {
    if (xl::paused()) return;
    const float dt = std::min(0.1f, static_cast<float>(sapp_frame_duration()));
    xl::report_frame(dt);
    st.time += dt;
    Game& g = *st.game;

    const Input in = read_input();
    xl::end_frame();
    if (st.waiting && (in.throttle > 0 || st.advance)) { st.waiting = false; st.advance = false; }
    if (st.restart) { st.restart = false; restart_journey(); st.waiting = false; }

    if (!st.waiting) {
        if (st.advance) { st.advance = false; advance_dialogue(); }
        if (st.talk.open && g.j.phase == Phase::Talking) {
            const Stop& stop = chapter_one()[g.j.stop];
            const float len = static_cast<float>(std::strlen(stop.lines[st.talk.line].text));
            const float before = st.talk.shown;
            st.talk.shown = std::min(len, st.talk.shown + dt * 55);
            if (st.talk.shown >= len) st.talk.idle += dt;
            if (static_cast<int>(st.talk.shown / 3) != static_cast<int>(before / 3) && st.talk.shown < len) play(stop.lines[st.talk.line].who == Speaker::Narrator ? 520.0f : 760.0f, 700, 0.025f, 0.025f, 1);
            if (st.autopilot && st.talk.idle > 0.3f) advance_dialogue();
        }
        st.accumulator = std::min(st.accumulator + dt, DT * 12);
        while (st.accumulator >= DT) {
            st.accumulator -= DT;
            g.step(in, DT);
            on_events();
        }
    }
    update_particles(dt);
    st.title_timer = std::max(0.0f, st.title_timer - dt);
    st.notice_timer = std::max(0.0f, st.notice_timer - dt);
    st.shake = std::max(0.0f, st.shake - dt * 2.2f);
    st.squint = std::max(0.0f, st.squint - dt);

    // build the land ahead before we get there: one chunk a frame
    {
        const int here = static_cast<int>(g.j.s / CHUNK);
        for (int i = here - 1; i <= here + 3; i++) if (i >= 0 && i < static_cast<int>(st.chunks.size()) && !st.chunks[i].ready) { ensure_chunk(i); break; }
    }

    // the charioteer's life: blinks, lean, bob
    const Car& c = g.car;
    st.next_blink -= dt;
    if (st.next_blink <= 0) { st.blink = 1; st.next_blink = 1.8f + rnd(0, 3.2f); }
    st.blink = std::max(0.0f, st.blink - dt * 7);
    const float speed = std::sqrt(c.vx * c.vx + c.vz * c.vz);
    st.roll += ((c.yaw_rate * speed * 0.012f) - st.roll) * std::min(1.0f, dt * 6);
    const Surface surf = st.track.surface(c.x, c.z, g.j.s);
    st.bob = std::sin(st.time * 13) * 0.012f * std::min(1.0f, speed / 8) * (surf == Surface::Ground ? 2.0f : 1.0f);

    // dust from the wheels on sand and in drifts
    if (g.j.phase == Phase::Driving && speed > 3 && (surf == Surface::Ground || c.drifting) && std::fmod(st.time, 0.09f) < dt) {
        for (int side = -1; side <= 1; side += 2) {
            const float wx = c.x + std::cos(c.yaw) * WHEEL_AT.x - std::sin(c.yaw) * WHEEL_AT.z * side, wz = c.z + std::sin(c.yaw) * WHEEL_AT.x + std::cos(c.yaw) * WHEEL_AT.z * side;
            spawn(DUST, HMM_V3(wx, c.y + 0.1f, wz), HMM_V3(rnd(-0.5f, 0.5f) - c.vx * 0.08f, rnd(0.3f, 0.8f), rnd(-0.5f, 0.5f) - c.vz * 0.08f), 0.6f, rnd(0.1f, 0.18f), HMM_V3(0.85f, 0.68f, 0.48f));
        }
    }

    // sound
    rumble_level += ((st.waiting || g.j.phase == Phase::Respawning ? 0.0f : std::min(1.0f, speed / 12)) - rumble_level) * std::min(1.0f, dt * 8);
    rumble_tone = 40 + speed * 4;
    hiss_level += ((surf == Surface::Ground || c.drifting ? std::min(1.0f, speed / 8) : 0.0f) - hiss_level) * std::min(1.0f, dt * 8);

    // camera: high, a narrow lens, looking up the road from behind and to the side; framing the Guide as he talks
    const float w = sapp_widthf(), h = sapp_heightf();
    const Sample road = st.track.at(g.j.s + 6);
    const float want_yaw = std::atan2(road.tz, road.tx) + HMM_PI32 + 0.75f;
    st.cam_yaw = st.waiting ? want_yaw + std::sin(st.time * 0.15f) * 0.3f : st.cam_yaw + wrap(want_yaw - st.cam_yaw) * std::min(1.0f, dt * 0.9f);
    if (g.j.phase != Phase::Landing && !st.waiting) st.intro = std::max(0.0f, st.intro - dt * 0.7f);
    const float e = st.intro * st.intro * (3 - 2 * st.intro);
    HMM_Vec3 focus = HMM_V3(c.x + c.vx * 0.3f, c.y + 0.8f, c.z + c.vz * 0.3f);
    if (g.j.phase == Phase::Landing || st.waiting) focus = HMM_V3(c.x, st.track.elevation(g.j.s) + 0.8f, c.z);
    const bool finale = (st.talk.open || g.j.phase == Phase::Complete) && g.j.stop + 1 == static_cast<int>(chapter_one().size());
    if (finale) focus = HMM_LerpV3(focus, 0.5f, HMM_AddV3(st.guide_at, HMM_V3(0, 1, 0)));
    st.cam_target = HMM_LerpV3(st.cam_target, std::min(1.0f, dt * 4), focus);
    const float pitch = 0.62f + 0.25f * e;
    const float dist = (34 + speed * 0.5f + (st.talk.open ? 4.0f : 0.0f) + (finale ? 6.0f : 0.0f)) * st.zoom + 70 * e;
    const HMM_Vec3 off = HMM_V3(std::cos(st.cam_yaw) * std::cos(pitch), std::sin(pitch), std::sin(st.cam_yaw) * std::cos(pitch));
    const HMM_Vec3 target = st.cam_target;
    HMM_Vec3 eye = HMM_AddV3(target, HMM_MulV3F(off, dist));
    eye.X += st.shake * 0.5f * std::sin(st.time * 71); eye.Y += st.shake * 0.4f * std::sin(st.time * 93);
    const float fov = HMM_AngleDeg(20.0f);
    const HMM_Mat4 proj = st.zo ? HMM_Perspective_RH_ZO(fov, w / h, 4.0f, 400.0f) : HMM_Perspective_RH_NO(fov, w / h, 4.0f, 400.0f);
    frame_info.view_proj = HMM_MulM4(proj, HMM_LookAt_RH(eye, target, HMM_V3(0, 1, 0)));
    st.car_screen = to_screen(HMM_V3(c.x, c.y + 2.5f, c.z));
    st.guide_screen = to_screen(HMM_AddV3(st.guide_at, HMM_V3(0, 2.4f, 0)));
    if (st.talk.open) st.guide_yaw += wrap(std::atan2(c.z - st.guide_at.Z, c.x - st.guide_at.X) - st.guide_yaw) * std::min(1.0f, dt * 3);

    // the sun: warm and low, its shadow map following the camera (snapped to texels so the edges don't crawl)
    const HMM_Vec3 sun = HMM_NormV3(HMM_V3(-0.5f, 0.75f, 0.42f));
    const float half = SHADOW_HALF * (1 + e * 1.5f);
    const float texel = 2 * half / SHADOW_SIZE;
    const HMM_Mat4 light_view = HMM_LookAt_RH(HMM_MulV3F(sun, 80), HMM_V3(0, 0, 0), HMM_V3(0, 1, 0));
    HMM_Vec4 centre = HMM_MulM4V4(light_view, HMM_V4(target.X, target.Y, target.Z, 1));
    centre.X = std::floor(centre.X / texel) * texel; centre.Y = std::floor(centre.Y / texel) * texel;
    const float near_z = -centre.Z - 60, far_z = -centre.Z + 60;
    const HMM_Mat4 light_proj = st.zo ? HMM_Orthographic_RH_ZO(centre.X - half, centre.X + half, centre.Y - half, centre.Y + half, near_z, far_z)
                                      : HMM_Orthographic_RH_NO(centre.X - half, centre.X + half, centre.Y - half, centre.Y + half, near_z, far_z);
    frame_info.light_vp = HMM_MulM4(light_proj, light_view);
    frame_info.zscale = st.zo ? 1.0f : 0.5f;
    frame_info.zoff = st.zo ? 0.0f : 0.5f;
    const float near_s = st.track.nearest(target.X, target.Z, nullptr, g.j.s);

    // 1. the shadow map
    frame_info.shadow_pass = true;
    {
        sg_pass pass = {};
        pass.action.depth.load_action = SG_LOADACTION_CLEAR;
        pass.action.depth.clear_value = 1.0f;
        pass.action.depth.store_action = SG_STOREACTION_STORE;   // the default throws depth away (WebGPU does)
        pass.attachments.depth_stencil = st.shadow_att;
        sg_begin_pass(&pass);
        sg_apply_pipeline(st.shadow_pip);
        draw_land(near_s, 40 * (1 + e), 50 * (1 + e));
        draw_dynamic(near_s);
        sg_end_pass();
    }

    // 2. the diorama
    frame_info.shadow_pass = false;
    ensure_scene(sapp_width(), sapp_height());
    {
        sg_pass pass = {};
        pass.action.colors[0].load_action = SG_LOADACTION_CLEAR;
        pass.action.colors[0].store_action = SG_STOREACTION_DONTCARE;
        pass.action.colors[0].clear_value = { 0.9f, 0.75f, 0.6f, 1 };
        pass.attachments.colors[0] = st.scene_msaa_att;
        pass.attachments.resolves[0] = st.scene_resolve_att;
        pass.attachments.depth_stencil = st.scene_depth_att;
        sg_begin_pass(&pass);
        sg_apply_pipeline(st.sky_pip);
        sky_params_t sky = {};
        sky.top = HMM_V4(0.93f, 0.82f, 0.68f, 1);
        sky.bottom = HMM_V4(0.64f, 0.45f, 0.4f, 1);
        sky.glow = HMM_V4(1.0f, 0.9f, 0.74f, 0.3f);
        sky.centre = HMM_V4(0.5f, 0.62f, w / h, 0);
        sg_apply_uniforms(UB_sky_params, SG_RANGE(sky));
        sg_draw(0, 3, 1);
        sg_apply_pipeline(st.lit_pip);
        lit_fs_params_t fs = {};
        fs.sun_dir = v4(sun, 2.3f);
        fs.sun_color = v4(lin(0xFFE2B8));
        fs.sky_top = v4(HMM_MulV3F(lin(0x8DB8E8), 0.7f), 0.68f);
        fs.sky_horizon = v4(HMM_MulV3F(lin(0xF2D2B0), 0.8f));
        fs.ground_color = v4(HMM_MulV3F(lin(0xC99A62), 0.35f));
        fs.cam_pos = v4(eye, st.time);
        fs.shadow_info = HMM_V4(1.0f / SHADOW_SIZE, 0.0015f, sg_query_features().origin_top_left ? 1.0f : 0.0f, 0.8f);
        fs.haze = v4(lin(0xB98A7A), 0.85f);
        sg_apply_uniforms(UB_lit_fs_params, SG_RANGE(fs));
        draw_land(near_s, 70 * (1 + e), 90 * (1 + e));
        draw_dynamic(near_s);
        sg_end_pass();
    }

    // 3. on screen: post-processing, then the HUD
    draw_hud(w, h);
    {
        sg_pass pass = {};
        pass.action.colors[0].load_action = SG_LOADACTION_DONTCARE;
        pass.swapchain = sglue_swapchain();
        sg_begin_pass(&pass);
        sg_apply_pipeline(st.post_pip);
        sg_bindings b = {};
        b.views[VIEW_scene_tex] = st.scene_tex;
        b.samplers[SMP_scene_smp] = st.post_smp;
        sg_apply_bindings(&b);
        post_params_t p = {};
        p.texel = HMM_V4(1.0f / w, 1.0f / h, sg_query_features().origin_top_left ? 0.0f : 1.0f, std::fmod(st.time, 10.0f));
        p.focus = HMM_V4(std::max(0.1f, std::min(0.9f, st.car_screen.Y - 0.08f)), 0.14f + 0.1f * e, (3.5f + 2.0f * e) * sapp_dpi_scale(), 0.4f);
        p.grade = HMM_V4(0.45f, 1.15f, 0.02f, 0.0f);
        p.centre = HMM_V4(st.car_screen.X, st.car_screen.Y, 0, 0);
        sg_apply_uniforms(UB_post_params, SG_RANGE(p));
        sg_draw(0, 3, 1);
        sgl_context_draw(st.hud);
        sg_end_pass();
    }
    sg_commit();
    mix_audio();
}

void event(const sapp_event* ev) {
    switch (ev->type) {
        case SAPP_EVENTTYPE_KEY_DOWN:
        case SAPP_EVENTTYPE_KEY_UP: {
            const bool down = ev->type == SAPP_EVENTTYPE_KEY_DOWN;
            const sapp_keycode k = ev->key_code;
            if (k == SAPP_KEYCODE_UP || k == SAPP_KEYCODE_W) st.key_gas = down;
            if (k == SAPP_KEYCODE_DOWN || k == SAPP_KEYCODE_S) st.key_brake = down;
            if (k == SAPP_KEYCODE_LEFT || k == SAPP_KEYCODE_A) st.key_left = down;
            if (k == SAPP_KEYCODE_RIGHT || k == SAPP_KEYCODE_D) st.key_right = down;
            if (down && !ev->key_repeat && xl::focused()) {
                if (k == SAPP_KEYCODE_SPACE || k == SAPP_KEYCODE_ENTER || k == SAPP_KEYCODE_E) st.advance = true;
                if (k == SAPP_KEYCODE_R) st.restart = true;
            }
            break;
        }
        case SAPP_EVENTTYPE_MOUSE_DOWN: st.advance = true; break;
        case SAPP_EVENTTYPE_MOUSE_SCROLL: st.zoom = std::max(0.5f, std::min(2.2f, st.zoom * (1.0f - ev->scroll_y * 0.06f))); break;
        case SAPP_EVENTTYPE_UNFOCUSED: st.key_gas = st.key_brake = st.key_left = st.key_right = false; break;
        default: break;
    }
}

sg_pipeline_desc mesh_layout(sg_shader shader, bool full) {
    sg_pipeline_desc pd = {};
    pd.shader = shader;
    pd.layout.buffers[0].stride = sizeof(Vertex);
    if (full) {
        pd.layout.attrs[ATTR_lit_position] = { 0, offsetof(Vertex, pos), SG_VERTEXFORMAT_FLOAT3 };
        pd.layout.attrs[ATTR_lit_normal] = { 0, offsetof(Vertex, normal), SG_VERTEXFORMAT_FLOAT3 };
        pd.layout.attrs[ATTR_lit_color0] = { 0, offsetof(Vertex, color), SG_VERTEXFORMAT_UBYTE4N };
        pd.layout.attrs[ATTR_lit_material] = { 0, offsetof(Vertex, material), SG_VERTEXFORMAT_UBYTE4N };
    } else {
        pd.layout.attrs[ATTR_shadow_position] = { 0, offsetof(Vertex, pos), SG_VERTEXFORMAT_FLOAT3 };
    }
    pd.index_type = SG_INDEXTYPE_UINT32;
    pd.depth.write_enabled = true;
    pd.depth.compare = SG_COMPAREFUNC_LESS_EQUAL;
    pd.depth.pixel_format = SG_PIXELFORMAT_DEPTH;
    pd.cull_mode = SG_CULLMODE_NONE;
    return pd;
}

void init() {
    sg_desc gfx = {};
    gfx.environment = sglue_environment();
    gfx.logger.func = slog_func;
    sg_setup(&gfx);
    st.zo = sg_query_backend() == SG_BACKEND_WGPU;
    sgl_desc_t gl = {};
    gl.logger.func = slog_func;
    sgl_setup(&gl);
    sgl_context_desc_t hud = {};
    hud.max_vertices = 1 << 17;
    hud.max_commands = 1 << 13;
    st.hud = sgl_make_context(&hud);
    sg_pipeline_desc blend = {};
    blend.colors[0].blend.enabled = true;
    blend.colors[0].blend.src_factor_rgb = SG_BLENDFACTOR_SRC_ALPHA;
    blend.colors[0].blend.dst_factor_rgb = SG_BLENDFACTOR_ONE_MINUS_SRC_ALPHA;
    st.hud_blend = sgl_context_make_pipeline(st.hud, &blend);
    {   // the HUD font, embedded in the build (see build-native.mjs)
        std::ifstream in("/LilitaOne-Regular.ttf", std::ios::binary);
        std::vector<uint8_t> ttf((std::istreambuf_iterator<char>(in)), std::istreambuf_iterator<char>());
        st.text.setup(ttf, 48);
    }

    // the road and the pieces, all made in code; the land near the start now, the rest as you drive
    st.track = build_track();
    st.game = std::make_unique<Game>(st.track);
    st.chunks.assign(static_cast<size_t>(std::ceil(st.track.length / CHUNK)), GpuMesh{});
    for (int i = 0; i < 3; i++) ensure_chunk(i);
    st.chariot = upload(build_chariot());
    st.wheel = upload(build_wheel());
    st.rider = upload(build_rider());
    st.iris = upload(build_iris());
    st.lid = upload(build_lid());
    st.guide = upload(build_guide());
    st.pot = upload(build_pot());
    st.shard = upload(build_shard());
    st.puff = upload(build_puff());
    st.tumbleweed = upload(build_tumbleweed());
    st.handcart = upload(build_handcart());
    for (int k = 0; k < 6; k++) st.artifacts[k] = upload(build_artifact(static_cast<ArtifactKind>(k)));
    for (const Prop& p : st.track.props) if (p.kind == PropKind::Guide) { st.guide_at = HMM_V3(p.x, st.track.height(p.x, p.z, p.s), p.z); st.guide_yaw = -p.yaw; }

    // the shadow map: a depth texture, sampled with a comparison
    sg_image_desc img = {};
    img.usage.depth_stencil_attachment = true;
    img.width = img.height = SHADOW_SIZE;
    img.pixel_format = SG_PIXELFORMAT_DEPTH;
    img.sample_count = 1;
    st.shadow_depth = sg_make_image(&img);
    sg_view_desc v = {};
    v.depth_stencil_attachment.image = st.shadow_depth;
    st.shadow_att = sg_make_view(&v);
    v = {};
    v.texture.image = st.shadow_depth;
    st.shadow_tex = sg_make_view(&v);
    sg_sampler_desc smp = {};
    smp.min_filter = smp.mag_filter = SG_FILTER_LINEAR;
    smp.wrap_u = smp.wrap_v = SG_WRAP_CLAMP_TO_EDGE;
    smp.compare = SG_COMPAREFUNC_LESS;
    st.shadow_smp = sg_make_sampler(&smp);
    smp.compare = SG_COMPAREFUNC_NEVER;
    st.post_smp = sg_make_sampler(&smp);

    const sg_environment env = sglue_environment();
    sg_pipeline_desc sp = mesh_layout(sg_make_shader(shadow_shader_desc(sg_query_backend())), false);
    sp.colors[0].pixel_format = SG_PIXELFORMAT_NONE;   // depth only
    sp.sample_count = 1;
    sp.depth.bias = 1.0f;
    sp.depth.bias_slope_scale = 1.5f;
    st.shadow_pip = sg_make_pipeline(&sp);
    sg_pipeline_desc lp = mesh_layout(sg_make_shader(lit_shader_desc(sg_query_backend())), true);
    lp.colors[0].pixel_format = env.defaults.color_format;
    lp.sample_count = MSAA;
    st.lit_pip = sg_make_pipeline(&lp);
    sg_pipeline_desc sky = {};
    sky.shader = sg_make_shader(sky_shader_desc(sg_query_backend()));
    sky.colors[0].pixel_format = env.defaults.color_format;
    sky.depth.pixel_format = SG_PIXELFORMAT_DEPTH;
    sky.sample_count = MSAA;
    st.sky_pip = sg_make_pipeline(&sky);
    sg_pipeline_desc post = {};
    post.shader = sg_make_shader(post_shader_desc(sg_query_backend()));
    st.post_pip = sg_make_pipeline(&post);

    xl::audio_setup(1);
    std::srand(xl::seed());
    st.best_time = static_cast<float>(std::atof(xl::load("best", "0").c_str()));
    restart_journey();
    st.cam_target = HMM_V3(st.game->car.x, 0.8f, st.game->car.z);
    const Sample road = st.track.at(10);
    st.cam_yaw = std::atan2(road.tz, road.tx) + HMM_PI32 + 0.75f;
}

void cleanup() {
    xl::audio_shutdown();
    st.text.shutdown();
    sgl_shutdown();
    sg_shutdown();
}

} // namespace

// ---------- exports for the page's tests ----------

extern "C" {
/** The journey as JSON (free the string with _free). */
EMSCRIPTEN_KEEPALIVE char* jr_state_json() {
    const Journey& j = st.game->j;
    const Car& c = st.game->car;
    char buf[512];
    std::snprintf(buf, sizeof buf,
        "{\"waiting\":%s,\"phase\":%d,\"stop\":%d,\"line\":%d,\"talking\":%s,\"fuel\":%.3f,\"artifacts\":%d,\"s\":%.2f,\"speed\":%.3f,\"x\":%.3f,\"z\":%.3f,\"time\":%.2f}",
        st.waiting ? "true" : "false", static_cast<int>(j.phase), j.stop, st.talk.line, st.talk.open ? "true" : "false", j.fuel, j.artifacts, j.s, c.forward_speed(), c.x, c.z, j.time);
    const size_t n = std::strlen(buf) + 1;
    char* out = static_cast<char*>(malloc(n));
    std::memcpy(out, buf, n);
    return out;
}
/** Lets the autopilot drive and read the story (1), or hands back control (0). */
EMSCRIPTEN_KEEPALIVE void jr_autopilot(int on) { st.autopilot = on != 0; if (on) st.waiting = false; }
/** Moves the dialogue on, as Space does. */
EMSCRIPTEN_KEEPALIVE void jr_advance() { st.waiting = false; st.advance = true; }
}

sapp_desc sokol_main(int argc, char* argv[]) {
    sapp_desc desc = {};
    desc.init_cb = init;
    desc.frame_cb = frame;
    desc.event_cb = event;
    desc.cleanup_cb = cleanup;
    desc.window_title = "JyotiRath";
    desc.sample_count = 1;
    desc.logger.func = slog_func;
    return xl::app_desc(argc, argv, desc);
}
