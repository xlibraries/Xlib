// JyotiRath's assets: life along the road: baskets, rugs, stalls, prayer flags, villagers, wheat, the canal and piles of sacks.
#include "models.h"
#include "parts.h"
#include "palette.h"

#include <algorithm>
#include <cmath>

namespace jr {

void basket(Mesh& m, const Placement& p) {
    const size_t from = m.vertices.size();
    const Xform X = place({ p.x, p.y, p.z }, p.yaw);
    m.lathe({ { 0, 0 }, { 0.22f, 0 }, { 0.3f, 0.12f }, { 0.33f, 0.26f }, { 0.35f, 0.3f }, { 0.31f, 0.3f }, { 0.29f, 0.14f }, { 0, 0.1f } }, 20, vary(straw(), p.seed, 0.05f), X);
    m.wobble(0.012f, 18, p.seed, from);
    const uint32_t fruit[] = { 0xF2A23A, 0xE8C34A, 0xC94A2E, 0x8DB04A };
    for (int k = 0; k < 7; k++) {
        const float a = k * 2.3f, r = k == 0 ? 0.0f : 0.16f;
        m.sphere(0.075f, 10, mat(fruit[(p.seed + k) % 4], 0.45f), X * translate({ std::cos(a) * r, 0.28f + (k == 0 ? 0.06f : 0.0f), std::sin(a) * r }));
    }
    m.ground_ao(p.y, 0.2f, 0.5f, from);
}

void rug(Mesh& m, const Placement& p) {
    const Xform X = place({ p.x, p.y + 0.02f, p.z }, p.yaw);
    const uint32_t base[] = { 0xB8323A, 0x2E6E8C, 0xD08A2E };
    const Material b = mat(base[p.seed % 3], 0.95f), border = mat(0xEFD9A0, 0.95f);
    m.rounded_box({ 1.7f, 0.03f, 1.1f }, 0.01f, b, X, 1);
    for (int s = -1; s <= 1; s += 2) {
        m.rounded_box({ 1.7f, 0.035f, 0.08f }, 0.01f, border, X * translate({ 0, 0, s * 0.45f }), 1);
        m.rounded_box({ 0.08f, 0.035f, 1.1f }, 0.01f, border, X * translate({ s * 0.75f, 0, 0 }), 1);
    }
    m.rounded_box({ 0.4f, 0.04f, 0.4f }, 0.01f, border, X * rotate_y(PI / 4), 1);
}

void stall(Mesh& m, const Placement& p) {
    const size_t from = m.vertices.size();
    const Xform X = place({ p.x, p.y, p.z }, p.yaw);
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

void prayer_flags(Mesh& m, const Placement& p) {
    const Xform X = place({ p.x, p.y, p.z }, p.yaw);
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

void villager(Mesh& m, const Placement& p) { person(m, p.seed, place({ p.x, p.y, p.z }, p.yaw)); }

void wheat(Mesh& m, const Placement& p) {
    const size_t from = m.vertices.size();
    const Material stalk = mat(0xD9B25A, 0.8f, 0, 0, Material::FOLIAGE), ear = mat(0xE8C46A, 0.7f, 0, 0, Material::FOLIAGE);
    m.cylinder(1.1f * p.scale, 0.04f, 18, mat(0x8A6A3A, 0.95f), translate({ p.x, p.y - 0.02f, p.z }));
    for (int k = 0; k < 46; k++) {
        const float a = k * 2.39996f + p.yaw, r = 1.0f * p.scale * std::sqrt((k + 0.5f) / 46);
        const V3 root = { p.x + std::cos(a) * r, p.y, p.z + std::sin(a) * r };
        const float h = 0.75f + hash01(p.seed * 31 + k) * 0.3f, lean = 0.08f + hash01(p.seed * 7 + k) * 0.1f;
        const V3 top = root + V3{ std::cos(a + 1) * lean, h, std::sin(a + 1) * lean };
        m.tube({ root, lerp(root, top, 0.6f) + V3{ 0, 0.02f, 0 }, top }, 0.012f, 4, stalk, {}, {}, false);
        ellipsoid(m, top + V3{ 0, 0.06f, 0 }, { 0.025f, 0.08f, 0.025f }, 6, ear);
    }
    m.ground_ao(p.y, 0.3f, 0.35f, from);
}

void canal(Mesh& m, const Placement& p) {
    // a brick-lined channel 3 m long, its water a little below the ground
    const Xform X = place({ p.x, p.y, p.z }, p.yaw);
    const Material b = vary(brick(), p.seed, 0.04f, 0.92f);
    for (int s = -1; s <= 1; s += 2) m.rounded_box({ 3.02f, 0.62f, 0.22f }, 0.04f, b, X * translate({ 0, -0.2f, s * (CANAL_HALF + 0.05f) }), 1);
    m.rounded_box({ 3.02f, 0.04f, 2 * CANAL_HALF }, 0.01f, mat(0x6B4A30, 0.95f), X * translate({ 0, -0.58f, 0 }), 1);
    m.rounded_box({ 3.02f, 0.02f, 2 * CANAL_HALF - 0.04f }, 0.005f, water(), X * translate({ 0, -0.3f, 0 }), 1);
}

void sack_pile(Mesh& m, const Placement& p) {
    const size_t from = m.vertices.size();
    const Xform X = place({ p.x, p.y, p.z }, p.yaw);
    for (int k = 0; k < 6; k++) {
        const V3 c = k < 3 ? V3{ (k - 1) * 0.5f, 0.22f, 0 } : k < 5 ? V3{ (k - 3.5f) * 0.5f, 0.6f, 0.02f } : V3{ 0, 0.95f, 0 };
        ellipsoid(m, c, { 0.28f, 0.21f, 0.24f }, 14, vary(mat(0xC9AE7C, 0.95f), p.seed + k, 0.05f), X);
    }
    m.wobble(0.03f, 5, p.seed, from);
    m.ground_ao(p.y, 0.4f, 0.4f, from);
}

} // namespace jr
