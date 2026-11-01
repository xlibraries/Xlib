/**
 * @file xl.h
 * @brief The platform contract: what a sokol program needs to live in a desktop window on xlibraries.com.
 *
 * - The page starts each module with `--canvas=<selector>` (its own canvas, so several can run at once) and tells it
 *   when its window gains or loses keyboard focus and when it's hidden (paused).
 * - Key events are never swallowed: sokol listens on the whole page, so key events bubble on, and a module should
 *   react to keys only while xl::focused().
 * - Small values (high scores, settings) persist in the visitor's browser through xl::save() and xl::load().
 *
 * Declarations only: a platform adapter implements them (in the browser, `@xlibraries/engine-web`, linked into
 * every module that uses it). Include after sokol_app.h.
 */
#pragma once
#include <cstdint>
#include <cstring>
#include <string>
#ifndef SOKOL_APP_INCLUDED
#error "include sokol_app.h before xl.h"
#endif

namespace xl {

/** The W3C "standard" gamepad's buttons, as bit positions in Gamepad::buttons. */
enum PadButton { PAD_A, PAD_B, PAD_X, PAD_Y, PAD_LB, PAD_RB, PAD_LT, PAD_RT, PAD_BACK, PAD_START, PAD_LS, PAD_RS, PAD_UP, PAD_DOWN, PAD_LEFT, PAD_RIGHT };

/** The first connected gamepad's state, as the page last reported it. */
struct Gamepad {
    bool connected = false;                 ///< Whether a gamepad is connected at all.
    float lx = 0, ly = 0, rx = 0, ry = 0;   ///< The sticks, dead zone applied, -1..1 (y down is positive).
    uint32_t buttons = 0;                   ///< The buttons held now, one bit per PadButton.
    uint32_t previous = 0;                  ///< The buttons held at the end of the previous frame (see xl::end_frame()).

    /**
     * Whether a button is held.
     * @param b The button.
     * @return True while it's down.
     */
    bool down(PadButton b) const { return (buttons >> b) & 1u; }

    /**
     * Whether a button went down since the previous frame.
     * @param b The button.
     * @return True on the first frame it's held.
     */
    bool pressed(PadButton b) const { return down(b) && !((previous >> b) & 1u); }
};

/**
 * The first connected gamepad, read by the page each frame.
 * @return Its state; call xl::end_frame() after handling it.
 */
const Gamepad& gamepad();

/** Marks the end of a frame's input, so Gamepad::pressed() sees the next frame's changes. */
void end_frame();

/**
 * Whether the module's window has keyboard focus.
 * @return True while it does; react to keys only then.
 */
bool focused();

/**
 * The phone's tilt as a lean.
 * @return -1..1 (0 without a gyro); the page sets it.
 */
float tilt();

/**
 * Haptics: rumbles a connected gamepad and, optionally, the phone.
 * @param strong The strong motor's strength, 0..1.
 * @param weak The weak motor's strength, 0..1.
 * @param ms How long, in milliseconds.
 * @param touch Whether to vibrate the phone as well.
 */
void rumble(float strong, float weak, int ms, bool touch = false);

/**
 * Whether the module's window is hidden.
 * @return True while it is; a module should stop simulating then.
 */
bool paused();

/**
 * The graphics backend the module was built for.
 * @return "WebGPU" or "WebGL2".
 */
const char* backend_name();

/**
 * Persists a small string for this module in the visitor's browser.
 * @param key The name it's kept under (stored as "arcade:<module>:<key>").
 * @param value What to keep.
 */
void save(const char* key, const std::string& value);

/**
 * Reads back a string kept with xl::save().
 * @param key The name it was kept under.
 * @param fallback What to return if there's nothing kept.
 * @return The kept value, or `fallback`.
 */
std::string load(const char* key, const std::string& fallback = "");

/**
 * A number that's different on every run, for seeding random levels and effects.
 * @return The seed.
 */
uint32_t seed();

/**
 * Reports frame statistics to the page (shown in the window, read by tests).
 * @param frame_seconds How long the frame took.
 */
void report_frame(double frame_seconds);

/**
 * Fills a sapp_desc's canvas and browser-integration fields from the command line the page passes.
 * @param argc The argument count, as sokol_main got it.
 * @param argv The arguments, as sokol_main got them.
 * @param desc The module's description, everything else already set.
 * @return `desc`, ready to return from sokol_main.
 */
sapp_desc app_desc(int argc, char* argv[], sapp_desc desc);

} // namespace xl
