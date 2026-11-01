// Neon Breakout: rendering, sound and input around the rules in logic.cpp.
// Drawn with sokol_gl (its shaders are built into sokol for both backends) using additive blending for the glow.
#define SOKOL_IMPL
#include "sokol_gfx.h"
#include "sokol_app.h"
#include "sokol_glue.h"
#include "sokol_log.h"
#include "sokol_gl.h"
#include "sokol_debugtext.h"
#include "xl.h"
#include "xl_audio.h"
#include "logic.h"

#include <algorithm>
#include <cmath>
#include <cstdlib>
#include <string>
#include <vector>

using namespace breakout;

namespace {

// ---------- Palette ----------

struct Rgb { float r, g, b; };
const Rgb ROW_COLORS[] = { {1.0f, 0.24f, 0.5f}, {1.0f, 0.42f, 0.2f}, {1.0f, 0.79f, 0.24f}, {0.48f, 0.9f, 0.51f},
                           {0.0f, 0.78f, 0.88f}, {0.04f, 0.61f, 1.0f}, {0.55f, 0.36f, 0.96f}, {0.9f, 0.4f, 1.0f} };
const Rgb CYAN = { 0.3f, 0.95f, 1.0f };
const Rgb WHITE = { 1, 1, 1 };

// ---------- Sound: a few synthesized voices mixed into the AudioWorklet stream (xl_audio.h) ----------

struct Voice { float freq, freq_end, t, dur, vol; int wave; };   // wave: 0 square, 1 triangle, 2 noise
std::vector<Voice> voices;
uint32_t noise_seed = 12345;

void play(float freq, float freq_end, float dur, float vol, int wave) {
    if (voices.size() < 24) voices.push_back({ freq, freq_end, 0, dur, vol, wave });
}

void mix_audio() {
    const int frames = xl::audio_expect();
    if (frames <= 0) return;
    static std::vector<float> buf;
    buf.assign(frames, 0.0f);
    const float rate = static_cast<float>(xl::audio_sample_rate());
    for (Voice& v : voices) {
        for (int i = 0; i < frames && v.t < v.dur; i++) {
            const float k = v.t / v.dur;
            const float f = v.freq + (v.freq_end - v.freq) * k;
            const float phase = std::fmod(v.t * f, 1.0f);
            float s;
            if (v.wave == 0) s = phase < 0.5f ? 1.0f : -1.0f;
            else if (v.wave == 1) s = 4.0f * std::fabs(phase - 0.5f) - 1.0f;
            else { noise_seed = noise_seed * 1664525u + 1013904223u; s = (noise_seed >> 9) / 4194304.0f - 1.0f; }
            buf[i] += s * v.vol * (1.0f - k) * (1.0f - k);   // quick decay
            v.t += 1.0f / rate;
        }
    }
    voices.erase(std::remove_if(voices.begin(), voices.end(), [](const Voice& v) { return v.t >= v.dur; }), voices.end());
    for (float& s : buf) s = std::max(-1.0f, std::min(1.0f, s));
    xl::audio_push(buf.data(), frames);
}

// ---------- Particles and screen shake ----------

struct Particle { float x, y, vx, vy, life, max_life; Rgb c; };
std::vector<Particle> particles;
float shake = 0;

float frand() { return static_cast<float>(std::rand()) / static_cast<float>(RAND_MAX); }

void burst(float x, float y, Rgb c, int n) {
    for (int i = 0; i < n && particles.size() < 800; i++) {
        const float a = frand() * 6.2832f, sp = 60 + frand() * 220;
        const float life = 0.4f + frand() * 0.5f;
        particles.push_back({ x, y, std::cos(a) * sp, std::sin(a) * sp, life, life, c });
    }
}

// ---------- State ----------

struct {
    Game game;
    sgl_pipeline additive;
    float time = 0;
    int best = 0;
    bool keys_left = false, keys_right = false, launch = false;
    float mouse_x = -1;           // in field coordinates
    bool mouse_moved = false;     // the paddle follows the pointer only when it moves (not after a key is released)
    float scale = 1, ox = 0, oy = 0;   // field → screen (logical pixels)
    std::vector<Vec2> trail;
} st;

// ---------- Drawing helpers (field coordinates; the projection maps the field to the window) ----------

void quad(float x, float y, float w, float h, Rgb c, float a) {
    sgl_c4f(c.r * a, c.g * a, c.b * a, 1.0f);   // additive: colour scaled by "alpha"
    sgl_v2f(x, y); sgl_v2f(x + w, y); sgl_v2f(x + w, y + h); sgl_v2f(x, y + h);
}

// A soft neon rectangle: a few expanding, fading layers plus a bright core
void glow_rect(float x, float y, float w, float h, Rgb c, float intensity) {
    for (int i = 4; i >= 1; i--) {
        const float g = i * 3.0f;
        quad(x - g, y - g, w + 2 * g, h + 2 * g, c, 0.07f * intensity);
    }
    quad(x, y, w, h, c, 0.75f * intensity);
    quad(x + 2, y + 2, w - 4, std::max(1.0f, h * 0.35f), WHITE, 0.25f * intensity);
}

void glow_disc(float cx, float cy, float r, Rgb c, float intensity) {
    for (int layer = 3; layer >= 0; layer--) {
        const float rr = r + layer * 4.0f;
        const float a = layer == 0 ? 0.9f * intensity : 0.1f * intensity;
        sgl_end();
        sgl_begin_triangles();
        sgl_c4f(c.r * a, c.g * a, c.b * a, 1);
        for (int i = 0; i < 16; i++) {
            const float a0 = i / 16.0f * 6.2832f, a1 = (i + 1) / 16.0f * 6.2832f;
            sgl_v2f(cx, cy); sgl_v2f(cx + std::cos(a0) * rr, cy + std::sin(a0) * rr); sgl_v2f(cx + std::cos(a1) * rr, cy + std::sin(a1) * rr);
        }
        sgl_end();
        sgl_begin_quads();
    }
}

void draw_background() {
    // a slowly scrolling synthwave grid
    sgl_begin_lines();
    const float scroll = std::fmod(st.time * 30.0f, 40.0f);
    for (float y = scroll; y < FIELD_H; y += 40) { const float a = 0.05f + 0.07f * (y / FIELD_H); sgl_c4f(0.55f * a, 0.36f * a, 0.96f * a, 1); sgl_v2f(0, y); sgl_v2f(FIELD_W, y); }
    for (float x = 0; x <= FIELD_W; x += 40) { sgl_c4f(0.04f, 0.03f, 0.09f, 1); sgl_v2f(x, 0); sgl_v2f(x, FIELD_H); }
    sgl_end();
}

void draw_game() {
    const Game& g = st.game;
    sgl_begin_quads();
    // field border
    quad(-3, -3, FIELD_W + 6, 3, CYAN, 0.35f);
    quad(-3, 0, 3, FIELD_H, CYAN, 0.35f);
    quad(FIELD_W, 0, 3, FIELD_H, CYAN, 0.35f);

    for (const Brick& b : g.bricks) {
        if (b.hp <= 0) continue;
        const Rgb c = ROW_COLORS[b.color % 8];
        glow_rect(b.x, b.y, b.w, b.h, c, 0.55f + 0.2f * b.hp);
    }
    for (const PowerUp& p : g.powerups) {
        const Rgb c = p.kind == PowerKind::Wide ? Rgb{ 0.48f, 0.9f, 0.51f } : Rgb{ 1.0f, 0.79f, 0.24f };
        glow_rect(p.p.x - 10, p.p.y - 6, 20, 12, c, 0.8f + 0.2f * std::sin(st.time * 10));
    }
    glow_rect(g.paddle_x - g.paddle_w / 2, PADDLE_Y, g.paddle_w, PADDLE_H, CYAN, 1.0f);

    // ball trail, then balls
    for (size_t i = 0; i < st.trail.size(); i++) {
        const float a = static_cast<float>(i) / st.trail.size();
        quad(st.trail[i].x - 3, st.trail[i].y - 3, 6, 6, { 1.0f, 0.5f, 0.85f }, 0.25f * a);
    }
    for (const Ball& b : g.balls) glow_disc(b.p.x, b.p.y, BALL_R, WHITE, 1.0f);

    for (const Particle& p : particles) {
        const float a = p.life / p.max_life;
        quad(p.x - 1.5f, p.y - 1.5f, 3, 3, p.c, a);
    }
    sgl_end();
}

void draw_text() {
    const Game& g = st.game;
    const float w = sapp_widthf() / sapp_dpi_scale(), h = sapp_heightf() / sapp_dpi_scale();
    sdtx_canvas(w * 0.5f, h * 0.5f);
    const float cols = w * 0.5f / 8.0f;
    // left and centre only: the window's own badge and buttons sit in the top-right corner
    sdtx_origin(1, 0.5f);
    sdtx_color3f(1.0f, 0.79f, 0.24f);
    sdtx_printf("SCORE %06d", g.score);
    sdtx_color3f(1.0f, 0.36f, 0.6f);
    sdtx_printf("  BEST %06d", std::max(st.best, g.score));
    sdtx_pos(0, 1.2f);
    sdtx_color3f(0.9f, 0.9f, 1.0f);
    sdtx_printf("LEVEL %d  ", g.level + 1);
    sdtx_color3f(1.0f, 0.36f, 0.6f);
    for (int i = 0; i < g.lives; i++) sdtx_putc('*');

    const char* msg = nullptr;
    if (!xl::focused() && g.phase != Phase::Playing) msg = "CLICK TO PLAY";
    else if (g.phase == Phase::Ready) msg = xl::gamepad().connected ? "PRESS A TO LAUNCH" : "SPACE OR CLICK TO LAUNCH";
    else if (g.phase == Phase::LevelCleared) msg = "LEVEL CLEARED!  SPACE FOR NEXT";
    else if (g.phase == Phase::GameOver) msg = "GAME OVER  -  SPACE TO RESTART";
    if (msg) {
        const float rows = h * 0.5f / 8.0f;
        sdtx_pos(cols / 2 - std::strlen(msg) / 2.0f, rows * 0.62f);
        const float pulse = 0.65f + 0.35f * std::sin(st.time * 4);
        sdtx_color3f(pulse, pulse, 1.0f);
        sdtx_puts(msg);
    }
}

// Read-only, for tests: the paddle's centre in field coordinates (0..640)
extern "C" EMSCRIPTEN_KEEPALIVE float breakout_paddle_x() { return st.game.paddle_x; }

// ---------- Frame ----------

void handle_events() {
    for (Event e : st.game.events) {
        switch (e) {
            case Event::WallHit: play(330, 300, 0.05f, 0.08f, 1); break;
            case Event::PaddleHit: play(220, 440, 0.08f, 0.12f, 0); break;
            case Event::BrickHit: play(520, 480, 0.06f, 0.1f, 0); break;
            case Event::BrickBroken: play(660, 990, 0.09f, 0.1f, 0); play(0, 0, 0.12f, 0.05f, 2); shake = std::max(shake, 3.0f); break;
            case Event::PowerUp: play(440, 1320, 0.25f, 0.12f, 1); break;
            case Event::LifeLost: play(300, 60, 0.6f, 0.15f, 0); shake = 10; break;
            case Event::LevelCleared: for (int i = 0; i < 4; i++) play(523.0f * (1 + i * 0.25f), 523.0f * (1 + i * 0.25f), 0.15f + i * 0.08f, 0.08f, 1); break;
            case Event::GameOver: play(220, 55, 1.2f, 0.15f, 0); break;
        }
    }
    for (size_t i = 0; i < st.game.hits.size(); i++) {
        const Vec2 h = st.game.hits[i];
        // the colour of whatever brick was there (row from y)
        const int row = std::max(0, std::min(7, static_cast<int>((h.y - 50) / 24)));
        burst(h.x, h.y, ROW_COLORS[row], 18);
    }
    if (st.game.score > st.best && (st.game.phase == Phase::GameOver || st.game.phase == Phase::LevelCleared)) {
        st.best = st.game.score;
        xl::save("best", std::to_string(st.best));
    }
}

void frame() {
    if (xl::paused()) return;   // minimized or hidden: no updates, no sound, no drawing
    const float dt = static_cast<float>(sapp_frame_duration());
    xl::report_frame(dt);
    st.time += dt;

    // layout: fit the 640×480 field (plus a header strip) into the window, centred
    const float w = sapp_widthf() / sapp_dpi_scale(), h = sapp_heightf() / sapp_dpi_scale();
    const float header = 34;
    st.scale = std::min(w / (FIELD_W + 20), (h - header) / (FIELD_H + 10));
    st.ox = (w - FIELD_W * st.scale) / 2;
    st.oy = header + (h - header - FIELD_H * st.scale) / 2;

    Input in;
    if (xl::focused()) {
        in.dir = static_cast<float>((st.keys_right ? 1 : 0) - (st.keys_left ? 1 : 0));
        in.target_x = (in.dir == 0 && st.mouse_moved) ? st.mouse_x : -1;
        in.launch = st.launch;
    }
    // a gamepad works whenever the game is on screen: stick or D-pad to move, A or Start to launch
    const xl::Gamepad& pad = xl::gamepad();
    if (pad.connected) {
        const float stick = pad.lx + (pad.down(xl::PAD_RIGHT) ? 1.0f : 0.0f) - (pad.down(xl::PAD_LEFT) ? 1.0f : 0.0f);
        if (stick != 0) { in.dir = std::max(-1.0f, std::min(1.0f, stick)); in.target_x = -1; }
        if (pad.pressed(xl::PAD_A) || pad.pressed(xl::PAD_START)) in.launch = true;
    }
    xl::end_frame();
    st.launch = false;
    st.mouse_moved = false;
    update(st.game, dt, in);
    handle_events();

    for (Particle& p : particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 300 * dt; p.life -= dt; }
    particles.erase(std::remove_if(particles.begin(), particles.end(), [](const Particle& p) { return p.life <= 0; }), particles.end());
    if (!st.game.balls.empty() && st.game.phase == Phase::Playing) {
        st.trail.push_back(st.game.balls.front().p);
        if (st.trail.size() > 14) st.trail.erase(st.trail.begin());
    } else {
        st.trail.clear();
    }
    shake = std::max(0.0f, shake - dt * 30);

    const float sx = shake > 0 ? (frand() - 0.5f) * shake : 0, sy = shake > 0 ? (frand() - 0.5f) * shake : 0;
    sgl_defaults();
    sgl_load_pipeline(st.additive);
    sgl_matrix_mode_projection();
    sgl_ortho(0, w, h, 0, -1, 1);
    sgl_matrix_mode_modelview();
    sgl_translate(st.ox + sx, st.oy + sy, 0);
    sgl_scale(st.scale, st.scale, 1);
    draw_background();
    draw_game();
    draw_text();

    sg_pass pass = {};
    pass.action.colors[0].load_action = SG_LOADACTION_CLEAR;
    pass.action.colors[0].clear_value = { 0.03f, 0.02f, 0.07f, 1 };
    pass.swapchain = sglue_swapchain();
    sg_begin_pass(&pass);
    sgl_draw();
    sdtx_draw();
    sg_end_pass();
    sg_commit();

    mix_audio();
}

void event(const sapp_event* e) {
    const float dpi = sapp_dpi_scale();
    switch (e->type) {
        case SAPP_EVENTTYPE_MOUSE_MOVE:
            st.mouse_x = (e->mouse_x / dpi - st.ox) / st.scale;
            st.mouse_moved = true;
            break;
        case SAPP_EVENTTYPE_TOUCHES_BEGAN:
        case SAPP_EVENTTYPE_TOUCHES_MOVED:
            if (e->num_touches > 0) { st.mouse_x = (e->touches[0].pos_x / dpi - st.ox) / st.scale; st.mouse_moved = true; }
            if (e->type == SAPP_EVENTTYPE_TOUCHES_BEGAN) st.launch = true;
            break;
        case SAPP_EVENTTYPE_MOUSE_DOWN:
            st.launch = true;
            break;
        case SAPP_EVENTTYPE_KEY_DOWN:
        case SAPP_EVENTTYPE_KEY_UP: {
            const bool down = e->type == SAPP_EVENTTYPE_KEY_DOWN;
            if (e->key_code == SAPP_KEYCODE_LEFT || e->key_code == SAPP_KEYCODE_A) st.keys_left = down;
            if (e->key_code == SAPP_KEYCODE_RIGHT || e->key_code == SAPP_KEYCODE_D) st.keys_right = down;
            if (down && (e->key_code == SAPP_KEYCODE_SPACE || e->key_code == SAPP_KEYCODE_ENTER)) st.launch = true;
            break;
        }
        case SAPP_EVENTTYPE_UNFOCUSED:
            st.keys_left = st.keys_right = false;
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
    pip.colors[0].blend.src_factor_rgb = SG_BLENDFACTOR_ONE;
    pip.colors[0].blend.dst_factor_rgb = SG_BLENDFACTOR_ONE;
    st.additive = sgl_make_pipeline(&pip);

    sdtx_desc_t text = {};
    text.fonts[0] = sdtx_font_oric();
    text.logger.func = slog_func;
    sdtx_setup(&text);

    xl::audio_setup(1);

    st.best = std::atoi(xl::load("best", "0").c_str());
    st.game.rng ^= xl::seed();
    std::srand(xl::seed());
    new_game(st.game);
}

void cleanup() {
    xl::audio_shutdown();
    sdtx_shutdown();
    sgl_shutdown();
    sg_shutdown();
}

} // namespace

sapp_desc sokol_main(int argc, char* argv[]) {
    sapp_desc desc = {};
    desc.init_cb = init;
    desc.frame_cb = frame;
    desc.event_cb = event;
    desc.cleanup_cb = cleanup;
    desc.window_title = "Neon Breakout";
    desc.logger.func = slog_func;
    return xl::app_desc(argc, argv, desc);
}
