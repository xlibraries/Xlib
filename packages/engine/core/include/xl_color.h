/**
 * @file xl_color.h
 * @brief A colour, shared by the engine's text renderer and the apps' art (no sokol needed).
 */
#pragma once

namespace xl {

/** A colour, 0..1 per channel. */
struct Rgb {
    float r;   ///< Red, 0..1.
    float g;   ///< Green, 0..1.
    float b;   ///< Blue, 0..1.
};

} // namespace xl
