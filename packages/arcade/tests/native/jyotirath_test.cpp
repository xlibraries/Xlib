#include "doctest.h"
#include "games/jyotirath/chapter.h"
#include "games/jyotirath/drive.h"
#include "games/jyotirath/level.h"
#include "games/jyotirath/story.h"
#include "games/jyotirath/track.h"

#include <algorithm>
#include <cmath>
#include <string>
#include <tuple>

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

/** Drives a run with the autopilot until it's done or failed. */
Run drive(const RunSpec& spec, std::vector<Tool> bag = {}, float seconds = 120) {
    Game g(track());
    g.start(spec, std::move(bag));
    for (float t = 0; t < seconds && g.run.state != RunState::Done && g.run.state != RunState::Failed; t += 1.0f / 120) g.step(autopilot(g), 1.0f / 120);
    return g.run;
}

/** A game driving at s (no goal beyond reaching the end of the land). */
Game driving_at(float s) {
    Game g(track());
    RunSpec r;
    r.from = s; r.to = LAND_END;
    g.start(r, {});
    return g;
}

} // namespace

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
    int overlaps = 0;
    for (size_t i = 0; i < t.samples.size(); i += 20) for (size_t k = i + 400; k < t.samples.size(); k += 20) {
        const Sample& a = t.samples[i];
        const Sample& b = t.samples[k];
        overlaps += std::hypot(b.x - a.x, b.z - a.z) <= std::max(a.left, a.right) + std::max(b.left, b.right) - 4;
    }
    CHECK(overlaps == 0);
    CHECK(t.zone(0) == Zone::Start);
    CHECK(t.zone(at::GRANARY) == Zone::Granary);
    CHECK(t.zone(at::DANCING_GIRL) == Zone::Plaza);
    CHECK(district_of(static_cast<int>(Zone::LowerTown)) == 0);
    CHECK(district_of(static_cast<int>(Zone::Plaza)) == 4);
    CHECK(district_of(static_cast<int>(Zone::CanalRoad)) == -1);
}

TEST_CASE("nearest finds the distance along the road and which side you're on") {
    const Track& t = track();
    for (float s = 3; s < t.length - 3; s += 37) {
        const Sample p = t.at(s);
        float lat = 0;
        const float found = t.nearest(p.x - p.tz * 1.2f, p.z + p.tx * 1.2f, &lat);
        CHECK(found == doctest::Approx(s).epsilon(0.002));
        CHECK(lat == doctest::Approx(1.2f).epsilon(0.02));
    }
}

TEST_CASE("heights: dunes beside the desert road, the climb, the canal sunk into the ground") {
    const Track& t = track();
    CHECK(t.elevation(100) == doctest::Approx(0.0f));
    CHECK(t.elevation(1800) == doctest::Approx(CLIMB_HEIGHT));
    const Sample p = t.at(150);
    float most = 0;
    for (float lat = 8; lat < 14; lat += 0.5f) most = std::max(most, t.height(p.x - p.tz * lat, p.z + p.tx * lat));
    CHECK(most > 0.3f);
    const float s = 700, c = t.canal_lat(s);
    REQUIRE(c > 0);
    const Sample q = t.at(s);
    CHECK(t.height(q.x - q.tz * c, q.z + q.tx * c) < -0.3f);
    CHECK(t.surface(q.x - q.tz * c, q.z + q.tx * c) == Surface::Water);
    CHECK(t.surface(q.x, q.z) == Surface::Road);
    CHECK(t.surface(p.x - p.tz * 40, p.z + p.tx * 40) == Surface::Void);
}

TEST_CASE("the canal road's shortcut: straight on across the pond, saving the detour, gated at both ends") {
    const Track& t = track();
    const float bridge = std::hypot(t.shortcut_b.x - t.shortcut_a.x, t.shortcut_b.z - t.shortcut_a.z);
    CHECK(bridge < (t.shortcut_to - t.shortcut_from) * 0.9f);
    for (int i = 0; i <= 20; i++) {
        const float u = i / 20.0f;
        CHECK(t.surface(t.shortcut_a.x + (t.shortcut_b.x - t.shortcut_a.x) * u, t.shortcut_a.z + (t.shortcut_b.z - t.shortcut_a.z) * u) == Surface::Road);
    }
    CHECK(t.shortcut_gates.size() == 2);
    CHECK(t.basin_r > 2);
}

TEST_CASE("every landmark stands beside its district, off the road; tools lie on the drives") {
    const Track& t = track();
    const PropKind marks[] = { PropKind::Granary, PropKind::GreatBath, PropKind::AssemblyHall, PropKind::Stupa, PropKind::GreatHall, PropKind::DancingGirl, PropKind::Guide, PropKind::Signboard };
    for (PropKind k : marks) {
        int n = 0;
        for (const Prop& p : t.props) if (p.kind == k) n++;
        CHECK(n == 1);
    }
    int houses = 0, villagers = 0;
    for (const Prop& p : t.props) {
        houses += p.kind == PropKind::House;
        villagers += p.kind == PropKind::Villager;
        if (p.kind == PropKind::PrayerFlags || p.kind == PropKind::Villager || p.kind == PropKind::Canal || p.s > ROAD_END - 15) continue;
        float lat = 0;
        const float s = t.nearest(p.x, p.z, &lat);
        CHECK(std::fabs(lat) > t.road_half(s));
        CHECK(t.on_land(p.x, p.z));
        if (p.kind == PropKind::House) CHECK(p.district >= 0);
    }
    CHECK(houses >= 40);
    CHECK(villagers >= 10);
    REQUIRE(t.pickups.size() >= 8);
    for (const Pickup& k : t.pickups) {
        const int z = static_cast<int>(t.zone(k.s));
        CHECK(district_of(z) < 0);   // on the drives, not in the districts
        CHECK(t.surface(k.x, k.z) != Surface::Void);
        CHECK(t.surface(k.x, k.z) != Surface::Water);
    }
}

// ---------- drives ----------

TEST_CASE("the first drive drops you on the road, then you drive it") {
    Game g(track());
    Chapter c;
    g.start(c.run_spec(0), {});
    CHECK(g.run.state == RunState::Landing);
    CHECK(g.car.y > 10);
    uint32_t seen = 0;
    for (int i = 0; i < 480 && g.run.state == RunState::Landing; i++) { g.step({ 1, 0 }, 1.0f / 120); seen |= g.run.events; }
    CHECK((seen & EV_LAND));
    CHECK(g.run.state == RunState::Driving);
    for (int i = 0; i < 120; i++) g.step({ 1, 0 }, 1.0f / 120);
    CHECK(g.car.forward_speed() > 5);
}

TEST_CASE("gas accelerates to the road's top speed; sand is slower; brakes stop; reverse is slow") {
    Game a = driving_at(100);
    for (int i = 0; i < 60; i++) a.step({ 1, 0 }, 1.0f / 120);
    CHECK(a.car.forward_speed() > 4.5f);
    Game top = driving_at(40);
    float fastest = 0;
    for (int i = 0; i < 120 * 6; i++) { Input in = autopilot(top); in.throttle = 1; top.step(in, 1.0f / 120); fastest = std::max(fastest, top.car.forward_speed()); }
    CHECK(fastest > MAX_ROAD - 1);
    CHECK(fastest < MAX_ROAD + 0.5f);
    Game s = driving_at(150);
    const Sample p = track().at(150);
    s.car.x = p.x - p.tz * 6; s.car.z = p.z + p.tx * 6;
    for (int i = 0; i < 120 * 2; i++) s.step({ 1, 0 }, 1.0f / 120);
    CHECK(s.car.forward_speed() < MAX_SAND + 0.5f);
    Game b = driving_at(100);
    b.car.vx = std::cos(b.car.yaw) * 12; b.car.vz = std::sin(b.car.yaw) * 12;
    for (int i = 0; i < 60; i++) b.step({ -1, 0 }, 1.0f / 120);
    CHECK(b.car.forward_speed() < 0.5f);
    for (int i = 0; i < 240; i++) b.step({ -1, 0 }, 1.0f / 120);
    CHECK(b.car.forward_speed() < 0);
}

TEST_CASE("steering turns toward the side you steer; braking into a turn drifts; a hill start works") {
    Game g = driving_at(100);
    g.car.vx = std::cos(g.car.yaw) * 8; g.car.vz = std::sin(g.car.yaw) * 8;
    const float yaw0 = g.car.yaw;
    for (int i = 0; i < 30; i++) g.step({ 0.5f, 1 }, 1.0f / 120);
    CHECK(g.car.yaw - yaw0 > 0.2f);
    Game d = driving_at(100);
    d.car.vx = std::cos(d.car.yaw) * 13; d.car.vz = std::sin(d.car.yaw) * 13;
    bool drifted = false;
    for (int i = 0; i < 50; i++) { d.step({ -1, 1 }, 1.0f / 120); drifted |= d.car.drifting; }
    CHECK(drifted);
    Game h = driving_at(CLIMB_START + 20);   // from a standstill on the slope
    for (int i = 0; i < 120 * 2; i++) h.step(autopilot(h), 1.0f / 120);
    CHECK(h.run.s > CLIMB_START + 30);
}

TEST_CASE("tools go in the bag, two at most") {
    const Track& t = track();
    Game g = driving_at(t.pickups[0].s - 1);
    g.car.x = t.pickups[0].x; g.car.z = t.pickups[0].z;
    g.step({}, 1.0f / 120);
    REQUIRE(g.run.bag.size() == 1);
    CHECK(g.run.bag[0] == t.pickups[0].tool);
    Game full(t);
    RunSpec r;
    r.from = t.pickups[0].s - 1; r.to = LAND_END;
    full.start(r, { Tool::Bell, Tool::Beads });
    full.car.x = t.pickups[0].x; full.car.z = t.pickups[0].z;
    full.step({}, 1.0f / 120);
    CHECK(full.run.bag.size() == 2);
    CHECK((full.run.events & EV_BAG_FULL));
}

TEST_CASE("the canal and the land's edge end a drive") {
    Game g = driving_at(700);
    const Sample p = track().at(700);
    const float c = track().canal_lat(700);
    g.car.x = p.x - p.tz * (c - 1.6f); g.car.z = p.z + p.tx * (c - 1.6f);
    g.car.vx = -p.tz * 6; g.car.vz = p.tx * 6;
    for (int i = 0; i < 120 && g.run.state == RunState::Driving; i++) g.step({}, 1.0f / 120);
    CHECK(g.run.state == RunState::Failed);
    CHECK(g.run.fail == Fail::Splash);
    Game f = driving_at(200);
    const Sample q = track().at(200);
    f.car.x = q.x - q.tz * (q.right - 0.5f); f.car.z = q.z + q.tx * (q.right - 0.5f);
    f.car.vx = -q.tz * 8; f.car.vz = q.tx * 8;
    for (int i = 0; i < 120 && f.run.state == RunState::Driving; i++) f.step({}, 1.0f / 120);
    CHECK(f.run.fail == Fail::Fell);
}

TEST_CASE("every drive in the chapter can be finished by the autopilot, whatever came before") {
    for (int run = 0; run < 5; run++) {
        for (Style style : { Style::Steady, Style::Quiet, Style::Rough, Style::Slow }) {
            Chapter c;
            c.lower_town = style;
            const RunSpec spec = c.run_spec(run);
            const Run r = drive(spec);
            INFO("run " << run << " goal " << goal_name(spec.goal));
            CHECK(r.state == RunState::Done);
            CHECK(r.fail == Fail::None);
            if (spec.goal == Goal::Deliver) CHECK(r.cargo >= 3);
            if (spec.goal == Goal::Clock) CHECK(r.time < spec.time);
            if (spec.goal == Goal::Lamps) { CHECK(r.lamps == static_cast<int>(track().beacons.size())); CHECK(r.light > 0); }
            if (run != 1) break;   // only the canal road depends on the style
        }
    }
}

TEST_CASE("the shortcut is faster than the long way round, and the gates block it unless it's earned") {
    Chapter quiet, steady;
    quiet.lower_town = Style::Quiet;
    steady.lower_town = Style::Steady;
    RunSpec a = quiet.run_spec(1), b = steady.run_spec(1);
    REQUIRE(a.shortcut);
    REQUIRE_FALSE(b.shortcut);
    b.goal = Goal::Reach;
    const Run with = drive(a), without = drive(b);
    CHECK(with.time < without.time - 1);
    // without it, driving straight at the bridge stops at the gate
    Game g(track());
    g.start(b, {});
    g.place(track().shortcut_from);
    const float dx = track().shortcut_b.x - track().shortcut_a.x, dz = track().shortcut_b.z - track().shortcut_a.z;
    g.car.yaw = std::atan2(dz, dx);
    for (int i = 0; i < 120 * 4 && g.run.state == RunState::Driving; i++) g.step({ 1, 0 }, 1.0f / 120);
    CHECK(std::hypot(g.car.x - track().shortcut_a.x, g.car.z - track().shortcut_a.z) < 24);
}

TEST_CASE("chasers catch you if you dawdle; the clock runs out; potholes spill the grain") {
    Chapter rough;
    rough.lower_town = Style::Rough;
    Game g(track());
    g.start(rough.run_spec(1), {});
    for (int i = 0; i < 120 * 10 && g.run.state == RunState::Driving; i++) g.step({}, 1.0f / 120);   // sit still
    CHECK(g.run.fail == Fail::Caught);
    Chapter c;
    Game s(track());
    s.start(c.run_spec(3), {});
    for (int i = 0; i < 120 * 10 && s.run.state == RunState::Driving; i++) s.step({}, 1.0f / 120);
    CHECK(s.run.fail == Fail::Storm);
    Chapter slow;
    slow.lower_town = Style::Slow;
    Game k(track());
    k.start(slow.run_spec(1), {});
    for (int i = 0; i < 120 * 40 && k.run.state == RunState::Driving; i++) k.step({ 0.4f, 0 }, 1.0f / 120);
    CHECK(k.run.state == RunState::Failed);
    Game d(track());
    d.start(c.run_spec(2), {});
    const int before = d.run.cargo;
    const Pothole* h = nullptr;
    for (const Pothole& p : track().potholes) if (track().zone(p.s) == Zone::GrainRoad) { h = &p; break; }
    REQUIRE(h != nullptr);
    d.place(h->s);
    d.car.x = h->x; d.car.z = h->z;
    d.step({}, 1.0f / 120);
    CHECK(d.run.cargo == before - 1);
}

TEST_CASE("the lamp road: driving close past a lamp lights it and buys light; the dark ends the drive") {
    const Track& t = track();
    REQUIRE(t.beacons.size() == 12);
    for (const Beacon& b : t.beacons) {
        CHECK(t.zone(b.s) == Zone::LampRoad);
        float lat = 0;
        t.nearest(b.x, b.z, &lat, b.s);
        CHECK(std::fabs(lat) > t.road_half(b.s));                        // off the road...
        CHECK(std::fabs(lat) - t.road_half(b.s) < BEACON_REACH - 0.5f);  // ...but close enough to light from it
    }
    Chapter c;
    const RunSpec spec = c.run_spec(4);
    CHECK(spec.goal == Goal::Lamps);
    Game g(track());
    g.start(spec, {});
    const float light = g.run.light;
    g.place(t.beacons[0].s);
    float lat = 0;
    t.nearest(t.beacons[0].x, t.beacons[0].z, &lat, t.beacons[0].s);
    const Sample p = t.at(t.beacons[0].s);
    const float l = lat - (lat > 0 ? 1.5f : -1.5f);
    g.car.x = p.x - p.tz * l; g.car.z = p.z + p.tx * l;
    g.step({}, 1.0f / 120);
    CHECK(g.run.lamps == 1);
    CHECK(g.run.lit[0]);
    CHECK(g.run.light > light);
    CHECK((g.run.events & EV_LAMP) != 0);
    Game dark(track());
    dark.start(spec, {});
    for (int i = 0; i < 120 * 20 && dark.run.state == RunState::Driving; i++) dark.step({}, 1.0f / 120);   // sit in the dusk
    CHECK(dark.run.fail == Fail::Dark);
}

TEST_CASE("a drive handed over from a scene starts already rolling") {
    Chapter c;
    const RunSpec spec = c.run_spec(2);
    CHECK(spec.speed > 0);
    Game g(track());
    g.start(spec, {});
    CHECK(g.car.forward_speed() == doctest::Approx(spec.speed));
    g.step({}, 1.0f / 120);
    CHECK(g.run.s > spec.from);
    CHECK(c.run_spec(0).speed == 0);   // the first drive drops from the sky
}

// ---------- the chapter ----------

TEST_CASE("the chapter alternates drives and boards, six boards to five drives, ending at the Dancing Girl") {
    const std::vector<Beat>& beats = chapter_beats();
    REQUIRE(beats.size() == 12);
    int boards = 0, drives = 0;
    for (const Beat& b : beats) { boards += b.kind == BeatKind::Board; drives += b.kind == BeatKind::Drive; }
    CHECK(boards == BOARDS);
    CHECK(drives == 5);
    CHECK(beats.front().kind == BeatKind::Drive);
    CHECK(beats[beats.size() - 2].kind == BeatKind::Board);   // the thief
    CHECK(beats[beats.size() - 2].index == BOARDS - 1);
    CHECK(beats.back().kind == BeatKind::Finale);
    // each drive starts a roll past the board before it, and ends a roll short of the next
    Chapter c;
    for (size_t i = 0; i < beats.size(); i++) {
        if (beats[i].kind != BeatKind::Drive) continue;
        const RunSpec r = c.run_spec(beats[i].index);
        CHECK(r.to > r.from + 150);
        if (i + 1 < beats.size() && beats[i + 1].kind == BeatKind::Board) { const Board& n = chapter_board(beats[i + 1].index); CHECK(r.to == doctest::Approx(n.nodes[n.start].s - ROLL_IN)); }
        if (i > 0 && beats[i - 1].kind == BeatKind::Board) { const Board& p = chapter_board(beats[i - 1].index); CHECK(r.from == doctest::Approx(p.nodes[p.exit].s + ROLL_OUT)); }
    }
}

TEST_CASE("how you solve the Lower Town picks the canal road: quiet earns the shortcut, rough brings the zebu, slow the clock") {
    const Board& b = chapter_board(0);
    GoState quiet(b), rough(b), slow(b), steady(b);
    quiet.won = rough.won = slow.won = steady.won = true;
    rough.bull_nudged = true; rough.nudges = 1;
    slow.nudges = 1; slow.moves = b.par + 20;
    steady.nudges = 1; steady.moves = b.par;
    CHECK(style_of(quiet) == Style::Quiet);
    CHECK(style_of(rough) == Style::Rough);
    CHECK(style_of(slow) == Style::Slow);
    CHECK(style_of(steady) == Style::Steady);
    for (const auto& [g, goal, shortcut] : { std::tuple{ &quiet, Goal::Reach, true }, std::tuple{ &rough, Goal::Chase, false }, std::tuple{ &slow, Goal::Clock, false }, std::tuple{ &steady, Goal::Clock, false } }) {
        Chapter c;
        c.beat = 1;
        c.board_cleared(0, *g);
        CHECK(c.beat == 2);
        CHECK(c.restored[0]);
        const RunSpec r = c.run_spec(1);
        CHECK(r.goal == goal);
        CHECK(r.shortcut == shortcut);
    }
    Chapter s, l;
    s.lower_town = Style::Slow; l.lower_town = Style::Steady;
    CHECK(s.run_spec(1).time < l.run_spec(1).time);
}

TEST_CASE("the bag carries over; a quiet board earns a gift; delivered grain earns some back; the clue is kept") {
    Chapter c;
    c.beat = 3;
    GoState g(chapter_board(1), { Tool::Seal });
    g.won = true;
    const Tool gift = c.board_cleared(1, g);
    CHECK(gift == Tool::Beads);
    REQUIRE(c.bag.size() == 2);
    CHECK(c.bag[0] == Tool::Seal);
    Run r;
    r.spec.goal = Goal::Deliver;
    r.cargo = 5;
    r.bag = { Tool::Seal };
    c.run_done(r);
    CHECK(c.delivered == 5);
    REQUIRE(c.bag.size() == 2);
    CHECK(c.bag[1] == Tool::Grain);
    const Board& citadel = chapter_board(3);
    GoState h(citadel);
    for (size_t k = 0; k < citadel.items.size(); k++) if (citadel.items[k].tool == Tool::None) h.taken[k] = true;
    h.won = true;
    Chapter d;
    d.board_cleared(3, h);
    CHECK(d.fragment);
}

TEST_CASE("the chapter saves and loads") {
    Chapter c;
    c.beat = 6;
    c.bag = { Tool::Bell, Tool::Grain };
    c.restored[0] = c.restored[2] = true;
    c.fragment = true;
    c.last = Style::Rough;
    c.lower_town = Style::Quiet;
    c.stars[0] = 3; c.stars[2] = 1; c.stars[5] = 2;
    c.delivered = 4;
    c.lamps = 9;
    const Chapter d = Chapter::load(c.save());
    CHECK(d.beat == 6);
    CHECK(d.bag == c.bag);
    CHECK(d.restored[0]);
    CHECK_FALSE(d.restored[1]);
    CHECK(d.restored[2]);
    CHECK(d.fragment);
    CHECK(d.last == Style::Rough);
    CHECK(d.lower_town == Style::Quiet);
    CHECK(d.stars[0] == 3);
    CHECK(d.delivered == 4);
    CHECK(d.lamps == 9);
    CHECK(d.stars[5] == 2);
    CHECK(Chapter::load("1;9;;11111;1;0;0;33333;6").beat == static_cast<int>(chapter_beats().size()) - 1);   // an old save at the end
    CHECK(Chapter::load("1;4;;11000;0;0;0;33000;0").beat == 4);
    CHECK(Chapter::load("rubbish").beat == 0);
    CHECK(Chapter::load("").bag.empty());
}

TEST_CASE("every beat has something to say; the canal road's depends on the Lower Town; the ending on the fragment") {
    Chapter c;
    for (c.beat = 0; c.beat < static_cast<int>(chapter_beats().size()); c.beat++) {
        CHECK_FALSE(beat_intro(c).empty());
        for (const Line& l : beat_intro(c)) CHECK(std::string(l.text).size() > 5);
    }
    Chapter q, r;
    q.beat = r.beat = 2;
    q.lower_town = Style::Quiet; r.lower_town = Style::Rough;
    CHECK(std::string(beat_intro(q)[0].text) != std::string(beat_intro(r)[0].text));
    Chapter with, without;
    with.beat = without.beat = static_cast<int>(chapter_beats().size()) - 1;
    with.fragment = true;
    CHECK(std::string(beat_intro(with).back().text).find("Ajanta") != std::string::npos);
    CHECK(std::string(beat_intro(without).back().text).find("Citadel") != std::string::npos);
    for (int b = 0; b < BOARDS; b++) CHECK_FALSE(board_outro(b).empty());
    CHECK(std::string(fail_text(Fail::Caught)).size() > 5);
    CHECK(std::string(fail_text(Fail::Dark)).size() > 5);
}

TEST_CASE("someone stops the chariot at every board, and someone sends it off on every drive after one") {
    for (int b = 0; b < BOARDS; b++) {
        const std::vector<Line>& lines = arrival_lines(b);
        REQUIRE_FALSE(lines.empty());
        bool local = false;
        for (const Line& l : lines) { CHECK(std::string(speaker_name(l)).size() > 2); local |= l.who == Speaker::Local; }
        CHECK(local);
    }
    CHECK(arrival_figure(BOARDS - 1) == Figure::Thief);
    Chapter c;
    for (c.beat = 0; c.beat < static_cast<int>(chapter_beats().size()); c.beat++) {
        const Beat& b = chapter_beats()[c.beat];
        if (b.kind != BeatKind::Drive || c.beat == 0) continue;
        CHECK(departure_figure(c) != Figure::None);
        bool local = false;
        for (const Line& l : beat_intro(c)) local |= l.who == Speaker::Local;
        CHECK(local);   // whoever stands there has a say
    }
    c.beat = 2;
    c.lower_town = Style::Rough;
    CHECK(departure_figure(c) == Figure::Zebu);
}

// ---------- models ----------

TEST_CASE("the chariot, its wheel and the charioteer are mid-poly and the right size") {
    const Mesh chariot = build_chariot(), wheel = build_wheel(), rider = build_rider();
    check_mesh(chariot); check_mesh(wheel); check_mesh(rider);
    CHECK(chariot.triangles() > 4000);
    CHECK(rider.triangles() > 4000);
    CHECK(bounds(wheel).hi.y == doctest::Approx(WHEEL_RADIUS).epsilon(0.08));
    CHECK(bounds(rider).hi.y > 1.6f);
}

TEST_CASE("the land is built in chunks; every district has an alive and a ruined version, the ruins lower") {
    const Track& t = track();
    size_t triangles = 0, biggest = 0;
    for (float s0 = 0; s0 < t.length; s0 += CHUNK) {
        const Mesh c = build_chunk(t, s0, std::min(t.length, s0 + CHUNK));
        check_mesh(c);
        triangles += c.triangles();
        biggest = std::max(biggest, c.triangles());
    }
    MESSAGE("land: " << triangles << " triangles, the biggest chunk " << biggest);
    CHECK(biggest < 260000);
    for (int d = 0; d < DISTRICTS; d++) {
        const Mesh alive = build_district(t, d, true), ruin = build_district(t, d, false);
        check_mesh(alive);
        check_mesh(ruin);
        CHECK(alive.triangles() > 1000);
        CHECK(ruin.triangles() > 500);
        CHECK(bounds(ruin).hi.y < bounds(alive).hi.y);
    }
}

TEST_CASE("the people, the tools and the board pieces are well-formed") {
    for (const Mesh& m : { build_guide(), build_watchman(), build_zebu(), build_villager(3), build_villager(8), build_sack(), build_stone(), build_handcart(), build_tumbleweed(), build_fragment(), build_gates(track()),
                           build_statue(), build_thief(), build_beacon(false), build_beacon(true), build_pointer(), build_glow_ring() }) check_mesh(m);
    CHECK(bounds(build_statue()).hi.y > 1.6f);
    CHECK(bounds(build_thief()).hi.y > 1.6f);
    CHECK(bounds(build_beacon(true)).hi.y > bounds(build_beacon(false)).hi.y);   // a flame on top
    for (Tool k : { Tool::Seal, Tool::Bell, Tool::Beads, Tool::Grain }) {
        const Mesh m = build_tool(k);
        check_mesh(m);
        CHECK(bounds(m).hi.x - bounds(m).lo.x < 0.75f);
    }
    for (int b = 0; b < BOARDS; b++) check_mesh(build_board(track(), chapter_board(b)));
}
