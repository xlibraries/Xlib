// JyotiRath: a mesh builder for mid-poly models made in code. Smooth primitives (lathes, spheres, capsules, tori,
// rounded boxes, tubes swept along curves) with per-vertex material and ambient occlusion, placed with affine
// transforms, plus a little deliberate imperfection (noise along the normals). Graphics-free: main.cpp uploads the
// vertices as they are, and tests/native/jyotirath_test.cpp checks them.
#pragma once
#include <cmath>
#include <cstdint>
#include <vector>

namespace jr {

struct V3 {
    float x = 0, y = 0, z = 0;
    V3() = default;
    constexpr V3(float x_, float y_, float z_) : x(x_), y(y_), z(z_) {}
    V3 operator+(V3 o) const { return { x + o.x, y + o.y, z + o.z }; }
    V3 operator-(V3 o) const { return { x - o.x, y - o.y, z - o.z }; }
    V3 operator*(float k) const { return { x * k, y * k, z * k }; }
    V3 operator-() const { return { -x, -y, -z }; }
};
inline float dot(V3 a, V3 b) { return a.x * b.x + a.y * b.y + a.z * b.z; }
inline V3 cross(V3 a, V3 b) { return { a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x }; }
inline float length(V3 a) { return std::sqrt(dot(a, a)); }
inline V3 normalize(V3 a) { const float l = length(a); return l > 1e-8f ? a * (1.0f / l) : V3{ 0, 1, 0 }; }
inline V3 lerp(V3 a, V3 b, float t) { return a + (b - a) * t; }

/** Linear part (columns: where x, y and z go) and a translation. */
struct Xform {
    V3 ax{ 1, 0, 0 }, ay{ 0, 1, 0 }, az{ 0, 0, 1 }, t{ 0, 0, 0 };
    V3 point(V3 p) const { return ax * p.x + ay * p.y + az * p.z + t; }
    V3 vector(V3 v) const { return ax * v.x + ay * v.y + az * v.z; }
    /** Normals go through the inverse transpose (so they stay perpendicular under non-uniform scale). */
    V3 normal(V3 n) const;
    /** this ∘ o: o first, then this. */
    Xform operator*(const Xform& o) const;
};
Xform translate(V3 t);
Xform scale(V3 s);
inline Xform scale(float s) { return scale({ s, s, s }); }
Xform rotate_x(float a);
Xform rotate_y(float a);
Xform rotate_z(float a);
/** Rotates +Y onto `dir` (for primitives built along Y). */
Xform align_y(V3 dir);

/** A surface: linear-ish base colour (0..1, sRGB as authored) and how it shades. */
struct Material {
    float r = 0.8f, g = 0.8f, b = 0.8f;
    float rough = 0.6f, metal = 0.0f, emissive = 0.0f;
    enum Kind : uint8_t { PLAIN = 0, FOLIAGE = 32, EYE = 64, SKIN = 128, WATER = 255 } kind = PLAIN;
};
Material mat(uint32_t hex, float rough = 0.6f, float metal = 0.0f, float emissive = 0.0f, Material::Kind kind = Material::PLAIN);
/** The same material, its colour scaled (`k` > 1 lighter) and nudged by up to ±`jitter` per channel from `seed`. */
Material vary(Material m, uint32_t seed, float jitter, float k = 1.0f);

/**
 * The vertex the shader reads: position, normal, colour (RGB) with ambient occlusion in alpha, and material
 * (roughness, metalness, emission, kind) as bytes.
 */
struct Vertex {
    float pos[3];
    float normal[3];
    uint32_t color;
    uint32_t material;
};

struct Mesh {
    std::vector<Vertex> vertices;
    std::vector<uint32_t> indices;   // triangles

    uint32_t add(V3 p, V3 n, const Material& m, float ao = 1.0f);
    void tri(uint32_t a, uint32_t b, uint32_t c) { indices.push_back(a); indices.push_back(b); indices.push_back(c); }
    /** Appends `o` moved by `x` (normals follow). */
    void append(const Mesh& o, const Xform& x = {});
    size_t triangles() const { return indices.size() / 3; }

    // ---- primitives, each appended through `x` ----

    /**
     * A surface of revolution about +Y: `profile` is (radius, height) pairs from bottom to top. Normals come from
     * the profile's slope, so a smooth profile shades smoothly; radius 0 ends close to a point.
     */
    void lathe(const std::vector<std::pair<float, float>>& profile, int segments, const Material& m, const Xform& x = {}, float ao_bottom = 1.0f);
    void sphere(float radius, int segments, const Material& m, const Xform& x = {});
    /** Capped cylinder along +Y from y=0 to y=h, with its edges rounded by `bevel`. */
    void cylinder(float radius, float h, int segments, const Material& m, const Xform& x = {}, float bevel = 0.0f);
    /** A rod with round ends from a to b. */
    void capsule(V3 a, V3 b, float radius, int segments, const Material& m, const Xform& x = {});
    /** A ring in the XZ plane: `major` radius to the tube's centre, `minor` the tube's. */
    void torus(float major, float minor, int segments, int sides, const Material& m, const Xform& x = {});
    /** A box of `size` centred on the origin with edges and corners rounded by `radius`. */
    void rounded_box(V3 size, float radius, const Material& m, const Xform& x = {}, int rounding = 3);
    /** A tube swept along `path`; radius per point (`radii` empty = `radius` everywhere). */
    void tube(const std::vector<V3>& path, float radius, int sides, const Material& m, const Xform& x = {}, const std::vector<float>& radii = {}, bool caps = true);

    /** Pushes every vertex along its normal by ±`amount` of smooth noise: hand-made, not machined. */
    void wobble(float amount, float frequency, uint32_t seed, size_t from = 0);
    /** Darkens vertices near `ground` (contact shadow baked in), within `reach` above it. */
    void ground_ao(float ground, float reach, float strength, size_t from = 0);
};

/** Smooth value noise in 3D, -1..1. */
float noise3(V3 p, uint32_t seed);
/** A small deterministic hash, 0..1. */
float hash01(uint32_t n);

} // namespace jr
