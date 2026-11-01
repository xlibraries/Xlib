/**
 * @file mesh.cpp
 * @brief xl_asset.h: transforms, materials, the mesh's primitives and modifiers, the shapes made of them, and noise.
 */
#include "xl_asset.h"

#include <algorithm>

namespace xl::asset {

namespace {

constexpr float PI = 3.14159265358979f;

uint32_t hash32(uint32_t n) {
    n ^= n >> 16; n *= 0x7feb352du;
    n ^= n >> 15; n *= 0x846ca68bu;
    n ^= n >> 16;
    return n;
}

float lattice(int x, int y, int z, uint32_t seed) {
    const uint32_t h = hash32(static_cast<uint32_t>(x) * 73856093u ^ static_cast<uint32_t>(y) * 19349663u ^ static_cast<uint32_t>(z) * 83492791u ^ seed * 2654435761u);
    return (h & 0xffffff) / 8388607.5f - 1.0f;
}

float smooth(float t) { return t * t * (3 - 2 * t); }

} // namespace

float hash01(uint32_t n) { return (hash32(n) & 0xffffff) / 16777215.0f; }

float noise3(V3 p, uint32_t seed) {
    const float fx = std::floor(p.x), fy = std::floor(p.y), fz = std::floor(p.z);
    const int x = static_cast<int>(fx), y = static_cast<int>(fy), z = static_cast<int>(fz);
    const float tx = smooth(p.x - fx), ty = smooth(p.y - fy), tz = smooth(p.z - fz);
    const auto l = [&](int dx, int dy, int dz) { return lattice(x + dx, y + dy, z + dz, seed); };
    const auto mix = [](float a, float b, float t) { return a + (b - a) * t; };
    const float a = mix(mix(l(0, 0, 0), l(1, 0, 0), tx), mix(l(0, 1, 0), l(1, 1, 0), tx), ty);
    const float b = mix(mix(l(0, 0, 1), l(1, 0, 1), tx), mix(l(0, 1, 1), l(1, 1, 1), tx), ty);
    return mix(a, b, tz);
}

// ---------- transforms ----------

V3 Xform::normal(V3 n) const {
    const V3 bc = cross(ay, az), ca = cross(az, ax), ab = cross(ax, ay);
    const float det = dot(ax, bc);
    const V3 out = bc * n.x + ca * n.y + ab * n.z;
    return normalize(det < 0 ? -out : out);
}

Xform Xform::operator*(const Xform& o) const {
    Xform r;
    r.ax = vector(o.ax); r.ay = vector(o.ay); r.az = vector(o.az);
    r.t = point(o.t);
    return r;
}

Xform translate(V3 t) { Xform x; x.t = t; return x; }
Xform scale(V3 s) { Xform x; x.ax = { s.x, 0, 0 }; x.ay = { 0, s.y, 0 }; x.az = { 0, 0, s.z }; return x; }
Xform rotate_x(float a) { Xform x; const float c = std::cos(a), s = std::sin(a); x.ay = { 0, c, s }; x.az = { 0, -s, c }; return x; }
Xform rotate_y(float a) { Xform x; const float c = std::cos(a), s = std::sin(a); x.ax = { c, 0, -s }; x.az = { s, 0, c }; return x; }
Xform rotate_z(float a) { Xform x; const float c = std::cos(a), s = std::sin(a); x.ax = { c, s, 0 }; x.ay = { -s, c, 0 }; return x; }

Xform align_y(V3 dir) {
    Xform x;
    x.ay = normalize(dir);
    const V3 ref = std::fabs(x.ay.y) < 0.95f ? V3{ 0, 1, 0 } : V3{ 1, 0, 0 };
    x.ax = normalize(cross(x.ay, ref));
    x.az = cross(x.ax, x.ay);
    return x;
}

// ---------- materials ----------

Material mat(uint32_t hex, float rough, float metal, float emissive, Material::Kind kind) {
    Material m;
    m.r = ((hex >> 16) & 255) / 255.0f; m.g = ((hex >> 8) & 255) / 255.0f; m.b = (hex & 255) / 255.0f;
    m.rough = rough; m.metal = metal; m.emissive = emissive; m.kind = kind;
    return m;
}

Material vary(Material m, uint32_t seed, float jitter, float k) {
    m.r = m.r * k + (hash01(seed * 3 + 0) - 0.5f) * 2 * jitter;
    m.g = m.g * k + (hash01(seed * 3 + 1) - 0.5f) * 2 * jitter;
    m.b = m.b * k + (hash01(seed * 3 + 2) - 0.5f) * 2 * jitter;
    return m;
}

// ---------- the mesh ----------

uint32_t Mesh::add(V3 p, V3 n, const Material& m, float ao) {
    Vertex v;
    v.pos[0] = p.x; v.pos[1] = p.y; v.pos[2] = p.z;
    v.normal[0] = n.x; v.normal[1] = n.y; v.normal[2] = n.z;
    v.color = render::pack_color(m.r, m.g, m.b, ao);
    v.material = render::pack_material(m.rough, m.metal, m.emissive, static_cast<render::Surface>(m.kind));
    vertices.push_back(v);
    return static_cast<uint32_t>(vertices.size() - 1);
}

void Mesh::append(const Mesh& o, const Xform& x) {
    const uint32_t base = static_cast<uint32_t>(vertices.size());
    for (Vertex v : o.vertices) {
        const V3 p = x.point({ v.pos[0], v.pos[1], v.pos[2] }), n = x.normal({ v.normal[0], v.normal[1], v.normal[2] });
        v.pos[0] = p.x; v.pos[1] = p.y; v.pos[2] = p.z;
        v.normal[0] = n.x; v.normal[1] = n.y; v.normal[2] = n.z;
        vertices.push_back(v);
    }
    for (uint32_t i : o.indices) indices.push_back(base + i);
}

void Mesh::lathe(const std::vector<std::pair<float, float>>& profile, int segments, const Material& m, const Xform& x, float ao_bottom) {
    const int n = static_cast<int>(profile.size());
    if (n < 2 || segments < 3) return;
    // a normal in the (radius, height) plane per profile point; a repeated point makes a hard edge
    std::vector<std::pair<float, float>> normals(n);
    for (int i = 0; i < n; i++) {
        float dr = 0, dy = 0;
        const auto seg = [&](int a, int b, float& r, float& y) {
            r = profile[b].first - profile[a].first; y = profile[b].second - profile[a].second;
            const float l = std::sqrt(r * r + y * y);
            if (l < 1e-7f) { r = y = 0; return false; }
            r /= l; y /= l;
            return true;
        };
        float r0 = 0, y0 = 0, r1 = 0, y1 = 0;
        const bool has0 = i > 0 && seg(i - 1, i, r0, y0);
        const bool has1 = i < n - 1 && seg(i, i + 1, r1, y1);
        if (has0 && has1) { dr = r0 + r1; dy = y0 + y1; }
        else if (has0) { dr = r0; dy = y0; }
        else { dr = r1; dy = y1; }
        const float l = std::sqrt(dr * dr + dy * dy);
        normals[i] = l > 1e-7f ? std::make_pair(dy / l, -dr / l) : std::make_pair(0.0f, 1.0f);
    }
    const uint32_t base = static_cast<uint32_t>(vertices.size());
    for (int i = 0; i < n; i++) {
        const float ao = ao_bottom + (1.0f - ao_bottom) * static_cast<float>(i) / (n - 1);
        for (int s = 0; s <= segments; s++) {
            const float a = 2 * PI * s / segments, c = std::cos(a), sn = std::sin(a);
            const V3 p = { profile[i].first * c, profile[i].second, profile[i].first * sn };
            const V3 nn = { normals[i].first * c, normals[i].second, normals[i].first * sn };
            add(x.point(p), x.normal(nn), m, ao);
        }
    }
    const uint32_t row = static_cast<uint32_t>(segments + 1);
    for (int i = 0; i < n - 1; i++) for (int s = 0; s < segments; s++) {
        const uint32_t a = base + i * row + s, b = a + 1, c = a + row, d = c + 1;
        tri(a, c, b); tri(b, c, d);
    }
}

void Mesh::sphere(float radius, int segments, const Material& m, const Xform& x) {
    const int rings = std::max(3, segments / 2);
    std::vector<std::pair<float, float>> p;
    for (int i = 0; i <= rings; i++) {
        const float a = -PI / 2 + PI * i / rings;
        p.push_back({ std::cos(a) * radius, std::sin(a) * radius });
    }
    p.front().first = 0; p.back().first = 0;
    lathe(p, segments, m, x);
}

void Mesh::cylinder(float radius, float h, int segments, const Material& m, const Xform& x, float bevel) {
    std::vector<std::pair<float, float>> p;
    if (bevel <= 0) {
        p = { { 0, 0 }, { radius, 0 }, { radius, 0 }, { radius, h }, { radius, h }, { 0, h } };
    } else {
        bevel = std::min(bevel, std::min(radius, h * 0.5f));
        p.push_back({ 0, 0 });
        for (int k = 0; k <= 3; k++) { const float a = -PI / 2 + PI / 2 * k / 3; p.push_back({ radius - bevel + std::cos(a) * bevel, bevel + std::sin(a) * bevel }); }
        for (int k = 0; k <= 3; k++) { const float a = PI / 2 * k / 3; p.push_back({ radius - bevel + std::cos(a) * bevel, h - bevel + std::sin(a) * bevel }); }
        p.push_back({ 0, h });
    }
    lathe(p, segments, m, x);
}

void Mesh::capsule(V3 a, V3 b, float radius, int segments, const Material& m, const Xform& x) {
    const float len = length(b - a);
    std::vector<std::pair<float, float>> p;
    const int k = std::max(2, segments / 4);
    for (int i = 0; i <= k; i++) { const float t = -PI / 2 + PI / 2 * i / k; p.push_back({ std::cos(t) * radius, std::sin(t) * radius }); }
    for (int i = 0; i <= k; i++) { const float t = PI / 2 * i / k; p.push_back({ std::cos(t) * radius, len + std::sin(t) * radius }); }
    p.front().first = 0; p.back().first = 0;
    lathe(p, segments, m, x * translate(a) * align_y(len > 1e-6f ? b - a : V3{ 0, 1, 0 }));
}

void Mesh::torus(float major, float minor, int segments, int sides, const Material& m, const Xform& x) {
    const uint32_t base = static_cast<uint32_t>(vertices.size());
    for (int i = 0; i <= segments; i++) {
        const float u = 2 * PI * i / segments, cu = std::cos(u), su = std::sin(u);
        for (int j = 0; j <= sides; j++) {
            const float v = 2 * PI * j / sides, cv = std::cos(v), sv = std::sin(v);
            add(x.point({ (major + minor * cv) * cu, minor * sv, (major + minor * cv) * su }), x.normal({ cv * cu, sv, cv * su }), m);
        }
    }
    const uint32_t row = static_cast<uint32_t>(sides + 1);
    for (int i = 0; i < segments; i++) for (int j = 0; j < sides; j++) {
        const uint32_t a = base + i * row + j, b = a + 1, c = a + row, d = c + 1;
        tri(a, b, c); tri(b, d, c);
    }
}

void Mesh::rounded_box(V3 size, float radius, const Material& m, const Xform& x, int rounding) {
    radius = std::max(0.0f, std::min(radius, std::min(size.x, std::min(size.y, size.z)) * 0.5f));
    const V3 h = { size.x * 0.5f - radius, size.y * 0.5f - radius, size.z * 0.5f - radius };
    rounding = std::max(1, rounding);
    // sample coordinates along one axis of a face: the arc (evenly spread in angle once projected), then the flat
    // middle in steps of about half a unit (so wobble has vertices to move), then the other arc
    const auto samples = [&](float half) {
        std::vector<float> s;
        for (int k = rounding; k >= 1; k--) s.push_back(-half - radius * std::tan(PI / 4 * k / rounding));
        const int flat = std::max(1, std::min(6, static_cast<int>(std::ceil(2 * half / 0.5f))));
        for (int k = 0; k <= flat; k++) s.push_back(-half + 2 * half * k / flat);
        for (int k = 1; k <= rounding; k++) s.push_back(half + radius * std::tan(PI / 4 * k / rounding));
        return s;
    };
    const float hs[3] = { h.x, h.y, h.z };
    for (int axis = 0; axis < 3; axis++) for (int sign = -1; sign <= 1; sign += 2) {
        const int ua = (axis + 1) % 3, va = (axis + 2) % 3;   // u × v = this face's outward axis (for sign +1)
        const std::vector<float> us = samples(hs[ua]), vs = samples(hs[va]);
        const uint32_t base = static_cast<uint32_t>(vertices.size());
        for (float v : vs) for (float u : us) {
            float p[3];
            p[axis] = sign * (hs[axis] + radius); p[ua] = u; p[va] = v;
            const V3 outer = { p[0], p[1], p[2] };
            const V3 inner = { std::max(-h.x, std::min(h.x, outer.x)), std::max(-h.y, std::min(h.y, outer.y)), std::max(-h.z, std::min(h.z, outer.z)) };
            const V3 n = normalize(outer - inner);
            add(x.point(inner + n * radius), x.normal(n), m);
        }
        const uint32_t row = static_cast<uint32_t>(us.size());
        for (uint32_t j = 0; j + 1 < vs.size(); j++) for (uint32_t i = 0; i + 1 < row; i++) {
            const uint32_t a = base + j * row + i, b = a + 1, c = a + row, d = c + 1;
            if (sign > 0) { tri(a, b, d); tri(a, d, c); } else { tri(a, d, b); tri(a, c, d); }
        }
    }
}

void Mesh::tube(const std::vector<V3>& path, float radius, int sides, const Material& m, const Xform& x, const std::vector<float>& radii, bool caps) {
    const int n = static_cast<int>(path.size());
    if (n < 2) return;
    std::vector<V3> T(n), N(n), B(n);
    for (int i = 0; i < n; i++) T[i] = normalize(path[std::min(n - 1, i + 1)] - path[std::max(0, i - 1)]);
    // parallel transport keeps the rings from twisting
    const V3 ref = std::fabs(T[0].y) < 0.9f ? V3{ 0, 1, 0 } : V3{ 1, 0, 0 };
    N[0] = normalize(cross(cross(T[0], ref), T[0]));
    for (int i = 1; i < n; i++) N[i] = normalize(N[i - 1] - T[i] * dot(N[i - 1], T[i]));
    for (int i = 0; i < n; i++) B[i] = cross(T[i], N[i]);
    const auto r_at = [&](int i) { return radii.empty() ? radius : radii[std::min(i, static_cast<int>(radii.size()) - 1)]; };
    const uint32_t base = static_cast<uint32_t>(vertices.size());
    for (int i = 0; i < n; i++) for (int s = 0; s <= sides; s++) {
        const float a = 2 * PI * s / sides;
        const V3 d = N[i] * std::cos(a) + B[i] * std::sin(a);
        add(x.point(path[i] + d * r_at(i)), x.normal(d), m);
    }
    const uint32_t row = static_cast<uint32_t>(sides + 1);
    for (int i = 0; i < n - 1; i++) for (int s = 0; s < sides; s++) {
        const uint32_t a = base + i * row + s, b = a + 1, c = a + row, d = c + 1;
        tri(a, b, c); tri(b, d, c);
    }
    if (!caps) return;
    for (int end = 0; end < 2; end++) {
        const int i = end == 0 ? 0 : n - 1;
        const V3 nn = end == 0 ? -T[i] : T[i];
        const uint32_t centre = add(x.point(path[i]), x.normal(nn), m);
        for (int s = 0; s <= sides; s++) {
            const float a = 2 * PI * s / sides;
            add(x.point(path[i] + (N[i] * std::cos(a) + B[i] * std::sin(a)) * r_at(i)), x.normal(nn), m);
        }
        for (int s = 0; s < sides; s++) {
            if (end == 0) tri(centre, centre + 2 + s, centre + 1 + s);
            else tri(centre, centre + 1 + s, centre + 2 + s);
        }
    }
}

void Mesh::wobble(float amount, float frequency, uint32_t seed, size_t from) {
    for (size_t i = from; i < vertices.size(); i++) {
        Vertex& v = vertices[i];
        const V3 p = { v.pos[0], v.pos[1], v.pos[2] };
        const float k = noise3(p * frequency, seed) * amount;
        v.pos[0] += v.normal[0] * k; v.pos[1] += v.normal[1] * k; v.pos[2] += v.normal[2] * k;
    }
}

void Mesh::ground_ao(float ground, float reach, float strength, size_t from) {
    for (size_t i = from; i < vertices.size(); i++) {
        Vertex& v = vertices[i];
        const float f = std::max(0.0f, std::min(1.0f, (v.pos[1] - ground) / reach));
        const float ao = (v.color >> 24) / 255.0f * (1.0f - strength * (1 - f) * (1 - f));
        v.color = (v.color & 0x00ffffffu) | static_cast<uint32_t>(render::unorm8(ao)) << 24;
    }
}

// ---------- shapes ----------

void ellipsoid(Mesh& m, V3 c, V3 r, int segments, const Material& mt, const Xform& x) { m.sphere(1, segments, mt, x * translate(c) * scale(r)); }

void ring(Mesh& m, V3 c, V3 dir, float major, float minor, const Material& mt, const Xform& x, int segments) {
    m.torus(major, minor, segments, 8, mt, x * translate(c) * align_y(dir));
}

void taper(Mesh& m, const std::vector<V3>& path, float r0, float r1, int sides, const Material& mt, const Xform& x) {
    std::vector<float> radii;
    for (size_t i = 0; i < path.size(); i++) radii.push_back(r0 + (r1 - r0) * i / std::max<size_t>(1, path.size() - 1));
    m.tube(path, r0, sides, mt, x, radii);
}

} // namespace xl::asset
