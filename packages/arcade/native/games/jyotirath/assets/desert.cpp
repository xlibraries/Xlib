// JyotiRath's assets: the desert's props: the sun banner, cacti, tumbleweeds, camel bones and signboards.
#include "models.h"
#include "parts.h"
#include "palette.h"

#include <algorithm>
#include <cmath>

namespace jr {

void sun_banner(Mesh& m, const Placement& p) {
    const size_t from = m.vertices.size();
    const Xform X = place({ p.x, p.y, p.z }, p.yaw);
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

void cactus(Mesh& m, const Placement& p) {
    const size_t from = m.vertices.size();
    const Xform X = place({ p.x, p.y, p.z }, p.yaw) * scale(p.scale);
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

void camel_bones(Mesh& m, const Placement& p) {
    const size_t from = m.vertices.size();
    const Xform X = place({ p.x, p.y - 0.12f, p.z }, p.yaw);
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

void signboard(Mesh& m, const Placement& p) {
    const size_t from = m.vertices.size();
    const Xform X = place({ p.x, p.y, p.z }, p.yaw);
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

} // namespace jr
