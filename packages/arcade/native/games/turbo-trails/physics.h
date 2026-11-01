/**
 * @file physics.h
 * @brief The physics the game needs, as one small interface: a vehicle on a terrain.
 *
 * vehicle.cpp implements it on the 2D physics contract (`@xlibraries/physics-2d`), so the backend can change without
 * touching the rest of the game; tests can run it on a fake world.
 */
#pragma once
#include <memory>
#include <vector>

namespace xl::phys2d { class World2D; }

namespace tt {

struct VehicleSpec {
    float chassis_w = 1.6f, chassis_h = 0.5f;   // metres
    float wheel_r = 0.32f;
    float wheel_base = 1.2f;        // distance between the wheels
    float wheel_y = -0.25f;         // wheel centres relative to the chassis centre
    float mass = 1.0f;              // chassis mass (wheels add a little)
    float max_torque = 6.0f;        // motor torque, N·m
    float max_speed = 28.0f;        // wheel angular speed at full throttle, rad/s
    float suspension_hz = 4.0f;
    float suspension_damping = 0.7f;
    float tyre_friction = 1.2f;
    float air_torque = 2.5f;        // how hard leaning (and, a little, gas/brake) tilts the vehicle in the air
    float wheelie_resistance = 0.7f; // fraction of the motor's reaction torque cancelled while the wheels are down
    float boost_force = 9.0f;       // Turbo: forward push per kg, along the chassis
    bool front_drive = true, rear_drive = true;
};

struct DriveInput {
    float throttle = 0;   // -1 (reverse/brake) … 1 (gas)
    float lean = 0;       // -1 lean forward (nose down) … 1 lean back (nose up): weight shift on the ground, rotation in the air
    float boost = 0;      // 0..1 Turbo: extra motor torque and a push along the chassis, even in the air
    bool motor_on = false;
};

struct Pose {
    float x = 0, y = 0, angle = 0;          // chassis centre and rotation (radians, anticlockwise)
    float vx = 0, vy = 0, omega = 0;
    float wheel_x[2] = {}, wheel_y[2] = {}, wheel_angle[2] = {};   // 0 = rear, 1 = front
};

class World {
public:
    /**
     * A vehicle world on the default 2D physics.
     * @param gravity Downward acceleration, m/s².
     * @return The world.
     */
    static std::unique_ptr<World> create(float gravity = 9.8f);
    /**
     * A vehicle world on the 2D physics given (a fake, in tests).
     * @param physics The world to build the vehicle and terrain in.
     * @return The world.
     */
    static std::unique_ptr<World> on(std::unique_ptr<xl::phys2d::World2D> physics);
    virtual ~World() = default;
    /** The ground as a polyline from left to right (metres). */
    virtual void set_terrain(const std::vector<float>& xs, const std::vector<float>& ys) = 0;
    virtual void spawn(const VehicleSpec& spec, float x, float y) = 0;
    virtual void drive(const DriveInput& in) = 0;
    /** Gas/brake only (it also tilts the vehicle a little while airborne). */
    void drive(float throttle, bool motor_on) { DriveInput in; in.throttle = throttle; in.motor_on = motor_on; drive(in); }
    virtual void step(float dt) = 0;
    virtual Pose pose() const = 0;
    virtual bool wheel_grounded(int wheel) const = 0;
    /** The chassis itself touched the ground this step (roof landing, nose dive). */
    virtual bool chassis_hit() const = 0;
    /** Strongest wheel landing this step, in approximate m/s of vertical speed lost. */
    virtual float landing_impact() const = 0;
};

} // namespace tt
