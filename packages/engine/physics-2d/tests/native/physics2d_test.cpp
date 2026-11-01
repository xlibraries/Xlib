/**
 * @file physics2d_test.cpp
 * @brief The 2D physics contract on its Box2D backend, the fake, and the rule that the public headers name no backend.
 */
#include "doctest.h"
#include "xl_physics2d.h"
#include "xl_physics2d_fake.h"

#include <cmath>
#include <fstream>
#include <sstream>
#include <string>

using namespace xl::phys2d;

namespace {

/** A static floor along y = 0 from x = -10 to 10, solid below: given right to left. */
Body floor_of(World2D& w, uint32_t tag = 1) {
    const Body ground = w.add_body({});
    ShapeDef sd;
    sd.tag = tag;
    w.add_chain(ground, { { 10, 0 }, { 5, 0 }, { -5, 0 }, { -10, 0 } }, sd);
    return ground;
}

Body ball(World2D& w, V2 at, uint32_t tag = 2) {
    BodyDef bd;
    bd.motion = Motion::Dynamic;
    bd.position = at;
    const Body b = w.add_body(bd);
    ShapeDef sd;
    sd.tag = tag;
    w.add_circle(b, { 0, 0 }, 0.25f, sd);
    return b;
}

void run(World2D& w, float seconds) { for (int i = 0; i < static_cast<int>(seconds * 120); i++) w.step(1.0f / 120); }

std::string read(const char* path) { std::ifstream in(path); std::stringstream s; s << in.rdbuf(); return s.str(); }

} // namespace

TEST_CASE("bodies fall under gravity and land on a chain from its solid side, reporting the contact by tag") {
    auto w = World2D::create(9.8f);
    floor_of(*w);
    const Body b = ball(*w, { 0, 2 });
    bool began = false;
    for (int i = 0; i < 240; i++) {
        w->step(1.0f / 120);
        for (const ContactEvent& e : w->contacts()) if (e.begin && ((e.tag_a == 1 && e.tag_b == 2) || (e.tag_a == 2 && e.tag_b == 1))) began = true;
    }
    CHECK(began);
    CHECK(w->position(b).y == doctest::Approx(0.25f).epsilon(0.05));
    CHECK(std::fabs(w->linear_velocity(b).y) < 0.05f);
    CHECK(w->contacts().empty());   // a resting contact begins once
}

TEST_CASE("a chain is one-sided: from its other side, things pass through") {
    auto w = World2D::create(9.8f);
    const Body ground = w->add_body({});
    w->add_chain(ground, { { -10, 0 }, { -5, 0 }, { 5, 0 }, { 10, 0 } }, {});   // left to right: solid above
    const Body b = ball(*w, { 0, 2 });
    run(*w, 2);
    CHECK(w->position(b).y < -1);
}

TEST_CASE("a static body stays put, a kinematic one keeps its velocity, gravity off leaves a body be") {
    auto w = World2D::create(0);
    BodyDef s;
    s.position = { 3, 4 };
    const Body still = w->add_body(s);
    w->add_box(still, 1, 1, {});
    const Body free_body = ball(*w, { 0, 0 });
    run(*w, 1);
    CHECK(w->position(still).x == doctest::Approx(3));
    CHECK(w->position(free_body).y == doctest::Approx(0));
    BodyDef turned;
    turned.angle = 0.5f;
    CHECK(std::fabs(w->angle(w->add_body(turned)) - 0.5f) < 2e-3f);   // the backend's angles are fast approximations
}

TEST_CASE("forces push and torques turn, through the centre of mass; rotation and angle agree") {
    auto w = World2D::create(0);
    BodyDef bd;
    bd.motion = Motion::Dynamic;
    const Body b = w->add_body(bd);
    w->add_box(b, 0.5f, 0.5f, {});
    for (int i = 0; i < 60; i++) { w->apply_force(b, { 4, 0 }); w->apply_torque(b, 1); w->step(1.0f / 120); }
    CHECK(w->linear_velocity(b).x > 0.5f);
    CHECK(w->angular_velocity(b) > 0.5f);
    const Rot r = w->rotation(b);
    CHECK(std::fabs(std::atan2(r.s, r.c) - w->angle(b)) < 2e-3f);   // rotation() is exact, angle() approximate
    CHECK(r.c * r.c + r.s * r.s == doctest::Approx(1));
}

TEST_CASE("a wheel joint's motor drives the wheel, and can be switched, retuned and stopped") {
    auto w = World2D::create(0);
    BodyDef cb;
    cb.motion = Motion::Static;
    const Body chassis = w->add_body(cb);
    const Body wheel = ball(*w, { 0, -0.5f });
    WheelJointDef jd;
    jd.a = chassis;
    jd.b = wheel;
    jd.anchor_a = { 0, -0.5f };
    jd.spring = true;
    jd.hertz = 4;
    jd.damping_ratio = 0.7f;
    jd.limit = true;
    jd.lower = -0.2f;
    jd.upper = 0.1f;
    jd.motor = true;
    jd.max_motor_torque = 50;
    jd.motor_speed = 10;
    const Joint j = w->add_wheel_joint(jd);
    CHECK(j.valid());
    run(*w, 1);
    CHECK(w->angular_velocity(wheel) == doctest::Approx(10).epsilon(0.05));
    w->set_motor_speed(j, -5);
    run(*w, 1);
    CHECK(w->angular_velocity(wheel) == doctest::Approx(-5).epsilon(0.05));
    w->set_max_motor_torque(j, 0.0f);
    w->enable_motor(j, false);
    w->apply_torque(wheel, 0);
    run(*w, 0.1f);
    CHECK(w->angular_velocity(wheel) == doctest::Approx(-5).epsilon(0.1));   // no motor: it spins on
}

TEST_CASE("the fake keeps what it's told, records pushes, moves bodies by their velocities, and plays scripted contacts") {
    FakeWorld2D w;
    BodyDef bd;
    bd.motion = Motion::Dynamic;
    bd.position = { 1, 2 };
    bd.angle = 0.25f;
    const Body b = w.add_body(bd);
    w.add_box(b, 0.5f, 0.25f, {});
    w.add_circle(b, { 1, 0 }, 0.3f, {});
    w.add_chain(b, { { 0, 0 }, { 1, 1 } }, {});
    REQUIRE(w.shapes.size() == 3);
    CHECK(w.shapes[0].kind == "box");
    CHECK(w.shapes[1].size == std::vector<float>{ 1, 0, 0.3f });
    CHECK(w.shapes[2].size == std::vector<float>{ 0, 0, 1, 1 });
    WheelJointDef jd;
    jd.a = b;
    const Joint j = w.add_wheel_joint(jd);
    w.enable_motor(j, true);
    w.set_motor_speed(j, 3);
    w.set_max_motor_torque(j, 7);
    CHECK(w.joints[0].def.motor);
    CHECK(w.joints[0].def.motor_speed == 3);
    CHECK(w.joints[0].def.max_motor_torque == 7);
    w.apply_force(b, { 1, 2 });
    w.apply_force(b, { 1, 0 });
    w.apply_torque(b, 0.5f);
    CHECK(w.force_on(b).x == 2);
    CHECK(w.force_on(b).y == 2);
    CHECK(w.torque_on(b) == 0.5f);
    CHECK(w.rotation(b).c == doctest::Approx(std::cos(0.25f)));
    w.bodies[0].velocity = { 2, 0 };
    w.bodies[0].spin = 1;
    w.next_contacts = { { 1, 2, true } };
    w.step(0.5f, 3);
    CHECK(w.position(b).x == doctest::Approx(2));
    CHECK(w.angle(b) == doctest::Approx(0.75f));
    CHECK(w.linear_velocity(b).x == 2);
    CHECK(w.angular_velocity(b) == 1);
    CHECK(w.pushes.empty());
    REQUIRE(w.contacts().size() == 1);
    CHECK(w.contacts()[0].tag_b == 2);
    CHECK(w.steps == 1);
    CHECK(w.last_dt == 0.5f);
    CHECK(w.last_substeps == 3);
    w.step(0.5f, 4);
    CHECK(w.contacts().empty());   // delivered once
}

TEST_CASE("the public headers name no backend: code on the contract never sees Box2D") {
    for (const char* header : { "include/xl_physics2d.h", "include/xl_physics2d_fake.h" }) {
        const std::string text = read(header);
        REQUIRE_FALSE(text.empty());
        CHECK(text.find("box2d") == std::string::npos);
        CHECK(text.find("b2") == std::string::npos);
    }
}
