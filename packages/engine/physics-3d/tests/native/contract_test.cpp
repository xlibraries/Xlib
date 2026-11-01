/**
 * @file contract_test.cpp
 * @brief What any World must do (checked on Jolt and on the fake alike), the fake's own recording and scripting, and
 * the rule that the public headers name no backend.
 */
#include "doctest.h"
#include "xl_physics.h"
#include "xl_physics_fake.h"

#include <fstream>
#include <sstream>
#include <string>

using namespace xl::phys;

namespace {

/** Bookkeeping every backend shares: bodies counted and removed, poses and velocities kept, kinematic moves. */
void contract(World& w) {
    const Body box = w.add_box(Motion::Dynamic, { 1, 2, 3 }, {}, { 0.5f, 0.5f, 0.5f });
    const Body ball = w.add_sphere(Motion::Dynamic, { 5, 2, 0 }, 0.5f);
    const Body kin = w.add_box(Motion::Kinematic, { 0, 0, 0 }, {}, { 1, 0.1f, 1 });
    CHECK(box.valid());
    CHECK_FALSE(box == ball);
    CHECK(w.body_count() == 3);
    CHECK(w.pose(box).position.y == doctest::Approx(2));
    w.set_velocity(ball, { 1, 0, 0 }, {});
    CHECK(w.velocity(ball).linear.x == doctest::Approx(1));
    w.move_kinematic(kin, { 0, 1, 0 }, {}, 1.0f / 60);
    w.step(1.0f / 60);
    CHECK(w.pose(kin).position.y == doctest::Approx(1).epsilon(0.01));
    CHECK(w.pose(ball).position.x > 5);
    w.remove(ball);
    CHECK(w.body_count() == 2);
    const Joint j = w.add_hinge(box, Body{}, { { 1, 2, 3 }, { 0, 0, 1 } });
    CHECK(j.valid());
    CHECK(w.joint_position(j) == doctest::Approx(0).epsilon(0.01));
    w.motor_velocity(j, 1, 10);
    w.remove(j);
}

std::string read(const char* path) { std::ifstream in(path); std::stringstream s; s << in.rdbuf(); return s.str(); }

} // namespace

TEST_CASE("Jolt keeps the contract") { auto w = World::create(0); contract(*w); }
TEST_CASE("the fake keeps the contract") { FakeWorld w; contract(w); }

TEST_CASE("the fake keeps what it's told and records every push, wake and motor change") {
    FakeWorld w;
    const Body cyl = w.add_cylinder(Motion::Dynamic, { 0, 1, 0 }, {}, 0.5f, 0.2f, 3, { 0.8f, 0.1f });
    const Body cap = w.add_capsule(Motion::Static, {}, {}, 1, 0.3f);
    const Body mesh = w.add_mesh({ 0, 0, 0, 1, 0, 0, 0, 0, 1 }, { 0, 1, 2 });
    const Body field = w.add_height_field({ 0, 0, 0, 0 }, 2, { -1, 0, -1 }, 1);
    CHECK(w.bodies[0].shape == "cylinder");
    CHECK(w.bodies[0].size == std::vector<float>{ 0.5f, 0.2f });
    CHECK(w.bodies[0].mass == 3);
    CHECK(w.bodies[0].material.friction == doctest::Approx(0.8f));
    CHECK(w.bodies[1].shape == "capsule");
    CHECK(w.bodies[2].shape == "mesh");
    CHECK(w.bodies[3].pose.position.x == -1);
    CHECK(w.active(cyl));
    CHECK_FALSE(w.active(cap));   // static never wakes
    w.apply_force(cyl, { 1, 0, 0 });
    w.apply_force(cyl, { 1, 2, 0 });
    w.apply_torque(cyl, { 0, 3, 0 });
    w.apply_impulse(cyl, { 0, 0, 4 });
    CHECK(w.total("force", cyl).x == 2);
    CHECK(w.total("force", cyl).y == 2);
    CHECK(w.total("torque", cyl).y == 3);
    CHECK(w.total("impulse", cyl).z == 4);
    CHECK(w.total("force", mesh).x == 0);
    w.wake(cyl);
    CHECK(w.woken.size() == 1);
    w.set_surface_velocity(field, { 0.5f, 0, 0 });
    CHECK(w.bodies[3].surface_velocity.x == 0.5f);
    w.set_tolerances(0.001f, 0.002f);
    CHECK(w.slop == 0.001f);
    CHECK(w.speculative == 0.002f);
    const Joint s = w.add_slider(cyl, cap, { { 0, 0, 0 }, { 1, 0, 0 }, true, -1, 1 });
    const Joint f = w.add_fixed(cyl, mesh);
    w.motor_position(s, 0.5f, 20);
    CHECK(w.joints[0].kind == "slider");
    CHECK(w.joints[0].slider.limited);
    CHECK(w.joints[0].motor == "position");
    CHECK(w.joints[0].target == 0.5f);
    w.motor_velocity(s, 2, 0);
    CHECK(w.joints[0].motor == "off");   // a zero limit turns it off
    CHECK(w.joints[1].kind == "fixed");
    w.joints[0].position = 0.3f;
    CHECK(w.joint_position(s) == 0.3f);
    w.remove(f);
    CHECK_FALSE(w.joints[1].alive);
    w.step(0.1f);
    CHECK(w.pushes.empty());
    CHECK(w.steps == 1);
}

TEST_CASE("the fake answers ray casts and contacts the way a test scripts them") {
    FakeWorld w;
    const Body a = w.add_sphere(Motion::Dynamic, {}, 1);
    const Body b = w.add_sphere(Motion::Dynamic, {}, 1);
    RayHit hit;
    CHECK_FALSE(w.raycast({}, { 0, -1, 0 }, 10, hit));
    w.ray_hits = true;
    w.ray = { b, { 0, -2, 0 }, { 0, 1, 0 }, 2 };
    REQUIRE(w.raycast({}, { 0, -1, 0 }, 10, hit));
    CHECK(hit.body == b);
    CHECK_FALSE(w.raycast({}, { 0, -1, 0 }, 1, hit));   // out of reach
    CHECK(w.contacts(a).empty());
    w.touch(a, b);
    CHECK(w.touching(a, b));
    CHECK(w.touching(b, a));
    CHECK(w.contacts(a).size() == 1);
}

TEST_CASE("the public headers name no backend: code on the contract never sees Jolt") {
    for (const char* header : { "include/xl_physics.h", "include/xl_physics_fake.h" }) {
        const std::string text = read(header);
        REQUIRE_FALSE(text.empty());
        CHECK(text.find("#include <Jolt") == std::string::npos);
        CHECK(text.find("JPH") == std::string::npos);
    }
}
