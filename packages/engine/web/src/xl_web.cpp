/**
 * @file xl_web.cpp
 * @brief The platform contract (xl.h) in the browser: Emscripten and the page.
 *
 * The page (`EngineView` in `@xlibraries/engine-react`) calls the exported `xl_set_*` functions to report focus,
 * visibility, the gamepad and the phone's tilt; saved values live in localStorage; frame statistics go to the page's
 * `onStats`. Linked into every module that uses `@xlibraries/engine-web`.
 */
#include "sokol_app.h"
#include "xl.h"

#include <cstdlib>
#include <emscripten.h>
#include <emscripten/html5.h>

namespace {
bool g_focused = false;
bool g_paused = false;
std::string g_canvas = "#canvas";
std::string g_game = "game";
uint64_t g_frames = 0;
double g_time = 0;
xl::Gamepad g_pad;
float g_tilt = 0;
} // namespace

/** @name Called by the page */
///@{
extern "C" {
/** Reports whether the module's window has keyboard focus (nonzero: it has). */
EMSCRIPTEN_KEEPALIVE void xl_set_focused(int focused) { g_focused = focused != 0; }
/** Reports whether the module's window is hidden (nonzero: it is). */
EMSCRIPTEN_KEEPALIVE void xl_set_paused(int paused) { g_paused = paused != 0; }
/** Asks the module to quit (the window closed). */
EMSCRIPTEN_KEEPALIVE void xl_quit() { sapp_quit(); }
/** Reports the phone's tilt as a lean, clamped to -1..1. */
EMSCRIPTEN_KEEPALIVE void xl_set_tilt(float lean) { g_tilt = lean < -1 ? -1 : lean > 1 ? 1 : lean; }
/** Reports the first gamepad: whether it's connected, its sticks (-1..1) and its buttons (one bit per xl::PadButton). */
EMSCRIPTEN_KEEPALIVE void xl_set_gamepad(int connected, float lx, float ly, float rx, float ry, uint32_t buttons) {
    g_pad.connected = connected != 0;
    g_pad.lx = lx; g_pad.ly = ly; g_pad.rx = rx; g_pad.ry = ry;
    g_pad.buttons = buttons;
}
}
///@}

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
EM_JS(void, xl_js_rumble, (float strong, float weak, int ms, int touch), {
    try {
        const pads = typeof navigator.getGamepads === "function" ? navigator.getGamepads() : [];
        for (const p of pads) {
            if (!p || !p.connected || !p.vibrationActuator) continue;
            p.vibrationActuator.playEffect("dual-rumble", { startDelay: 0, duration: ms, strongMagnitude: strong, weakMagnitude: weak });
            break;
        }
        if (touch && typeof navigator.vibrate === "function") navigator.vibrate(ms);
    } catch (e) {}
});

namespace xl {

const Gamepad& gamepad() { return g_pad; }
float tilt() { return g_tilt; }
void end_frame() { g_pad.previous = g_pad.buttons; }

bool focused() { return g_focused; }
void rumble(float strong, float weak, int ms, bool touch) { xl_js_rumble(strong, weak, ms, touch ? 1 : 0); }
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
