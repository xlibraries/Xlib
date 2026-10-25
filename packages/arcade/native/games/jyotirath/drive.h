// JyotiRath: the chariot's handling and a drive's goal. Arcade physics in the ground plane (grip, drift, slopes,
// sand), collisions with the land's props, potholes and tumbleweeds; tools to pick up (two at most in the bag). A
// drive runs along the road from one district to the next with one goal: just get there, outrun the zebu, beat the
// clock, deliver the grain without spilling it, stay ahead of a dust storm, or light the lamp road before dark.
// Falling off the land, the canal, or missing the goal fails it (and it starts over). A drive can begin already
// rolling, handed over from the cutscene before it. Fixed steps, deterministic, graphics-free.
#pragma once
#include "track.h"

#include <cstdint>
#include <vector>

namespace jr {

struct Input {
    float throttle = 0;   // +1 gas, -1 brake / reverse
    float steer = 0;      // -1 left .. +1 right (from the driver's seat)
};

struct Car {
    float x = 0, y = 0, z = 0;
    float yaw = 0;            // heading: forward = (cos yaw, sin yaw) in (x, z)
    float vx = 0, vz = 0, vy = 0;
    float yaw_rate = 0;
    float wheel = 0;          // wheel turn, radians (for drawing)
    float steer = 0;          // smoothed steering, -1..1 (for drawing)
    float jolt = 0;           // > 0 just after a pothole (for drawing)
    bool drifting = false;
    float slip = 0;           // sideways speed, for dust
    float forward_speed() const;
};

struct Tumbleweed { float x, z, vx, vz, spin = 0, life = 0; };

enum class Goal { Reach, Chase, Clock, Deliver, Storm, Lamps };

struct RunSpec {
    Goal goal = Goal::Reach;
    float from = 0, to = 0;   // along the road
    bool landing = false;     // dropped from the sky at the start (the very first drive)
    bool shortcut = false;    // the canal road's bridge is open
    float time = 0;           // the clock, for Goal::Clock; the light left at the start, for Goal::Lamps
    int cargo = 0;            // sacks of grain, for Goal::Deliver
    float speed = 0;          // already rolling at the start (handed over from a cutscene), m/s
};

enum class RunState { Landing, Driving, Failed, Done };
enum class Fail { None, Fell, Splash, Caught, Late, Spilled, Storm, Dark };

/** Things that happened during a step, for sound, particles and the camera. */
enum Event : uint32_t {
    EV_LAND = 1, EV_PICKUP = 2, EV_BAG_FULL = 4, EV_BONK = 8, EV_POTHOLE = 16, EV_SPILL = 32, EV_FAIL = 64,
    EV_DONE = 128, EV_TUMBLE = 256, EV_LAMP = 512,
};

struct Run {
    RunSpec spec;
    RunState state = RunState::Driving;
    Fail fail = Fail::None;
    float time = 0;
    float s = 0;                  // the chariot's distance along the road
    float chaser = 0;             // the zebu's (or the storm's) distance along the road
    int cargo = 0;
    std::vector<Tool> bag;
    std::vector<bool> picked;     // the track's pickups taken
    std::vector<bool> lit;        // the lamp road's lamps lit
    int lamps = 0;
    float light = 0;              // seconds of light left (Goal::Lamps): each lamp lit adds LAMP_TIME
    float rough = 0;              // seconds on rough ground (spills a sack every so often when carrying grain)
    uint32_t events = 0;
    float bonk = 0;               // the hardest impact this step
    V2 event_at{};
};

struct Game {
    const Track* track = nullptr;
    Car car;
    Run run;
    std::vector<Tumbleweed> tumbleweeds;
    float clock = 0;
    int last_pothole = -1;
    int bag_full_nag = -1;        // the pickup we last said "bag full" about

    explicit Game(const Track& t) : track(&t) {}
    /** Start a drive: the chariot on the road at spec.from (or falling onto it), carrying `bag`. */
    void start(const RunSpec& spec, std::vector<Tool> bag);
    void step(const Input& in, float dt);
    /** Puts the chariot on the road at distance s, facing along it, stopped. */
    void place(float s);
};

/** A driver for tests and the demo: follows the road (over the bridge when it's open), picks up tools ahead. */
Input autopilot(const Game& g);

/** Car handling constants. */
constexpr float ACCEL = 14, BRAKE = 26, REVERSE_MAX = 5, MAX_ROAD = 14, MAX_SAND = 7.0f;
constexpr float CAR_RADIUS = 0.75f;
/** The chasers: the zebu starts this far behind and runs this fast; the storm creeps, then quickens. */
constexpr float CHASE_GAP = 24, CHASE_SPEED = 12.9f, STORM_GAP = 40, STORM_SPEED = 12.4f;
/** The lamp road: seconds of dusk each lamp you light buys. */
constexpr float LAMP_TIME = 3.2f;

} // namespace jr
