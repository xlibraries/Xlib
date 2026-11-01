/**
 * @file xl_physics_fake.h
 * @brief A stand-in World for tests of code built on xl_physics.h: it simulates nothing.
 *
 * It keeps what it's told (bodies, their shapes, joints and their motors), records every force, torque, impulse and
 * wake, moves bodies only by the velocities set on them, and answers ray casts, contacts and joint positions the
 * way a test scripts them. So a test can check what code asks of the physics, and put it in situations a real
 * simulation would take many steps to reach.
 */
#pragma once
#include "xl_physics.h"

#include <algorithm>
#include <map>
#include <string>
#include <vector>

namespace xl::phys {

/** The fake world. */
class FakeWorld final : public World {
public:
    /** A body as the fake keeps it. */
    struct FakeBody {
        std::string shape;            ///< "box", "sphere", "capsule", "cylinder", "mesh" or "height field".
        Motion motion = Motion::Static;   ///< How it was made to move.
        Pose pose;                    ///< Where it is now.
        Velocity velocity;            ///< Set by set_velocity(); moves it each step.
        std::vector<float> size;      ///< Box: half extents; sphere: radius; capsule, cylinder: half height, radius.
        float mass = 0;               ///< As given.
        Material material;            ///< As given.
        V3 surface_velocity;          ///< As set by set_surface_velocity().
        bool alive = true;            ///< False once removed.
    };
    /** A joint as the fake keeps it (its motor follows the calls). */
    struct FakeJoint {
        std::string kind;             ///< "hinge", "slider" or "fixed".
        Body a, b;                    ///< Its bodies.
        Hinge hinge;                  ///< A hinge's settings.
        Slider slider;                ///< A slider's settings.
        std::string motor = "off";    ///< "off", "velocity" or "position".
        float target = 0;             ///< The motor's velocity or position.
        float limit = 0;              ///< The motor's strongest torque or force.
        float position = 0;           ///< What joint_position() reports (tests set it).
        bool alive = true;            ///< False once removed.
    };
    /** A force, torque or impulse, as applied. */
    struct Push { std::string kind; Body body; V3 value; };

    std::vector<FakeBody> bodies;                     ///< Every body, by id - 1.
    std::vector<FakeJoint> joints;                    ///< Every joint, by id - 1.
    std::vector<Push> pushes;                         ///< Pushes since the last step.
    std::vector<Body> woken;                          ///< Every wake(), in order.
    std::map<uint32_t, std::vector<Body>> touching_;  ///< What contacts() reports, by body id (tests set it).
    bool ray_hits = false;                            ///< Whether the next ray casts hit (tests set it)...
    RayHit ray;                                       ///< ...and what they hit.
    int steps = 0;                                    ///< How many steps were taken.
    float slop = 0, speculative = 0;                  ///< As set by set_tolerances().

    Body add_box(Motion m, V3 p, Quat r, V3 h, float mass = 1, Material mat = {}) override { return add("box", m, p, r, { h.x, h.y, h.z }, mass, mat); }
    Body add_sphere(Motion m, V3 p, float radius, float mass = 1, Material mat = {}) override { return add("sphere", m, p, {}, { radius }, mass, mat); }
    Body add_capsule(Motion m, V3 p, Quat r, float hh, float radius, float mass = 1, Material mat = {}) override { return add("capsule", m, p, r, { hh, radius }, mass, mat); }
    Body add_cylinder(Motion m, V3 p, Quat r, float hh, float radius, float mass = 1, Material mat = {}) override { return add("cylinder", m, p, r, { hh, radius }, mass, mat); }
    Body add_mesh(const std::vector<float>& positions, const std::vector<uint32_t>&, Material mat = {}) override { return add("mesh", Motion::Static, {}, {}, positions, 0, mat); }
    Body add_height_field(const std::vector<float>& heights, int, V3 origin, float, Material mat = {}) override { return add("height field", Motion::Static, origin, {}, heights, 0, mat); }
    void remove(Body body) override { bodies.at(body.id - 1).alive = false; }

    Pose pose(Body body) const override { return bodies.at(body.id - 1).pose; }
    Velocity velocity(Body body) const override { return bodies.at(body.id - 1).velocity; }
    void set_velocity(Body body, V3 linear, V3 angular) override { bodies.at(body.id - 1).velocity = { linear, angular }; }
    void move_kinematic(Body body, V3 position, Quat rotation, float) override { bodies.at(body.id - 1).pose = { position, rotation }; }
    void apply_force(Body body, V3 force) override { pushes.push_back({ "force", body, force }); }
    void apply_torque(Body body, V3 torque) override { pushes.push_back({ "torque", body, torque }); }
    void apply_impulse(Body body, V3 impulse) override { pushes.push_back({ "impulse", body, impulse }); }
    bool active(Body body) const override { return bodies.at(body.id - 1).alive && bodies.at(body.id - 1).motion != Motion::Static; }
    void wake(Body body) override { woken.push_back(body); }
    void set_surface_velocity(Body body, V3 v) override { bodies.at(body.id - 1).surface_velocity = v; }

    Joint add_hinge(Body a, Body b, const Hinge& s) override { FakeJoint j{ "hinge", a, b }; j.hinge = s; return join(j); }
    Joint add_slider(Body a, Body b, const Slider& s) override { FakeJoint j{ "slider", a, b }; j.slider = s; return join(j); }
    Joint add_fixed(Body a, Body b) override { return join({ "fixed", a, b }); }
    void remove(Joint joint) override { joints.at(joint.id - 1).alive = false; }
    void motor_velocity(Joint joint, float velocity, float limit) override { FakeJoint& j = joints.at(joint.id - 1); j.motor = limit == 0 ? "off" : "velocity"; j.target = velocity; j.limit = limit; }
    void motor_position(Joint joint, float target, float limit, float = 20, float = 1) override { FakeJoint& j = joints.at(joint.id - 1); j.motor = "position"; j.target = target; j.limit = limit; }
    float joint_position(Joint joint) const override { return joints.at(joint.id - 1).position; }

    /** Moves each live body by its velocity (rotation untouched) and forgets the pushes. */
    void step(float dt, int = 1) override {
        for (FakeBody& b : bodies) if (b.alive && b.motion != Motion::Static) {
            b.pose.position.x += b.velocity.linear.x * dt;
            b.pose.position.y += b.velocity.linear.y * dt;
            b.pose.position.z += b.velocity.linear.z * dt;
        }
        pushes.clear();
        steps++;
    }
    bool raycast(V3, V3, float max_distance, RayHit& hit) const override { if (!ray_hits || ray.distance > max_distance) return false; hit = ray; return true; }
    std::vector<Body> contacts(Body body) const override { const auto it = touching_.find(body.id); return it == touching_.end() ? std::vector<Body>{} : it->second; }
    bool touching(Body a, Body b) const override { const std::vector<Body> c = contacts(a); return std::find(c.begin(), c.end(), b) != c.end(); }
    int body_count() const override { return static_cast<int>(std::count_if(bodies.begin(), bodies.end(), [](const FakeBody& b) { return b.alive; })); }
    void set_tolerances(float penetration_slop, float speculative_distance) override { slop = penetration_slop; speculative = speculative_distance; }

    /** Scripts two bodies as touching (both ways). @param a One. @param b The other. */
    void touch(Body a, Body b) { touching_[a.id].push_back(b); touching_[b.id].push_back(a); }
    /** @param kind "force", "torque" or "impulse". @param body A body. @return The total of that kind applied to it since the last step. */
    V3 total(const std::string& kind, Body body) const { V3 t; for (const Push& p : pushes) if (p.kind == kind && p.body == body) { t.x += p.value.x; t.y += p.value.y; t.z += p.value.z; } return t; }

private:
    Body add(const char* shape, Motion m, V3 p, Quat r, std::vector<float> size, float mass, Material mat) {
        FakeBody b;
        b.shape = shape; b.motion = m; b.pose = { p, r }; b.size = std::move(size); b.mass = mass; b.material = mat;
        bodies.push_back(b);
        return { static_cast<uint32_t>(bodies.size()) };
    }
    Joint join(FakeJoint j) { joints.push_back(j); return { static_cast<uint32_t>(joints.size()) }; }
};

} // namespace xl::phys
