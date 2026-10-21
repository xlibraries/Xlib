// A colour, 0..1 per channel. Shared by the engine's text renderer and the apps' art, so it lives on its own
// (no sokol needed).
#pragma once

namespace xl {

struct Rgb { float r, g, b; };

} // namespace xl
