/**
 * @file xl_physics2d.h
 * @brief 2D rigid-body physics: the contract, with no backend's types in it.
 *
 * Bodies carry shapes (boxes, circles, chains); wheel joints carry a spring, limits and a motor; forces and torques
 * act on bodies; contact events report which tagged shapes began or stopped touching during a step. Right-handed,
 * y up, metres, kilograms, radians (anticlockwise positive).
 *
 * World2D::create() makes the default backend (Box2D v3.1.1, linked into every module that uses
 * `@xlibraries/physics-2d`). xl_physics2d_fake.h is a stand-in for tests of code built on this contract.
 */
#pragma once
#include <cstdint>
#include <memory>
#include <vector>

namespace xl::phys2d {

/** A point or a vector, in metres (or metres per second). */
struct V2 {
    float x = 0;   ///< Rightwards.
    float y = 0;   ///< Upwards.
};

/** A rotation as its cosine and sine (exact, unlike an angle round-tripped through atan2). */
struct Rot {
    float c = 1;   ///< cos(angle)
    float s = 0;   ///< sin(angle)
};

/** A body handle; 0 is none. */
struct Body {
    uint32_t id = 0;   ///< The world's number for it.
    /** @return Whether it names a body. */
    bool valid() const { return id != 0; }
};

/** A joint handle; 0 is none. */
struct Joint {
    uint32_t id = 0;   ///< The world's number for it.
    /** @return Whether it names a joint. */
    bool valid() const { return id != 0; }
};

/** How a body moves: not at all, only as it's told, or under forces. */
enum class Motion { Static, Kinematic, Dynamic };

/** A new body's settings. */
struct BodyDef {
    Motion motion = Motion::Static;   ///< How it moves.
    V2 position;                      ///< Where it starts.
    float angle = 0;                  ///< Its starting rotation (the backend may approximate it, to about 0.002 rad).
    float linear_damping = 0;         ///< Drag on its velocity, per second.
    float angular_damping = 0;        ///< Drag on its spin, per second.
};

/** How a surface behaves in contact. */
struct Material {
    float friction = 0.6f;             ///< Coulomb friction coefficient.
    float restitution = 0;             ///< Bounciness, 0..1.
    float rolling_resistance = 0;      ///< Resistance to rolling (circles).
};

/** A new shape's settings. */
struct ShapeDef {
    float density = 1;                 ///< Kilograms per square metre (sets the body's mass).
    Material material;                 ///< Its surface.
    uint32_t tag = 0;                  ///< Reported in contact events, to tell shapes apart.
    bool contact_events = true;        ///< Whether its contacts are reported.
};

/** A wheel joint: body b rolls freely on body a, sliding along an axis against a spring, optionally motorised. */
struct WheelJointDef {
    Body a;                            ///< The body the wheel hangs from.
    Body b;                            ///< The wheel.
    V2 anchor_a;                       ///< The anchor in a's frame.
    V2 anchor_b;                       ///< The anchor in b's frame.
    V2 axis_a{ 0, 1 };                 ///< The suspension's axis in a's frame (unit).
    bool spring = false;               ///< Whether the suspension springs back.
    float hertz = 0;                   ///< The spring's frequency.
    float damping_ratio = 0;           ///< The spring's damping (1: critical).
    bool limit = false;                ///< Whether travel along the axis is limited.
    float lower = 0;                   ///< The lowest travel, metres.
    float upper = 0;                   ///< The highest travel, metres.
    bool motor = false;                ///< Whether the motor drives the wheel.
    float max_motor_torque = 0;        ///< The motor's strongest torque, N·m.
    float motor_speed = 0;             ///< The speed the motor drives towards, rad/s (positive: anticlockwise).
};

/** Two tagged shapes began or stopped touching during the last step. */
struct ContactEvent {
    uint32_t tag_a = 0;                ///< One shape's tag.
    uint32_t tag_b = 0;                ///< The other's.
    bool begin = true;                 ///< True when they began touching, false when they stopped.
};

/** A 2D physics world. */
class World2D {
public:
    /**
     * A world with the default backend.
     * @param gravity Downward acceleration, m/s².
     * @return The world.
     */
    static std::unique_ptr<World2D> create(float gravity = 9.8f);
    virtual ~World2D() = default;

    /**
     * Adds a body (with no shape yet).
     * @param def Its settings.
     * @return Its handle.
     */
    virtual Body add_body(const BodyDef& def) = 0;

    /**
     * Adds a box to a body, centred on it.
     * @param body The body.
     * @param half_w Half its width.
     * @param half_h Half its height.
     * @param def The shape's settings.
     */
    virtual void add_box(Body body, float half_w, float half_h, const ShapeDef& def) = 0;

    /**
     * Adds a circle to a body.
     * @param body The body.
     * @param center Its centre, in the body's frame.
     * @param radius Its radius.
     * @param def The shape's settings.
     */
    virtual void add_circle(Body body, V2 center, float radius, const ShapeDef& def) = 0;

    /**
     * Adds an open chain of segments to a body: one-sided, solid on the left as you walk the points in order.
     * @param body The body (usually static).
     * @param points At least four points (the backend needs a segment either side of each end's neighbour).
     * @param def The shape's settings (its density is ignored: chains have no mass).
     */
    virtual void add_chain(Body body, const std::vector<V2>& points, const ShapeDef& def) = 0;

    /**
     * Adds a wheel joint.
     * @param def Its settings.
     * @return Its handle.
     */
    virtual Joint add_wheel_joint(const WheelJointDef& def) = 0;

    /**
     * Turns a wheel joint's motor on or off.
     * @param joint The joint.
     * @param on Whether it drives.
     */
    virtual void enable_motor(Joint joint, bool on) = 0;

    /**
     * Sets the speed a wheel joint's motor drives towards.
     * @param joint The joint.
     * @param speed rad/s, positive anticlockwise.
     */
    virtual void set_motor_speed(Joint joint, float speed) = 0;

    /**
     * Sets a wheel joint motor's strongest torque.
     * @param joint The joint.
     * @param torque N·m.
     */
    virtual void set_max_motor_torque(Joint joint, float torque) = 0;

    /**
     * Pushes a body through its centre of mass for the next step.
     * @param body The body.
     * @param force Newtons.
     */
    virtual void apply_force(Body body, V2 force) = 0;

    /**
     * Turns a body for the next step.
     * @param body The body.
     * @param torque N·m, positive anticlockwise.
     */
    virtual void apply_torque(Body body, float torque) = 0;

    /**
     * Advances the world.
     * @param dt Seconds.
     * @param substeps Solver substeps (more: stiffer, slower).
     */
    virtual void step(float dt, int substeps = 4) = 0;

    /** @param body The body. @return Where it is (its origin). */
    virtual V2 position(Body body) const = 0;
    /** @param body The body. @return Its rotation. */
    virtual Rot rotation(Body body) const = 0;
    /** @param body The body. @return Its rotation as an angle, -π..π (the backend may approximate, to about 0.002 rad: use rotation() for exact directions). */
    virtual float angle(Body body) const = 0;
    /** @param body The body. @return Its velocity. */
    virtual V2 linear_velocity(Body body) const = 0;
    /** @param body The body. @return Its spin, rad/s, positive anticlockwise. */
    virtual float angular_velocity(Body body) const = 0;

    /**
     * What began and stopped touching during the last step: every beginning first, then every ending.
     * @return The events (cleared by the next step).
     */
    virtual const std::vector<ContactEvent>& contacts() const = 0;
};

} // namespace xl::phys2d
