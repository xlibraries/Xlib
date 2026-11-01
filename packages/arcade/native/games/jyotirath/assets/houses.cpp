// JyotiRath's assets: the mud-brick houses (their shape is shared with the track's colliders), palms, shrubs, rocks, lamps, wells and carts.
#include "models.h"
#include "parts.h"
#include "palette.h"

#include <algorithm>
#include <cmath>

namespace jr {

HouseShape house_shape(uint32_t seed, bool grand) {
    HouseShape h;
    const float k = grand ? 1.35f : 1.0f;
    h.w = (3.0f + hash01(seed * 7 + 1) * 2.0f) * k;
    h.d = (2.8f + hash01(seed * 7 + 2) * 1.6f) * k;
    h.upper = hash01(seed * 7 + 3) < (grand ? 0.6f : 0.35f);
    h.h = (1.6f + hash01(seed * 7 + 4) * 0.6f) * (grand ? 1.25f : 1.0f);
    return h;
}

void house(Mesh& m, const Placement& p, const HouseShape& h) {
    const size_t from = m.vertices.size();
    const Xform X = place({ p.x, p.y, p.z }, p.yaw);
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

void palm(Mesh& m, const Placement& p) {
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

void shrub(Mesh& m, const Placement& p) {
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

void rock(Mesh& m, const Placement& p) {
    const size_t from = m.vertices.size();
    const float r = 0.55f * p.scale;
    m.sphere(1, 20, vary(mat(0xA39079, 0.85f), p.seed, 0.05f), place({ p.x, p.y + r * 0.25f, p.z }, p.yaw) * scale({ r * 1.1f, r * 0.65f, r }));
    m.wobble(0.13f * p.scale, 2.4f / p.scale, p.seed, from);
    m.ground_ao(p.y, 0.3f, 0.5f, from);
}

void lamp(Mesh& m, const Placement& p) {
    const Xform X = place({ p.x, p.y, p.z }, p.yaw);
    m.lathe({ { 0, 0 }, { 0.2f, 0 }, { 0.2f, 0.08f }, { 0.1f, 0.15f }, { 0.08f, 0.7f }, { 0.16f, 0.78f }, { 0.18f, 0.85f }, { 0, 0.85f } }, 16, sandstone(), X, 0.6f);
    m.lathe({ { 0, 0 }, { 0.1f, 0 }, { 0.16f, 0.06f }, { 0.15f, 0.09f }, { 0.11f, 0.08f }, { 0, 0.07f } }, 16, terracotta(), X * translate({ 0, 0.85f, 0 }));
    m.lathe({ { 0, 0 }, { 0.045f, 0.03f }, { 0.04f, 0.09f }, { 0.015f, 0.16f }, { 0, 0.2f } }, 12, mat(0xFFB347, 0.5f, 0, 1.0f), X * translate({ 0, 0.92f, 0 }));
}

void well(Mesh& m, const Placement& p) {
    const size_t from = m.vertices.size();
    const Xform X = place({ p.x, p.y, p.z }, p.yaw);
    m.lathe({ { 0.5f, 0.25f }, { 0.5f, 0.55f }, { 0.55f, 0.62f }, { 0.72f, 0.62f }, { 0.76f, 0.55f }, { 0.76f, 0 }, { 0.8f, 0 } }, 32, brick(), X);
    m.cylinder(0.5f, 0.02f, 32, water(), X * translate({ 0, 0.3f, 0 }));
    for (int s = -1; s <= 1; s += 2) m.cylinder(0.05f, 1.3f, 10, wood(), X * translate({ 0, 0.55f, s * 0.68f }));
    m.cylinder(0.035f, 1.5f, 10, wood(), X * translate({ 0, 1.8f, -0.75f }) * rotate_x(PI / 2));
    m.append(build_wheel(0.14f), X * translate({ 0, 1.8f, 0 }));
    m.cylinder(0.008f, 1.0f, 6, mat(0xC8A46A, 0.9f), X * translate({ 0.14f, 0.75f, 0 }));
    m.lathe({ { 0, 0 }, { 0.08f, 0 }, { 0.1f, 0.15f }, { 0.11f, 0.2f }, { 0, 0.2f } }, 12, wood_dark(), X * translate({ 0.14f, 0.6f, 0 }));
    m.ground_ao(p.y, 0.5f, 0.4f, from);
}

void cart(Mesh& m, const Placement& p) {
    const size_t from = m.vertices.size();
    const Xform X = place({ p.x, p.y, p.z }, p.yaw);
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

} // namespace jr
