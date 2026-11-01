#include "level.h"

#include <algorithm>
#include <cmath>

namespace jr {

namespace {

/** A prop's placement, for the assets. */
Placement at(const Prop& p) { return { p.x, p.y, p.z, p.yaw, p.scale, p.seed }; }

/** The shortcut's plank bridge over the pond, and its gates. */
void bridge(Mesh& m, const Track& t, bool gates) {
    const V2 a = t.shortcut_a, b = t.shortcut_b;
    const float dx = b.x - a.x, dz = b.z - a.z, l = std::hypot(dx, dz), yaw = std::atan2(-dz, dx);
    const float y = t.elevation(t.shortcut_from);
    int k = 0;
    for (float u = 8; u < l - 8; u += 0.34f, k++)
        m.rounded_box({ 0.3f, 0.08f, 3.2f }, 0.02f, vary(wood(), k, 0.05f), place({ a.x + dx / l * u, y + 0.04f, a.z + dz / l * u }, yaw), 1);
    for (int side = -1; side <= 1; side += 2) {
        std::vector<V3> rail;
        for (float u = 8; u <= l - 8; u += 1.6f) {
            const V3 q = { a.x + dx / l * u - dz / l * 1.65f * side, y, a.z + dz / l * u + dx / l * 1.65f * side };
            m.cylinder(0.05f, 0.7f, 8, wood_dark(), translate(q + V3{ 0, -0.1f, 0 }));
            rail.push_back(q + V3{ 0, 0.55f, 0 });
        }
        if (rail.size() >= 2) m.tube(rail, 0.035f, 6, wood());
    }
    for (float u : { 14.0f, l * 0.5f, l - 14 }) for (int side = -1; side <= 1; side += 2)   // piers
        m.cylinder(0.22f, 1.2f, 12, mat(0x9A8B7A, 0.85f), translate({ a.x + dx / l * u - dz / l * 1.2f * side, y - 1.15f, a.z + dz / l * u + dx / l * 1.2f * side }), 0.04f);
    if (gates) for (const Box& g : t.shortcut_gates) {   // a wooden gate across the bridge
        const Xform X = place({ g.x, y, g.z }, g.yaw);
        for (int s = -1; s <= 1; s += 2) m.cylinder(0.07f, 1.3f, 10, wood_dark(), X * translate({ 0, 0, s * 1.8f }));
        for (float hy : { 0.45f, 0.95f }) m.rounded_box({ 0.08f, 0.16f, 3.6f }, 0.03f, wood(), X * translate({ 0, hy, 0 }), 1);
        m.rounded_box({ 0.08f, 0.9f, 0.14f }, 0.02f, wood(), X * rotate_x(0.95f) * translate({ 0, 0.7f, 0 }), 1);
    }
    // the pond
    m.cylinder(t.basin_r + 4, 0.02f, 48, water(), translate({ t.basin.x, y - 0.35f, t.basin.z }));
    for (int i = 0; i < 14; i++) {
        const float ang = i * 2.39996f, r = (0.3f + 0.6f * hash01(i * 7)) * t.basin_r;
        const V3 c = { t.basin.x + std::cos(ang) * r, y - 0.33f, t.basin.z + std::sin(ang) * r };
        m.cylinder(0.22f + hash01(i) * 0.12f, 0.02f, 14, vary(mat(0x4E8F3A, 0.5f), i, 0.05f), translate(c));
        if (i % 3 == 0) ellipsoid(m, c + V3{ 0, 0.09f, 0 }, { 0.08f, 0.05f, 0.08f }, 8, mat(0xF29BB8, 0.5f));
    }
}

/** Turns a model into a ruin: cut off at a ragged height, faded, its lamps out and its water gone, rubble round it. */
void ruinify(Mesh& part, float ground, uint32_t seed) {
    float top = ground;
    for (const Vertex& v : part.vertices) top = std::max(top, v.pos[1]);
    const float h = top - ground;
    if (h < 0.05f) return;
    for (Vertex& v : part.vertices) {
        const float n = noise3({ v.pos[0] * 0.6f, 0, v.pos[2] * 0.6f }, seed) * 0.5f + 0.5f;
        const float cut = ground + h * (0.28f + 0.3f * n);
        if (v.pos[1] > cut) {
            v.pos[1] = cut - 0.04f * noise3({ v.pos[0] * 3, 1, v.pos[2] * 3 }, seed + 1);
            const V3 nn = normalize(V3{ v.normal[0] * 0.3f, 1, v.normal[2] * 0.3f });
            v.normal[0] = nn.x; v.normal[1] = nn.y; v.normal[2] = nn.z;
        }
        // faded, dusty colour; no glow; water and cloth turn to dust
        float r = (v.color & 0xff) / 255.0f, g = ((v.color >> 8) & 0xff) / 255.0f, b = ((v.color >> 16) & 0xff) / 255.0f;
        const uint32_t kind = v.material >> 24;
        const float lum = r * 0.3f + g * 0.59f + b * 0.11f;
        const float k = kind == Material::WATER || kind == Material::FOLIAGE ? 0.85f : 0.55f;
        r = (r + (lum * 0.95f + 0.05f - r) * k) * 0.85f; g = (g + (lum * 0.88f + 0.04f - g) * k) * 0.85f; b = (b + (lum * 0.78f - b) * k) * 0.85f;
        const auto byte = [](float c) { return static_cast<uint32_t>(std::max(0.0f, std::min(1.0f, c)) * 255 + 0.5f); };
        v.color = byte(r) | byte(g) << 8 | byte(b) << 16 | (v.color & 0xff000000u);
        uint32_t rough = std::max<uint32_t>(v.material & 0xff, 210), metal = ((v.material >> 8) & 0xff) / 3;
        v.material = rough | metal << 8 | 0u << 16 | (kind == Material::WATER || kind == Material::FOLIAGE ? 0u : kind) << 24;
    }
}

void rubble(Mesh& m, float x, float y, float z, float spread, uint32_t seed) {
    const size_t from = m.vertices.size();
    for (int k = 0; k < 7; k++) {
        const float a = hash01(seed * 13 + k) * 6.283f, r = spread * (0.4f + 0.6f * hash01(seed * 17 + k));
        const float sz = 0.12f + 0.18f * hash01(seed * 19 + k);
        m.rounded_box({ sz * 1.4f, sz * 0.7f, sz }, sz * 0.2f, vary(mat(0xA9846A, 0.9f), seed + k, 0.05f), place({ x + std::cos(a) * r, y + sz * 0.3f, z + std::sin(a) * r }, a), 1);
    }
    m.wobble(0.02f, 8, seed, from);
}

// ---------- the land ----------

struct Look { uint32_t road, ground; };
Look look(Zone z) {
    switch (z) {
        case Zone::Start: case Zone::Desert: return { 0xC99A62, 0xDDB77E };
        case Zone::LowerTown: return { 0xA87450, 0xCFA673 };
        case Zone::CanalRoad: return { 0xB98A5E, 0xB9A46A };
        case Zone::GrainRoad: return { 0xBF915F, 0xC2A462 };
        case Zone::Climb: return { 0xB98256, 0xC09E70 };
        case Zone::UpperTown: return { 0xC27A55, 0xBDA46E };
        case Zone::LampRoad: return { 0xBE8A5C, 0xB8A56C };
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
            m.rounded_box({ 0.86f, 0.12f, 0.2f }, 0.035f, (k % 2) ? red : pale, place({ p.x - p.tz * off, y + 0.04f, p.z + p.tx * off }, yaw), 1);
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



/** Builds one prop (its y already set) into m. */
void build_prop(Mesh& m, const Prop& p) {
    switch (p.kind) {
        case PropKind::House: house(m, at(p), house_shape(p.seed, p.scale > 1.2f)); break;
        case PropKind::Palm: palm(m, at(p)); break;
        case PropKind::Shrub: shrub(m, at(p)); break;
        case PropKind::Rock: rock(m, at(p)); break;
        case PropKind::Well: well(m, at(p)); break;
        case PropKind::Cart: cart(m, at(p)); break;
        case PropKind::Lamp: lamp(m, at(p)); break;
        case PropKind::SunBanner: sun_banner(m, at(p)); break;
        case PropKind::Cactus: cactus(m, at(p)); break;
        case PropKind::Tumbleweed: tumbleweed_into(m, place({ p.x, p.y + 0.38f * p.scale, p.z }, p.yaw) * scale(p.scale), p.seed); break;
        case PropKind::CamelBones: camel_bones(m, at(p)); break;
        case PropKind::Signboard: signboard(m, at(p)); break;
        case PropKind::Basket: basket(m, at(p)); break;
        case PropKind::Rug: rug(m, at(p)); break;
        case PropKind::Stall: stall(m, at(p)); break;
        case PropKind::PrayerFlags: prayer_flags(m, at(p)); break;
        case PropKind::Villager: villager(m, at(p)); break;
        case PropKind::Wheat: wheat(m, at(p)); break;
        case PropKind::Canal: canal(m, at(p)); break;
        case PropKind::SackPile: sack_pile(m, at(p)); break;
        case PropKind::Granary: granary(m, at(p)); break;
        case PropKind::GreatBath: great_bath(m, at(p)); break;
        case PropKind::AssemblyHall: assembly_hall(m, at(p)); break;
        case PropKind::Stupa: stupa(m, at(p)); break;
        case PropKind::GreatHall: great_hall(m, at(p)); break;
        case PropKind::DancingGirl: dancing_girl(m, at(p)); break;
        case PropKind::FlowerBed: flower_bed(m, at(p)); break;
        case PropKind::Guide: break;
    }
}

bool landmark_kind(PropKind k) {
    return k == PropKind::Granary || k == PropKind::GreatBath || k == PropKind::AssemblyHall || k == PropKind::Stupa || k == PropKind::GreatHall || k == PropKind::House;
}

float prop_y(const Track& t, const Prop& p) { return landmark_kind(p.kind) ? t.elevation(p.s) : p.kind == PropKind::Canal ? t.elevation(p.s) : t.height(p.x, p.z, p.s); }

} // namespace

Mesh build_chunk(const Track& t, float s0, float s1) {
    Mesh m;
    land(m, t, s0, s1);
    kerbs_and_potholes(m, t, s0, s1);
    if (t.shortcut_from >= s0 && t.shortcut_from < s1) bridge(m, t, false);
    for (Prop p : t.props) {
        if (p.s < s0 || p.s >= s1 || p.kind == PropKind::Guide) continue;
        if (p.district >= 0 && p.kind != PropKind::DancingGirl) continue;   // built with its district
        p.y = prop_y(t, p);
        build_prop(m, p);
    }
    return m;
}

Mesh build_district(const Track& t, int district, bool alive) {
    Mesh m;
    for (Prop p : t.props) {
        if (p.district != district || p.kind == PropKind::Guide || p.kind == PropKind::DancingGirl) continue;
        p.y = prop_y(t, p);
        if (alive) { build_prop(m, p); continue; }
        // in ruins: nobody about, nothing left lying around but rubble
        if (p.kind == PropKind::Villager || p.kind == PropKind::Rug || p.kind == PropKind::Basket || p.kind == PropKind::Cart || p.kind == PropKind::SackPile) continue;
        Mesh part;
        build_prop(part, p);
        ruinify(part, p.y, p.seed * 7 + 3);
        m.append(part);
        if (landmark_kind(p.kind) || p.kind == PropKind::Stall) rubble(m, p.x, p.y, p.z, landmark_kind(p.kind) && p.kind != PropKind::House ? 5.5f : 2.2f, p.seed + 11);
    }
    return m;
}

Mesh build_gates(const Track& t) {
    Mesh m;
    const float y = t.elevation(t.shortcut_from);
    for (const Box& g : t.shortcut_gates) {
        const Xform X = place({ g.x, y, g.z }, g.yaw);
        for (int s = -1; s <= 1; s += 2) m.cylinder(0.07f, 1.3f, 10, wood_dark(), X * translate({ 0, 0, s * 1.8f }));
        for (float hy : { 0.45f, 0.95f }) m.rounded_box({ 0.08f, 0.16f, 3.6f }, 0.03f, wood(), X * translate({ 0, hy, 0 }), 1);
        m.rounded_box({ 0.08f, 0.9f, 0.14f }, 0.02f, wood(), X * translate({ 0, 0.7f, 0 }) * rotate_x(0.95f), 1);
    }
    return m;
}

Mesh build_tool(Tool tool) {
    switch (tool) {
        case Tool::Seal: return build_relic(Relic::Seal);
        case Tool::Beads: return build_relic(Relic::Beads);
        case Tool::Bell: return build_bell();
        case Tool::Grain: return build_grain();
        case Tool::None: break;
    }
    return build_relic(Relic::Fragment);
}

Mesh build_board(const Track& t, const Board& b) {
    Mesh m;
    const Material paint = mat(0xFFFFFF, 0.5f, 0, 0.12f), edge = mat(0x6B4A30, 0.6f), gold_paint = mat(0xF2C14E, 0.35f, 0.6f, 0.2f);
    const auto where = [&](const GoNode& n) { const Sample p = t.at(n.s); return V3{ p.x - p.tz * n.lat, t.elevation(n.s) + 0.06f, p.z + p.tx * n.lat }; };
    // a shallow pool under the stepping stones
    float pool0 = 1e9f, pool1 = -1e9f;
    for (const GoNode& n : b.nodes) if (n.sink >= 0) { pool0 = std::min(pool0, n.s); pool1 = std::max(pool1, n.s); }
    if (pool1 > pool0) {
        for (float s = pool0 - 3; s < pool1 + 3; s += 1.5f) {
            const Sample p = t.at(s);
            m.rounded_box({ 1.6f, 0.04f, 7.2f }, 0.01f, water(), place({ p.x, t.elevation(s) + 0.02f, p.z }, std::atan2(-p.tz, p.tx)), 1);
        }
        for (int side = -1; side <= 1; side += 2) for (float s = pool0 - 3; s < pool1 + 3; s += 1.0f) {
            const Sample p = t.at(s);
            m.rounded_box({ 1.0f, 0.18f, 0.25f }, 0.04f, vary(brick(), static_cast<uint32_t>(s), 0.04f), place({ p.x - p.tz * 3.7f * side, t.elevation(s) + 0.06f, p.z + p.tx * 3.7f * side }, std::atan2(-p.tz, p.tx)), 1);
        }
    }
    for (size_t i = 0; i < b.nodes.size(); i++) {
        const V3 c = where(b.nodes[i]);
        const bool exit = static_cast<int>(i) == b.exit, start = static_cast<int>(i) == b.start;
        if (b.nodes[i].pillar) {   // a brick pillar with carved bands
            const size_t from = m.vertices.size();
            m.rounded_box({ 0.7f, 2.6f, 0.7f }, 0.08f, vary(mat(0xC98457, 0.85f), static_cast<uint32_t>(i), 0.04f), translate(c + V3{ 0, 1.3f, 0 }), 2);
            for (float y : { 0.9f, 2.0f }) m.rounded_box({ 0.78f, 0.12f, 0.78f }, 0.03f, sandstone(), translate(c + V3{ 0, y, 0 }), 1);
            m.wobble(0.015f, 3, static_cast<uint32_t>(i), from);
            continue;
        }
        if (b.nodes[i].sink >= 0) continue;   // stepping stones are drawn as they rise and sink
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

} // namespace jr
