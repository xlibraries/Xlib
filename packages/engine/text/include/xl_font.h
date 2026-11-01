/**
 * @file xl_font.h
 * @brief A baked TrueType font for HUDs.
 *
 * stb_truetype renders the printable ASCII glyphs into one alpha atlas at a fixed pixel size; the module uploads the
 * atlas once and draws text as textured quads at any size (the atlas is oversampled, so moderate scaling stays
 * smooth). Graphics-free, so tests can bake the real font.
 */
#pragma once
#include <cstdint>
#include <string>
#include <vector>

namespace xl {

/** One glyph in the atlas. */
struct Glyph {
    float u0, v0, u1, v1;      ///< Its rectangle in the atlas, 0..1.
    float x0, y0, x1, y1;      ///< Its quad relative to the pen, in pixels at the baked size (y down).
    float advance;             ///< How far the pen moves after it, in pixels at the baked size.
};

/** A font baked into an alpha atlas. */
struct Font {
    int atlas_w = 0, atlas_h = 0;                     ///< The atlas's size in pixels.
    std::vector<uint8_t> atlas;                       ///< One alpha byte per pixel.
    float baked_px = 0;                               ///< The size the atlas was rendered at.
    float ascent = 0, descent = 0, line_height = 0;   ///< Metrics at the baked size.
    Glyph glyphs[96] = {};                            ///< ASCII 32..127.
    bool ok = false;                                  ///< Whether bake() succeeded.

    /**
     * Bakes a TrueType font into a square atlas.
     * @param ttf The font file's bytes.
     * @param px The pixel size to render glyphs at.
     * @param atlas_size The atlas's width and height in pixels.
     * @return False if the font is unreadable (and the font stays empty).
     */
    bool bake(const std::vector<uint8_t>& ttf, float px, int atlas_size = 1024);

    /**
     * A character's glyph.
     * @param c The character; anything outside printable ASCII draws as '?'.
     * @return Its glyph.
     */
    const Glyph& glyph(char c) const { return glyphs[(c < 32 || c > 126) ? '?' - 32 : c - 32]; }

    /**
     * How wide text is.
     * @param text The text.
     * @param px The size it's drawn at, in pixels.
     * @return Its width in pixels.
     */
    float width(const std::string& text, float px) const;
};

} // namespace xl
