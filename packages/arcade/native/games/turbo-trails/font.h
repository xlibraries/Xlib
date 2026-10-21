// A baked TrueType font for the HUD: stb_truetype renders the printable ASCII glyphs into one alpha atlas at a
// fixed pixel size; the game uploads the atlas once and draws text as textured quads at any size (the atlas is
// oversampled, so moderate scaling stays smooth). Graphics-free, so tests can bake the real font.
#pragma once
#include <cstdint>
#include <string>
#include <vector>

namespace tt {

struct Glyph {
    float u0, v0, u1, v1;      // atlas rectangle, 0..1
    float x0, y0, x1, y1;      // quad relative to the pen, in pixels at the baked size (y down)
    float advance;
};

struct Font {
    int atlas_w = 0, atlas_h = 0;
    std::vector<uint8_t> atlas;   // one alpha byte per pixel
    float baked_px = 0;           // the size the atlas was rendered at
    float ascent = 0, descent = 0, line_height = 0;   // at the baked size
    Glyph glyphs[96] = {};        // ASCII 32..127
    bool ok = false;

    /** Bakes `ttf` at `px` pixels into a square atlas; false if the font is unreadable. */
    bool bake(const std::vector<uint8_t>& ttf, float px, int atlas_size = 1024);
    const Glyph& glyph(char c) const { return glyphs[(c < 32 || c > 126) ? '?' - 32 : c - 32]; }
    /** Width of `text` drawn at `px` pixels. */
    float width(const std::string& text, float px) const;
};

} // namespace tt
