// Generated ground for one era: a heightline that gets rougher with distance, plus where the fuel cans, coins,
// the hidden treasure and the landmarks sit. Graphics-free, tested natively.
#pragma once
#include <cstdint>
#include <string>
#include <vector>

namespace tt {

struct TerrainProfile {
    float amplitude = 2.0f;     // hill height, metres
    float wavelength = 28.0f;   // hill length, metres
    float roughness = 0.3f;     // small bumps on top (0..1)
    float ramp_up = 1.0f;       // how much steeper it gets per km
    float length = 2400.0f;     // metres of road
};

struct Pickup { float x, y; bool taken = false; };
struct LandmarkSpot { float x; int index; };   // index into the era's landmark list

struct Terrain {
    std::vector<float> xs, ys;   // the polyline, every STEP metres from x = -20
    std::vector<Pickup> fuel;
    std::vector<Pickup> coins;
    Pickup treasure;
    std::vector<LandmarkSpot> landmarks;
    /** Ground height at x (linear between samples). */
    float height(float x) const;
    /** Slope angle at x, radians. */
    float slope(float x) const;
};

constexpr float TERRAIN_STEP = 0.5f;

Terrain build_terrain(const TerrainProfile& profile, uint32_t seed, int landmark_count);

} // namespace tt
