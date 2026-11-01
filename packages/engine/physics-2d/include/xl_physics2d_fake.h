/**
 * @file xl_physics2d_fake.h
 * @brief A stand-in World2D for tests of code built on xl_physics2d.h: it simulates nothing.
 *
 * It keeps what it's told (bodies, shapes, joints and their motors), records every force and torque, moves bodies
 * only by the velocities a test sets, and reports the contact events a test scripts for the next step. So a test can
 * check what code asks of the physics, and drive it through situations (a wheel landing, a roof hitting the ground)
 * that would take a real simulation many steps to reach.
 */
#pragma once
#include "xl_physics2d.h"

#include <cmath>
#include <string>
#include <vector>

namespace xl::phys2d {

/** The fake world. */
class FakeWorld2D final : public World2D {
public:
    /** A body as the fake keeps it. */
    struct FakeBody {
        BodyDef def;                                ///< How it was made.
        V2 position;                                ///< Where it is now.
        float angle = 0;                            ///< Its rotation now.
        V2 velocity;                                ///< Set by tests; moves it each step.
        float spin = 0;                             ///< Set by tests; turns it each step.
    };
    /** A shape as the fake keeps it. */
    struct FakeShape {
        std::string kind;                           ///< "box", "circle" or "chain".
        Body body;                                  ///< Its body.
        ShapeDef def;                               ///< Its settings.
        std::vector<float> size;                    ///< Box: half w, half h. Circle: x, y, r. Chain: x, y per point.
    };
    /** A joint as the fake keeps it (its motor's state follows the calls). */
    struct FakeJoint { WheelJointDef def; };
    /** A force or torque, as applied. */
    struct Push {
        Body body;                                  ///< On what.
        V2 force;                                   ///< The force (zero for a torque).
        float torque = 0;                           ///< The torque (zero for a force).
    };

    std::vector<FakeBody> bodies;                   ///< Every body, by id - 1.
    std::vector<FakeShape> shapes;                  ///< Every shape, in order.
    std::vector<FakeJoint> joints;                  ///< Every joint, by id - 1.
    std::vector<Push> pushes;                       ///< Forces and torques since the last step.
    std::vector<ContactEvent> next_contacts;        ///< What the next step reports (then cleared).
    int steps = 0;                                  ///< How many steps were taken.
    float last_dt = 0;                              ///< The last step's dt.
    int last_substeps = 0;                          ///< The last step's substeps.

    Body add_body(const BodyDef& def) override {
        bodies.push_back({ def, def.position, def.angle, {}, 0 });
        return { static_cast<uint32_t>(bodies.size()) };
    }
    void add_box(Body body, float half_w, float half_h, const ShapeDef& def) override { shapes.push_back({ "box", body, def, { half_w, half_h } }); }
    void add_circle(Body body, V2 center, float radius, const ShapeDef& def) override { shapes.push_back({ "circle", body, def, { center.x, center.y, radius } }); }
    void add_chain(Body body, const std::vector<V2>& points, const ShapeDef& def) override {
        FakeShape s{ "chain", body, def, {} };
        for (const V2& p : points) { s.size.push_back(p.x); s.size.push_back(p.y); }
        shapes.push_back(s);
    }
    Joint add_wheel_joint(const WheelJointDef& def) override {
        joints.push_back({ def });
        return { static_cast<uint32_t>(joints.size()) };
    }
    void enable_motor(Joint joint, bool on) override { joints.at(joint.id - 1).def.motor = on; }
    void set_motor_speed(Joint joint, float speed) override { joints.at(joint.id - 1).def.motor_speed = speed; }
    void set_max_motor_torque(Joint joint, float torque) override { joints.at(joint.id - 1).def.max_motor_torque = torque; }
    void apply_force(Body body, V2 force) override { pushes.push_back({ body, force, 0 }); }
    void apply_torque(Body body, float torque) override { pushes.push_back({ body, {}, torque }); }

    /** Moves each body by its velocity, delivers the scripted contacts and forgets the pushes. */
    void step(float dt, int substeps) override {
        for (FakeBody& b : bodies) { b.position.x += b.velocity.x * dt; b.position.y += b.velocity.y * dt; b.angle += b.spin * dt; }
        contacts_ = next_contacts;
        next_contacts.clear();
        pushes.clear();
        steps++;
        last_dt = dt;
        last_substeps = substeps;
    }

    V2 position(Body body) const override { return bodies.at(body.id - 1).position; }
    Rot rotation(Body body) const override { const float a = bodies.at(body.id - 1).angle; return { std::cos(a), std::sin(a) }; }
    float angle(Body body) const override { return bodies.at(body.id - 1).angle; }
    V2 linear_velocity(Body body) const override { return bodies.at(body.id - 1).velocity; }
    float angular_velocity(Body body) const override { return bodies.at(body.id - 1).spin; }
    const std::vector<ContactEvent>& contacts() const override { return contacts_; }

    /** @param body A body. @return The total torque applied to it since the last step. */
    float torque_on(Body body) const { float t = 0; for (const Push& p : pushes) if (p.body.id == body.id) t += p.torque; return t; }
    /** @param body A body. @return The total force applied to it since the last step. */
    V2 force_on(Body body) const { V2 f; for (const Push& p : pushes) if (p.body.id == body.id) { f.x += p.force.x; f.y += p.force.y; } return f; }

private:
    std::vector<ContactEvent> contacts_;
};

} // namespace xl::phys2d
