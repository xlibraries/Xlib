/**
 * @file asset_test.cpp
 * @brief The asset builder: transforms, materials as they pack into render's vertex, every primitive well-formed
 * and the size it says, the modifiers, the shapes made of primitives, and the noise.
 */
#include "doctest.h"
#include "xl_asset.h"

#include <algorithm>
#include <cmath>

using namespace xl::asset;

namespace {

V3 vpos(const Vertex& v) { return { v.pos[0], v.pos[1], v.pos[2] }; }
V3 vnormal(const Vertex& v) { return { v.normal[0], v.normal[1], v.normal[2] }; }
float ao(const Vertex& v) { return (v.color >> 24) / 255.0f; }

/** Every index in range, every normal unit length. */
void check_mesh(const Mesh& m) {
    REQUIRE(!m.vertices.empty());
    REQUIRE(m.indices.size() % 3 == 0);
    for (uint32_t i : m.indices) REQUIRE(i < m.vertices.size());
    for (const Vertex& v : m.vertices) REQUIRE(length(vnormal(v)) == doctest::Approx(1.0f).epsilon(0.01));
}

struct Bounds { V3 lo{ 1e9f, 1e9f, 1e9f }, hi{ -1e9f, -1e9f, -1e9f }; };
Bounds bounds(const Mesh& m) {
    Bounds b;
    for (const Vertex& v : m.vertices) {
        b.lo = { std::min(b.lo.x, v.pos[0]), std::min(b.lo.y, v.pos[1]), std::min(b.lo.z, v.pos[2]) };
        b.hi = { std::max(b.hi.x, v.pos[0]), std::max(b.hi.y, v.pos[1]), std::max(b.hi.z, v.pos[2]) };
    }
    return b;
}

} // namespace

TEST_CASE("transforms compose, and normals stay perpendicular under non-uniform scale") {
    const Xform x = translate({ 1, 2, 3 }) * rotate_y(1.5707963f) * scale({ 2, 1, 1 });
    const V3 p = x.point({ 1, 0, 0 });
    CHECK(p.x == doctest::Approx(1.0f).epsilon(0.001));
    CHECK(p.z == doctest::Approx(1.0f).epsilon(0.001));
    CHECK(p.y == doctest::Approx(2.0f));
    const Xform squash = scale({ 1, 0.25f, 1 });
    const V3 tangent = squash.vector(normalize({ 1, 1, 0 })), n = squash.normal(normalize({ 1, -1, 0 }));
    CHECK(std::fabs(dot(tangent, n)) < 1e-5f);
    CHECK(align_y({ 0, 0, 2 }).vector({ 0, 1, 0 }).z == doctest::Approx(1.0f));
}

TEST_CASE("primitives are closed, well-formed and the size they say") {
    Mesh m;
    m.sphere(0.5f, 24, mat(0xffffff));
    check_mesh(m);
    for (const Vertex& v : m.vertices) CHECK(length(vpos(v)) == doctest::Approx(0.5f).epsilon(0.001));
    Mesh box;
    box.rounded_box({ 2, 1, 0.6f }, 0.1f, mat(0xffffff));
    check_mesh(box);
    const Bounds b = bounds(box);
    CHECK(b.hi.x == doctest::Approx(1.0f).epsilon(0.001));
    CHECK(b.lo.y == doctest::Approx(-0.5f).epsilon(0.001));
    Mesh rest;
    rest.cylinder(0.3f, 1, 16, mat(0xffffff), {}, 0.05f);
    rest.capsule({ 0, 0, 0 }, { 0, 0, 1 }, 0.1f, 12, mat(0xffffff));
    rest.torus(1, 0.1f, 24, 8, mat(0xffffff));
    rest.tube({ { 0, 0, 0 }, { 1, 0.5f, 0 }, { 2, 0, 0 } }, 0.05f, 8, mat(0xffffff));
    check_mesh(rest);
}

TEST_CASE("materials pack into the vertex, and wobble changes only what it should") {
    Mesh m;
    m.add({ 0, 0, 0 }, { 0, 1, 0 }, mat(0xff8000, 0.5f, 1.0f, 0.0f, Material::SKIN));
    const Vertex v = m.vertices[0];
    CHECK((v.color & 0xff) == 255);
    CHECK((v.material >> 24) == Material::SKIN);
    Mesh s;
    s.sphere(1, 16, mat(0xffffff));
    s.wobble(0.05f, 3, 1);
    float lo = 10, hi = 0;
    for (const Vertex& w : s.vertices) { lo = std::min(lo, length(vpos(w))); hi = std::max(hi, length(vpos(w))); }
    CHECK(lo >= 0.95f - 1e-4f);
    CHECK(hi <= 1.05f + 1e-4f);
    CHECK(hi - lo > 0.01f);
}

TEST_CASE("vector helpers, rotations about each axis, uniform scale and placement") {
    CHECK(dot({ 1, 2, 3 }, { 4, 5, 6 }) == 32);
    const V3 c = cross({ 1, 0, 0 }, { 0, 1, 0 });
    CHECK(c.z == 1);
    CHECK(length({ 3, 4, 0 }) == doctest::Approx(5));
    CHECK(normalize({ 0, 0, 0 }).y == 1);                      // no length: up
    CHECK(lerp({ 0, 0, 0 }, { 2, 4, 6 }, 0.5f).y == doctest::Approx(2));
    CHECK((-V3{ 1, 2, 3 }).z == -3);
    CHECK(rotate_x(1.5707963f).vector({ 0, 1, 0 }).z == doctest::Approx(1).epsilon(1e-5));
    CHECK(rotate_z(1.5707963f).vector({ 1, 0, 0 }).y == doctest::Approx(1).epsilon(1e-5));
    CHECK(scale(3).vector({ 1, 1, 1 }).y == 3);
    const V3 p = place({ 5, 0, 0 }, 1.5707963f).point({ 1, 0, 0 });   // turned, then moved
    CHECK(p.x == doctest::Approx(5).epsilon(1e-5));
    CHECK(p.z == doctest::Approx(-1).epsilon(1e-5));
    CHECK(align_y({ 0, 1, 0 }).vector({ 0, 1, 0 }).y == doctest::Approx(1));   // straight up: another reference axis
    const V3 flipped = scale({ -1, 1, 1 }).normal({ 1, 0, 0 });               // a mirror keeps normals outward
    CHECK(flipped.x == doctest::Approx(-1));
}

TEST_CASE("mat reads 0xRRGGBB; vary scales and jitters a colour deterministically") {
    const Material m = mat(0xFF8000, 0.3f, 0.5f, 0.25f, Material::WATER);
    CHECK(m.r == 1);
    CHECK(m.g == doctest::Approx(128 / 255.0f));
    CHECK(m.b == 0);
    CHECK(m.rough == 0.3f);
    CHECK(m.metal == 0.5f);
    CHECK(m.emissive == 0.25f);
    CHECK(m.kind == Material::WATER);
    const Material a = vary(mat(0x808080), 7, 0.1f), b = vary(mat(0x808080), 7, 0.1f);
    CHECK(a.r == b.r);
    CHECK(std::fabs(a.r - 128 / 255.0f) <= 0.1f + 1e-6f);
    CHECK(vary(mat(0x808080), 7, 0, 2).g == doctest::Approx(256 / 255.0f));
    Mesh v;
    v.add({ 0, 0, 0 }, { 0, 1, 0 }, m, 0.5f);
    CHECK(v.vertices[0].color == xl::render::pack_color(m.r, m.g, m.b, 0.5f));
    CHECK(v.vertices[0].material == xl::render::pack_material(0.3f, 0.5f, 0.25f, xl::render::WATER));
    CHECK(Material::FOLIAGE == xl::render::FOLIAGE);
    CHECK(Material::EYE == xl::render::EYE);
}

TEST_CASE("lathes shade their bottoms darker; capped and bevelled cylinders; capsules and tubes reach their ends") {
    Mesh l;
    l.lathe({ { 0, 0 }, { 1, 0 }, { 1, 1 }, { 0, 1 } }, 12, mat(0xffffff), {}, 0.2f);
    check_mesh(l);
    float low = 1, high = 0;
    for (const Vertex& v : l.vertices) {
        if (v.pos[1] < 0.01f) low = std::min(low, ao(v));
        else high = std::max(high, ao(v));
    }
    CHECK(low == doctest::Approx(0.2f).epsilon(0.02));
    CHECK(high == doctest::Approx(1.0f).epsilon(0.02));
    Mesh c;
    c.cylinder(0.5f, 2, 16, mat(0xffffff));
    check_mesh(c);
    CHECK(bounds(c).hi.y == doctest::Approx(2));
    CHECK(bounds(c).lo.y == doctest::Approx(0));
    Mesh cap;
    cap.capsule({ 0, 0, 0 }, { 0, 0, 2 }, 0.25f, 10, mat(0xffffff));
    check_mesh(cap);
    CHECK(bounds(cap).hi.z == doctest::Approx(2.25f).epsilon(0.01));
    CHECK(bounds(cap).lo.z == doctest::Approx(-0.25f).epsilon(0.01));
    Mesh t, open;
    t.tube({ { 0, 0, 0 }, { 0, 1, 0 }, { 0, 2, 0 } }, 0.1f, 8, mat(0xffffff), {}, { 0.3f, 0.2f, 0.1f });
    open.tube({ { 0, 0, 0 }, { 0, 1, 0 }, { 0, 2, 0 } }, 0.1f, 8, mat(0xffffff), {}, {}, false);
    check_mesh(t);
    check_mesh(open);
    CHECK(bounds(t).hi.x == doctest::Approx(0.3f).epsilon(0.01));   // per-point radii
    CHECK(open.triangles() < t.triangles());                          // no caps
    Mesh torus;
    torus.torus(1, 0.1f, 24, 8, mat(0xffffff));
    CHECK(bounds(torus).hi.x == doctest::Approx(1.1f).epsilon(0.01));
    CHECK(bounds(torus).hi.y == doctest::Approx(0.1f).epsilon(0.01));
}

TEST_CASE("append moves another mesh in, its normals following, its indices offset") {
    Mesh a, b;
    a.sphere(1, 8, mat(0xffffff));
    b.sphere(1, 8, mat(0xffffff));
    const size_t n = a.vertices.size(), tris = a.triangles();
    a.append(b, translate({ 10, 0, 0 }) * scale({ 1, 2, 1 }));
    check_mesh(a);
    CHECK(a.vertices.size() == 2 * n);
    CHECK(a.triangles() == 2 * tris);
    CHECK(a.indices.back() >= n);
    CHECK(bounds(a).hi.x == doctest::Approx(11));
    CHECK(bounds(a).hi.y == doctest::Approx(2));
}

TEST_CASE("ground_ao darkens near the ground only, from a vertex on, keeping the colour") {
    Mesh m;
    m.add({ 0, 0, 0 }, { 0, 1, 0 }, mat(0xff0000));
    m.add({ 0, 0, 0 }, { 0, 1, 0 }, mat(0xff0000));
    m.add({ 0, 5, 0 }, { 0, 1, 0 }, mat(0xff0000));
    m.ground_ao(0, 1, 0.5f, 1);
    CHECK(ao(m.vertices[0]) == 1);                                      // before `from`
    CHECK(ao(m.vertices[1]) == doctest::Approx(0.5f).epsilon(0.01));    // on the ground
    CHECK(ao(m.vertices[2]) == 1);                                      // out of reach
    CHECK((m.vertices[1].color & 0xff) == 255);
}

TEST_CASE("ellipsoids, rings and tapers are the shapes they say") {
    Mesh e;
    ellipsoid(e, { 1, 0, 0 }, { 2, 1, 0.5f }, 16, mat(0xffffff));
    check_mesh(e);
    CHECK(bounds(e).hi.x == doctest::Approx(3).epsilon(0.01));
    CHECK(bounds(e).hi.z == doctest::Approx(0.5f).epsilon(0.01));
    Mesh r;
    ring(r, { 0, 0, 0 }, { 1, 0, 0 }, 1, 0.1f, mat(0xffffff));   // about x: in the YZ plane
    check_mesh(r);
    CHECK(bounds(r).hi.x == doctest::Approx(0.1f).epsilon(0.01));
    CHECK(bounds(r).hi.y == doctest::Approx(1.1f).epsilon(0.01));
    Mesh t;
    taper(t, { { 0, 0, 0 }, { 0, 1, 0 } }, 0.5f, 0.1f, 8, mat(0xffffff));
    check_mesh(t);
    float bottom = 0, top = 0;
    for (const Vertex& v : t.vertices) { const float rr = std::hypot(v.pos[0], v.pos[2]); if (v.pos[1] < 0.01f) bottom = std::max(bottom, rr); else if (v.pos[1] > 0.99f) top = std::max(top, rr); }
    CHECK(bottom == doctest::Approx(0.5f).epsilon(0.01));
    CHECK(top == doctest::Approx(0.1f).epsilon(0.01));
}

TEST_CASE("noise is smooth, in -1..1 and seeded; the hash is in 0..1 and deterministic") {
    float lo = 1, hi = -1;
    for (int i = 0; i < 400; i++) {
        const float n = noise3({ i * 0.137f, i * 0.071f, i * 0.031f }, 5);
        lo = std::min(lo, n);
        hi = std::max(hi, n);
    }
    CHECK(lo >= -1);
    CHECK(hi <= 1);
    CHECK(hi - lo > 0.5f);
    CHECK(std::fabs(noise3({ 0.5f, 0.5f, 0.5f }, 1) - noise3({ 0.501f, 0.5f, 0.5f }, 1)) < 0.01f);
    CHECK(noise3({ 0.5f, 0.5f, 0.5f }, 1) != noise3({ 0.5f, 0.5f, 0.5f }, 2));
    CHECK(noise3({ 2, 3, 4 }, 9) == noise3({ 2, 3, 4 }, 9));
    for (uint32_t n : { 0u, 1u, 77u, 0xffffffffu }) { CHECK(hash01(n) >= 0); CHECK(hash01(n) <= 1); }
    CHECK(hash01(42) == hash01(42));
    CHECK(hash01(42) != hash01(43));
}
