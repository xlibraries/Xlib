// JyotiRath's assets: the helpers several of JyotiRath's asset files share: an onion dome, a kalash finial, pots, a townsperson, the bronze statue.
#include "models.h"
#include "parts.h"
#include "palette.h"

#include <algorithm>
#include <cmath>

namespace jr {

/** A bell or onion dome: lathe of a classic profile, `h` tall. */
void onion(Mesh& m, V3 base, float r, float h, const Material& mt, const Xform& x) {
    const Profile p = { { 0, 0 }, { 0.75f, 0.0f }, { 0.95f, 0.12f }, { 1.0f, 0.3f }, { 0.85f, 0.52f }, { 0.55f, 0.7f }, { 0.25f, 0.84f }, { 0.12f, 0.92f }, { 0.1f, 0.97f }, { 0, 1.0f } };
    Profile q;
    for (auto [pr, py] : p) q.push_back({ pr * r, py * h });
    m.lathe(q, 24, mt, x * translate(base));
}

/** A kalash finial: a pot with a spike. */
void kalash(Mesh& m, V3 base, float s, const Material& mt, const Xform& x) {
    const Profile p = { { 0, 0 }, { 0.5f, 0 }, { 0.5f, 0.08f }, { 0.35f, 0.15f }, { 0.75f, 0.45f }, { 0.7f, 0.7f }, { 0.3f, 0.85f }, { 0.4f, 0.95f }, { 0.15f, 1.05f }, { 0.08f, 1.5f }, { 0, 1.7f } };
    Profile q;
    for (auto [pr, py] : p) q.push_back({ pr * s, py * s });
    m.lathe(q, 20, mt, x * translate(base));
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

/** A townsperson: a dhoti or a sari in one of a few colours, some with a pot on the head. Facing +X. */
void person(Mesh& m, uint32_t seed, const Xform& X) {
    const uint32_t cloth[] = { 0xE8862A, 0x2E7F8C, 0xC8302E, 0xF2C230, 0x6B8E3A, 0xEFE6D2, 0x8A4FA0 };
    const Material robe = mat(cloth[seed % 7], 0.85f), sash = mat(cloth[(seed / 7) % 7], 0.85f);
    const Material sk = mat(hash01(seed) < 0.5f ? 0xA2623E : 0xB7704A, 0.55f, 0, 0, Material::SKIN), dark = mat(0x1B1311, 0.4f);
    const bool woman = hash01(seed * 3) < 0.5f;
    const float h = 0.92f + hash01(seed * 5) * 0.14f;
    const Xform B = X * scale(h);
    m.lathe({ { 0, 0 }, { woman ? 0.3f : 0.22f, 0 }, { woman ? 0.27f : 0.21f, 0.6f }, { 0.22f, 1.0f }, { 0.25f, 1.25f }, { 0.19f, 1.36f }, { 0, 1.38f } }, 20, robe, B);
    m.tube({ { 0.02f, 1.34f, -0.2f }, { 0.2f, 1.1f, 0 }, { 0.12f, 0.8f, 0.2f } }, 0.04f, 8, sash, B);
    for (int s = -1; s <= 1; s += 2) m.tube({ { 0, 1.28f, s * 0.24f }, { 0.02f, 1.02f, s * 0.29f }, { 0.08f, 0.82f, s * 0.26f } }, 0.045f, 8, sk, B);
    m.cylinder(0.045f, 0.12f, 10, sk, B * translate({ 0, 1.36f, 0 }));
    ellipsoid(m, { 0.02f, 1.6f, 0 }, { 0.15f, 0.18f, 0.14f }, 20, sk, B);
    for (int s = -1; s <= 1; s += 2) {
        m.sphere(0.025f, 10, mat(0xF8F4EE, 0.12f, 0, 0, Material::EYE), B * translate({ 0.14f, 1.64f, s * 0.055f }));
        m.sphere(0.014f, 8, mat(0x2A1A10, 0.15f, 0, 0, Material::EYE), B * translate({ 0.16f, 1.64f, s * 0.055f }));
    }
    if (woman) {
        ellipsoid(m, { -0.03f, 1.66f, 0 }, { 0.16f, 0.17f, 0.15f }, 18, dark, B);
        m.sphere(0.07f, 12, dark, B * translate({ -0.15f, 1.6f, 0 }));
        if (hash01(seed * 11) < 0.6f) pot_at(m, B * translate({ 0, 1.74f, 0 }), 0.7f, seed);   // a pot on her head
        else m.tube({ { 0.0f, 1.75f, -0.15f }, { -0.1f, 1.5f, -0.18f }, { -0.15f, 1.0f, -0.2f } }, 0.035f, 8, sash, B);   // a dupatta
    } else {
        for (int k = 0; k < 3; k++) m.torus(0.13f - k * 0.012f, 0.04f, 20, 6, k % 2 ? sash : mat(0xEFE6D2, 0.8f), B * translate({ 0, 1.7f + k * 0.04f, 0 }));
        for (int s = -1; s <= 1; s += 2) m.tube({ { 0.16f, 1.545f, 0 }, { 0.16f, 1.535f, s * 0.045f }, { 0.145f, 1.52f, s * 0.08f } }, 0.013f, 6, dark, B);
    }
    m.ground_ao(X.t.y, 0.3f, 0.4f);
}

/** The bronze Dancing Girl herself, standing on the origin: slender, chin up, right hand on her hip, left arm heavy
 *  with bangles. */
void statue(Mesh& m, const Xform& X) {
    const size_t from = m.vertices.size();
    const Xform B = X * scale(1.25f);
    const Material b = mat(0x9A6A40, 0.35f, 0.55f);   // polished bronze, catching the lamplight
    m.capsule({ 0, 0.05f, 0.06f }, { 0.02f, 0.5f, 0.07f }, 0.045f, 12, b, B);
    m.capsule({ 0.02f, 0.5f, 0.07f }, { 0.0f, 0.86f, 0.06f }, 0.055f, 12, b, B);
    m.capsule({ 0.08f, 0.05f, -0.08f }, { 0.04f, 0.48f, -0.06f }, 0.045f, 12, b, B);
    m.capsule({ 0.04f, 0.48f, -0.06f }, { 0.0f, 0.86f, -0.06f }, 0.055f, 12, b, B);
    ellipsoid(m, { 0, 0.92f, 0 }, { 0.09f, 0.1f, 0.13f }, 16, b, B);
    ellipsoid(m, { 0, 1.1f, 0 }, { 0.08f, 0.14f, 0.12f }, 16, b, B);
    m.capsule({ 0, 1.22f, 0 }, { 0, 1.3f, 0 }, 0.035f, 10, b, B);
    ellipsoid(m, { 0.01f, 1.4f, 0 }, { 0.085f, 0.1f, 0.08f }, 18, b, B);
    ellipsoid(m, { -0.08f, 1.42f, 0 }, { 0.06f, 0.06f, 0.06f }, 12, b, B);
    m.tube({ { 0, 1.24f, 0.13f }, { -0.02f, 1.12f, 0.2f }, { 0.04f, 1.02f, 0.17f }, { 0.04f, 0.98f, 0.12f } }, 0.03f, 10, b, B);
    std::vector<V3> left = { { 0, 1.24f, -0.13f }, { 0.02f, 1.05f, -0.17f }, { 0.04f, 0.86f, -0.18f }, { 0.06f, 0.72f, -0.16f } };
    m.tube(left, 0.028f, 10, b, B);
    for (int k = 0; k < 16; k++) {
        const float u = k / 15.0f;
        ring(m, lerp(left[0], left[3], u), left[3] - left[0], 0.036f, 0.008f, b, B, 14);
    }
    m.sphere(0.035f, 10, b, B * translate({ 0.07f, 0.68f, -0.15f }));
    m.wobble(0.004f, 30, 5, from);
}

} // namespace jr
