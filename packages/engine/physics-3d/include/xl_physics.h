/**
 * @file xl_physics.h
 * @brief 3D rigid-body physics: the contract, with no backend's types in it.
 *
 * Bodies (boxes, spheres, capsules, cylinders, static meshes, height fields), hinges and sliders with motors, welds,
 * ray casts, contacts. Right-handed, y up, metres, kilograms, radians. Graphics-free: tested natively, used by games
 * and Bot Lab.
 *
 * World::create() makes the default backend (Jolt Physics v5.6.0, deterministic, linked into every module that uses
 * `@xlibraries/physics-3d`). xl_physics_fake.h is a stand-in for tests of code built on this contract.
 */
#pragma once
#include <cstdint>
#include <memory>
#include <vector>

namespace xl::phys {

/** A point or a vector. */
struct V3 {
    float x = 0;   ///< Right.
    float y = 0;   ///< Up.
    float z = 0;   ///< Towards the viewer.
};

/** A rotation as a unit quaternion (x, y, z, w); identity by default. */
struct Quat {
    float x = 0;   ///< The axis's x times sin(angle / 2).
    float y = 0;   ///< The axis's y times sin(angle / 2).
    float z = 0;   ///< The axis's z times sin(angle / 2).
    float w = 1;   ///< cos(angle / 2).
};

/** A body handle; 0 is none. */
struct Body {
    uint32_t id = 0;   ///< The world's number for it.
    /** @return Whether it names a body. */
    bool valid() const { return id != 0; }
    /** @param o Another handle. @return Whether both name the same body. */
    bool operator==(Body o) const { return id == o.id; }
};

/** A joint handle; 0 is none. */
struct Joint {
    uint32_t id = 0;   ///< The world's number for it.
    /** @return Whether it names a joint. */
    bool valid() const { return id != 0; }
};

/** How a body moves: not at all, only as it's told, or under forces. */
enum class Motion { Static, Kinematic, Dynamic };

/** How a surface behaves in contact. */
struct Material {
    float friction = 0.5f;      ///< Coulomb friction coefficient.
    float restitution = 0.0f;   ///< Bounciness, 0..1.
};

/** Where a body is and which way it faces. */
struct Pose {
    V3 position;     ///< Its centre.
    Quat rotation;   ///< Its orientation.
};

/** How a body moves. */
struct Velocity {
    V3 linear;    ///< m/s.
    V3 angular;   ///< rad/s about each axis.
};

/** What a ray hit. */
struct RayHit {
    Body body;             ///< The body.
    V3 point;              ///< Where, in world space.
    V3 normal;             ///< The surface's normal there.
    float distance = 0;    ///< How far along the ray.
};

/** Settings for a hinge (revolute) joint; the pivot and axis are in world space at creation. */
struct Hinge {
    V3 pivot;                ///< The point both bodies turn about.
    V3 axis;                 ///< The axis they turn about (unit).
    bool limited = false;    ///< Whether the angle is limited.
    float min_angle = 0;     ///< The lowest angle, radians, when limited.
    float max_angle = 0;     ///< The highest angle, radians, when limited.
};

/** Settings for a slider (prismatic) joint along a world-space axis through a point. */
struct Slider {
    V3 point;                  ///< A point on the axis.
    V3 axis;                   ///< The direction of travel (unit).
    bool limited = false;      ///< Whether travel is limited.
    float min_distance = 0;    ///< The lowest travel, metres, when limited.
    float max_distance = 0;    ///< The highest travel, metres, when limited.
};

/** A 3D physics world. Positions are body centres; sizes are half extents or radii in metres; masses in kg. */
class World {
public:
    /**
     * A world with the default backend.
     * @param gravity Acceleration along -y, m/s².
     * @return The world.
     */
    static std::unique_ptr<World> create(float gravity = 9.81f);
    virtual ~World() = default;

    /** @name Bodies */
    ///@{
    /**
     * Adds a box.
     * @param motion How it moves.
     * @param position Its centre.
     * @param rotation Its orientation.
     * @param half_extents Half its size along each axis.
     * @param mass Its mass (dynamic bodies).
     * @param material Its surface.
     * @return Its handle.
     */
    virtual Body add_box(Motion motion, V3 position, Quat rotation, V3 half_extents, float mass = 1, Material material = {}) = 0;
    /**
     * Adds a sphere.
     * @param motion How it moves.
     * @param position Its centre.
     * @param radius Its radius.
     * @param mass Its mass (dynamic bodies).
     * @param material Its surface.
     * @return Its handle.
     */
    virtual Body add_sphere(Motion motion, V3 position, float radius, float mass = 1, Material material = {}) = 0;
    /**
     * Adds a capsule along its local y axis.
     * @param motion How it moves.
     * @param position Its centre.
     * @param rotation Its orientation.
     * @param half_height Half the length of its straight part.
     * @param radius Its radius.
     * @param mass Its mass (dynamic bodies).
     * @param material Its surface.
     * @return Its handle.
     */
    virtual Body add_capsule(Motion motion, V3 position, Quat rotation, float half_height, float radius, float mass = 1, Material material = {}) = 0;
    /**
     * Adds a cylinder along its local y axis.
     * @param motion How it moves.
     * @param position Its centre.
     * @param rotation Its orientation.
     * @param half_height Half its height.
     * @param radius Its radius.
     * @param mass Its mass (dynamic bodies).
     * @param material Its surface.
     * @return Its handle.
     */
    virtual Body add_cylinder(Motion motion, V3 position, Quat rotation, float half_height, float radius, float mass = 1, Material material = {}) = 0;
    /**
     * Adds a static triangle mesh.
     * @param positions x, y, z per vertex.
     * @param indices Three per triangle.
     * @param material Its surface.
     * @return Its handle.
     */
    virtual Body add_mesh(const std::vector<float>& positions, const std::vector<uint32_t>& indices, Material material = {}) = 0;
    /**
     * Adds a static height field of n×n samples: sample (i, j) sits at origin + (i·spacing, h, j·spacing).
     * @param heights n×n heights, row by row.
     * @param n Samples per side (even).
     * @param origin Where sample (0, 0) sits, height aside.
     * @param spacing The distance between samples.
     * @param material Its surface.
     * @return Its handle.
     */
    virtual Body add_height_field(const std::vector<float>& heights, int n, V3 origin, float spacing, Material material = {}) = 0;
    /** @param body The body to take out of the world. */
    virtual void remove(Body body) = 0;

    /** @param body The body. @return Where it is and which way it faces. */
    virtual Pose pose(Body body) const = 0;
    /** @param body The body. @return How it moves. */
    virtual Velocity velocity(Body body) const = 0;
    /**
     * Sets how a body moves.
     * @param body The body.
     * @param linear Its velocity, m/s.
     * @param angular Its spin, rad/s.
     */
    virtual void set_velocity(Body body, V3 linear, V3 angular) = 0;
    /**
     * Moves a kinematic body so it arrives at a pose over the next step.
     * @param body The body.
     * @param position Where it should be.
     * @param rotation Which way it should face.
     * @param dt The step it should get there in.
     */
    virtual void move_kinematic(Body body, V3 position, Quat rotation, float dt) = 0;
    /** @param body The body. @param force Newtons through its centre, for the next step. */
    virtual void apply_force(Body body, V3 force) = 0;
    /** @param body The body. @param torque N·m about each axis, for the next step. */
    virtual void apply_torque(Body body, V3 torque) = 0;
    /** @param body The body. @param impulse N·s through its centre, applied now. */
    virtual void apply_impulse(Body body, V3 impulse) = 0;
    /** @param body The body. @return Whether it's awake (simulated). */
    virtual bool active(Body body) const = 0;
    /** @param body A sleeping body to wake (a motor's new target doesn't, on its own). */
    virtual void wake(Body body) = 0;
    /**
     * Makes a body's surface move while the body stays put (a conveyor belt): what rests on it is carried along by
     * friction.
     * @param body The body.
     * @param velocity The surface's velocity, m/s in world space (zero stops it).
     */
    virtual void set_surface_velocity(Body body, V3 velocity) = 0;
    ///@}

    /** @name Joints (Body{} for b attaches to the world) */
    ///@{
    /** @param a One body. @param b The other. @param settings The hinge. @return Its handle. */
    virtual Joint add_hinge(Body a, Body b, const Hinge& settings) = 0;
    /** @param a One body. @param b The other. @param settings The slider. @return Its handle. */
    virtual Joint add_slider(Body a, Body b, const Slider& settings) = 0;
    /** Welds two bodies together. @param a One body. @param b The other. @return Its handle. */
    virtual Joint add_fixed(Body a, Body b) = 0;
    /** @param joint The joint to take out of the world. */
    virtual void remove(Joint joint) = 0;
    /**
     * Drives a hinge at an angular velocity or a slider at a linear velocity.
     * @param joint The joint.
     * @param velocity rad/s for a hinge, m/s for a slider.
     * @param limit The strongest torque (N·m) or force (N); 0 turns the motor off.
     */
    virtual void motor_velocity(Joint joint, float velocity, float limit) = 0;
    /**
     * Drives a hinge to an angle or a slider to a distance with a spring.
     * @param joint The joint.
     * @param target rad for a hinge, m for a slider.
     * @param limit The strongest torque (N·m) or force (N).
     * @param frequency The spring's frequency, Hz.
     * @param damping The spring's damping ratio (1: critical).
     */
    virtual void motor_position(Joint joint, float target, float limit, float frequency = 20, float damping = 1) = 0;
    /** @param joint The joint. @return A hinge's angle (rad) or a slider's distance (m). */
    virtual float joint_position(Joint joint) const = 0;
    ///@}

    /** @name Queries */
    ///@{
    /** @param dt Seconds to advance. @param substeps Collision steps within it (more: stiffer, slower). */
    virtual void step(float dt, int substeps = 1) = 0;
    /**
     * The closest hit along a ray.
     * @param origin Where the ray starts.
     * @param direction Which way it goes (unit).
     * @param max_distance How far it reaches.
     * @param hit Filled in when something is hit.
     * @return Whether something was hit.
     */
    virtual bool raycast(V3 origin, V3 direction, float max_distance, RayHit& hit) const = 0;
    /** @param body The body. @return The bodies touching it now (kept while it sleeps). */
    virtual std::vector<Body> contacts(Body body) const = 0;
    /** @param a One body. @param b Another. @return Whether they touch. */
    virtual bool touching(Body a, Body b) const = 0;
    /** @return How many bodies the world holds. */
    virtual int body_count() const = 0;

    /**
     * Contact tolerances. The defaults (2 cm each) suit human-scale scenes; small things (a robot on 32 mm wheels)
     * want millimetres, or they settle visibly into the floor.
     * @param penetration_slop How far bodies may sink into each other before they're pushed apart, metres.
     * @param speculative_distance How early contacts are found, metres.
     */
    virtual void set_tolerances(float penetration_slop, float speculative_distance) = 0;
    ///@}
};

/** @param axis A unit axis. @param angle Radians. @return The rotation about it. */
Quat axis_angle(V3 axis, float angle);
/** @param q A rotation. @param v A vector. @return v rotated by q. */
V3 rotate(Quat q, V3 v);
/** @param yaw About y. @param pitch Then about z. @param roll Then about x. @return The rotation (all radians). */
Quat euler(float yaw, float pitch, float roll);

} // namespace xl::phys
