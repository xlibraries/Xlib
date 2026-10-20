#include "scene.h"
#include <algorithm>
#include <cmath>

namespace showcase {
namespace {

constexpr float PI = 3.14159265f;

V3 operator+(V3 a, V3 b) { return { a.x + b.x, a.y + b.y, a.z + b.z }; }
V3 operator-(V3 a, V3 b) { return { a.x - b.x, a.y - b.y, a.z - b.z }; }
V3 operator*(V3 a, float s) { return { a.x * s, a.y * s, a.z * s }; }
V3 cross(V3 a, V3 b) { return { a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x }; }
float len(V3 a) { return std::sqrt(a.x * a.x + a.y * a.y + a.z * a.z); }
V3 norm(V3 a) { const float l = len(a); return l > 0 ? a * (1.0f / l) : V3{ 0, 1, 0 }; }
float smooth(float t) { return t * t * (3 - 2 * t); }
float clampf(float v, float lo, float hi) { return std::max(lo, std::min(hi, v)); }

uint32_t hash(uint32_t seed, int x, int z) {
    uint32_t h = seed ^ (static_cast<uint32_t>(x) * 0x27d4eb2du) ^ (static_cast<uint32_t>(z) * 0x165667b1u);
    h ^= h >> 15; h *= 0x85ebca6bu; h ^= h >> 13; h *= 0xc2b2ae35u; h ^= h >> 16;
    return h;
}
float lattice(uint32_t seed, int x, int z) { return (hash(seed, x, z) & 0xffffff) / 16777215.0f; }

float value_noise(uint32_t seed, float x, float z) {
    const int ix = static_cast<int>(std::floor(x)), iz = static_cast<int>(std::floor(z));
    const float fx = smooth(x - ix), fz = smooth(z - iz);
    const float a = lattice(seed, ix, iz), b = lattice(seed, ix + 1, iz), c = lattice(seed, ix, iz + 1), d = lattice(seed, ix + 1, iz + 1);
    return (a + (b - a) * fx) + ((c + (d - c) * fx) - (a + (b - a) * fx)) * fz;
}

struct Rng {
    uint32_t s;
    float next() { s ^= s << 13; s ^= s >> 17; s ^= s << 5; return (s & 0xffffff) / 16777215.0f; }
};

void push_tri(std::vector<Vertex>& out, V3 a, V3 b, V3 c, uint32_t color) {
    V3 n = norm(cross(b - a, c - a));
    if (n.y < 0 && std::fabs(n.y) > 0.5f) { std::swap(b, c); n = n * -1.0f; }   // terrain faces up
    for (V3 p : { a, b, c }) out.push_back({ { p.x, p.y, p.z }, { n.x, n.y, n.z }, color });
}

void push_quad(std::vector<Vertex>& out, V3 a, V3 b, V3 c, V3 d, uint32_t color) {
    push_tri(out, a, b, c, color);
    push_tri(out, a, c, d, color);
}

// An axis-aligned box centred at c with half-extents h; every face gets an outward normal.
void push_box(std::vector<Vertex>& out, V3 c, V3 h, uint32_t color) {
    const V3 p[8] = { { c.x - h.x, c.y - h.y, c.z - h.z }, { c.x + h.x, c.y - h.y, c.z - h.z }, { c.x + h.x, c.y + h.y, c.z - h.z }, { c.x - h.x, c.y + h.y, c.z - h.z },
                      { c.x - h.x, c.y - h.y, c.z + h.z }, { c.x + h.x, c.y - h.y, c.z + h.z }, { c.x + h.x, c.y + h.y, c.z + h.z }, { c.x - h.x, c.y + h.y, c.z + h.z } };
    const int faces[6][4] = { { 0, 3, 2, 1 }, { 4, 5, 6, 7 }, { 0, 4, 7, 3 }, { 1, 2, 6, 5 }, { 0, 1, 5, 4 }, { 3, 7, 6, 2 } };
    for (const auto& f : faces) {
        const V3 a = p[f[0]], b = p[f[1]], cc = p[f[2]], d = p[f[3]];
        const V3 n = norm(cross(b - a, cc - a));
        for (V3 v : { a, b, cc, a, cc, d }) out.push_back({ { v.x, v.y, v.z }, { n.x, n.y, n.z }, color });
    }
}

void push_tree(std::vector<Vertex>& out, V3 base, float scale, uint32_t leaves, uint32_t trunk) {
    push_box(out, base + V3{ 0, 0.25f * scale, 0 }, { 0.08f * scale, 0.25f * scale, 0.08f * scale }, trunk);
    const int sides = 7;
    for (int tier = 0; tier < 2; tier++) {
        const float y0 = base.y + (0.35f + tier * 0.45f) * scale, r = (0.55f - tier * 0.15f) * scale;
        const V3 tip = { base.x, y0 + 0.8f * scale, base.z };
        for (int i = 0; i < sides; i++) {
            const float a0 = i * 2 * PI / sides, a1 = (i + 1) * 2 * PI / sides;
            const V3 p0 = { base.x + std::cos(a0) * r, y0, base.z + std::sin(a0) * r };
            const V3 p1 = { base.x + std::cos(a1) * r, y0, base.z + std::sin(a1) * r };
            const V3 n = norm(cross(p1 - p0, tip - p0) * -1.0f);
            for (V3 v : { p0, tip, p1 }) out.push_back({ { v.x, v.y, v.z }, { n.x, n.y, n.z }, leaves });
        }
    }
}

V3 catmull_rom(V3 p0, V3 p1, V3 p2, V3 p3, float t) {
    const float t2 = t * t, t3 = t2 * t;
    return (p1 * 2.0f + (p2 - p0) * t + (p0 * 2.0f - p1 * 5.0f + p2 * 4.0f - p3) * t2 + (p1 * 3.0f - p0 - p2 * 3.0f + p3) * t3) * 0.5f;
}

uint32_t terrain_color(float h, float variation) {
    if (h < 0.3f) return rgba(0.86f, 0.79f, 0.55f);
    if (h < 2.4f) return rgba(0.30f + 0.10f * variation, 0.56f + 0.12f * variation, 0.24f);
    if (h < 3.6f) return rgba(0.50f + 0.06f * variation, 0.47f, 0.45f);
    return rgba(0.95f, 0.96f, 1.0f);
}

} // namespace

uint32_t rgba(float r, float g, float b, bool emissive) {
    const auto c = [](float v) { return static_cast<uint32_t>(clampf(v, 0, 1) * 255.0f + 0.5f); };
    return c(r) | (c(g) << 8) | (c(b) << 16) | ((emissive ? 0u : 255u) << 24);
}

float raw_height(uint32_t seed, float x, float z) {
    float h = 0, amp = 1, freq = 0.08f;
    for (int o = 0; o < 5; o++) { h += value_noise(seed + o * 101, x * freq, z * freq) * amp; amp *= 0.5f; freq *= 2.0f; }
    const float r = std::sqrt(x * x + z * z) / (WORLD * 0.5f);
    return h * 3.4f - 0.6f - r * r * 5.0f;   // hills in the middle, sinking towards the edges
}

V3 Road::at(float s) const {
    if (points.empty()) return {};
    s = std::fmod(s, length);
    if (s < 0) s += length;
    const float step = length / points.size();
    const size_t i = static_cast<size_t>(s / step) % points.size();
    const float f = (s - i * step) / step;
    return points[i] + (points[(i + 1) % points.size()] - points[i]) * f;
}

V3 Road::dir(float s) const {
    const V3 d = at(s + 0.5f) - at(s - 0.5f);
    return norm(d);
}

float Scene::height(float x, float z) const {
    const float cell = WORLD / GRID;
    const float gx = clampf((x + WORLD / 2) / cell, 0, GRID - 0.001f), gz = clampf((z + WORLD / 2) / cell, 0, GRID - 0.001f);
    const int ix = static_cast<int>(gx), iz = static_cast<int>(gz);
    const float fx = gx - ix, fz = gz - iz;
    const auto H = [&](int a, int b) { return heights[b * (GRID + 1) + a]; };
    const float top = H(ix, iz) + (H(ix + 1, iz) - H(ix, iz)) * fx;
    const float bottom = H(ix, iz + 1) + (H(ix + 1, iz + 1) - H(ix, iz + 1)) * fx;
    return top + (bottom - top) * fz;
}

Scene build_scene(uint32_t seed) {
    Scene sc;
    sc.seed = seed;
    Rng rng{ seed * 2654435761u + 1 };

    // 1. A closed loop of control points around the middle, sampled evenly with Catmull-Rom
    const int ctrl = 9;
    std::vector<V3> cp;
    for (int i = 0; i < ctrl; i++) {
        const float a = i * 2 * PI / ctrl;
        const float r = 10.5f + 3.0f * std::sin(i * 1.7f + seed % 7) + rng.next() * 1.5f;
        cp.push_back({ std::cos(a) * r, 0, std::sin(a) * r });
    }
    std::vector<V3> loop;
    for (int i = 0; i < ctrl; i++)
        for (int k = 0; k < 32; k++)
            loop.push_back(catmull_rom(cp[(i + ctrl - 1) % ctrl], cp[i], cp[(i + 1) % ctrl], cp[(i + 2) % ctrl], k / 32.0f));
    // road height: terrain below, kept above the water, smoothed so it doesn't climb cliffs
    for (V3& p : loop) p.y = std::max(0.45f, raw_height(seed, p.x, p.z) + 0.05f);
    for (int pass = 0; pass < 12; pass++) {
        std::vector<V3> next = loop;
        for (size_t i = 0; i < loop.size(); i++) next[i].y = (loop[(i + loop.size() - 1) % loop.size()].y + loop[i].y * 2 + loop[(i + 1) % loop.size()].y) / 4;
        loop = next;
    }
    sc.road.points = loop;
    for (size_t i = 0; i < loop.size(); i++) { const V3 d = loop[(i + 1) % loop.size()] - loop[i]; sc.road.length += std::sqrt(d.x * d.x + d.z * d.z + d.y * d.y); }

    // 2. Terrain heights, flattened into a cutting/embankment along the road
    const float cell = WORLD / GRID;
    sc.heights.resize((GRID + 1) * (GRID + 1));
    for (int z = 0; z <= GRID; z++) {
        for (int x = 0; x <= GRID; x++) {
            const float wx = -WORLD / 2 + x * cell, wz = -WORLD / 2 + z * cell;
            float h = raw_height(seed, wx, wz);
            float best = 1e9f, road_h = 0;
            for (const V3& p : loop) {
                const float d = (p.x - wx) * (p.x - wx) + (p.z - wz) * (p.z - wz);
                if (d < best) { best = d; road_h = p.y; }
            }
            best = std::sqrt(best);
            const float inner = ROAD_HALF_WIDTH * 1.3f, outer = ROAD_HALF_WIDTH * 3.5f;
            if (best < outer) {
                const float t = best < inner ? 1.0f : 1.0f - smooth((best - inner) / (outer - inner));
                h = h + (road_h - 0.04f - h) * t;
            }
            sc.heights[z * (GRID + 1) + x] = h;
        }
    }

    // 3. Terrain triangles (flat shaded, coloured by height), then a water sheet
    for (int z = 0; z < GRID; z++) {
        for (int x = 0; x < GRID; x++) {
            const auto P = [&](int a, int b) { return V3{ -WORLD / 2 + a * cell, sc.heights[b * (GRID + 1) + a], -WORLD / 2 + b * cell }; };
            const V3 a = P(x, z), b = P(x + 1, z), c = P(x + 1, z + 1), d = P(x, z + 1);
            const float variation = lattice(seed + 7, x, z);
            push_tri(sc.world, a, d, c, terrain_color((a.y + c.y + d.y) / 3, variation));
            push_tri(sc.world, a, c, b, terrain_color((a.y + b.y + c.y) / 3, variation));
        }
    }
    const float W = WORLD * 1.5f;
    push_quad(sc.world, { -W, WATER_LEVEL, -W }, { -W, WATER_LEVEL, W }, { W, WATER_LEVEL, W }, { W, WATER_LEVEL, -W }, rgba(0.12f, 0.45f, 0.7f));

    // 4. The road ribbon with a dashed centre line
    const uint32_t asphalt = rgba(0.16f, 0.16f, 0.19f), paint = rgba(1.0f, 0.85f, 0.3f);
    for (size_t i = 0; i < loop.size(); i++) {
        const V3 p0 = loop[i], p1 = loop[(i + 1) % loop.size()];
        const V3 side0 = norm(cross(norm(p1 - p0), { 0, 1, 0 })) * ROAD_HALF_WIDTH;
        const V3 lift = { 0, 0.03f, 0 };
        push_quad(sc.world, p0 - side0 + lift, p0 + side0 + lift, p1 + side0 + lift, p1 - side0 + lift, asphalt);
        if ((i / 3) % 2 == 0) {
            const V3 s = side0 * 0.06f, up = { 0, 0.04f, 0 };
            push_quad(sc.world, p0 - s + up, p0 + s + up, p1 + s + up, p1 - s + up, paint);
        }
    }

    // 5. Trees on the grass, away from the road and the shore
    const uint32_t trunk = rgba(0.4f, 0.27f, 0.16f);
    for (int attempt = 0; attempt < 600 && sc.trees < 170; attempt++) {
        const float x = (rng.next() - 0.5f) * WORLD * 0.9f, z = (rng.next() - 0.5f) * WORLD * 0.9f;
        const float h = sc.height(x, z);
        if (h < 0.5f || h > 2.4f) continue;
        bool near_road = false;
        for (const V3& p : loop) if ((p.x - x) * (p.x - x) + (p.z - z) * (p.z - z) < 4.0f) { near_road = true; break; }
        if (near_road) continue;
        const float shade = rng.next();
        push_tree(sc.world, { x, h, z }, 0.7f + rng.next() * 0.6f, rgba(0.12f + 0.1f * shade, 0.42f + 0.15f * shade, 0.2f), trunk);
        sc.trees++;
    }
    return sc;
}

std::vector<Vertex> build_car() {
    std::vector<Vertex> car;
    push_box(car, { 0, 0.22f, 0 }, { 0.5f, 0.12f, 0.24f }, rgba(1.0f, 0.24f, 0.45f));          // body
    push_box(car, { -0.06f, 0.4f, 0 }, { 0.26f, 0.08f, 0.2f }, rgba(0.85f, 0.9f, 1.0f));         // cabin
    for (float x : { -0.32f, 0.32f })
        for (float z : { -0.25f, 0.25f }) push_box(car, { x, 0.1f, z }, { 0.1f, 0.1f, 0.05f }, rgba(0.08f, 0.08f, 0.1f));   // wheels
    for (float z : { -0.15f, 0.15f }) {
        push_box(car, { 0.51f, 0.24f, z }, { 0.015f, 0.04f, 0.05f }, rgba(1.0f, 0.95f, 0.75f, true));   // headlights
        push_box(car, { -0.51f, 0.24f, z }, { 0.015f, 0.035f, 0.05f }, rgba(1.0f, 0.1f, 0.1f, true));    // tail lights
    }
    return car;
}

} // namespace showcase
