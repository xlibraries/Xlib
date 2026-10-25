#include "doctest.h"
#include "games/jyotirath/drive.h"
#include "games/jyotirath/mesh.h"
#include "games/jyotirath/models.h"
#include "games/jyotirath/story.h"
#include "games/jyotirath/track.h"

#include <cmath>
#include <string>

using namespace jr;

namespace {

const Track& track() { static const Track t = build_track(); return t; }

V3 vpos(const Vertex& v) { return { v.pos[0], v.pos[1], v.pos[2] }; }
V3 vnormal(const Vertex& v) { return { v.normal[0], v.normal[1], v.normal[2] }; }

/** Every index in range, every normal unit length. */
void check_mesh(const Mesh& m) {
    REQUIRE(m.indices.size() % 3 == 0);
    for (uint32_t i : m.indices) REQUIRE(i < m.vertices.size());
    for (const Vertex& v : m.vertices) REQUIRE(length(vnormal(v)) == doctest::Approx(1.0f).epsilon(0.01));
}

struct Bounds { V3 lo{ 1e9f, 1e9f, 1e9f }, hi{ -1e9f, -1e9f, -1e9f }; };
Bounds bounds(const Mesh& m) {
    Bounds b;
    for (const Vertex& v : m.vertices) {
        b.lo = { std::min(b.lo.x, v.pos[0]), std::min(b.lo.y, v.pos[1]), std::min(b.lo.z, v.pos[2]) };
        b.hi = { std::max(b.hi.x, v.pos[0]), std::max(b.hi.y, v.pos[1]), std::max(b.hi.z, v.pos[2]) };
    }
    return b;
}

} // namespace

// ---------- mesh ----------

TEST_CASE("transforms compose, and normals stay perpendicular under non-uniform scale") {
    const Xform x = translate({ 1, 2, 3 }) * rotate_y(1.5707963f) * scale({ 2, 1, 1 });
    const V3 p = x.point({ 1, 0, 0 });
    CHECK(p.x == doctest::Approx(1.0f).epsilon(0.001));
    CHECK(p.z == doctest::Approx(1.0f).epsilon(0.001));   // +X turned a quarter about +Y is -Z... scaled by 2, then moved
    CHECK(p.y == doctest::Approx(2.0f));
    const Xform squash = scale({ 1, 0.25f, 1 });
    const V3 tangent = squash.vector(normalize({ 1, 1, 0 })), n = squash.normal(normalize({ 1, -1, 0 }));
    CHECK(std::fabs(dot(tangent, n)) < 1e-5f);
    const V3 up = align_y({ 0, 0, 2 }).vector({ 0, 1, 0 });
    CHECK(up.z == doctest::Approx(1.0f));
}

TEST_CASE("primitives are closed, well-formed and the size they say") {
    Mesh m;
    m.sphere(0.5f, 24, mat(0xffffff));
    check_mesh(m);
    for (const Vertex& v : m.vertices) CHECK(length(vpos(v)) == doctest::Approx(0.5f).epsilon(0.001));
    for (const Vertex& v : m.vertices) if (length(vpos(v)) > 0.01f) CHECK(dot(normalize(vpos(v)), vnormal(v)) > 0.98f);   // pointing out

    Mesh box;
    box.rounded_box({ 2, 1, 0.6f }, 0.1f, mat(0xffffff));
    check_mesh(box);
    const Bounds b = bounds(box);
    CHECK(b.hi.x == doctest::Approx(1.0f).epsilon(0.001));
    CHECK(b.lo.y == doctest::Approx(-0.5f).epsilon(0.001));
    CHECK(b.hi.z == doctest::Approx(0.3f).epsilon(0.001));

    Mesh rest;
    rest.cylinder(0.3f, 1, 16, mat(0xffffff), {}, 0.05f);
    rest.capsule({ 0, 0, 0 }, { 0, 0, 1 }, 0.1f, 12, mat(0xffffff));
    rest.torus(1, 0.1f, 24, 8, mat(0xffffff));
    rest.tube({ { 0, 0, 0 }, { 1, 0.5f, 0 }, { 2, 0, 0 } }, 0.05f, 8, mat(0xffffff));
    check_mesh(rest);
    const Bounds c = bounds(rest);
    CHECK(c.hi.x == doctest::Approx(2.05f).epsilon(0.01));
    CHECK(c.hi.z == doctest::Approx(1.1f).epsilon(0.01));
}

TEST_CASE("a lathe's repeated point is a hard edge; smooth profiles shade smoothly") {
    Mesh m;
    m.cylinder(1, 1, 8, mat(0xffffff));   // no bevel: the rims are hard
    bool up = false, side = false;
    for (const Vertex& v : m.vertices) {
        if (std::fabs(v.pos[1] - 1) < 1e-5f && v.normal[1] > 0.99f) up = true;
        if (std::fabs(v.pos[1] - 1) < 1e-5f && std::fabs(v.normal[1]) < 0.01f) side = true;
    }
    CHECK(up);
    CHECK(side);
}

TEST_CASE("materials pack into the vertex, and wobble and ground AO change only what they should") {
    Mesh m;
    m.add({ 0, 0, 0 }, { 0, 1, 0 }, mat(0xff8000, 0.5f, 1.0f, 0.0f, Material::SKIN));
    const Vertex v = m.vertices[0];
    CHECK((v.color & 0xff) == 255);
    CHECK(((v.color >> 8) & 0xff) == 128);
    CHECK((v.color >> 24) == 255);   // fully lit
    CHECK((v.material & 0xff) == 128);
    CHECK(((v.material >> 8) & 0xff) == 255);
    CHECK((v.material >> 24) == Material::SKIN);

    Mesh s;
    s.sphere(1, 16, mat(0xffffff));
    s.wobble(0.05f, 3, 1);
    float lo = 10, hi = 0;
    for (const Vertex& w : s.vertices) { lo = std::min(lo, length(vpos(w))); hi = std::max(hi, length(vpos(w))); }
    CHECK(lo >= 0.95f - 1e-4f);
    CHECK(hi <= 1.05f + 1e-4f);
    CHECK(hi - lo > 0.01f);   // it did something
    s.ground_ao(-1, 0.5f, 0.6f);
    for (const Vertex& w : s.vertices) {
        const int ao = static_cast<int>(w.color >> 24);
        if (w.pos[1] < -0.95f) CHECK(ao < 140);
        if (w.pos[1] > 0) CHECK(ao == 255);
    }
    CHECK(vary(mat(0x808080), 3, 0.1f).r != vary(mat(0x808080), 4, 0.1f).r);
}

TEST_CASE("noise is smooth and repeatable") {
    CHECK(noise3({ 1.3f, 2.1f, 0.4f }, 5) == noise3({ 1.3f, 2.1f, 0.4f }, 5));
    CHECK(std::fabs(noise3({ 1.3f, 2.1f, 0.4f }, 5) - noise3({ 1.31f, 2.1f, 0.4f }, 5)) < 0.05f);
    for (int i = 0; i < 100; i++) { const float n = noise3({ i * 0.37f, i * 0.11f, i * 0.53f }, 9); CHECK(n >= -1); CHECK(n <= 1); }
}

// ---------- the road ----------

TEST_CASE("the road is one smooth open path through every zone, its land never folding over") {
    const Track& t = track();
    CHECK(t.length == doctest::Approx(LAND_END).epsilon(0.001));
    for (size_t i = 0; i + 1 < t.samples.size(); i++) {
        const Sample& a = t.samples[i];
        const Sample& b = t.samples[i + 1];
        CHECK(std::hypot(b.x - a.x, b.z - a.z) == doctest::Approx(0.25f).epsilon(0.02));
        CHECK(a.tx * b.tx + a.tz * b.tz > 0.995f);
        CHECK(a.left >= 6);
        CHECK(a.right >= 6);
    }
    // parts of the road far apart along it are far apart on the ground too (no overlapping land)
    for (size_t i = 0; i < t.samples.size(); i += 20) for (size_t k = i + 400; k < t.samples.size(); k += 20) {
        const Sample& a = t.samples[i];
        const Sample& b = t.samples[k];
        CHECK(std::hypot(b.x - a.x, b.z - a.z) > std::max(a.left, a.right) + std::max(b.left, b.right) - 4);
    }
    CHECK(t.zone(0) == Zone::Start);
    CHECK(t.zone(at::GRANARY) == Zone::Granary);
    CHECK(t.zone(at::DANCING_GIRL) == Zone::Plaza);
    CHECK(t.road_half(300) < t.road_half(1000));   // narrow lanes below, wide streets above
    CHECK(t.road_half(ROAD_END + 10) > 8);         // the plaza
}

TEST_CASE("nearest finds the distance along the road and which side you're on") {
    const Track& t = track();
    for (float s = 3; s < t.length - 3; s += 37) {
        const Sample p = t.at(s);
        float lat = 0;
        const float found = t.nearest(p.x - p.tz * 1.2f, p.z + p.tx * 1.2f, &lat);
        CHECK(found == doctest::Approx(s).epsilon(0.002));
        CHECK(lat == doctest::Approx(1.2f).epsilon(0.02));
        CHECK(t.nearest(p.x, p.z, nullptr, s + 2) == doctest::Approx(s).epsilon(0.002));
    }
}

TEST_CASE("the road climbs into the Upper Town; dunes rise beside the desert road") {
    const Track& t = track();
    CHECK(t.elevation(100) == doctest::Approx(0.0f));
    CHECK(t.elevation(1100) == doctest::Approx(CLIMB_HEIGHT));
    const Sample p = t.at(150);
    CHECK(t.height(p.x, p.z) == doctest::Approx(0.0f));
    float most = 0;
    for (float lat = 8; lat < 14; lat += 0.5f) most = std::max(most, t.height(p.x - p.tz * lat, p.z + p.tx * lat));
    CHECK(most > 0.3f);
    CHECK(t.surface(p.x, p.z) == Surface::Road);
    CHECK(t.surface(p.x - p.tz * 5, p.z + p.tx * 5) == Surface::Ground);
    CHECK(t.surface(p.x - p.tz * 40, p.z + p.tx * 40) == Surface::Void);
    const Sample start = t.at(0);
    CHECK(t.surface(start.x - start.tx * 2, start.z - start.tz * 2) == Surface::Void);   // behind the start
}

TEST_CASE("every landmark stands beside its stop, off the road, on the land") {
    const Track& t = track();
    const PropKind marks[] = { PropKind::Granary, PropKind::GreatBath, PropKind::AssemblyHall, PropKind::Stupa, PropKind::GreatHall, PropKind::DancingGirl, PropKind::Guide, PropKind::Signboard };
    for (PropKind k : marks) {
        int n = 0;
        for (const Prop& p : t.props) if (p.kind == k) {
            n++;
            if (k == PropKind::DancingGirl || k == PropKind::Guide) continue;   // in the plaza
            float lat = 0;
            const float s = t.nearest(p.x, p.z, &lat);
            CHECK(std::fabs(lat) > t.road_half(s));
            CHECK(t.on_land(p.x, p.z));
        }
        CHECK(n == 1);
    }
    int houses = 0;
    for (const Prop& p : t.props) {
        houses += p.kind == PropKind::House;
        if (p.kind == PropKind::PrayerFlags || p.s > ROAD_END - 15) continue;   // flags hang over the road; the plaza is paved all over
        float lat = 0;
        const float s = t.nearest(p.x, p.z, &lat);
        CHECK(std::fabs(lat) > t.road_half(s));
        CHECK(t.on_land(p.x, p.z));
    }
    CHECK(houses >= 40);
    for (const Circle& c : t.circles) {   // nothing solid on the road, except in the plaza
        float lat = 0;
        const float s = t.nearest(c.x, c.z, &lat);
        if (s < ROAD_END - 40) CHECK(std::fabs(lat) - c.r > t.road_half(s) - 0.01f);
    }
    for (const Artifact& a : t.artifacts) CHECK(t.surface(a.x, a.z) == Surface::Road);
    for (const Pothole& h : t.potholes) CHECK(t.surface(h.x, h.z) == Surface::Road);
    for (const V2& p : t.pots) CHECK(t.surface(p.x, p.z) == Surface::Road);
    CHECK(t.artifacts.size() >= 30);
    int fragments = 0;
    for (const Artifact& a : t.artifacts) fragments += a.kind == ArtifactKind::Fragment;
    CHECK(fragments == 1);
}

// ---------- the story ----------

TEST_CASE("the chapter's stops are in order along the road, each with something to say") {
    const std::vector<Stop>& stops = chapter_one();
    REQUIRE(stops.size() == 11);
    for (size_t i = 0; i < stops.size(); i++) {
        CHECK_FALSE(stops[i].lines.empty());
        if (i > 0) CHECK(stops[i].s > stops[i - 1].s);
        for (const Line& l : stops[i].lines) CHECK(std::string(l.text).size() > 5);
    }
    CHECK(stops.front().checkpoint);
    CHECK(std::string(stops.back().place) == "The Dancing Girl");
    bool guide = false;
    for (const Line& l : stops.back().lines) guide |= l.who == Speaker::Guide;
    CHECK(guide);
    CHECK(std::string(speaker_name(Speaker::JyotiRath)) == "JyotiRath");
}

// ---------- the journey ----------

namespace {
/** Puts a game on the road at s, driving, with the story's next stop after it. */
void drive_at(Game& g, float s) {
    g.j.phase = Phase::Driving;
    g.place(s);
    const std::vector<Stop>& stops = chapter_one();
    g.j.stop = 0;
    while (g.j.stop < static_cast<int>(stops.size()) && stops[g.j.stop].s <= s) g.j.stop++;
}
/** Driving with the story out of the way (for tests of the handling). */
void no_story(Game& g) {
    g.j.phase = Phase::Driving;
    g.j.stop = static_cast<int>(chapter_one().size());
}
/** Steps until the phase changes or the time runs out. */
void until(Game& g, Phase want, float seconds, bool drive = true) {
    for (float t = 0; t < seconds && g.j.phase != want; t += 1.0f / 120) {
        if (g.j.phase == Phase::Talking && want != Phase::Talking) g.finish_talking();
        g.step(drive ? autopilot(g) : Input{}, 1.0f / 120);
    }
}
}

TEST_CASE("the chariot falls onto the empty road, then the story begins") {
    Game g(track());
    CHECK(g.j.phase == Phase::Landing);
    CHECK(g.car.y > 10);
    uint32_t seen = 0;
    for (int i = 0; i < 480 && g.j.phase == Phase::Landing; i++) { g.step({ 1, 0 }, 1.0f / 120); seen |= g.j.events; }
    CHECK((seen & EV_LAND));
    CHECK(g.j.phase == Phase::Talking);
    CHECK(g.j.stop == 0);
    CHECK(g.car.y == doctest::Approx(0.0f).epsilon(0.01));
    for (int i = 0; i < 120; i++) g.step({ 1, 0 }, 1.0f / 120);   // no driving while talking
    CHECK(g.car.forward_speed() < 0.5f);
    g.finish_talking();
    CHECK(g.j.phase == Phase::Driving);
    CHECK(g.j.stop == 1);
}

TEST_CASE("driving 30 m reaches the next stop; stops come in order and set checkpoints") {
    Game g(track());
    until(g, Phase::Talking, 3, false);
    g.finish_talking();
    until(g, Phase::Talking, 20);
    CHECK(g.j.stop == 1);
    CHECK(g.j.s >= 30);
    CHECK(g.j.checkpoint == 0);   // the 30 m prompt isn't a checkpoint
    g.finish_talking();
    until(g, Phase::Talking, 60);
    CHECK(g.j.stop == 2);
    CHECK(g.j.checkpoint == 2);   // the signboard is
}

TEST_CASE("gas accelerates to the road's top speed; sand is slower; brakes stop; reverse is slow") {
    Game a(track());
    drive_at(a, 100);
    for (int i = 0; i < 60; i++) a.step({ 1, 0 }, 1.0f / 120);
    CHECK(a.car.forward_speed() > 4.5f);
    CHECK(a.car.forward_speed() < 8.5f);
    Game top(track());
    drive_at(top, 40);
    float fastest = 0;
    for (int i = 0; i < 120 * 6; i++) { Input in = autopilot(top); in.throttle = 1; top.step(in, 1.0f / 120); fastest = std::max(fastest, top.car.forward_speed()); }
    CHECK(fastest > MAX_ROAD - 1);
    CHECK(fastest < MAX_ROAD + 0.5f);

    Game s(track());
    no_story(s);
    const Sample p = track().at(150);
    s.place(150);
    s.car.x = p.x - p.tz * 6; s.car.z = p.z + p.tx * 6;   // on the sand beside the road
    for (int i = 0; i < 120 * 2; i++) s.step({ 1, 0 }, 1.0f / 120);
    CHECK(s.car.forward_speed() < MAX_SAND + 0.5f);

    Game b(track());
    drive_at(b, 100);
    b.car.vx = std::cos(b.car.yaw) * 12; b.car.vz = std::sin(b.car.yaw) * 12;
    for (int i = 0; i < 60; i++) b.step({ -1, 0 }, 1.0f / 120);
    CHECK(b.car.forward_speed() < 0.5f);
    for (int i = 0; i < 240; i++) b.step({ -1, 0 }, 1.0f / 120);
    CHECK(b.car.forward_speed() < 0);
    CHECK(b.car.forward_speed() >= -REVERSE_MAX - 0.01f);
}

TEST_CASE("steering turns the chariot toward the side you steer; braking into a turn drifts") {
    Game g(track());
    drive_at(g, 100);
    g.car.vx = std::cos(g.car.yaw) * 8; g.car.vz = std::sin(g.car.yaw) * 8;
    const float yaw0 = g.car.yaw;
    for (int i = 0; i < 30; i++) g.step({ 0.5f, 1 }, 1.0f / 120);
    float turned = g.car.yaw - yaw0;
    while (turned > 3.14159f) turned -= 6.28318f;
    while (turned < -3.14159f) turned += 6.28318f;
    CHECK(turned > 0.2f);
    Game d(track());
    drive_at(d, 100);
    d.car.vx = std::cos(d.car.yaw) * 13; d.car.vz = std::sin(d.car.yaw) * 13;
    bool drifted = false;
    for (int i = 0; i < 50; i++) { d.step({ -1, 1 }, 1.0f / 120); drifted |= d.car.drifting; }
    CHECK(drifted);
}

TEST_CASE("the climb slows you; potholes jolt; walls push back") {
    Game flat(track()), hill(track());
    drive_at(flat, 700); drive_at(hill, CLIMB_START + 5);
    for (int i = 0; i < 120 * 2; i++) { flat.step({ 0.6f, 0 }, 1.0f / 120); hill.step({ 0.6f, 0 }, 1.0f / 120); }
    CHECK(hill.car.forward_speed() < flat.car.forward_speed() - 0.3f);
    CHECK(hill.car.y > 0.3f);

    Game p(track());
    no_story(p);
    const Pothole h = track().potholes[2];
    p.place(h.s - 4);
    p.car.x = h.x - std::cos(p.car.yaw) * 3; p.car.z = h.z - std::sin(p.car.yaw) * 3;
    p.car.vx = std::cos(p.car.yaw) * 8; p.car.vz = std::sin(p.car.yaw) * 8;
    uint32_t seen = 0;
    for (int i = 0; i < 60; i++) { p.step({}, 1.0f / 120); seen |= p.j.events; }
    CHECK((seen & EV_POTHOLE));
    CHECK(p.car.forward_speed() < 6);

    Game w(track());
    no_story(w);
    for (const Box& box : track().boxes) {
        w.place(track().nearest(box.x, box.z));
        w.car.x = box.x; w.car.z = box.z;   // dropped inside: comes out
        w.step({}, 1.0f / 120);
        const float cs = std::cos(box.yaw), sn = std::sin(box.yaw), dx = w.car.x - box.x, dz = w.car.z - box.z;
        CHECK((std::fabs(dx * cs - dz * sn) >= box.hx || std::fabs(dx * sn + dz * cs) >= box.hz));
    }
}

TEST_CASE("artifacts refill the fuel; pots fly and break") {
    Game g(track());
    no_story(g);
    g.j.fuel = 0.5f;
    const Artifact a = track().artifacts[0];
    g.place(a.s);
    g.car.x = a.x; g.car.z = a.z;
    g.step({}, 1.0f / 120);
    CHECK(g.j.artifacts == 1);
    CHECK(g.j.fuel > 0.54f);

    Game p(track());
    no_story(p);
    const Pot pot = p.pots[0];
    p.place(track().nearest(pot.x, pot.z));
    p.car.x = pot.x - 0.6f; p.car.z = pot.z; p.car.vx = 8; p.car.vz = 0;
    uint32_t seen = 0;
    for (int i = 0; i < 240; i++) { p.step({}, 1.0f / 120); seen |= p.j.events; }
    CHECK(p.pots[0].broken);
    CHECK((seen & EV_POT_HIT));
    CHECK((seen & EV_POT_BREAK));
}

TEST_CASE("running out of fuel or off the land puts you back at the last checkpoint") {
    Game g(track());
    no_story(g);
    g.j.checkpoint = 4;   // the Granary
    g.j.stop = 5;
    g.place(520);
    g.j.fuel = 0.001f;
    uint32_t seen = 0;
    for (int i = 0; i < 120 * 3 && !(seen & EV_RESPAWN); i++) { g.step({ 1, 0 }, 1.0f / 120); seen |= g.j.events; }
    CHECK((seen & EV_OUT_OF_FUEL));
    CHECK((seen & EV_RESPAWN));
    CHECK(g.j.s == doctest::Approx(at::GRANARY + 1.5f).epsilon(0.01));
    CHECK(g.j.fuel >= FUEL_RESPAWN);
    CHECK(g.j.phase == Phase::Driving);

    Game f(track());
    no_story(f);
    f.j.checkpoint = 2;
    f.j.stop = 3;
    f.place(200);
    const Sample p = track().at(200);
    f.car.x = p.x - p.tz * (p.right - 0.5f); f.car.z = p.z + p.tx * (p.right - 0.5f);
    f.car.yaw = std::atan2(p.tx, -p.tz);   // facing off the edge
    f.car.vx = -p.tz * 8; f.car.vz = p.tx * 8;
    seen = 0;
    for (int i = 0; i < 120 * 3 && !(seen & EV_RESPAWN); i++) { f.step({}, 1.0f / 120); seen |= f.j.events; }
    CHECK((seen & EV_FALL));
    CHECK((seen & EV_RESPAWN));
    CHECK(f.j.s == doctest::Approx(at::SIGNBOARD + 1.5f).epsilon(0.01));
}

TEST_CASE("the autopilot drives the whole chapter, stopping to read every stop, and never runs dry") {
    Game g(track());
    int stops = 0;
    uint32_t seen = 0;
    float t = 0, talking = 0;
    while (t < 500 && g.j.phase != Phase::Complete) {
        // pull up and listen for a couple of seconds, as the game does, then drive on from a standstill
        if (g.j.phase == Phase::Talking && (talking += 1.0f / 120) > 2) { stops++; talking = 0; g.finish_talking(); }
        g.step(autopilot(g), 1.0f / 120);
        seen |= g.j.events;
        CHECK((g.j.events & (EV_FALL | EV_OUT_OF_FUEL)) == 0);
        t += 1.0f / 120;
    }
    REQUIRE(g.j.phase == Phase::Complete);
    CHECK(stops == static_cast<int>(chapter_one().size()));
    CHECK((seen & EV_COMPLETE));
    CHECK(g.j.artifacts >= 15);
    MESSAGE("autopilot chapter: " << g.j.time << " s driving, " << g.j.artifacts << " artifacts, fuel left " << g.j.fuel);
}

TEST_CASE("handcarts cross the road and knock fuel off you; tumbleweeds blow across the desert") {
    const Track& t = track();
    Game g(t);
    no_story(g);
    g.j.stop = 4;
    const Mover m = t.movers[0];
    float hits = 0;
    for (int tries = 0; tries < 40 && hits == 0; tries++) {
        g.place(m.s - 6);
        g.clock = tries * 0.37f;
        g.j.fuel = 1;
        g.car.vx = std::cos(g.car.yaw) * 7; g.car.vz = std::sin(g.car.yaw) * 7;
        for (int i = 0; i < 160; i++) { g.step({}, 1.0f / 120); if (g.j.events & EV_BONK) hits = 1 - g.j.fuel; }
    }
    CHECK(hits > 0.02f);
    Game d(t);
    no_story(d);
    d.j.stop = 2;
    d.place(t.tumbleweed_lanes[0] - 30);
    for (int i = 0; i < 120 * 4; i++) d.step({}, 1.0f / 120);
    CHECK_FALSE(d.tumbleweeds.empty());
}

// ---------- models ----------

TEST_CASE("the chariot, its wheel and the charioteer are mid-poly and the right size") {
    const Mesh chariot = build_chariot(), wheel = build_wheel(), rider = build_rider();
    check_mesh(chariot); check_mesh(wheel); check_mesh(rider);
    CHECK(chariot.triangles() > 4000);
    CHECK(rider.triangles() > 4000);
    CHECK(chariot.triangles() + rider.triangles() + wheel.triangles() * 2 < 120000);
    const Bounds c = bounds(chariot), w = bounds(wheel), r = bounds(rider);
    CHECK(c.hi.x - c.lo.x == doctest::Approx(1.7f).epsilon(0.25));   // about 1.7 long, facing +X
    CHECK(w.hi.y == doctest::Approx(WHEEL_RADIUS).epsilon(0.08));
    CHECK(r.hi.y > 1.6f);                                            // she stands above the bowl
    bool skin = false, gold = false, eye = false;
    for (const Vertex& v : rider.vertices) { skin |= (v.material >> 24) == Material::SKIN; eye |= (v.material >> 24) == Material::EYE; }
    for (const Vertex& v : chariot.vertices) gold |= ((v.material >> 8) & 0xff) > 200;
    CHECK(skin);
    CHECK(eye);
    CHECK(gold);
}

TEST_CASE("the land is built in chunks that cover the whole road, every prop standing on the ground") {
    const Track& t = track();
    size_t triangles = 0, biggest = 0;
    float lowest = 1e9f;
    for (float s0 = 0; s0 < t.length; s0 += CHUNK) {
        const Mesh c = build_chunk(t, s0, std::min(t.length, s0 + CHUNK));
        check_mesh(c);
        triangles += c.triangles();
        biggest = std::max(biggest, c.triangles());
        for (const Vertex& v : c.vertices) lowest = std::min(lowest, v.pos[1]);
    }
    MESSAGE("land: " << triangles << " triangles, the biggest chunk " << biggest);
    CHECK(triangles > 200000);
    CHECK(biggest < 260000);
    CHECK(lowest > -4);
    // the road surface is where the track says it is
    const Mesh first = build_chunk(t, 0, CHUNK);
    const Sample p = t.at(20);
    float closest = 1e9f, y = 0;
    for (const Vertex& v : first.vertices) {
        const float d = std::hypot(v.pos[0] - p.x, v.pos[2] - p.z);
        if (d < closest) { closest = d; y = v.pos[1]; }
    }
    CHECK(closest < 0.4f);
    CHECK(y == doctest::Approx(t.height(p.x, p.z)).epsilon(0.05));
}

TEST_CASE("the Guide, the artifacts and the things on the road are well-formed") {
    const Mesh guide = build_guide();
    check_mesh(guide);
    const Bounds g = bounds(guide);
    CHECK(g.hi.y > 1.8f);
    CHECK(g.hi.y < 2.3f);
    for (ArtifactKind k : { ArtifactKind::Seal, ArtifactKind::Shard, ArtifactKind::Beads, ArtifactKind::Figurine, ArtifactKind::Bronze, ArtifactKind::Fragment }) {
        const Mesh a = build_artifact(k);
        check_mesh(a);
        const Bounds b = bounds(a);
        CHECK(b.hi.x - b.lo.x < 0.75f);
    }
    for (const Mesh& m : { build_tumbleweed(), build_handcart(), build_pot(), build_shard(), build_puff() }) check_mesh(m);
}
