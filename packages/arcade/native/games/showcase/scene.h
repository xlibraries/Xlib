// 3D Showcase: a procedurally generated low-poly island (terrain, water, a looping road, trees) and a car.
// Graphics-free so it can be unit-tested natively (tests/native/showcase_test.cpp); main.cpp uploads and draws it.
#pragma once
#include <cstdint>
#include <vector>

namespace showcase {

constexpr float WORLD = 40.0f;      // island square, units
constexpr int GRID = 96;            // terrain cells per side
constexpr float ROAD_HALF_WIDTH = 0.85f;
constexpr float WATER_LEVEL = 0.0f;

struct V3 { float x = 0, y = 0, z = 0; };

/** Flat-shaded vertex: position, face normal, colour (RGBA8; alpha 0 = emissive, e.g. lamps). */
struct Vertex { float pos[3]; float normal[3]; uint32_t color; };

struct Road {
    std::vector<V3> points;   // a closed loop, evenly sampled
    float length = 0;
    /** Position at distance s along the loop (wraps). */
    V3 at(float s) const;
    /** Unit direction of travel at distance s. */
    V3 dir(float s) const;
};

struct Scene {
    uint32_t seed = 0;
    std::vector<float> heights;   // (GRID+1)² terrain heights after the road is carved in
    Road road;
    std::vector<Vertex> world;    // terrain + water + road + trees (non-indexed triangles)
    int trees = 0;
    /** Terrain height at world position (x, z), bilinear. */
    float height(float x, float z) const;
};

/** Noise-based height before the road is carved in (island-shaped: the edges sink below water). */
float raw_height(uint32_t seed, float x, float z);
Scene build_scene(uint32_t seed);
/** The car, built around the origin facing +X, about 1 unit long. */
std::vector<Vertex> build_car();
/** A wooden crate, 0.32 units a side, centred on the origin. */
std::vector<Vertex> build_crate();

uint32_t rgba(float r, float g, float b, bool emissive = false);

} // namespace showcase
