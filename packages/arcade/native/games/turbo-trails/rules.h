// The game's rules, graphics-free: one run (fuel, distance, coins, flips, how it ends), the player's progress
// (coins, upgrades, unlocked eras, best distances) and how upgrades change a vehicle.
#pragma once
#include <cstdint>
#include <string>
#include <vector>
#include "physics.h"
#include "terrain.h"

namespace tt {

constexpr int ERA_COUNT = 10;
constexpr int UPGRADE_KINDS = 4;          // engine, suspension, tyres, chassis
constexpr int UPGRADE_TIERS = 4;
constexpr int UPGRADE_PRICES[UPGRADE_TIERS] = { 300, 400, 550, 750 };
constexpr int COINS_PER_100M = 10, COINS_PER_FLIP = 50, COINS_TREASURE = 100, COINS_ROAD = 5;
constexpr float FUEL_SECONDS = 24.0f;    // a full tank at full throttle

enum class RunState { Ready, Driving, OutOfFuel, Crashed, Finished };
enum class RunEvent { Coin, Fuel, Flip, Treasure, Landmark, Crash, OutOfFuel, Landing, Finished };

struct Run {
    RunState state = RunState::Ready;
    float fuel = 1.0f;                 // fraction of the tank
    float distance = 0;                // metres from the start, best so far this run
    int coins = 0;                     // earned this run (road coins, flips, treasure)
    int flips = 0;
    float air_rotation = 0;            // accumulated while airborne, for flips
    bool airborne = false;
    int next_landmark = 0;
    int last_landmark_index = -1;      // for showing its name
    float landmark_timer = 0;
    std::vector<RunEvent> events;      // this update
};

struct Progress {
    int coins = 0;
    int unlocked = 1;                         // eras playable
    int best[ERA_COUNT] = {};                 // metres
    int upgrades[ERA_COUNT][UPGRADE_KINDS] = {};
    std::string serialize() const;
    static Progress parse(const std::string& text);
};

/** The vehicle after the era's upgrades. */
VehicleSpec apply_upgrades(VehicleSpec spec, const int tiers[UPGRADE_KINDS]);
/** Price of the next tier, or 0 when maxed. */
int upgrade_price(int tier);
bool buy_upgrade(Progress& p, int era, int kind);
/** Metres needed in era `era` to unlock the next one. */
int unlock_distance(int era);

struct RunInput { float throttle = 0; };

/** Advances a run by dt using the vehicle's state after the physics step. */
void update_run(Run& run, Terrain& terrain, const Pose& pose, bool grounded, bool chassis_hit, float impact, const RunInput& in, float dt, float road_length);
/** Banks the run into progress (distance coins, unlocks, best). Returns coins earned in total. */
int finish_run(Progress& p, int era, const Run& run);

} // namespace tt
