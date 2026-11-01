/**
 * @file render_test.cpp
 * @brief The render contract: how vertices pack, the fake renderer, and the rule that the public headers name no
 * graphics API.
 */
#include "doctest.h"
#include "xl_render.h"
#include "xl_render_fake.h"

#include <fstream>
#include <sstream>
#include <string>

using namespace xl::render;

namespace {

std::string read(const char* path) { std::ifstream in(path); std::stringstream s; s << in.rdbuf(); return s.str(); }

/** A one-triangle mesh. */
struct Tri {
    std::vector<Vertex> v{ { { 0, 0, 0 }, { 0, 1, 0 }, 0, 0 }, { { 1, 0, 0 }, { 0, 1, 0 }, 0, 0 }, { { 0, 0, 1 }, { 0, 1, 0 }, 0, 0 } };
    std::vector<uint32_t> i{ 0, 1, 2 };
};

} // namespace

TEST_CASE("colours and materials pack into bytes, rounded and clamped, with AO and the surface on top") {
    CHECK(unorm8(0) == 0);
    CHECK(unorm8(1) == 255);
    CHECK(unorm8(0.5f) == 128);          // 127.5 rounds up
    CHECK(unorm8(0.499f) == 127);
    CHECK(unorm8(-2) == 0);
    CHECK(unorm8(7) == 255);
    CHECK(pack_color(1, 0, 0, 1) == 0xff0000ffu);
    CHECK(pack_color(0, 0.5f, 1, 0) == 0x00ff8000u);
    CHECK(pack_material(1, 0, 0, SKIN) == 0x800000ffu);
    CHECK(pack_material(0, 1, 1, WATER) == 0xffffff00u);
    CHECK((pack_material(0.6f, 0, 0, FOLIAGE) >> 24) == 32);
    CHECK(sizeof(Vertex) == 32);
}

TEST_CASE("the fake keeps meshes, reuses released ids, and skips empty uploads") {
    FakeRenderer r;
    Tri t;
    const Mesh a = r.upload(t.v, t.i), b = r.upload(t.v, t.i);
    CHECK(a.id == 1);
    CHECK(b.id == 2);
    CHECK(r.meshes[0].vertices.size() == 3);
    CHECK(r.meshes[0].indices == t.i);
    CHECK_FALSE(r.upload({}, {}).valid());
    CHECK_FALSE(r.upload(t.v, {}).valid());
    r.release(a);
    CHECK_FALSE(r.live(a));
    r.release(a);                        // twice: ignored
    r.release({});                       // none: ignored
    r.release({ 99 });                   // unknown: ignored
    CHECK(r.upload(t.v, t.i).id == 1);   // the freed id, reused
    CHECK(r.live(b));
    CHECK_FALSE(r.zero_to_one());
    r.depth_zero_to_one = true;
    CHECK(r.zero_to_one());
    CHECK(r.shadow_size() == 2048);
}

TEST_CASE("the fake calls the scene with the shadow pass, then the lit one, then the overlay, recording live draws") {
    FakeRenderer r;
    Tri t;
    const Mesh m = r.upload(t.v, t.i);
    Frame f;
    f.width = 640;
    f.time = 3;
    std::vector<bool> passes;
    Mat4 at;
    at.m[12] = 5;
    Look look;
    look.tint = { 2, 1, 1 };
    look.reveal = { 1, 2, 3, true };
    r.render(f, [&](Pass& p) {
        passes.push_back(p.shadow());
        p.draw(m, at, look);
        p.draw({}, at);          // nothing
        p.draw({ 7 }, at);       // not a mesh
        if (!p.shadow()) p.draw(m, Mat4{});
    }, [] {});
    CHECK(passes == std::vector<bool>{ true, false });
    CHECK(r.overlays == 1);
    REQUIRE(r.frames.size() == 1);
    CHECK(r.frames[0].width == 640);
    REQUIRE(r.draws.size() == 3);
    REQUIRE(r.in_pass(true).size() == 1);
    const std::vector<FakeRenderer::Draw> lit = r.in_pass(false);
    REQUIRE(lit.size() == 2);
    const FakeRenderer::Draw& d = lit[0];
    CHECK(d.mesh.id == m.id);
    CHECK(d.model.m[12] == 5);
    CHECK(d.look.tint.x == 2);
    CHECK(d.look.reveal.on);
    CHECK(d.look.reveal.radius == 3);
    CHECK(lit[1].look.tint.x == 1);   // the default look
    r.render(f, {}, {});                            // no scene, no overlay
    CHECK(r.draws.empty());
    CHECK(r.overlays == 1);
}

TEST_CASE("the public headers name no graphics API: code on the contract never sees sokol") {
    for (const char* header : { "include/xl_render.h", "include/xl_render_fake.h" }) {
        const std::string text = read(header);
        REQUIRE_FALSE(text.empty());
        CHECK(text.find("#include \"sokol") == std::string::npos);
        CHECK(text.find("sg_") == std::string::npos);
        CHECK(text.find("HMM_") == std::string::npos);
    }
}
