// Era-specific art for Turbo Trails, drawn with sokol_gl in a Pixar-ish style: rounded shapes with soft vertical
// shading, thin dark outlines and glints; a sky with a sun, puffy clouds and haze over the far layers; and
// JyotiRath's face (eyes, brows, mouth) on every era's vehicle, driven by feel.h's Mood. Included by main.cpp only.
#pragma once
#include <algorithm>
#include <cmath>
#include <cstdint>
#ifndef SOKOL_GL_INCLUDED
#error "include sokol_gl.h before art.h"
#endif
#include "eras.h"
#include "feel.h"
#include "physics.h"
#include "terrain.h"

namespace art {

using tt::Rgb;

struct Pt { float x, y; };

constexpr float TAU = 6.2831853f;

// Which way is up for shading: +1 in world space (y up), -1 in screen space (y down). main.cpp sets it per layer.
inline float up_sign = 1;

inline void col(Rgb c, float a = 1) { sgl_c4f(c.r, c.g, c.b, a); }
inline Rgb mix(Rgb a, Rgb b, float t) { return { a.r + (b.r - a.r) * t, a.g + (b.g - a.g) * t, a.b + (b.b - a.b) * t }; }
inline Rgb darker(Rgb c, float k) { return { c.r * k, c.g * k, c.b * k }; }
/** k > 0 lightens toward white, k < 0 darkens. */
inline Rgb lit(Rgb c, float k) { return k >= 0 ? mix(c, { 1, 1, 1 }, k) : darker(c, 1 + k); }
inline Rgb outline_of(Rgb c) { return { c.r * 0.42f, c.g * 0.4f, c.b * 0.48f }; }
inline void quad(float x0, float y0, float x1, float y1) { sgl_v2f(x0, y0); sgl_v2f(x1, y0); sgl_v2f(x1, y1); sgl_v2f(x0, y1); }
inline void tri(float x0, float y0, float x1, float y1, float x2, float y2) { sgl_v2f(x0, y0); sgl_v2f(x1, y1); sgl_v2f(x2, y2); }

inline void disc(float cx, float cy, float r, Rgb c, float a = 1, int n = 18) {
    sgl_begin_triangles();
    col(c, a);
    for (int i = 0; i < n; i++) {
        const float a0 = i * TAU / n, a1 = (i + 1) * TAU / n;
        sgl_v2f(cx, cy); sgl_v2f(cx + std::cos(a0) * r, cy + std::sin(a0) * r); sgl_v2f(cx + std::cos(a1) * r, cy + std::sin(a1) * r);
    }
    sgl_end();
}

/** A disc that fades from the centre out: glows, puffs, soft shadows. */
inline void soft_disc(float cx, float cy, float r, Rgb c, float a_centre, float a_edge = 0, int n = 20) {
    sgl_begin_triangles();
    for (int i = 0; i < n; i++) {
        const float a0 = i * TAU / n, a1 = (i + 1) * TAU / n;
        col(c, a_centre); sgl_v2f(cx, cy);
        col(c, a_edge); sgl_v2f(cx + std::cos(a0) * r, cy + std::sin(a0) * r); sgl_v2f(cx + std::cos(a1) * r, cy + std::sin(a1) * r);
    }
    sgl_end();
}

/** An ellipse's outline points (n of them) into out. */
inline void ellipse_pts(Pt* out, float cx, float cy, float rx, float ry, int n) {
    for (int i = 0; i < n; i++) out[i] = { cx + std::cos(i * TAU / n) * rx, cy + std::sin(i * TAU / n) * ry };
}

/** Fills a convex polygon with a vertical gradient: `top`/`bottom` lighten or darken the colour at its extremes. */
inline void fill(const Pt* p, int n, Rgb c, float top = 0.2f, float bottom = -0.22f, float a = 1) {
    float lo = p[0].y, hi = p[0].y;
    for (int i = 1; i < n; i++) { lo = std::min(lo, p[i].y); hi = std::max(hi, p[i].y); }
    const float span = std::max(1e-4f, hi - lo);
    const auto shade = [&](const Pt& v) {
        float t = (v.y - lo) / span;
        if (up_sign < 0) t = 1 - t;
        col(lit(c, bottom + (top - bottom) * t), a);
    };
    sgl_begin_triangles();
    for (int i = 1; i + 1 < n; i++) { shade(p[0]); sgl_v2f(p[0].x, p[0].y); shade(p[i]); sgl_v2f(p[i].x, p[i].y); shade(p[i + 1]); sgl_v2f(p[i + 1].x, p[i + 1].y); }
    sgl_end();
}

/** Strokes a polyline with width w (quads per segment, discs at the joints). */
inline void stroke(const Pt* p, int n, Rgb c, float w, bool closed = true, float a = 1) {
    sgl_begin_quads();
    col(c, a);
    for (int i = 0; i < (closed ? n : n - 1); i++) {
        const Pt& s = p[i]; const Pt& e = p[(i + 1) % n];
        float dx = e.x - s.x, dy = e.y - s.y; const float len = std::sqrt(dx * dx + dy * dy);
        if (len < 1e-5f) continue;
        dx /= len; dy /= len;
        const float nx = -dy * w * 0.5f, ny = dx * w * 0.5f;
        sgl_v2f(s.x + nx, s.y + ny); sgl_v2f(e.x + nx, e.y + ny); sgl_v2f(e.x - nx, e.y - ny); sgl_v2f(s.x - nx, s.y - ny);
    }
    sgl_end();
    for (int i = 0; i < n; i++) disc(p[i].x, p[i].y, w * 0.5f, c, a, 6);
}

/** The house style: a thin dark outline under a softly shaded fill. */
inline void shape(const Pt* p, int n, Rgb c, float outline = 0.04f, float top = 0.2f, float bottom = -0.22f) {
    if (outline > 0) stroke(p, n, outline_of(c), outline * 2);
    fill(p, n, c, top, bottom);
}

/** Rounded rectangle (16 points per corner at most). */
inline void rrect(float x0, float y0, float x1, float y1, float r, Rgb c, float outline = 0.04f, float top = 0.2f, float bottom = -0.22f) {
    Pt p[24]; int n = 0;
    r = std::min(r, std::min(x1 - x0, y1 - y0) * 0.5f);
    const float cx[4] = { x1 - r, x0 + r, x0 + r, x1 - r }, cy[4] = { y1 - r, y1 - r, y0 + r, y0 + r };
    for (int corner = 0; corner < 4; corner++) for (int k = 0; k < 6; k++) {
        const float a = (corner * 6 + k) * (TAU / 24);
        p[n++] = { cx[corner] + std::cos(a) * r, cy[corner] + std::sin(a) * r };
    }
    shape(p, n, c, outline, top, bottom);
}

inline void oval(float cx, float cy, float rx, float ry, Rgb c, float outline = 0.04f, float top = 0.2f, float bottom = -0.22f) {
    Pt p[24];
    ellipse_pts(p, cx, cy, rx, ry, 24);
    shape(p, 24, c, outline, top, bottom);
}

/** A white glint: the little reflection that makes paint look like paint. */
inline void glint(float cx, float cy, float rx, float ry, float a = 0.45f) {
    sgl_begin_triangles();
    const int n = 12;
    for (int i = 0; i < n; i++) {
        const float a0 = i * TAU / n, a1 = (i + 1) * TAU / n;
        col({ 1, 1, 1 }, a); sgl_v2f(cx, cy);
        col({ 1, 1, 1 }, 0); sgl_v2f(cx + std::cos(a0) * rx, cy + std::sin(a0) * ry); sgl_v2f(cx + std::cos(a1) * rx, cy + std::sin(a1) * ry);
    }
    sgl_end();
}

/** 0..1, stable for an integer slot (for "random" but repeatable backdrop props). */
inline float hash01(int slot, int salt = 0) {
    uint32_t h = static_cast<uint32_t>(slot) * 0x9e3779b1u ^ static_cast<uint32_t>(salt) * 0x85ebca6bu;
    h ^= h >> 16; h *= 0x7feb352du; h ^= h >> 15; h *= 0x846ca68bu; h ^= h >> 16;
    return (h & 0xffffff) / 16777215.0f;
}

// ---------- Sky and backdrops (screen space: x right, y down; `horizon` is the pixel row the road sits around) ----------

struct View { float w, h, horizon, cam_x, scale, time; };

inline bool is_night(int era_index) { return era_index >= 8; }

/** Three-band sky: deep colour up top, a glow along the horizon. */
inline void sky(const View& v, const tt::Era& e) {
    const Rgb mid = mix(e.sky_top, e.sky_bottom, 0.55f), glow = lit(e.sky_bottom, 0.12f);
    sgl_begin_quads();
    col(e.sky_top); sgl_v2f(0, 0); sgl_v2f(v.w, 0); col(mid); sgl_v2f(v.w, v.horizon * 0.5f); sgl_v2f(0, v.horizon * 0.5f);
    col(mid); sgl_v2f(0, v.horizon * 0.5f); sgl_v2f(v.w, v.horizon * 0.5f); col(glow); sgl_v2f(v.w, v.horizon); sgl_v2f(0, v.horizon);
    col(glow); sgl_v2f(0, v.horizon); sgl_v2f(v.w, v.horizon); col(e.sky_bottom); sgl_v2f(v.w, v.h); sgl_v2f(0, v.h);
    sgl_end();
}

/** The sun (or, at night, the moon) with a soft halo and slow rays. */
inline void sun(const View& v, const tt::Era& e, bool night) {
    const float cx = v.w * 0.74f - v.cam_x * v.scale * 0.015f, cy = v.horizon - v.h * 0.3f, r = v.h * 0.05f;
    if (night) {
        const Rgb moon = { 0.95f, 0.95f, 0.9f };
        soft_disc(cx, cy, r * 3.2f, moon, 0.18f);
        disc(cx, cy, r * 0.8f, moon, 1, 28);
        disc(cx - r * 0.3f, cy - r * 0.2f, r * 0.65f, mix(e.sky_top, moon, 0.1f), 1, 28);   // crescent
        return;
    }
    const Rgb core = { 1.0f, 0.97f, 0.82f }, warm = lit(e.sky_bottom, 0.5f);
    soft_disc(cx, cy, r * 4.5f, warm, 0.16f);
    soft_disc(cx, cy, r * 2.0f, core, 0.3f);
    sgl_begin_triangles();
    for (int i = 0; i < 10; i++) {
        const float a = v.time * 0.05f + i * TAU / 10, len = r * (5 + 2 * hash01(i, 51));
        col(core, 0.07f); sgl_v2f(cx, cy);
        col(core, 0); sgl_v2f(cx + std::cos(a) * len, cy + std::sin(a) * len); sgl_v2f(cx + std::cos(a + 0.12f) * len, cy + std::sin(a + 0.12f) * len);
    }
    sgl_end();
    disc(cx, cy, r, core, 1, 28);
}

/** Puffy clouds drifting slowly: a shaded underside, bright tops, flat bottoms. */
inline void clouds(const View& v, float speed, float band, Rgb c, Rgb shade, float alpha = 1) {
    const float off = v.cam_x * v.scale * speed + v.time * 6, spacing = 420;
    for (int slot = static_cast<int>(off / spacing) - 1; slot * spacing - off < v.w + spacing; slot++) {
        if (hash01(slot, 61) < 0.3f) continue;
        const float x = slot * spacing - off + hash01(slot, 62) * 200, y = band + hash01(slot, 63) * v.h * 0.12f, s = 18 + hash01(slot, 64) * 22;
        const float puffs[5][3] = { { 0, 0, 1.0f }, { -1.1f, 0.25f, 0.75f }, { 1.1f, 0.2f, 0.8f }, { -0.5f, -0.35f, 0.7f }, { 0.6f, -0.4f, 0.65f } };
        for (int pass = 0; pass < 2; pass++) for (const auto& p : puffs) {
            const float px = x + p[0] * s, py = y + p[1] * s + (pass == 0 ? s * 0.22f : 0), pr = p[2] * s;
            disc(px, py, pr, pass == 0 ? shade : c, alpha, 20);
        }
        sgl_begin_quads(); col(c, alpha); quad(x - 1.5f * s, y + 0.1f * s, x + 1.6f * s, y + 0.5f * s); sgl_end();
    }
}

/** Atmospheric haze over the far layers: fades them toward the sky near the horizon. */
inline void haze(const View& v, Rgb c, float k) {
    sgl_begin_quads();
    col(c, 0); sgl_v2f(0, v.horizon - v.h * 0.3f); sgl_v2f(v.w, v.horizon - v.h * 0.3f);
    col(c, k); sgl_v2f(v.w, v.horizon + 2); sgl_v2f(0, v.horizon + 2);
    sgl_end();
}

/** Soft hills: a sine silhouette filled down to the bottom, with sunlight along the ridge. */
inline void hills(const View& v, float speed, float amp, float wl, Rgb c, float phase = 0) {
    const float off = v.cam_x * v.scale * speed;
    const auto y = [&](float x) { return v.horizon - amp * (0.6f + 0.4f * std::sin((x + off) / wl * TAU + phase) + 0.25f * std::sin((x + off) / (wl * 0.37f) * TAU)); };
    sgl_begin_quads();
    for (float x = 0; x < v.w; x += 12) {
        col(lit(c, 0.1f)); sgl_v2f(x, y(x)); sgl_v2f(x + 12, y(x + 12));
        col(lit(c, -0.18f)); sgl_v2f(x + 12, v.h); sgl_v2f(x, v.h);
    }
    const Rgb rim = lit(c, 0.3f);
    for (float x = 0; x < v.w; x += 12) { col(rim, 0.8f); sgl_v2f(x, y(x)); sgl_v2f(x + 12, y(x + 12)); col(rim, 0); sgl_v2f(x + 12, y(x + 12) + 7); sgl_v2f(x, y(x) + 7); }
    sgl_end();
}

/** Flat-topped buttes (canyon country). */
inline void buttes(const View& v, float speed, float height, Rgb c) {
    const float off = v.cam_x * v.scale * speed, spacing = 260;
    sgl_begin_quads();
    for (int slot = static_cast<int>(off / spacing) - 1; slot * spacing - off < v.w + spacing; slot++) {
        const float x = slot * spacing - off + hash01(slot, 1) * 120, bw = 60 + hash01(slot, 2) * 140, bh = height * (0.5f + hash01(slot, 3) * 0.5f);
        col(lit(c, 0.12f)); sgl_v2f(x - 18, v.horizon); sgl_v2f(x, v.horizon - bh); col(lit(c, 0.12f)); sgl_v2f(x + bw, v.horizon - bh); col(lit(c, -0.15f)); sgl_v2f(x + bw + 18, v.horizon);
        col(lit(c, -0.05f)); quad(x - 30, v.horizon - bh * 0.35f, x + bw + 30, v.horizon);
        col(lit(c, 0.3f)); quad(x, v.horizon - bh, x + bw, v.horizon - bh + 4);
    }
    sgl_end();
}

/** A city skyline with lit windows; `neon` adds glowing rooflines. */
inline void skyline(const View& v, float speed, float max_h, Rgb c, Rgb windows, bool neon, Rgb neon_col) {
    const float off = v.cam_x * v.scale * speed, spacing = 54;
    for (int slot = static_cast<int>(off / spacing) - 1; slot * spacing - off < v.w + spacing; slot++) {
        const float x = slot * spacing - off, bw = spacing - 6 - hash01(slot, 4) * 14, bh = max_h * (0.25f + hash01(slot, 5) * 0.75f);
        sgl_begin_quads();
        col(lit(c, 0.08f)); sgl_v2f(x, v.horizon - bh); sgl_v2f(x + bw, v.horizon - bh); col(lit(c, -0.12f)); sgl_v2f(x + bw, v.horizon); sgl_v2f(x, v.horizon);
        for (float wy = v.horizon - bh + 10; wy < v.horizon - 8; wy += 11) for (float wx = x + 5; wx < x + bw - 6; wx += 9) {
            if (hash01(slot * 97 + static_cast<int>(wy) * 7 + static_cast<int>(wx), 6) > 0.45f) continue;
            col(windows, 0.85f); quad(wx, wy, wx + 4, wy + 6);
        }
        if (neon) { col(neon_col, 0.9f); quad(x, v.horizon - bh - 3, x + bw, v.horizon - bh); if (hash01(slot, 7) > 0.6f) quad(x + bw / 2 - 2, v.horizon - bh - 30, x + bw / 2 + 2, v.horizon - bh); }
        sgl_end();
        if (neon) soft_disc(x + bw / 2, v.horizon - bh, bw, neon_col, 0.18f);
    }
}

/** Stars in the top of the sky. */
inline void stars(const View& v, int count) {
    sgl_begin_quads();
    for (int i = 0; i < count; i++) {
        const float x = hash01(i, 11) * v.w, y = hash01(i, 12) * v.horizon * 0.8f;
        const float tw = 0.5f + 0.5f * std::sin(v.time * (1 + hash01(i, 13) * 3) + i);
        sgl_c4f(1, 1, 1, 0.4f + 0.6f * tw); quad(x, y, x + 2, y + 2);
    }
    sgl_end();
}

/** A strip of trees along the horizon: 0 pine, 1 cypress, 2 palm. */
inline void trees(const View& v, float speed, int kind, Rgb c, float spacing, float base_dy = 0) {
    const float off = v.cam_x * v.scale * speed;
    for (int slot = static_cast<int>(off / spacing) - 1; slot * spacing - off < v.w + spacing; slot++) {
        const float x = slot * spacing - off + hash01(slot, 21) * spacing * 0.6f, s = 0.7f + hash01(slot, 22) * 0.6f, y = v.horizon + base_dy;
        sgl_begin_triangles();
        if (kind == 0) { col(lit(c, -0.1f)); tri(x - 14 * s, y, x + 14 * s, y, x, y - 40 * s); col(lit(c, 0.08f)); tri(x - 10 * s, y - 22 * s, x + 10 * s, y - 22 * s, x, y - 52 * s); }
        else if (kind == 1) { col(c); tri(x - 5 * s, y, x + 5 * s, y, x, y - 60 * s); col(lit(c, 0.08f)); tri(x - 7 * s, y - 10 * s, x + 7 * s, y - 10 * s, x, y - 45 * s); }
        else { col(c); for (int f = 0; f < 5; f++) { const float a = -1.4f + f * 0.7f; tri(x, y - 36 * s, x + std::cos(a) * 22 * s, y - 36 * s - std::sin(a) * 14 * s - 8, x + std::cos(a + 0.35f) * 20 * s, y - 36 * s - std::sin(a + 0.35f) * 14 * s); } }
        sgl_end();
        if (kind == 2) { sgl_begin_quads(); col(darker(c, 0.7f)); quad(x - 2 * s, y - 36 * s, x + 2 * s, y); sgl_end(); }
    }
}

/** Props along the horizon: 0 oil derrick, 1 windmill, 2 chateau, 3 grandstand, 4 house, 5 pagoda. */
inline void props(const View& v, float speed, int kind, Rgb c, float spacing) {
    const float off = v.cam_x * v.scale * speed;
    for (int slot = static_cast<int>(off / spacing) - 1; slot * spacing - off < v.w + spacing; slot++) {
        if (hash01(slot, 31) < 0.35f) continue;
        const float x = slot * spacing - off + hash01(slot, 32) * spacing * 0.5f, y = v.horizon, s = 0.8f + hash01(slot, 33) * 0.5f;
        sgl_begin_quads();
        col(c);
        switch (kind) {
            case 0: quad(x - 2, y - 70 * s, x + 2, y); quad(x - 16 * s, y - 2, x + 16 * s, y); quad(x - 10 * s, y - 40 * s, x + 10 * s, y - 38 * s); quad(x - 7 * s, y - 70 * s, x + 7 * s, y - 66 * s); break;
            case 1: { quad(x - 10 * s, y - 50 * s, x + 10 * s, y); const float a = v.time * 1.2f + slot; for (int b = 0; b < 4; b++) { const float ang = a + b * 1.5708f; quad(x - 1.5f, y - 50 * s, x + 1.5f, y - 50 * s); sgl_v2f(x, y - 50 * s); sgl_v2f(x + std::cos(ang) * 30 * s, y - 50 * s + std::sin(ang) * 30 * s); sgl_v2f(x + std::cos(ang + 0.15f) * 30 * s, y - 50 * s + std::sin(ang + 0.15f) * 30 * s); sgl_v2f(x, y - 50 * s); } break; }
            case 2: quad(x - 40 * s, y - 36 * s, x + 40 * s, y); quad(x - 46 * s, y - 60 * s, x - 30 * s, y); quad(x + 30 * s, y - 60 * s, x + 46 * s, y); quad(x - 8 * s, y - 70 * s, x + 8 * s, y); break;
            case 3: quad(x - 60 * s, y - 30 * s, x + 60 * s, y); for (float t = -56 * s; t < 56 * s; t += 12 * s) quad(x + t, y - 28 * s, x + t + 6 * s, y - 4 * s); quad(x - 64 * s, y - 36 * s, x + 64 * s, y - 30 * s); break;
            case 4: quad(x - 16 * s, y - 22 * s, x + 16 * s, y); sgl_v2f(x - 20 * s, y - 22 * s); sgl_v2f(x + 20 * s, y - 22 * s); sgl_v2f(x + 20 * s, y - 24 * s); sgl_v2f(x, y - 40 * s); break;
            case 5: for (int t = 0; t < 3; t++) { const float ty = y - t * 18 * s, tw = (26 - t * 6) * s; quad(x - tw * 0.7f, ty - 14 * s, x + tw * 0.7f, ty); sgl_v2f(x - tw, ty - 14 * s); sgl_v2f(x + tw, ty - 14 * s); sgl_v2f(x + tw * 0.6f, ty - 20 * s); sgl_v2f(x - tw * 0.6f, ty - 20 * s); } break;
        }
        sgl_end();
    }
}

/** Water: a band under the horizon with moving highlights (coast, lakes). */
inline void sea(const View& v, Rgb c, Rgb glint_col) {
    sgl_begin_quads();
    col(lit(c, 0.15f)); sgl_v2f(0, v.horizon - 6); sgl_v2f(v.w, v.horizon - 6); col(c); sgl_v2f(v.w, v.horizon + 40); sgl_v2f(0, v.horizon + 40);
    for (int i = 0; i < 40; i++) { const float x = std::fmod(hash01(i, 41) * v.w + v.time * (10 + hash01(i, 42) * 20), v.w), y = v.horizon + hash01(i, 43) * 30; col(glint_col, 0.5f); quad(x, y, x + 8 + hash01(i, 44) * 10, y + 1.5f); }
    sgl_end();
}

inline void draw_backdrop(int era_index, const tt::Era& e, const View& v) {
    up_sign = -1;
    const bool night = is_night(era_index);
    sky(v, e);
    if (night) stars(v, era_index == 9 ? 120 : 90);
    sun(v, e, night);
    const Rgb cloud = night ? mix(e.sky_top, { 1, 1, 1 }, 0.25f) : Rgb{ 0.97f, 0.96f, 0.94f }, cloud_shade = night ? mix(e.sky_top, { 1, 1, 1 }, 0.12f) : mix(e.sky_bottom, { 1, 1, 1 }, 0.4f);
    if (era_index != 9) clouds(v, 0.03f, v.horizon - v.h * 0.42f, cloud, cloud_shade, night ? 0.6f : 0.9f);
    const Rgb far = mix(e.far_hills, e.sky_bottom, 0.3f), near = mix(e.near_hills, e.sky_bottom, 0.1f);
    switch (era_index) {
        case 0: hills(v, 0.08f, v.h * 0.12f, 380, far); haze(v, e.sky_bottom, 0.45f); trees(v, 0.14f, 2, darker(near, 0.9f), 170, -4); hills(v, 0.2f, v.h * 0.08f, 220, near, 1.3f); break;
        case 1: hills(v, 0.08f, v.h * 0.1f, 420, far); haze(v, e.sky_bottom, 0.45f); props(v, 0.16f, 1, darker(near, 0.8f), 300); hills(v, 0.2f, v.h * 0.07f, 240, near, 0.7f); break;
        case 2: hills(v, 0.08f, v.h * 0.1f, 400, far); haze(v, e.sky_bottom, 0.4f); props(v, 0.15f, 2, darker(near, 0.75f), 520); hills(v, 0.2f, v.h * 0.06f, 260, near, 2.1f); trees(v, 0.26f, 1, darker(near, 0.85f), 90, 2); break;
        case 3: hills(v, 0.08f, v.h * 0.12f, 360, far); haze(v, e.sky_bottom, 0.4f); trees(v, 0.15f, 0, darker(near, 0.85f), 46, -6); props(v, 0.22f, 4, darker(near, 0.7f), 240); hills(v, 0.24f, v.h * 0.04f, 300, near); break;
        case 4: hills(v, 0.06f, v.h * 0.04f, 600, far); haze(v, e.sky_bottom, 0.5f); props(v, 0.16f, 0, darker(near, 0.8f), 260); hills(v, 0.2f, v.h * 0.03f, 500, near); break;
        case 5: hills(v, 0.07f, v.h * 0.06f, 500, far); haze(v, e.sky_bottom, 0.4f); props(v, 0.18f, 3, darker(near, 0.8f), 420); trees(v, 0.24f, 0, darker(near, 0.9f), 120, 2); break;
        case 6: buttes(v, 0.07f, v.h * 0.16f, far); haze(v, e.sky_bottom, 0.5f); buttes(v, 0.16f, v.h * 0.11f, near); break;
        case 7: sea(v, { 0.1f, 0.45f, 0.75f }, { 0.8f, 0.95f, 1.0f }); hills(v, 0.1f, v.h * 0.1f, 300, far, 0.4f); haze(v, e.sky_bottom, 0.35f); props(v, 0.18f, 4, darker(near, 0.8f), 160); trees(v, 0.26f, 1, darker(near, 0.9f), 70, 2); break;
        case 8: skyline(v, 0.06f, v.h * 0.22f, far, { 1.0f, 0.9f, 0.6f }, false, e.accent); haze(v, e.sky_bottom, 0.35f); skyline(v, 0.14f, v.h * 0.13f, near, { 0.9f, 0.8f, 0.5f }, false, e.accent); break;
        default: { sgl_begin_triangles(); col(darker(far, 1.3f)); tri(v.w * 0.55f, v.horizon, v.w * 0.95f, v.horizon, v.w * 0.75f, v.horizon - v.h * 0.26f); col({ 0.9f, 0.9f, 1.0f }); tri(v.w * 0.72f, v.horizon - v.h * 0.2f, v.w * 0.78f, v.horizon - v.h * 0.2f, v.w * 0.75f, v.horizon - v.h * 0.26f); sgl_end(); }
                 skyline(v, 0.07f, v.h * 0.24f, far, { 0.6f, 0.9f, 1.0f }, true, e.accent); haze(v, e.sky_bottom, 0.3f); props(v, 0.12f, 5, darker(near, 1.2f), 700); skyline(v, 0.15f, v.h * 0.14f, near, { 1.0f, 0.5f, 0.9f }, true, e.ground_top); break;
    }
    up_sign = 1;
}

/** Horizontal streaks at the sides of the screen while Turbo is on. */
inline void speed_lines(const View& v, float strength) {
    if (strength < 0.02f) return;
    sgl_begin_quads();
    for (int i = 0; i < 18; i++) {
        const float y = hash01(i, 71) * v.h, len = (60 + hash01(i, 72) * 160) * strength, x = std::fmod(hash01(i, 73) * v.w + v.time * (900 + hash01(i, 74) * 600), v.w + len) - len;
        const float edge = std::fabs(y / v.h - 0.5f) * 2;   // strongest near the top and bottom
        col({ 1, 1, 1 }, 0); sgl_v2f(x, y); col({ 1, 1, 1 }, 0.35f * strength * edge); sgl_v2f(x + len, y); sgl_v2f(x + len, y + 2); col({ 1, 1, 1 }, 0); sgl_v2f(x, y + 2);
    }
    sgl_end();
}

// ---------- Ground (world space, metres, y up) ----------

inline void draw_ground(const tt::Era& e, const tt::Terrain& t, float left, float right) {
    const int i0 = std::max(0, static_cast<int>((left - t.xs.front()) / tt::TERRAIN_STEP) - 1);
    const int i1 = std::min(static_cast<int>(t.xs.size()) - 2, static_cast<int>((right - t.xs.front()) / tt::TERRAIN_STEP) + 1);
    const Rgb deep = mix(darker(e.ground, 0.6f), { 0.16f, 0.12f, 0.14f }, 0.25f), soil = e.ground, top = e.ground_top, rim = lit(e.ground_top, 0.35f);
    sgl_begin_quads();
    for (int i = i0; i <= i1; i++) {
        // soil: darker with depth, with a faint stratum band
        col(soil); sgl_v2f(t.xs[i], t.ys[i] - 0.35f); sgl_v2f(t.xs[i + 1], t.ys[i + 1] - 0.35f);
        col(deep); sgl_v2f(t.xs[i + 1], t.ys[i + 1] - 30); sgl_v2f(t.xs[i], t.ys[i] - 30);
        col(darker(soil, 0.85f), 0.6f); sgl_v2f(t.xs[i], t.ys[i] - 1.3f); sgl_v2f(t.xs[i + 1], t.ys[i + 1] - 1.3f); sgl_v2f(t.xs[i + 1], t.ys[i + 1] - 1.6f); sgl_v2f(t.xs[i], t.ys[i] - 1.6f);
        // the surface band and its sunlit edge
        col(lit(top, -0.12f)); sgl_v2f(t.xs[i], t.ys[i] - 0.35f); sgl_v2f(t.xs[i + 1], t.ys[i + 1] - 0.35f); col(top); sgl_v2f(t.xs[i + 1], t.ys[i + 1]); sgl_v2f(t.xs[i], t.ys[i]);
        col(rim); sgl_v2f(t.xs[i], t.ys[i] - 0.07f); sgl_v2f(t.xs[i + 1], t.ys[i + 1] - 0.07f); sgl_v2f(t.xs[i + 1], t.ys[i + 1] + 0.02f); sgl_v2f(t.xs[i], t.ys[i] + 0.02f);
    }
    sgl_end();
    // pebbles in the soil and tufts on top, where the hash says so
    for (int i = i0; i <= i1; i++) {
        const float h = hash01(i, 81);
        if (h > 0.82f) disc(t.xs[i] + hash01(i, 82) * 0.4f, t.ys[i] - 0.6f - hash01(i, 83) * 3.5f, 0.06f + hash01(i, 84) * 0.1f, darker(soil, 0.72f), 1, 8);
        if (h < 0.14f) {
            const float x = t.xs[i] + hash01(i, 85) * 0.4f, y = t.height(x);
            sgl_begin_triangles();
            col(lit(top, 0.15f)); tri(x - 0.1f, y, x + 0.1f, y, x + 0.04f, y + 0.22f + hash01(i, 86) * 0.15f);
            col(lit(top, 0.05f)); tri(x + 0.02f, y, x + 0.2f, y, x + 0.18f, y + 0.18f);
            sgl_end();
        }
    }
}

/** A soft shadow on the ground under the vehicle, fading as it jumps. */
inline void draw_shadow(const tt::Terrain& t, float x, float half_w, float height_above) {
    const float a = 0.32f * std::max(0.0f, 1 - height_above / 4.0f);
    if (a <= 0) return;
    const float y = t.height(x), s = t.slope(x);
    sgl_push_matrix();
    sgl_translate(x, y + 0.03f, 0);
    sgl_rotate(s, 0, 0, 1);
    sgl_scale(1, 0.18f, 1);
    soft_disc(0, 0, half_w * (1 + height_above * 0.15f), { 0.05f, 0.03f, 0.08f }, a, 0, 20);
    sgl_pop_matrix();
}

// ---------- Pickups ----------

inline void draw_coin(float x, float y, float spin) {
    const float rx = 0.28f * std::max(0.18f, std::fabs(std::cos(spin)));
    oval(x, y, rx, 0.28f, { 1.0f, 0.8f, 0.2f }, 0.035f, 0.35f, -0.25f);
    oval(x, y, rx * 0.62f, 0.18f, { 1.0f, 0.88f, 0.4f }, 0.02f, 0.2f, -0.1f);
    glint(x - rx * 0.3f, y + 0.12f, rx * 0.35f, 0.1f, 0.7f);
}

inline void draw_fuel(float x, float y, bool electric, float t) {
    const Rgb c = electric ? Rgb{ 0.2f, 0.85f, 1.0f } : Rgb{ 0.92f, 0.2f, 0.18f };
    soft_disc(x, y, 0.9f, c, 0.12f + 0.06f * std::sin(t * 4));
    rrect(x - 0.36f, y - 0.45f, x + 0.36f, y + 0.45f, 0.1f, c, 0.04f, 0.28f, -0.25f);
    rrect(x - 0.14f, y + 0.45f, x + 0.14f, y + 0.6f, 0.04f, { 0.25f, 0.25f, 0.28f }, 0.03f);
    if (electric) { Pt bolt[7] = { { x + 0.08f, y + 0.3f }, { x - 0.14f, y - 0.02f }, { x + 0.02f, y - 0.02f }, { x - 0.08f, y - 0.32f }, { x + 0.16f, y + 0.04f }, { x + 0.02f, y + 0.04f }, { x + 0.08f, y + 0.3f } }; fill(bolt, 7, { 1, 1, 1 }, 0, 0); }
    else rrect(x - 0.2f, y - 0.12f, x + 0.2f, y + 0.2f, 0.05f, { 1, 1, 1 }, 0, 0.0f, -0.1f);
    glint(x - 0.18f, y + 0.25f, 0.12f, 0.16f, 0.5f);
}

inline void draw_treasure(float x, float y, float t, Rgb accent) {
    const float bob = std::sin(t * 2.0f) * 0.2f, pulse = 0.5f + 0.5f * std::sin(t * 5);
    soft_disc(x, y + bob, 1.6f + pulse * 0.3f, accent, 0.3f);
    sgl_begin_triangles();
    for (int i = 0; i < 6; i++) { const float a = t * 0.8f + i * TAU / 6; col({ 1, 1, 1 }, 0.25f); sgl_v2f(x, y + bob); col({ 1, 1, 1 }, 0); sgl_v2f(x + std::cos(a) * 2.2f, y + bob + std::sin(a) * 2.2f); sgl_v2f(x + std::cos(a + 0.2f) * 2.2f, y + bob + std::sin(a + 0.2f) * 2.2f); }
    sgl_end();
    Pt gem[6] = { { x, y + bob + 0.6f }, { x + 0.45f, y + bob + 0.15f }, { x + 0.3f, y + bob - 0.5f }, { x - 0.3f, y + bob - 0.5f }, { x - 0.45f, y + bob + 0.15f } };
    shape(gem, 5, accent, 0.04f, 0.5f, -0.3f);
    glint(x - 0.12f, y + bob + 0.2f, 0.18f, 0.22f, 0.8f);
}

// ---------- Landmarks (world space, standing on the road at their x) ----------

enum Landmark { DOME, TOWER, BRIDGE, BUILDING, ARCH, PEAK, PLATFORM };

// one shape per landmark, era by era (same order as eras.cpp)
inline Landmark landmark_shape(int era_index, int index) {
    static const Landmark SHAPES[10][4] = {
        { BUILDING, PLATFORM, BUILDING, ARCH }, { BRIDGE, TOWER, BUILDING, PLATFORM }, { BRIDGE, DOME, PLATFORM, ARCH }, { BUILDING, TOWER, DOME, BUILDING },
        { BUILDING, PLATFORM, TOWER, PLATFORM }, { ARCH, PLATFORM, PLATFORM, BUILDING }, { PEAK, PLATFORM, PEAK, BUILDING }, { PLATFORM, BUILDING, ARCH, DOME },
        { BUILDING, BUILDING, BRIDGE, PLATFORM }, { PLATFORM, TOWER, BRIDGE, PEAK },
    };
    return SHAPES[era_index % 10][index % 4];
}

inline void draw_landmark(const tt::Era& e, Landmark kind, float x, float y, float t) {
    const Rgb c = darker(e.near_hills, 0.8f), lit_col = e.accent;
    switch (kind) {
        case DOME: rrect(x - 3, y, x + 3, y + 2.2f, 0.2f, c, 0.05f); oval(x, y + 2.2f, 3, 2.6f, c, 0.05f, 0.25f, -0.1f); disc(x, y + 5.0f, 0.5f, lit_col); break;
        case TOWER: rrect(x - 0.7f, y, x + 0.7f, y + 9, 0.15f, c, 0.05f); rrect(x - 1.2f, y + 8.4f, x + 1.2f, y + 9.4f, 0.2f, c, 0.05f); soft_disc(x, y + 9.7f, 1.2f, lit_col, 0.4f + 0.3f * std::sin(t * 3)); disc(x, y + 9.7f, 0.3f, lit_col); break;
        case BRIDGE: for (float px = -6; px <= 6; px += 3) rrect(px + x - 0.3f, y, px + x + 0.3f, y + 2.6f, 0.1f, c, 0.05f); rrect(x - 7, y + 2.6f, x + 7, y + 3.2f, 0.2f, c, 0.05f); break;
        case BUILDING: rrect(x - 3.5f, y, x + 3.5f, y + 4, 0.2f, c, 0.05f); rrect(x - 2.5f, y + 4, x + 2.5f, y + 6, 0.3f, c, 0.05f); sgl_begin_quads(); col(lit_col, 0.8f); quad(x - 1.5f, y + 1, x - 0.5f, y + 2.2f); quad(x + 0.5f, y + 1, x + 1.5f, y + 2.2f); sgl_end(); break;
        case ARCH: rrect(x - 3, y, x - 1.8f, y + 4.5f, 0.2f, c, 0.05f); rrect(x + 1.8f, y, x + 3, y + 4.5f, 0.2f, c, 0.05f); rrect(x - 3.4f, y + 4.5f, x + 3.4f, y + 5.6f, 0.3f, c, 0.05f); break;
        case PEAK: { Pt p[4] = { { x - 6, y }, { x + 6, y }, { x + 1.5f, y + 9 }, { x - 1.5f, y + 9 } }; shape(p, 4, c, 0.05f); Pt s[4] = { { x - 1.5f, y + 7 }, { x + 1.5f, y + 7 }, { x + 1, y + 9 }, { x - 1, y + 9 } }; fill(s, 4, { 1, 1, 1 }, 0, -0.1f, 0.9f); break; }
        case PLATFORM: rrect(x - 5, y, x + 5, y + 1.2f, 0.2f, c, 0.05f); rrect(x - 4, y + 1.2f, x + 4, y + 1.6f, 0.1f, c, 0.05f); rrect(x - 0.4f, y + 1.6f, x + 0.4f, y + 4, 0.1f, lit_col, 0.04f); rrect(x + 0.4f, y + 3.2f, x + 2.2f, y + 4, 0.1f, lit_col, 0.04f); break;
    }
}

inline void draw_landmarks(int era_index, const tt::Era& e, const tt::Terrain& terrain, float left, float right, float t) {
    for (const tt::LandmarkSpot& l : terrain.landmarks) {
        const float x = l.x + 6;   // just past the sign line, so you drive by it
        if (x < left - 10 || x > right + 10) continue;
        draw_landmark(e, landmark_shape(era_index, l.index), x, terrain.height(x) - 0.2f, t);
    }
}

// ---------- The face ----------

/** Where JyotiRath's face sits on each era's vehicle, in half-extents of the chassis (hw, hh). */
struct FaceSpot { float ex, ey, size, gap, mx, my, mw; };

inline FaceSpot face_spot(int era_index) {
    static const FaceSpot SPOTS[10] = {
        { 0.84f, 1.1f, 0.42f, 0.55f, 0.84f, 0.1f, 0.6f },     // chariot: on the front board
        { 0.52f, 1.55f, 0.36f, 0.62f, 0.75f, 0.2f, 0.6f },    // steam carriage: in the cabin glass
        { 0.22f, 0.5f, 0.3f, 0.5f, 0.28f, -0.45f, 0.5f },     // carriage: the front window
        { 0.35f, 0.0f, 0.45f, 0.6f, 0.55f, -0.6f, 0.55f },    // Motorwagen: the front of the bench
        { 0.45f, 1.6f, 0.62f, 0.95f, 0.62f, 0.75f, 0.6f },    // motorcycle: the tank and headlamp (a small chassis, so a big face)
        { 0.3f, 0.42f, 0.36f, 0.62f, 0.85f, -0.25f, 0.5f },   // Grand Prix racer: the cowling, mouth at the nose
        { 0.42f, 1.62f, 0.38f, 0.58f, 0.85f, 0.1f, 0.7f },    // truck: windscreen, mouth on the bull bar
        { 0.08f, 1.5f, 0.36f, 0.58f, 0.82f, 0.0f, 0.7f },     // roadster: windscreen
        { 0.2f, 1.35f, 0.36f, 0.56f, 0.86f, -0.1f, 0.6f },    // coupe: windscreen
        { 0.18f, 1.35f, 0.34f, 0.52f, 0.82f, 0.1f, 0.5f },    // hover: the canopy
    };
    return SPOTS[era_index % 10];
}

/** Eyes, brows and a mouth; chassis-local, sized by hw/hh. `blink` > 0 shuts the eyes. */
inline void draw_face(const FaceSpot& f, float hw, float hh, const tt::Mood& m, float blink, Rgb body) {
    const float size = f.size * hh, open = blink > 0 ? 0.04f : std::max(0.04f, m.eyes);
    const float ex0 = f.ex * hw - f.gap * hh * 0.5f, ex1 = f.ex * hw + f.gap * hh * 0.5f, ey = f.ey * hh;
    const Rgb iris = { 0.25f, 0.55f, 0.85f }, dark = { 0.08f, 0.07f, 0.1f }, white = { 1, 1, 1 };
    for (int i = 0; i < 2; i++) {
        const float cx = i ? ex1 : ex0, rx = size * (0.85f + 0.15f * std::min(1.5f, open)), ry = size * std::min(1.5f, open) * 1.05f;
        if (open <= 0.08f) {   // shut: a curved line
            Pt lid[5]; for (int k = 0; k < 5; k++) lid[k] = { cx - rx + rx * 0.5f * k, ey + std::sin(k * 0.785f) * size * 0.15f };
            stroke(lid, 5, dark, size * 0.14f, false);
            continue;
        }
        oval(cx, ey, rx, ry, white, 0.03f, 0.05f, -0.12f);
        if (m.dizzy) {
            Pt a[2] = { { cx - rx * 0.5f, ey - ry * 0.5f }, { cx + rx * 0.5f, ey + ry * 0.5f } }, b[2] = { { cx - rx * 0.5f, ey + ry * 0.5f }, { cx + rx * 0.5f, ey - ry * 0.5f } };
            stroke(a, 2, dark, size * 0.14f, false); stroke(b, 2, dark, size * 0.14f, false);
        } else {
            const float px = cx + m.look_x * rx * 0.38f, py = ey + m.look_y * ry * 0.3f, pr = size * 0.5f * std::min(1.0f, 0.6f + open * 0.4f);
            disc(px, py, pr, iris, 1, 20);
            disc(px, py, pr * 0.55f, dark, 1, 16);
            disc(px - pr * 0.3f, py + pr * 0.35f, pr * 0.22f, white, 0.9f, 10);
            // the upper lid follows the brow a little (squint / surprise)
            if (open < 1) { Pt lid[4] = { { cx - rx * 1.05f, ey + ry * 1.05f }, { cx + rx * 1.05f, ey + ry * 1.05f }, { cx + rx * 1.05f, ey + ry * (open * 2 - 1) * 1.02f }, { cx - rx * 1.05f, ey + ry * (open * 2 - 1) * 1.02f } }; fill(lid, 4, body, 0.05f, -0.05f); }
        }
    }
    // brows: short thick strokes; the inner ends drop when furrowed and rise when surprised
    for (int i = 0; i < 2; i++) {
        const float cx = i ? ex1 : ex0, dir = i ? -1.0f : 1.0f;   // inner end faces the other eye
        const float by = ey + size * (1.25f + m.brow * 0.35f);
        Pt brow[2] = { { cx - dir * size * 0.55f, by + std::max(0.0f, m.brow) * size * 0.15f }, { cx + dir * size * 0.55f, by - m.brow * size * 0.3f } };
        stroke(brow, 2, dark, size * 0.16f, false);
    }
    // mouth: a curve bending with the smile; open mouths get a dark inside and a tongue
    const float mx = f.mx * hw, my = f.my * hh, mw = f.mw * hh;
    Pt mouth[7];
    for (int k = 0; k < 7; k++) { const float u = k / 6.0f - 0.5f; mouth[k] = { mx + u * mw, my - m.smile * (0.25f - u * u) * mw * 1.4f + m.smile * mw * 0.15f }; }
    if (m.mouth_open > 0.1f) {
        const float ry = mw * 0.32f * m.mouth_open;
        oval(mx, my - ry * 0.4f, mw * 0.35f, ry, { 0.35f, 0.08f, 0.1f }, 0.035f, -0.1f, -0.3f);
        disc(mx, my - ry * 0.9f, mw * 0.18f * m.mouth_open, { 0.85f, 0.3f, 0.35f }, 1, 12);
    } else stroke(mouth, 7, dark, size * 0.12f, false);
}

// ---------- Vehicles (chassis-local: +x forward, +y up; hw/hh are half-extents) ----------

inline void wheel(float cx, float cy, float r, float angle, Rgb rim, Rgb hub, int spokes) {
    const Rgb rubber = { 0.13f, 0.11f, 0.12f };
    disc(cx, cy, r + 0.03f, outline_of(rubber), 1, 24);
    disc(cx, cy, r, rubber, 1, 24);
    disc(cx, cy + r * 0.12f, r * 0.88f, lit(rubber, 0.18f), 1, 24);   // light catches the top of the tyre
    disc(cx, cy - r * 0.04f, r * 0.8f, rubber, 1, 24);
    disc(cx, cy, r * 0.68f, outline_of(rim), 1, 20);
    disc(cx, cy, r * 0.62f, rim, 1, 20);
    sgl_begin_quads();
    col(outline_of(rim));
    for (int k = 0; k < spokes; k++) { const float a = angle + k * TAU / spokes, w = r * 0.07f, nx = -std::sin(a) * w, ny = std::cos(a) * w; sgl_v2f(cx + nx, cy + ny); sgl_v2f(cx + std::cos(a) * r * 0.6f + nx, cy + std::sin(a) * r * 0.6f + ny); sgl_v2f(cx + std::cos(a) * r * 0.6f - nx, cy + std::sin(a) * r * 0.6f - ny); sgl_v2f(cx - nx, cy - ny); }
    sgl_end();
    disc(cx, cy, r * 0.2f, hub, 1, 12);
    glint(cx - r * 0.25f, cy + r * 0.3f, r * 0.2f, r * 0.12f, 0.5f);
}

/** The Turbo flame out of the back: a flickering orange tongue with a blue-white core. */
inline void draw_flame(float x, float y, float h, float strength, float t) {
    if (strength < 0.03f) return;
    const float len = h * (3.2f + 0.8f * std::sin(t * 41) + 0.4f * std::sin(t * 67)) * strength;
    soft_disc(x - len * 0.3f, y, h * 1.6f, { 1.0f, 0.6f, 0.2f }, 0.45f * strength);
    Pt outer[4] = { { x, y + h * 0.5f }, { x - len * 0.35f, y + h * 0.15f }, { x - len, y + h * 0.1f * std::sin(t * 53) }, { x, y - h * 0.5f } };
    Pt inner[4] = { { x, y + h * 0.28f }, { x - len * 0.25f, y + h * 0.08f }, { x - len * 0.55f, y }, { x, y - h * 0.28f } };
    fill(outer, 4, { 1.0f, 0.55f, 0.12f }, 0.3f, -0.1f, 0.9f);
    fill(inner, 4, { 0.7f, 0.9f, 1.0f }, 0.4f, 0, 0.95f);
}

/** The vehicle: wheels, body, face. `squash` scales the body vertically about the axle line (horizontally by 1/squash). */
inline void draw_vehicle(int era_index, const tt::Era& e, const tt::Pose& p, const tt::VehicleSpec& s, float t, float speed, const tt::Mood& mood, float blink, float squash, float boost) {
    const float hw = s.chassis_w / 2, hh = s.chassis_h / 2;
    const Rgb glass = { 0.78f, 0.92f, 1.0f }, steel = { 0.62f, 0.64f, 0.68f }, iron = { 0.26f, 0.26f, 0.3f }, wood = { 0.55f, 0.36f, 0.2f }, skin = { 0.95f, 0.78f, 0.66f };
    if (e.wheels_visible) for (int i = 0; i < 2; i++) wheel(p.wheel_x[i], p.wheel_y[i], s.wheel_r, p.wheel_angle[i], era_index <= 3 ? Rgb{ 0.78f, 0.58f, 0.32f } : era_index >= 8 ? Rgb{ 0.85f, 0.87f, 0.9f } : Rgb{ 0.5f, 0.5f, 0.54f }, { 0.92f, 0.92f, 0.92f }, era_index <= 3 ? 8 : 5);
    else for (int i = 0; i < 2; i++) { soft_disc(p.wheel_x[i], p.wheel_y[i] - s.wheel_r * 0.3f, s.wheel_r * (1.3f + 0.2f * std::sin(t * 9 + i)), e.accent, 0.5f); disc(p.wheel_x[i], p.wheel_y[i] - s.wheel_r * 0.3f, s.wheel_r * 0.35f, lit(e.accent, 0.6f), 0.9f, 12); }

    sgl_push_matrix();
    sgl_translate(p.x, p.y, 0);
    sgl_rotate(p.angle, 0, 0, 1);
    draw_flame(-hw * 1.02f, era_index == 9 ? -hh * 0.3f : -hh * 0.1f, hh * 0.6f, boost, t);
    sgl_translate(0, s.wheel_y, 0);
    sgl_scale(1 / std::sqrt(squash), squash, 1);
    sgl_translate(0, -s.wheel_y, 0);
    const Rgb body = e.body, trim = darker(e.body, 0.75f);
    switch (era_index) {
        case 0: { // chariot: platform, curved front board, a tall back flag, a pole
            rrect(hw, -hh * 0.3f, hw * 2.2f, -hh * 0.05f, 0.05f, wood, 0.03f);
            rrect(-hw, -hh, hw * 0.6f, hh * 0.45f, hh * 0.2f, body);
            Pt board[5] = { { hw * 0.55f, -hh }, { hw, -hh }, { hw * 1.08f, hh * 1.6f }, { hw * 0.8f, hh * 2.6f }, { hw * 0.55f, hh * 2.4f } };
            shape(board, 5, trim);
            sgl_begin_quads(); col(e.accent); quad(-hw, hh * 0.2f, hw * 0.6f, hh * 0.45f); sgl_end();
            Pt flag[3] = { { -hw, hh * 0.4f }, { -hw, hh * 0.4f + 1.0f }, { -hw + 0.7f + 0.05f * std::sin(t * 12), hh * 0.4f + 0.7f } };
            shape(flag, 3, e.accent, 0.03f, 0.3f, -0.1f);
            stroke(flag, 2, wood, 0.05f, false);
            break;
        }
        case 1: { // steam carriage: cabin at the front, round boiler at the back, chimney
            rrect(-hw, -hh, hw, hh, hh * 0.3f, body);
            oval(-hw * 0.45f, hh * 0.4f, hw * 0.5f, hh * 1.1f, trim, 0.04f, 0.3f, -0.3f);
            rrect(-hw * 0.55f, hh, -hw * 0.25f, hh * 3.2f, 0.04f, iron, 0.03f);
            rrect(-hw * 0.62f, hh * 3.2f, -hw * 0.18f, hh * 3.5f, 0.04f, e.accent, 0.03f);
            rrect(hw * 0.1f, hh * 0.9f, hw * 0.95f, hh * 2.35f, hh * 0.25f, body);
            rrect(hw * 0.2f, hh, hw * 0.85f, hh * 2.1f, hh * 0.15f, glass, 0.03f, 0.15f, -0.1f);
            glint(hw * 0.35f, hh * 1.85f, hw * 0.12f, hh * 0.2f);
            break;
        }
        case 2: { // carriage: tall cabin with windows, a lantern, and a horse up front
            rrect(hw * 0.5f, -hh * 0.2f, hw * 1.3f, 0, 0.03f, wood, 0.03f);
            { const float gait = std::sin(t * (6 + speed) + 1) * 0.08f; const Rgb horse = { 0.4f, 0.25f, 0.15f };
              for (float lx : { hw * 1.3f, hw * 1.55f, hw * 1.85f, hw * 2.1f }) { const float g = gait * (lx > hw * 1.7f ? 1 : -1); rrect(lx + g, -hh * 1.6f, lx + 0.12f + g, -hh * 0.3f, 0.03f, horse, 0.03f); }
              oval(hw * 1.7f, hh * 0.05f, hw * 0.55f, hh * 0.5f, horse, 0.04f);
              rrect(hw * 2.0f, hh * 0.3f, hw * 2.35f, hh * 1.4f, 0.06f, horse, 0.04f);
              rrect(hw * 2.25f, hh * 1.0f, hw * 2.6f, hh * 1.45f, 0.06f, horse, 0.04f);
              Pt mane[3] = { { hw * 2.0f, hh * 1.4f }, { hw * 2.25f, hh * 1.5f }, { hw * 1.75f, hh * 0.6f } }; fill(mane, 3, darker(horse, 0.6f), 0.1f, -0.1f);
              Pt tail[3] = { { hw * 1.2f, hh * 0.3f }, { hw * 1.0f, -hh * 0.6f + gait }, { hw * 1.25f, -hh * 0.1f } }; fill(tail, 3, darker(horse, 0.6f), 0.1f, -0.1f); }
            rrect(-hw * 0.9f, -hh, hw * 0.5f, hh * 1.1f, hh * 0.25f, body);
            rrect(-hw, hh * 1.1f, hw * 0.6f, hh * 1.35f, hh * 0.1f, trim);
            rrect(-hw * 0.7f, hh * 0.1f, -hw * 0.1f, hh * 0.85f, hh * 0.1f, glass, 0.03f, 0.15f, -0.1f);
            rrect(hw * 0.05f, hh * 0.1f, hw * 0.4f, hh * 0.85f, hh * 0.1f, glass, 0.03f, 0.15f, -0.1f);
            soft_disc(hw * 0.58f, hh * 0.75f, hh * 0.5f, { 1.0f, 0.85f, 0.4f }, 0.6f);
            rrect(hw * 0.5f, hh * 0.6f, hw * 0.65f, hh * 0.9f, 0.03f, { 1.0f, 0.85f, 0.4f }, 0.03f);
            break;
        }
        case 3: { // Motorwagen: open bench, small engine box, tiller
            rrect(-hw * 0.95f, -hh, -hw * 0.5f, hh * 0.9f, 0.05f, iron, 0.035f);
            rrect(-hw * 0.8f, -hh, hw * 0.8f, hh * 0.3f, hh * 0.15f, body);
            rrect(-hw * 0.6f, hh * 0.3f, hw * 0.1f, hh * 1.4f, hh * 0.15f, trim);
            rrect(-hw * 0.7f, hh * 1.4f, hw * 0.15f, hh * 1.6f, 0.04f, trim);
            rrect(hw * 0.3f, hh * 0.3f, hw * 0.36f, hh * 1.9f, 0.02f, steel, 0.02f);
            rrect(hw * 0.2f, hh * 1.9f, hw * 0.5f, hh * 2.05f, 0.03f, steel, 0.02f);
            break;
        }
        case 4: { // motorcycle: frame, tank, rider leaning forward
            rrect(-hw * 0.6f, -hh, hw * 0.6f, hh * 0.3f, hh * 0.15f, iron, 0.035f);
            oval(hw * 0.15f, hh * 0.9f, hw * 0.4f, hh * 0.6f, body, 0.04f, 0.3f, -0.25f);
            glint(hw * 0.05f, hh * 1.15f, hw * 0.15f, hh * 0.15f);
            rrect(-hw * 0.75f, hh * 0.3f, -hw * 0.1f, hh * 2.4f, hh * 0.2f, { 0.2f, 0.2f, 0.3f }, 0.035f);
            rrect(-hw * 0.3f, hh * 2.0f, hw * 0.4f, hh * 2.6f, hh * 0.2f, { 0.2f, 0.2f, 0.3f }, 0.035f);
            oval(hw * 0.5f, hh * 2.85f, hw * 0.2f, hh * 0.45f, skin, 0.035f, 0.1f, -0.15f);
            rrect(hw * 0.6f, hh * 1.2f, hw * 0.66f, hh * 2.4f, 0.02f, steel, 0.02f);
            rrect(hw * 0.3f, hh * 2.4f, hw * 0.9f, hh * 2.55f, 0.03f, steel, 0.02f);
            oval(hw * 0.62f, hh * 1.55f, hw * 0.16f, hh * 0.4f, trim, 0.035f);   // the headlamp housing, where the face lives
            break;
        }
        case 5: { // Grand Prix racer: long, pointed nose, driver's head, exhaust
            rrect(-hw * 1.15f, -hh * 0.5f, -hw * 0.9f, -hh * 0.2f, 0.03f, steel, 0.02f);
            Pt hull[6] = { { -hw, -hh }, { hw * 0.6f, -hh }, { hw * 1.1f, -hh * 0.3f }, { hw * 0.6f, hh }, { -hw * 0.6f, hh }, { -hw, hh * 0.6f } };
            shape(hull, 6, body, 0.04f, 0.3f, -0.25f);
            sgl_begin_quads(); col(e.accent); quad(-hw * 0.9f, hh * 0.2f, hw * 0.5f, hh * 0.45f); sgl_end();
            oval(-hw * 0.22f, hh * 1.5f, hw * 0.2f, hh * 0.6f, skin, 0.035f, 0.1f, -0.15f);
            rrect(-hw * 0.5f, hh * 1.7f, hw * 0.05f, hh * 2.3f, hh * 0.25f, { 0.3f, 0.3f, 0.35f }, 0.035f);
            glint(hw * 0.2f, hh * 0.7f, hw * 0.25f, hh * 0.15f);
            break;
        }
        case 6: { // off-road truck: tall cab, bed, roof rack, bull bar
            rrect(hw * 0.95f, -hh * 0.7f, hw * 1.1f, hh * 0.6f, 0.05f, iron, 0.035f);
            rrect(-hw, -hh, hw, hh * 0.9f, hh * 0.2f, body);
            rrect(hw * 0.05f, hh * 0.8f, hw * 0.8f, hh * 2.3f, hh * 0.3f, body);
            rrect(hw * 0.15f, hh * 1.1f, hw * 0.7f, hh * 2.1f, hh * 0.2f, glass, 0.03f, 0.15f, -0.1f);
            rrect(-hw * 0.9f, hh * 0.9f, -hw * 0.1f, hh * 1.1f, 0.04f, iron, 0.03f);
            rrect(hw * 0.0f, hh * 2.3f, hw * 0.85f, hh * 2.45f, 0.04f, e.accent, 0.03f);
            glint(hw * 0.3f, hh * 1.9f, hw * 0.12f, hh * 0.15f);
            break;
        }
        case 7: { // Italian roadster: low body, curved roof, chrome line
            Pt hull[6] = { { -hw, -hh }, { hw, -hh }, { hw * 1.02f, hh * 0.6f }, { hw * 0.75f, hh * 1.05f }, { -hw * 0.8f, hh * 1.05f }, { -hw * 1.02f, hh * 0.6f } };
            shape(hull, 6, body, 0.04f, 0.3f, -0.25f);
            Pt roof[4] = { { -hw * 0.55f, hh * 1.0f }, { hw * 0.6f, hh * 1.0f }, { hw * 0.12f, hh * 2.3f }, { -hw * 0.32f, hh * 2.3f } };
            shape(roof, 4, body, 0.04f, 0.3f, -0.1f);
            Pt screen[4] = { { -hw * 0.25f, hh * 1.08f }, { hw * 0.42f, hh * 1.08f }, { hw * 0.08f, hh * 2.1f }, { -hw * 0.2f, hh * 2.1f } };
            shape(screen, 4, glass, 0.03f, 0.15f, -0.1f);
            sgl_begin_quads(); col({ 0.92f, 0.92f, 0.96f }); quad(-hw, hh * 0.1f, hw, hh * 0.25f); sgl_end();
            glint(hw * 0.3f, hh * 0.75f, hw * 0.3f, hh * 0.12f);
            break;
        }
        case 8: { // electric coupe: smooth wedge, light bar, blue underglow
            soft_disc(0, -hh * 1.2f, hw * 0.9f, e.accent, 0.35f);
            Pt hull[6] = { { -hw, -hh }, { hw, -hh }, { hw * 1.0f, hh * 0.7f }, { hw * 0.3f, hh * 2.1f }, { -hw * 0.45f, hh * 2.1f }, { -hw * 1.0f, hh * 0.9f } };
            shape(hull, 6, body, 0.04f, 0.32f, -0.25f);
            Pt screen[4] = { { -hw * 0.45f, hh * 0.98f }, { hw * 0.6f, hh * 0.98f }, { hw * 0.2f, hh * 1.9f }, { -hw * 0.38f, hh * 1.9f } };
            shape(screen, 4, glass, 0.03f, 0.15f, -0.1f);
            sgl_begin_quads(); col(e.accent, 0.95f); quad(hw * 0.7f, hh * 0.3f, hw, hh * 0.5f); sgl_end();
            soft_disc(hw * 1.0f, hh * 0.4f, hh * 0.7f, e.accent, 0.5f);
            glint(hw * 0.1f, hh * 1.5f, hw * 0.2f, hh * 0.15f);
            break;
        }
        default: { // hover: a wedge with fins and neon trim
            Pt hull[5] = { { -hw, -hh * 0.6f }, { hw * 0.7f, -hh * 0.6f }, { hw * 1.15f, hh * 0.1f }, { hw * 0.7f, hh * 0.9f }, { -hw, hh * 0.9f } };
            shape(hull, 5, body, 0.04f, 0.32f, -0.25f);
            Pt fin[3] = { { -hw, hh * 0.9f }, { -hw * 0.6f, hh * 0.9f }, { -hw * 1.05f, hh * 2.2f } };
            shape(fin, 3, body, 0.035f, 0.2f, -0.1f);
            rrect(-hw * 0.2f, hh * 0.85f, hw * 0.55f, hh * 1.8f, hh * 0.3f, glass, 0.03f, 0.15f, -0.1f);
            sgl_begin_quads(); col(e.accent, 0.7f + 0.3f * std::sin(t * 6)); quad(-hw, -hh * 0.6f, hw * 0.7f, -hh * 0.4f); quad(-hw * 0.9f, hh * 0.9f, hw * 0.6f, hh * 1.05f); sgl_end();
            glint(hw * 0.1f, hh * 1.55f, hw * 0.18f, hh * 0.12f);
            break;
        }
    }
    draw_face(face_spot(era_index), hw, hh, mood, blink, era_index == 4 ? trim : body);
    sgl_pop_matrix();
}

} // namespace art
