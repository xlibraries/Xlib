// JyotiRath: the chariot's handling and Chapter I's journey. Arcade physics in the ground plane (grip, drift, slopes,
// sand), collisions with the town and the handcarts crossing the road, potholes, tumbleweeds, clay pots that fly
// when hit, artifacts that refill the fuel, and the story's stops in order: reaching one stops the chariot to talk
// (main.cpp shows the lines, then calls finish_talking). Running out of fuel or driving off the land puts you back
// at the last checkpoint. Fixed steps, deterministic, graphics-free (tests/native/jyotirath_test.cpp).
#pragma once
#include "story.h"
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

struct Pot { float x, y, z, vx = 0, vy = 0, vz = 0, spin = 0; bool hit = false, broken = false; };
struct Tumbleweed { float x, z, vx, vz, spin = 0, life = 0; };

enum class Phase { Landing, Talking, Driving, Respawning, Complete };

/** Things that happened during a step, for sound, particles and the camera. */
enum Event : uint32_t {
    EV_LAND = 1, EV_STOP = 2, EV_ARTIFACT = 4, EV_BONK = 8, EV_POT_HIT = 16, EV_POT_BREAK = 32, EV_POTHOLE = 64,
    EV_FALL = 128, EV_RESPAWN = 256, EV_OUT_OF_FUEL = 512, EV_COMPLETE = 1024, EV_TUMBLE = 2048,
};

constexpr float LANDING_TIME = 1.6f, RESPAWN_DELAY = 1.4f;
constexpr float FUEL_IDLE = 0.005f, FUEL_GAS = 0.014f, FUEL_ARTIFACT = 0.05f, FUEL_BONK = 0.04f, FUEL_RESPAWN = 0.6f;

struct Journey {
    Phase phase = Phase::Landing;
    float landing = LANDING_TIME;   // seconds of falling onto the road at the start
    int stop = 0;                   // the stop talking now, or the next one to reach
    int checkpoint = 0;             // the stop a respawn returns to
    float fuel = 1;
    int artifacts = 0;
    bool fragment = false;          // found the Buddhist fragment
    float respawn = 0;              // > 0 while waiting to be put back
    bool out_of_fuel = false;       // why we're being put back
    float ghost = 0;                // > 0 just after a respawn
    float s = 0;                    // distance along the road
    float time = 0;                 // driving time
    uint32_t events = 0;
    float bonk = 0;                 // the hardest impact this step
    V2 event_at{};
};

struct Game {
    const Track* track = nullptr;
    Car car;
    Journey j;
    std::vector<bool> taken;        // artifacts collected
    std::vector<Pot> pots;
    std::vector<Tumbleweed> tumbleweeds;
    float clock = 0;                // drives the handcarts and the wind
    int last_pothole = -1;

    explicit Game(const Track& t) : track(&t) { reset(); }
    void reset();
    void step(const Input& in, float dt);
    /** Puts the chariot on the road at distance s, facing along it, stopped. */
    void place(float s);
    /** The current stop's lines have all been read: drive on (or the chapter is complete). */
    void finish_talking();
};

/** A driver for tests and the demo: follows the road, picks up artifacts ahead, slows for bends. */
Input autopilot(const Game& g);

/** Car handling constants. */
constexpr float ACCEL = 14, BRAKE = 26, REVERSE_MAX = 5, MAX_ROAD = 14, MAX_SAND = 7.0f;
constexpr float CAR_RADIUS = 0.75f;

} // namespace jr
