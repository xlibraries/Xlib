#include "doctest.h"
#include "xl_physics.h"
#include <cmath>
#include <vector>

using namespace xl::phys;

namespace {

/** A world with a 40×40 m static floor at y = 0. */
std::unique_ptr<World> floored() {
    auto w = World::create();
    w->add_box(Motion::Static, { 0, -0.5f, 0 }, {}, { 20, 0.5f, 20 });
    return w;
}

void run(World& w, float seconds) { for (int i = 0; i < static_cast<int>(seconds * 60); i++) w.step(1.0f / 60); }

} // namespace

TEST_CASE("physics: a box falls onto the floor, comes to rest on it, and reports the contact") {
    auto w = floored();
    const Body box = w->add_box(Motion::Dynamic, { 0, 3, 0 }, {}, { 0.25f, 0.25f, 0.25f }, 2);
    CHECK(box.valid());
    CHECK(w->body_count() == 2);
    run(*w, 0.25f);
    CHECK(w->pose(box).position.y < 2.9f);          // falling
    CHECK(w->velocity(box).linear.y < -1.0f);
    run(*w, 3.0f);
    CHECK(w->pose(box).position.y == doctest::Approx(0.25f).epsilon(0.05));   // resting on its bottom face
    CHECK(std::fabs(w->velocity(box).linear.y) < 0.01f);
    CHECK(!w->contacts(box).empty());
    run(*w, 2.0f);
    CHECK(!w->active(box));                            // asleep
    CHECK(w->contacts(box).size() == 1);               // still known to be on the floor
    w->set_velocity(box, { 0, 6, 0 }, {});
    run(*w, 0.3f);
    CHECK(w->contacts(box).empty());                   // in the air again
}

TEST_CASE("physics: spheres bounce with restitution and roll with friction; impulses move things") {
    auto w = floored();
    const Body bouncy = w->add_sphere(Motion::Dynamic, { 0, 2, 0 }, 0.2f, 1, { 0.5f, 0.8f });
    const Body dead = w->add_sphere(Motion::Dynamic, { 3, 2, 0 }, 0.2f, 1, { 0.5f, 0.0f });
    float bouncy_max = 0, dead_max = 0;
    bool landed = false;
    for (int i = 0; i < 240; i++) {
        w->step(1.0f / 60);
        if (w->pose(bouncy).position.y < 0.25f) landed = true;
        if (landed) { bouncy_max = std::max(bouncy_max, w->pose(bouncy).position.y); dead_max = std::max(dead_max, w->pose(dead).position.y); }
    }
    CHECK(bouncy_max > 0.8f);     // came back up
    CHECK(dead_max < 0.35f);      // stayed down
    w->apply_impulse(dead, { 2, 0, 0 });
    run(*w, 1.0f);
    CHECK(w->pose(dead).position.x > 3.5f);
    CHECK(std::fabs(w->velocity(dead).angular.z) > 0.5f);   // rolling, not sliding
}

TEST_CASE("physics: a kinematic body pushes dynamic ones out of the way") {
    auto w = floored();
    const Body bat = w->add_box(Motion::Kinematic, { -2, 0.5f, 0 }, {}, { 0.2f, 0.5f, 1.0f });
    const Body crate = w->add_box(Motion::Dynamic, { 0, 0.3f, 0 }, {}, { 0.3f, 0.3f, 0.3f }, 1);
    run(*w, 0.5f);
    for (int i = 0; i < 120; i++) {
        w->move_kinematic(bat, { -2 + 3.0f * i / 120.0f, 0.5f, 0 }, {}, 1.0f / 60);
        w->step(1.0f / 60);
    }
    CHECK(w->pose(crate).position.x > 0.8f);
    CHECK(w->pose(bat).position.x == doctest::Approx(1.0f).epsilon(0.02));
}

TEST_CASE("physics: a motorised hinge spins a wheel to the requested speed, and a position motor holds an angle") {
    auto w = World::create();
    const Body hub = w->add_box(Motion::Static, { 0, 1, 0 }, {}, { 0.1f, 0.1f, 0.1f });
    const Body wheel = w->add_cylinder(Motion::Dynamic, { 0, 1, 0.3f }, axis_angle({ 1, 0, 0 }, 1.5707963f), 0.05f, 0.3f, 1);
    const Joint axle = w->add_hinge(hub, wheel, { { 0, 1, 0.3f }, { 0, 0, 1 } });
    CHECK(axle.valid());
    w->motor_velocity(axle, 10, 50);
    run(*w, 1.0f);
    CHECK(w->velocity(wheel).angular.z == doctest::Approx(10).epsilon(0.05));
    CHECK(w->pose(wheel).position.y == doctest::Approx(1).epsilon(0.01));   // held by the joint, not fallen
    w->motor_velocity(axle, 0, 0);
    // a pendulum arm with a position motor
    const Body arm = w->add_box(Motion::Dynamic, { 2, 1.5f, 0 }, {}, { 0.05f, 0.5f, 0.05f }, 0.5f);
    const Joint shoulder = w->add_hinge({}, arm, { { 2, 2, 0 }, { 0, 0, 1 } });
    w->motor_position(shoulder, 1.0f, 100, 20, 1);
    run(*w, 2.0f);
    CHECK(w->joint_position(shoulder) == doctest::Approx(1.0f).epsilon(0.05));
}

TEST_CASE("physics: a slider with a motor drives a gripper finger to a distance") {
    auto w = World::create();
    const Body base = w->add_box(Motion::Static, { 0, 1, 0 }, {}, { 0.2f, 0.2f, 0.2f });
    const Body finger = w->add_box(Motion::Dynamic, { 0.5f, 1, 0 }, {}, { 0.05f, 0.1f, 0.1f }, 0.1f);
    const Joint rail = w->add_slider(base, finger, { { 0.5f, 1, 0 }, { 1, 0, 0 }, true, -0.3f, 0.3f });
    w->motor_position(rail, -0.25f, 20, 10, 1);
    run(*w, 2.0f);
    CHECK(w->joint_position(rail) == doctest::Approx(-0.25f).epsilon(0.05));
    CHECK(w->pose(finger).position.x == doctest::Approx(0.25f).epsilon(0.05));
    CHECK(w->pose(finger).position.y == doctest::Approx(1).epsilon(0.01));
}

TEST_CASE("physics: rays hit the nearest body and report where, including a height field") {
    auto w = floored();
    const Body box = w->add_box(Motion::Static, { 0, 1, 0 }, {}, { 0.5f, 0.5f, 0.5f });
    RayHit hit;
    REQUIRE(w->raycast({ 0, 5, 0 }, { 0, -1, 0 }, 10, hit));
    CHECK(hit.body == box);
    CHECK(hit.point.y == doctest::Approx(1.5f));
    CHECK(hit.distance == doctest::Approx(3.5f));
    CHECK(hit.normal.y == doctest::Approx(1));
    REQUIRE(w->raycast({ 3, 5, 0 }, { 0, -1, 0 }, 10, hit));     // misses the box, hits the floor
    CHECK(hit.point.y == doctest::Approx(0).epsilon(0.01));
    CHECK(!w->raycast({ 0, 5, 0 }, { 0, 1, 0 }, 10, hit));        // nothing above

    // a 4×4 height field sloping up along x: height = i * 0.5
    std::vector<float> heights(16);
    for (int j = 0; j < 4; j++) for (int i = 0; i < 4; i++) heights[j * 4 + i] = i * 0.5f;
    auto h = World::create();
    const Body field = h->add_height_field(heights, 4, { 0, 0, 0 }, 1.0f);
    REQUIRE(field.valid());
    REQUIRE(h->raycast({ 2, 5, 1.5f }, { 0, -1, 0 }, 10, hit));
    CHECK(hit.point.y == doctest::Approx(1.0f).epsilon(0.02));
    CHECK(!h->add_height_field(heights, 3, {}, 1).valid());        // odd sample counts are refused
}

TEST_CASE("physics: the same scene steps to the same result, every time") {
    std::vector<float> ys[2];
    for (auto& y : ys) {
        auto w = floored();
        for (int i = 0; i < 12; i++) w->add_box(Motion::Dynamic, { (i % 3) * 0.6f - 0.6f, 1 + (i / 3) * 0.7f, (i % 2) * 0.3f }, axis_angle({ 1, 1, 0 }, 0.3f * i), { 0.3f, 0.3f, 0.3f }, 1);
        run(*w, 3.0f);
        for (uint32_t id = 1; id < 16; id++) y.push_back(w->pose({ id }).position.y);
    }
    CHECK(ys[0] == ys[1]);
}

TEST_CASE("physics: quaternion helpers") {
    const V3 v = rotate(axis_angle({ 0, 1, 0 }, 1.5707963f), { 1, 0, 0 });
    CHECK(v.x == doctest::Approx(0).epsilon(0.001));
    CHECK(v.z == doctest::Approx(-1));
    const V3 e = rotate(euler(1.5707963f, 0, 0), { 1, 0, 0 });
    CHECK(e.z == doctest::Approx(-1));
    CHECK(axis_angle({ 0, 0, 0 }, 1).w == 1);
}
