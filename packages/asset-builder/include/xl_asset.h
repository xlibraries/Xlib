/**
 * @file xl_asset.h
 * @brief Building mid-poly models in code, as meshes in `@xlibraries/render`'s vertex format.
 *
 * Smooth primitives (lathes, spheres, capsules, tori, rounded boxes, tubes swept along curves) with per-vertex
 * material and ambient occlusion, placed with affine transforms; modifiers that add a little deliberate imperfection
 * (noise along the normals) and bake contact shadows; a few shapes made of them (ellipsoids, rings, tapers). No
 * models: each game builds its own from these, and a game that wants another's model copies it. Graphics-free:
 * meshes are plain vertices and indices, uploaded with xl::render::Renderer::upload() and tested natively.
 */
#pragma once
#include "xl_render.h"

#include <cmath>
#include <cstdint>
#include <utility>
#include <vector>

namespace xl::asset {

/** A point or a direction. */
struct V3 {
    float x = 0;   ///< x.
    float y = 0;   ///< y (up).
    float z = 0;   ///< z.
    V3() = default;
    /** @param x_ x. @param y_ y. @param z_ z. */
    constexpr V3(float x_, float y_, float z_) : x(x_), y(y_), z(z_) {}
    /** @param o Another. @return The sum. */
    V3 operator+(V3 o) const { return { x + o.x, y + o.y, z + o.z }; }
    /** @param o Another. @return The difference. */
    V3 operator-(V3 o) const { return { x - o.x, y - o.y, z - o.z }; }
    /** @param k A factor. @return This scaled. */
    V3 operator*(float k) const { return { x * k, y * k, z * k }; }
    /** @return This reversed. */
    V3 operator-() const { return { -x, -y, -z }; }
};
/** @param a A vector. @param b Another. @return Their dot product. */
inline float dot(V3 a, V3 b) { return a.x * b.x + a.y * b.y + a.z * b.z; }
/** @param a A vector. @param b Another. @return Their cross product. */
inline V3 cross(V3 a, V3 b) { return { a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x }; }
/** @param a A vector. @return Its length. */
inline float length(V3 a) { return std::sqrt(dot(a, a)); }
/** @param a A vector. @return It at unit length (+Y when it has none). */
inline V3 normalize(V3 a) { const float l = length(a); return l > 1e-8f ? a * (1.0f / l) : V3{ 0, 1, 0 }; }
/** @param a From. @param b To. @param t How far, 0..1. @return The point between. */
inline V3 lerp(V3 a, V3 b, float t) { return a + (b - a) * t; }

/** An affine transform: a linear part (columns: where x, y and z go) and a translation. */
struct Xform {
    V3 ax{ 1, 0, 0 };   ///< Where x goes.
    V3 ay{ 0, 1, 0 };   ///< Where y goes.
    V3 az{ 0, 0, 1 };   ///< Where z goes.
    V3 t{ 0, 0, 0 };    ///< The translation.
    /** @param p A point. @return It transformed. */
    V3 point(V3 p) const { return ax * p.x + ay * p.y + az * p.z + t; }
    /** @param v A vector. @return It transformed (no translation). */
    V3 vector(V3 v) const { return ax * v.x + ay * v.y + az * v.z; }
    /** @param n A normal. @return It transformed through the inverse transpose (perpendicular under non-uniform scale), unit length. */
    V3 normal(V3 n) const;
    /** @param o Another transform. @return this ∘ o: o first, then this. */
    Xform operator*(const Xform& o) const;
};
/** @param t The offset. @return A translation. */
Xform translate(V3 t);
/** @param s The factor along each axis. @return A scale. */
Xform scale(V3 s);
/** @param s The factor. @return A uniform scale. */
inline Xform scale(float s) { return scale({ s, s, s }); }
/** @param a Radians. @return A rotation about x. */
Xform rotate_x(float a);
/** @param a Radians. @return A rotation about y. */
Xform rotate_y(float a);
/** @param a Radians. @return A rotation about z. */
Xform rotate_z(float a);
/** @param dir A direction. @return A rotation taking +Y onto it (for primitives built along Y). */
Xform align_y(V3 dir);
/** @param p Where. @param yaw Turned about y, radians. @return A model's placement: turned, then moved to p. */
inline Xform place(V3 p, float yaw = 0) { return translate(p) * rotate_y(yaw); }

/** A surface: base colour (0..1, sRGB as authored) and how it shades (xl::render::Vertex::material). */
struct Material {
    float r = 0.8f;          ///< Red.
    float g = 0.8f;          ///< Green.
    float b = 0.8f;          ///< Blue.
    float rough = 0.6f;      ///< Roughness.
    float metal = 0.0f;      ///< Metalness.
    float emissive = 0.0f;   ///< Emission.
    /** How it shades: xl::render::Surface. */
    enum Kind : uint8_t {
        PLAIN = render::PLAIN,       ///< Opaque.
        FOLIAGE = render::FOLIAGE,   ///< Two-sided, translucent.
        EYE = render::EYE,           ///< Glassy.
        SKIN = render::SKIN,         ///< Subsurface.
        WATER = render::WATER,       ///< Rippling, reflective.
    } kind = PLAIN;          ///< Its kind.
};
/**
 * A material from a colour.
 * @param hex 0xRRGGBB.
 * @param rough Roughness.
 * @param metal Metalness.
 * @param emissive Emission.
 * @param kind How it shades.
 * @return The material.
 */
Material mat(uint32_t hex, float rough = 0.6f, float metal = 0.0f, float emissive = 0.0f, Material::Kind kind = Material::PLAIN);
/**
 * A variation on a material.
 * @param m The material.
 * @param seed Picks the variation.
 * @param jitter Nudges each channel by up to ± this.
 * @param k Scales the colour first (> 1: lighter).
 * @return The varied material.
 */
Material vary(Material m, uint32_t seed, float jitter, float k = 1.0f);

/** The vertex: xl::render's. */
using Vertex = render::Vertex;

/** A mesh being built: vertices and triangles, ready to upload. */
struct Mesh {
    std::vector<Vertex> vertices;   ///< The vertices.
    std::vector<uint32_t> indices;  ///< Three per triangle.

    /**
     * Adds a vertex.
     * @param p Its position.
     * @param n Its normal.
     * @param m Its material.
     * @param ao Its ambient occlusion (1: none).
     * @return Its index.
     */
    uint32_t add(V3 p, V3 n, const Material& m, float ao = 1.0f);
    /** Adds a triangle. @param a A vertex. @param b The next. @param c The last (anticlockwise seen from the front). */
    void tri(uint32_t a, uint32_t b, uint32_t c) { indices.push_back(a); indices.push_back(b); indices.push_back(c); }
    /** @param o Another mesh to add. @param x Moving it (normals follow). */
    void append(const Mesh& o, const Xform& x = {});
    /** @return How many triangles. */
    size_t triangles() const { return indices.size() / 3; }

    /** @name Primitives, each added through a transform x */
    ///@{
    /**
     * A surface of revolution about +Y. Normals come from the profile's slope, so a smooth profile shades smoothly; a
     * radius of 0 at an end closes it to a point.
     * @param profile (radius, height) pairs from bottom to top.
     * @param segments Around.
     * @param m Its material.
     * @param x Where.
     * @param ao_bottom Ambient occlusion at the bottom, fading to none at the top.
     */
    void lathe(const std::vector<std::pair<float, float>>& profile, int segments, const Material& m, const Xform& x = {}, float ao_bottom = 1.0f);
    /** @param radius Its radius. @param segments Around (half as many from pole to pole). @param m Its material. @param x Where. */
    void sphere(float radius, int segments, const Material& m, const Xform& x = {});
    /**
     * A capped cylinder along +Y from y = 0 to y = h.
     * @param radius Its radius.
     * @param h Its height.
     * @param segments Around.
     * @param m Its material.
     * @param x Where.
     * @param bevel How much its edges are rounded.
     */
    void cylinder(float radius, float h, int segments, const Material& m, const Xform& x = {}, float bevel = 0.0f);
    /** A rod with round ends. @param a One end. @param b The other. @param radius Its radius. @param segments Around. @param m Its material. @param x Where. */
    void capsule(V3 a, V3 b, float radius, int segments, const Material& m, const Xform& x = {});
    /**
     * A ring in the XZ plane.
     * @param major The radius to the tube's centre.
     * @param minor The tube's radius.
     * @param segments Around the ring.
     * @param sides Around the tube.
     * @param m Its material.
     * @param x Where.
     */
    void torus(float major, float minor, int segments, int sides, const Material& m, const Xform& x = {});
    /**
     * A box centred on the origin with rounded edges and corners.
     * @param size Its size.
     * @param radius How much its edges are rounded.
     * @param m Its material.
     * @param x Where.
     * @param rounding Steps round each edge.
     */
    void rounded_box(V3 size, float radius, const Material& m, const Xform& x = {}, int rounding = 3);
    /**
     * A tube swept along a path.
     * @param path Its centre line.
     * @param radius Its radius (where radii is empty).
     * @param sides Around.
     * @param m Its material.
     * @param x Where.
     * @param radii A radius per point (empty: radius everywhere).
     * @param caps Whether its ends are closed.
     */
    void tube(const std::vector<V3>& path, float radius, int sides, const Material& m, const Xform& x = {}, const std::vector<float>& radii = {}, bool caps = true);
    ///@}

    /** @name Modifiers, on the vertices from index `from` on */
    ///@{
    /**
     * Pushes each vertex along its normal by smooth noise: hand-made, not machined.
     * @param amount Up to this far either way.
     * @param frequency The noise's frequency.
     * @param seed Picks the noise.
     * @param from The first vertex it changes.
     */
    void wobble(float amount, float frequency, uint32_t seed, size_t from = 0);
    /**
     * Darkens vertices near the ground (a contact shadow baked in).
     * @param ground The ground's height.
     * @param reach How far above it the darkening fades out.
     * @param strength How dark it gets at the ground (0..1).
     * @param from The first vertex it changes.
     */
    void ground_ao(float ground, float reach, float strength, size_t from = 0);
    ///@}
};

/** @name Shapes made of primitives */
///@{
/** @param m Into. @param c Its centre. @param r Its radii. @param segments Around. @param mt Its material. @param x Where. */
void ellipsoid(Mesh& m, V3 c, V3 r, int segments, const Material& mt, const Xform& x = {});
/**
 * A ring about an axis, centred at a point.
 * @param m Into.
 * @param c Its centre.
 * @param dir Its axis.
 * @param major The radius to the tube's centre.
 * @param minor The tube's radius.
 * @param mt Its material.
 * @param x Where.
 * @param segments Around the ring.
 */
void ring(Mesh& m, V3 c, V3 dir, float major, float minor, const Material& mt, const Xform& x = {}, int segments = 28);
/**
 * A tube tapering linearly along its path.
 * @param m Into.
 * @param path Its centre line.
 * @param r0 Its radius at the start.
 * @param r1 At the end.
 * @param sides Around.
 * @param mt Its material.
 * @param x Where.
 */
void taper(Mesh& m, const std::vector<V3>& path, float r0, float r1, int sides, const Material& mt, const Xform& x = {});
///@}

/** @param p A point. @param seed Picks the noise. @return Smooth value noise, -1..1. */
float noise3(V3 p, uint32_t seed);
/** @param n Any number. @return A deterministic hash of it, 0..1. */
float hash01(uint32_t n);

} // namespace xl::asset
