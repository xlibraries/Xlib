#include "doctest.h"
#include "games/turbo-trails/eras.h"
#include "games/turbo-trails/feel.h"
#include "games/turbo-trails/font.h"
#include <fstream>
#include <iterator>
#include "games/turbo-trails/physics.h"
#include "games/turbo-trails/rules.h"
#include "games/turbo-trails/terrain.h"
#include <algorithm>
#include <cmath>
#include <cstring>

using namespace tt;

namespace {

bool has(const Run& r, RunEvent e) { return std::find(r.events.begin(), r.events.end(), e) != r.events.end(); }

// Flat ground from -20 to 400 m
std::unique_ptr<World> flat_world(const VehicleSpec& spec) {
    std::vector<float> xs, ys;
    for (float x = -20; x <= 400; x += TERRAIN_STEP) { xs.push_back(x); ys.push_back(0); }
    auto w = World::create();
    w->set_terrain(xs, ys);
    w->spawn(spec, 0, spec.wheel_r - spec.wheel_y + 0.3f);
    return w;
}

void settle(World& w, int steps = 120) { for (int i = 0; i < steps; i++) { w.drive(0, false); w.step(1.0f / 60); } }

} // namespace

TEST_CASE("terrain: deterministic, flat at the start, rougher later, with pickups and landmarks") {
    const TerrainProfile p = era(0).terrain;
    const Terrain a = build_terrain(p, 7, 4), b = build_terrain(p, 7, 4), c = build_terrain(p, 8, 4);
    CHECK(a.ys == b.ys);
    CHECK(a.ys != c.ys);
    CHECK(a.xs.front() == doctest::Approx(-20.0f));
    CHECK(a.xs.back() >= p.length - TERRAIN_STEP);
    for (float x = -20; x < 5; x += 1) CHECK(std::fabs(a.height(x)) < 0.2f);
    float early = 0, late = 0;
    for (int i = 0; i < 200; i++) { early = std::max(early, std::fabs(a.height(60 + i * 0.5f))); late = std::max(late, std::fabs(a.height(1800 + i * 0.5f))); }
    CHECK(late > early);
    CHECK(a.fuel.size() >= 6);
    CHECK(a.coins.size() > 100);
    for (const Pickup& f : a.fuel) CHECK(f.y > a.height(f.x));
    CHECK(a.landmarks.size() == 4);
    CHECK(a.landmarks[0].x < a.landmarks[3].x);
    CHECK(a.treasure.y > a.height(a.treasure.x) + 3.0f);
}

TEST_CASE("physics: the chariot rests on the ground, drives forward on gas and reverses on brake") {
    auto w = flat_world(era(0).spec);
    settle(*w);
    const Pose rest = w->pose();
    CHECK(rest.y > 0.2f);                      // didn't fall through the chain (winding is right)
    CHECK(rest.y < 1.5f);
    CHECK(w->wheel_grounded(0));
    CHECK(w->wheel_grounded(1));
    for (int i = 0; i < 180; i++) { w->drive(1, true); w->step(1.0f / 60); }
    const Pose after = w->pose();
    CHECK(after.x > 8.0f);                     // 3 s of gas: well on its way
    CHECK(after.vx > 3.0f);
    CHECK(std::fabs(after.angle) < 0.6f);      // and not flipped over by its own torque
    for (int i = 0; i < 240; i++) { w->drive(-1, true); w->step(1.0f / 60); }
    CHECK(w->pose().vx < -1.0f);
}

TEST_CASE("physics: every era's vehicle can drive 30 m on flat ground without crashing") {
    for (int e = 0; e < era_count(); e++) {
        auto w = flat_world(era(e).spec);
        settle(*w);
        float max_tilt = 0;
        for (int i = 0; i < 420; i++) { w->drive(1, true); w->step(1.0f / 60); max_tilt = std::max(max_tilt, std::fabs(w->pose().angle)); }
        CHECK_MESSAGE(w->pose().x > 30.0f, era(e).name);
        CHECK_MESSAGE(max_tilt < 1.2f, era(e).name);   // may wheelie, must not flip
    }
}

TEST_CASE("physics: a ramp launches the vehicle and the wheels report airborne, then landing impact") {
    std::vector<float> xs, ys;
    for (float x = -20; x <= 200; x += TERRAIN_STEP) { xs.push_back(x); ys.push_back(x < 20 ? 0 : x < 28 ? (x - 20) * 0.45f : 0); }
    auto w = World::create();
    w->set_terrain(xs, ys);
    const VehicleSpec spec = era(5).spec;      // the Grand Prix racer
    w->spawn(spec, 0, 1.0f);
    settle(*w);
    bool airborne = false; float impact = 0;
    for (int i = 0; i < 400; i++) {
        w->drive(1, true); w->step(1.0f / 60);
        if (!w->wheel_grounded(0) && !w->wheel_grounded(1) && w->pose().x > 28) airborne = true;
        impact = std::max(impact, w->landing_impact());
    }
    CHECK(airborne);
    CHECK(impact > 1.0f);
}

TEST_CASE("rules: fuel burns only on the throttle, cans refill it, running dry ends the run") {
    Terrain t = build_terrain(era(0).terrain, 1, 4);
    t.fuel = { { 50, 1.0f } };
    Run run;
    Pose pose; pose.y = 0.5f;
    update_run(run, t, pose, true, false, 0, {}, 1.0f, 2400);
    CHECK(run.state == RunState::Ready);
    CHECK(run.fuel == doctest::Approx(1.0f));
    RunInput gas; gas.throttle = 1;
    update_run(run, t, pose, true, false, 0, gas, 1.0f, 2400);
    CHECK(run.state == RunState::Driving);
    CHECK(run.fuel == doctest::Approx(1.0f - 1.0f / FUEL_SECONDS));
    pose.x = 50; pose.y = 1.2f;
    update_run(run, t, pose, true, false, 0, gas, 0.016f, 2400);
    CHECK(has(run, RunEvent::Fuel));
    CHECK(run.fuel == doctest::Approx(1.0f));
    run.fuel = 0.0f;
    pose.vx = 0;
    update_run(run, t, pose, true, false, 0, {}, 0.016f, 2400);
    CHECK(run.state == RunState::OutOfFuel);
    CHECK(has(run, RunEvent::OutOfFuel));
}

TEST_CASE("rules: coins, flips, the treasure, landmarks, crashes and finishing") {
    Terrain t = build_terrain(era(0).terrain, 1, 4);
    Run run; run.state = RunState::Driving;
    Pose pose;
    RunInput gas; gas.throttle = 1;
    // a coin right here
    t.coins = { { 10, 1.0f } };
    pose.x = 10; pose.y = 1.0f;
    update_run(run, t, pose, true, false, 0, gas, 0.016f, 2400);
    CHECK(has(run, RunEvent::Coin));
    CHECK(run.coins == COINS_ROAD);
    CHECK(t.coins[0].taken);
    // a full backflip in the air
    pose.omega = 6.2832f;
    for (int i = 0; i < 70; i++) update_run(run, t, pose, false, false, 0, gas, 0.016f, 2400);
    CHECK(run.flips == 1);
    CHECK(run.coins == COINS_ROAD + COINS_PER_FLIP);
    pose.omega = 0;
    // landing hard
    update_run(run, t, pose, true, false, 6.0f, gas, 0.016f, 2400);
    CHECK(has(run, RunEvent::Landing));
    // the first landmark
    pose.x = t.landmarks[0].x + 1; pose.y = t.height(pose.x) + 0.5f;
    update_run(run, t, pose, true, false, 0, gas, 0.016f, 2400);
    CHECK(has(run, RunEvent::Landmark));
    CHECK(run.last_landmark_index == 0);
    // the treasure
    pose.x = t.treasure.x; pose.y = t.treasure.y;
    update_run(run, t, pose, false, false, 0, gas, 0.016f, 2400);
    CHECK(has(run, RunEvent::Treasure));
    CHECK(run.coins == COINS_ROAD + COINS_PER_FLIP + COINS_TREASURE);
    // a roof landing crashes; an upright chassis bump doesn't
    Run ok = run; Pose up = pose;
    update_run(ok, t, up, false, true, 0, gas, 0.016f, 2400);
    CHECK(ok.state == RunState::Driving);
    Pose roof = pose; roof.angle = 3.0f;
    update_run(run, t, roof, false, true, 0, gas, 0.016f, 2400);
    CHECK(run.state == RunState::Crashed);
    // the end of the road
    Run far; far.state = RunState::Driving; Pose end; end.x = 2400 - 10;
    update_run(far, t, end, true, false, 0, gas, 0.016f, 2400);
    CHECK(far.state == RunState::Finished);
}

TEST_CASE("progress: banking a run pays distance coins, keeps the best and unlocks the next era") {
    Progress p;
    Run run; run.state = RunState::OutOfFuel; run.distance = 820; run.coins = 75;
    const int earned = finish_run(p, 0, run);
    CHECK(earned == 8 * COINS_PER_100M + 75);
    CHECK(p.coins == earned);
    CHECK(p.best[0] == 820);
    CHECK(p.unlocked == 2);                     // 820 ≥ unlock_distance(0) = 600
    Run shorter; shorter.state = RunState::Crashed; shorter.distance = 300;
    finish_run(p, 0, shorter);
    CHECK(p.best[0] == 820);
    CHECK(p.unlocked == 2);
    Run last; last.state = RunState::Finished; last.distance = 100;
    finish_run(p, ERA_COUNT - 1, last);
    CHECK(p.unlocked == 2);                     // nothing past the last era
}

TEST_CASE("progress: the shop charges tier prices and upgrades change the vehicle") {
    Progress p; p.coins = 1000;
    CHECK(buy_upgrade(p, 0, 0));
    CHECK(p.coins == 700);
    CHECK(buy_upgrade(p, 0, 0));
    CHECK(p.coins == 300);
    CHECK(!buy_upgrade(p, 0, 0));               // 550 needed
    CHECK(!buy_upgrade(p, 0, 9));
    p.upgrades[1][2] = UPGRADE_TIERS; p.coins = 10000;
    CHECK(!buy_upgrade(p, 1, 2));               // maxed
    const VehicleSpec base = era(0).spec;
    const VehicleSpec up = apply_upgrades(base, p.upgrades[0]);
    CHECK(up.max_torque > base.max_torque);
    CHECK(up.max_speed > base.max_speed);
    CHECK(up.suspension_hz == doctest::Approx(base.suspension_hz));
}

TEST_CASE("progress: round-trips through its save string and survives junk") {
    Progress p; p.coins = 1234; p.unlocked = 3; p.best[2] = 999; p.upgrades[2][1] = 2; p.upgrades[0][3] = 4;
    const Progress q = Progress::parse(p.serialize());
    CHECK(q.coins == 1234); CHECK(q.unlocked == 3); CHECK(q.best[2] == 999); CHECK(q.upgrades[2][1] == 2); CHECK(q.upgrades[0][3] == 4);
    const Progress junk = Progress::parse("v1;coins=-5;unlocked=99;best40=1;up0=9,9,9,9;garbage");
    CHECK(junk.coins == 0); CHECK(junk.unlocked == ERA_COUNT); CHECK(junk.upgrades[0][0] == UPGRADE_TIERS);
    CHECK(Progress::parse("").unlocked == 1);
}

TEST_CASE("eras: ten of them, each with a story, four landmarks with facts and a sane vehicle") {
    CHECK(era_count() == 10);
    for (int e = 0; e < era_count(); e++) {
        const Era& x = era(e);
        CHECK(std::strlen(x.story) > 80);
        CHECK(x.landmark_count == 4);
        for (int i = 0; i < x.landmark_count; i++) CHECK(std::strlen(x.landmarks[i].fact) > 20);
        CHECK(x.spec.max_torque > 0);
        CHECK(x.spec.wheel_r > 0.2f);
        CHECK(x.terrain.length >= 2000.0f);
    }
    CHECK(std::strcmp(era(0).name, "Chariots") == 0);
    CHECK(era(9).wheels_visible == false);
}

TEST_CASE("physics: leaning back lifts the nose, leaning forward in the air pitches it down, Turbo adds speed") {
    // on the ground: average pitch over three seconds of gas, leaning back, not at all, and forward; no era flips
    for (int e = 0; e < era_count(); e++) {
        float pitch[3];
        for (int k = 0; k < 3; k++) {
            auto w = flat_world(era(e).spec);
            settle(*w);
            DriveInput in; in.throttle = 1; in.motor_on = true; in.lean = 1.0f - k;
            float sum = 0, worst = 0;
            for (int i = 0; i < 180; i++) { w->drive(in); w->step(1.0f / 60); if (i >= 60) sum += w->pose().angle; worst = std::max(worst, std::fabs(w->pose().angle)); }
            pitch[k] = sum / 120;
            CHECK_MESSAGE(worst < 1.2f, std::string(era(e).name) << " lean " << in.lean);   // leaning never flips it on the flat
        }
        if (e == 0) {
            MESSAGE("chariot pitch back/flat/forward: " << pitch[0] << " " << pitch[1] << " " << pitch[2]);
            CHECK(pitch[0] > pitch[1] + 0.05f);   // nose up: a wheelie you asked for
            CHECK(pitch[2] < pitch[1] - 0.005f);  // nose pressed down
        }
    }

    // in the air, leaning forward rotates the vehicle nose-down faster than gas alone
    std::vector<float> xs, ys;
    for (float x = -20; x <= 200; x += TERRAIN_STEP) { xs.push_back(x); ys.push_back(x < 20 ? 0 : x < 28 ? (x - 20) * 0.45f : 0); }
    float omega_fwd = 0, omega_flat = 0;
    for (int variant = 0; variant < 2; variant++) {
        auto r = World::create();
        r->set_terrain(xs, ys);
        r->spawn(era(5).spec, 0, 1.0f);
        settle(*r);
        DriveInput in; in.throttle = 1; in.motor_on = true;
        float omega = 0;
        for (int i = 0; i < 400; i++) {
            const bool air = !r->wheel_grounded(0) && !r->wheel_grounded(1) && r->pose().x > 28;
            in.lean = air && variant == 1 ? -1.0f : 0.0f;
            r->drive(in); r->step(1.0f / 60);
            const bool still_air = !r->wheel_grounded(0) && !r->wheel_grounded(1);
            if (air && still_air) omega = std::min(omega, r->pose().omega);   // in flight, not the landing jolt
        }
        (variant ? omega_fwd : omega_flat) = omega;
    }
    CHECK(omega_fwd < omega_flat - 0.3f);

    // Turbo: faster over the same stretch
    auto a = flat_world(era(0).spec), b = flat_world(era(0).spec);
    settle(*a); settle(*b);
    DriveInput gas; gas.throttle = 1; gas.motor_on = true;
    DriveInput turbo = gas; turbo.boost = 1;
    for (int i = 0; i < 180; i++) { a->drive(gas); a->step(1.0f / 60); b->drive(turbo); b->step(1.0f / 60); }
    CHECK(b->pose().x > a->pose().x + 3.0f);
    CHECK(std::fabs(b->pose().angle) < 0.6f);   // and still on its wheels
}

TEST_CASE("rules: the Turbo meter fills from coins, flips and air time, and drains only while the key is held") {
    Terrain t = build_terrain(era(0).terrain, 1, 4);
    Run run; run.state = RunState::Driving;
    Pose pose; pose.x = 10; pose.y = 1.0f;
    RunInput gas; gas.throttle = 1;
    t.coins = { { 10, 1.0f }, { 10.2f, 1.0f } };
    update_run(run, t, pose, true, false, 0, gas, 0.016f, 2400);
    CHECK(run.turbo == doctest::Approx(2 * TURBO_PER_COIN));
    CHECK(!run.boosting);
    // a second in the air
    pose.x = 20;
    update_run(run, t, pose, false, false, 0, gas, 1.0f, 2400);
    CHECK(run.turbo == doctest::Approx(2 * TURBO_PER_COIN + TURBO_PER_AIR_SECOND));
    // a flip
    pose.omega = 7.0f;
    update_run(run, t, pose, false, false, 0, gas, 1.0f, 2400);
    CHECK(has(run, RunEvent::Flip));
    CHECK(run.turbo == doctest::Approx(2 * TURBO_PER_COIN + 2 * TURBO_PER_AIR_SECOND + TURBO_PER_FLIP));
    // the treasure fills it
    pose.omega = 0; pose.x = t.treasure.x; pose.y = t.treasure.y;
    update_run(run, t, pose, true, false, 0, gas, 0.016f, 2400);
    CHECK(run.turbo == doctest::Approx(1.0f));
    // holding Turbo: boosting, draining, an event once at the start
    RunInput boost = gas; boost.boost = true;
    pose.x = 30; pose.y = 1.0f;
    update_run(run, t, pose, true, false, 0, boost, 0.5f, 2400);
    CHECK(run.boosting);
    CHECK(has(run, RunEvent::Turbo));
    CHECK(run.turbo == doctest::Approx(1.0f - 0.5f / TURBO_SECONDS));
    update_run(run, t, pose, true, false, 0, boost, 0.5f, 2400);
    CHECK(!has(run, RunEvent::Turbo));
    update_run(run, t, pose, true, false, 0, gas, 0.5f, 2400);
    CHECK(!run.boosting);
    CHECK(run.turbo == doctest::Approx(1.0f - 1.0f / TURBO_SECONDS));
    // empty: the key does nothing
    run.turbo = 0;
    update_run(run, t, pose, true, false, 0, boost, 0.5f, 2400);
    CHECK(!run.boosting);
}

TEST_CASE("feel: the face reacts to flying, speed, Turbo and crashes; the body squashes on landing; blinks happen") {
    Run run; run.state = RunState::Driving;
    Pose pose; pose.vx = 2;
    Mood calm = target_mood(run, pose, true, 2, 0);
    CHECK(calm.eyes == doctest::Approx(1));
    CHECK(calm.smile > 0);
    Mood air = target_mood(run, pose, false, 2, 0);
    CHECK(air.eyes > 1.2f);
    CHECK(air.mouth_open > 0.8f);
    Mood fast = target_mood(run, pose, true, 12, 0);
    CHECK(fast.smile > calm.smile);
    run.boosting = true;
    Mood turbo = target_mood(run, pose, true, 12, 0);
    CHECK(turbo.brow < -0.5f);   // focused
    run.boosting = false;
    run.state = RunState::Crashed;
    Mood crashed = target_mood(run, pose, true, 0, 0);
    CHECK(crashed.dizzy);
    CHECK(crashed.smile < 0);

    Feel f;
    run.state = RunState::Driving;
    for (int i = 0; i < 30; i++) update_feel(f, run, pose, false, 0, 1.0f / 60, i / 60.0f);
    CHECK(f.mood.eyes > 1.2f);          // eased toward wide-eyed
    update_feel(f, run, pose, true, 8.0f, 1.0f / 60, 0.5f);   // a hard landing
    float lowest = 1, eyes = 2;
    for (int i = 0; i < 20; i++) { update_feel(f, run, pose, true, 0, 1.0f / 60, 0.5f + i / 60.0f); lowest = std::min(lowest, f.squash); eyes = std::min(eyes, f.mood.eyes); }
    CHECK(lowest < 0.9f);
    CHECK(eyes < 0.6f);                 // squinting through the impact
    CHECK(f.shake > 0);
    for (int i = 0; i < 120; i++) update_feel(f, run, pose, true, 0, 1.0f / 60, 1 + i / 60.0f);
    CHECK(f.squash == doctest::Approx(1).epsilon(0.03));
    CHECK(f.shake == 0);
    for (int i = 0; i < 60 * 6; i++) update_feel(f, run, pose, true, 0, 1.0f / 60, 3 + i / 60.0f);
    CHECK(f.blinks >= 1);
    run.boosting = true;
    for (int i = 0; i < 60; i++) update_feel(f, run, pose, true, 0, 1.0f / 60, 9 + i / 60.0f);
    CHECK(f.boost_glow > 0.9f);
}

TEST_CASE("font: the HUD font bakes into an atlas with every printable glyph and sensible widths") {
    std::ifstream in("native/fonts/LilitaOne-Regular.ttf", std::ios::binary);
    REQUIRE(in.good());
    std::vector<uint8_t> ttf((std::istreambuf_iterator<char>(in)), std::istreambuf_iterator<char>());
    Font f;
    REQUIRE(f.bake(ttf, 44));
    CHECK(f.atlas_w == 1024);
    size_t inked = 0;
    for (uint8_t a : f.atlas) inked += a > 0;
    CHECK(inked > 10000);                       // glyphs actually rendered
    CHECK(f.ascent > 30);
    CHECK(f.descent < 0);
    for (char c = 'A'; c <= 'Z'; c++) CHECK(f.glyph(c).advance > 5);
    CHECK(f.width("WWW", 44) > f.width("iii", 44) * 1.5f);
    CHECK(f.width("TURBO", 22) == doctest::Approx(f.width("TURBO", 44) * 0.5f));
    CHECK(f.glyph('\n').advance == f.glyph('?').advance);   // unknown characters draw as '?'
    // junk is refused before stb_truetype gets to read offsets out of it
    Font bad;
    CHECK(!bad.bake({ 1, 2, 3 }, 48));
    CHECK(bad.width("x", 48) == 0);
    std::vector<uint8_t> truncated(ttf.begin(), ttf.begin() + 2000);   // a real header whose tables run past the end
    CHECK(!bad.bake(truncated, 48));
    std::vector<uint8_t> forged = { 0, 1, 0, 0, 0xff, 0xff, 0, 0, 0, 0, 0, 0 };   // 65535 tables in 12 bytes
    CHECK(!bad.bake(forged, 48));
}
