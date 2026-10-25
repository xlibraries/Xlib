#include "track.h"
#include "mesh.h"

#include <algorithm>
#include <cmath>

namespace jr {

namespace {

constexpr float PI = 3.14159265358979f;
constexpr float STEP = 0.25f;   // distance between centre-line samples

/** The road as a turtle walks it: (length in metres, total turn in degrees; positive turns right). */
struct Leg { float len, turn; };
const Leg LEGS[] = {
    { 40, 0 },                                                                    // the empty desert road
    { 60, 20 }, { 60, -35 }, { 50, 25 }, { 50, -10 },                             // the barren desert
    { 30, 0 }, { 25, 75 }, { 35, 0 }, { 25, -80 }, { 30, 0 }, { 25, 70 }, { 40, -65 },   // the Lower Town's lanes
    { 60, 10 },                                                                   // the Granary
    { 70, -15 },                                                                  // the Great Bath
    { 55, 35 }, { 55, -45 }, { 50, 10 },                                          // the Assembly Hall
    { 70, 110 }, { 60, -80 },                                                     // round the Great Stupa
    { 100, -5 }, { 90, 25 },                                                      // up into the Upper Town
    { 70, -20 },                                                                  // the Great Hall
    { 60, -15 }, { 60, 0 },                                                       // to the plaza
    { 30, 0 },                                                                    // the plaza itself
};

float smooth01(float a, float b, float v) { const float t = std::max(0.0f, std::min(1.0f, (v - a) / (b - a))); return t * t * (3 - 2 * t); }

} // namespace

HouseShape house_shape(uint32_t seed, bool grand) {
    HouseShape h;
    const float k = grand ? 1.35f : 1.0f;
    h.w = (3.0f + hash01(seed * 7 + 1) * 2.0f) * k;
    h.d = (2.8f + hash01(seed * 7 + 2) * 1.6f) * k;
    h.upper = hash01(seed * 7 + 3) < (grand ? 0.6f : 0.35f);
    h.h = (1.6f + hash01(seed * 7 + 4) * 0.6f) * (grand ? 1.25f : 1.0f);
    return h;
}

Sample Track::at(float s) const {
    s = std::max(0.0f, std::min(length, s));
    const float f = s / STEP;
    const size_t i = std::min(samples.size() - 1, static_cast<size_t>(f)), j = std::min(samples.size() - 1, i + 1);
    const float t = f - static_cast<float>(i);
    const Sample& a = samples[i];
    const Sample& b = samples[j];
    Sample r = a;
    r.x = a.x + (b.x - a.x) * t; r.z = a.z + (b.z - a.z) * t;
    const float tx = a.tx + (b.tx - a.tx) * t, tz = a.tz + (b.tz - a.tz) * t, l = std::sqrt(tx * tx + tz * tz);
    r.tx = tx / l; r.tz = tz / l;
    r.left = a.left + (b.left - a.left) * t; r.right = a.right + (b.right - a.right) * t;
    r.s = s;
    return r;
}

float Track::nearest(float x, float z, float* lateral, float hint) const {
    const int n = static_cast<int>(samples.size());
    int lo = 0, hi = n;
    if (hint >= 0) {
        const int c = static_cast<int>(hint / STEP), w = static_cast<int>(10 / STEP);
        lo = std::max(0, c - w); hi = std::min(n, c + w + 1);
    }
    float best = 1e30f;
    int bi = 0;
    for (int i = lo; i < hi; i++) {
        const float dx = x - samples[i].x, dz = z - samples[i].z, d = dx * dx + dz * dz;
        if (d < best) { best = d; bi = i; }
    }
    float best_s = samples[bi].s, best_d = best;
    for (int k = -1; k <= 0; k++) {
        if (bi + k < 0 || bi + k + 1 >= n) continue;
        const Sample& a = samples[bi + k];
        const Sample& b = samples[bi + k + 1];
        const float ex = b.x - a.x, ez = b.z - a.z, el = ex * ex + ez * ez;
        const float t = std::max(0.0f, std::min(1.0f, ((x - a.x) * ex + (z - a.z) * ez) / el));
        const float px = a.x + ex * t, pz = a.z + ez * t, d = (x - px) * (x - px) + (z - pz) * (z - pz);
        if (d < best_d) { best_d = d; best_s = a.s + STEP * t; }
    }
    if (lateral) {
        const Sample p = at(best_s);
        *lateral = (x - p.x) * -p.tz + (z - p.z) * p.tx;   // right of travel = (-tz, tx)
    }
    return best_s;
}

Zone Track::zone(float s) const {
    int z = 0;
    for (int i = 0; i < ZONES; i++) if (s >= ZONE_START[i]) z = i;
    return static_cast<Zone>(z);
}

float Track::road_half(float s) const {
    const auto base = [](Zone z) {
        switch (z) {
            case Zone::LowerTown: return 2.0f;
            case Zone::UpperTown: case Zone::GreatHall: case Zone::Plaza: return 3.0f;
            default: return 2.4f;
        }
    };
    // blend across zone boundaries over 12 m, then open out into the plaza
    float w = base(zone(s));
    for (int i = 1; i < ZONES; i++) {
        const float d = s - ZONE_START[i];
        if (std::fabs(d) < 6) { const float t = (d + 6) / 12; w = base(static_cast<Zone>(i - 1)) * (1 - t) + base(static_cast<Zone>(i)) * t; }
    }
    return w + 6.5f * smooth01(ROAD_END - 40, ROAD_END - 15, s);
}

float Track::elevation(float s) const { return CLIMB_HEIGHT * smooth01(CLIMB_START, CLIMB_END, s); }

bool Track::on_land(float x, float z, float hint) const {
    float lat = 0;
    const float s = nearest(x, z, &lat, hint);
    const Sample p = at(s);
    const float along = (x - p.x) * p.tx + (z - p.z) * p.tz;   // past either end of the ribbon
    if ((s <= 0.01f && along < -0.01f) || (s >= length - 0.01f && along > 0.01f)) return false;
    return lat < 0 ? -lat <= p.left : lat <= p.right;
}

Surface Track::surface(float x, float z, float hint) const {
    if (!on_land(x, z, hint)) return Surface::Void;
    float lat = 0;
    const float s = nearest(x, z, &lat, hint);
    return std::fabs(lat) <= road_half(s) ? Surface::Road : Surface::Ground;
}

float Track::height(float x, float z, float hint) const {
    float lat = 0;
    const float s = nearest(x, z, &lat, hint);
    return ground(s, lat, x, z);
}

float Track::ground(float s, float lat, float x, float z) const {
    float h = elevation(s);
    const Zone zn = zone(s);
    if (zn == Zone::Start || zn == Zone::Desert) {   // dunes rise away from the road
        const float hw = road_half(s);
        const float k = smooth01(hw + 2.5f, hw + 10, std::fabs(lat)) * (1 - smooth01(ZONE_START[2] - 30, ZONE_START[2], s));
        const float d = 0.5f + 0.5f * noise3({ x * 0.07f, 0, z * 0.07f }, 21) + 0.25f * noise3({ x * 0.19f, 1, z * 0.19f }, 22);
        h += k * std::max(0.0f, d) * 2.2f;
    }
    return h;
}

V2 Track::mover_at(const Mover& m, float t, float* yaw) const {
    const Sample p = at(m.s);
    const float lat = m.reach * std::sin(2 * PI * t / m.period + m.phase);
    if (yaw) *yaw = std::atan2(-p.tz, p.tx) - PI / 2;   // faces across the road
    return { p.x - p.tz * lat, p.z + p.tx * lat };
}

Track build_track(uint32_t seed) {
    Track t;
    // walk the legs, a sample every STEP
    {
        float x = 0, z = 0, heading = 0, s = 0;
        for (const Leg& leg : LEGS) {
            const int n = static_cast<int>(std::round(leg.len / STEP));
            const float k = leg.turn * PI / 180 / leg.len;
            for (int i = 0; i < n; i++) {
                t.samples.push_back({ x, z, std::cos(heading), std::sin(heading), s, 0, 0 });
                heading += k * STEP * 0.5f;
                x += std::cos(heading) * STEP; z += std::sin(heading) * STEP;
                heading += k * STEP * 0.5f;
                s += STEP;
            }
        }
        t.samples.push_back({ x, z, std::cos(heading), std::sin(heading), s, 0, 0 });
        t.length = s;
    }
    const int n = static_cast<int>(t.samples.size());

    // the land either side: wide enough for what stands there, never folding over on the inside of a bend
    struct Need { float s, side, reach; };   // side -1 left, +1 right
    const std::vector<Need> needs = {
        { at::GRANARY + 8, -1, 24 }, { at::GREAT_BATH + 6, 1, 24 }, { at::ASSEMBLY + 8, -1, 24 }, { at::STUPA + 4, 1, 22 },
        { at::GREAT_HALL + 8, 1, 24 }, { ROAD_END + 10, -1, 22 }, { ROAD_END + 10, 1, 22 },
    };
    std::vector<float> L(n, 15.0f), R(n, 15.0f);
    for (int i = 0; i < n; i++) {
        const float s = t.samples[i].s;
        for (const Need& d : needs) {
            const float k = 1 - smooth01(14, 26, std::fabs(s - d.s));
            float& w = d.side < 0 ? L[i] : R[i];
            w = std::max(w, 15 + (d.reach - 15) * k);
        }
        // curvature from the neighbours: the inside of a bend may reach at most 80% of its radius
        const Sample& a = t.samples[std::max(0, i - 8)];
        const Sample& b = t.samples[std::min(n - 1, i + 8)];
        const float turn = std::atan2(a.tx * b.tz - a.tz * b.tx, a.tx * b.tx + a.tz * b.tz), len = b.s - a.s;
        if (std::fabs(turn) > 1e-4f) {
            const float radius = len / std::fabs(turn);
            float& inner = turn > 0 ? R[i] : L[i];
            inner = std::min(inner, radius * 0.8f);
        }
    }
    for (int pass = 0; pass < 2; pass++) {   // smooth, keeping the folds out
        std::vector<float> L2 = L, R2 = R;
        const int w = static_cast<int>(10 / STEP);
        for (int i = 0; i < n; i++) {
            float sl = 0, sr = 0, ml = 1e9f, mr = 1e9f;
            int c = 0;
            for (int j = std::max(0, i - w); j <= std::min(n - 1, i + w); j++) { sl += L[j]; sr += R[j]; ml = std::min(ml, L[j]); mr = std::min(mr, R[j]); c++; }
            L2[i] = std::min(sl / c, ml + 3); R2[i] = std::min(sr / c, mr + 3);
        }
        L = L2; R = R2;
    }
    for (int i = 0; i < n; i++) { t.samples[i].left = L[i]; t.samples[i].right = R[i]; }

    uint32_t rng = seed * 9781u + 1;
    const auto rnd = [&]() { rng = rng * 1664525u + 1013904223u; return (rng >> 8) / 16777216.0f; };
    std::vector<Circle> taken;   // footprints already used
    const auto clear = [&](float x, float z, float r) {
        for (const Circle& c : taken) if ((x - c.x) * (x - c.x) + (z - c.z) * (z - c.z) < (r + c.r) * (r + c.r)) return false;
        return true;
    };
    /** A point beside the road: distance along, signed distance across (right positive). */
    const auto beside = [&](float s, float lat) { const Sample p = t.at(s); return V2{ p.x - p.tz * lat, p.z + p.tx * lat }; };
    const auto road_yaw = [&](float s) { const Sample p = t.at(s); return std::atan2(-p.tz, p.tx); };
    const auto fits = [&](float s, float lat, float r) {   // on the land, off the road, clear of the rest
        const V2 q = beside(s, lat);
        float l = 0;
        const float ns = t.nearest(q.x, q.z, &l);
        const Sample p = t.at(ns);
        if (std::fabs(l) - r < t.road_half(ns) + 0.3f) return false;
        if ((l < 0 ? -l : l) + r > (l < 0 ? p.left : p.right) - 0.8f) return false;
        return clear(q.x, q.z, r);
    };
    const auto prop = [&](PropKind k, float s, float lat, float yaw, float scale, uint32_t sd) {
        const V2 q = beside(s, lat);
        t.props.push_back({ k, q.x, q.z, yaw, scale, sd, s });
        return q;
    };
    const auto landmark = [&](PropKind k, float s, float side, float w, float d) {
        const float lat = side * (t.road_half(s) + d / 2 + 2.5f);
        const float yaw = road_yaw(s) + (side < 0 ? PI : 0);   // the front (local -Z) towards the road
        const V2 q = prop(k, s, lat, yaw, 1, 0);
        t.boxes.push_back({ q.x, q.z, w / 2, d / 2, yaw });
        taken.push_back({ q.x, q.z, std::hypot(w, d) / 2 + 0.5f });
        return q;
    };

    // ---- the landmarks ----
    landmark(PropKind::Granary, at::GRANARY + 8, -1, GRANARY_W, GRANARY_D);
    landmark(PropKind::GreatBath, at::GREAT_BATH + 6, 1, BATH_W, BATH_D);
    landmark(PropKind::AssemblyHall, at::ASSEMBLY + 8, -1, ASSEMBLY_W, ASSEMBLY_D);
    {
        const V2 q = beside(at::STUPA + 4, t.road_half(at::STUPA) + STUPA_R + 3.5f);
        t.props.push_back({ PropKind::Stupa, q.x, q.z, 0, 1, 0, at::STUPA + 4 });
        t.circles.push_back({ q.x, q.z, STUPA_R + 0.6f });
        taken.push_back({ q.x, q.z, STUPA_R + 2.5f });
    }
    landmark(PropKind::GreatHall, at::GREAT_HALL + 8, 1, HALL_W, HALL_D);
    {   // the Dancing Girl on her plinth in the plaza, the Guide waiting beside her
        const float s = ROAD_END + 14;
        const V2 q = prop(PropKind::DancingGirl, s, 0, road_yaw(s) + PI, 1, 0);
        t.circles.push_back({ q.x, q.z, 1.3f });
        taken.push_back({ q.x, q.z, 2.0f });
        const V2 g = prop(PropKind::Guide, s - 6, -4.2f, road_yaw(s) + PI * 0.75f, 1, 0);
        t.circles.push_back({ g.x, g.z, 0.45f });
        taken.push_back({ g.x, g.z, 0.8f });
        for (int k = 0; k < 6; k++) {
            const float a = PI * 2 * k / 6 + PI / 6;
            const V2 f = { q.x + std::cos(a) * 4.0f, q.z + std::sin(a) * 4.0f };
            t.props.push_back({ PropKind::FlowerBed, f.x, f.z, a, 1, static_cast<uint32_t>(k), s });
            t.circles.push_back({ f.x, f.z, 0.9f });
            taken.push_back({ f.x, f.z, 1.2f });
        }
        // palms and lamps round the plaza's edge
        for (int k = 0; k < 10; k++) {
            const float a = PI * 2 * k / 10, r = 10.5f;
            const V2 f = { q.x + std::cos(a) * r, q.z + std::sin(a) * r };
            if (!t.on_land(f.x, f.z)) continue;
            t.props.push_back({ k % 2 ? PropKind::Palm : PropKind::Lamp, f.x, f.z, a, 1.1f, static_cast<uint32_t>(900 + k), s });
            t.circles.push_back({ f.x, f.z, 0.3f });
            taken.push_back({ f.x, f.z, 0.9f });
        }
    }
    {   // the signboard at the edge of the desert
        const V2 q = prop(PropKind::Signboard, at::SIGNBOARD + 4, t.road_half(at::SIGNBOARD) + 1.6f, road_yaw(at::SIGNBOARD) - PI / 2, 1, 0);
        t.circles.push_back({ q.x, q.z, 0.25f });
        taken.push_back({ q.x, q.z, 1.2f });
    }
    for (float s : { at::STUPA - 14, at::STUPA + 18 }) prop(PropKind::PrayerFlags, s, 0, road_yaw(s), t.road_half(s) + 1.2f, static_cast<uint32_t>(s));

    // ---- the desert: sun banners where you land, then cacti, bones, rocks and tumbleweeds ----
    for (float s = 6; s < 40; s += 9) for (int side = -1; side <= 1; side += 2) {
        const V2 q = prop(PropKind::SunBanner, s, side * (t.road_half(s) + 1.3f), road_yaw(s), 1, static_cast<uint32_t>(s * 3 + side));
        t.circles.push_back({ q.x, q.z, 0.12f });
        taken.push_back({ q.x, q.z, 0.6f });
    }
    for (int k = 0, tries = 0; k < 34 && tries < 3000; tries++) {
        const float s = 30 + rnd() * (ZONE_START[2] - 40), lat = (rnd() < 0.5f ? -1 : 1) * (t.road_half(s) + 1.5f + rnd() * 10);
        if (!fits(s, lat, 0.5f)) continue;
        const V2 q = prop(PropKind::Cactus, s, lat, rnd() * 6.283f, 0.7f + rnd() * 0.6f, static_cast<uint32_t>(tries));
        t.circles.push_back({ q.x, q.z, 0.3f });
        taken.push_back({ q.x, q.z, 0.8f });
        k++;
    }
    for (int k = 0, tries = 0; k < 6 && tries < 600; tries++) {
        const float s = 50 + rnd() * 190, lat = (rnd() < 0.5f ? -1 : 1) * (t.road_half(s) + 2 + rnd() * 6);
        if (!fits(s, lat, 1.2f)) continue;
        const V2 q = prop(PropKind::CamelBones, s, lat, rnd() * 6.283f, 1, static_cast<uint32_t>(tries));
        taken.push_back({ q.x, q.z, 1.2f });
        k++;
    }
    for (int k = 0, tries = 0; k < 12 && tries < 1200; tries++) {
        const float s = 20 + rnd() * 230, lat = (rnd() < 0.5f ? -1 : 1) * (t.road_half(s) + 1.5f + rnd() * 9);
        if (!fits(s, lat, 0.7f)) continue;
        prop(PropKind::Tumbleweed, s, lat, rnd() * 6.283f, 0.8f + rnd() * 0.4f, static_cast<uint32_t>(tries));
        k++;
    }
    t.tumbleweed_lanes = { 85, 135, 180, 225 };

    // ---- the Lower Town's lanes and the Upper Town's streets: mud-brick houses, two rows deep where there's room ----
    const auto street = [&](float from, float to, bool grand, float gap) {
        for (int side = -1; side <= 1; side += 2) {
            float s = from + rnd() * 3;
            while (s < to) {
                const uint32_t hs = static_cast<uint32_t>(s * 13 + (side > 0 ? 7 : 0));
                const HouseShape h = house_shape(hs, grand);
                const float lat = side * (t.road_half(s) + 0.9f + h.d / 2);
                const float r = std::hypot(h.w, h.d) / 2;
                const float sc = s + h.w / 2;
                if (fits(sc, lat, r * 0.85f)) {
                    const float yaw = road_yaw(sc) + (side < 0 ? PI : 0);   // the door (local -Z) towards the road
                    const V2 q = prop(PropKind::House, sc, lat, yaw, grand ? 1.35f : 1.0f, hs);
                    t.boxes.push_back({ q.x, q.z, h.w / 2, h.d / 2, yaw });
                    taken.push_back({ q.x, q.z, r * 0.85f });
                    const float lat2 = lat + side * (h.d + 1.5f);
                    const uint32_t hs2 = hs + 1;
                    const HouseShape h2 = house_shape(hs2, grand);
                    if (fits(sc, lat2, std::hypot(h2.w, h2.d) / 2 * 0.85f)) {
                        const V2 q2 = prop(PropKind::House, sc, lat2, yaw, grand ? 1.35f : 1.0f, hs2);
                        t.boxes.push_back({ q2.x, q2.z, h2.w / 2, h2.d / 2, yaw });
                        taken.push_back({ q2.x, q2.z, std::hypot(h2.w, h2.d) / 2 * 0.85f });
                    }
                    s += h.w + gap + rnd() * gap;
                } else {
                    s += 1.5f;
                }
            }
        }
    };
    street(ZONE_START[2] + 8, ZONE_START[3] - 4, false, 0.8f);
    street(ZONE_START[7] + 20, ZONE_START[8] + 40, true, 1.6f);
    // the little things by the road
    const auto dressing = [&](PropKind k, float from, float to, int count, float r, bool solid, float scale) {
        for (int c = 0, tries = 0; c < count && tries < count * 200; tries++) {
            const float s = from + rnd() * (to - from), lat = (rnd() < 0.5f ? -1 : 1) * (t.road_half(s) + r + 0.2f + rnd() * 0.6f);
            if (!fits(s, lat, r)) continue;
            const V2 q = prop(k, s, lat, road_yaw(s) + (rnd() - 0.5f) * 0.6f, scale, static_cast<uint32_t>(tries + count));
            if (solid) t.circles.push_back({ q.x, q.z, r * 0.85f });
            taken.push_back({ q.x, q.z, r });
            c++;
        }
    };
    dressing(PropKind::Well, ZONE_START[2], ZONE_START[3], 4, 0.85f, true, 1);
    dressing(PropKind::Basket, ZONE_START[2], ZONE_START[7], 14, 0.4f, false, 1);
    dressing(PropKind::Rug, ZONE_START[2], ZONE_START[3], 6, 0.9f, false, 1);
    dressing(PropKind::Cart, ZONE_START[3], ZONE_START[6], 3, 1.3f, true, 1);
    dressing(PropKind::Lamp, ZONE_START[7], ROAD_END, 14, 0.3f, true, 1);
    for (int c = 0, tries = 0; c < 8 && tries < 2000; tries++) {   // market stalls up the hill
        const float s = ZONE_START[7] + 10 + rnd() * 170, side = rnd() < 0.5f ? -1.0f : 1.0f, lat = side * (t.road_half(s) + 1.4f);
        if (!fits(s, lat, 1.3f)) continue;
        const float yaw = road_yaw(s) + (side < 0 ? PI : 0);
        const V2 q = prop(PropKind::Stall, s, lat, yaw, 1, static_cast<uint32_t>(tries));
        t.boxes.push_back({ q.x, q.z, 1.1f, 0.7f, yaw });
        taken.push_back({ q.x, q.z, 1.4f });
        c++;
    }
    // rocks, palms (the city and the plaza) and shrubs fill in
    for (int k = 0, tries = 0; k < 40 && tries < 4000; tries++) {
        const float s = 10 + rnd() * (ROAD_END - 10), sc = 0.5f + rnd() * 0.8f, lat = (rnd() < 0.5f ? -1 : 1) * (t.road_half(s) + 1 + rnd() * 12);
        if (!fits(s, lat, sc * 0.7f)) continue;
        const V2 q = prop(PropKind::Rock, s, lat, rnd() * 6.283f, sc, static_cast<uint32_t>(tries));
        t.circles.push_back({ q.x, q.z, sc * 0.55f });
        taken.push_back({ q.x, q.z, sc * 0.7f });
        k++;
    }
    for (int k = 0, tries = 0; k < 50 && tries < 6000; tries++) {
        const float s = ZONE_START[2] - 20 + rnd() * (ROAD_END - ZONE_START[2] + 40), lat = (rnd() < 0.5f ? -1 : 1) * (t.road_half(s) + 1.2f + rnd() * 12);
        if (!fits(s, lat, 0.8f)) continue;
        const V2 q = prop(PropKind::Palm, s, lat, rnd() * 6.283f, 0.85f + rnd() * 0.45f, static_cast<uint32_t>(tries));
        t.circles.push_back({ q.x, q.z, 0.3f });
        taken.push_back({ q.x, q.z, 0.8f });
        k++;
    }
    for (int k = 0, tries = 0; k < 90 && tries < 6000; tries++) {
        const float s = rnd() * ROAD_END, sc = 0.5f + rnd() * 0.6f, lat = (rnd() < 0.5f ? -1 : 1) * (t.road_half(s) + 0.5f + rnd() * 12);
        if (!fits(s, lat, sc * 0.5f)) continue;
        const V2 q = prop(PropKind::Shrub, s, lat, rnd() * 6.283f, sc, static_cast<uint32_t>(tries));
        taken.push_back({ q.x, q.z, sc * 0.5f });
        k++;
    }

    // ---- on the road: artifacts (fuel), pottery, potholes, handcarts ----
    const ArtifactKind kinds[] = { ArtifactKind::Seal, ArtifactKind::Shard, ArtifactKind::Beads, ArtifactKind::Figurine, ArtifactKind::Bronze };
    int ai = 0;
    for (float s = 55; s < ROAD_END - 20; s += 36, ai++) {
        for (int k = 0; k < (ai % 3 == 0 ? 2 : 1); k++) {
            const float ss = s + k * 4, lat = std::sin(ai * 1.7f + k) * (t.road_half(ss) - 0.6f);
            const V2 q = beside(ss, lat);
            t.artifacts.push_back({ q.x, q.z, ss, kinds[(ai + k) % 5] });
        }
    }
    {   // the Buddhist fragment, by the Stupa
        const V2 q = beside(at::STUPA + 24, 0);
        t.artifacts.push_back({ q.x, q.z, at::STUPA + 24, ArtifactKind::Fragment });
    }
    std::sort(t.artifacts.begin(), t.artifacts.end(), [](const Artifact& a, const Artifact& b) { return a.s < b.s; });
    for (float s : { 300.0f, 380.0f, 455.0f, 640.0f, 930.0f, 1010.0f, 1060.0f }) {
        const float side = static_cast<int>(s) % 20 ? 1.0f : -1.0f, hw = t.road_half(s);
        for (int k = 0; k < 3; k++) t.pots.push_back(beside(s + (k - 1) * 0.5f, side * (hw - 0.35f - (k == 1 ? 0.55f : 0.0f))));
    }
    for (float s : { 70.0f, 160.0f, 290.0f, 318.0f, 352.0f, 398.0f, 420.0f, 462.0f, 720.0f, 950.0f, 1045.0f }) {
        const float lat = std::sin(s * 0.7f) * (t.road_half(s) - 0.9f);
        const V2 q = beside(s, lat);
        t.potholes.push_back({ q.x, q.z, 0.55f + 0.25f * hash01(static_cast<uint32_t>(s)), s });
    }
    t.movers = { { 340, 0, 5.5f, 0 }, { 440, 0, 4.8f, 1.7f }, { 985, 0, 6.0f, 0.6f }, { 1040, 0, 5.2f, 2.4f } };
    for (Mover& m : t.movers) m.reach = t.road_half(m.s) + 0.6f;
    return t;
}

} // namespace jr
