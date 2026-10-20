#include "terrain.h"
#include <algorithm>
#include <cmath>

namespace tt {
namespace {

constexpr float START_X = -20.0f;

struct Rng {
    uint32_t s;
    float next() { s ^= s << 13; s ^= s >> 17; s ^= s << 5; return (s & 0xffffff) / 16777215.0f; }
};

float smooth(float t) { return t * t * (3 - 2 * t); }

// 1-D value noise with a lattice spacing of `wavelength`
float noise(uint32_t seed, float x, float wavelength) {
    const float fx = x / wavelength;
    const int i = static_cast<int>(std::floor(fx));
    const auto lattice = [&](int k) {
        uint32_t h = seed ^ (static_cast<uint32_t>(k) * 0x27d4eb2du);
        h ^= h >> 15; h *= 0x85ebca6bu; h ^= h >> 13; h *= 0xc2b2ae35u; h ^= h >> 16;
        return (h & 0xffffff) / 16777215.0f * 2.0f - 1.0f;
    };
    const float t = smooth(fx - i);
    return lattice(i) + (lattice(i + 1) - lattice(i)) * t;
}

} // namespace

float Terrain::height(float x) const {
    if (xs.empty()) return 0;
    const float f = (x - xs.front()) / TERRAIN_STEP;
    const int i = std::max(0, std::min(static_cast<int>(xs.size()) - 2, static_cast<int>(std::floor(f))));
    const float t = std::max(0.0f, std::min(1.0f, f - i));
    return ys[i] + (ys[i + 1] - ys[i]) * t;
}

float Terrain::slope(float x) const {
    return std::atan2(height(x + 1.0f) - height(x - 1.0f), 2.0f);
}

Terrain build_terrain(const TerrainProfile& p, uint32_t seed, int landmark_count) {
    Terrain t;
    const int n = static_cast<int>((p.length - START_X) / TERRAIN_STEP) + 1;
    t.xs.reserve(n); t.ys.reserve(n);
    for (int i = 0; i < n; i++) {
        const float x = START_X + i * TERRAIN_STEP;
        // flat start, then hills that grow with distance
        const float grow = std::min(1.0f, std::max(0.0f, x / 40.0f)) * (1.0f + p.ramp_up * std::max(0.0f, x) / 1000.0f);
        float y = noise(seed, x, p.wavelength) * p.amplitude * grow
                + noise(seed + 17, x, p.wavelength * 0.37f) * p.amplitude * 0.35f * p.roughness * grow
                + noise(seed + 29, x, p.wavelength * 0.13f) * p.amplitude * 0.08f * p.roughness * grow;
        t.xs.push_back(x);
        t.ys.push_back(y);
    }

    Rng rng{ seed * 2654435761u + 7 };
    // fuel cans: generous at first, then farther apart
    for (float x = 110.0f; x < p.length - 60; x += 130.0f + x * 0.06f + rng.next() * 30.0f) {
        t.fuel.push_back({ x, t.height(x) + 1.0f });
    }
    // coins: arcs over hill crests, lines along flats
    for (float x = 30.0f; x < p.length - 30; x += 18.0f + rng.next() * 30.0f) {
        const int count = 3 + static_cast<int>(rng.next() * 4);
        const bool arc = t.slope(x) > 0.15f;
        for (int k = 0; k < count; k++) {
            const float cx = x + k * 1.4f;
            const float lift = arc ? 1.2f + std::sin(k / static_cast<float>(count) * 3.14159f) * 1.6f : 0.9f;
            t.coins.push_back({ cx, t.height(cx) + lift });
        }
    }
    // treasure: high above a crest in the second half, reachable only with a proper jump
    float best_x = p.length * 0.5f, best_y = -1e9f;
    for (float x = p.length * 0.45f; x < p.length * 0.9f; x += 2.0f) if (t.height(x) > best_y) { best_y = t.height(x); best_x = x; }
    t.treasure = { best_x, best_y + 4.5f };
    // landmarks spread along the road
    for (int i = 0; i < landmark_count; i++) t.landmarks.push_back({ p.length * (i + 1) / (landmark_count + 1), i });
    return t;
}

} // namespace tt
