// JyotiRath, Chapter I: Mohenjo-Daro. The chapter (chapter.h) beat by beat: drives along the road (drive.h, track.h)
// and boards in the districts (go.h), told by story.h, drawn from models.h. A district is in ruins until its board is
// cleared, then rises again. Between beats, scenes: the chariot rolls itself up to a district, someone stops it, and
// a wave of light from the sun on its prow lights the board's lanes; after a board, someone sends you off and the
// chariot rolls out into the next drive already moving. The camera blends between the two views. On the boards,
// hints.h teaches each rule once, when it's useful. Drawn through @xlibraries/render (xl_render.h): the sun's shadow map, the
// diorama into a 4× MSAA target (its Pixar-styled lighting), then the post-process pass (tilt-shift, bloom, grade) on
// screen with the HUD and the dialogue (sokol_gl and the engine's baked font) on top. The land and the districts are
// built as you approach them. Synthesized sound through xl_audio.h. Exports for the page's tests at the bottom.
#define SOKOL_APP_IMPL   // sokol_gfx, sokol_glue and sokol_log come with @xlibraries/render
#define SOKOL_GL_IMPL
#include "sokol_gfx.h"
#include "sokol_app.h"
#include "sokol_log.h"
#include "sokol_gl.h"
#define HANDMADE_MATH_USE_RADIANS
#include "HandmadeMath.h"
#include "xl.h"
#include "xl_audio.h"
#include "xl_render.h"
#include "xl_text.h"
#include "chapter.h"
#include "drive.h"
#include "go.h"
#include "hints.h"
#include "level.h"
#include "story.h"
#include "track.h"

#include <algorithm>
#include <cctype>
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
float rumble_level = 0, rumble_tone = 60, hiss_level = 0, storm_level = 0;
uint32_t noise_seed = 99;

void play(float f0, float f1, float dur, float vol, int wave, float delay = 0) { if (voices.size() < 24) voices.push_back({ f0, f1, 0, dur, vol, delay, wave }); }
void chime(float base, int notes, float gap, float vol) { for (int i = 0; i < notes; i++) { const float f = base * std::pow(1.19f, static_cast<float>(i)); play(f, f, 0.3f, vol, 1, i * gap); } }

void mix_audio() {
    const int frames = xl::audio_expect();
    if (frames <= 0) return;
    static std::vector<float> buf;
    static float phase = 0, low = 0, high = 0, wind = 0;
    buf.assign(frames, 0.0f);
    const float rate = static_cast<float>(xl::audio_sample_rate());
    for (int i = 0; i < frames; i++) {
        noise_seed = noise_seed * 1664525u + 1013904223u;
        const float n = (noise_seed >> 9) / 4194304.0f - 1.0f;
        low += (n - low) * 0.04f;            // wheels on earth: a low rumble
        high += (n - high) * 0.5f;           // sliding on sand: a hiss
        wind += (n - wind) * 0.02f;          // the storm: a deep roar
        phase = std::fmod(phase + rumble_tone / rate, 1.0f);
        const float tone = 4.0f * std::fabs(phase - 0.5f) - 1.0f;
        buf[i] += (low * 2.2f + tone * 0.25f) * rumble_level * 0.25f + (high - low) * hiss_level * 0.12f + wind * storm_level * 3.0f;
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

struct GpuMesh { xl::render::Mesh mesh; bool ready = false; };   // ready: built (an empty mesh uploads nothing)

enum ParticleKind { DUST, SPARK, SMOKE, GRAIN };
struct Particle { HMM_Vec3 p, v; float life, max_life, size, spin; ParticleKind kind; HMM_Vec3 color; };

struct Dialogue {
    bool open = false;
    const std::vector<Line>* lines = nullptr;
    int line = 0;
    float shown = 0;      // characters revealed so far
    float idle = 0;       // seconds since the line was fully shown
};

/** Where a beat is: the opening words, playing, a drive that failed, a board's results, the chapter's end; rolling up
 *  to a board and lighting it, and being sent off on a drive. */
enum class Stage { Title, Intro, Play, Failed, Results, Complete, Arrive, Depart };

/** The chariot rolling itself along the road in a scene: from s0 at v0 to s1 at v1 (a cubic in time), drifting from
 *  lat0 to the middle of the road. */
struct Roll { bool on = false; float s0 = 0, s1 = 0, v0 = 0, v1 = 0, lat0 = 0, yaw0 = 0, T = 1, t = 0; };

struct {
    Track track;
    Chapter chapter;
    std::unique_ptr<Game> game;
    std::unique_ptr<GoState> go;
    Stage stage = Stage::Title;
    std::vector<GpuMesh> chunks;
    GpuMesh districts[DISTRICTS][2];   // [d][0] ruined, [d][1] alive
    float rising[DISTRICTS] = {};      // 0..1 through a district's restoration (1 when done)
    GpuMesh chariot, wheel, rider, iris, lid, guide, puff, tumbleweed, gates, fragment, sack, stone, watchman, zebu, chevron, gaze, handcart;
    GpuMesh statue, thief, pointer, glow_ring, beacons[2];
    GpuMesh tools[5];
    GpuMesh villagers[4];
    GpuMesh boards[BOARDS];
    std::unique_ptr<xl::render::Renderer> renderer;
    xl::render::Pass* pass = nullptr;   // the pass being drawn
    sgl_context hud;
    sgl_pipeline hud_blend;
    xl::txt::Text text;

    bool autopilot = false;
    float time = 0, accumulator = 0, stage_time = 0;
    float cam_yaw = 0, zoom = 1, intro = 1;
    float mode = 0;                          // the camera: 0 behind the chariot on a drive, 1 high over a board
    bool snap = true;                        // jump the camera to where it should be (after a jump in place)
    HMM_Vec3 cam_target{};
    // scenes between beats
    Roll glide;
    int phase = 0;                           // a scene's step: arriving 0 roll, 1 words, 2 light; departing 0 words, 1 roll
    Figure figure = Figure::None;            // who stands by the road, talking to the chariot
    HMM_Vec3 figure_at{};
    float figure_yaw = 0;
    float wave = -1;                         // the light's radius as it lights the board (-1: all lit)
    HMM_Vec3 wave_at{};
    std::unique_ptr<GoState> fading;         // the board just left, sinking back into the road
    int fading_board = -1;
    float fade = -1;
    HMM_Vec3 fade_at{};
    float night = 0;                         // dusk on the lamp road and in the plaza, 0..1
    HMM_Vec3 plinth{};                       // where the Dancing Girl stands
    float plinth_yaw = 0;
    // hints on the boards
    uint32_t hints_seen = 0;
    HintCue hint;
    float hint_age = 0;
    HMM_Vec3 guide_at{};
    float guide_yaw = 0;
    float shake = 0;
    float blink = 0, next_blink = 2, squint = 0;
    float roll = 0, bob = 0;
    std::vector<Particle> particles;
    Dialogue talk;
    std::string title;                       // the beat's name, shown as it begins
    float title_timer = 0;
    std::string notice;                      // "Caught!" and friends
    float notice_timer = 0;
    // board play
    float hop = 1;                           // 0..1 through the last move's animation
    float caught_timer = 0, auto_timer = 0;
    int key_dir = -1;                        // a step asked for: 0 up, 1 left, 2 down, 3 right (on screen)
    int use_slot = -1;                       // a tool asked for
    bool clicked = false;
    HMM_Vec2 mouse = { { 0, 0 } };
    Tool gift = Tool::None;                  // what the last board's quiet solve earned
    Style result_style = Style::Steady;
    int result_board = -1;
    // drive play
    float fail_timer = 0;
    HMM_Vec2 car_screen = { { 0.5f, 0.5f } }, guide_screen = { { 0.5f, 0.5f } }, local_screen = { { 0.5f, 0.5f } };

    bool key_gas = false, key_brake = false, key_left = false, key_right = false;
    bool advance = false, restart = false, menu = false, fresh = false;
} st;

GpuMesh upload(const Mesh& m) { return { st.renderer->upload(m.vertices, m.indices), true }; }

xl::render::Mat4 mat4(const HMM_Mat4& m) { xl::render::Mat4 r; std::memcpy(r.m, &m, sizeof r.m); return r; }
xl::render::Vec3 vec3(HMM_Vec3 v) { return { v.X, v.Y, v.Z }; }

HMM_Vec3 lin(uint32_t hex) {
    const auto c = [](float v) { return std::pow(v, 2.2f); };
    return HMM_V3(c(((hex >> 16) & 255) / 255.0f), c(((hex >> 8) & 255) / 255.0f), c((hex & 255) / 255.0f));
}
float rnd(float a, float b) { return a + (b - a) * (std::rand() / static_cast<float>(RAND_MAX)); }
float smooth(float t) { t = std::max(0.0f, std::min(1.0f, t)); return t * t * (3 - 2 * t); }
float wrap(float a) { while (a > HMM_PI32) a -= 2 * HMM_PI32; while (a < -HMM_PI32) a += 2 * HMM_PI32; return a; }

void spawn(ParticleKind kind, HMM_Vec3 p, HMM_Vec3 v, float life, float size, HMM_Vec3 color) {
    if (st.particles.size() > 500) return;
    st.particles.push_back({ p, v, life, life, size, 0, kind, color });
}

/** The zone a district's board and buildings are in. */
float district_s(int d) {
    const int zones[DISTRICTS] = { static_cast<int>(Zone::LowerTown), static_cast<int>(Zone::Granary), static_cast<int>(Zone::GreatBath), static_cast<int>(Zone::Citadel), static_cast<int>(Zone::UpperTown) };
    return ZONE_START[zones[d]];
}
float district_end(int d) { const int zones[DISTRICTS] = { 3, 5, 7, 8, 10 }; return d == 4 ? LAND_END : ZONE_START[zones[d]]; }

/** Builds the land and the districts near s before we get there: one piece a frame. */
void stream(float s) {
    const int here = static_cast<int>(s / CHUNK);
    for (int i = here - 2; i <= here + 3; i++) {
        if (i < 0 || i >= static_cast<int>(st.chunks.size()) || st.chunks[i].ready) continue;
        st.chunks[i] = upload(build_chunk(st.track, i * CHUNK, std::min(st.track.length, (i + 1) * CHUNK)));
        return;
    }
    for (int d = 0; d < DISTRICTS; d++) {
        if (s < district_s(d) - 140 || s > district_end(d) + 80) continue;
        for (int alive = 0; alive < 2; alive++) {
            if (st.districts[d][alive].ready) continue;
            if (alive == 0 && st.chapter.restored[d] && st.rising[d] >= 1) continue;   // its ruins are gone for good
            st.districts[d][alive] = upload(build_district(st.track, d, alive == 1));
            return;
        }
    }
}

// ---------- the chapter ----------

void open_lines(const std::vector<Line>& lines) {
    st.talk = Dialogue{};
    if (lines.empty()) return;
    st.talk.open = true;
    st.talk.lines = &lines;
}

void save() { xl::save("chapter", st.chapter.save()); }

HMM_Vec3 node_pos(int n) {
    const GoNode& g = st.go->board->nodes[n];
    const Sample p = st.track.at(g.s);
    return HMM_V3(p.x - p.tz * g.lat, st.track.elevation(g.s), p.z + p.tx * g.lat);
}

/** Puts the chariot on the road at s, facing along it (for boards and the finale), with no drive under way. */
void park(float s) {
    st.game->place(s);
    st.game->run.state = RunState::Done;
}

/** Starts the chariot rolling itself from where it is to s1, arriving at speed v1. */
void start_roll(float s1, float v1) {
    const Car& c = st.game->car;
    float lat = 0;
    const float s0 = st.track.nearest(c.x, c.z, &lat, st.game->run.s), v0 = std::max(0.0f, c.forward_speed());
    const float d = std::fabs(s1 - s0);
    st.glide = Roll{ true, s0, s1, v0, v1, lat, c.yaw, std::max(0.6f, std::min(3.6f, 2 * d / std::max(1.0f, v0 + v1))), 0 };
}

/** Moves the chariot along its roll. */
void update_roll(float dt) {
    Roll& r = st.glide;
    r.t = std::min(r.T, r.t + dt);
    const float u = r.t / r.T, u2 = u * u, u3 = u2 * u;
    float s = (2 * u3 - 3 * u2 + 1) * r.s0 + (u3 - 2 * u2 + u) * r.v0 * r.T + (-2 * u3 + 3 * u2) * r.s1 + (u3 - u2) * r.v1 * r.T;
    s = std::max(std::min(r.s0, r.s1), std::min(std::max(r.s0, r.s1), s));
    const float lat = r.lat0 * (1 - smooth(u));
    const Sample p = st.track.at(s);
    Car& c = st.game->car;
    const float px = c.x, pz = c.z;
    c.x = p.x - p.tz * lat; c.z = p.z + p.tx * lat;
    c.y = st.track.height(c.x, c.z, s);
    c.yaw = r.yaw0 + wrap(std::atan2(p.tz, p.tx) - r.yaw0) * smooth(std::min(1.0f, u * 2.5f));
    if (dt > 0) { c.vx = (c.x - px) / dt; c.vz = (c.z - pz) / dt; }
    c.wheel += std::hypot(c.vx, c.vz) * dt / 0.55f;
    c.steer *= 0.9f;
    st.game->run.s = s;
    if (r.t >= r.T) r.on = false;
}

/** Someone by the road at s, `lat` across it, facing the chariot. */
void place_figure(Figure f, float s, float lat) {
    st.figure = f;
    const Sample p = st.track.at(s);
    st.figure_at = HMM_V3(p.x - p.tz * lat, st.track.height(p.x - p.tz * lat, p.z + p.tx * lat, s), p.z + p.tx * lat);
    const Car& c = st.game->car;
    st.figure_yaw = std::atan2(c.z - st.figure_at.Z, c.x - st.figure_at.X);
}

/** The board just left sinks back into the road as the chariot moves on. */
void fade_board() {
    if (!st.go) return;
    st.fading = std::move(st.go);
    st.fading_board = st.result_board;
    st.fade = 46;
    st.fade_at = HMM_V3(st.game->car.x, st.game->car.y, st.game->car.z);
}

/** Rolling up to a board: the chariot glides to its start, someone at the edge of the district stops it, then the
 *  sun on its prow lights the lanes (see lines_done and frame). */
void begin_arrive() {
    const Beat& b = st.chapter.current();
    const Board& board = chapter_board(b.index);
    st.stage = Stage::Arrive;
    st.phase = 0;
    st.stage_time = 0;
    st.talk = Dialogue{};
    st.go = std::make_unique<GoState>(board, st.chapter.bag);
    st.hop = 1;
    st.caught_timer = 0;
    st.gift = Tool::None;
    st.wave = 0;
    st.hint = HintCue{};
    const float s0 = board.nodes[board.start].s;
    start_roll(s0, 0);
    if (arrival_figure(b.index) == Figure::Thief) {
        st.figure = Figure::Thief;
        for (const Piece& p : st.go->pieces) if (p.kind == PieceKind::Thief) { const GoNode& n = board.nodes[p.node]; const Sample q = st.track.at(n.s); st.figure_at = HMM_V3(q.x - q.tz * n.lat, st.track.elevation(n.s), q.z + q.tx * n.lat); }
    } else {
        place_figure(arrival_figure(b.index), s0 + 2.5f, st.track.road_half(s0 + 2.5f) + 0.5f);
        st.figure_yaw = std::atan2(st.track.at(s0).z - st.figure_at.Z, st.track.at(s0).x - st.figure_at.X);
    }
    save();
}

/** Begins the chapter's current beat from a standstill: its opening words, then play. A board begins with its
 *  arrival (the chariot already there). `snap` puts the camera straight where it belongs. */
void enter_beat(bool snap = true) {
    const Beat& b = st.chapter.current();
    st.stage = Stage::Intro;
    st.stage_time = 0;
    st.title = b.title;
    st.title_timer = 3.0f;
    st.particles.clear();
    st.notice_timer = 0;
    st.hop = 1;
    st.caught_timer = st.fail_timer = 0;
    st.gift = Tool::None;
    st.go.reset();
    st.fading.reset();
    st.wave = -1;
    st.glide.on = false;
    st.figure = Figure::None;
    st.hint = HintCue{};
    if (b.kind == BeatKind::Drive) {
        RunSpec spec = st.chapter.run_spec(b.index);
        spec.speed = 0;
        st.game->start(spec, st.chapter.bag);
        if (st.game->run.state != RunState::Landing) open_lines(beat_intro(st.chapter));   // the first drive talks after landing
    } else if (b.kind == BeatKind::Board) {
        park(chapter_board(b.index).nodes[chapter_board(b.index).start].s);
        st.title_timer = 0;
        begin_arrive();
    } else {
        if (snap || st.game->run.s < at::DANCING_GIRL - 40) park(at::DANCING_GIRL - 16);
        open_lines(beat_intro(st.chapter));
    }
    if (snap) {
        st.snap = true;
        st.cam_target = HMM_V3(st.game->car.x, st.game->car.y + 0.8f, st.game->car.z);
        const Sample road = st.track.at(st.game->run.s + 6);
        st.cam_yaw = std::atan2(road.tz, road.tx) + HMM_PI32 + 0.75f;
    }
    save();
}

void new_journey() {
    st.chapter = Chapter{};
    for (int d = 0; d < DISTRICTS; d++) st.rising[d] = 0;
    xl::save("chapter", "");
    st.intro = 1;
    enter_beat();
}

/** The chariot rolls off the board into the next drive, gathering speed; the board sinks behind it. */
void depart_roll() {
    st.phase = 1;
    st.talk = Dialogue{};
    fade_board();
    const RunSpec spec = st.chapter.run_spec(st.chapter.current().index);
    start_roll(spec.from, spec.speed);
}

/** After a board's results: someone sends you off on the next drive, or the chariot rolls on to the next board. */
void begin_depart() {
    const Beat& next = st.chapter.current();
    if (next.kind == BeatKind::Board) { fade_board(); begin_arrive(); return; }
    if (next.kind == BeatKind::Finale) { st.fading.reset(); enter_beat(false); return; }
    st.stage = Stage::Depart;
    st.phase = 0;
    st.stage_time = 0;
    const float s = st.game->run.s;
    const Figure f = departure_figure(st.chapter);
    if (f == Figure::Zebu) place_figure(f, s - 7, 0.4f);   // the zebu you annoyed, behind you
    else if (f != Figure::None) place_figure(f, s + 3.5f, st.track.road_half(s + 3.5f) + 0.6f);
    else st.figure = Figure::None;
    open_lines(beat_intro(st.chapter));
    if (!st.talk.open) depart_roll();
}

/** The roll into a drive is over: it's yours. */
void hand_over() {
    const Beat& b = st.chapter.current();
    st.fading.reset();
    st.figure = Figure::None;
    st.game->start(st.chapter.run_spec(b.index), st.chapter.bag);
    st.stage = Stage::Play;
    st.stage_time = 0;
    st.title = b.title;
    st.title_timer = 3.0f;
    st.notice = "GO!";
    st.notice_timer = 1.0f;
    play(660, 990, 0.25f, 0.14f, 1);
}

/** The sun on the prow flares: a ring of light runs out over the district and the board rises where it passes. */
void light_board() {
    st.phase = 2;
    st.wave = 0.01f;
    st.wave_at = HMM_V3(st.game->car.x, st.game->car.y, st.game->car.z);
    st.title = st.chapter.current().title;
    st.title_timer = 3.0f;
    chime(392, 6, 0.08f, 0.13f);
    play(110, 220, 1.2f, 0.12f, 1);
    st.figure = st.figure == Figure::Thief ? Figure::Thief : Figure::None;
}

/** The words have all been read: on to play, or to the next step of a scene. */
void lines_done() {
    switch (st.stage) {
        case Stage::Intro:
            if (st.chapter.current().kind == BeatKind::Finale) { st.stage = Stage::Complete; chime(523, 5, 0.11f, 0.14f); save(); }
            else st.stage = Stage::Play;
            st.stage_time = 0;
            break;
        case Stage::Arrive: if (st.phase == 1) light_board(); break;
        case Stage::Depart: if (st.phase == 0) depart_roll(); break;
        case Stage::Results: break;   // the card waits for Space
        default: break;
    }
}

void advance_dialogue() {
    if (!st.talk.open || !st.talk.lines) return;
    const std::vector<Line>& lines = *st.talk.lines;
    const size_t len = std::strlen(lines[st.talk.line].text);
    if (st.talk.shown < len) { st.talk.shown = static_cast<float>(len); return; }
    if (st.talk.line + 1 < static_cast<int>(lines.size())) { st.talk.line++; st.talk.shown = 0; st.talk.idle = 0; play(660, 660, 0.04f, 0.05f, 1); return; }
    st.talk.open = false;
    lines_done();
}

/** A scene's steps that aren't words: the rolls and the light. */
void update_scene(float dt) {
    if (st.glide.on) {
        update_roll(dt);
        if (!st.glide.on) {
            if (st.stage == Stage::Arrive && st.phase == 0) { st.phase = 1; open_lines(arrival_lines(st.chapter.current().index)); if (!st.talk.open) light_board(); }
            else if (st.stage == Stage::Depart && st.phase == 1) hand_over();
        }
    }
    if (st.stage == Stage::Arrive && st.phase == 2) {
        st.wave += dt * (8 + st.wave * 0.9f);
        if (std::fmod(st.time, 0.04f) < dt) {   // sparks along the ring
            const float a = rnd(0, 6.283f);
            spawn(SPARK, HMM_V3(st.wave_at.X + std::cos(a) * st.wave, st.wave_at.Y + 0.3f, st.wave_at.Z + std::sin(a) * st.wave), HMM_V3(0, rnd(1, 2.5f), 0), 0.6f, 0.06f, HMM_V3(5, 3.6f, 1.2f));
        }
        if (st.wave > 48) {
            st.wave = -1;
            st.stage = Stage::Intro;
            st.stage_time = 0;
            st.figure = Figure::None;
            open_lines(beat_intro(st.chapter));
            if (!st.talk.open) st.stage = Stage::Play;
        }
    }
    if (st.fading) { st.fade -= dt * 30; if (st.fade < 0) st.fading.reset(); }
}

/** Space during a scene: skip its roll or its light. */
bool skip_scene() {
    if (st.glide.on) { st.glide.t = st.glide.T; return true; }
    if (st.stage == Stage::Arrive && st.phase == 2) { st.wave = 48; return true; }
    return false;
}

/** A board was cleared: the district rises, the chapter remembers how, and the results card shows what it means. */
void board_cleared() {
    const int b = st.chapter.current().index;
    st.result_board = b;
    st.result_style = style_of(*st.go);
    st.gift = st.chapter.board_cleared(b, *st.go);
    if (b < DISTRICTS) st.rising[b] = 0.001f;
    st.stage = Stage::Results;
    st.stage_time = 0;
    st.hint = HintCue{};
    open_lines(board_outro(b));
    chime(523, 5, 0.11f, 0.14f);
    save();
}

/** Space on the results card: on to the next beat. */
void continue_on() {
    if (st.stage == Stage::Results && !st.talk.open) {
        if (st.gift != Tool::None && st.talk.lines != &gift_lines(st.gift)) { open_lines(gift_lines(st.gift)); return; }
        begin_depart();
    }
}

// ---------- events ----------

void drive_events() {
    Game& g = *st.game;
    const Run& r = g.run;
    const Car& c = g.car;
    const uint32_t e = r.events;
    if (e & EV_LAND) {
        play(80, 40, 0.4f, 0.4f, 2); play(200, 60, 0.3f, 0.3f, 3);
        st.shake = 0.8f; st.squint = 0.8f;
        xl::rumble(0.8f, 0.5f, 220, true);
        for (int i = 0; i < 18; i++) { const float a = rnd(0, 6.283f); spawn(DUST, HMM_V3(c.x + std::cos(a) * 0.9f, c.y + 0.1f, c.z + std::sin(a) * 0.9f), HMM_V3(std::cos(a) * rnd(2.5f, 4.5f), rnd(0.2f, 0.8f), std::sin(a) * rnd(2.5f, 4.5f)), 0.9f, rnd(0.12f, 0.22f), HMM_V3(0.85f, 0.68f, 0.48f)); }
    }
    if (e & EV_PICKUP) {
        chime(1320, 2, 0.07f, 0.12f);
        xl::rumble(0.0f, 0.2f, 40);
        st.notice = std::string("Picked up: ") + tool_name(r.bag.back()); st.notice_timer = 1.6f;
        for (int k = 0; k < 10; k++) spawn(SPARK, HMM_V3(r.event_at.x, c.y + 0.8f, r.event_at.z), HMM_V3(rnd(-2, 2), rnd(1.5f, 3.5f), rnd(-2, 2)), 0.6f, 0.05f, HMM_V3(5, 3.6f, 1.2f));
    }
    if (e & EV_BAG_FULL) { play(300, 240, 0.15f, 0.08f, 0); st.notice = "Your bag is full (two at most)"; st.notice_timer = 1.6f; }
    if (e & EV_BONK) {
        const float k = std::min(1.0f, r.bonk / 10.0f);
        play(90, 40, 0.25f, 0.25f + 0.25f * k, 3); play(70, 50, 0.2f, 0.3f * k, 2);
        st.shake = std::max(st.shake, 0.3f + 0.7f * k); st.squint = 0.6f;
        xl::rumble(0.4f + 0.6f * k, 0.3f, 160, true);
        for (int i = 0; i < 8; i++) spawn(SMOKE, HMM_V3(r.event_at.x, c.y + 0.4f, r.event_at.z), HMM_V3(rnd(-2, 2), rnd(0.5f, 2), rnd(-2, 2)), 0.7f, 0.25f, HMM_V3(0.85f, 0.75f, 0.6f));
    }
    if (e & EV_POTHOLE) {
        play(110, 50, 0.18f, 0.35f, 2); play(300, 120, 0.12f, 0.15f, 3);
        st.shake = std::max(st.shake, 0.35f); st.squint = 0.4f;
        xl::rumble(0.5f, 0.2f, 90, true);
        for (int i = 0; i < 6; i++) spawn(DUST, HMM_V3(r.event_at.x, c.y + 0.1f, r.event_at.z), HMM_V3(rnd(-1, 1), rnd(0.5f, 1.5f), rnd(-1, 1)), 0.7f, 0.2f, HMM_V3(0.7f, 0.5f, 0.35f));
    }
    if (e & EV_SPILL) {
        play(500, 200, 0.2f, 0.15f, 3);
        st.notice = "A sack spilled!"; st.notice_timer = 1.2f;
        for (int i = 0; i < 24; i++) spawn(GRAIN, HMM_V3(c.x, c.y + 1.0f, c.z), HMM_V3(rnd(-2, 2), rnd(1, 3), rnd(-2, 2)), 1.0f, 0.035f, HMM_V3(0.95f, 0.8f, 0.45f));
    }
    if (e & EV_TUMBLE) play(400, 200, 0.12f, 0.12f, 3);
    if (e & EV_FAIL) {
        play(300, 100, 0.8f, 0.2f, 1);
        st.notice = fail_text(r.fail); st.notice_timer = 2.0f;
        st.squint = 1.2f; st.shake = 0.5f;
        st.stage = Stage::Failed;
        st.fail_timer = 2.0f;
        if (r.fail == Fail::Splash) for (int i = 0; i < 30; i++) spawn(SPARK, HMM_V3(c.x, c.y, c.z), HMM_V3(rnd(-2.5f, 2.5f), rnd(3, 7), rnd(-2.5f, 2.5f)), 0.9f, rnd(0.06f, 0.14f), HMM_V3(0.8f, 0.95f, 1.0f));
    }
    if (e & EV_LAMP) {
        chime(988, 2, 0.06f, 0.1f);
        for (int k = 0; k < 14; k++) spawn(SPARK, HMM_V3(r.event_at.x, c.y + 1.9f, r.event_at.z), HMM_V3(rnd(-1.5f, 1.5f), rnd(1.5f, 3.5f), rnd(-1.5f, 1.5f)), 0.7f, 0.05f, HMM_V3(5, 3.2f, 1.0f));
    }
    if (e & EV_DONE) {
        chime(660, 3, 0.09f, 0.12f);
        st.chapter.run_done(r);
        save();
        begin_arrive();
    }
}

// ---------- input ----------

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
        if (pad.pressed(xl::PAD_X)) st.use_slot = 0;
        if (pad.pressed(xl::PAD_Y)) st.use_slot = 1;
        if (pad.pressed(xl::PAD_START)) st.restart = true;
        // the d-pad steps on boards
        if (st.go) {
            if (pad.pressed(xl::PAD_UP)) st.key_dir = 0;
            if (pad.pressed(xl::PAD_LEFT)) st.key_dir = 1;
            if (pad.pressed(xl::PAD_DOWN)) st.key_dir = 2;
            if (pad.pressed(xl::PAD_RIGHT)) st.key_dir = 3;
        }
    }
    in.throttle = throttle;
    in.steer = steer;
    return in;
}

// ---------- drawing ----------

struct Frame {
    HMM_Mat4 view_proj, light_vp;
    bool shadow_pass;
    xl::render::Reveal reveal;   // the wave of light for what's being drawn
};
Frame frame_info;

void draw(const GpuMesh& m, const HMM_Mat4& model, HMM_Vec3 tint = HMM_V3(1, 1, 1)) {
    if (!m.ready || !st.pass) return;
    xl::render::Look look;
    look.tint = vec3(tint);
    look.reveal = frame_info.reveal;
    st.pass->draw(m.mesh, mat4(model), look);
}

HMM_Mat4 T(float x, float y, float z) { return HMM_Translate(HMM_V3(x, y, z)); }
HMM_Mat4 R(float a, float x, float y, float z) { return HMM_Rotate_RH(a, HMM_V3(x, y, z)); }
HMM_Mat4 S(float s) { return HMM_Scale(HMM_V3(s, s, s)); }
HMM_Mat4 mul(std::initializer_list<HMM_Mat4> ms) { HMM_Mat4 r = HMM_M4D(1); for (const HMM_Mat4& m : ms) r = HMM_MulM4(r, m); return r; }

HMM_Vec2 to_screen(HMM_Vec3 p) {
    const HMM_Vec4 c = HMM_MulM4V4(frame_info.view_proj, HMM_V4(p.X, p.Y, p.Z, 1));
    if (c.W <= 0) return HMM_V2(-1, -1);
    return HMM_V2(c.X / c.W * 0.5f + 0.5f, c.Y / c.W * 0.5f + 0.5f);
}

/** The land near s, and the districts (ruined, alive, or rising from one to the other). */
void draw_world(float s, float behind, float ahead) {
    const int a = std::max(0, static_cast<int>((s - behind) / CHUNK)), b = std::min(static_cast<int>(st.chunks.size()) - 1, static_cast<int>((s + ahead) / CHUNK));
    for (int i = a; i <= b; i++) draw(st.chunks[i], HMM_M4D(1));
    for (int d = 0; d < DISTRICTS; d++) {
        if (s + ahead < district_s(d) - 20 || s - behind > district_end(d) + 20) continue;
        const float base = st.track.elevation(district_s(d) + 10);
        const auto squash = [&](float k) { return mul({ T(0, base, 0), HMM_Scale(HMM_V3(1, std::max(0.001f, k), 1)), T(0, -base, 0) }); };
        if (!st.chapter.restored[d]) { draw(st.districts[d][0], HMM_M4D(1)); continue; }
        const float r = st.rising[d];
        if (r >= 1) { draw(st.districts[d][1], HMM_M4D(1)); continue; }
        // the ruins sink away, then the district rises with a little overshoot
        if (r < 0.4f) draw(st.districts[d][0], squash(1 - smooth(r / 0.4f)));
        else { const float k = smooth((r - 0.4f) / 0.6f); draw(st.districts[d][1], squash(k + std::sin(k * HMM_PI32) * 0.12f)); }
    }
}

/** The chariot, its wheels, the charioteer and her eyes, where the game's car is; sacks of grain when carrying them. */
void draw_chariot() {
    const Game& g = *st.game;
    const Car& c = g.car;
    const Track& t = st.track;
    if (st.stage == Stage::Failed && (g.run.fail == Fail::Fell || g.run.fail == Fail::Splash)) return;
    const Sample here = t.at(g.run.s);
    const float slope = std::atan2(t.elevation(g.run.s + 1) - t.elevation(g.run.s - 1), 2.0f) * (std::cos(c.yaw) * here.tx + std::sin(c.yaw) * here.tz);
    const float jolt = c.jolt * 0.12f * std::sin(st.time * 40);
    const HMM_Mat4 body = mul({ T(c.x, c.y, c.z), R(-c.yaw, 0, 1, 0), R(st.roll + jolt, 1, 0, 0), R(slope, 0, 0, 1) });
    draw(st.chariot, body);
    draw(st.wheel, mul({ body, T(WHEEL_AT.x, WHEEL_AT.y, WHEEL_AT.z), R(-c.wheel, 0, 0, 1) }));
    draw(st.wheel, mul({ body, T(WHEEL_AT.x, WHEEL_AT.y, -WHEEL_AT.z), R(HMM_PI32, 0, 1, 0), R(c.wheel, 0, 0, 1) }));
    const HMM_Mat4 rider = mul({ body, T(RIDER_HIP.x, RIDER_HIP.y + st.bob, RIDER_HIP.z), R(-c.steer * 0.14f - st.roll * 0.8f, 1, 0, 0), T(-RIDER_HIP.x, -RIDER_HIP.y, -RIDER_HIP.z) });
    draw(st.rider, rider);
    if (g.run.spec.goal == Goal::Deliver && st.chapter.current().kind == BeatKind::Drive)
        for (int k = 0; k < g.run.cargo; k++) draw(st.sack, mul({ body, T(-0.45f + (k / 3) * 0.32f, 1.08f + (k % 3 == 1 ? 0.12f : 0.0f), -0.3f + (k % 3) * 0.3f), S(0.45f) }));
    if (!frame_info.shadow_pass) {
        float glance = -c.steer * 0.35f;
        if (st.talk.open && st.chapter.current().kind == BeatKind::Finale) glance = 0.4f;
        const float lid = LID_OPEN + (LID_SHUT - LID_OPEN) * std::max(st.blink, std::min(1.0f, st.squint) * 0.55f);
        for (int s = -1; s <= 1; s += 2) {
            const HMM_Mat4 eye = mul({ rider, T(EYE_AT.x, EYE_AT.y, s * EYE_AT.z) });
            draw(st.iris, mul({ eye, R(glance, 0, 1, 0) }));
            draw(st.lid, mul({ eye, R(lid, 0, 0, 1) }));
        }
    }
}

/** The lamp road's lamp posts: lit as you pass them (and still lit afterwards). */
void draw_beacons(float near_s) {
    const Track& t = st.track;
    const Run& r = st.game->run;
    const bool lamp_drive = st.chapter.current().kind == BeatKind::Drive && st.chapter.beat == 9;
    for (size_t k = 0; k < t.beacons.size(); k++) {
        const Beacon& b = t.beacons[k];
        if (std::fabs(b.s - near_s) > 120) continue;
        const bool lit = lamp_drive && st.stage != Stage::Intro ? k < r.lit.size() && r.lit[k] : st.chapter.beat > 9 && static_cast<int>(k) < std::max(st.chapter.lamps, st.chapter.beat > 10 ? 12 : 0);
        draw(st.beacons[lit ? 1 : 0], mul({ T(b.x, t.height(b.x, b.z, b.s), b.z), R(std::sin(st.time * 7 + k) * (lit ? 0.02f : 0.0f), 1, 0, 0) }));
    }
}

/** A drive: tools to pick up, the gates, tumbleweeds, and whatever's chasing you. */
void draw_drive() {
    const Game& g = *st.game;
    const Track& t = st.track;
    if (!g.run.spec.shortcut) draw(st.gates, HMM_M4D(1));
    for (size_t i = 0; i < t.pickups.size(); i++) {
        const Pickup& p = t.pickups[i];
        if (p.s < g.run.s - 30 || p.s > g.run.s + 80 || (i < g.run.picked.size() && g.run.picked[i])) continue;
        const float y = (t.on_shortcut(p.x, p.z) ? t.elevation(p.s) : t.height(p.x, p.z, p.s)) + 0.8f + 0.1f * std::sin(st.time * 2.5f + i);
        draw(st.tools[static_cast<int>(p.tool)], mul({ T(p.x, y, p.z), R(st.time * 1.6f + i, 0, 1, 0), S(1.4f) }));
    }
    for (const Tumbleweed& w : g.tumbleweeds) draw(st.tumbleweed, mul({ T(w.x, t.height(w.x, w.z, g.run.s) + 0.4f + 0.15f * std::fabs(std::sin(w.spin * 1.3f)), w.z), R(w.spin, w.vz, 0, -w.vx) }));
    const bool chase = g.run.spec.goal == Goal::Chase && st.stage != Stage::Depart, storm = g.run.spec.goal == Goal::Storm || (st.stage == Stage::Depart && st.chapter.beat == 7);
    const float chaser = st.stage == Stage::Depart ? st.chapter.run_spec(st.chapter.current().index).from - STORM_GAP : g.run.chaser;
    if (chase && g.run.chaser > 0) {   // the zebu, galloping after you
        const Sample p = t.at(g.run.chaser);
        const float gallop = std::fabs(std::sin(st.time * 9)) * 0.25f;
        draw(st.zebu, mul({ T(p.x, t.elevation(p.s) + gallop, p.z), R(-std::atan2(p.tz, p.tx), 0, 1, 0), R(std::sin(st.time * 9) * 0.06f, 0, 0, 1) }));
    }
    if (storm && !frame_info.shadow_pass) {   // a wall of dust rolling up the road
        const Sample p = t.at(chaser);
        for (int k = 0; k < 26; k++) {
            const float lat = -14 + 28 * (k / 25.0f), h = 1.5f + 2.5f * std::fabs(std::sin(k * 1.7f + st.time * 0.8f));
            const float swirl = std::sin(st.time * 1.3f + k) * 1.5f;
            draw(st.puff, mul({ T(p.x - p.tz * lat + p.tx * swirl, t.elevation(p.s) + h * 0.6f, p.z + p.tx * lat + p.tz * swirl), HMM_Scale(HMM_V3(3.2f, h, 3.2f)) }), HMM_V3(0.62f, 0.48f, 0.34f));
        }
    }
}

/** How far a wave of light has risen something at p (1 when there's no wave). */
float risen(HMM_Vec3 p, float radius, HMM_Vec3 at) {
    if (radius < 0) return 1;
    return smooth((radius - std::hypot(p.X - at.X, p.Z - at.Z)) / 2.5f);
}

/** The thief has the Dancing Girl (from the moment he grabs her until he's caught). */
bool stolen() {
    if (st.chapter.beat != 10 || !st.go || st.go->won) return false;
    return !(st.stage == Stage::Arrive && (st.phase == 0 || (st.phase == 1 && st.talk.line < 1)));
}

/** A board: its paint, the stones, everyone on it, the red marks, what lies there; risen as far as the wave of light
 *  has reached (radius < 0: all of it). */
void draw_board(const GoState& g, int index, float radius, HMM_Vec3 at, bool shadow_pass) {
    const Board& b = *g.board;
    const bool lit = radius < 0;
    if (!lit) frame_info.reveal = { at.X, at.Z, radius, true };
    if (!shadow_pass) draw(st.boards[index], HMM_M4D(1));
    // stepping stones: up above the water when you'll land safely on your next move
    for (size_t i = 0; i < b.nodes.size(); i++) {
        if (b.nodes[i].sink < 0) continue;
        const bool down = b.submerged(static_cast<int>(i), g.moves + 1);
        const HMM_Vec3 p = node_pos(static_cast<int>(i));
        draw(st.stone, T(p.X, p.Y + (down ? -0.42f : 0.06f) + 0.02f * std::sin(st.time * 2 + i), p.Z));
    }
    frame_info.reveal = {};
    const float k = smooth(st.hop);
    const HMM_Vec3 me = node_pos(g.player);
    for (size_t i = 0; i < g.pieces.size(); i++) {
        const Piece& p = g.pieces[i];
        HMM_Vec3 at_ = HMM_LerpV3(node_pos(g.before.empty() ? p.node : g.before[i]), k, node_pos(p.node));
        if (p.kind == PieceKind::Thief) {   // he shows himself as he grabs her; caught, he hangs his head
            if (!stolen() && !p.out) continue;
            const float yaw = p.out ? std::atan2(me.Z - at_.Z, me.X - at_.X) : std::atan2(at_.Z - me.Z, at_.X - me.X);
            const float run = st.hop < 1 ? std::sin(st.hop * HMM_PI32) * 0.3f : 0.0f;
            const HMM_Mat4 m = mul({ T(at_.X, at_.Y + run, at_.Z), R(-yaw, 0, 1, 0), R(p.out ? -0.35f : 0.12f, 0, 0, 1), S(1.3f) });
            draw(st.thief, m);
            if (!p.out) draw(st.statue, mul({ m, T(0.42f, 0.78f, 0), S(0.34f) }), HMM_V3(1.7f, 1.5f, 1.25f));
            continue;
        }
        const float pop = risen(at_, radius, at);
        if (pop <= 0.01f) continue;
        const std::vector<int> threat = g.threats(p);
        const int look = p.kind == PieceKind::Watchman ? (threat.empty() ? p.facing : threat.front()) : !threat.empty() ? threat.front() : -1;
        float yaw = 0;
        if (look >= 0 && look != p.node) { const HMM_Vec3 l = node_pos(look); yaw = std::atan2(l.Z - at_.Z, l.X - at_.X); }
        else if (!p.lane.empty()) { const HMM_Vec3 l = node_pos(p.lane.back()), f = node_pos(p.lane.front()); yaw = std::atan2(l.Z - f.Z, l.X - f.X); }
        const float grow = pop * (1 + 0.25f * std::sin(pop * HMM_PI32));
        HMM_Mat4 m = mul({ T(at_.X, at_.Y, at_.Z), R(-yaw, 0, 1, 0), HMM_Scale(HMM_V3(grow, grow, grow)) });
        if (p.out) {   // nudged aside (or waved you through): off to the edge, tipped over unless it was a wave
            const GoNode& n = b.nodes[p.node];
            const Sample s = st.track.at(n.s);
            const float side = n.lat >= 0 ? 1.0f : -1.0f;
            at_ = HMM_AddV3(node_pos(p.node), HMM_V3(-s.tz * side * 1.4f, 0, s.tx * side * 1.4f));
            m = mul({ T(at_.X, at_.Y + 0.25f, at_.Z), R(-yaw, 0, 1, 0), R(1.35f * side, 1, 0, 0), S(grow) });
        }
        const GpuMesh* mesh = &st.handcart;
        switch (p.kind) {
            case PieceKind::Watchman: mesh = &st.watchman; break;
            case PieceKind::Bull: mesh = &st.zebu; break;
            case PieceKind::Sack: mesh = &st.sack; break;
            case PieceKind::Villager: mesh = &st.villagers[i % 4]; break;
            case PieceKind::Cart: case PieceKind::Thief: break;
        }
        draw(*mesh, m);
        if (shadow_pass || p.out || g.won || !lit || st.stage == Stage::Depart) continue;
        const float pulse = 1 + 0.08f * std::sin(st.time * 6);
        for (size_t t = 0; t < threat.size(); t++) {
            const HMM_Vec3 tp = node_pos(threat[t]);
            if (p.kind == PieceKind::Watchman) draw(st.gaze, mul({ T(tp.X, tp.Y + 0.08f, tp.Z), S(pulse * (t == 0 ? 1.0f : 0.8f)) }));
            else { const HMM_Vec3 from = node_pos(p.node); draw(st.chevron, mul({ T(tp.X, tp.Y + 0.09f, tp.Z), R(-std::atan2(tp.Z - from.Z, tp.X - from.X), 0, 1, 0), S(pulse) })); }
        }
    }
    for (size_t i = 0; i < b.items.size(); i++) {
        if (g.taken[i]) continue;
        const HMM_Vec3 p = node_pos(b.items[i].node);
        const float pop = risen(p, radius, at);
        if (pop <= 0.01f) continue;
        const GpuMesh& mesh = b.items[i].tool == Tool::None ? st.fragment : st.tools[static_cast<int>(b.items[i].tool)];
        draw(mesh, mul({ T(p.X, p.Y + 0.8f + 0.1f * std::sin(st.time * 2.5f + i), p.Z), R(st.time * 1.6f + i, 0, 1, 0), S(1.3f * pop) }));
    }
}

/** Where a hint points: golden arrows bobbing over the nodes it's about. */
void draw_hint_pointers() {
    if (!st.go || !st.hint.any() || st.hint_age < 0.25f || st.stage != Stage::Play || st.talk.open || st.hop < 1 || st.caught_timer > 0) return;
    const GoState& g = *st.go;
    const auto point = [&](int n, float k) {
        const HMM_Vec3 p = node_pos(n);
        float lift = 1.3f;
        for (const Piece& q : g.pieces) if (!q.out && q.node == n) lift = q.kind == PieceKind::Sack ? 1.6f : 2.9f;
        draw(st.pointer, mul({ T(p.X, p.Y + lift + 0.25f * std::fabs(std::sin(st.time * 4 + k)), p.Z), R(st.time * 1.5f, 0, 1, 0), S(1.7f) }));
    };
    if (st.hint.hint == Hint::Move) { int k = 0; for (int n : g.board->adj[g.player]) if (!g.board->nodes[n].pillar) point(n, static_cast<float>(k++)); }
    else if (st.hint.node >= 0) point(st.hint.node, 0);
}

/** Whoever's talking to the chariot from beside the road. */
void draw_figure() {
    if (st.figure == Figure::None || st.figure == Figure::Thief) return;
    const HMM_Vec3 p = st.figure_at;
    const float talk = st.talk.open ? std::fabs(std::sin(st.time * 9)) * 0.03f : 0.0f;
    const HMM_Mat4 m = mul({ T(p.X, p.Y + talk, p.Z), R(-st.figure_yaw, 0, 1, 0) });
    switch (st.figure) {
        case Figure::Villager: draw(st.villagers[st.chapter.beat % 4], m); break;
        case Figure::Watchman: draw(st.watchman, m); break;
        case Figure::Zebu: draw(st.zebu, mul({ m, R(std::sin(st.time * 6) * 0.06f, 1, 0, 0) })); break;
        default: break;
    }
}

void draw_particles() {
    for (const Particle& p : st.particles) {
        const float k = p.life / p.max_life;
        const float grow = p.kind == SPARK || p.kind == GRAIN ? std::min(1.0f, k * 3) : (1.0f + (1 - k) * 1.2f) * std::min(1.0f, k * 2.5f);
        draw(st.puff, mul({ T(p.p.X, p.p.Y, p.p.Z), HMM_Scale(HMM_V3(p.size * grow, p.size * grow * (p.kind == SPARK || p.kind == GRAIN ? 1.0f : 0.75f), p.size * grow)) }), p.color);
    }
}

void update_particles(float dt) {
    for (Particle& p : st.particles) {
        p.life -= dt;
        if (p.kind == SPARK || p.kind == GRAIN) p.v.Y -= 14 * dt;
        else { p.v = HMM_MulV3F(p.v, std::exp(-2.5f * dt)); p.v.Y += 0.3f * dt; }
        p.p = HMM_AddV3(p.p, HMM_MulV3F(p.v, dt));
    }
    st.particles.erase(std::remove_if(st.particles.begin(), st.particles.end(), [](const Particle& p) { return p.life <= 0; }), st.particles.end());
}

// ---------- boards ----------

/** You acted on a hint that was showing: it's learnt, and won't show again. */
void learn() {
    if (st.hint.any() && (st.hint_age > 0.4f || st.hint.hint == Hint::Move)) {
        st.hints_seen |= hint_bit(st.hint.hint);
        xl::save("hints", std::to_string(st.hints_seen));
    }
    st.hint = HintCue{};
    st.hint_age = 0;
}

void board_try(int to) {
    GoState& g = *st.go;
    if (to < 0 || st.hop < 1 || st.talk.open || g.won || g.caught || st.stage != Stage::Play) return;
    std::vector<bool> was_out;
    for (const Piece& p : g.pieces) was_out.push_back(p.out);
    const int items = g.items_found();
    const Outcome o = g.move(to);
    if (o == Outcome::Blocked) { play(150, 120, 0.08f, 0.08f, 0); return; }
    learn();
    st.hop = 0;
    play(330, 520, 0.12f, 0.1f, 1);
    if (g.items_found() > items) {
        chime(1320, 2, 0.07f, 0.12f);
        const HMM_Vec3 p = node_pos(to);
        for (int k = 0; k < 10; k++) spawn(SPARK, HMM_AddV3(p, HMM_V3(0, 0.8f, 0)), HMM_V3(rnd(-2, 2), rnd(1.5f, 3.5f), rnd(-2, 2)), 0.6f, 0.05f, HMM_V3(5, 3.6f, 1.2f));
        if (g.clue_found()) { st.notice = "A fragment of an old sculpture!"; st.notice_timer = 2.0f; }
    }
    for (size_t k = 0; k < g.pieces.size(); k++) if (g.pieces[k].out && !was_out[k]) {
        play(120, 60, 0.2f, 0.3f, 2); play(400, 150, 0.12f, 0.15f, 3);
        st.shake = std::max(st.shake, 0.3f);
        const HMM_Vec3 p = node_pos(g.pieces[k].node);
        for (int i = 0; i < 8; i++) spawn(DUST, HMM_AddV3(p, HMM_V3(0, 0.2f, 0)), HMM_V3(rnd(-1.5f, 1.5f), rnd(0.5f, 1.5f), rnd(-1.5f, 1.5f)), 0.7f, 0.18f, HMM_V3(0.85f, 0.68f, 0.48f));
    }
    if (o == Outcome::Caught) {
        play(220, 110, 0.5f, 0.25f, 0); play(160, 80, 0.5f, 0.2f, 0, 0.1f);
        st.caught_timer = 1.6f;
        st.notice = g.caught_by == -2 ? "Splash! That stone was under water." : "Caught! Back to the start."; st.notice_timer = 1.6f;
        if (!(st.hints_seen & hint_bit(Hint::Caught))) { st.notice += "  (R starts over any time)"; st.hints_seen |= hint_bit(Hint::Caught); xl::save("hints", std::to_string(st.hints_seen)); }
        st.shake = 0.6f; st.squint = 1.4f;
        xl::rumble(0.6f, 0.4f, 200, true);
    }
    if (o == Outcome::Won) board_cleared();
}

void board_use(int slot) {
    GoState& g = *st.go;
    if (st.hop < 1 || st.talk.open || g.won || g.caught || st.stage != Stage::Play || slot >= static_cast<int>(g.bag.size())) return;
    const Tool t = g.bag[slot];
    const Outcome o = g.use(slot);
    if (o == Outcome::Blocked) {
        play(150, 120, 0.08f, 0.08f, 0);
        st.notice = t == Tool::Seal ? "The seal works on a watchman right beside you" : "That won't do anything here";
        st.notice_timer = 1.6f;
        return;
    }
    learn();
    st.hop = 0;
    switch (t) {
        case Tool::Bell: for (int i = 0; i < 4; i++) play(1200, 1180, 0.6f, 0.08f, 2, i * 0.15f); st.notice = "The bell rings: the watchmen turn round"; break;
        case Tool::Seal: play(440, 660, 0.2f, 0.1f, 1); st.notice = "The watchman bows and waves you through"; break;
        case Tool::Beads: play(1800, 2400, 0.1f, 0.06f, 1); play(2100, 2600, 0.1f, 0.06f, 1, 0.08f); st.notice = "The cart drivers stop to admire the beads"; break;
        case Tool::Grain: play(300, 200, 0.3f, 0.1f, 3); st.notice = "The zebu stops to eat"; break;
        case Tool::None: break;
    }
    st.notice_timer = 1.8f;
    if (o == Outcome::Caught) { st.caught_timer = 1.6f; st.notice = "Caught!"; }
}

/** The neighbouring node nearest a direction on screen (0 up, 1 left, 2 down, 3 right), or -1. */
int node_towards(int dir) {
    const float w = sapp_widthf(), h = sapp_heightf();
    const float want[4][2] = { { 0, 1 }, { -1, 0 }, { 0, -1 }, { 1, 0 } };
    const GoState& g = *st.go;
    const HMM_Vec2 a = to_screen(node_pos(g.player));
    int best = -1;
    float best_dot = 0.35f;
    for (int n : g.board->adj[g.player]) {
        if (g.board->nodes[n].pillar) continue;
        const HMM_Vec2 b = to_screen(node_pos(n));
        float dx = (b.X - a.X) * w, dy = (b.Y - a.Y) * h;
        const float l = std::sqrt(dx * dx + dy * dy);
        if (l < 1e-3f) continue;
        dx /= l; dy /= l;
        const float d = dx * want[dir][0] + dy * want[dir][1];
        if (d > best_dot) { best_dot = d; best = n; }
    }
    return best;
}

/** The neighbouring node under the pointer, or -1. */
int node_clicked() {
    const float w = sapp_widthf(), h = sapp_heightf();
    const GoState& g = *st.go;
    int best = -1;
    float best_d = 0.09f * h;
    for (int n : g.board->adj[g.player]) {
        const HMM_Vec2 b = to_screen(node_pos(n));
        const float d = std::hypot(b.X * w - st.mouse.X, (1 - b.Y) * h - st.mouse.Y);
        if (d < best_d) { best_d = d; best = n; }
    }
    return best;
}

void board_update(float dt) {
    GoState& g = *st.go;
    st.hop = std::min(1.0f, st.hop + dt / 0.32f);
    if (st.caught_timer > 0) {
        st.caught_timer -= dt;
        if (st.caught_timer <= 0) { g.reset(); st.hop = 1; play(440, 660, 0.2f, 0.1f, 1); }
    }
    if (st.key_dir >= 0) { board_try(node_towards(st.key_dir)); st.key_dir = -1; }
    if (st.use_slot >= 0) { board_use(st.use_slot); st.use_slot = -1; }
    if (st.clicked && !st.talk.open) board_try(node_clicked());
    st.clicked = false;
    if (st.autopilot && st.stage == Stage::Play && !st.talk.open && st.hop >= 1 && !g.won && !g.caught && (st.auto_timer += dt) > 0.25f) { st.auto_timer = 0; board_try(best_move(g)); }
    // the hint for this moment, if there's one left to learn
    if (st.stage == Stage::Play && !st.talk.open && st.hop >= 1 && st.caught_timer <= 0 && !g.won && !g.caught) {
        const HintCue cue = next_hint(g, st.hints_seen);
        if (cue.hint != st.hint.hint || cue.node != st.hint.node || cue.slot != st.hint.slot) { st.hint = cue; st.hint_age = 0; }
        else st.hint_age += dt;
    }
    // the chariot hops from node to node
    Car& c = st.game->car;
    const HMM_Vec3 a = node_pos(g.from), b = node_pos(g.player);
    const float k = smooth(st.hop);
    const HMM_Vec3 p = HMM_LerpV3(a, k, b);
    c.x = p.X; c.z = p.Z; c.y = p.Y + std::sin(HMM_PI32 * st.hop) * 0.45f;
    if (g.from != g.player) c.yaw += wrap(std::atan2(b.Z - a.Z, b.X - a.X) - c.yaw) * std::min(1.0f, dt * 14);
    c.wheel += (st.hop < 1 ? dt * 9 : 0);
    st.game->run.s = g.board->nodes[g.player].s;
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

void star(float cx, float cy, float r, bool lit) {
    sgl_begin_triangles();
    for (int i = 0; i < 5; i++) {
        const float a0 = -HMM_PI32 / 2 + i * 2 * HMM_PI32 / 5, a1 = a0 + HMM_PI32 / 5, a2 = a0 + 2 * HMM_PI32 / 5;
        const float c0 = lit ? 1.0f : 0.55f, c1 = lit ? 0.78f : 0.5f, c2 = lit ? 0.25f : 0.45f;
        sgl_c4f(c0, c1, c2, 1);
        sgl_v2f(cx, cy); sgl_v2f(cx + std::cos(a0) * r, cy + std::sin(a0) * r); sgl_v2f(cx + std::cos(a1) * r * 0.45f, cy + std::sin(a1) * r * 0.45f);
        sgl_v2f(cx, cy); sgl_v2f(cx + std::cos(a1) * r * 0.45f, cy + std::sin(a1) * r * 0.45f); sgl_v2f(cx + std::cos(a2) * r, cy + std::sin(a2) * r);
    }
    sgl_end();
}

/** A speech bubble over a point on screen (pixels), with a tail pointing down at it. */
void bubble(float px, float py, const std::string& who, const std::string& full, const std::string& text, float w, float h, float s, Rgb name_col) {
    const xl::txt::Text& Tx = st.text;
    const float px_size = 16 * s, max_w = std::min(420 * s, w * 0.42f);
    const std::vector<std::string> sized = Tx.wrap(full, px_size, max_w);
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
    if (!st.talk.open || !st.talk.lines) return;
    const Line& line = (*st.talk.lines)[st.talk.line];
    const std::string full = line.text, text = full.substr(0, static_cast<size_t>(st.talk.shown));
    const xl::txt::Text& Tx = st.text;
    const float pulse = 0.5f + 0.5f * std::sin(st.time * 5);
    const bool local = line.who == Speaker::Local, seen = local && st.figure != Figure::None;
    if (line.who == Speaker::Narrator || (local && !seen)) {   // a card at the bottom (a local you can't see gets their name on it)
        const float cw = std::min(760 * s, w - 40 * s), x0 = w / 2 - cw / 2;
        const std::vector<std::string> lines = Tx.wrap(full, 17 * s, cw - 48 * s);
        const float ch = (40 + 23 * lines.size()) * s + 18 * s, y0 = h - ch - 26 * s;
        panel(x0 + 4 * s, y0 + 5 * s, x0 + cw + 4 * s, y0 + ch + 5 * s, 16 * s, 0.1f, 0.06f, 0.04f, 0.3f);
        panel(x0, y0, x0 + cw, y0 + ch, 16 * s, 0.98f, 0.92f, 0.78f, 0.95f);
        rect(x0 + 18 * s, y0 + 32 * s, x0 + cw - 18 * s, y0 + 33.5f * s, 0.75f, 0.55f, 0.3f, 0.6f);
        std::string who = local ? speaker_name(line) : "NARRATOR";
        for (char& ch_ : who) ch_ = static_cast<char>(std::toupper(static_cast<unsigned char>(ch_)));
        Tx.draw(who, x0 + 24 * s, y0 + 10 * s, 14 * s, local ? Rgb{ 0.12f, 0.5f, 0.55f } : Rgb{ 0.72f, 0.36f, 0.12f }, xl::txt::LEFT, 1, false);
        float y = y0 + 42 * s;
        for (const std::string& l : Tx.wrap(text, 17 * s, cw - 48 * s)) { Tx.draw(l, x0 + 24 * s, y, 17 * s, { 0.2f, 0.13f, 0.08f }, xl::txt::LEFT, 1, false); y += 23 * s; }
        Tx.draw("space", x0 + cw - 24 * s, y0 + ch - 24 * s, 12 * s, { 0.6f, 0.4f, 0.2f }, xl::txt::RIGHT, 0.5f + 0.5f * pulse, false);
    } else {
        const bool guide = line.who == Speaker::Guide;
        const HMM_Vec2 at = guide ? st.guide_screen : local ? st.local_screen : st.car_screen;
        const Rgb col = guide ? Rgb{ 0.82f, 0.4f, 0.1f } : local ? Rgb{ 0.12f, 0.5f, 0.55f } : Rgb{ 0.75f, 0.52f, 0.05f };
        bubble(at.X * w, (1 - at.Y) * h, speaker_name(line), full, text, w, h, s, col);
        Tx.draw("space to continue", w / 2, h - 30 * s, 13 * s, { 1, 1, 1 }, xl::txt::CENTRE, 0.5f + 0.5f * pulse);
    }
}

/** The bag: two slots, bottom left. */
void draw_bag(float h, float s, bool board, int highlight = -1) {
    const xl::txt::Text& Tx = st.text;
    const bool playing = st.stage == Stage::Play || st.stage == Stage::Failed || st.stage == Stage::Results;
    const std::vector<Tool>& bag = st.go && playing ? st.go->bag : st.chapter.current().kind == BeatKind::Drive && playing ? st.game->run.bag : st.chapter.bag;
    const float x = 18 * s, y = h - 58 * s;
    Tx.draw("BAG", x, y - 18 * s, 12 * s, { 0.9f, 0.92f, 1.0f });
    for (int k = 0; k < 2; k++) {
        const float x0 = x + k * 112 * s;
        const bool has = k < static_cast<int>(bag.size());
        if (k == highlight) { const float g = 4 * s + 2 * s * std::sin(st.time * 8); panel(x0 - g, y - g, x0 + 104 * s + g, y + 38 * s + g, 13 * s, 1.0f, 0.8f, 0.3f, 0.9f); }
        panel(x0, y, x0 + 104 * s, y + 38 * s, 10 * s, has ? 0.98f : 0.1f, has ? 0.9f : 0.08f, has ? 0.72f : 0.12f, has ? 0.92f : 0.45f);
        if (!has) continue;
        Tx.draw(tool_name(bag[k]), x0 + 12 * s, y + 9 * s, 17 * s, { 0.35f, 0.2f, 0.08f }, xl::txt::LEFT, 1, false);
        if (board) Tx.draw(std::to_string(k + 1), x0 + 92 * s, y + 12 * s, 13 * s, { 0.6f, 0.4f, 0.2f }, xl::txt::RIGHT, 1, false);
    }
}

/** What each way of solving the Lower Town means for the road ahead (shown on its results card). */
const char* consequence(int board, Style style, Tool gift) {
    if (board == 0) switch (style) {
        case Style::Quiet: return "Nobody noticed you. A potter will show you a shortcut.";
        case Style::Rough: return "You stirred up the zebu. It's coming after you!";
        case Style::Slow: return "You took your time. The Granary's gates close soon: hurry.";
        case Style::Steady: return "Onward along the canal road, before the Granary closes.";
    }
    if (board == BOARDS - 1) return "The Dancing Girl is back on her plinth, and the plaza cheers.";
    if (gift != Tool::None) return "Quietly done: someone grateful gives you a gift.";
    switch (style) {
        case Style::Quiet: return "Quietly done.";
        case Style::Rough: return "A bit rough. Nobody will forget that.";
        case Style::Slow: return "Slow, but you made it.";
        case Style::Steady: return "Steadily done.";
    }
    return "";
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
    const float pulse = 0.5f + 0.5f * std::sin(st.time * 5);
    const Beat& beat = st.chapter.current();

    if (st.stage == Stage::Title) {
        const float a = std::min(1.0f, st.time * 1.2f);
        Tx.draw("JYOTIRATH", w / 2, h * 0.12f, 56 * s, gold, xl::txt::CENTRE, a);
        Tx.draw("Chapter I - Mohenjo-Daro", w / 2, h * 0.12f + 64 * s, 20 * s, pale, xl::txt::CENTRE, a);
        const std::string start = xl::focused() || xl::gamepad().connected ? (st.chapter.beat > 0 ? "PRESS W TO CONTINUE" : "PRESS W TO BEGIN") : "CLICK TO PLAY";
        Tx.draw(start, w / 2, h * 0.76f, 26 * s, { 0.8f + 0.2f * pulse, 0.8f + 0.2f * pulse, 1.0f }, xl::txt::CENTRE);
        if (st.chapter.beat > 0) Tx.draw(std::string("from ") + beat.title + "      N  start a new journey", w / 2, h * 0.76f + 36 * s, 15 * s, gold, xl::txt::CENTRE);
        Tx.draw("drive: W A S D      in the city: W A S D or click, 1 2 tools      space: talk", w / 2, h * 0.76f + 60 * s, 14 * s, pale, xl::txt::CENTRE);
        sgl_set_context(sgl_default_context());
        return;
    }

    // top left: the chapter, the beat, progress dots
    const float x = 18 * s, y = 14 * s;
    Tx.draw("Chapter I - Mohenjo-Daro", x, y, 14 * s, pale);
    Tx.draw(beat.title, x, y + 20 * s, 24 * s, white);
    const int beats = static_cast<int>(chapter_beats().size());
    for (int i = 0; i < beats; i++) {
        const bool board = chapter_beats()[i].kind == BeatKind::Board;
        const float cx = x + 6 * s + i * 16 * s, cy = y + 58 * s, r = (board ? 5.0f : 3.5f) * s;
        const bool done = i < st.chapter.beat, now = i == st.chapter.beat;
        panel(cx - r, cy - r, cx + r, cy + r, r, done ? 1.0f : now ? 1.0f : 0.4f, done ? 0.75f : now ? 1.0f : 0.4f, done ? 0.3f : now ? 1.0f : 0.45f, now ? 0.6f + 0.4f * pulse : 0.9f);
    }

    if (beat.kind == BeatKind::Drive && (st.stage == Stage::Play || st.stage == Stage::Failed)) {
        const Run& r = st.game->run;
        Tx.draw(goal_text(r.spec), w / 2, 16 * s, 20 * s, saffron, xl::txt::CENTRE);
        std::string info;
        char buf[64];
        switch (r.spec.goal) {
            case Goal::Reach: std::snprintf(buf, sizeof buf, "%d m to go", std::max(0, static_cast<int>(r.spec.to - r.s))); info = buf; break;
            case Goal::Chase: std::snprintf(buf, sizeof buf, "the zebu: %d m behind", std::max(0, static_cast<int>(r.s - r.chaser))); info = buf; break;
            case Goal::Storm: std::snprintf(buf, sizeof buf, "the storm: %d m behind", std::max(0, static_cast<int>(r.s - r.chaser))); info = buf; break;
            case Goal::Clock: std::snprintf(buf, sizeof buf, "%.1f s left", std::max(0.0f, r.spec.time - r.time)); info = buf; break;
            case Goal::Deliver: std::snprintf(buf, sizeof buf, "grain: %d of %d sacks", r.cargo, r.spec.cargo); info = buf; break;
            case Goal::Lamps: std::snprintf(buf, sizeof buf, "light: %.1f s      lamps lit: %d of %d", std::max(0.0f, r.light), r.lamps, static_cast<int>(st.track.beacons.size())); info = buf; break;
        }
        const bool danger = (r.spec.goal == Goal::Chase || r.spec.goal == Goal::Storm) ? r.s - r.chaser < 12 : r.spec.goal == Goal::Clock ? r.spec.time - r.time < 6 : r.spec.goal == Goal::Lamps ? r.light < 4 : r.spec.goal == Goal::Deliver && r.cargo <= 2;
        Tx.draw(info, w / 2, 44 * s, 17 * s, danger ? Rgb{ 1.0f, 0.4f + 0.3f * pulse, 0.3f } : white, xl::txt::CENTRE);
    }
    int highlight = -1;
    if (beat.kind == BeatKind::Board && st.go && (st.stage == Stage::Play || st.stage == Stage::Results)) {
        const GoState& g = *st.go;
        Tx.draw("moves " + std::to_string(g.moves) + "   par " + std::to_string(g.board->par), w / 2, 16 * s, 20 * s, white, xl::txt::CENTRE);
        Tx.draw(g.nudges == 0 ? "unseen so far" : std::to_string(g.nudges) + " nudged aside", w / 2, 42 * s, 14 * s, g.nudges == 0 ? Rgb{ 0.6f, 0.95f, 0.7f } : Rgb{ 1.0f, 0.7f, 0.5f }, xl::txt::CENTRE);
        if (!st.talk.open && st.stage == Stage::Play) Tx.draw("W A S D or click a node     1 2 use a tool     R start over", w / 2, h - 30 * s, 14 * s, white, xl::txt::CENTRE, 0.6f + 0.4f * pulse);
        // the hint for this moment: a card under the moves, keys over the nodes you can step to, the tool's slot lit
        if (st.hint.any() && st.hint_age > 0.25f && st.stage == Stage::Play && !st.talk.open && st.hop >= 1 && st.caught_timer <= 0) {
            const float a = std::min(1.0f, (st.hint_age - 0.25f) * 4);
            const std::string text = hint_text(st.hint);
            const float cw = std::min(560 * s, w - 40 * s), x0 = w / 2 - cw / 2, y0 = 66 * s;
            const std::vector<std::string> lines = Tx.wrap(text, 16 * s, cw - 92 * s);
            const float ch = (20 + 21 * lines.size()) * s;
            panel(x0 + 3 * s, y0 + 4 * s, x0 + cw + 3 * s, y0 + ch + 4 * s, 12 * s, 0.1f, 0.06f, 0.04f, 0.25f * a);
            panel(x0, y0, x0 + cw, y0 + ch, 12 * s, 0.98f, 0.93f, 0.8f, 0.95f * a);
            panel(x0 + 12 * s, y0 + ch / 2 - 13 * s, x0 + 62 * s, y0 + ch / 2 + 13 * s, 8 * s, 0.95f, 0.62f, 0.2f, a);
            Tx.draw("TIP", x0 + 37 * s, y0 + ch / 2 - 8 * s, 15 * s, { 1, 1, 1 }, xl::txt::CENTRE, a, false);
            float ly = y0 + 10 * s;
            for (const std::string& l : lines) { Tx.draw(l, x0 + 76 * s, ly, 16 * s, { 0.22f, 0.14f, 0.08f }, xl::txt::LEFT, a, false); ly += 21 * s; }
            if (st.hint.hint == Hint::Move) {   // each node you can step to, with the key that points at it best
                const char* keys[4] = { "W", "A", "S", "D" };
                const float want[4][2] = { { 0, 1 }, { -1, 0 }, { 0, -1 }, { 1, 0 } };
                const HMM_Vec2 me = to_screen(node_pos(st.go->player));
                for (int n : st.go->board->adj[st.go->player]) {
                    const HMM_Vec2 p = to_screen(node_pos(n));
                    const float dx = (p.X - me.X) * w, dy = (p.Y - me.Y) * h;
                    int key = -1;
                    float best = -2;
                    for (int d = 0; d < 4; d++) {
                        const float dot = dx * want[d][0] + dy * want[d][1];
                        if (dot > best && node_towards(d) == n) { best = dot; key = d; }
                    }
                    if (key < 0) continue;
                    const float px = p.X * w, py = (1 - p.Y) * h + 24 * s;
                    panel(px - 16 * s, py - 16 * s, px + 16 * s, py + 16 * s, 7 * s, 0.12f, 0.09f, 0.08f, 0.85f * a);
                    Tx.draw(keys[key], px, py - 11 * s, 19 * s, gold, xl::txt::CENTRE, a, false);
                }
            }
            highlight = st.hint.slot;
        }
    }
    if (beat.kind != BeatKind::Finale && st.stage != Stage::Complete) draw_bag(h, s, beat.kind == BeatKind::Board, highlight);
    // rolling out into a drive: ready... go
    if (st.stage == Stage::Depart && st.phase == 1 && st.glide.on) {
        const float left = st.glide.T - st.glide.t;
        const int n = static_cast<int>(std::ceil(left / std::max(0.3f, st.glide.T / 3)));
        const float k = 1 - std::fmod(left, std::max(0.3f, st.glide.T / 3)) / std::max(0.3f, st.glide.T / 3);
        if (n >= 1 && n <= 3) Tx.draw(std::to_string(n), w / 2, h * 0.3f, (56 + 24 * k) * s, saffron, xl::txt::CENTRE, 1 - k * 0.6f);
        Tx.draw(goal_text(st.chapter.run_spec(beat.index)), w / 2, 16 * s, 20 * s, saffron, xl::txt::CENTRE);
    }

    if (st.title_timer > 0) {
        const float k = std::min(1.0f, (3.0f - st.title_timer) * 4), a = std::min(1.0f, st.title_timer * 1.5f);
        Tx.draw(st.title, w / 2, h * 0.17f, 42 * s * (1 + 0.15f * (1 - k)), saffron, xl::txt::CENTRE, a);
    }
    if (st.notice_timer > 0) Tx.draw(st.notice, w / 2, h * 0.3f, 26 * s, white, xl::txt::CENTRE, std::min(1.0f, st.notice_timer * 2));

    if (st.stage == Stage::Results && !st.talk.open && st.go) {
        const GoState& g = *st.go;
        const float cw = std::min(600 * s, w - 40 * s), ch = 260 * s, x0 = w / 2 - cw / 2, y0 = h * 0.16f;
        panel(x0, y0, x0 + cw, y0 + ch, 18 * s, 0.98f, 0.92f, 0.78f, 0.95f);
        Tx.draw(st.result_board == BOARDS - 1 ? std::string("Caught him!") : std::string(g.board->name) + ", restored", w / 2, y0 + 16 * s, 30 * s, saffron, xl::txt::CENTRE);
        for (int i = 0; i < 3; i++) star(w / 2 + (i - 1) * 54 * s, y0 + 88 * s, 22 * s, i < g.stars());
        Tx.draw("moves " + std::to_string(g.moves) + " (par " + std::to_string(g.board->par) + ")    found " + std::to_string(g.items_found()) + " / " + std::to_string(g.board->items.size()), w / 2, y0 + 124 * s, 16 * s, { 0.25f, 0.16f, 0.1f }, xl::txt::CENTRE, 1, false);
        float ly = y0 + 156 * s;
        for (const std::string& l : Tx.wrap(consequence(st.result_board, st.result_style, st.gift), 18 * s, cw - 60 * s)) { Tx.draw(l, w / 2, ly, 18 * s, { 0.55f, 0.28f, 0.08f }, xl::txt::CENTRE, 1, false); ly += 24 * s; }
        Tx.draw("space: on to " + std::string(chapter_beats()[std::min(st.chapter.beat, beats - 1)].title), w / 2, y0 + ch - 34 * s, 16 * s, { 0.4f, 0.25f, 0.12f }, xl::txt::CENTRE, 0.6f + 0.4f * pulse, false);
    }
    if (st.stage == Stage::Complete) {
        const float cw = std::min(600 * s, w - 40 * s), ch = 280 * s, x0 = w / 2 - cw / 2, y0 = h * 0.14f;
        panel(x0, y0, x0 + cw, y0 + ch, 18 * s, 0.98f, 0.92f, 0.78f, 0.95f);
        Tx.draw(st.chapter.fragment ? "CHAPTER I COMPLETE" : "THE CITY LIVES AGAIN", w / 2, y0 + 18 * s, 32 * s, saffron, xl::txt::CENTRE);
        int total = 0;
        for (int b = 0; b < BOARDS; b++) total += st.chapter.stars[b];
        const float col = std::min(92 * s, (cw - 20 * s) / BOARDS);
        for (int b = 0; b < BOARDS; b++) {
            const float cx = w / 2 + (b - (BOARDS - 1) / 2.0f) * col;
            Tx.draw(chapter_board(b).name + 4, cx, y0 + 74 * s, 12 * s, { 0.4f, 0.25f, 0.12f }, xl::txt::CENTRE, 1, false);
            for (int i = 0; i < 3; i++) star(cx + (i - 1) * 20 * s, y0 + 106 * s, 8 * s, i < st.chapter.stars[b]);
        }
        Tx.draw("stars " + std::to_string(total) + " / " + std::to_string(BOARDS * 3) + "      lamps lit " + std::to_string(st.chapter.lamps) + " / " + std::to_string(st.track.beacons.size()), w / 2, y0 + 130 * s, 16 * s, { 0.25f, 0.16f, 0.1f }, xl::txt::CENTRE, 1, false);
        Tx.draw(st.chapter.fragment ? "Next: Checkpoint 2, the Ajanta Caves (coming soon)" : "Find the fragment near the Great Stupa to learn where the road goes next", w / 2, y0 + 170 * s, 16 * s, { 0.55f, 0.3f, 0.1f }, xl::txt::CENTRE, 1, false);
        Tx.draw("N: a new journey (try the other ways through)", w / 2, y0 + ch - 40 * s, 16 * s, { 0.4f, 0.25f, 0.12f }, xl::txt::CENTRE, 0.6f + 0.4f * pulse, false);
    }
    draw_dialogue(w, h, s);
    sgl_set_context(sgl_default_context());
}

// ---------- frame ----------

void frame() {
    if (xl::paused()) return;
    const float dt = std::min(0.1f, static_cast<float>(sapp_frame_duration()));
    xl::report_frame(dt);
    st.time += dt;
    st.stage_time += dt;
    Game& g = *st.game;
    const Beat& beat = st.chapter.current();

    const Input in = read_input();
    xl::end_frame();
    if (st.stage == Stage::Title) {
        if (st.fresh) { st.fresh = false; new_journey(); }
        else if (in.throttle > 0 || st.advance) { st.advance = false; enter_beat(); }
    } else {
        if (st.menu) { st.menu = false; st.stage = Stage::Title; st.talk = Dialogue{}; }
        if (st.fresh && (st.stage == Stage::Complete)) { st.fresh = false; new_journey(); }
        if (st.restart) {
            st.restart = false;
            if (st.go && st.stage == Stage::Play) { st.go->reset(); st.hop = 1; }
            else if (beat.kind == BeatKind::Drive && (st.stage == Stage::Play || st.stage == Stage::Failed)) { st.game->start(st.chapter.run_spec(beat.index), st.chapter.bag); st.stage = Stage::Play; }
        }
        if (st.advance) {
            st.advance = false;
            if (st.talk.open) advance_dialogue();
            else if (!skip_scene()) continue_on();
        }
        // the dialogue types itself out
        if (st.talk.open && st.talk.lines) {
            const Line& line = (*st.talk.lines)[st.talk.line];
            const float len = static_cast<float>(std::strlen(line.text));
            const float before = st.talk.shown;
            st.talk.shown = std::min(len, st.talk.shown + dt * 55);
            if (st.talk.shown >= len) st.talk.idle += dt;
            if (static_cast<int>(st.talk.shown / 3) != static_cast<int>(before / 3) && st.talk.shown < len) play(line.who == Speaker::Narrator ? 520.0f : 760.0f, 700, 0.025f, 0.025f, 1);
            if (st.autopilot && st.talk.idle > 0.3f) advance_dialogue();
        }
        if (st.autopilot && !st.talk.open && st.stage == Stage::Results && st.stage_time > 1.0f) continue_on();
        update_scene(dt);

        if (beat.kind == BeatKind::Drive && (st.stage == Stage::Intro || st.stage == Stage::Play || st.stage == Stage::Failed)) {
            const bool landing = g.run.state == RunState::Landing;
            const bool driving = (st.stage == Stage::Play || landing) && !st.talk.open;
            if (driving || st.stage == Stage::Failed) {
                st.accumulator = std::min(st.accumulator + dt, DT * 12);
                while (st.accumulator >= DT) {
                    st.accumulator -= DT;
                    g.step(driving ? in : Input{}, DT);
                    drive_events();
                    if (landing && g.run.state == RunState::Driving && st.stage == Stage::Intro) open_lines(beat_intro(st.chapter));
                    if (st.chapter.current().kind != BeatKind::Drive || &st.chapter.current() != &beat) break;   // the drive ended
                }
            } else {
                // waiting for the words: the chariot stays put (and settles after landing)
                st.accumulator = 0;
            }
            if (st.stage == Stage::Failed) {
                st.fail_timer -= dt;
                if (st.fail_timer <= 0) { st.game->start(st.chapter.run_spec(beat.index), st.chapter.bag); st.stage = Stage::Play; play(440, 660, 0.2f, 0.1f, 1); }
            }
        }
        if ((beat.kind == BeatKind::Board || st.stage == Stage::Results) && st.go && !st.glide.on) board_update(dt);   // (the last hop finishes under the results card)
    }
    update_particles(dt);
    for (int d = 0; d < DISTRICTS; d++) if (st.rising[d] > 0 && st.rising[d] < 1) {
        st.rising[d] = std::min(1.0f, st.rising[d] + dt / 2.4f);
        if (st.rising[d] > 0.4f && std::fmod(st.time, 0.05f) < dt) {   // dust as it rises
            const float s0 = district_s(d) + rnd(0, district_end(d) - district_s(d));
            const Sample p = st.track.at(s0);
            const float lat = rnd(-12, 12);
            spawn(DUST, HMM_V3(p.x - p.tz * lat, st.track.elevation(s0) + 0.3f, p.z + p.tx * lat), HMM_V3(rnd(-1, 1), rnd(0.5f, 1.5f), rnd(-1, 1)), 1.2f, rnd(0.2f, 0.4f), HMM_V3(0.85f, 0.7f, 0.5f));
        }
        if (st.rising[d] >= 1 && st.districts[d][0].ready) { st.renderer->release(st.districts[d][0].mesh); st.districts[d][0] = GpuMesh{}; }
    }
    st.title_timer = std::max(0.0f, st.title_timer - dt);
    st.notice_timer = std::max(0.0f, st.notice_timer - dt);
    st.shake = std::max(0.0f, st.shake - dt * 2.2f);
    st.squint = std::max(0.0f, st.squint - dt);
    stream(g.run.s);

    // the charioteer's life: blinks, lean, bob
    const Car& c = g.car;
    st.next_blink -= dt;
    if (st.next_blink <= 0) { st.blink = 1; st.next_blink = 1.8f + rnd(0, 3.2f); }
    st.blink = std::max(0.0f, st.blink - dt * 7);
    const float speed = std::sqrt(c.vx * c.vx + c.vz * c.vz);
    st.roll += ((c.yaw_rate * speed * 0.012f) - st.roll) * std::min(1.0f, dt * 6);
    const Surface surf = st.track.surface(c.x, c.z, g.run.s);
    st.bob = std::sin(st.time * 13) * 0.012f * std::min(1.0f, speed / 8) * (surf == Surface::Ground ? 2.0f : 1.0f);
    const bool driving = beat.kind == BeatKind::Drive && st.stage == Stage::Play;
    if (driving && speed > 3 && (surf == Surface::Ground || c.drifting) && std::fmod(st.time, 0.09f) < dt) {
        for (int side = -1; side <= 1; side += 2) {
            const float wx = c.x + std::cos(c.yaw) * WHEEL_AT.x - std::sin(c.yaw) * WHEEL_AT.z * side, wz = c.z + std::sin(c.yaw) * WHEEL_AT.x + std::cos(c.yaw) * WHEEL_AT.z * side;
            spawn(DUST, HMM_V3(wx, c.y + 0.1f, wz), HMM_V3(rnd(-0.5f, 0.5f) - c.vx * 0.08f, rnd(0.3f, 0.8f), rnd(-0.5f, 0.5f) - c.vz * 0.08f), 0.6f, rnd(0.1f, 0.18f), HMM_V3(0.85f, 0.68f, 0.48f));
        }
    }
    if (driving && g.run.spec.goal == Goal::Chase && std::fmod(st.time, 0.1f) < dt) { const Sample p = st.track.at(g.run.chaser - 1); spawn(DUST, HMM_V3(p.x, st.track.elevation(p.s) + 0.2f, p.z), HMM_V3(rnd(-1, 1), rnd(0.3f, 1), rnd(-1, 1)), 0.8f, 0.3f, HMM_V3(0.85f, 0.7f, 0.5f)); }

    // sound
    rumble_level += ((driving ? std::min(1.0f, speed / 12) : 0.0f) - rumble_level) * std::min(1.0f, dt * 8);
    rumble_tone = 40 + speed * 4;
    hiss_level += ((driving && (surf == Surface::Ground || c.drifting) ? std::min(1.0f, speed / 8) : 0.0f) - hiss_level) * std::min(1.0f, dt * 8);
    const float storm_near = driving && g.run.spec.goal == Goal::Storm ? std::max(0.0f, 1 - (g.run.s - g.run.chaser) / 40) : 0.0f;
    storm_level += (storm_near * 0.5f - storm_level) * std::min(1.0f, dt * 3);

    // camera: high, a narrow lens, looking up the road from behind and to the side; higher over the boards. `mode`
    // blends between the two, so a scene's camera rises over a board as its lanes light and sinks behind the chariot
    // as it rolls out
    const float w = sapp_widthf(), h = sapp_heightf();
    float want_mode = 0;
    switch (st.stage) {
        case Stage::Arrive: want_mode = st.phase < 2 && beat.index != BOARDS - 1 ? 0.25f : 1.0f; break;
        case Stage::Depart: want_mode = st.phase == 0 ? 0.6f : 0.0f; break;
        case Stage::Intro: case Stage::Play: case Stage::Results: want_mode = beat.kind == BeatKind::Board ? 1.0f : beat.kind == BeatKind::Finale ? 0.35f : 0.0f; break;
        case Stage::Complete: want_mode = 0.35f; break;
        default: break;
    }
    if (st.snap) st.mode = want_mode;
    st.mode += (want_mode - st.mode) * std::min(1.0f, dt * 1.6f);
    const float m = smooth(st.mode);
    const Sample road = st.track.at(g.run.s + 6 + 8 * m);
    const float want_yaw = std::atan2(road.tz, road.tx) + HMM_PI32 + 0.75f - 0.4f * m;   // boards: the lanes run up the screen
    st.cam_yaw = st.stage == Stage::Title ? want_yaw + std::sin(st.time * 0.15f) * 0.3f : st.cam_yaw + wrap(want_yaw - st.cam_yaw) * std::min(1.0f, dt * (st.snap ? 100.0f : 0.9f));
    if (st.stage != Stage::Title && g.run.state != RunState::Landing) st.intro = std::max(0.0f, st.intro - dt * 0.7f);
    const float e = st.intro * st.intro * (3 - 2 * st.intro);
    HMM_Vec3 focus = HMM_V3(c.x + c.vx * 0.3f, c.y + 0.8f, c.z + c.vz * 0.3f);
    if (g.run.state == RunState::Landing || st.stage == Stage::Title) focus = HMM_V3(c.x, st.track.elevation(g.run.s) + 0.8f, c.z);
    {   // over a board, look ahead up the lanes, so you can plan
        const Sample ahead = st.track.at(g.run.s + 14);
        const HMM_Vec3 board = HMM_LerpV3(HMM_V3(c.x, st.track.elevation(g.run.s) + 0.8f, c.z), 0.55f, HMM_V3(ahead.x, st.track.elevation(g.run.s + 14) + 0.8f, ahead.z));
        focus = HMM_LerpV3(focus, m, board);
    }
    if (beat.kind == BeatKind::Board && beat.index == BOARDS - 1) focus = HMM_LerpV3(focus, st.stage == Stage::Arrive ? 0.75f : 0.6f * m, HMM_AddV3(st.plinth, HMM_V3(0, -0.4f, 0)));   // the thief's ring
    if (beat.kind == BeatKind::Drive && (g.run.spec.goal == Goal::Chase || g.run.spec.goal == Goal::Storm) && st.stage == Stage::Play) {
        // keep what's chasing you in the picture when it's close
        const float gap = g.run.s - g.run.chaser;
        const Sample behind = st.track.at(g.run.chaser + 2);
        focus = HMM_LerpV3(focus, 0.35f * std::max(0.0f, 1 - gap / 45), HMM_V3(behind.x, st.track.elevation(behind.s) + 0.8f, behind.z));
    }
    const bool finale = beat.kind == BeatKind::Finale;
    if (finale) focus = HMM_MulV3F(HMM_AddV3(HMM_AddV3(HMM_V3(c.x, c.y + 0.8f, c.z), st.guide_at), st.plinth), 1.0f / 3);   // the chariot, the Guide and the Dancing Girl
    if (st.stage == Stage::Results && st.result_board >= 0) {   // watch the district rise
        const HMM_Vec3 mid = st.result_board < DISTRICTS ? [&] { const Sample q = st.track.at((district_s(st.result_board) + district_end(st.result_board)) / 2); return HMM_V3(q.x, st.track.elevation(q.s) + 1, q.z); }() : st.plinth;
        focus = HMM_LerpV3(focus, 0.3f, mid);
    }
    // a scene: look between the chariot and whoever's talking to it (and back at the storm, before the climb)
    const bool in_scene = st.stage == Stage::Arrive || st.stage == Stage::Depart;
    if (in_scene && st.figure != Figure::None && st.figure != Figure::Thief && st.talk.open) focus = HMM_LerpV3(focus, 0.45f, HMM_AddV3(st.figure_at, HMM_V3(0, 1.2f, 0)));
    if (st.stage == Stage::Depart && st.phase == 0 && st.chapter.beat == 7) {
        const Sample q = st.track.at(st.chapter.run_spec(3).from - STORM_GAP);
        focus = HMM_LerpV3(focus, 0.4f, HMM_V3(q.x, st.track.elevation(q.s) + 2, q.z));
    }
    if (st.stage == Stage::Arrive && st.phase == 2) focus = HMM_LerpV3(focus, 0.3f, HMM_V3(st.wave_at.X, st.wave_at.Y, st.wave_at.Z));
    st.cam_target = st.snap ? focus : HMM_LerpV3(st.cam_target, std::min(1.0f, dt * 4), focus);
    st.snap = false;
    const float pitch = 0.62f + 0.25f * e + (0.92f - 0.62f - 0.25f * e) * m;
    const float board_dist = st.stage == Stage::Results ? 80.0f : beat.kind == BeatKind::Board && beat.index == BOARDS - 1 ? 74.0f : 64.0f;
    const float drive_dist = 34 + speed * 0.5f + (st.talk.open ? 4.0f : 0.0f) + (finale ? 6.0f : 0.0f);
    const float dist = (drive_dist + (board_dist - drive_dist) * m) * (in_scene && st.talk.open && st.figure != Figure::None && st.figure != Figure::Thief ? 0.85f : 1.0f) * st.zoom + 70 * e;
    const HMM_Vec3 off = HMM_V3(std::cos(st.cam_yaw) * std::cos(pitch), std::sin(pitch), std::sin(st.cam_yaw) * std::cos(pitch));
    const HMM_Vec3 target = st.cam_target;
    HMM_Vec3 eye = HMM_AddV3(target, HMM_MulV3F(off, dist));
    eye.X += st.shake * 0.5f * std::sin(st.time * 71); eye.Y += st.shake * 0.4f * std::sin(st.time * 93);
    const float fov = HMM_AngleDeg(20.0f);
    const bool zo = st.renderer->zero_to_one();   // WebGPU's clip space has z in 0..1
    const HMM_Mat4 proj = zo ? HMM_Perspective_RH_ZO(fov, w / h, 4.0f, 400.0f) : HMM_Perspective_RH_NO(fov, w / h, 4.0f, 400.0f);
    frame_info.view_proj = HMM_MulM4(proj, HMM_LookAt_RH(eye, target, HMM_V3(0, 1, 0)));
    st.car_screen = to_screen(HMM_V3(c.x, c.y + 2.5f, c.z));
    st.guide_screen = to_screen(HMM_AddV3(st.guide_at, HMM_V3(0, 2.4f, 0)));
    st.local_screen = to_screen(HMM_AddV3(st.figure_at, HMM_V3(0, st.figure == Figure::Zebu ? 1.9f : 2.3f, 0)));
    if (finale && st.talk.open) st.guide_yaw += wrap(std::atan2(c.z - st.guide_at.Z, c.x - st.guide_at.X) - st.guide_yaw) * std::min(1.0f, dt * 3);

    // dusk falls along the lamp road and stays for the plaza
    float want_night = st.chapter.beat >= 10 ? 0.85f : 0.0f;
    if (st.chapter.beat == 9 && beat.kind == BeatKind::Drive) {
        const RunSpec sp = st.chapter.run_spec(4);
        want_night = 0.15f + 0.7f * std::max(0.0f, std::min(1.0f, (g.run.s - sp.from) / (sp.to - sp.from)));
    }
    if (st.stage == Stage::Title) want_night = st.chapter.beat >= 9 ? 0.6f : 0.0f;
    st.night += (want_night - st.night) * std::min(1.0f, dt * 1.2f);
    const float night = st.night;

    // the sun: warm and low, its shadow map following the camera (snapped to texels so the edges don't crawl)
    const HMM_Vec3 sun = HMM_NormV3(HMM_V3(-0.5f, 0.75f, 0.42f));
    const float half = SHADOW_HALF * (1 + e * 1.5f) * (1 + 0.6f * m);
    const float texel = 2 * half / SHADOW_SIZE;
    const HMM_Mat4 light_view = HMM_LookAt_RH(HMM_MulV3F(sun, 80), HMM_V3(0, 0, 0), HMM_V3(0, 1, 0));
    HMM_Vec4 centre = HMM_MulM4V4(light_view, HMM_V4(target.X, target.Y, target.Z, 1));
    centre.X = std::floor(centre.X / texel) * texel; centre.Y = std::floor(centre.Y / texel) * texel;
    const float near_z = -centre.Z - 60, far_z = -centre.Z + 60;
    const HMM_Mat4 light_proj = zo ? HMM_Orthographic_RH_ZO(centre.X - half, centre.X + half, centre.Y - half, centre.Y + half, near_z, far_z)
                                      : HMM_Orthographic_RH_NO(centre.X - half, centre.X + half, centre.Y - half, centre.Y + half, near_z, far_z);
    frame_info.light_vp = HMM_MulM4(light_proj, light_view);
    const float near_s = st.track.nearest(target.X, target.Z, nullptr, g.run.s);

    const auto scene = [&](bool shadows) {
        frame_info.shadow_pass = shadows;
        draw_world(near_s, (shadows ? 40 : 70) * (1 + e), (shadows ? 50 : 90) * (1 + e));
        if (st.go) draw_board(*st.go, beat.kind == BeatKind::Board ? beat.index : st.result_board, st.wave, st.wave_at, shadows);
        if (st.fading) draw_board(*st.fading, st.fading_board, st.fade, st.fade_at, shadows);
        draw_chariot();
        if (beat.kind == BeatKind::Drive) draw_drive();
        draw_figure();
        if (near_s > ZONE_START[10] - 60) draw_beacons(near_s);
        if (near_s > ROAD_END - 120) {
            draw(st.guide, mul({ T(st.guide_at.X, st.guide_at.Y, st.guide_at.Z), R(-st.guide_yaw, 0, 1, 0), R(std::sin(st.time * 1.3f) * 0.02f, 1, 0, 0) }));
            if (!stolen()) draw(st.statue, mul({ T(st.plinth.X, st.plinth.Y, st.plinth.Z), R(st.plinth_yaw, 0, 1, 0), S(1.3f) }), HMM_V3(1.7f, 1.5f, 1.25f));
        }
        if (!shadows) { draw_hint_pointers(); draw_particles(); }
        if (!shadows && st.stage == Stage::Arrive && st.phase == 2 && st.wave > 0) {   // the ring of light
            draw(st.glow_ring, mul({ T(st.wave_at.X, st.wave_at.Y + 0.15f, st.wave_at.Z), HMM_Scale(HMM_V3(st.wave, 1, st.wave)) }));
        }
    };

    xl::render::Frame f;
    f.width = sapp_width();
    f.height = sapp_height();
    f.view_proj = mat4(frame_info.view_proj);
    f.eye = vec3(eye);
    f.light_vp = mat4(frame_info.light_vp);
    f.time = st.time;
    f.clear[0] = 0.9f; f.clear[1] = 0.75f; f.clear[2] = 0.6f;
    // the backdrop: warm by day, dusky in the storm and at night
    const float dusk = storm_near * 0.6f;
    const auto mix3 = [](HMM_Vec3 a, HMM_Vec3 b, float k) { return vec3(HMM_V3(a.X + (b.X - a.X) * k, a.Y + (b.Y - a.Y) * k, a.Z + (b.Z - a.Z) * k)); };
    f.backdrop.top = mix3(HMM_V3(0.93f - dusk * 0.3f, 0.82f - dusk * 0.35f, 0.68f - dusk * 0.4f), HMM_V3(0.32f, 0.26f, 0.48f), night);
    f.backdrop.bottom = mix3(HMM_V3(0.64f, 0.45f - dusk * 0.1f, 0.4f - dusk * 0.15f), HMM_V3(0.62f, 0.32f, 0.3f), night);
    f.backdrop.glow = mix3(HMM_V3(1.0f, 0.9f, 0.74f), HMM_V3(1.0f, 0.55f, 0.35f), night);
    f.backdrop.glow_strength = 0.3f;
    f.backdrop.glow_x = 0.5f;
    f.backdrop.glow_y = 0.62f;
    xl::render::Lighting& l = f.lighting;
    l.sun_dir = vec3(sun);
    l.sun_intensity = 2.3f * (1 - dusk * 0.5f) * (1 - 0.72f * night);
    l.sun_color = vec3(HMM_LerpV3(lin(0xFFE2B8), night, lin(0xFF8A5A)));
    l.lamp_glow = 2.5f * night;
    l.sky_top = vec3(HMM_MulV3F(HMM_LerpV3(lin(0x8DB8E8), night, lin(0x4A4A8A)), 0.7f * (1 - 0.4f * night)));
    l.exposure = 0.68f;
    l.sky_horizon = vec3(HMM_MulV3F(HMM_LerpV3(lin(0xF2D2B0), night, lin(0xA06A80)), 0.8f * (1 - 0.4f * night)));
    l.ground = vec3(HMM_MulV3F(lin(0xC99A62), 0.35f * (1 - 0.5f * night)));
    l.haze = vec3(HMM_LerpV3(lin(0xB98A7A), night, lin(0x5A4060)));
    l.haze_strength = 0.85f;
    l.shadow_strength = 0.8f;
    l.shadow_bias = 0.0015f;
    // on screen: tilt-shift round the chariot's band, a little bloom, the grade
    xl::render::Post& p = f.post;
    p.focus_y = std::max(0.1f, std::min(0.9f, st.car_screen.Y - 0.08f));
    p.focus_half = 0.14f + 0.08f * m + 0.1f * e;
    p.blur = (3.5f + 2.0f * e) * sapp_dpi_scale();
    p.bloom = 0.4f;
    p.vignette = 0.45f + storm_near * 0.4f + night * 0.25f;
    p.saturation = 1.15f;
    p.grain = 0.02f;
    p.streak_x = st.car_screen.X;
    p.streak_y = st.car_screen.Y;
    st.renderer->render(f, [&](xl::render::Pass& pass) {
        st.pass = &pass;
        scene(pass.shadow());
        st.pass = nullptr;
    }, [&] {
        draw_hud(w, h);
        sgl_context_draw(st.hud);
    });
    mix_audio();
}

void event(const sapp_event* ev) {
    switch (ev->type) {
        case SAPP_EVENTTYPE_KEY_DOWN:
        case SAPP_EVENTTYPE_KEY_UP: {
            const bool down = ev->type == SAPP_EVENTTYPE_KEY_DOWN;
            const sapp_keycode k = ev->key_code;
            const bool board = st.go && st.stage != Stage::Title;
            if (!board) {
                if (k == SAPP_KEYCODE_UP || k == SAPP_KEYCODE_W) st.key_gas = down;
                if (k == SAPP_KEYCODE_DOWN || k == SAPP_KEYCODE_S) st.key_brake = down;
                if (k == SAPP_KEYCODE_LEFT || k == SAPP_KEYCODE_A) st.key_left = down;
                if (k == SAPP_KEYCODE_RIGHT || k == SAPP_KEYCODE_D) st.key_right = down;
            }
            if (down && !ev->key_repeat && xl::focused()) {
                if (k == SAPP_KEYCODE_SPACE || k == SAPP_KEYCODE_ENTER || k == SAPP_KEYCODE_E) st.advance = true;
                if (k == SAPP_KEYCODE_R) st.restart = true;
                if (k == SAPP_KEYCODE_M || k == SAPP_KEYCODE_ESCAPE) st.menu = true;
                if (k == SAPP_KEYCODE_N) st.fresh = true;
                if (board) {
                    if (k == SAPP_KEYCODE_W || k == SAPP_KEYCODE_UP) st.key_dir = 0;
                    if (k == SAPP_KEYCODE_A || k == SAPP_KEYCODE_LEFT) st.key_dir = 1;
                    if (k == SAPP_KEYCODE_S || k == SAPP_KEYCODE_DOWN) st.key_dir = 2;
                    if (k == SAPP_KEYCODE_D || k == SAPP_KEYCODE_RIGHT) st.key_dir = 3;
                    if (k == SAPP_KEYCODE_1) st.use_slot = 0;
                    if (k == SAPP_KEYCODE_2) st.use_slot = 1;
                }
                if (st.stage == Stage::Title && k == SAPP_KEYCODE_W) st.advance = true;
            }
            break;
        }
        case SAPP_EVENTTYPE_MOUSE_DOWN:
            if (st.go && st.stage == Stage::Play && !st.talk.open) { st.clicked = true; st.mouse = HMM_V2(ev->mouse_x, ev->mouse_y); }
            else st.advance = true;
            break;
        case SAPP_EVENTTYPE_MOUSE_SCROLL: st.zoom = std::max(0.5f, std::min(2.2f, st.zoom * (1.0f - ev->scroll_y * 0.06f))); break;
        case SAPP_EVENTTYPE_UNFOCUSED: st.key_gas = st.key_brake = st.key_left = st.key_right = false; break;
        default: break;
    }
}

void init() {
    xl::render::Renderer::Config config;
    config.shadow_size = SHADOW_SIZE;
    config.msaa = MSAA;
    config.buffers = 256;
    st.renderer = xl::render::Renderer::create(config);
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
    {   // the HUD font, embedded in the build (package.json: "fonts")
        std::ifstream in("/LilitaOne-Regular.ttf", std::ios::binary);
        std::vector<uint8_t> ttf((std::istreambuf_iterator<char>(in)), std::istreambuf_iterator<char>());
        st.text.setup(ttf, 48);
    }

    // the road, the chapter so far, the pieces; the land near the start now, the rest as you go
    st.track = build_track();
    st.game = std::make_unique<Game>(st.track);
    st.chapter = Chapter::load(xl::load("chapter", ""));
    for (int d = 0; d < DISTRICTS; d++) st.rising[d] = st.chapter.restored[d] ? 1.0f : 0.0f;
    st.chunks.assign(static_cast<size_t>(std::ceil(st.track.length / CHUNK)), GpuMesh{});
    st.chariot = upload(build_chariot());
    st.wheel = upload(build_wheel());
    st.rider = upload(build_rider());
    st.iris = upload(build_iris());
    st.lid = upload(build_lid());
    st.guide = upload(build_guide());
    st.puff = upload(build_puff());
    st.tumbleweed = upload(build_tumbleweed());
    st.gates = upload(build_gates(st.track));
    st.fragment = upload(build_fragment());
    st.sack = upload(build_sack());
    st.stone = upload(build_stone());
    st.watchman = upload(build_watchman());
    st.zebu = upload(build_zebu());
    st.chevron = upload(build_chevron());
    st.gaze = upload(build_gaze());
    st.handcart = upload(build_handcart());
    for (int k = 1; k <= 4; k++) st.tools[k] = upload(build_tool(static_cast<Tool>(k)));
    for (int k = 0; k < 4; k++) st.villagers[k] = upload(build_villager(static_cast<uint32_t>(k * 7 + 3)));
    for (int b = 0; b < BOARDS; b++) st.boards[b] = upload(build_board(st.track, chapter_board(b)));
    st.statue = upload(build_statue());
    st.thief = upload(build_thief());
    st.pointer = upload(build_pointer());
    st.glow_ring = upload(build_glow_ring());
    for (int k = 0; k < 2; k++) st.beacons[k] = upload(build_beacon(k == 1));
    for (const Prop& p : st.track.props) {
        if (p.kind == PropKind::Guide) { st.guide_at = HMM_V3(p.x, st.track.height(p.x, p.z, p.s), p.z); st.guide_yaw = -p.yaw; }
        if (p.kind == PropKind::DancingGirl) { st.plinth = HMM_V3(p.x, st.track.height(p.x, p.z, p.s) + 1.2f, p.z); st.plinth_yaw = p.yaw; }
    }
    st.hints_seen = static_cast<uint32_t>(std::strtoul(xl::load("hints", "0").c_str(), nullptr, 10));

    xl::audio_setup(1);
    std::srand(xl::seed());
    // the title over wherever you left off
    const Beat& b = st.chapter.current();
    if (b.kind == BeatKind::Drive) st.game->start(st.chapter.run_spec(b.index), st.chapter.bag);
    else park(b.kind == BeatKind::Board ? chapter_board(b.index).nodes[chapter_board(b.index).start].s : at::DANCING_GIRL - 16);
    if (st.game->run.state == RunState::Landing) st.game->car.y = st.track.height(st.game->car.x, st.game->car.z);
    st.cam_target = HMM_V3(st.game->car.x, 0.8f, st.game->car.z);
    const Sample road = st.track.at(st.game->run.s + 10);
    st.cam_yaw = std::atan2(road.tz, road.tx) + HMM_PI32 + 0.75f;
    for (int i = 0; i < 6; i++) stream(st.game->run.s);
}

void cleanup() {
    xl::audio_shutdown();
    st.text.shutdown();
    sgl_shutdown();
    st.renderer.reset();   // shuts sokol_gfx down
}

} // namespace

// ---------- exports for the page's tests ----------

extern "C" {
/** The chapter as JSON (free the string with _free). */
EMSCRIPTEN_KEEPALIVE char* jr_state_json() {
    const Beat& b = st.chapter.current();
    const Run& r = st.game->run;
    std::string adj;
    if (st.go) for (int n : st.go->board->adj[st.go->player]) adj += (adj.empty() ? "" : ",") + std::to_string(n);
    std::string bag;
    for (Tool t : st.go ? st.go->bag : st.chapter.bag) bag += (bag.empty() ? "\"" : ",\"") + std::string(tool_name(t)) + "\"";
    char buf[1024];
    std::snprintf(buf, sizeof buf,
        "{\"stage\":%d,\"beat\":%d,\"kind\":%d,\"talking\":%s,\"goal\":\"%s\",\"run\":%d,\"s\":%.2f,\"cargo\":%d,\"shortcut\":%s,"
        "\"player\":%d,\"moves\":%d,\"par\":%d,\"won\":%s,\"caught\":%s,\"nudges\":%d,\"ready\":%s,\"adj\":[%s],\"bag\":[%s],"
        "\"restored\":[%d,%d,%d,%d,%d],\"fragment\":%s,\"phase\":%d,\"hint\":%d,\"lamps\":%d,\"light\":%.2f,\"mode\":%.2f,\"rolling\":%s}",
        static_cast<int>(st.stage), st.chapter.beat, static_cast<int>(b.kind), st.talk.open ? "true" : "false", goal_name(r.spec.goal), static_cast<int>(r.state), r.s, r.cargo, r.spec.shortcut ? "true" : "false",
        st.go ? st.go->player : -1, st.go ? st.go->moves : 0, st.go ? st.go->board->par : 0, st.go && st.go->won ? "true" : "false", st.go && st.go->caught ? "true" : "false", st.go ? st.go->nudges : 0,
        st.go && st.hop >= 1 && st.caught_timer <= 0 ? "true" : "false", adj.c_str(), bag.c_str(),
        st.chapter.restored[0], st.chapter.restored[1], st.chapter.restored[2], st.chapter.restored[3], st.chapter.restored[4], st.chapter.fragment ? "true" : "false",
        st.phase, st.hint.any() && st.hint_age > 0.25f ? static_cast<int>(st.hint.hint) : -1, r.lamps, r.light, st.mode, st.glide.on ? "true" : "false");
    const size_t n = std::strlen(buf) + 1;
    char* out = static_cast<char*>(malloc(n));
    std::memcpy(out, buf, n);
    return out;
}
/** Lets the autopilot drive, solve the boards and read the story (1), or hands back control (0). */
EMSCRIPTEN_KEEPALIVE void jr_autopilot(int on) { st.autopilot = on != 0; if (on && st.stage == Stage::Title) enter_beat(); }
/** Moves the dialogue on (or past a results card), as Space does. */
EMSCRIPTEN_KEEPALIVE void jr_advance() { st.advance = true; }
/** Board play: step to a neighbouring node (as a click does). */
EMSCRIPTEN_KEEPALIVE void jr_board_move(int node) { if (st.go) board_try(node); }
/** Jumps to a beat with an empty bag (for tests and trying things out). */
EMSCRIPTEN_KEEPALIVE void jr_goto(int beat) {
    st.chapter = Chapter{};
    st.chapter.beat = std::max(0, std::min(static_cast<int>(chapter_beats().size()) - 1, beat));
    for (int d = 0; d < DISTRICTS; d++) { st.chapter.restored[d] = false; st.rising[d] = 0; }
    enter_beat();
}
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
