#include "models.h"

#include <algorithm>
#include <cmath>

namespace jr {

namespace {

constexpr float PI = 3.14159265358979f;
using Profile = std::vector<std::pair<float, float>>;

// ---------- the palette ----------

Material gold() { return mat(0xF2B84B, 0.26f, 1.0f); }
Material gold_dark() { return mat(0xD08F2E, 0.34f, 1.0f); }
Material gold_cloth() { return mat(0xE9B44C, 0.45f, 0.7f); }
Material cream() { return mat(0xF3E4C6, 0.5f); }
Material wood() { return mat(0x7E4C2A, 0.62f); }
Material wood_dark() { return mat(0x55321C, 0.7f); }
Material teal() { return mat(0x63C7D6, 0.62f); }
Material teal_velvet() { return mat(0x1F8C93, 0.85f); }
Material ruby() { return mat(0xC81E35, 0.18f); }
Material emerald() { return mat(0x1FA387, 0.18f); }
Material skin() { return mat(0xB7704A, 0.52f, 0, 0, Material::SKIN); }
Material blush() { return mat(0xC47452, 0.5f, 0, 0, Material::SKIN); }
Material hair() { return mat(0x1B1311, 0.34f); }
Material kohl() { return mat(0x120A08, 0.45f); }
Material lip() { return mat(0x93303B, 0.38f); }
Material sandstone() { return mat(0xE2C394, 0.72f); }
Material brick() { return mat(0xC4825A, 0.88f); }
Material plaster() { return mat(0xEBE1CB, 0.8f); }
Material terracotta() { return mat(0xB5562E, 0.72f); }
Material water() { return mat(0x2E8FA3, 0.08f, 0, 0, Material::WATER); }
Material leaf() { return mat(0x4A8236, 0.6f, 0, 0, Material::FOLIAGE); }

Xform xf_at(V3 p, float yaw = 0) { return translate(p) * rotate_y(yaw); }

void ellipsoid(Mesh& m, V3 c, V3 r, int segments, const Material& mt, const Xform& x = {}) { m.sphere(1, segments, mt, x * translate(c) * scale(r)); }

/** A ring about axis `dir` (perpendicular to it), centred at c. */
void ring(Mesh& m, V3 c, V3 dir, float major, float minor, const Material& mt, const Xform& x = {}, int segments = 28) {
    m.torus(major, minor, segments, 8, mt, x * translate(c) * align_y(dir));
}

/** A tube with radii tapering linearly from r0 to r1. */
void taper(Mesh& m, const std::vector<V3>& path, float r0, float r1, int sides, const Material& mt, const Xform& x = {}) {
    std::vector<float> radii;
    for (size_t i = 0; i < path.size(); i++) radii.push_back(r0 + (r1 - r0) * i / std::max<size_t>(1, path.size() - 1));
    m.tube(path, r0, sides, mt, x, radii);
}

/** A bell or onion dome: lathe of a classic profile, `h` tall. */
void onion(Mesh& m, V3 base, float r, float h, const Material& mt, const Xform& x = {}) {
    const Profile p = { { 0, 0 }, { 0.75f, 0.0f }, { 0.95f, 0.12f }, { 1.0f, 0.3f }, { 0.85f, 0.52f }, { 0.55f, 0.7f }, { 0.25f, 0.84f }, { 0.12f, 0.92f }, { 0.1f, 0.97f }, { 0, 1.0f } };
    Profile q;
    for (auto [pr, py] : p) q.push_back({ pr * r, py * h });
    m.lathe(q, 24, mt, x * translate(base));
}

/** A kalash finial: a pot with a spike. */
void kalash(Mesh& m, V3 base, float s, const Material& mt, const Xform& x = {}) {
    const Profile p = { { 0, 0 }, { 0.5f, 0 }, { 0.5f, 0.08f }, { 0.35f, 0.15f }, { 0.75f, 0.45f }, { 0.7f, 0.7f }, { 0.3f, 0.85f }, { 0.4f, 0.95f }, { 0.15f, 1.05f }, { 0.08f, 1.5f }, { 0, 1.7f } };
    Profile q;
    for (auto [pr, py] : p) q.push_back({ pr * s, py * s });
    m.lathe(q, 20, mt, x * translate(base));
}

// ---------- props ----------

void house(Mesh& m, const Prop& p) {
    const size_t from = m.vertices.size();
    const HouseShape h = house_shape(p.seed, p.scale > 1.2f);
    const Xform X = xf_at({ p.x, p.y, p.z }, p.yaw);
    const Material b = vary(brick(), p.seed, 0.05f), dark = vary(b, p.seed + 1, 0.02f, 0.82f), light = vary(b, p.seed + 2, 0.02f, 1.08f);
    m.rounded_box({ h.w + 0.3f, 0.22f, h.d + 0.3f }, 0.06f, dark, X * translate({ 0, 0.11f, 0 }), 2);
    m.rounded_box({ h.w, h.h, h.d }, 0.09f, b, X * translate({ 0, h.h / 2 + 0.05f, 0 }), 2);
    // brick courses: two raised bands
    for (float y : { h.h * 0.35f, h.h * 0.72f }) m.rounded_box({ h.w + 0.05f, 0.06f, h.d + 0.05f }, 0.02f, dark, X * translate({ 0, y, 0 }), 1);
    // roof and parapet
    const float top = h.h + 0.05f;
    m.rounded_box({ h.w + 0.1f, 0.08f, h.d + 0.1f }, 0.03f, light, X * translate({ 0, top, 0 }), 1);
    for (int s = -1; s <= 1; s += 2) {
        m.rounded_box({ h.w + 0.1f, 0.2f, 0.12f }, 0.04f, b, X * translate({ 0, top + 0.12f, s * (h.d / 2) }), 1);
        m.rounded_box({ 0.12f, 0.2f, h.d + 0.1f }, 0.04f, b, X * translate({ s * (h.w / 2), top + 0.12f, 0 }), 1);
    }
    // a door with a lintel, small high windows
    m.rounded_box({ 0.62f, 1.0f, 0.1f }, 0.03f, mat(0x3E2618, 0.8f), X * translate({ 0, 0.58f, -h.d / 2 - 0.01f }), 1);
    m.rounded_box({ 0.9f, 0.1f, 0.16f }, 0.03f, wood(), X * translate({ 0, 1.12f, -h.d / 2 - 0.03f }), 1);
    for (int s = -1; s <= 1; s += 2) m.rounded_box({ 0.26f, 0.24f, 0.08f }, 0.03f, mat(0x2E1C12, 0.8f), X * translate({ s * h.w * 0.3f, h.h * 0.74f, -h.d / 2 - 0.01f }), 1);
    for (int s = -1; s <= 1; s += 2) m.rounded_box({ 0.08f, 0.22f, 0.24f }, 0.03f, mat(0x2E1C12, 0.8f), X * translate({ s * (h.w / 2 + 0.01f), h.h * 0.74f, 0 }), 1);
    const float r = hash01(p.seed * 13);
    if (h.upper) {   // an upper room and steps up the side
        const float uw = h.w * 0.5f, ud = h.d * 0.55f;
        m.rounded_box({ uw, 0.85f, ud }, 0.08f, b, X * translate({ -h.w / 2 + uw / 2 + 0.05f, top + 0.45f, -h.d / 2 + ud / 2 + 0.05f }), 2);
        m.rounded_box({ uw + 0.1f, 0.07f, ud + 0.1f }, 0.03f, light, X * translate({ -h.w / 2 + uw / 2 + 0.05f, top + 0.9f, -h.d / 2 + ud / 2 + 0.05f }), 1);
        for (int k = 0; k < 5; k++) {
            const float t = (k + 0.5f) / 5;
            m.rounded_box({ 0.42f, 0.12f + top * t, 0.5f }, 0.03f, dark, X * translate({ h.w / 2 - 0.35f - k * 0.38f, (0.12f + top * t) / 2, h.d / 2 + 0.3f }), 1);
        }
    } else if (r < 0.5f) {   // a pot and a rolled mat on the roof
        m.lathe({ { 0, 0 }, { 0.12f, 0 }, { 0.2f, 0.12f }, { 0.18f, 0.26f }, { 0.09f, 0.32f }, { 0.11f, 0.36f }, { 0, 0.35f } }, 16, terracotta(), X * translate({ h.w * 0.2f, top + 0.04f, -h.d * 0.15f }));
        m.cylinder(0.08f, 0.9f, 12, mat(0xD8B66A, 0.9f), X * translate({ -h.w * 0.2f, top + 0.12f, h.d * 0.1f - 0.45f }) * rotate_x(PI / 2), 0.03f);
    }
    if (r > 0.7f) {   // a cloth awning over the door
        const Material cloth[] = { mat(0xD9503F, 0.85f), teal(), mat(0xF0A23A, 0.85f) };
        m.rounded_box({ 1.2f, 0.04f, 0.75f }, 0.02f, cloth[p.seed % 3], X * translate({ 0, 1.32f, -h.d / 2 - 0.32f }) * rotate_x(-0.35f), 2);
    }
    m.wobble(0.022f, 2.0f, p.seed, from);
    m.ground_ao(p.y, 0.6f, 0.45f, from);
}

void palm(Mesh& m, const Prop& p) {
    const size_t from = m.vertices.size();
    const float H = 3.3f * p.scale, lean = 0.25f + hash01(p.seed) * 0.5f;
    const V3 dir = { std::cos(p.yaw), 0, std::sin(p.yaw) };
    std::vector<V3> trunk;
    std::vector<float> radii;
    for (int i = 0; i <= 28; i++) {
        const float t = i / 28.0f;
        trunk.push_back(V3{ p.x, p.y, p.z } + dir * (lean * t * t * H * 0.4f) + V3{ 0, t * H, 0 });
        radii.push_back(0.17f * p.scale * (1 - 0.38f * t) * (i % 2 ? 1.07f : 0.97f));
    }
    m.tube(trunk, 0.17f, 12, vary(mat(0x8A6A4A, 0.92f), p.seed, 0.04f), {}, radii);
    m.wobble(0.015f, 5, p.seed, from);
    const V3 top = trunk.back();
    for (int k = 0; k < 3; k++) {
        const float a = k * 2.1f + p.yaw;
        ellipsoid(m, top + V3{ std::cos(a) * 0.12f, -0.12f, std::sin(a) * 0.12f } * p.scale, V3{ 0.09f, 0.1f, 0.09f } * p.scale, 12, mat(0x6B4A26, 0.6f));
    }
    // fronds: drooping, folded along the rib, with ragged leaflets
    const int fronds = 10;
    for (int f = 0; f < fronds; f++) {
        const float a = 2 * PI * f / fronds + hash01(p.seed * 31 + f) * 0.4f;
        const V3 d = { std::cos(a), 0, std::sin(a) }, side = { -d.z, 0, d.x }, up = { 0, 1, 0 };
        const float L = (1.7f + hash01(p.seed * 17 + f) * 0.5f) * p.scale, rise = 0.35f + hash01(p.seed * 7 + f) * 0.3f;
        const Material g = vary(leaf(), p.seed * 11 + f, 0.05f);
        const int N = 18;
        uint32_t prev[3] = { 0, 0, 0 };
        for (int i = 0; i <= N; i++) {
            const float u = static_cast<float>(i) / N;
            const V3 c = top + d * (L * u) + up * (rise * L * u - 1.0f * L * u * u);
            const float w = 0.38f * p.scale * std::pow(std::sin(PI * std::min(0.98f, u * 0.9f + 0.05f)), 0.7f) * (0.55f + 0.45f * std::fabs(std::sin(u * PI * 8)));
            const V3 tangent = normalize(d + up * (rise - 2.0f * u));
            const V3 n = normalize(cross(side, tangent) * -1.0f);
            const float tip = u > 0.8f ? (u - 0.8f) * 2.5f : 0;   // the tips yellow
            Material gt = g; gt.r += tip * 0.25f; gt.g += tip * 0.1f;
            const uint32_t l = m.add(c + side * w - n * (w * 0.25f), normalize(n + side * 0.5f), gt);
            const uint32_t mid = m.add(c, n, gt);
            const uint32_t r = m.add(c - side * w - n * (w * 0.25f), normalize(n - side * 0.5f), gt);
            if (i > 0) { m.tri(prev[0], l, prev[1]); m.tri(prev[1], l, mid); m.tri(prev[1], mid, prev[2]); m.tri(prev[2], mid, r); }
            prev[0] = l; prev[1] = mid; prev[2] = r;
        }
    }
    m.ground_ao(p.y, 0.5f, 0.4f, from);
}

void shrub(Mesh& m, const Prop& p) {
    const size_t from = m.vertices.size();
    const int n = 4 + p.seed % 3;
    for (int k = 0; k < n; k++) {
        const float a = k * 2.4f + p.yaw, d = (k == 0 ? 0.0f : 0.25f + hash01(p.seed + k) * 0.2f) * p.scale;
        const float r = (0.32f + hash01(p.seed * 3 + k) * 0.18f) * p.scale;
        ellipsoid(m, { p.x + std::cos(a) * d, p.y + r * 0.75f, p.z + std::sin(a) * d }, { r, r * 0.85f, r }, 12, vary(mat(0x5E9440, 0.75f), p.seed * 5 + k, 0.06f));
    }
    // a few flowers
    for (int k = 0; k < 4; k++) {
        const float a = k * 1.7f + p.yaw;
        ellipsoid(m, { p.x + std::cos(a) * 0.3f * p.scale, p.y + 0.5f * p.scale + 0.08f * k * p.scale, p.z + std::sin(a) * 0.3f * p.scale }, { 0.05f, 0.05f, 0.05f }, 8, k % 2 ? mat(0xF28C1E, 0.6f) : mat(0xF4D03F, 0.6f));
    }
    m.wobble(0.05f, 4, p.seed, from);
    m.ground_ao(p.y, 0.4f, 0.5f, from);
}

void rock(Mesh& m, const Prop& p) {
    const size_t from = m.vertices.size();
    const float r = 0.55f * p.scale;
    m.sphere(1, 20, vary(mat(0xA39079, 0.85f), p.seed, 0.05f), xf_at({ p.x, p.y + r * 0.25f, p.z }, p.yaw) * scale({ r * 1.1f, r * 0.65f, r }));
    m.wobble(0.13f * p.scale, 2.4f / p.scale, p.seed, from);
    m.ground_ao(p.y, 0.3f, 0.5f, from);
}

void lamp(Mesh& m, const Prop& p) {
    const Xform X = xf_at({ p.x, p.y, p.z }, p.yaw);
    m.lathe({ { 0, 0 }, { 0.2f, 0 }, { 0.2f, 0.08f }, { 0.1f, 0.15f }, { 0.08f, 0.7f }, { 0.16f, 0.78f }, { 0.18f, 0.85f }, { 0, 0.85f } }, 16, sandstone(), X, 0.6f);
    m.lathe({ { 0, 0 }, { 0.1f, 0 }, { 0.16f, 0.06f }, { 0.15f, 0.09f }, { 0.11f, 0.08f }, { 0, 0.07f } }, 16, terracotta(), X * translate({ 0, 0.85f, 0 }));
    m.lathe({ { 0, 0 }, { 0.045f, 0.03f }, { 0.04f, 0.09f }, { 0.015f, 0.16f }, { 0, 0.2f } }, 12, mat(0xFFB347, 0.5f, 0, 1.0f), X * translate({ 0, 0.92f, 0 }));
}

void well(Mesh& m, const Prop& p) {
    const size_t from = m.vertices.size();
    const Xform X = xf_at({ p.x, p.y, p.z }, p.yaw);
    m.lathe({ { 0.5f, 0.25f }, { 0.5f, 0.55f }, { 0.55f, 0.62f }, { 0.72f, 0.62f }, { 0.76f, 0.55f }, { 0.76f, 0 }, { 0.8f, 0 } }, 32, brick(), X);
    m.cylinder(0.5f, 0.02f, 32, water(), X * translate({ 0, 0.3f, 0 }));
    for (int s = -1; s <= 1; s += 2) m.cylinder(0.05f, 1.3f, 10, wood(), X * translate({ 0, 0.55f, s * 0.68f }));
    m.cylinder(0.035f, 1.5f, 10, wood(), X * translate({ 0, 1.8f, -0.75f }) * rotate_x(PI / 2));
    m.append(build_wheel(0.14f), X * translate({ 0, 1.8f, 0 }));
    m.cylinder(0.008f, 1.0f, 6, mat(0xC8A46A, 0.9f), X * translate({ 0.14f, 0.75f, 0 }));
    m.lathe({ { 0, 0 }, { 0.08f, 0 }, { 0.1f, 0.15f }, { 0.11f, 0.2f }, { 0, 0.2f } }, 12, wood_dark(), X * translate({ 0.14f, 0.6f, 0 }));
    m.ground_ao(p.y, 0.5f, 0.4f, from);
}

void great_bath(Mesh& m, const Prop& p) {
    const size_t from = m.vertices.size();
    const Xform X = xf_at({ p.x, p.y, p.z }, p.yaw);
    const Material b = mat(0xAE6040, 0.85f), dark = vary(b, 3, 0.02f, 0.85f);
    const float W = BATH_W, D = BATH_D, PW = W * 0.55f, PD = D * 0.42f, H = 0.65f;
    const float sd = (D - PD) / 2, sw = (W - PW) / 2;
    for (int s = -1; s <= 1; s += 2) {
        m.rounded_box({ W, H, sd }, 0.08f, b, X * translate({ 0, H / 2, s * (PD / 2 + sd / 2) }), 2);
        m.rounded_box({ sw, H, PD }, 0.08f, b, X * translate({ s * (PW / 2 + sw / 2), H / 2, 0 }), 2);
    }
    m.rounded_box({ PW, 0.12f, PD }, 0.03f, dark, X * translate({ 0, 0.06f, 0 }), 1);
    for (int s = -1; s <= 1; s += 2) for (int k = 0; k < 4; k++) {   // steps down at both ends
        const float hk = H * (4 - k) / 4.5f;
        m.rounded_box({ 0.36f, hk, 1.3f }, 0.03f, dark, X * translate({ s * (PW / 2 - 0.18f - k * 0.36f), hk / 2, 0 }), 1);
    }
    m.rounded_box({ PW - 0.02f, 0.02f, PD - 0.02f }, 0.005f, water(), X * translate({ 0, H - 0.2f, 0 }), 1);
    // the colonnade round it
    for (int s = -1; s <= 1; s += 2) for (int k = 0; k < 7; k++) {
        const float x = -W / 2 + 0.6f + k * (W - 1.2f) / 6;
        m.rounded_box({ 0.36f, 1.15f, 0.36f }, 0.06f, vary(b, k * 2 + (s > 0), 0.04f), X * translate({ x, H + 0.58f, s * (D / 2 - 0.35f) }), 2);
    }
    for (int s = -1; s <= 1; s += 2) m.rounded_box({ W - 0.6f, 0.14f, 0.5f }, 0.05f, dark, X * translate({ 0, H + 1.2f, s * (D / 2 - 0.35f) }), 2);
    m.wobble(0.02f, 1.8f, 77, from);
    m.ground_ao(p.y, 0.5f, 0.4f, from);
}

void stupa(Mesh& m, const Prop& p) {
    const size_t from = m.vertices.size();
    const Xform X = xf_at({ p.x, p.y, p.z }, p.yaw) * scale(STUPA_R / 3.6f);
    const float R = 3.6f;
    m.rounded_box({ 2 * R, 0.8f, 2 * R }, 0.1f, mat(0xB46A44, 0.88f), X * translate({ 0, 0.4f, 0 }), 2);
    m.rounded_box({ 2 * R - 1.6f, 0.6f, 2 * R - 1.6f }, 0.1f, mat(0xBF7650, 0.88f), X * translate({ 0, 1.1f, 0 }), 2);
    for (int k = 0; k < 5; k++) m.rounded_box({ 0.4f, 0.8f + 0.6f * k / 4.0f, 1.6f }, 0.04f, mat(0xA65E3C, 0.88f), X * translate({ R + 0.2f + (4 - k) * 0.4f - 1.6f, (0.8f + 0.6f * k / 4.0f) / 2, 0 }), 1);
    m.cylinder(2.1f, 0.45f, 48, plaster(), X * translate({ 0, 1.4f, 0 }), 0.06f);
    ring(m, { 0, 1.85f, 0 }, { 0, 1, 0 }, 2.08f, 0.05f, gold(), X, 64);
    Profile dome;
    for (int i = 0; i <= 16; i++) { const float a = PI / 2 * i / 16; dome.push_back({ std::cos(a) * 2.05f, std::sin(a) * 1.85f }); }
    dome.back().first = 0;
    m.lathe(dome, 48, plaster(), X * translate({ 0, 1.85f, 0 }));
    m.rounded_box({ 0.75f, 0.45f, 0.75f }, 0.06f, plaster(), X * translate({ 0, 3.85f, 0 }), 2);
    m.cylinder(0.04f, 1.0f, 8, gold_dark(), X * translate({ 0, 4.0f, 0 }));
    for (int k = 0; k < 3; k++) m.cylinder(0.4f - k * 0.1f, 0.05f, 24, gold(), X * translate({ 0, 4.3f + k * 0.28f, 0 }), 0.02f);
    m.wobble(0.02f, 1.5f, 91, from);
    m.ground_ao(p.y, 0.6f, 0.4f, from);
}

void granary(Mesh& m, const Prop& p) {
    const size_t from = m.vertices.size();
    const Xform X = xf_at({ p.x, p.y, p.z }, p.yaw);
    m.rounded_box({ GRANARY_W, 0.6f, GRANARY_D }, 0.08f, mat(0xB06844, 0.88f), X * translate({ 0, 0.3f, 0 }), 2);
    for (int i = 0; i < 3; i++) for (int j = 0; j < 2; j++)
        m.rounded_box({ 2.6f, 1.1f, 2.2f }, 0.08f, vary(brick(), i * 2 + j, 0.05f), X * translate({ -3.1f + i * 3.1f, 1.15f, -1.3f + j * 2.6f }), 2);
    for (int i = 0; i < 4; i++) m.cylinder(0.08f, GRANARY_D, 10, wood(), X * translate({ -4.6f + i * 3.07f, 1.85f, -GRANARY_D / 2 }) * rotate_x(PI / 2));
    for (int s = -1; s <= 1; s += 2) m.cylinder(0.08f, GRANARY_W - 0.4f, 10, wood(), X * translate({ -GRANARY_W / 2 + 0.2f, 1.85f, s * 2.6f }) * rotate_z(-PI / 2));
    for (int i = 0; i < 6; i++) ellipsoid(m, { -4.0f + i * 1.5f, 0.85f, -GRANARY_D / 2 - 0.2f }, { 0.3f, 0.24f, 0.26f }, 12, vary(mat(0xC9AE7C, 0.95f), i, 0.05f), X);   // sacks along the front
    m.wobble(0.02f, 1.8f, 55, from);
    m.ground_ao(p.y, 0.5f, 0.4f, from);
}

void pot_at(Mesh& m, const Xform& x, float s, uint32_t seed);

void cart(Mesh& m, const Prop& p) {
    const size_t from = m.vertices.size();
    const Xform X = xf_at({ p.x, p.y, p.z }, p.yaw);
    m.rounded_box({ 1.6f, 0.1f, 1.0f }, 0.03f, wood(), X * translate({ 0, 0.62f, 0 }), 2);
    for (int s = -1; s <= 1; s += 2) m.rounded_box({ 1.6f, 0.22f, 0.06f }, 0.02f, wood_dark(), X * translate({ 0, 0.78f, s * 0.5f }), 1);
    for (int s = -1; s <= 1; s += 2) m.append(build_wheel(0.45f), X * translate({ -0.1f, 0.45f, s * 0.6f }) * (s < 0 ? rotate_y(PI) : Xform{}));
    m.cylinder(0.035f, 1.3f, 8, wood_dark(), X * translate({ -0.1f, 0.45f, -0.65f }) * rotate_x(PI / 2));
    for (int s = -1; s <= 1; s += 2) m.tube({ { 0.75f, 0.6f, s * 0.35f }, { 1.4f, 0.5f, s * 0.15f }, { 2.0f, 0.45f, s * 0.08f } }, 0.035f, 8, wood(), X);
    m.cylinder(0.04f, 0.9f, 8, wood(), X * translate({ 2.0f, 0.5f, -0.45f }) * rotate_x(PI / 2));
    // its load: pots and sacks
    pot_at(m, X * translate({ -0.4f, 0.67f, -0.2f }), 0.9f, p.seed);
    pot_at(m, X * translate({ -0.35f, 0.67f, 0.22f }), 0.8f, p.seed + 1);
    for (int k = 0; k < 2; k++) ellipsoid(m, { 0.3f + k * 0.15f, 0.85f, -0.15f + k * 0.3f }, { 0.28f, 0.2f, 0.22f }, 14, vary(mat(0xC9AE7C, 0.95f), p.seed + k, 0.04f), X);
    m.wobble(0.015f, 3, p.seed, from);
    m.ground_ao(p.y, 0.5f, 0.4f, from);
}

Profile pot_profile(float s) {
    const Profile p = { { 0, 0 }, { 0.12f, 0 }, { 0.2f, 0.05f }, { 0.26f, 0.16f }, { 0.27f, 0.25f }, { 0.22f, 0.36f }, { 0.12f, 0.42f }, { 0.11f, 0.46f }, { 0.14f, 0.5f }, { 0.13f, 0.53f }, { 0.09f, 0.5f }, { 0.08f, 0.44f }, { 0, 0.42f } };
    Profile q;
    for (auto [r, y] : p) q.push_back({ r * s, y * s });
    return q;
}

void pot_at(Mesh& m, const Xform& x, float s, uint32_t seed) {
    const size_t from = m.vertices.size();
    m.lathe(pot_profile(s), 20, vary(terracotta(), seed, 0.04f), x);
    for (float y : { 0.2f, 0.3f }) m.torus(0.268f * s, 0.008f * s, 24, 4, mat(0x241410, 0.8f), x * translate({ 0, y * s, 0 }));
    m.wobble(0.01f * s, 6, seed, from);
}

// ---------- the desert ----------

Material bronze() { return mat(0x7A5434, 0.4f, 1.0f); }
Material bone() { return mat(0xEDE3CF, 0.7f); }
Material straw() { return mat(0xC9A35F, 0.85f); }
Material saffron() { return mat(0xE8862A, 0.8f); }

void sun_banner(Mesh& m, const Prop& p) {
    const size_t from = m.vertices.size();
    const Xform X = xf_at({ p.x, p.y, p.z }, p.yaw);
    m.cylinder(0.05f, 2.9f, 10, wood(), X, 0.01f);
    for (int k = 0; k < 4; k++) ellipsoid(m, { std::cos(k * 1.6f) * 0.16f, 0.06f, std::sin(k * 1.6f) * 0.16f }, { 0.12f, 0.08f, 0.1f }, 8, mat(0x9C8A78, 0.9f), X);
    const Xform sun = X * translate({ 0.04f, 2.6f, 0 }) * rotate_z(-PI / 2);
    m.lathe({ { 0, 0 }, { 0.26f, 0 }, { 0.28f, 0.02f }, { 0.22f, 0.05f }, { 0.08f, 0.07f }, { 0, 0.075f } }, 24, mat(0xF4A12E, 0.45f, 0.3f), sun);
    for (int i = 0; i < 12; i++) {
        const float a = 2 * PI * i / 12;
        m.capsule({ 0.06f, 2.6f + std::cos(a) * 0.3f, std::sin(a) * 0.3f }, { 0.06f, 2.6f + std::cos(a) * 0.45f, std::sin(a) * 0.45f }, 0.025f, 6, mat(0xF2C14E, 0.5f, 0.3f), X);
    }
    m.rounded_box({ 0.04f, 0.42f, 0.7f }, 0.015f, vary(saffron(), p.seed, 0.04f), X * translate({ 0, 2.05f, 0.38f }) * rotate_x(0.12f), 2);
    m.ground_ao(p.y, 0.3f, 0.4f, from);
}

void cactus(Mesh& m, const Prop& p) {
    const size_t from = m.vertices.size();
    const Xform X = xf_at({ p.x, p.y, p.z }, p.yaw) * scale(p.scale);
    const Material g = vary(mat(0x5F8F43, 0.7f), p.seed, 0.04f);
    m.capsule({ 0, -0.1f, 0 }, { 0, 1.7f, 0 }, 0.21f, 16, g, X);
    m.tube({ { 0, 0.75f, 0 }, { 0.3f, 0.78f, 0 }, { 0.42f, 0.95f, 0 }, { 0.43f, 1.3f, 0 } }, 0.13f, 12, g, X);
    m.sphere(0.13f, 12, g, X * translate({ 0.43f, 1.3f, 0 }));
    if (p.seed % 2) {
        m.tube({ { 0, 1.0f, 0 }, { 0, 1.02f, -0.28f }, { 0, 1.2f, -0.36f }, { 0, 1.42f, -0.36f } }, 0.11f, 12, g, X);
        m.sphere(0.11f, 12, g, X * translate({ 0, 1.42f, -0.36f }));
    }
    m.wobble(0.018f, 14, p.seed, from);
    for (int k = 0; k < 3; k++) m.sphere(0.05f, 8, mat(0xF27BA5, 0.5f), X * translate({ std::cos(k * 2.1f) * 0.1f, 1.88f, std::sin(k * 2.1f) * 0.1f }));
    m.ground_ao(p.y, 0.4f, 0.4f, from);
}

void tumbleweed_into(Mesh& m, const Xform& x, uint32_t seed) {
    const Material w = mat(0xA4875A, 0.9f);
    for (int k = 0; k < 34; k++) {
        const float a0 = hash01(seed + k * 3) * 2 * PI, b0 = (hash01(seed + k * 3 + 1) - 0.5f) * PI, turn = 0.9f + hash01(seed + k * 3 + 2) * 1.2f;
        std::vector<V3> path;
        for (int i = 0; i <= 6; i++) {
            const float a = a0 + turn * i / 6, b = b0 + std::sin(a * 1.7f) * 0.5f, r = 0.42f * (0.85f + 0.15f * std::sin(a * 3 + k));
            path.push_back({ std::cos(a) * std::cos(b) * r, std::sin(b) * r, std::sin(a) * std::cos(b) * r });
        }
        m.tube(path, 0.012f, 4, vary(w, seed + k, 0.05f), x, {}, false);
    }
}

void camel_bones(Mesh& m, const Prop& p) {
    const size_t from = m.vertices.size();
    const Xform X = xf_at({ p.x, p.y - 0.12f, p.z }, p.yaw);
    std::vector<V3> spine;
    for (int i = 0; i <= 12; i++) spine.push_back({ -0.8f + i * 0.14f, 0.18f + 0.03f * std::sin(i * 1.3f), 0 });
    m.tube(spine, 0.05f, 8, bone(), X);
    for (int r = 0; r < 8; r++) {
        std::vector<V3> rib;
        const float x = -0.55f + r * 0.14f, rr = 0.38f - std::fabs(r - 3.5f) * 0.03f;
        for (int i = 0; i <= 8; i++) { const float a = PI * i / 8; rib.push_back({ x + 0.04f * std::sin(a), 0.18f + std::sin(a) * rr * 0.9f - 0.15f, std::cos(a) * rr }); }
        m.tube(rib, 0.022f, 6, bone(), X);
    }
    ellipsoid(m, { 1.05f, 0.18f, 0.1f }, { 0.24f, 0.13f, 0.13f }, 14, bone(), X);
    m.capsule({ 1.2f, 0.16f, 0.12f }, { 1.48f, 0.1f, 0.16f }, 0.07f, 10, bone(), X);
    m.sphere(0.035f, 8, mat(0x3A2A1E, 0.9f), X * translate({ 1.12f, 0.24f, 0.2f }));
    m.wobble(0.01f, 6, p.seed, from);
    m.ground_ao(p.y, 0.3f, 0.5f, from);
}

void signboard(Mesh& m, const Prop& p) {
    const size_t from = m.vertices.size();
    const Xform X = xf_at({ p.x, p.y, p.z }, p.yaw);
    for (int s = -1; s <= 1; s += 2) m.cylinder(0.075f, 2.1f, 10, wood_dark(), X * translate({ s * 1.0f, 0, 0 }), 0.02f);
    m.rounded_box({ 2.5f, 1.05f, 0.1f }, 0.04f, mat(0xC4935E, 0.75f), X * translate({ 0, 1.55f, 0 }), 2);
    m.rounded_box({ 2.6f, 0.08f, 0.14f }, 0.03f, wood_dark(), X * translate({ 0, 2.1f, 0 }), 1);
    // painted: a sun, a unicorn seal and lines of script
    m.lathe({ { 0, 0 }, { 0.2f, 0 }, { 0.21f, 0.015f }, { 0, 0.02f } }, 20, mat(0xB8323A, 0.6f), X * translate({ -0.82f, 1.55f, 0.05f }) * rotate_x(PI / 2));
    m.rounded_box({ 0.36f, 0.36f, 0.02f }, 0.02f, mat(0xF0E4C8, 0.6f), X * translate({ 0.82f, 1.55f, 0.055f }), 1);
    ellipsoid(m, { 0.8f, 1.53f, 0.07f }, { 0.11f, 0.06f, 0.012f }, 10, mat(0x6A4A30, 0.6f), X);
    m.capsule({ 0.9f, 1.57f, 0.07f }, { 0.98f, 1.66f, 0.07f }, 0.01f, 6, mat(0x6A4A30, 0.6f), X);
    for (int i = 0; i < 3; i++) m.rounded_box({ 0.95f - i * 0.18f, 0.06f, 0.02f }, 0.01f, mat(0x3A2418, 0.7f), X * translate({ -0.05f, 1.78f - i * 0.2f, 0.055f }), 1);
    m.wobble(0.006f, 5, 3, from);
    m.ground_ao(p.y, 0.4f, 0.4f, from);
}

// ---------- street life ----------

void basket(Mesh& m, const Prop& p) {
    const size_t from = m.vertices.size();
    const Xform X = xf_at({ p.x, p.y, p.z }, p.yaw);
    m.lathe({ { 0, 0 }, { 0.22f, 0 }, { 0.3f, 0.12f }, { 0.33f, 0.26f }, { 0.35f, 0.3f }, { 0.31f, 0.3f }, { 0.29f, 0.14f }, { 0, 0.1f } }, 20, vary(straw(), p.seed, 0.05f), X);
    m.wobble(0.012f, 18, p.seed, from);
    const uint32_t fruit[] = { 0xF2A23A, 0xE8C34A, 0xC94A2E, 0x8DB04A };
    for (int k = 0; k < 7; k++) {
        const float a = k * 2.3f, r = k == 0 ? 0.0f : 0.16f;
        m.sphere(0.075f, 10, mat(fruit[(p.seed + k) % 4], 0.45f), X * translate({ std::cos(a) * r, 0.28f + (k == 0 ? 0.06f : 0.0f), std::sin(a) * r }));
    }
    m.ground_ao(p.y, 0.2f, 0.5f, from);
}

void rug(Mesh& m, const Prop& p) {
    const Xform X = xf_at({ p.x, p.y + 0.02f, p.z }, p.yaw);
    const uint32_t base[] = { 0xB8323A, 0x2E6E8C, 0xD08A2E };
    const Material b = mat(base[p.seed % 3], 0.95f), border = mat(0xEFD9A0, 0.95f);
    m.rounded_box({ 1.7f, 0.03f, 1.1f }, 0.01f, b, X, 1);
    for (int s = -1; s <= 1; s += 2) {
        m.rounded_box({ 1.7f, 0.035f, 0.08f }, 0.01f, border, X * translate({ 0, 0, s * 0.45f }), 1);
        m.rounded_box({ 0.08f, 0.035f, 1.1f }, 0.01f, border, X * translate({ s * 0.75f, 0, 0 }), 1);
    }
    m.rounded_box({ 0.4f, 0.04f, 0.4f }, 0.01f, border, X * rotate_y(PI / 4), 1);
}

void stall(Mesh& m, const Prop& p) {
    const size_t from = m.vertices.size();
    const Xform X = xf_at({ p.x, p.y, p.z }, p.yaw);
    for (int i = -1; i <= 1; i += 2) for (int j = -1; j <= 1; j += 2) m.cylinder(0.05f, 2.1f + (j > 0 ? 0.25f : 0.0f), 8, wood(), X * translate({ i * 1.0f, 0, j * 0.6f }));
    const uint32_t stripes[] = { 0xD9503F, 0xF3E4C6, 0x2E8A8C, 0xF3E4C6 };
    for (int k = 0; k < 6; k++)
        m.rounded_box({ 0.42f, 0.05f, 1.6f }, 0.015f, mat(stripes[(k + p.seed) % 4], 0.85f, 0, 0, Material::FOLIAGE), X * translate({ -1.05f + k * 0.42f, 2.22f, 0 }) * rotate_x(0.16f), 1);
    m.rounded_box({ 2.0f, 0.8f, 0.8f }, 0.05f, wood(), X * translate({ 0, 0.4f, 0.1f }), 2);
    for (int k = 0; k < 4; k++) {
        const Xform at_k = X * translate({ -0.75f + k * 0.5f, 0.8f, 0.05f });
        if (k % 2) pot_at(m, at_k, 0.6f, p.seed + k);
        else for (int f = 0; f < 5; f++) m.sphere(0.07f, 8, mat(f % 2 ? 0xE8C34A : 0xC94A2E, 0.5f), at_k * translate({ (f % 3 - 1) * 0.09f, 0.07f + (f / 3) * 0.08f, (f % 2) * 0.08f - 0.04f }));
    }
    m.ground_ao(p.y, 0.4f, 0.45f, from);
}

void prayer_flags(Mesh& m, const Prop& p) {
    const Xform X = xf_at({ p.x, p.y, p.z }, p.yaw);
    const float span = p.scale;
    for (int s = -1; s <= 1; s += 2) m.cylinder(0.06f, 4.2f, 10, wood(), X * translate({ 0, 0, s * span }), 0.02f);
    std::vector<V3> line;
    for (int i = 0; i <= 24; i++) { const float u = i / 24.0f; line.push_back({ 0, 4.1f - 0.7f * std::sin(PI * u), -span + 2 * span * u }); }
    m.tube(line, 0.012f, 4, mat(0xE8DCC0, 0.8f), X, {}, false);
    const uint32_t colours[] = { 0x2F6DB5, 0xF4F1EA, 0xC8302E, 0x2E9A5A, 0xF2C230 };
    int k = 0;
    for (float z = -span + 0.4f; z < span - 0.3f; z += 0.42f, k++) {
        const float u = (z + span) / (2 * span), y = 4.1f - 0.7f * std::sin(PI * u);
        m.rounded_box({ 0.02f, 0.36f, 0.28f }, 0.01f, mat(colours[k % 5], 0.85f, 0, 0, Material::FOLIAGE), X * translate({ 0, y - 0.2f, z }) * rotate_z(0.08f * std::sin(k * 1.3f)), 1);
    }
}

// ---------- the landmarks ----------

void assembly_hall(Mesh& m, const Prop& p) {
    const size_t from = m.vertices.size();
    const Xform X = xf_at({ p.x, p.y, p.z }, p.yaw);
    const Material b = mat(0xB46A44, 0.88f), pillar = mat(0xC98457, 0.85f), carved = mat(0xE2C394, 0.75f);
    m.rounded_box({ ASSEMBLY_W, 0.5f, ASSEMBLY_D }, 0.08f, b, X * translate({ 0, 0.25f, 0 }), 2);
    for (int k = 0; k < 4; k++) m.rounded_box({ 2.4f - k * 0.1f, 0.12f, 0.45f }, 0.03f, vary(b, k, 0.03f, 0.9f), X * translate({ 0, 0.06f + k * 0.12f, -ASSEMBLY_D / 2 - 0.9f + k * 0.22f }), 1);
    for (int i = 0; i < 4; i++) for (int j = 0; j < 4; j++) {
        const float x = -3.0f + i * 2.0f, z = -3.0f + j * 2.0f;
        m.rounded_box({ 0.62f, 2.4f, 0.62f }, 0.08f, vary(pillar, i * 4 + j, 0.04f), X * translate({ x, 0.5f + 1.2f, z }), 2);
        for (float y : { 1.0f, 2.4f }) m.rounded_box({ 0.7f, 0.12f, 0.7f }, 0.03f, carved, X * translate({ x, 0.5f + y, z }), 1);
    }
    for (int j = 0; j < 4; j++) m.cylinder(0.1f, 7.0f, 10, wood(), X * translate({ -3.5f, 3.0f, -3.0f + j * 2.0f }) * rotate_z(-PI / 2));
    m.rounded_box({ 7.4f, 0.14f, 3.0f }, 0.04f, mat(0xA65E3C, 0.88f), X * translate({ 0, 3.15f, 2.0f }), 2);
    for (int k = 0; k < 5; k++) m.rounded_box({ 0.2f, 0.03f, 0.14f }, 0.01f, mat(0xE6DAC0, 0.7f), X * translate({ -1.0f + k * 0.5f, 0.52f, -0.4f + (k % 2) * 0.3f }) * rotate_y(k * 0.7f), 1);
    m.wobble(0.02f, 1.8f, 33, from);
    m.ground_ao(p.y, 0.5f, 0.4f, from);
}

void great_hall(Mesh& m, const Prop& p) {
    const size_t from = m.vertices.size();
    const Xform X = xf_at({ p.x, p.y, p.z }, p.yaw);
    const Material wall = mat(0xD49A6E, 0.85f), base = mat(0xB06844, 0.88f), cream_band = mat(0xF1E2C2, 0.8f);
    m.rounded_box({ HALL_W, 0.45f, HALL_D }, 0.08f, base, X * translate({ 0, 0.22f, 0 }), 2);
    m.rounded_box({ HALL_W - 1.2f, 3.4f, HALL_D - 1.6f }, 0.12f, wall, X * translate({ 0, 0.45f + 1.7f, 0.2f }), 2);
    // the frieze: a cream band with red diamonds
    m.rounded_box({ HALL_W - 1.1f, 0.4f, HALL_D - 1.5f }, 0.05f, cream_band, X * translate({ 0, 3.25f, 0.2f }), 1);
    for (int k = 0; k < 12; k++) m.rounded_box({ 0.22f, 0.22f, 0.04f }, 0.02f, mat(0xB8323A, 0.7f), X * translate({ -3.85f + k * 0.7f, 3.25f, -(HALL_D - 1.6f) / 2 + 0.2f - 0.03f }) * rotate_z(PI / 4), 1);
    // merlons along the parapet
    for (int k = 0; k < 10; k++) for (int s = -1; s <= 1; s += 2) m.rounded_box({ 0.4f, 0.35f, 0.3f }, 0.05f, wall, X * translate({ -3.9f + k * 0.87f, 4.0f, 0.2f + s * ((HALL_D - 1.6f) / 2 - 0.15f) }), 1);
    // the carved doorway on the road side, steps up to it
    const float front = -(HALL_D - 1.6f) / 2 + 0.2f;
    m.rounded_box({ 1.5f, 2.3f, 0.1f }, 0.03f, mat(0x2E1C12, 0.85f), X * translate({ 0, 0.45f + 1.15f, front - 0.02f }), 1);
    for (int s = -1; s <= 1; s += 2) m.rounded_box({ 0.28f, 2.6f, 0.24f }, 0.04f, wood(), X * translate({ s * 0.9f, 0.45f + 1.3f, front - 0.08f }), 2);
    m.rounded_box({ 2.2f, 0.32f, 0.3f }, 0.05f, wood(), X * translate({ 0, 0.45f + 2.72f, front - 0.1f }), 2);
    for (int k = 0; k < 7; k++) m.sphere(0.04f, 8, gold(), X * translate({ -0.75f + k * 0.25f, 0.45f + 2.72f, front - 0.27f }));
    for (int k = 0; k < 3; k++) m.rounded_box({ 2.4f - k * 0.3f, 0.15f, 0.4f }, 0.03f, vary(base, k, 0.03f, 0.9f), X * translate({ 0, 0.075f + k * 0.15f, -HALL_D / 2 - 0.5f + k * 0.35f }), 1);
    for (int s = -1; s <= 1; s += 2) for (int k = 0; k < 2; k++) m.rounded_box({ 0.5f, 0.7f, 0.08f }, 0.03f, mat(0x2E1C12, 0.85f), X * translate({ s * (2.0f + k * 1.4f), 2.2f, front - 0.02f }), 1);
    // a pavilion on the roof
    for (int i = -1; i <= 1; i += 2) for (int j = -1; j <= 1; j += 2) m.cylinder(0.12f, 1.5f, 12, cream_band, X * translate({ i * 1.2f, 3.85f, 0.2f + j * 1.0f }), 0.03f);
    m.rounded_box({ 3.0f, 0.2f, 2.6f }, 0.06f, wall, X * translate({ 0, 5.45f, 0.2f }), 2);
    m.wobble(0.02f, 1.6f, 44, from);
    m.ground_ao(p.y, 0.6f, 0.4f, from);
}

void dancing_girl(Mesh& m, const Prop& p) {
    const size_t from = m.vertices.size();
    const Xform X = xf_at({ p.x, p.y, p.z }, p.yaw);
    m.lathe({ { 0, 0 }, { 1.0f, 0 }, { 1.0f, 0.25f }, { 0.85f, 0.32f }, { 0.75f, 0.4f }, { 0.72f, 1.0f }, { 0.85f, 1.08f }, { 0.88f, 1.2f }, { 0, 1.2f } }, 32, sandstone(), X);
    for (float y : { 0.55f, 0.75f }) m.torus(0.735f, 0.025f, 32, 6, mat(0xC8A472, 0.7f), X * translate({ 0, y, 0 }));
    // the bronze: slender, chin up, right hand on her hip, left arm heavy with bangles
    const Xform B = X * translate({ 0, 1.2f, 0 }) * scale(1.25f);
    const Material b = bronze();
    m.capsule({ 0, 0.05f, 0.06f }, { 0.02f, 0.5f, 0.07f }, 0.045f, 12, b, B);
    m.capsule({ 0.02f, 0.5f, 0.07f }, { 0.0f, 0.86f, 0.06f }, 0.055f, 12, b, B);
    m.capsule({ 0.08f, 0.05f, -0.08f }, { 0.04f, 0.48f, -0.06f }, 0.045f, 12, b, B);
    m.capsule({ 0.04f, 0.48f, -0.06f }, { 0.0f, 0.86f, -0.06f }, 0.055f, 12, b, B);
    ellipsoid(m, { 0, 0.92f, 0 }, { 0.09f, 0.1f, 0.13f }, 16, b, B);
    ellipsoid(m, { 0, 1.1f, 0 }, { 0.08f, 0.14f, 0.12f }, 16, b, B);
    m.capsule({ 0, 1.22f, 0 }, { 0, 1.3f, 0 }, 0.035f, 10, b, B);
    ellipsoid(m, { 0.01f, 1.4f, 0 }, { 0.085f, 0.1f, 0.08f }, 18, b, B);
    ellipsoid(m, { -0.08f, 1.42f, 0 }, { 0.06f, 0.06f, 0.06f }, 12, b, B);
    // right arm to the hip; left arm down, bangled from shoulder to wrist
    m.tube({ { 0, 1.24f, 0.13f }, { -0.02f, 1.12f, 0.2f }, { 0.04f, 1.02f, 0.17f }, { 0.04f, 0.98f, 0.12f } }, 0.03f, 10, b, B);
    std::vector<V3> left = { { 0, 1.24f, -0.13f }, { 0.02f, 1.05f, -0.17f }, { 0.04f, 0.86f, -0.18f }, { 0.06f, 0.72f, -0.16f } };
    m.tube(left, 0.028f, 10, b, B);
    for (int k = 0; k < 16; k++) {
        const float u = k / 15.0f;
        const V3 c = lerp(left[0], left[3], u);
        ring(m, c, left[3] - left[0], 0.036f, 0.008f, b, B, 14);
    }
    m.sphere(0.035f, 10, b, B * translate({ 0.07f, 0.68f, -0.15f }));
    m.wobble(0.004f, 30, 5, from);
    m.ground_ao(p.y, 0.4f, 0.4f, from);
}

void flower_bed(Mesh& m, const Prop& p) {
    const size_t from = m.vertices.size();
    const Xform X = xf_at({ p.x, p.y, p.z }, p.yaw);
    m.lathe({ { 0.62f, 0 }, { 0.82f, 0 }, { 0.82f, 0.22f }, { 0.78f, 0.26f }, { 0.66f, 0.26f }, { 0.62f, 0.2f } }, 28, brick(), X);
    m.cylinder(0.64f, 0.2f, 24, mat(0x5A3A26, 0.95f), X);
    const uint32_t flowers[] = { 0xF28C1E, 0xF7C531, 0xF29BB8, 0xF4F1EA, 0xD8343E };
    for (int k = 0; k < 26; k++) {
        const float a = k * 2.39996f, r = 0.1f + 0.48f * std::sqrt((k + 0.5f) / 26);
        const V3 c = { std::cos(a) * r, 0.3f + hash01(p.seed * 31 + k) * 0.1f, std::sin(a) * r };
        ellipsoid(m, c + V3{ 0, -0.06f, 0 }, { 0.09f, 0.04f, 0.06f }, 6, leaf(), X * rotate_y(a));
        m.sphere(0.055f, 8, mat(flowers[(k + p.seed) % 5], 0.6f), X * translate(c));
    }
    m.ground_ao(p.y, 0.3f, 0.4f, from);
}

// ---------- the land ----------

struct Look { uint32_t road, ground; };
Look look(Zone z) {
    switch (z) {
        case Zone::Start: case Zone::Desert: return { 0xC99A62, 0xDDB77E };
        case Zone::LowerTown: return { 0xA87450, 0xCFA673 };
        case Zone::UpperTown: case Zone::GreatHall: return { 0xC27A55, 0xBDA46E };
        case Zone::Plaza: return { 0xC9A27A, 0xB9A06C };
        default: return { 0xB86A45, 0xC9A577 };
    }
}

/** The road's and the ground's colours at s, blended into the next zone over 15 m. */
Look colours_at(const Track& t, float s, Material& road, Material& ground) {
    const int z = static_cast<int>(t.zone(s));
    Look a = look(static_cast<Zone>(z));
    road = mat(a.road, 0.9f); ground = mat(a.ground, 0.95f);
    if (z + 1 < ZONES && s > ZONE_START[z + 1] - 15) {
        const float k = (s - (ZONE_START[z + 1] - 15)) / 15;
        const Look b = look(static_cast<Zone>(z + 1));
        const Material r2 = mat(b.road, 0.9f), g2 = mat(b.ground, 0.95f);
        road.r += (r2.r - road.r) * k; road.g += (r2.g - road.g) * k; road.b += (r2.b - road.b) * k;
        ground.r += (g2.r - ground.r) * k; ground.g += (g2.g - ground.g) * k; ground.b += (g2.b - ground.b) * k;
    }
    return a;
}

void land(Mesh& m, const Track& t, float s0, float s1) {
    // columns across: the land to the left, the road (with a sharp edge), the land to the right
    std::vector<float> cols;
    const int SIDE = 14, ROAD = 8;
    for (int k = SIDE; k >= 0; k--) cols.push_back(-(1 + std::pow(k / static_cast<float>(SIDE), 1.4f)));   // -2..-1: left land
    for (int k = 0; k <= ROAD; k++) cols.push_back(-1 + 2.0f * k / ROAD);                                    // -1..1: road
    for (int k = 0; k <= SIDE; k++) cols.push_back(1 + std::pow(k / static_cast<float>(SIDE), 1.4f));       // 1..2: right land
    const int nc = static_cast<int>(cols.size());
    std::vector<float> rows;
    for (float s = s0; s < s1; s += 0.5f) rows.push_back(s);
    rows.push_back(std::min(s1, t.length));
    const int nr = static_cast<int>(rows.size());
    std::vector<V3> pos(nr * nc);
    std::vector<float> lats(nr * nc);
    for (int r = 0; r < nr; r++) {
        const Sample p = t.at(rows[r]);
        const float hw = t.road_half(rows[r]);
        for (int c = 0; c < nc; c++) {
            const float u = cols[c];
            float lat;
            if (u < -1.0001f) lat = -(hw + 0.25f + (p.left - hw - 0.25f) * (-u - 1));
            else if (u > 1.0001f) lat = hw + 0.25f + (p.right - hw - 0.25f) * (u - 1);
            else lat = hw * u;
            const float x = p.x - p.tz * lat, z = p.z + p.tx * lat;
            pos[r * nc + c] = { x, t.ground(rows[r], lat, x, z), z };
            lats[r * nc + c] = lat;
        }
    }
    const uint32_t base = static_cast<uint32_t>(m.vertices.size());
    for (int r = 0; r < nr; r++) {
        Material road, ground;
        colours_at(t, rows[r], road, ground);
        const float hw = t.road_half(rows[r]), elev = t.elevation(rows[r]);
        const bool desert = t.zone(rows[r]) == Zone::Start || t.zone(rows[r]) == Zone::Desert;
        for (int c = 0; c < nc; c++) {
            const V3 a = pos[r * nc + std::max(0, c - 1)], b = pos[r * nc + std::min(nc - 1, c + 1)];
            const V3 d = pos[std::max(0, r - 1) * nc + c], e = pos[std::min(nr - 1, r + 1) * nc + c];
            V3 n = normalize(cross(b - a, d - e));
            if (n.y < 0) n = -n;
            const V3 q = pos[r * nc + c];
            const float lat = std::fabs(lats[r * nc + c]);
            const float big = noise3({ q.x * 0.12f, 0, q.z * 0.12f }, 3), fine = noise3({ q.x * 1.9f, 0, q.z * 1.9f }, 4);
            Material col = lat <= hw + 0.01f ? road : ground;
            if (lat <= hw + 0.01f) {
                const float rut = std::min(std::fabs(lat - hw * 0.45f) / 0.22f, 1.0f), k = 0.88f + 0.12f * rut;
                col.r *= k; col.g *= k; col.b *= k;
            } else {
                const float trodden = std::min(1.0f, (lat - hw) / 1.5f), k = 0.93f + 0.07f * trodden;
                col.r *= k; col.g *= k; col.b *= k;
                if (desert) { const float crest = std::min(1.0f, (q.y - elev) / 1.6f); col.r += crest * 0.04f; col.g += crest * 0.04f; col.b += crest * 0.05f; }
            }
            const float v = 1 + big * 0.06f + fine * (desert ? 0.03f : 0.05f);
            col.r *= v; col.g *= v; col.b *= v;
            m.add(q, n, col);
        }
    }
    for (int r = 0; r + 1 < nr; r++) for (int c = 0; c + 1 < nc; c++) {
        const uint32_t a = base + r * nc + c, b = a + 1, cc = a + nc, d = cc + 1;
        m.tri(a, cc, b); m.tri(b, cc, d);
    }

    // the cut edges: earth strata down to a dark base, a soft lip at the top
    const float levels[] = { 0, -0.12f, -0.6f, -1.2f, -1.8f, -2.45f, -3.05f, -3.3f };
    const uint32_t strata[] = { 0xE6C48E, 0xD9AE74, 0xC48E5A, 0xA8693F, 0x8A5434, 0x6E4A3A, 0x55413A, 0x3A2E2A };
    const int L = 8;
    const auto wall = [&](int col, float side) {
        const uint32_t w = static_cast<uint32_t>(m.vertices.size());
        for (int r = 0; r < nr; r++) {
            const Sample p = t.at(rows[r]);
            const V3 top = pos[r * nc + col], out = V3{ -p.tz, 0, p.tx } * side;
            const float elev = t.elevation(rows[r]);
            for (int l = 0; l < L; l++) {
                float y = l == 0 ? top.y : elev + levels[l] + (l < L - 1 ? 0.13f * noise3({ top.x * 0.25f, l * 3.1f, top.z * 0.25f }, 8) : 0);
                if (l == 1) y = top.y - 0.12f;
                y = std::min(y, l == 0 ? top.y : top.y - 0.05f * l);
                const V3 normal = l == 0 ? normalize(out + V3{ 0, 1.2f, 0 }) : l == L - 1 ? normalize(out + V3{ 0, -1, 0 }) : out;
                Material c = mat(strata[l], 0.95f);
                const float v = 1 + 0.06f * noise3({ top.x * 0.8f, l * 1.0f, top.z * 0.8f }, 9);
                c.r *= v; c.g *= v; c.b *= v;
                m.add(top - out * (l == 0 ? 0.04f : 0.0f) + V3{ 0, y - top.y, 0 }, normal, c, l >= L - 2 ? 0.7f : 1.0f);
            }
        }
        for (int r = 0; r + 1 < nr; r++) for (int l = 0; l < L - 1; l++) {
            const uint32_t a = w + r * L + l, b = a + 1, c = a + L, d = c + 1;
            m.tri(a, b, c); m.tri(b, d, c);
        }
    };
    wall(0, -1);
    wall(nc - 1, 1);
    // the underside, and the ends of the ribbon
    const uint32_t under = static_cast<uint32_t>(m.vertices.size());
    for (int r = 0; r < nr; r++) for (int c : { 0, nc - 1 }) {
        const V3 q = pos[r * nc + c];
        m.add({ q.x, t.elevation(rows[r]) - 3.3f, q.z }, { 0, -1, 0 }, mat(0x2E2420, 1.0f));
    }
    for (int r = 0; r + 1 < nr; r++) { const uint32_t a = under + r * 2; m.tri(a, a + 1, a + 2); m.tri(a + 1, a + 3, a + 2); }
    for (int end = 0; end < 2; end++) {
        const int r = end == 0 ? 0 : nr - 1;
        if ((end == 0 && rows[r] > 0.01f) || (end == 1 && rows[r] < t.length - 0.01f)) continue;
        const Sample p = t.at(rows[r]);
        const V3 out = V3{ p.tx, 0, p.tz } * (end == 0 ? -1.0f : 1.0f);
        const uint32_t e = static_cast<uint32_t>(m.vertices.size());
        for (int c = 0; c < nc; c++) {
            const V3 q = pos[r * nc + c];
            m.add(q, normalize(out + V3{ 0, 0.8f, 0 }), mat(strata[0], 0.95f));
            m.add({ q.x, t.elevation(rows[r]) - 3.3f, q.z }, out, mat(strata[L - 2], 0.95f), 0.7f);
        }
        for (int c = 0; c + 1 < nc; c++) { const uint32_t a = e + c * 2; m.tri(a, a + 1, a + 2); m.tri(a + 1, a + 3, a + 2); }
    }
}

void kerbs_and_potholes(Mesh& m, const Track& t, float s0, float s1) {
    const Material red = mat(0xA4462E, 0.85f), pale = mat(0xEFE2C6, 0.8f);
    int k = static_cast<int>(s0 / 0.9f);
    for (float s = std::ceil(s0 / 0.9f) * 0.9f; s < s1; s += 0.9f, k++) {
        const Zone z = t.zone(s);
        if (z == Zone::Start || z == Zone::Desert || s > ROAD_END - 40) continue;
        const Sample p = t.at(s);
        const float yaw = std::atan2(-p.tz, p.tx), hw = t.road_half(s), y = t.elevation(s);
        for (int side = -1; side <= 1; side += 2) {
            const float off = side * (hw + 0.1f);
            m.rounded_box({ 0.86f, 0.12f, 0.2f }, 0.035f, (k % 2) ? red : pale, xf_at({ p.x - p.tz * off, y + 0.04f, p.z + p.tx * off }, yaw), 1);
        }
    }
    for (const Pothole& h : t.potholes) {
        if (h.s < s0 || h.s >= s1) continue;
        const float y = t.elevation(h.s);
        m.lathe({ { 0, 0.004f }, { h.r * 0.7f, 0.004f }, { h.r * 0.95f, 0.02f }, { h.r * 1.15f, 0.012f }, { h.r * 1.2f, 0.0f } }, 20, mat(0x4E3324, 0.95f), translate({ h.x, y, h.z }) * scale({ 1, 1, 0.8f }));
        for (int i = 0; i < 4; i++) {
            const float a = i * 1.7f + h.s;
            ellipsoid(m, { h.x + std::cos(a) * h.r * 1.2f, y + 0.02f, h.z + std::sin(a) * h.r }, { 0.07f, 0.04f, 0.06f }, 8, mat(0x9C8A78, 0.9f));
        }
    }
}

} // namespace

// ---------- the chariot ----------

Mesh build_chariot() {
    Mesh m;
    const Material g = gold(), gd = gold_dark();
    m.rounded_box({ 1.45f, 0.12f, 0.92f }, 0.04f, wood_dark(), translate({ 0.08f, 0.4f, 0 }), 2);
    m.cylinder(0.05f, 1.62f, 16, wood_dark(), translate({ WHEEL_AT.x, WHEEL_AT.y, -0.81f }) * rotate_x(PI / 2));
    // the bowl: an oval lathe, its lip rolled, with a raised cream band studded with gold and gems
    const Xform bowl = translate({ 0.1f, 0, 0 }) * scale({ 1.2f, 1, 0.78f });
    m.lathe({ { 0, 0.42f }, { 0.42f, 0.42f }, { 0.56f, 0.47f }, { 0.64f, 0.6f }, { 0.67f, 0.78f }, { 0.65f, 0.95f }, { 0.62f, 1.02f }, { 0.66f, 1.05f }, { 0.665f, 1.09f },
              { 0.61f, 1.105f }, { 0.57f, 1.06f }, { 0.55f, 0.8f }, { 0.4f, 0.66f }, { 0, 0.64f } }, 48, g, bowl);
    m.lathe({ { 0.655f, 0.62f }, { 0.68f, 0.635f }, { 0.692f, 0.74f }, { 0.68f, 0.845f }, { 0.655f, 0.86f } }, 48, cream(), bowl);
    for (float y : { 0.6f, 0.88f }) m.torus(0.675f, 0.02f, 48, 8, gd, bowl * translate({ 0, y, 0 }));
    for (int i = 0; i < 28; i++) {
        const float a = 2 * PI * i / 28;
        const V3 c = { 0.1f + 0.7f * 1.2f * std::cos(a), 0.74f, 0.7f * 0.78f * std::sin(a) };
        if (std::fabs(std::sin(a)) > 0.93f) continue;   // the wheels cover the sides
        if (i % 4 == 0) ellipsoid(m, c, { 0.042f, 0.042f, 0.042f }, 12, i % 8 == 0 ? ruby() : emerald());
        else m.sphere(0.024f, 10, g, translate(c));
    }
    // a sun medallion on the front
    m.lathe({ { 0, 0 }, { 0.13f, 0 }, { 0.15f, 0.02f }, { 0.12f, 0.04f }, { 0.05f, 0.06f }, { 0, 0.065f } }, 28, g, translate({ 0.93f, 0.74f, 0 }) * rotate_z(-PI / 2));
    for (int i = 0; i < 12; i++) {
        const float a = 2 * PI * i / 12;
        m.capsule({ 0.935f, 0.74f + std::cos(a) * 0.16f, std::sin(a) * 0.16f }, { 0.925f, 0.74f + std::cos(a) * 0.22f, std::sin(a) * 0.22f }, 0.014f, 8, gd);
    }
    ellipsoid(m, { 0.995f, 0.74f, 0 }, { 0.03f, 0.04f, 0.04f }, 12, ruby());
    // the prow: a golden stem curling into a spiral
    {
        std::vector<V3> path;
        for (int i = 0; i <= 10; i++) { const float u = i / 10.0f; path.push_back({ 0.86f + 0.18f * u, 0.48f + 0.49f * u * u * 0.6f + 0.2f * u, 0 }); }
        const V3 c = { 0.93f, 1.0f, 0 };
        for (int i = 1; i <= 26; i++) {
            const float a = 2.3f * PI * i / 26, r = 0.11f * (1 - 0.75f * i / 26.0f);
            path.push_back({ c.x + std::cos(a) * r, c.y + std::sin(a) * r, 0 });
        }
        taper(m, path, 0.055f, 0.018f, 12, g);
    }
    // the back: a panel, cushions, pillars with onion domes and a central spire
    m.rounded_box({ 0.12f, 0.62f, 0.86f }, 0.05f, gd, translate({ -0.7f, 1.28f, 0 }), 3);
    m.rounded_box({ 0.13f, 0.4f, 0.6f }, 0.04f, cream(), translate({ -0.69f, 1.3f, 0 }), 2);
    m.rounded_box({ 0.24f, 0.14f, 0.62f }, 0.06f, teal_velvet(), translate({ -0.56f, 1.12f, 0 }), 3);
    m.rounded_box({ 0.2f, 0.12f, 0.5f }, 0.05f, mat(0xB8323A, 0.85f), translate({ -0.58f, 1.24f, 0 }), 3);
    for (int s = -1; s <= 1; s += 2) {
        m.cylinder(0.035f, 0.55f, 12, g, translate({ -0.72f, 1.02f, s * 0.42f }));
        onion(m, { -0.72f, 1.57f, s * 0.42f }, 0.11f, 0.24f, g);
        kalash(m, { -0.72f, 1.8f, s * 0.42f }, 0.06f, gd);
    }
    m.cylinder(0.12f, 0.1f, 20, gd, translate({ -0.74f, 1.59f, 0 }), 0.02f);
    onion(m, { -0.74f, 1.69f, 0 }, 0.16f, 0.34f, g);
    kalash(m, { -0.74f, 2.02f, 0 }, 0.09f, gd);
    // the gong, hung on the right
    m.tube({ { -0.72f, 1.5f, 0.44f }, { -0.68f, 1.56f, 0.6f }, { -0.62f, 1.5f, 0.66f } }, 0.015f, 8, gd);
    m.cylinder(0.15f, 0.025f, 32, g, translate({ -0.6f, 1.3f, 0.64f }) * rotate_x(PI / 2), 0.008f);
    m.sphere(0.04f, 12, gd, translate({ -0.6f, 1.3f, 0.68f }));
    return m;
}

Mesh build_wheel(float R) {
    Mesh m;
    const float k = R / WHEEL_RADIUS;
    const int seg = std::max(20, static_cast<int>(64 * k * k)), sides = k > 0.9f ? 12 : 6;
    const Xform face = rotate_x(PI / 2);   // tori are built flat in XZ: stand them up in XY
    m.torus(R - 0.04f * k, 0.05f * k, seg, sides, wood(), face);
    for (int s = -1; s <= 1; s += 2) m.torus(R - 0.045f * k, 0.022f * k, seg, sides * 2 / 3, gold(), translate({ 0, 0, s * 0.045f * k }) * face);
    m.torus(R - 0.11f * k, 0.03f * k, seg * 3 / 4, sides * 2 / 3, wood_dark(), face);
    const int spokes = 12;
    const float len = R - 0.2f * k;
    for (int i = 0; i < spokes; i++) {
        const float a = 2 * PI * i / spokes;
        m.lathe({ { 0, 0 }, { 0.024f * k, 0 }, { 0.028f * k, len * 0.15f }, { 0.018f * k, len * 0.5f }, { 0.024f * k, len * 0.92f }, { 0.02f * k, len }, { 0, len } }, k > 0.9f ? 8 : 5, wood(), rotate_z(a) * translate({ 0, 0.1f * k, 0 }));
    }
    const Profile hub = { { 0, -0.1f }, { 0.09f, -0.1f }, { 0.12f, -0.06f }, { 0.13f, 0.0f }, { 0.12f, 0.05f }, { 0.09f, 0.1f }, { 0.05f, 0.14f }, { 0.02f, 0.18f }, { 0, 0.19f } };
    Profile h;
    for (auto [r, y] : hub) h.push_back({ r * k, y * k });
    m.lathe(h, k > 0.9f ? 24 : 12, gold(), rotate_x(PI / 2));
    m.torus(0.13f * k, 0.018f * k, k > 0.9f ? 24 : 12, 6, gold_dark(), face);
    return m;
}

// ---------- the charioteer ----------

namespace {

constexpr V3 HEAD{ 0.02f, 1.79f, 0 };
constexpr V3 HEAD_R{ 0.27f, 0.28f, 0.26f };

/** The point on the head's surface in front of (y, z), pushed out by `lift`. */
V3 on_face(float y, float z, float lift) {
    const float dy = (y - HEAD.y) / HEAD_R.y, dz = z / HEAD_R.z;
    return { HEAD.x + HEAD_R.x * std::sqrt(std::max(0.0f, 1 - dy * dy - dz * dz)) + lift, y, z };
}

void arm(Mesh& m, V3 shoulder, V3 elbow, V3 hand, float side) {
    const Material s = skin();
    taper(m, { shoulder, lerp(shoulder, elbow, 0.5f), elbow }, 0.052f, 0.044f, 14, s);
    m.sphere(0.044f, 14, s, translate(elbow));
    taper(m, { elbow, lerp(elbow, hand, 0.5f), hand }, 0.043f, 0.034f, 14, s);
    ellipsoid(m, hand + normalize(hand - elbow) * 0.03f, { 0.05f, 0.042f, 0.038f }, 14, s);
    m.capsule(hand + V3{ 0, 0.02f, side * 0.03f }, hand + V3{ 0.04f, 0.04f, side * 0.035f }, 0.014f, 8, s);
    const V3 d = normalize(hand - elbow);
    for (int k = 0; k < 3; k++) ring(m, hand - d * (0.03f + k * 0.022f), d, 0.04f, 0.008f, k == 1 ? ruby() : gold());
    const V3 u = normalize(elbow - shoulder);
    ring(m, lerp(shoulder, elbow, 0.55f), u, 0.055f, 0.012f, gold());
}

} // namespace

Mesh build_rider() {
    Mesh m;
    const Material s = skin(), g = gold(), gc = gold_cloth(), t = teal(), hr = hair();
    // lehenga, waist, belt
    m.lathe({ { 0, 0.62f }, { 0.36f, 0.62f }, { 0.37f, 0.7f }, { 0.31f, 0.9f }, { 0.22f, 1.05f }, { 0.19f, 1.12f }, { 0, 1.12f } }, 32, gc, scale({ 0.9f, 1, 1.05f }));
    ellipsoid(m, { 0.01f, 1.15f, 0 }, { 0.15f, 0.08f, 0.18f }, 24, s);
    m.torus(0.175f, 0.018f, 32, 8, g, translate({ 0.01f, 1.11f, 0 }) * scale({ 0.88f, 1, 1.05f }));
    for (int i = -2; i <= 2; i++) {   // little chains hanging from the belt
        const float z = i * 0.06f;
        m.tube({ { 0.155f, 1.1f, z }, { 0.165f, 1.04f, z * 1.05f }, { 0.17f, 0.99f, z * 1.08f } }, 0.006f, 6, g);
        m.sphere(0.014f, 8, i == 0 ? ruby() : g, translate({ 0.17f, 0.98f, z * 1.08f }));
    }
    // blouse with gold borders and puffed sleeves
    ellipsoid(m, { 0.0f, 1.31f, 0 }, { 0.17f, 0.16f, 0.23f }, 32, t);
    m.torus(0.2f, 0.018f, 32, 8, g, translate({ 0.0f, 1.21f, 0 }) * scale({ 0.82f, 1, 1.12f }));
    for (int sd = -1; sd <= 1; sd += 2) {
        ellipsoid(m, { -0.01f, 1.37f, sd * 0.245f }, { 0.085f, 0.08f, 0.085f }, 20, t);
        ring(m, { 0.0f, 1.31f, sd * 0.262f }, { 0.25f, -1, sd * 0.4f }, 0.062f, 0.012f, g);
    }
    // neck and jewellery
    m.cylinder(0.066f, 0.22f, 20, s, translate({ 0.01f, 1.4f, 0 }));
    m.torus(0.088f, 0.016f, 28, 8, g, translate({ 0.02f, 1.47f, 0 }) * rotate_z(-0.4f));
    ellipsoid(m, { 0.115f, 1.4f, 0 }, { 0.02f, 0.035f, 0.025f }, 12, g);
    ellipsoid(m, { 0.13f, 1.4f, 0 }, { 0.012f, 0.018f, 0.014f }, 10, ruby());
    {
        std::vector<V3> chain;
        for (int i = 0; i <= 16; i++) { const float u = -1 + 2 * i / 16.0f; chain.push_back({ 0.178f - 0.12f * u * u, 1.29f + 0.17f * u * u, 0.13f * u }); }
        m.tube(chain, 0.011f, 8, g);
        ellipsoid(m, { 0.183f, 1.275f, 0 }, { 0.016f, 0.03f, 0.024f }, 12, emerald());
    }
    // the head: cheeks, chin and a button nose under the skin's surface
    ellipsoid(m, HEAD, HEAD_R, 40, s);
    for (int sd = -1; sd <= 1; sd += 2) m.sphere(0.085f, 20, blush(), translate({ 0.19f, 1.71f, sd * 0.125f }));
    m.sphere(0.1f, 20, s, translate({ 0.17f, 1.6f, 0 }));
    ellipsoid(m, { 0.286f, 1.745f, 0 }, { 0.036f, 0.04f, 0.036f }, 16, s);
    {   // a smile
        std::vector<V3> smile;
        for (int i = 0; i <= 10; i++) { const float u = -1 + 2 * i / 10.0f; smile.push_back(on_face(1.664f + 0.02f * u * u, 0.066f * u, 0.006f)); }
        m.tube(smile, 0.011f, 8, lip());
        ellipsoid(m, on_face(1.652f, 0, 0.004f), { 0.014f, 0.012f, 0.032f }, 12, lip());
    }
    // eyes (the irises and lids are separate), brows, bindi
    for (int sd = -1; sd <= 1; sd += 2) {
        m.sphere(EYE_RADIUS, 28, mat(0xF8F4EE, 0.12f, 0, 0, Material::EYE), translate({ EYE_AT.x, EYE_AT.y, sd * EYE_AT.z }));
        std::vector<V3> brow;
        for (int i = 0; i <= 8; i++) { const float u = -1 + 2 * i / 8.0f; brow.push_back(on_face(1.905f + 0.022f * (1 - u * u) - 0.006f * u, sd * (0.105f + 0.062f * u), 0.004f)); }
        taper(m, brow, 0.013f, 0.006f, 8, hr);
        // the lower lid's kohl line, round the bottom of the eyeball
        std::vector<V3> lower;
        for (int i = 0; i <= 10; i++) {
            const float az = -0.85f + 1.7f * i / 10.0f, el = -0.55f;
            lower.push_back({ EYE_AT.x + EYE_RADIUS * 1.03f * std::cos(el) * std::cos(az), EYE_AT.y + EYE_RADIUS * 1.03f * std::sin(el), sd * (EYE_AT.z + EYE_RADIUS * 1.03f * std::cos(el) * std::sin(az)) });
        }
        m.tube(lower, 0.004f, 6, kohl());
    }
    m.sphere(0.014f, 10, ruby(), translate(on_face(1.925f, 0, 0.004f)));
    // hair: a smooth cap, centre-parted, a lock framing each cheek, a long braid down the back
    m.sphere(0.285f, 40, hr, translate({ -0.05f, 1.83f, 0 }));
    for (int k = 0; k < 9; k++) {   // strands for a glossy, combed look
        const float zz = (k - 4) * 0.055f;
        std::vector<V3> strand;
        for (int i = 0; i <= 10; i++) {
            const float a = 0.25f + 2.2f * i / 10.0f;   // from the parting over the top to the back
            const float r = 0.288f;
            strand.push_back({ -0.05f + std::cos(a) * r * std::sqrt(std::max(0.05f, 1 - (zz / r) * (zz / r))), 1.83f + std::sin(a) * r * std::sqrt(std::max(0.05f, 1 - (zz / r) * (zz / r))), zz });
        }
        m.tube(strand, 0.012f, 6, mat(0x2A1E1A, 0.3f), {}, {}, false);
    }
    for (int sd = -1; sd <= 1; sd += 2) taper(m, { { 0.13f, 1.97f, sd * 0.19f }, { 0.17f, 1.85f, sd * 0.255f }, { 0.12f, 1.7f, sd * 0.27f }, { 0.07f, 1.58f, sd * 0.26f } }, 0.042f, 0.022f, 12, hr);
    ellipsoid(m, { -0.26f, 1.76f, 0 }, { 0.12f, 0.12f, 0.12f }, 24, hr);
    for (int i = 0; i < 12; i++) {
        const float r = 0.07f - 0.0028f * i;
        ellipsoid(m, { -0.31f + 0.008f * i, 1.68f - 0.062f * i, (i % 2 ? 0.026f : -0.026f) }, { r, r * 0.85f, r }, 16, hr);
        if (i == 4 || i == 9) ring(m, { -0.31f + 0.008f * i, 1.68f - 0.062f * i + 0.03f, 0 }, { 0, 1, 0 }, r * 0.95f, 0.01f, g);
    }
    m.lathe({ { 0, 0 }, { 0.03f, 0.01f }, { 0.045f, 0.05f }, { 0.04f, 0.08f }, { 0, 0.08f } }, 12, g, translate({ -0.22f, 0.86f, 0 }));
    m.sphere(0.035f, 12, mat(0xC8303E, 0.8f), translate({ -0.22f, 0.83f, 0 }));
    // maang tikka along the parting, a jewel on top, jhumkas
    {
        std::vector<V3> chain;
        for (int i = 0; i <= 8; i++) { const float a = 1.65f - 1.0f * i / 8.0f; chain.push_back({ -0.05f + std::cos(a) * 0.292f, 1.83f + std::sin(a) * 0.292f, 0 }); }
        m.tube(chain, 0.008f, 6, g);
        m.lathe({ { 0, 0 }, { 0.03f, 0 }, { 0.034f, 0.01f }, { 0.025f, 0.018f }, { 0, 0.02f } }, 20, g, translate(on_face(1.968f, 0, -0.004f)) * rotate_z(-PI / 2 + 0.5f));
        ellipsoid(m, on_face(1.968f, 0, 0.016f), { 0.008f, 0.014f, 0.014f }, 10, ruby());
        m.sphere(0.012f, 10, mat(0xF4EEE6, 0.2f), translate(on_face(1.935f, 0, 0.012f)));
    }
    m.lathe({ { 0, 0 }, { 0.05f, 0.01f }, { 0.055f, 0.04f }, { 0.03f, 0.08f }, { 0.012f, 0.11f }, { 0, 0.14f } }, 16, g, translate({ -0.05f, 2.1f, 0 }));
    m.sphere(0.02f, 10, ruby(), translate({ -0.05f, 2.25f, 0 }));
    for (int sd = -1; sd <= 1; sd += 2) {
        const V3 ear = { -0.0f, 1.67f, sd * 0.272f };
        m.sphere(0.016f, 10, g, translate(ear));
        m.cylinder(0.005f, 0.04f, 6, g, translate(ear + V3{ 0, -0.05f, 0 }));
        m.lathe({ { 0, 0.06f }, { 0.02f, 0.058f }, { 0.035f, 0.04f }, { 0.046f, 0.01f }, { 0.05f, 0 }, { 0.045f, -0.004f }, { 0, -0.004f } }, 16, g, translate(ear + V3{ 0, -0.12f, 0 }));
        for (int i = 0; i < 6; i++) { const float a = i * PI / 3; m.sphere(0.008f, 6, mat(0xF4EEE6, 0.2f), translate(ear + V3{ std::cos(a) * 0.048f, -0.13f, std::sin(a) * 0.048f })); }
    }
    // arms: the right holds a golden staff, the left rests on the rim
    arm(m, { -0.01f, 1.38f, 0.255f }, { 0.07f, 1.17f, 0.31f }, { 0.24f, 1.2f, 0.29f }, 1);
    arm(m, { -0.01f, 1.38f, -0.255f }, { 0.09f, 1.17f, -0.3f }, { 0.31f, 1.12f, -0.22f }, -1);
    m.cylinder(0.018f, 1.5f, 10, g, translate({ 0.265f, 0.78f, 0.295f }) * align_y({ 0.05f, 1, 0.01f }));
    for (float y : { 1.0f, 1.45f, 1.8f }) m.torus(0.026f, 0.008f, 14, 6, gold_dark(), translate({ 0.265f + 0.05f * (y - 0.78f), y, 0.296f }));
    kalash(m, { 0.34f, 2.27f, 0.31f }, 0.07f, g);
    return m;
}

Mesh build_iris() {
    Mesh m;
    ellipsoid(m, { 0.062f, 0, 0 }, { 0.016f, 0.042f, 0.042f }, 24, mat(0x6B3A1C, 0.15f, 0, 0, Material::EYE));
    m.torus(0.04f, 0.004f, 24, 4, mat(0x2A160C, 0.2f, 0, 0, Material::EYE), translate({ 0.064f, 0, 0 }) * rotate_z(PI / 2));
    ellipsoid(m, { 0.071f, 0, 0 }, { 0.008f, 0.022f, 0.022f }, 16, mat(0x070404, 0.1f, 0, 0, Material::EYE));
    m.sphere(0.011f, 10, mat(0xFFFFFF, 0.1f, 0, 1.0f), translate({ 0.077f, 0.022f, -0.016f }));
    m.sphere(0.006f, 8, mat(0xFFFFFF, 0.1f, 0, 0.8f), translate({ 0.078f, -0.018f, 0.014f }));
    return m;
}

Mesh build_lid() {
    Mesh m;
    const float r = EYE_RADIUS * 1.09f;
    Profile cap;
    for (int i = 0; i <= 8; i++) { const float a = PI / 2 * i / 8; cap.push_back({ std::cos(a) * r, std::sin(a) * r }); }
    cap.back().first = 0;
    m.lathe(cap, 28, skin(), {});
    m.torus(r, 0.008f, 32, 6, kohl());
    return m;
}

Mesh build_pot() {
    Mesh m;
    pot_at(m, {}, 1.0f, 3);
    return m;
}

Mesh build_shard() {
    Mesh m;
    m.rounded_box({ 0.12f, 0.03f, 0.09f }, 0.012f, terracotta(), {}, 1);
    return m;
}

Mesh build_puff() {
    Mesh m;
    m.sphere(1, 12, mat(0xFFFFFF, 1.0f));
    return m;
}

Mesh build_guide() {
    Mesh m;
    const Material robe = mat(0xEFE6D2, 0.85f), old_skin = mat(0xA86A45, 0.55f, 0, 0, Material::SKIN), white = mat(0xF1EEE8, 0.85f);
    m.lathe({ { 0, 0 }, { 0.34f, 0 }, { 0.33f, 0.1f }, { 0.28f, 0.6f }, { 0.24f, 1.05f }, { 0.25f, 1.3f }, { 0.2f, 1.4f }, { 0, 1.42f } }, 28, robe);
    m.wobble(0.012f, 6, 7);
    m.tube({ { 0.0f, 1.4f, -0.2f }, { 0.18f, 1.2f, -0.12f }, { 0.25f, 0.9f, 0.05f }, { 0.2f, 0.62f, 0.2f } }, 0.06f, 10, saffron());
    m.tube({ { -0.02f, 1.38f, -0.22f }, { -0.15f, 1.15f, -0.27f }, { -0.18f, 0.8f, -0.25f } }, 0.055f, 10, saffron());
    for (int s = -1; s <= 1; s += 2) m.tube({ { 0, 1.32f, s * 0.24f }, { 0.08f, 1.08f, s * 0.29f }, { 0.25f, 1.0f, s * 0.14f } }, 0.055f, 10, robe);
    for (int s = -1; s <= 1; s += 2) ellipsoid(m, { 0.29f, 1.0f, s * 0.09f }, { 0.05f, 0.045f, 0.05f }, 10, old_skin);
    m.cylinder(0.04f, 0.42f, 14, mat(0xF0E4C8, 0.7f), translate({ 0.32f, 1.02f, -0.21f }) * rotate_x(PI / 2));
    for (int s = -1; s <= 1; s += 2) m.cylinder(0.05f, 0.03f, 12, wood_dark(), translate({ 0.32f, 1.02f, s * 0.22f }) * rotate_x(PI / 2));
    m.cylinder(0.05f, 0.14f, 14, old_skin, translate({ 0, 1.4f, 0 }));
    ellipsoid(m, { 0.02f, 1.66f, 0 }, { 0.17f, 0.2f, 0.16f }, 28, old_skin);
    ellipsoid(m, { 0.17f, 1.64f, 0 }, { 0.035f, 0.045f, 0.035f }, 12, old_skin);
    for (int s = -1; s <= 1; s += 2) {
        m.sphere(0.03f, 14, mat(0xF8F4EE, 0.12f, 0, 0, Material::EYE), translate({ 0.15f, 1.7f, s * 0.06f }));
        m.sphere(0.017f, 10, mat(0x2A1A10, 0.15f, 0, 0, Material::EYE), translate({ 0.175f, 1.7f, s * 0.06f }));
        m.sphere(0.006f, 6, mat(0xFFFFFF, 0.1f, 0, 1.0f), translate({ 0.19f, 1.71f, s * 0.055f }));
        m.tube({ { 0.16f, 1.75f, s * 0.025f }, { 0.17f, 1.765f, s * 0.06f }, { 0.155f, 1.755f, s * 0.1f } }, 0.014f, 6, white);
        ellipsoid(m, { 0.0f, 1.66f, s * 0.165f }, { 0.03f, 0.05f, 0.02f }, 10, old_skin);
    }
    // a big white beard and moustache
    ellipsoid(m, { 0.1f, 1.5f, 0 }, { 0.12f, 0.15f, 0.13f }, 20, white);
    ellipsoid(m, { 0.13f, 1.4f, 0 }, { 0.07f, 0.1f, 0.08f }, 16, white);
    for (int s = -1; s <= 1; s += 2) m.tube({ { 0.18f, 1.6f, 0 }, { 0.19f, 1.585f, s * 0.05f }, { 0.17f, 1.56f, s * 0.09f } }, 0.018f, 8, white);
    m.tube({ { 0.185f, 1.78f, -0.02f }, { 0.19f, 1.8f, 0 }, { 0.185f, 1.78f, 0.02f } }, 0.008f, 6, mat(0xC8302E, 0.6f));
    // the turban: wound saffron and red, a jewel at the front
    for (int k = 0; k < 4; k++) m.torus(0.15f - k * 0.015f, 0.05f, 28, 10, k % 2 ? mat(0xC8302E, 0.8f) : saffron(), translate({ 0.0f, 1.8f + k * 0.05f, 0 }) * rotate_z(-0.12f));
    m.sphere(0.12f, 20, saffron(), translate({ -0.01f, 1.88f, 0 }));
    m.sphere(0.03f, 10, ruby(), translate({ 0.16f, 1.86f, 0 }));
    m.capsule({ 0.16f, 1.87f, 0 }, { 0.14f, 2.0f, 0 }, 0.015f, 8, gold());
    // a staff
    m.cylinder(0.025f, 1.9f, 10, wood(), translate({ 0.15f, 0, 0.36f }) * align_y({ 0.05f, 1, -0.03f }));
    m.ground_ao(0, 0.4f, 0.4f);
    return m;
}

Mesh build_artifact(ArtifactKind kind) {
    Mesh m;
    switch (kind) {
        case ArtifactKind::Seal: {
            m.rounded_box({ 0.34f, 0.34f, 0.09f }, 0.03f, mat(0xE9DCC0, 0.5f), {}, 2);
            const Material relief = mat(0xCDB894, 0.55f);
            ellipsoid(m, { -0.02f, -0.03f, 0.05f }, { 0.1f, 0.05f, 0.02f }, 12, relief);
            ellipsoid(m, { 0.09f, 0.03f, 0.05f }, { 0.035f, 0.03f, 0.02f }, 10, relief);
            m.capsule({ 0.11f, 0.05f, 0.05f }, { 0.15f, 0.11f, 0.05f }, 0.008f, 6, relief);
            for (int s = -1; s <= 1; s += 2) m.capsule({ s * 0.06f, -0.06f, 0.05f }, { s * 0.06f, -0.12f, 0.05f }, 0.012f, 6, relief);
            for (int k = 0; k < 4; k++) m.rounded_box({ 0.02f, 0.05f, 0.02f }, 0.005f, relief, translate({ -0.1f + k * 0.06f, 0.12f, 0.05f }), 1);
            m.sphere(0.05f, 10, mat(0xE9DCC0, 0.5f), translate({ 0, 0, -0.06f }));
            break;
        }
        case ArtifactKind::Shard: {
            m.rounded_box({ 0.32f, 0.22f, 0.04f }, 0.015f, terracotta(), rotate_z(0.3f), 2);
            m.rounded_box({ 0.33f, 0.035f, 0.045f }, 0.01f, mat(0x241410, 0.8f), rotate_z(0.3f) * translate({ 0, 0.03f, 0 }), 1);
            for (int k = 0; k < 3; k++) m.sphere(0.018f, 8, mat(0x241410, 0.8f), rotate_z(0.3f) * translate({ -0.08f + k * 0.08f, -0.05f, 0.02f }));
            break;
        }
        case ArtifactKind::Beads: {
            for (int k = 0; k < 11; k++) {
                const float a = 2 * PI * k / 11;
                ellipsoid(m, { std::cos(a) * 0.15f, std::sin(a) * 0.15f, 0 }, { 0.035f, 0.03f, 0.03f }, 10, mat(k % 3 ? 0xC2410C : 0xF0D9A8, 0.25f), rotate_z(a));
            }
            m.torus(0.15f, 0.005f, 32, 4, mat(0x8A6A4A, 0.8f), rotate_x(PI / 2));
            break;
        }
        case ArtifactKind::Figurine: {
            m.lathe({ { 0, -0.18f }, { 0.07f, -0.18f }, { 0.05f, -0.05f }, { 0.07f, 0.04f }, { 0.04f, 0.1f }, { 0, 0.12f } }, 16, terracotta());
            m.sphere(0.05f, 12, terracotta(), translate({ 0, 0.15f, 0 }));
            for (int s = -1; s <= 1; s += 2) ellipsoid(m, { 0, 0.2f, s * 0.05f }, { 0.03f, 0.045f, 0.03f }, 10, terracotta());
            m.torus(0.055f, 0.012f, 16, 6, mat(0xD07A4A, 0.6f), translate({ 0, 0.07f, 0 }));
            break;
        }
        case ArtifactKind::Bronze: {
            m.lathe({ { 0, -0.12f }, { 0.08f, -0.12f }, { 0.13f, -0.04f }, { 0.12f, 0.04f }, { 0.06f, 0.09f }, { 0.07f, 0.13f }, { 0.05f, 0.13f }, { 0.04f, 0.1f }, { 0, 0.09f } }, 20, bronze());
            break;
        }
        case ArtifactKind::Fragment: {
            const Material stone = mat(0x8E8A84, 0.75f);
            ellipsoid(m, { 0, 0.02f, 0 }, { 0.13f, 0.15f, 0.12f }, 20, stone);
            m.sphere(0.06f, 12, stone, translate({ -0.01f, 0.17f, 0 }));
            for (int s = -1; s <= 1; s += 2) ellipsoid(m, { -0.01f, -0.02f, s * 0.12f }, { 0.025f, 0.08f, 0.02f }, 10, stone);
            m.cylinder(0.06f, 0.08f, 12, stone, translate({ 0, -0.2f, 0 }));
            m.wobble(0.01f, 12, 9);
            break;
        }
    }
    // a soft golden halo so they're easy to spot
    m.torus(0.3f, 0.012f, 40, 6, mat(0xFFD27A, 0.3f, 0, 0.8f), translate({ 0, -0.28f, 0 }));
    return m;
}

Mesh build_tumbleweed() {
    Mesh m;
    tumbleweed_into(m, {}, 17);
    return m;
}

Mesh build_handcart() {
    Mesh m;
    m.rounded_box({ 1.5f, 0.1f, 0.95f }, 0.03f, wood(), translate({ 0, 0.5f, 0 }), 2);
    for (int s = -1; s <= 1; s += 2) m.rounded_box({ 1.5f, 0.2f, 0.06f }, 0.02f, wood_dark(), translate({ 0, 0.65f, s * 0.47f }), 1);
    for (int s = -1; s <= 1; s += 2) m.append(build_wheel(0.36f), translate({ 0, 0.36f, s * 0.56f }) * (s < 0 ? rotate_y(PI) : Xform{}));
    for (int s = -1; s <= 1; s += 2) m.tube({ { -0.7f, 0.55f, s * 0.38f }, { -1.2f, 0.75f, s * 0.38f }, { -1.35f, 0.78f, s * 0.38f } }, 0.03f, 8, wood_dark());
    pot_at(m, translate({ 0.35f, 0.55f, -0.2f }), 0.85f, 4);
    pot_at(m, translate({ 0.4f, 0.55f, 0.22f }), 0.7f, 5);
    for (int k = 0; k < 2; k++) ellipsoid(m, { -0.3f + k * 0.12f, 0.75f, -0.12f + k * 0.26f }, { 0.26f, 0.18f, 0.2f }, 14, vary(mat(0xC9AE7C, 0.95f), k, 0.04f));
    m.wobble(0.012f, 3, 6);
    return m;
}

Mesh build_chunk(const Track& t, float s0, float s1) {
    Mesh m;
    land(m, t, s0, s1);
    kerbs_and_potholes(m, t, s0, s1);
    for (Prop p : t.props) {
        if (p.s < s0 || p.s >= s1 || p.kind == PropKind::Guide) continue;
        const bool big = p.kind == PropKind::Granary || p.kind == PropKind::GreatBath || p.kind == PropKind::AssemblyHall || p.kind == PropKind::Stupa || p.kind == PropKind::GreatHall || p.kind == PropKind::House;
        p.y = big ? t.elevation(p.s) : t.height(p.x, p.z, p.s);
        switch (p.kind) {
            case PropKind::House: house(m, p); break;
            case PropKind::Palm: palm(m, p); break;
            case PropKind::Shrub: shrub(m, p); break;
            case PropKind::Rock: rock(m, p); break;
            case PropKind::Well: well(m, p); break;
            case PropKind::Cart: cart(m, p); break;
            case PropKind::Lamp: lamp(m, p); break;
            case PropKind::SunBanner: sun_banner(m, p); break;
            case PropKind::Cactus: cactus(m, p); break;
            case PropKind::Tumbleweed: tumbleweed_into(m, xf_at({ p.x, p.y + 0.38f * p.scale, p.z }, p.yaw) * scale(p.scale), p.seed); break;
            case PropKind::CamelBones: camel_bones(m, p); break;
            case PropKind::Signboard: signboard(m, p); break;
            case PropKind::Basket: basket(m, p); break;
            case PropKind::Rug: rug(m, p); break;
            case PropKind::Stall: stall(m, p); break;
            case PropKind::PrayerFlags: prayer_flags(m, p); break;
            case PropKind::Granary: granary(m, p); break;
            case PropKind::GreatBath: great_bath(m, p); break;
            case PropKind::AssemblyHall: assembly_hall(m, p); break;
            case PropKind::Stupa: stupa(m, p); break;
            case PropKind::GreatHall: great_hall(m, p); break;
            case PropKind::DancingGirl: dancing_girl(m, p); break;
            case PropKind::FlowerBed: flower_bed(m, p); break;
            case PropKind::Guide: break;
        }
    }
    return m;
}

Mesh build_watchman() {
    Mesh m;
    const Material tunic = mat(0x2E7F8C, 0.8f), sash = mat(0xC8302E, 0.8f), sk = mat(0xA2623E, 0.55f, 0, 0, Material::SKIN), dark = mat(0x1B1311, 0.4f);
    for (int s = -1; s <= 1; s += 2) m.capsule({ 0, 0.05f, s * 0.1f }, { 0, 0.75f, s * 0.1f }, 0.07f, 12, mat(0xEFE6D2, 0.85f));
    m.lathe({ { 0, 0.62f }, { 0.25f, 0.62f }, { 0.27f, 0.8f }, { 0.25f, 1.15f }, { 0.27f, 1.32f }, { 0.2f, 1.42f }, { 0, 1.44f } }, 24, tunic);
    m.torus(0.26f, 0.04f, 24, 8, sash, translate({ 0, 0.95f, 0 }));
    m.tube({ { 0.02f, 1.4f, -0.22f }, { 0.22f, 1.15f, 0 }, { 0.12f, 0.92f, 0.22f } }, 0.035f, 8, sash);
    for (int s = -1; s <= 1; s += 2) m.tube({ { 0, 1.34f, s * 0.26f }, { 0.04f, 1.12f, s * 0.31f }, { 0.2f, 1.05f, s * 0.2f } }, 0.055f, 10, tunic);
    for (int s = -1; s <= 1; s += 2) m.sphere(0.05f, 10, sk, translate({ 0.22f, 1.05f, s * 0.2f }));
    m.cylinder(0.05f, 0.14f, 12, sk, translate({ 0, 1.42f, 0 }));
    ellipsoid(m, { 0.02f, 1.68f, 0 }, { 0.16f, 0.19f, 0.15f }, 24, sk);
    ellipsoid(m, { 0.17f, 1.66f, 0 }, { 0.03f, 0.04f, 0.03f }, 10, sk);
    for (int s = -1; s <= 1; s += 2) {
        m.sphere(0.028f, 12, mat(0xF8F4EE, 0.12f, 0, 0, Material::EYE), translate({ 0.14f, 1.72f, s * 0.058f }));
        m.sphere(0.016f, 8, mat(0x2A1A10, 0.15f, 0, 0, Material::EYE), translate({ 0.163f, 1.72f, s * 0.058f }));
        m.tube({ { 0.15f, 1.775f, s * 0.025f }, { 0.165f, 1.785f, s * 0.06f }, { 0.15f, 1.79f, s * 0.095f } }, 0.012f, 6, dark);   // stern brows
        m.tube({ { 0.18f, 1.625f, 0 }, { 0.18f, 1.615f, s * 0.05f }, { 0.165f, 1.6f, s * 0.085f } }, 0.016f, 8, dark);         // a big moustache
    }
    for (int k = 0; k < 3; k++) m.torus(0.14f - k * 0.015f, 0.045f, 24, 8, k % 2 ? mat(0xF2C230, 0.7f) : sash, translate({ 0, 1.82f + k * 0.045f, 0 }));
    m.sphere(0.11f, 16, sash, translate({ -0.01f, 1.88f, 0 }));
    // a spear with a bronze tip, and a small round shield
    m.cylinder(0.022f, 2.3f, 8, wood(), translate({ 0.2f, 0, -0.32f }));
    m.lathe({ { 0, 0 }, { 0.035f, 0 }, { 0.05f, 0.08f }, { 0, 0.26f } }, 10, bronze(), translate({ 0.2f, 2.3f, -0.32f }));
    m.lathe({ { 0, 0 }, { 0.26f, 0 }, { 0.28f, 0.03f }, { 0.2f, 0.07f }, { 0, 0.08f } }, 24, mat(0x8A5A32, 0.7f), translate({ 0.05f, 1.0f, 0.34f }) * rotate_x(-PI / 2));
    m.sphere(0.05f, 10, bronze(), translate({ 0.05f, 1.0f, 0.43f }));
    m.ground_ao(0, 0.4f, 0.4f);
    return m;
}

Mesh build_zebu() {
    Mesh m;
    const Material hide = mat(0xD9D2C4, 0.75f), dark = mat(0x5A5048, 0.7f), hoof = mat(0x2E2622, 0.6f);
    ellipsoid(m, { 0, 0.9f, 0 }, { 0.75f, 0.36f, 0.33f }, 28, hide);
    ellipsoid(m, { 0.38f, 1.22f, 0 }, { 0.2f, 0.2f, 0.17f }, 18, mat(0xC9C0B0, 0.75f));   // the hump
    ellipsoid(m, { 0.62f, 0.72f, 0 }, { 0.12f, 0.24f, 0.08f }, 14, hide);                // the dewlap
    for (int fx = -1; fx <= 1; fx += 2) for (int fz = -1; fz <= 1; fz += 2) {
        const V3 top = { fx * 0.48f, 0.78f, fz * 0.18f }, knee = { fx * 0.5f, 0.4f, fz * 0.19f }, foot = { fx * 0.5f, 0.06f, fz * 0.19f };
        taper(m, { top, knee, foot }, 0.09f, 0.055f, 10, hide);
        m.cylinder(0.065f, 0.08f, 10, hoof, translate({ foot.x, 0, foot.z }));
    }
    // head, muzzle, ears, painted horns
    ellipsoid(m, { 0.92f, 1.08f, 0 }, { 0.24f, 0.17f, 0.15f }, 20, hide);
    ellipsoid(m, { 1.12f, 0.99f, 0 }, { 0.11f, 0.1f, 0.12f }, 16, dark);
    for (int s = -1; s <= 1; s += 2) {
        m.sphere(0.025f, 8, mat(0x120A08, 0.2f, 0, 0, Material::EYE), translate({ 1.02f, 1.13f, s * 0.12f }));
        ellipsoid(m, { 0.82f, 1.12f, s * 0.2f }, { 0.07f, 0.035f, 0.12f }, 10, hide);
        m.tube({ { 0.86f, 1.2f, s * 0.1f }, { 0.84f, 1.36f, s * 0.2f }, { 0.9f, 1.5f, s * 0.22f }, { 0.98f, 1.56f, s * 0.18f } }, 0.04f, 8, mat(s > 0 ? 0xC8302E : 0x2F6DB5, 0.5f), {}, { 0.05f, 0.04f, 0.03f, 0.015f });
    }
    // tail with a tuft
    m.tube({ { -0.72f, 1.0f, 0 }, { -0.82f, 0.8f, 0.02f }, { -0.84f, 0.5f, 0.04f } }, 0.025f, 6, hide);
    ellipsoid(m, { -0.84f, 0.44f, 0.04f }, { 0.04f, 0.08f, 0.04f }, 8, dark);
    // a marigold garland round the neck
    for (int k = 0; k <= 14; k++) {
        const float a = PI * (0.15f + 0.7f * k / 14.0f);
        m.sphere(0.045f, 6, k % 2 ? mat(0xF7C531, 0.7f) : mat(0xF2801E, 0.7f), translate({ 0.68f + std::sin(a) * 0.06f, 0.95f - std::sin(a) * 0.22f, std::cos(a) * 0.24f }));
    }
    m.wobble(0.01f, 6, 12);
    m.ground_ao(0, 0.4f, 0.45f);
    return m;
}

Mesh build_board(const Track& t, const Board& b) {
    Mesh m;
    const Material paint = mat(0xFFFFFF, 0.5f, 0, 0.12f), edge = mat(0x6B4A30, 0.6f), gold_paint = mat(0xF2C14E, 0.35f, 0.6f, 0.2f);
    const auto where = [&](const GoNode& n) { const Sample p = t.at(n.s); return V3{ p.x - p.tz * n.lat, t.elevation(n.s) + 0.06f, p.z + p.tx * n.lat }; };
    for (size_t i = 0; i < b.nodes.size(); i++) {
        const V3 c = where(b.nodes[i]);
        const bool exit = static_cast<int>(i) == b.exit, start = static_cast<int>(i) == b.start;
        m.lathe({ { 0, 0.03f }, { 0.3f, 0.03f }, { 0.34f, 0.015f }, { 0.36f, -0.04f } }, 28, exit ? gold_paint : paint, translate(c));
        m.torus(exit ? 0.6f : 0.46f, 0.04f, 36, 6, exit ? gold_paint : edge, translate(c + V3{ 0, -0.02f, 0 }) * scale({ 1, 0.5f, 1 }));
        if (start) m.torus(0.62f, 0.03f, 36, 6, paint, translate(c + V3{ 0, 0.01f, 0 }) * scale({ 1, 0.4f, 1 }));
        if (exit) {
            m.cylinder(0.03f, 1.6f, 8, wood(), translate(c + V3{ -0.5f, 0, 0.5f }));
            m.rounded_box({ 0.5f, 0.32f, 0.02f }, 0.01f, mat(0xE8862A, 0.8f, 0, 0, Material::FOLIAGE), translate(c + V3{ -0.24f, 1.42f, 0.5f }), 1);
        }
    }
    for (size_t i = 0; i < b.adj.size(); i++) for (int j : b.adj[i]) {
        if (j < static_cast<int>(i)) continue;
        const V3 a = where(b.nodes[i]), c = where(b.nodes[j]);
        const V3 d = c - a;
        const float len = length(d) - 0.8f;
        if (len <= 0) continue;
        const V3 mid = (a + c) * 0.5f;
        m.rounded_box({ len, 0.03f, 0.1f }, 0.01f, paint, translate(mid + V3{ 0, -0.02f, 0 }) * rotate_y(std::atan2(-d.z, d.x)), 1);
    }
    return m;
}

Mesh build_chevron() {
    Mesh m;
    const Material red = mat(0xE8452E, 0.5f, 0, 0.6f);
    for (int s = -1; s <= 1; s += 2) m.rounded_box({ 0.34f, 0.04f, 0.09f }, 0.02f, red, translate({ -0.08f, 0, s * 0.11f }) * rotate_y(s * 0.7f), 1);
    return m;
}

Mesh build_gaze() {
    Mesh m;
    m.torus(0.44f, 0.05f, 36, 6, mat(0xE8452E, 0.5f, 0, 0.6f), scale({ 1, 0.4f, 1 }));
    m.sphere(0.07f, 10, mat(0xE8452E, 0.5f, 0, 0.6f), scale({ 1, 0.3f, 1 }));
    return m;
}

} // namespace jr
