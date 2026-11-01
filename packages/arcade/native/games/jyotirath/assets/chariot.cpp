// JyotiRath's assets: the golden chariot, its wheels, and the charioteer with her eyes and lids.
#include "models.h"
#include "parts.h"
#include "palette.h"

#include <algorithm>
#include <cmath>

namespace jr {

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

} // namespace jr
