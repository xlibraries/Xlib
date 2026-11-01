/**
 * @file jyotirath_assets_test.cpp
 * @brief JyotiRath's assets module (assets/models.h): every prop builds from a plain placement, well-formed, where
 * it's put and turned as it's told; relics and tools build; a house's model matches the shape its collider uses.
 */
#include "doctest.h"
#include "games/jyotirath/assets/models.h"
#include "games/jyotirath/level.h"

#include <algorithm>
#include <cmath>
#include <functional>
#include <utility>
#include <vector>

using namespace jr;

namespace {

void well_formed(const Mesh& m) {
    REQUIRE(!m.vertices.empty());
    REQUIRE(m.indices.size() % 3 == 0);
    for (uint32_t i : m.indices) REQUIRE(i < m.vertices.size());
}

/** The middle of a mesh's footprint on the ground. */
std::pair<float, float> centre(const Mesh& m) {
    float lx = 1e9f, hx = -1e9f, lz = 1e9f, hz = -1e9f;
    for (const Vertex& v : m.vertices) { lx = std::min(lx, v.pos[0]); hx = std::max(hx, v.pos[0]); lz = std::min(lz, v.pos[2]); hz = std::max(hz, v.pos[2]); }
    return { (lx + hx) / 2, (lz + hz) / 2 };
}

const std::vector<std::pair<const char*, std::function<void(Mesh&, const Placement&)>>>& props() {
    static const std::vector<std::pair<const char*, std::function<void(Mesh&, const Placement&)>>> all = {
        { "house", [](Mesh& m, const Placement& p) { house(m, p, house_shape(p.seed)); } },
        { "palm", palm }, { "shrub", shrub }, { "rock", rock }, { "lamp", lamp }, { "well", well }, { "cart", cart },
        { "sun_banner", sun_banner }, { "cactus", cactus }, { "camel_bones", camel_bones }, { "signboard", signboard },
        { "basket", basket }, { "rug", rug }, { "stall", stall }, { "prayer_flags", prayer_flags }, { "villager", villager },
        { "wheat", wheat }, { "canal", canal }, { "sack_pile", sack_pile }, { "granary", granary }, { "great_bath", great_bath },
        { "assembly_hall", assembly_hall }, { "stupa", stupa }, { "great_hall", great_hall }, { "dancing_girl", dancing_girl },
        { "flower_bed", flower_bed },
        { "tumbleweed", [](Mesh& m, const Placement& p) { tumbleweed_into(m, place({ p.x, p.y, p.z }, p.yaw), p.seed); } },
    };
    return all;
}

} // namespace

TEST_CASE("every prop builds from a plain placement, well-formed, standing about where it's put") {
    for (const auto& [name, build] : props()) {
        CAPTURE(name);
        Mesh at_origin, moved;
        build(at_origin, { 0, 0, 0, 0, 1, 7 });
        build(moved, { 100, 3, -40, 0, 1, 7 });
        well_formed(at_origin);
        REQUIRE(moved.vertices.size() == at_origin.vertices.size());   // the same prop, elsewhere
        const auto [x0, z0] = centre(at_origin);
        const auto [x1, z1] = centre(moved);
        CHECK(x1 - x0 == doctest::Approx(100).epsilon(0.01));
        CHECK(z1 - z0 == doctest::Approx(-40).epsilon(0.01));
    }
}

TEST_CASE("a prop's seed varies it and its scale sizes it") {
    Mesh a, b, big;
    palm(a, { 0, 0, 0, 0, 1, 1 });
    palm(b, { 0, 0, 0, 0, 1, 2 });
    palm(big, { 0, 0, 0, 0, 2, 1 });
    const auto top = [](const Mesh& m) { float h = 0; for (const Vertex& v : m.vertices) h = std::max(h, v.pos[1]); return h; };
    CHECK(top(a) != top(b));
    CHECK(top(big) > top(a) * 1.5f);
}

TEST_CASE("a house's model is the size of the shape its collider uses") {
    for (uint32_t seed : { 1u, 5u, 9u }) for (bool grand : { false, true }) {
        const HouseShape h = house_shape(seed, grand);
        Mesh m;
        house(m, { 0, 0, 0, 0, grand ? 1.3f : 1.0f, seed }, h);
        float lx = 1e9f, hx = -1e9f;
        for (const Vertex& v : m.vertices) if (v.pos[1] > 0.4f && v.pos[1] < h.h * 0.6f) { lx = std::min(lx, v.pos[0]); hx = std::max(hx, v.pos[0]); }
        CHECK(hx - lx == doctest::Approx(h.w).epsilon(0.1));   // its walls (the plinth and the steps aside)
        CHECK(h.w > 2.5f);
        CHECK(h.d > 2.5f);
    }
}

TEST_CASE("relics, the bell and the grain build; the tools map onto them, and no tool is the fragment") {
    for (Relic r : { Relic::Seal, Relic::Shard, Relic::Beads, Relic::Figurine, Relic::Bronze, Relic::Fragment }) well_formed(build_relic(r));
    well_formed(build_bell());
    well_formed(build_grain());
    CHECK(build_tool(Tool::Seal).vertices.size() == build_relic(Relic::Seal).vertices.size());
    CHECK(build_tool(Tool::Bell).vertices.size() == build_bell().vertices.size());
    CHECK(build_tool(Tool::Grain).vertices.size() == build_grain().vertices.size());
    CHECK(build_tool(Tool::None).vertices.size() == build_fragment().vertices.size());
    for (const Mesh& m : { build_pot(), build_shard(), build_puff(), build_iris(), build_lid(), build_chevron(), build_gaze() }) well_formed(m);
}
