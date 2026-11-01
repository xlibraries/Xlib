/**
 * @file xl_text.h
 * @brief Text with a baked font (xl_font.h), drawn as textured quads through sokol_gl.
 *
 * Draws in whatever coordinate system is current: pixels on a HUD (y down), metres in a world (y up: pass
 * `ydir = -1`). Include after sokol_gl.h.
 */
#pragma once
#include <cstdio>
#include <string>
#include <vector>
#ifndef SOKOL_GL_INCLUDED
#error "include sokol_gl.h before xl_text.h"
#endif
#include "xl_color.h"
#include "xl_font.h"

namespace xl {
namespace txt {

/** Where text sits relative to its x: its left end, its middle or its right end. */
enum Align { LEFT = -1, CENTRE = 0, RIGHT = 1 };

/** A font uploaded to the GPU, ready to draw. */
struct Text {
    static constexpr Align CENTRE = txt::CENTRE, LEFT = txt::LEFT, RIGHT = txt::RIGHT;
    Font font;                 ///< The baked font.
    sg_image image = {};       ///< Its atlas on the GPU.
    sg_view view = {};         ///< The atlas's texture view.
    sg_sampler sampler = {};   ///< Linear, clamped.
    bool ready = false;        ///< Whether setup() succeeded.

    /**
     * Bakes the font and uploads its atlas (white, alpha from the glyphs).
     * @param ttf The font file's bytes.
     * @param px The pixel size to bake at (larger: sharper when drawn big).
     */
    void setup(const std::vector<uint8_t>& ttf, float px) {
        if (!font.bake(ttf, px)) return;
        std::vector<uint8_t> rgba(font.atlas.size() * 4);
        for (size_t i = 0; i < font.atlas.size(); i++) { rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = 255; rgba[i * 4 + 3] = font.atlas[i]; }
        sg_image_desc img = {};
        img.width = font.atlas_w; img.height = font.atlas_h;
        img.pixel_format = SG_PIXELFORMAT_RGBA8;
        img.data.mip_levels[0] = { rgba.data(), rgba.size() };
        image = sg_make_image(&img);
        sg_view_desc v = {};
        v.texture.image = image;
        view = sg_make_view(&v);
        sg_sampler_desc smp = {};
        smp.min_filter = smp.mag_filter = SG_FILTER_LINEAR;
        smp.wrap_u = smp.wrap_v = SG_WRAP_CLAMP_TO_EDGE;
        sampler = sg_make_sampler(&smp);
        ready = true;
    }

    /** Releases the atlas. */
    void shutdown() { if (ready) { sg_destroy_view(view); sg_destroy_image(image); sg_destroy_sampler(sampler); ready = false; } }

    /**
     * How wide text is.
     * @param s The text.
     * @param px The size it's drawn at.
     * @return Its width, in the units of `px`.
     */
    float width(const std::string& s, float px) const { return font.width(s, px); }

    /**
     * One layer of glyph quads.
     * @param s The text.
     * @param x The left, centre or right end of the baseline (by `align`).
     * @param y The baseline.
     * @param px The size.
     * @param c The colour.
     * @param a The opacity, 0..1.
     * @param align Which end `x` is.
     * @param ydir 1 when y grows down (a HUD), -1 when it grows up (a world).
     */
    void layer(const std::string& s, float x, float y, float px, Rgb c, float a, Align align, float ydir) const {
        const float k = px / font.baked_px;
        float pen = x - (align == CENTRE ? width(s, px) / 2 : align == RIGHT ? width(s, px) : 0);
        sgl_begin_quads();
        sgl_c4f(c.r, c.g, c.b, a);
        for (char ch : s) {
            const Glyph& g = font.glyph(ch);
            const float x0 = pen + g.x0 * k, x1 = pen + g.x1 * k, y0 = y + g.y0 * k * ydir, y1 = y + g.y1 * k * ydir;
            sgl_v2f_t2f(x0, y0, g.u0, g.v0); sgl_v2f_t2f(x1, y0, g.u1, g.v0); sgl_v2f_t2f(x1, y1, g.u1, g.v1); sgl_v2f_t2f(x0, y1, g.u0, g.v1);
            pen += g.advance * k;
        }
        sgl_end();
    }

    /**
     * Draws text: a soft shadow, a dark outline, then the fill.
     * @param s The text.
     * @param x The left, centre or right end of the line (by `align`).
     * @param y The top of the line.
     * @param px The size.
     * @param c The fill colour.
     * @param align Which end `x` is.
     * @param a The opacity, 0..1.
     * @param outline Whether to draw the shadow and outline.
     * @param ydir 1 when y grows down (a HUD), -1 when it grows up (a world).
     */
    void draw(const std::string& s, float x, float y, float px, Rgb c, Align align = LEFT, float a = 1, bool outline = true, float ydir = 1) const {
        if (!ready || s.empty()) return;
        sgl_enable_texture();
        sgl_texture(view, sampler);
        const float base = y + font.ascent * (px / font.baked_px) * ydir, o = px * 0.07f;
        const Rgb dark = { 0.08f, 0.05f, 0.12f };
        if (outline) {
            layer(s, x + o * 0.6f, base + o * 1.6f * ydir, px, dark, a * 0.35f, align, ydir);   // shadow
            for (int i = 0; i < 8; i++) { const float ang = i * 0.7854f; layer(s, x + std::cos(ang) * o, base + std::sin(ang) * o * ydir, px, dark, a, align, ydir); }
        }
        layer(s, x, base, px, c, a, align, ydir);
        sgl_disable_texture();
    }

    /**
     * Word-wraps text.
     * @param s The text.
     * @param px The size it will be drawn at.
     * @param max_w The widest a line may be.
     * @return The lines.
     */
    std::vector<std::string> wrap(const std::string& s, float px, float max_w) const {
        std::vector<std::string> lines;
        std::string line, word;
        const auto flush_word = [&]() {
            if (word.empty()) return;
            const std::string candidate = line.empty() ? word : line + " " + word;
            if (!line.empty() && width(candidate, px) > max_w) { lines.push_back(line); line = word; }
            else line = candidate;
            word.clear();
        };
        for (char ch : s) { if (ch == ' ') flush_word(); else word += ch; }
        flush_word();
        if (!line.empty()) lines.push_back(line);
        return lines;
    }
};

} // namespace txt
} // namespace xl
