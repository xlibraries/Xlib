// JyotiRath's assets: the people and the zebu: the Guide, villagers, the watchman, the bronze Dancing Girl, the Bronze Thief.
#include "models.h"
#include "parts.h"
#include "palette.h"

#include <algorithm>
#include <cmath>

namespace jr {

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

Mesh build_villager(uint32_t seed) {
    Mesh m;
    person(m, seed, {});
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

Mesh build_statue() {
    Mesh m;
    statue(m, {});
    return m;
}

Mesh build_thief() {
    Mesh m;
    const Material robe = mat(0x2B2C4E, 0.85f), wrap = mat(0x15151F, 0.7f), sash = mat(0x7A2E5A, 0.8f);
    const Material sk = mat(0xA2623E, 0.55f, 0, 0, Material::SKIN), dark = mat(0x1B1311, 0.4f);
    for (int s = -1; s <= 1; s += 2) m.capsule({ 0.02f, 0.05f, s * 0.1f }, { -0.02f, 0.62f, s * 0.1f }, 0.065f, 12, wrap);
    m.lathe({ { 0, 0.55f }, { 0.23f, 0.55f }, { 0.25f, 0.75f }, { 0.22f, 1.1f }, { 0.25f, 1.26f }, { 0.18f, 1.36f }, { 0, 1.38f } }, 20, robe, rotate_z(-0.12f));
    m.torus(0.24f, 0.035f, 20, 6, sash, translate({ 0.03f, 0.9f, 0 }) * rotate_z(-0.12f));
    // arms forward, as if hugging something to his chest
    for (int s = -1; s <= 1; s += 2) m.tube({ { 0.08f, 1.28f, s * 0.22f }, { 0.22f, 1.12f, s * 0.24f }, { 0.36f, 1.1f, s * 0.1f } }, 0.05f, 10, robe);
    for (int s = -1; s <= 1; s += 2) m.sphere(0.05f, 10, sk, translate({ 0.38f, 1.1f, s * 0.08f }));
    // a hooded head, a dark band across the eyes with two sly white eyes
    ellipsoid(m, { 0.12f, 1.6f, 0 }, { 0.15f, 0.17f, 0.14f }, 20, sk);
    ellipsoid(m, { 0.09f, 1.65f, 0 }, { 0.18f, 0.2f, 0.17f }, 20, robe, translate({ -0.03f, 0.02f, 0 }));
    m.torus(0.155f, 0.035f, 24, 6, wrap, translate({ 0.13f, 1.63f, 0 }) * rotate_z(0.1f));
    for (int s = -1; s <= 1; s += 2) {
        ellipsoid(m, { 0.27f, 1.635f, s * 0.055f }, { 0.012f, 0.022f, 0.028f }, 10, mat(0xF8F4EE, 0.12f, 0, 0, Material::EYE));
        m.sphere(0.012f, 8, mat(0x2A1A10, 0.15f, 0, 0, Material::EYE), translate({ 0.28f, 1.63f, s * 0.05f }));
    }
    m.tube({ { 0.25f, 1.53f, -0.05f }, { 0.27f, 1.52f, 0 }, { 0.25f, 1.53f, 0.05f } }, 0.01f, 6, dark);   // a smirk
    m.wobble(0.01f, 6, 21);
    m.ground_ao(0, 0.35f, 0.4f);
    return m;
}

} // namespace jr
