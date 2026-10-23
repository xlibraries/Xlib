// Rigid-body physics for engine modules: a small, deterministic API over Jolt Physics (third_party/jolt). Bodies
// (boxes, spheres, capsules, cylinders, static meshes, height fields), hinges and sliders with motors, ray casts,
// contacts. Right-handed, y up, metres, kilograms. Graphics-free: tested natively, used by games and Bot Lab.
//
// Modules opt in with `physics: true` in their build spec (the engine compiles Jolt once and links it).
#pragma once
#include <cstdint>
#include <memory>
#include <vector>

namespace xl::phys {

struct V3 { float x = 0, y = 0, z = 0; };
/** A rotation as a unit quaternion (x, y, z, w); identity by default. */
struct Quat { float x = 0, y = 0, z = 0, w = 1; };

/** A body handle; 0 is "none". */
struct Body { uint32_t id = 0; bool valid() const { return id != 0; } bool operator==(Body o) const { return id == o.id; } };
struct Joint { uint32_t id = 0; bool valid() const { return id != 0; } };

enum class Motion { Static, Kinematic, Dynamic };

struct Material { float friction = 0.5f, restitution = 0.0f; };

struct Pose { V3 position; Quat rotation; };
struct Velocity { V3 linear, angular; };

struct RayHit { Body body; V3 point; V3 normal; float distance = 0; };

/** Settings for a hinge (revolute) joint; the pivot and axis are in world space at creation. */
struct Hinge {
    V3 pivot, axis;
    bool limited = false;
    float min_angle = 0, max_angle = 0;   // radians, when limited
};

/** Settings for a slider (prismatic) joint along a world-space axis through a point. */
struct Slider {
    V3 point, axis;
    bool limited = false;
    float min_distance = 0, max_distance = 0;
};

class World {
public:
    /** A world with gravity along -y (m/s²). */
    static std::unique_ptr<World> create(float gravity = 9.81f);
    virtual ~World() = default;

    // ---- bodies (position = centre; half extents / radii in metres; mass in kg for dynamic bodies) ----
    virtual Body add_box(Motion motion, V3 position, Quat rotation, V3 half_extents, float mass = 1, Material material = {}) = 0;
    virtual Body add_sphere(Motion motion, V3 position, float radius, float mass = 1, Material material = {}) = 0;
    virtual Body add_capsule(Motion motion, V3 position, Quat rotation, float half_height, float radius, float mass = 1, Material material = {}) = 0;
    /** A cylinder along its local y axis. */
    virtual Body add_cylinder(Motion motion, V3 position, Quat rotation, float half_height, float radius, float mass = 1, Material material = {}) = 0;
    /** A static triangle mesh (positions x,y,z per vertex; three indices per triangle). */
    virtual Body add_mesh(const std::vector<float>& positions, const std::vector<uint32_t>& indices, Material material = {}) = 0;
    /** A static height field of n×n samples, spaced `spacing` apart from `origin` (sample (i, j) sits at origin + (i·spacing, h, j·spacing)); n must be even. */
    virtual Body add_height_field(const std::vector<float>& heights, int n, V3 origin, float spacing, Material material = {}) = 0;
    virtual void remove(Body body) = 0;

    virtual Pose pose(Body body) const = 0;
    virtual Velocity velocity(Body body) const = 0;
    virtual void set_velocity(Body body, V3 linear, V3 angular) = 0;
    /** Moves a kinematic body so it arrives at the pose over the next step. */
    virtual void move_kinematic(Body body, V3 position, Quat rotation, float dt) = 0;
    virtual void apply_force(Body body, V3 force) = 0;
    virtual void apply_torque(Body body, V3 torque) = 0;
    virtual void apply_impulse(Body body, V3 impulse) = 0;
    virtual bool active(Body body) const = 0;
    /** Wakes a sleeping body (a motor's new target doesn't, on its own) */
    virtual void wake(Body body) = 0;
    /** Makes a body's surface move (m/s, world space) while the body stays put: a conveyor belt. What rests on it is
     *  carried along by friction. Zero stops it. */
    virtual void set_surface_velocity(Body body, V3 velocity) = 0;

    // ---- joints (b = none attaches to the world) ----
    virtual Joint add_hinge(Body a, Body b, const Hinge& settings) = 0;
    virtual Joint add_slider(Body a, Body b, const Slider& settings) = 0;
    /** Welds two bodies together. */
    virtual Joint add_fixed(Body a, Body b) = 0;
    virtual void remove(Joint joint) = 0;
    /** Drives a hinge to an angular velocity (rad/s) or a slider to a linear velocity (m/s), up to a torque/force limit; 0 limit turns the motor off. */
    virtual void motor_velocity(Joint joint, float velocity, float limit) = 0;
    /** Drives a hinge to an angle (rad) or a slider to a distance (m) with a spring of `frequency` Hz and `damping` ratio, up to a limit. */
    virtual void motor_position(Joint joint, float target, float limit, float frequency = 20, float damping = 1) = 0;
    /** A hinge's angle or a slider's distance. */
    virtual float joint_position(Joint joint) const = 0;

    // ---- queries ----
    virtual void step(float dt, int substeps = 1) = 0;
    /** The closest hit along a ray of `max_distance`; false when nothing is hit. */
    virtual bool raycast(V3 origin, V3 direction, float max_distance, RayHit& hit) const = 0;
    /** Bodies currently in contact with `body` (kept while it sleeps). */
    virtual std::vector<Body> contacts(Body body) const = 0;
    virtual bool touching(Body a, Body b) const = 0;
    virtual int body_count() const = 0;

    /**
     * Contact tolerances, metres: how far bodies may sink into each other before they're pushed apart (penetration
     * slop) and how early contacts are found (speculative distance). The defaults (2 cm each) suit human-scale scenes;
     * small things (a robot on 32 mm wheels) want millimetres, or they settle visibly into the floor.
     */
    virtual void set_tolerances(float penetration_slop, float speculative_distance) = 0;
};

/** Quaternion from an axis (unit) and an angle in radians. */
Quat axis_angle(V3 axis, float angle);
/** Rotates a vector by a quaternion. */
V3 rotate(Quat q, V3 v);
/** Yaw (about y), then pitch (about z), then roll (about x), radians. */
Quat euler(float yaw, float pitch, float roll);

} // namespace xl::phys
