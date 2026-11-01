/**
 * @file view_test.cpp
 * @brief Bot Lab's 3D view (native/view/scene.h) on render's fake: the meshes, the orbiting camera, the light, and
 * what's drawn where in each pass.
 */
#include "doctest.h"
#include "view/scene.h"
#include "xl_render_fake.h"

#include <cmath>

using namespace bl::view;
using xl::render::FakeRenderer;

namespace {

/** Every index in range, every normal unit length. */
void well_formed(const MeshData& m) {
    REQUIRE(!m.vertices.empty());
    REQUIRE(m.indices.size() % 3 == 0);
    for (uint32_t i : m.indices) REQUIRE(i < m.vertices.size());
    for (const Vertex& v : m.vertices) REQUIRE(std::sqrt(v.normal[0] * v.normal[0] + v.normal[1] * v.normal[1] + v.normal[2] * v.normal[2]) == doctest::Approx(1).epsilon(0.01));
}

float extent(const MeshData& m, int axis) { float hi = -1e9f; for (const Vertex& v : m.vertices) hi = std::max(hi, v.pos[axis]); return hi; }

/** A scene with one box, one wheel and one ball, and two sensor spots (one lit). */
Scene busy(FakeRenderer& r) {
    Scene s;
    s.setup(r);
    s.shapes = { 0, 0.05f, 0.02f, 0.04f, 1, 0, 0,     // a red box
                 1, 0.03f, 0.01f, 0, 0.2f, 0.2f, 0.2f,  // a dark wheel
                 2, 0.02f, 0, 0, 1, 1, 1 };            // a white ball
    s.poses = { 0, 0.05f, 0, 0, 0, 0, 1,
                0.1f, 0.03f, 0, 0, 0, 0, 1,
                0, 0.2f, 0.3f, 0, 0, 0, 1 };
    s.sensors = { 0.01f, 0.02f, 1, -0.01f, 0.02f, 0 };
    return s;
}

} // namespace

TEST_CASE("the unit meshes are well-formed and the size they say; the floor is 6 m of boards") {
    for (const MeshData& m : { cube(), cylinder(), sphere(), floor_mesh() }) well_formed(m);
    CHECK(extent(cube(), 0) == doctest::Approx(0.5f));
    CHECK(extent(cylinder(), 1) == doctest::Approx(0.5f));
    CHECK(extent(cylinder(), 0) == doctest::Approx(1).epsilon(0.001));
    CHECK(extent(sphere(), 1) == doctest::Approx(1));
    CHECK(extent(floor_mesh(), 0) == doctest::Approx(3));
    CHECK(floor_mesh().vertices.size() == 60 * 60 * 6);
    CHECK((cube().vertices[0].material >> 24) == xl::render::PLAIN);
}

TEST_CASE("the track is a mitred strip a hair above the floor, closed or open; too few points make none") {
    const float square[] = { 0, 0, 1, 0, 1, 1, 0, 1 };
    const MeshData closed = track_mesh(square, 4, 0.02f, true), open = track_mesh(square, 4, 0.02f, false);
    well_formed(closed);
    well_formed(open);
    CHECK(closed.indices.size() == 4 * 6);
    CHECK(open.indices.size() == 3 * 6);
    for (const Vertex& v : closed.vertices) CHECK(v.pos[1] == doctest::Approx(0.0006f));
    CHECK(extent(closed, 0) > 1.0f);   // the outer corner, mitred past the point
    CHECK(track_mesh(square, 1, 0.02f, true).vertices.empty());
}

TEST_CASE("the orbit turns, zooms and looks at a point, within its limits") {
    Orbit o;
    o.drag(100, 0);
    CHECK(o.yaw == doctest::Approx(2.3f + 0.8f));
    o.drag(0, 1000);
    CHECK(o.pitch == 1.5f);   // straight down at most
    o.drag(0, -1000);
    CHECK(o.pitch == 0.1f);   // just above the floor at least
    o.zoom(100);
    CHECK(o.distance == 0.25f);
    o.zoom(-1000);
    CHECK(o.distance == 4.0f);
    o.focus(1, -2, 3);
    CHECK(o.focus_x == 1);
    CHECK(o.focus_y == 0.03f);
    CHECK(o.focus_z == 3);
}

TEST_CASE("a frame looks at the focus from the orbit, with the sun's shadow box round it and no haze") {
    FakeRenderer r;
    Scene s = busy(r);
    s.orbit.focus(0.5f, 0, 0.5f);
    const xl::render::Frame f = s.frame(800, 600, false, 2);
    CHECK(f.width == 800);
    CHECK(f.time == 2);
    const float dx = f.eye.x - 0.5f, dy = f.eye.y - 0.03f, dz = f.eye.z - 0.5f;
    CHECK(std::sqrt(dx * dx + dy * dy + dz * dz) == doctest::Approx(s.orbit.distance));
    CHECK(f.lighting.sun_dir.y > 0.8f);
    CHECK(f.lighting.haze_strength == 0);
    // the focus lands in the middle of the shadow map, and of the screen
    const auto project = [](const xl::render::Mat4& m, float x, float y, float z) {
        const float cx = m.m[0] * x + m.m[4] * y + m.m[8] * z + m.m[12], cy = m.m[1] * x + m.m[5] * y + m.m[9] * z + m.m[13], w = m.m[3] * x + m.m[7] * y + m.m[11] * z + m.m[15];
        return std::pair{ cx / w, cy / w };
    };
    const auto [lx, ly] = project(f.light_vp, 0.5f, 0.03f, 0.5f);
    CHECK(lx == doctest::Approx(0).epsilon(1e-4));
    CHECK(ly == doctest::Approx(0).epsilon(1e-4));
    const auto [sx, sy] = project(f.view_proj, 0.5f, 0.03f, 0.5f);
    CHECK(std::fabs(sx) < 1e-4f);
    CHECK(std::fabs(sy) < 1e-4f);
    CHECK(s.frame(800, 600, true, 0).view_proj.m[10] != f.view_proj.m[10]);   // WebGPU's depth range
}

TEST_CASE("each body is drawn as its shape, sized and posed, tinted in linear light; sensors only in the lit pass") {
    FakeRenderer r;
    Scene s = busy(r);
    const float pts[] = { 0, 0, 1, 0, 1, 1 };
    s.set_track(r, pts, 3, 0.02f, true);
    r.render(s.frame(640, 480, false, 0), [&](xl::render::Pass& p) { s.draw(p); }, {});
    const auto shadow = r.in_pass(true), lit = r.in_pass(false);
    REQUIRE(shadow.size() == 1 + 3);             // the floor and the bodies (the flat track and spots cast nothing)
    REQUIRE(lit.size() == 1 + 1 + 3 + 2);        // + the track and the sensor spots
    CHECK(lit[0].mesh.id == s.floor.id);
    CHECK(lit[1].mesh.id == s.track.id);
    CHECK(lit[2].mesh.id == s.cube.id);
    CHECK(lit[2].model.m[0] == doctest::Approx(0.1f));    // a box's size is half extents
    CHECK(lit[2].model.m[13] == doctest::Approx(0.05f));  // posed
    CHECK(lit[2].look.tint.x == doctest::Approx(1));
    CHECK(lit[2].look.tint.y == 0);
    CHECK(lit[3].mesh.id == s.cylinder.id);
    CHECK(lit[3].model.m[5] == doctest::Approx(0.02f));   // a wheel's height is twice its half height
    CHECK(lit[3].look.tint.x == doctest::Approx(std::pow(0.2f, 2.2f)));   // sRGB to linear
    CHECK(lit[4].mesh.id == s.sphere.id);
    CHECK(lit[5].look.tint.x > lit[6].look.tint.x);       // the lit spot is red, the other dark
    s.shapes.resize(7);                                   // poses for more bodies than there are looks: only those
    r.render(s.frame(640, 480, false, 0), [&](xl::render::Pass& p) { s.draw(p); }, {});
    CHECK(r.in_pass(true).size() == 2);
}

TEST_CASE("a new track replaces the old one's mesh") {
    FakeRenderer r;
    Scene s;
    s.setup(r);
    const float a[] = { 0, 0, 1, 0, 1, 1 }, b[] = { 0, 0, 2, 0 };
    s.set_track(r, a, 3, 0.02f, true);
    const auto live = [&] { int n = 0; for (const auto& m : r.meshes) n += m.live; return n; };
    CHECK(live() == 5);
    s.set_track(r, b, 2, 0.02f, false);
    CHECK(live() == 5);   // the old track released, the new one uploaded
    CHECK(r.meshes[s.track.id - 1].indices.size() == 6);
    s.set_track(r, b, 1, 0.02f, false);   // too short: nothing to draw
    CHECK_FALSE(s.track.valid());
}
