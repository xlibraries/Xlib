#include "rules.h"
#include <algorithm>
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <cstring>

namespace tt {

constexpr float TWO_PI = 6.2831853f;

std::string Progress::serialize() const {
    std::string s = "v1;coins=" + std::to_string(coins) + ";unlocked=" + std::to_string(unlocked);
    for (int e = 0; e < ERA_COUNT; e++) {
        s += ";best" + std::to_string(e) + "=" + std::to_string(best[e]);
        s += ";up" + std::to_string(e) + "=";
        for (int k = 0; k < UPGRADE_KINDS; k++) s += (k ? "," : "") + std::to_string(upgrades[e][k]);
    }
    return s;
}

Progress Progress::parse(const std::string& text) {
    Progress p;
    if (text.rfind("v1;", 0) != 0) return p;
    size_t pos = 3;
    while (pos < text.size()) {
        const size_t end = text.find(';', pos);
        const std::string item = text.substr(pos, end == std::string::npos ? std::string::npos : end - pos);
        pos = end == std::string::npos ? text.size() : end + 1;
        const size_t eq = item.find('=');
        if (eq == std::string::npos) continue;
        const std::string key = item.substr(0, eq), value = item.substr(eq + 1);
        const auto clamp = [](long v, long lo, long hi) { return static_cast<int>(std::max(lo, std::min(hi, v))); };
        if (key == "coins") p.coins = clamp(std::atol(value.c_str()), 0, 1000000000);
        else if (key == "unlocked") p.unlocked = clamp(std::atol(value.c_str()), 1, ERA_COUNT);
        else if (key.rfind("best", 0) == 0) { const int e = std::atoi(key.c_str() + 4); if (e >= 0 && e < ERA_COUNT) p.best[e] = clamp(std::atol(value.c_str()), 0, 100000000); }
        else if (key.rfind("up", 0) == 0) {
            const int e = std::atoi(key.c_str() + 2);
            if (e < 0 || e >= ERA_COUNT) continue;
            const char* c = value.c_str();
            for (int k = 0; k < UPGRADE_KINDS && *c; k++) { p.upgrades[e][k] = clamp(std::atol(c), 0, UPGRADE_TIERS); c = std::strchr(c, ','); if (!c) break; c++; }
        }
    }
    return p;
}

VehicleSpec apply_upgrades(VehicleSpec s, const int tiers[UPGRADE_KINDS]) {
    s.max_torque *= 1.0f + 0.22f * tiers[0];          // engine: torque and top speed
    s.max_speed *= 1.0f + 0.10f * tiers[0];
    s.suspension_hz *= 1.0f + 0.12f * tiers[1];       // suspension: stiffer, better damped
    s.suspension_damping = std::min(1.0f, s.suspension_damping + 0.08f * tiers[1]);
    s.tyre_friction *= 1.0f + 0.15f * tiers[2];       // tyres: grip
    s.air_torque *= 1.0f + 0.15f * tiers[3];          // chassis: control in the air
    return s;
}

int upgrade_price(int tier) { return tier >= UPGRADE_TIERS ? 0 : UPGRADE_PRICES[tier]; }

bool buy_upgrade(Progress& p, int era, int kind) {
    if (era < 0 || era >= ERA_COUNT || kind < 0 || kind >= UPGRADE_KINDS) return false;
    const int price = upgrade_price(p.upgrades[era][kind]);
    if (price == 0 || p.coins < price) return false;
    p.coins -= price;
    p.upgrades[era][kind]++;
    return true;
}

int unlock_distance(int era) { return 600 + era * 150; }

namespace {

bool take_pickups(std::vector<Pickup>& items, float x, float y, float radius, int& taken_count) {
    bool any = false;
    for (Pickup& p : items) {
        if (p.taken) continue;
        const float dx = p.x - x, dy = p.y - y;
        if (dx * dx + dy * dy <= radius * radius) { p.taken = true; taken_count++; any = true; }
    }
    return any;
}

} // namespace

void update_run(Run& run, Terrain& terrain, const Pose& pose, bool grounded, bool chassis_hit, float impact, const RunInput& in, float dt, float road_length, int front_grounded) {
    run.events.clear();
    if (run.state != RunState::Ready && run.state != RunState::Driving) return;
    if (run.state == RunState::Ready && in.throttle != 0) run.state = RunState::Driving;
    if (run.state != RunState::Driving) return;

    // fuel burns only while the motor runs
    if (in.throttle != 0) run.fuel = std::max(0.0f, run.fuel - std::fabs(in.throttle) * dt / FUEL_SECONDS);
    run.distance = std::max(run.distance, pose.x);

    // Turbo: spent while the key is held and the meter has anything in it
    const bool boosting = in.boost && run.turbo > 0;
    if (boosting && !run.boosting) run.events.push_back(RunEvent::Turbo);
    run.boosting = boosting;
    if (boosting) run.turbo = std::max(0.0f, run.turbo - dt / TURBO_SECONDS);

    // flips: full rotations while airborne
    if (!grounded) {
        if (!run.airborne) run.air_rotation = 0;
        run.air_rotation += pose.omega * dt;
        if (std::fabs(run.air_rotation) >= TWO_PI * 0.9f) {
            run.flips++;
            run.coins += COINS_PER_FLIP;
            run.turbo += TURBO_PER_FLIP;
            run.last_flip_backward = run.air_rotation > 0;   // anticlockwise: the nose went up and over
            run.air_rotation -= std::copysign(TWO_PI, run.air_rotation);
            run.events.push_back(RunEvent::Flip);
        }
    } else if (run.airborne) {
        run.air_rotation = 0;
        if (impact > 4.0f) run.events.push_back(RunEvent::Landing);
    }
    run.airborne = !grounded;
    if (!grounded) run.turbo += TURBO_PER_AIR_SECOND * dt;

    // wheelies: the front wheel up while rolling along; paid by the second once it's over
    const bool front_up = grounded && (front_grounded < 0 ? false : front_grounded == 0) && std::fabs(pose.vx) > 1.5f;
    if (front_up) run.wheelie_time += dt;
    else if (run.wheelie_time > 0) {
        if (run.wheelie_time >= WHEELIE_MIN_SECONDS) {
            run.coins += static_cast<int>(run.wheelie_time) * COINS_PER_WHEELIE_SECOND;
            run.turbo += 0.08f * run.wheelie_time;
            run.last_wheelie = run.wheelie_time;
            run.events.push_back(RunEvent::Wheelie);
        }
        run.wheelie_time = 0;
    }

    // stuck: no movement for a while with the gas on, or lying tipped over
    const bool trying = in.throttle != 0 || std::fabs(pose.angle) > 1.0f;
    run.stuck_time = std::fabs(pose.vx) < 0.4f && trying ? run.stuck_time + dt : 0.0f;

    // pickups near the chassis
    int n = 0;
    if (take_pickups(terrain.coins, pose.x, pose.y, 1.1f, n)) { run.coins += COINS_ROAD * n; run.turbo += TURBO_PER_COIN * n; run.events.push_back(RunEvent::Coin); }
    n = 0;
    if (take_pickups(terrain.fuel, pose.x, pose.y, 1.3f, n)) { run.fuel = 1.0f; run.events.push_back(RunEvent::Fuel); }
    if (!terrain.treasure.taken) {
        const float dx = terrain.treasure.x - pose.x, dy = terrain.treasure.y - pose.y;
        if (dx * dx + dy * dy <= 1.5f * 1.5f) { terrain.treasure.taken = true; run.coins += COINS_TREASURE; run.turbo = 1.0f; run.events.push_back(RunEvent::Treasure); }
    }
    run.turbo = std::min(1.0f, run.turbo);
    if (run.next_landmark < static_cast<int>(terrain.landmarks.size()) && pose.x >= terrain.landmarks[run.next_landmark].x) {
        run.last_landmark_index = terrain.landmarks[run.next_landmark].index;
        run.landmark_timer = 4.0f;
        run.next_landmark++;
        run.events.push_back(RunEvent::Landmark);
    }
    run.landmark_timer = std::max(0.0f, run.landmark_timer - dt);

    // how the run ends
    const bool upside_down = std::cos(pose.angle) < -0.2f;
    if (chassis_hit && upside_down) { run.state = RunState::Crashed; run.events.push_back(RunEvent::Crash); }
    else if (run.stuck_time >= STUCK_SECONDS) { run.state = RunState::Crashed; run.events.push_back(RunEvent::Stuck); }
    else if (run.fuel <= 0 && std::fabs(pose.vx) < 0.3f) { run.state = RunState::OutOfFuel; run.events.push_back(RunEvent::OutOfFuel); }
    else if (pose.x >= road_length - 25.0f) { run.state = RunState::Finished; run.events.push_back(RunEvent::Finished); }
}

int finish_run(Progress& p, int era, const Run& run) {
    const int distance_coins = static_cast<int>(run.distance / 100.0f) * COINS_PER_100M;
    const int earned = distance_coins + run.coins;
    p.coins += earned;
    const int metres = static_cast<int>(run.distance);
    if (era >= 0 && era < ERA_COUNT) {
        p.best[era] = std::max(p.best[era], metres);
        if (era + 1 < ERA_COUNT && p.unlocked <= era + 1 && (metres >= unlock_distance(era) || run.state == RunState::Finished)) p.unlocked = era + 2;
    }
    return earned;
}

} // namespace tt
