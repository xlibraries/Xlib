// Era-specific art for Turbo Trails, drawn with sokol_gl: backdrops (what's behind the road), landmark
// silhouettes on the road, and each era's vehicle. Included by main.cpp only (it needs sokol_gl).
#pragma once
#include <cmath>
#include <cstdint>
#ifndef SOKOL_GL_INCLUDED
#error "include sokol_gl.h before art.h"
#endif
#include "eras.h"
#include "physics.h"
#include "terrain.h"

namespace art {

using tt::Rgb;

inline void col(Rgb c, float a = 1) { sgl_c4f(c.r, c.g, c.b, a); }
inline Rgb mix(Rgb a, Rgb b, float t) { return { a.r + (b.r - a.r) * t, a.g + (b.g - a.g) * t, a.b + (b.b - a.b) * t }; }
inline Rgb darker(Rgb c, float k) { return { c.r * k, c.g * k, c.b * k }; }
inline void quad(float x0, float y0, float x1, float y1) { sgl_v2f(x0, y0); sgl_v2f(x1, y0); sgl_v2f(x1, y1); sgl_v2f(x0, y1); }
inline void tri(float x0, float y0, float x1, float y1, float x2, float y2) { sgl_v2f(x0, y0); sgl_v2f(x1, y1); sgl_v2f(x2, y2); }

inline void disc(float cx, float cy, float r, Rgb c, float a = 1, int n = 18) {
    sgl_begin_triangles();
    col(c, a);
    for (int i = 0; i < n; i++) {
        const float a0 = i * 6.2832f / n, a1 = (i + 1) * 6.2832f / n;
        sgl_v2f(cx, cy); sgl_v2f(cx + std::cos(a0) * r, cy + std::sin(a0) * r); sgl_v2f(cx + std::cos(a1) * r, cy + std::sin(a1) * r);
    }
    sgl_end();
}

/** 0..1, stable for an integer slot (for "random" but repeatable backdrop props). */
inline float hash01(int slot, int salt = 0) {
    uint32_t h = static_cast<uint32_t>(slot) * 0x9e3779b1u ^ static_cast<uint32_t>(salt) * 0x85ebca6bu;
    h ^= h >> 16; h *= 0x7feb352du; h ^= h >> 15; h *= 0x846ca68bu; h ^= h >> 16;
    return (h & 0xffffff) / 16777215.0f;
}

// ---------- Backdrops (screen space: x right, y down; `horizon` is the pixel row the road sits around) ----------

struct View { float w, h, horizon, cam_x, scale, time; };

/** Soft hills: a sine silhouette filled down to the bottom. */
inline void hills(const View& v, float speed, float amp, float wl, Rgb c, float phase = 0) {
    const float off = v.cam_x * v.scale * speed;
    sgl_begin_quads();
    col(c);
    const auto y = [&](float x) { return v.horizon - amp * (0.6f + 0.4f * std::sin((x + off) / wl * 6.2832f + phase) + 0.25f * std::sin((x + off) / (wl * 0.37f) * 6.2832f)); };
    for (float x = 0; x < v.w; x += 12) { sgl_v2f(x, y(x)); sgl_v2f(x + 12, y(x + 12)); sgl_v2f(x + 12, v.h); sgl_v2f(x, v.h); }
    sgl_end();
}

/** Flat-topped buttes (canyon country). */
inline void buttes(const View& v, float speed, float height, Rgb c) {
    const float off = v.cam_x * v.scale * speed, spacing = 260;
    sgl_begin_quads();
    col(c);
    for (int slot = static_cast<int>(off / spacing) - 1; slot * spacing - off < v.w + spacing; slot++) {
        const float x = slot * spacing - off + hash01(slot, 1) * 120, bw = 60 + hash01(slot, 2) * 140, bh = height * (0.5f + hash01(slot, 3) * 0.5f);
        sgl_v2f(x - 18, v.horizon); sgl_v2f(x, v.horizon - bh); sgl_v2f(x + bw, v.horizon - bh); sgl_v2f(x + bw + 18, v.horizon);
        quad(x - 30, v.horizon - bh * 0.35f, x + bw + 30, v.horizon);
    }
    sgl_end();
}

/** A city skyline with lit windows; `neon` adds glowing rooflines. */
inline void skyline(const View& v, float speed, float max_h, Rgb c, Rgb windows, bool neon, Rgb neon_col) {
    const float off = v.cam_x * v.scale * speed, spacing = 54;
    for (int slot = static_cast<int>(off / spacing) - 1; slot * spacing - off < v.w + spacing; slot++) {
        const float x = slot * spacing - off, bw = spacing - 6 - hash01(slot, 4) * 14, bh = max_h * (0.25f + hash01(slot, 5) * 0.75f);
        sgl_begin_quads();
        col(c); quad(x, v.horizon - bh, x + bw, v.horizon);
        // windows: a grid, some dark
        for (float wy = v.horizon - bh + 10; wy < v.horizon - 8; wy += 11) for (float wx = x + 5; wx < x + bw - 6; wx += 9) {
            if (hash01(slot * 97 + static_cast<int>(wy) * 7 + static_cast<int>(wx), 6) > 0.45f) continue;
            col(windows, 0.85f); quad(wx, wy, wx + 4, wy + 6);
        }
        if (neon) { col(neon_col, 0.9f); quad(x, v.horizon - bh - 3, x + bw, v.horizon - bh); if (hash01(slot, 7) > 0.6f) quad(x + bw / 2 - 2, v.horizon - bh - 30, x + bw / 2 + 2, v.horizon - bh); }
        sgl_end();
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
        col(c);
        if (kind == 0) { tri(x - 14 * s, y, x + 14 * s, y, x, y - 40 * s); tri(x - 10 * s, y - 22 * s, x + 10 * s, y - 22 * s, x, y - 52 * s); }
        else if (kind == 1) { tri(x - 5 * s, y, x + 5 * s, y, x, y - 60 * s); tri(x - 7 * s, y - 10 * s, x + 7 * s, y - 10 * s, x, y - 45 * s); }
        else { for (int f = 0; f < 5; f++) { const float a = -1.4f + f * 0.7f; tri(x, y - 36 * s, x + std::cos(a) * 22 * s, y - 36 * s - std::sin(a) * 14 * s - 8, x + std::cos(a + 0.35f) * 20 * s, y - 36 * s - std::sin(a + 0.35f) * 14 * s); } }
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
inline void sea(const View& v, Rgb c, Rgb glint) {
    sgl_begin_quads();
    col(c); quad(0, v.horizon - 6, v.w, v.horizon + 40);
    for (int i = 0; i < 40; i++) { const float x = std::fmod(hash01(i, 41) * v.w + v.time * (10 + hash01(i, 42) * 20), v.w), y = v.horizon + hash01(i, 43) * 30; col(glint, 0.5f); quad(x, y, x + 8 + hash01(i, 44) * 10, y + 1.5f); }
    sgl_end();
}

inline void draw_backdrop(int era_index, const tt::Era& e, const View& v) {
    switch (era_index) {
        case 0: hills(v, 0.08f, v.h * 0.12f, 380, e.far_hills); trees(v, 0.14f, 2, darker(e.near_hills, 0.9f), 170, -4); hills(v, 0.2f, v.h * 0.08f, 220, e.near_hills, 1.3f); break;
        case 1: hills(v, 0.08f, v.h * 0.1f, 420, e.far_hills); props(v, 0.16f, 1, darker(e.near_hills, 0.8f), 300); hills(v, 0.2f, v.h * 0.07f, 240, e.near_hills, 0.7f); break;
        case 2: hills(v, 0.08f, v.h * 0.1f, 400, e.far_hills); props(v, 0.15f, 2, darker(e.near_hills, 0.75f), 520); hills(v, 0.2f, v.h * 0.06f, 260, e.near_hills, 2.1f); trees(v, 0.26f, 1, darker(e.near_hills, 0.85f), 90, 2); break;
        case 3: hills(v, 0.08f, v.h * 0.12f, 360, e.far_hills); trees(v, 0.15f, 0, darker(e.near_hills, 0.85f), 46, -6); props(v, 0.22f, 4, darker(e.near_hills, 0.7f), 240); hills(v, 0.24f, v.h * 0.04f, 300, e.near_hills); break;
        case 4: hills(v, 0.06f, v.h * 0.04f, 600, e.far_hills); props(v, 0.16f, 0, darker(e.near_hills, 0.8f), 260); hills(v, 0.2f, v.h * 0.03f, 500, e.near_hills); break;
        case 5: hills(v, 0.07f, v.h * 0.06f, 500, e.far_hills); props(v, 0.18f, 3, darker(e.near_hills, 0.8f), 420); trees(v, 0.24f, 0, darker(e.near_hills, 0.9f), 120, 2); break;
        case 6: buttes(v, 0.07f, v.h * 0.16f, e.far_hills); buttes(v, 0.16f, v.h * 0.11f, e.near_hills); break;
        case 7: sea(v, { 0.1f, 0.45f, 0.75f }, { 0.8f, 0.95f, 1.0f }); hills(v, 0.1f, v.h * 0.1f, 300, e.far_hills, 0.4f); props(v, 0.18f, 4, darker(e.near_hills, 0.8f), 160); trees(v, 0.26f, 1, darker(e.near_hills, 0.9f), 70, 2); break;
        case 8: stars(v, 90); skyline(v, 0.06f, v.h * 0.22f, e.far_hills, { 1.0f, 0.9f, 0.6f }, false, e.accent); skyline(v, 0.14f, v.h * 0.13f, e.near_hills, { 0.9f, 0.8f, 0.5f }, false, e.accent); break;
        default: stars(v, 120); { sgl_begin_triangles(); col(darker(e.far_hills, 1.3f)); tri(v.w * 0.55f, v.horizon, v.w * 0.95f, v.horizon, v.w * 0.75f, v.horizon - v.h * 0.26f); col({ 0.9f, 0.9f, 1.0f }); tri(v.w * 0.72f, v.horizon - v.h * 0.2f, v.w * 0.78f, v.horizon - v.h * 0.2f, v.w * 0.75f, v.horizon - v.h * 0.26f); sgl_end(); }
                 skyline(v, 0.07f, v.h * 0.24f, e.far_hills, { 0.6f, 0.9f, 1.0f }, true, e.accent); props(v, 0.12f, 5, darker(e.near_hills, 1.2f), 700); skyline(v, 0.15f, v.h * 0.14f, e.near_hills, { 1.0f, 0.5f, 0.9f }, true, e.ground_top); break;
    }
}

// ---------- Landmarks (world space, standing on the road at their x) ----------

enum Shape { DOME, TOWER, BRIDGE, BUILDING, ARCH, PEAK, PLATFORM };

// one shape per landmark, era by era (same order as eras.cpp)
inline Shape landmark_shape(int era_index, int index) {
    static const Shape SHAPES[10][4] = {
        { BUILDING, PLATFORM, BUILDING, ARCH }, { BRIDGE, TOWER, BUILDING, PLATFORM }, { BRIDGE, DOME, PLATFORM, ARCH }, { BUILDING, TOWER, DOME, BUILDING },
        { BUILDING, PLATFORM, TOWER, PLATFORM }, { ARCH, PLATFORM, PLATFORM, BUILDING }, { PEAK, PLATFORM, PEAK, BUILDING }, { PLATFORM, BUILDING, ARCH, DOME },
        { BUILDING, BUILDING, BRIDGE, PLATFORM }, { PLATFORM, TOWER, BRIDGE, PEAK },
    };
    return SHAPES[era_index % 10][index % 4];
}

inline void draw_landmark(const tt::Era& e, Shape shape, float x, float y, float t) {
    const Rgb c = darker(e.near_hills, 0.8f), lit = e.accent;
    sgl_begin_quads();
    col(c);
    switch (shape) {
        case DOME: quad(x - 3, y, x + 3, y + 2.2f); break;
        case TOWER: quad(x - 0.7f, y, x + 0.7f, y + 9); quad(x - 1.2f, y + 8.4f, x + 1.2f, y + 9.4f); col(lit, 0.6f + 0.4f * std::sin(t * 3)); quad(x - 0.3f, y + 9.4f, x + 0.3f, y + 10); break;
        case BRIDGE: quad(x - 7, y + 2.6f, x + 7, y + 3.2f); for (float px = -6; px <= 6; px += 3) quad(px + x - 0.3f, y, px + x + 0.3f, y + 2.6f); break;
        case BUILDING: quad(x - 3.5f, y, x + 3.5f, y + 4); quad(x - 2.5f, y + 4, x + 2.5f, y + 6); col(lit, 0.8f); quad(x - 1.5f, y + 1, x - 0.5f, y + 2.2f); quad(x + 0.5f, y + 1, x + 1.5f, y + 2.2f); break;
        case ARCH: quad(x - 3, y, x - 1.8f, y + 4.5f); quad(x + 1.8f, y, x + 3, y + 4.5f); quad(x - 3.4f, y + 4.5f, x + 3.4f, y + 5.6f); break;
        case PEAK: sgl_v2f(x - 6, y); sgl_v2f(x + 6, y); sgl_v2f(x + 1.5f, y + 9); sgl_v2f(x - 1.5f, y + 9); col({ 1, 1, 1 }, 0.9f); sgl_v2f(x - 1.5f, y + 7); sgl_v2f(x + 1.5f, y + 7); sgl_v2f(x + 1, y + 9); sgl_v2f(x - 1, y + 9); break;
        case PLATFORM: quad(x - 5, y, x + 5, y + 1.2f); quad(x - 4, y + 1.2f, x + 4, y + 1.6f); col(lit, 0.9f); quad(x - 0.4f, y + 1.6f, x + 0.4f, y + 4); quad(x + 0.4f, y + 3.2f, x + 2.2f, y + 4); break;
    }
    sgl_end();
    if (shape == DOME) { disc(x, y + 2.2f, 3, c); disc(x, y + 5.4f, 0.5f, lit); }
}

inline void draw_landmarks(int era_index, const tt::Era& e, const tt::Terrain& terrain, float left, float right, float t) {
    for (const tt::LandmarkSpot& l : terrain.landmarks) {
        const float x = l.x + 6;   // just past the sign line, so you drive by it
        if (x < left - 10 || x > right + 10) continue;
        draw_landmark(e, landmark_shape(era_index, l.index), x, terrain.height(x) - 0.2f, t);
    }
}

// ---------- Vehicles (chassis-local: +x forward, +y up; hw/hh are half-extents) ----------

inline void wheel(float cx, float cy, float r, float angle, Rgb rim, Rgb hub, int spokes) {
    disc(cx, cy, r, { 0.12f, 0.1f, 0.1f });
    disc(cx, cy, r * 0.72f, rim, 0.95f);
    sgl_begin_lines();
    col({ 0.15f, 0.12f, 0.1f });
    for (int k = 0; k < spokes; k++) { const float a = angle + k * 6.2832f / spokes; sgl_v2f(cx, cy); sgl_v2f(cx + std::cos(a) * r * 0.7f, cy + std::sin(a) * r * 0.7f); }
    sgl_end();
    disc(cx, cy, r * 0.18f, hub);
}

inline void draw_vehicle(int era_index, const tt::Era& e, const tt::Pose& p, const tt::VehicleSpec& s, float t, float speed) {
    const float hw = s.chassis_w / 2, hh = s.chassis_h / 2;
    const Rgb glass = { 0.85f, 0.95f, 1.0f };
    if (e.wheels_visible) for (int i = 0; i < 2; i++) wheel(p.wheel_x[i], p.wheel_y[i], s.wheel_r, p.wheel_angle[i], era_index <= 3 ? Rgb{ 0.75f, 0.55f, 0.3f } : Rgb{ 0.25f, 0.25f, 0.28f }, { 0.9f, 0.9f, 0.9f }, era_index <= 3 ? 8 : 5);
    else for (int i = 0; i < 2; i++) disc(p.wheel_x[i], p.wheel_y[i] - s.wheel_r * 0.3f, s.wheel_r * (1.1f + 0.2f * std::sin(t * 9 + i)), e.accent, 0.25f);

    sgl_push_matrix();
    sgl_translate(p.x, p.y, 0);
    sgl_rotate(p.angle, 0, 0, 1);
    sgl_begin_quads();
    switch (era_index) {
        case 0: // chariot: platform, curved front board, a tall back flag
            col(e.body); quad(-hw, -hh, hw * 0.6f, hh * 0.2f); col(darker(e.body, 0.8f)); quad(hw * 0.6f, -hh, hw, hh * 1.4f); quad(hw * 0.75f, hh * 1.4f, hw * 1.05f, hh * 2.6f);
            col(e.accent); quad(-hw, hh * 0.2f, hw * 0.6f, hh * 0.45f); col({ 0.55f, 0.35f, 0.2f }); quad(hw, -hh * 0.3f, hw * 2.2f, -hh * 0.05f);   // pole
            col(e.accent); tri(-hw, hh * 0.4f, -hw, hh * 0.4f + 1.0f, -hw + 0.7f, hh * 0.4f + 0.7f);
            break;
        case 1: // steam carriage: cabin at the front, round boiler at the back, chimney
            col(e.body); quad(-hw, -hh, hw, hh); col(glass, 0.8f); quad(hw * 0.2f, hh, hw * 0.85f, hh * 2.1f); col(e.body); quad(hw * 0.1f, hh * 2.1f, hw * 0.95f, hh * 2.35f);
            col({ 0.2f, 0.2f, 0.22f }); quad(-hw * 0.55f, hh, -hw * 0.25f, hh * 3.2f); col(e.accent); quad(-hw * 0.6f, hh * 3.2f, -hw * 0.2f, hh * 3.5f);
            break;
        case 2: // carriage: tall cabin with windows, a lantern, and a horse up front
            col(e.body); quad(-hw * 0.9f, -hh, hw * 0.5f, hh * 1.1f); col(glass, 0.8f); quad(-hw * 0.7f, hh * 0.1f, -hw * 0.1f, hh * 0.85f); quad(hw * 0.05f, hh * 0.1f, hw * 0.4f, hh * 0.85f);
            col(darker(e.body, 0.7f)); quad(-hw, hh * 1.1f, hw * 0.6f, hh * 1.3f); col({ 1.0f, 0.85f, 0.4f }); quad(hw * 0.5f, hh * 0.6f, hw * 0.65f, hh * 0.9f);
            col({ 0.45f, 0.3f, 0.18f }); quad(hw * 0.5f, -hh * 0.2f, hw * 1.3f, 0);   // shaft
            { const float gait = std::sin(t * (6 + speed) + 1) * 0.08f; col({ 0.35f, 0.22f, 0.14f }); quad(hw * 1.2f, -hh * 0.4f, hw * 2.2f, hh * 0.5f); quad(hw * 2.0f, hh * 0.3f, hw * 2.35f, hh * 1.4f); quad(hw * 2.25f, hh * 1.1f, hw * 2.6f, hh * 1.45f);
              for (float lx : { hw * 1.3f, hw * 1.55f, hw * 1.85f, hw * 2.1f }) quad(lx + gait * (lx > hw * 1.7f ? 1 : -1), -hh * 1.6f, lx + 0.1f + gait * (lx > hw * 1.7f ? 1 : -1), -hh * 0.3f); }
            break;
        case 3: // Motorwagen: open bench, small engine box, tiller
            col(e.body); quad(-hw * 0.8f, -hh, hw * 0.8f, hh * 0.3f); col(darker(e.body, 0.7f)); quad(-hw * 0.6f, hh * 0.3f, hw * 0.1f, hh * 1.4f); quad(-hw * 0.7f, hh * 1.4f, hw * 0.15f, hh * 1.6f);
            col({ 0.25f, 0.25f, 0.28f }); quad(-hw * 0.95f, -hh, -hw * 0.5f, hh * 0.9f); col({ 0.6f, 0.6f, 0.62f }); quad(hw * 0.3f, hh * 0.3f, hw * 0.36f, hh * 1.9f); quad(hw * 0.2f, hh * 1.9f, hw * 0.5f, hh * 2.05f);
            break;
        case 4: // motorcycle: frame, tank, rider leaning forward
            col({ 0.25f, 0.25f, 0.28f }); quad(-hw * 0.6f, -hh, hw * 0.6f, hh * 0.3f); col(e.body); quad(-hw * 0.2f, hh * 0.3f, hw * 0.55f, hh * 1.5f);
            col({ 0.2f, 0.2f, 0.3f }); quad(-hw * 0.75f, hh * 0.3f, -hw * 0.1f, hh * 2.4f); quad(-hw * 0.3f, hh * 2.0f, hw * 0.4f, hh * 2.6f); col({ 0.95f, 0.8f, 0.7f }); quad(hw * 0.3f, hh * 2.4f, hw * 0.7f, hh * 3.3f);
            col({ 0.6f, 0.6f, 0.62f }); quad(hw * 0.6f, hh * 1.2f, hw * 0.66f, hh * 2.4f); quad(hw * 0.3f, hh * 2.4f, hw * 0.9f, hh * 2.55f);
            break;
        case 5: // Grand Prix racer: long, pointed nose, driver's head, exhaust
            col(e.body); quad(-hw, -hh, hw * 0.6f, hh); tri(hw * 0.6f, -hh, hw * 1.1f, -hh * 0.3f, hw * 0.6f, hh); col(e.accent); quad(-hw * 0.9f, hh * 0.2f, hw * 0.5f, hh * 0.45f);
            col({ 0.95f, 0.8f, 0.7f }); quad(-hw * 0.4f, hh, -hw * 0.05f, hh * 2.2f); col({ 0.3f, 0.3f, 0.35f }); quad(-hw * 0.5f, hh * 2.0f, hw * 0.05f, hh * 2.4f); col({ 0.6f, 0.6f, 0.62f }); quad(-hw * 1.15f, -hh * 0.5f, -hw * 0.9f, -hh * 0.2f);
            break;
        case 6: // off-road truck: tall cab, bed, roof rack, bull bar
            col(e.body); quad(-hw, -hh, hw, hh * 0.9f); quad(hw * 0.05f, hh * 0.9f, hw * 0.8f, hh * 2.3f); col(glass, 0.85f); quad(hw * 0.15f, hh * 1.1f, hw * 0.7f, hh * 2.1f);
            col({ 0.3f, 0.3f, 0.32f }); quad(-hw * 0.9f, hh * 0.9f, -hw * 0.1f, hh * 1.1f); quad(hw * 0.95f, -hh * 0.7f, hw * 1.1f, hh * 0.6f); col(e.accent); quad(hw * 0.0f, hh * 2.3f, hw * 0.85f, hh * 2.45f);
            break;
        case 7: // Italian roadster: low body, curved roof, chrome line
            col(e.body); quad(-hw, -hh, hw, hh); tri(-hw * 0.5f, hh, hw * 0.55f, hh, hw * 0.1f, hh * 2.3f); tri(-hw * 0.5f, hh, hw * 0.1f, hh * 2.3f, -hw * 0.3f, hh * 2.3f);
            col(glass, 0.8f); tri(-hw * 0.25f, hh * 1.05f, hw * 0.4f, hh * 1.05f, hw * 0.05f, hh * 2.05f); col({ 0.9f, 0.9f, 0.95f }); quad(-hw, hh * 0.1f, hw, hh * 0.25f);
            break;
        case 8: // electric coupe: smooth wedge, light bar, blue underglow
            col(e.body); quad(-hw, -hh, hw, hh * 0.8f); tri(-hw * 0.7f, hh * 0.8f, hw * 0.8f, hh * 0.8f, hw * 0.3f, hh * 2.1f); tri(-hw * 0.7f, hh * 0.8f, hw * 0.3f, hh * 2.1f, -hw * 0.45f, hh * 2.1f);
            col(glass, 0.8f); tri(-hw * 0.45f, hh * 0.95f, hw * 0.55f, hh * 0.95f, hw * 0.2f, hh * 1.9f); col(e.accent, 0.9f); quad(hw * 0.7f, hh * 0.3f, hw, hh * 0.5f); quad(-hw, -hh - 0.05f, hw, -hh + 0.03f);
            break;
        default: // hover: a wedge with fins and neon trim
            col(e.body); quad(-hw, -hh * 0.6f, hw * 0.7f, hh * 0.9f); tri(hw * 0.7f, -hh * 0.6f, hw * 1.15f, hh * 0.1f, hw * 0.7f, hh * 0.9f); tri(-hw, hh * 0.9f, -hw * 0.6f, hh * 0.9f, -hw * 1.05f, hh * 2.2f);
            col(glass, 0.85f); quad(-hw * 0.2f, hh * 0.9f, hw * 0.55f, hh * 1.8f); col(e.accent, 0.7f + 0.3f * std::sin(t * 6)); quad(-hw, -hh * 0.6f, hw * 0.7f, -hh * 0.4f); quad(-hw * 0.9f, hh * 0.9f, hw * 0.6f, hh * 1.05f);
            break;
    }
    sgl_end();
    sgl_pop_matrix();
}

} // namespace art
