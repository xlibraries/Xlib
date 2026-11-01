// JyotiRath's assets: the things that lie or move about: pots, shards, puffs, relics, the bell and the grain, the handcart, sacks, stones, lamp posts.
#include "models.h"
#include "parts.h"
#include "palette.h"

#include <algorithm>
#include <cmath>

namespace jr {

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

Mesh build_relic(Relic kind) {
    Mesh m;
    switch (kind) {
        case Relic::Seal: {
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
        case Relic::Shard: {
            m.rounded_box({ 0.32f, 0.22f, 0.04f }, 0.015f, terracotta(), rotate_z(0.3f), 2);
            m.rounded_box({ 0.33f, 0.035f, 0.045f }, 0.01f, mat(0x241410, 0.8f), rotate_z(0.3f) * translate({ 0, 0.03f, 0 }), 1);
            for (int k = 0; k < 3; k++) m.sphere(0.018f, 8, mat(0x241410, 0.8f), rotate_z(0.3f) * translate({ -0.08f + k * 0.08f, -0.05f, 0.02f }));
            break;
        }
        case Relic::Beads: {
            for (int k = 0; k < 11; k++) {
                const float a = 2 * PI * k / 11;
                ellipsoid(m, { std::cos(a) * 0.15f, std::sin(a) * 0.15f, 0 }, { 0.035f, 0.03f, 0.03f }, 10, mat(k % 3 ? 0xC2410C : 0xF0D9A8, 0.25f), rotate_z(a));
            }
            m.torus(0.15f, 0.005f, 32, 4, mat(0x8A6A4A, 0.8f), rotate_x(PI / 2));
            break;
        }
        case Relic::Figurine: {
            m.lathe({ { 0, -0.18f }, { 0.07f, -0.18f }, { 0.05f, -0.05f }, { 0.07f, 0.04f }, { 0.04f, 0.1f }, { 0, 0.12f } }, 16, terracotta());
            m.sphere(0.05f, 12, terracotta(), translate({ 0, 0.15f, 0 }));
            for (int s = -1; s <= 1; s += 2) ellipsoid(m, { 0, 0.2f, s * 0.05f }, { 0.03f, 0.045f, 0.03f }, 10, terracotta());
            m.torus(0.055f, 0.012f, 16, 6, mat(0xD07A4A, 0.6f), translate({ 0, 0.07f, 0 }));
            break;
        }
        case Relic::Bronze: {
            m.lathe({ { 0, -0.12f }, { 0.08f, -0.12f }, { 0.13f, -0.04f }, { 0.12f, 0.04f }, { 0.06f, 0.09f }, { 0.07f, 0.13f }, { 0.05f, 0.13f }, { 0.04f, 0.1f }, { 0, 0.09f } }, 20, bronze());
            break;
        }
        case Relic::Fragment: {
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

Mesh build_bell() {
    Mesh m;
    m.lathe({ { 0, -0.16f }, { 0.13f, -0.16f }, { 0.15f, -0.14f }, { 0.11f, -0.06f }, { 0.08f, 0.06f }, { 0.05f, 0.1f }, { 0, 0.11f } }, 24, bronze());
    m.torus(0.03f, 0.01f, 12, 6, bronze(), translate({ 0, 0.13f, 0 }) * rotate_x(PI / 2));
    m.sphere(0.03f, 8, bronze(), translate({ 0, -0.17f, 0 }));
    m.torus(0.3f, 0.012f, 40, 6, mat(0xFFD27A, 0.3f, 0, 0.8f), translate({ 0, -0.28f, 0 }));
    return m;
}

Mesh build_grain() {
    Mesh m;
    ellipsoid(m, { 0, -0.04f, 0 }, { 0.17f, 0.15f, 0.15f }, 16, mat(0xC9AE7C, 0.95f));
    m.cylinder(0.05f, 0.08f, 10, mat(0xC9AE7C, 0.95f), translate({ 0, 0.09f, 0 }));
    m.torus(0.05f, 0.012f, 12, 6, mat(0xC8302E, 0.7f), translate({ 0, 0.11f, 0 }));
    m.wobble(0.01f, 8, 3);
    m.torus(0.3f, 0.012f, 40, 6, mat(0xFFD27A, 0.3f, 0, 0.8f), translate({ 0, -0.28f, 0 }));
    return m;
}

Mesh build_fragment() { return build_relic(Relic::Fragment); }

Mesh build_sack() {
    Mesh m;
    ellipsoid(m, { 0, 0.3f, 0 }, { 0.42f, 0.3f, 0.36f }, 18, mat(0xC9AE7C, 0.95f));
    m.cylinder(0.1f, 0.14f, 12, mat(0xC9AE7C, 0.95f), translate({ 0, 0.56f, 0 }));
    m.torus(0.1f, 0.02f, 14, 6, mat(0x8A5A32, 0.8f), translate({ 0, 0.62f, 0 }));
    m.wobble(0.03f, 5, 9);
    m.ground_ao(0, 0.3f, 0.4f);
    return m;
}

Mesh build_stone() {
    Mesh m;
    m.lathe({ { 0, -0.5f }, { 0.48f, -0.5f }, { 0.5f, -0.1f }, { 0.47f, 0.04f }, { 0.4f, 0.08f }, { 0, 0.09f } }, 24, mat(0xB7A48A, 0.8f));
    m.wobble(0.02f, 4, 5);
    return m;
}

Mesh build_beacon(bool lit) {
    Mesh m;
    m.lathe({ { 0, 0 }, { 0.26f, 0 }, { 0.26f, 0.1f }, { 0.12f, 0.2f }, { 0.09f, 1.4f }, { 0.18f, 1.5f }, { 0.2f, 1.6f }, { 0, 1.6f } }, 18, sandstone(), {}, 0.6f);
    m.lathe({ { 0, 0 }, { 0.14f, 0 }, { 0.24f, 0.1f }, { 0.25f, 0.16f }, { 0.18f, 0.14f }, { 0, 0.13f } }, 18, terracotta(), translate({ 0, 1.6f, 0 }));
    if (lit) {
        m.lathe({ { 0, 0 }, { 0.1f, 0.05f }, { 0.09f, 0.18f }, { 0.03f, 0.34f }, { 0, 0.42f } }, 14, mat(0xFFB347, 0.5f, 0, 1.0f), translate({ 0, 1.72f, 0 }));
        m.lathe({ { 0, 0 }, { 0.05f, 0.03f }, { 0.045f, 0.1f }, { 0, 0.2f } }, 10, mat(0xFFF2C0, 0.5f, 0, 1.0f), translate({ 0, 1.74f, 0 }));
    } else {
        m.cylinder(0.12f, 0.03f, 12, mat(0x3A2A20, 0.9f), translate({ 0, 1.71f, 0 }));   // a cold wick
    }
    m.wobble(0.008f, 6, lit ? 3 : 4);
    m.ground_ao(0, 0.3f, 0.4f);
    return m;
}

} // namespace jr
