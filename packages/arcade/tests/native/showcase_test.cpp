#include "doctest.h"
#include "games/showcase/scene.h"
#include <cmath>

using namespace showcase;

namespace {
const Scene& scene() { static const Scene s = build_scene(42); return s; }
float dist(V3 a, V3 b) { return std::sqrt((a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y) + (a.z - b.z) * (a.z - b.z)); }
}

TEST_CASE("the island is the same for the same seed, and sinks below the water at the edges") {
    CHECK(raw_height(42, 3.0f, -5.0f) == raw_height(42, 3.0f, -5.0f));
    CHECK(raw_height(42, 3.0f, -5.0f) != raw_height(43, 3.0f, -5.0f));
    CHECK(raw_height(42, WORLD / 2, WORLD / 2) < WATER_LEVEL);
    CHECK(raw_height(42, -WORLD / 2, 0) < WATER_LEVEL);
}

TEST_CASE("the road is a closed loop above the water") {
    const Road& r = scene().road;
    REQUIRE(r.points.size() > 100);
    CHECK(r.length > 40.0f);
    CHECK(dist(r.points.front(), r.points.back()) < 1.0f);
    for (const V3& p : r.points) CHECK(p.y >= 0.3f);
    CHECK(dist(r.at(0), r.at(r.length)) < 0.01f);          // wraps around
    CHECK(dist(r.at(-1.0f), r.at(r.length - 1.0f)) < 0.01f);
    const V3 d = r.dir(5.0f);
    CHECK(std::sqrt(d.x * d.x + d.y * d.y + d.z * d.z) == doctest::Approx(1.0f));
}

TEST_CASE("the terrain is carved flat under the road") {
    const Scene& s = scene();
    for (size_t i = 0; i < s.road.points.size(); i += 16) {
        const V3 p = s.road.points[i];
        CHECK(std::fabs(s.height(p.x, p.z) - p.y) < 0.25f);
    }
}

TEST_CASE("the world mesh is whole triangles with unit normals") {
    const Scene& s = scene();
    REQUIRE(!s.world.empty());
    CHECK(s.world.size() % 3 == 0);
    CHECK(s.world.size() >= static_cast<size_t>(GRID * GRID * 6));
    for (size_t i = 0; i < s.world.size(); i += 97) {
        const Vertex& v = s.world[i];
        const float n = std::sqrt(v.normal[0] * v.normal[0] + v.normal[1] * v.normal[1] + v.normal[2] * v.normal[2]);
        CHECK(n == doctest::Approx(1.0f).epsilon(0.001));
        CHECK(std::isfinite(v.pos[0]));
        CHECK(std::isfinite(v.pos[1]));
    }
    CHECK(s.trees > 50);
}

TEST_CASE("the car has lamps that glow at night") {
    const auto car = build_car();
    REQUIRE(!car.empty());
    CHECK(car.size() % 3 == 0);
    int lamps = 0;
    for (const Vertex& v : car) if ((v.color >> 24) == 0) lamps++;
    CHECK(lamps > 0);
}

TEST_CASE("colours pack as RGBA8 with alpha marking emissive") {
    CHECK(rgba(1, 0, 0) == 0xff0000ffu);
    CHECK(rgba(0, 0, 1, true) == 0x00ff0000u);
}
