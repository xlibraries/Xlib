// JyotiRath's assets: the landmarks: the Great Bath, the stupa, the granary, the halls, the Dancing Girl on her plinth and the flower beds.
#include "models.h"
#include "parts.h"
#include "palette.h"

#include <algorithm>
#include <cmath>

namespace jr {

void great_bath(Mesh& m, const Placement& p) {
    const size_t from = m.vertices.size();
    const Xform X = place({ p.x, p.y, p.z }, p.yaw);
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

void stupa(Mesh& m, const Placement& p) {
    const size_t from = m.vertices.size();
    const Xform X = place({ p.x, p.y, p.z }, p.yaw) * scale(STUPA_R / 3.6f);
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

void granary(Mesh& m, const Placement& p) {
    const size_t from = m.vertices.size();
    const Xform X = place({ p.x, p.y, p.z }, p.yaw);
    m.rounded_box({ GRANARY_W, 0.6f, GRANARY_D }, 0.08f, mat(0xB06844, 0.88f), X * translate({ 0, 0.3f, 0 }), 2);
    for (int i = 0; i < 3; i++) for (int j = 0; j < 2; j++)
        m.rounded_box({ 2.6f, 1.1f, 2.2f }, 0.08f, vary(brick(), i * 2 + j, 0.05f), X * translate({ -3.1f + i * 3.1f, 1.15f, -1.3f + j * 2.6f }), 2);
    for (int i = 0; i < 4; i++) m.cylinder(0.08f, GRANARY_D, 10, wood(), X * translate({ -4.6f + i * 3.07f, 1.85f, -GRANARY_D / 2 }) * rotate_x(PI / 2));
    for (int s = -1; s <= 1; s += 2) m.cylinder(0.08f, GRANARY_W - 0.4f, 10, wood(), X * translate({ -GRANARY_W / 2 + 0.2f, 1.85f, s * 2.6f }) * rotate_z(-PI / 2));
    for (int i = 0; i < 6; i++) ellipsoid(m, { -4.0f + i * 1.5f, 0.85f, -GRANARY_D / 2 - 0.2f }, { 0.3f, 0.24f, 0.26f }, 12, vary(mat(0xC9AE7C, 0.95f), i, 0.05f), X);   // sacks along the front
    m.wobble(0.02f, 1.8f, 55, from);
    m.ground_ao(p.y, 0.5f, 0.4f, from);
}

void assembly_hall(Mesh& m, const Placement& p) {
    const size_t from = m.vertices.size();
    const Xform X = place({ p.x, p.y, p.z }, p.yaw);
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

void great_hall(Mesh& m, const Placement& p) {
    const size_t from = m.vertices.size();
    const Xform X = place({ p.x, p.y, p.z }, p.yaw);
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

/** Her plinth (the statue is drawn on it separately, so she can be stolen). */
void dancing_girl(Mesh& m, const Placement& p) {
    const size_t from = m.vertices.size();
    const Xform X = place({ p.x, p.y, p.z }, p.yaw);
    m.lathe({ { 0, 0 }, { 1.0f, 0 }, { 1.0f, 0.25f }, { 0.85f, 0.32f }, { 0.75f, 0.4f }, { 0.72f, 1.0f }, { 0.85f, 1.08f }, { 0.88f, 1.2f }, { 0, 1.2f } }, 32, sandstone(), X);
    for (float y : { 0.55f, 0.75f }) m.torus(0.735f, 0.025f, 32, 6, mat(0xC8A472, 0.7f), X * translate({ 0, y, 0 }));
    m.ground_ao(p.y, 0.4f, 0.4f, from);
}

void flower_bed(Mesh& m, const Placement& p) {
    const size_t from = m.vertices.size();
    const Xform X = place({ p.x, p.y, p.z }, p.yaw);
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

} // namespace jr
