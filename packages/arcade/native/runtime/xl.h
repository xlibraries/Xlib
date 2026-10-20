// The Arcade runtime: what a sokol game needs to live in a desktop window on xlibraries.com.
//
//  - The page starts each game with `--canvas=<selector>` (its own canvas, so several can run at once) and tells
//    it when its window gains/loses keyboard focus and when it's hidden (paused).
//  - Key events are never swallowed: sokol listens on the whole page, so the runtime lets every event bubble and
//    games should only react to keys while xl::focused().
//  - Small values (high scores, settings) persist in the visitor's browser via xl::save/xl::load.
//
// Include in exactly one .cpp per game, after the sokol headers, with XL_IMPL defined.
#pragma once
#include <cstdint>
#include <cstring>
#include <string>
#ifndef SOKOL_APP_INCLUDED
#error "include sokol_app.h before xl.h"
#endif

namespace xl {

/** W3C "standard" gamepad buttons. */
enum PadButton { PAD_A, PAD_B, PAD_X, PAD_Y, PAD_LB, PAD_RB, PAD_LT, PAD_RT, PAD_BACK, PAD_START, PAD_LS, PAD_RS, PAD_UP, PAD_DOWN, PAD_LEFT, PAD_RIGHT };

struct Gamepad {
    bool connected = false;
    float lx = 0, ly = 0, rx = 0, ry = 0;   // sticks, dead zone applied, -1..1 (y down is positive)
    uint32_t buttons = 0, previous = 0;
    bool down(PadButton b) const { return (buttons >> b) & 1u; }
    /** Pressed since the previous frame. */
    bool pressed(PadButton b) const { return down(b) && !((previous >> b) & 1u); }
};

/** The first connected gamepad, read by the page each frame. Call xl::end_frame() after handling it. */
const Gamepad& gamepad();
/** Marks the end of a frame's input (for Gamepad::pressed). */
void end_frame();

bool focused();
bool paused();
/** "WebGPU" or "WebGL2" */
const char* backend_name();
/** Persist a small string for this game in the visitor's browser (localStorage, key "arcade:<game>:<key>"). */
void save(const char* key, const std::string& value);
std::string load(const char* key, const std::string& fallback = "");
/** A different number on every run (for seeding random levels and effects). */
uint32_t seed();
/** Report frame statistics to the page (shown in the window, used by tests). */
void report_frame(double frame_seconds);
/** Fills the canvas and browser-integration fields of a sapp_desc from the command line. */
sapp_desc app_desc(int argc, char* argv[], sapp_desc desc);

} // namespace xl

#ifdef XL_IMPL
#include <emscripten.h>
#include <emscripten/html5.h>

namespace {
bool g_focused = false;
bool g_paused = false;
std::string g_canvas = "#canvas";
std::string g_game = "game";
uint64_t g_frames = 0;
double g_time = 0;
} // namespace

// Called by the page (GameView.tsx)
extern "C" {
EMSCRIPTEN_KEEPALIVE void xl_set_focused(int focused) { g_focused = focused != 0; }
EMSCRIPTEN_KEEPALIVE void xl_set_paused(int paused) { g_paused = paused != 0; }
EMSCRIPTEN_KEEPALIVE void xl_quit() { sapp_quit(); }
EMSCRIPTEN_KEEPALIVE void xl_set_gamepad(int connected, float lx, float ly, float rx, float ry, uint32_t buttons);
}

EM_JS(void, xl_js_save, (const char* game, const char* key, const char* value), {
    try { localStorage.setItem("arcade:" + UTF8ToString(game) + ":" + UTF8ToString(key), UTF8ToString(value)); } catch (e) {}
});
EM_JS(char*, xl_js_load, (const char* game, const char* key), {
    let v = null;
    try { v = localStorage.getItem("arcade:" + UTF8ToString(game) + ":" + UTF8ToString(key)); } catch (e) {}
    return v === null ? 0 : stringToNewUTF8(v);
});
EM_JS(void, xl_js_stats, (double frames, double fps), {
    if (Module["onStats"]) Module["onStats"]({ frames: frames, fps: fps });
});

namespace { xl::Gamepad g_pad; }

extern "C" EMSCRIPTEN_KEEPALIVE void xl_set_gamepad(int connected, float lx, float ly, float rx, float ry, uint32_t buttons) {
    g_pad.connected = connected != 0;
    g_pad.lx = lx; g_pad.ly = ly; g_pad.rx = rx; g_pad.ry = ry;
    g_pad.buttons = buttons;
}

namespace xl {

const Gamepad& gamepad() { return g_pad; }
void end_frame() { g_pad.previous = g_pad.buttons; }

bool focused() { return g_focused; }
bool paused() { return g_paused; }

const char* backend_name() {
#if defined(SOKOL_WGPU)
    return "WebGPU";
#else
    return "WebGL2";
#endif
}

void save(const char* key, const std::string& value) { xl_js_save(g_game.c_str(), key, value.c_str()); }

std::string load(const char* key, const std::string& fallback) {
    char* v = xl_js_load(g_game.c_str(), key);
    if (!v) return fallback;
    std::string out(v);
    free(v);
    return out;
}

uint32_t seed() { return static_cast<uint32_t>(emscripten_get_now() * 1000.0) ^ 0x5bd1e995u; }

void report_frame(double dt) {
    g_frames++;
    g_time += dt;
    if (g_time >= 0.5) {
        xl_js_stats(static_cast<double>(g_frames), g_frames / g_time);
        g_frames = 0;
        g_time = 0;
    }
}

sapp_desc app_desc(int argc, char* argv[], sapp_desc desc) {
    for (int i = 1; i < argc; i++) {
        if (std::strncmp(argv[i], "--canvas=", 9) == 0) g_canvas = argv[i] + 9;
        if (std::strncmp(argv[i], "--game=", 7) == 0) g_game = argv[i] + 7;
    }
    desc.html5.canvas_selector = g_canvas.c_str();
    desc.html5.bubble_key_events = true;    // never steal keys from the rest of the page
    desc.html5.bubble_char_events = true;
    desc.html5.bubble_wheel_events = true;
    desc.html5.update_document_title = false;
    desc.high_dpi = true;
    return desc;
}

} // namespace xl
#endif
