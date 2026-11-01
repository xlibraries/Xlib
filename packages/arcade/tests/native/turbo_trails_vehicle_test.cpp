/**
 * @file turbo_trails_vehicle_test.cpp
 * @brief Turbo Trails' vehicle rules (vehicle.cpp) on the fake 2D physics: what it builds, what each input asks of
 * the physics, and how contacts become "grounded", landing impacts and roof hits. No simulation runs.
 */
#include "doctest.h"
#include "games/turbo-trails/physics.h"
#include "xl_physics2d_fake.h"

#include <cmath>

using namespace xl::phys2d;

namespace {

enum : uint32_t { GROUND = 1, CHASSIS = 2, REAR = 3, FRONT = 4 };

/** A vehicle on a fake world the test can look into. */
struct Rig {
    FakeWorld2D* fake;
    std::unique_ptr<tt::World> world;
    tt::VehicleSpec spec;
    Body chassis{ 2 }, rear{ 3 }, front{ 4 };   // the ground is body 1

    explicit Rig(tt::VehicleSpec s = {}) : spec(s) {
        auto f = std::make_unique<FakeWorld2D>();
        fake = f.get();
        world = tt::World::on(std::move(f));
        world->set_terrain({ 0, 1, 2, 3 }, { 0, 0.5f, 0, 0 });
        world->spawn(spec, 10, 2);
    }
    /** One step with these contacts (begin: true) reported. */
    void step(std::vector<ContactEvent> events = {}) { fake->next_contacts = std::move(events); world->step(1.0f / 120); }
    void land() { step({ { GROUND, REAR, true }, { FRONT, GROUND, true } }); }
};

} // namespace

TEST_CASE("the vehicle builds a chassis, two wheels on sprung, motorised wheel joints, and a ground chain solid below") {
    tt::VehicleSpec spec;
    spec.front_drive = false;
    Rig r(spec);
    const FakeWorld2D& f = *r.fake;
    REQUIRE(f.bodies.size() == 4);
    CHECK(f.bodies[0].def.motion == Motion::Static);
    REQUIRE(f.shapes.size() == 4);
    CHECK(f.shapes[0].kind == "chain");
    CHECK(f.shapes[0].size == std::vector<float>{ 3, 0, 2, 0, 1, 0.5f, 0, 0 });   // reversed: right to left
    CHECK(f.shapes[0].def.material.friction == doctest::Approx(0.9f));
    CHECK(f.shapes[0].def.tag == GROUND);
    CHECK(f.bodies[1].def.position.x == 10);
    CHECK(f.bodies[1].def.angular_damping == doctest::Approx(0.6f));
    CHECK(f.shapes[1].kind == "box");
    CHECK(f.shapes[1].size == std::vector<float>{ spec.chassis_w / 2, spec.chassis_h / 2 });
    CHECK(f.shapes[1].def.density == doctest::Approx(spec.mass / (spec.chassis_w * spec.chassis_h)));
    CHECK(f.shapes[1].def.tag == CHASSIS);
    for (int i = 0; i < 2; i++) {
        const auto& wheel = f.shapes[2 + i];
        CHECK(wheel.kind == "circle");
        CHECK(wheel.size[2] == spec.wheel_r);
        CHECK(wheel.def.tag == (i == 0 ? REAR : FRONT));
        CHECK(wheel.def.material.friction == spec.tyre_friction);
        CHECK(f.bodies[2 + i].def.position.x == doctest::Approx(10 + (i == 0 ? -1 : 1) * spec.wheel_base / 2));
        const WheelJointDef& j = f.joints[i].def;
        CHECK(j.a.id == 2);
        CHECK(j.b.id == 3u + i);
        CHECK(j.spring);
        CHECK(j.hertz == spec.suspension_hz);
        CHECK(j.limit);
        CHECK(j.lower < 0);
        CHECK(j.upper > 0);
    }
    CHECK(f.joints[0].def.motor);
    CHECK_FALSE(f.joints[1].def.motor);   // rear-drive only
}

TEST_CASE("gas drives the driven wheels' motors: speed and torque scale with throttle and Turbo") {
    tt::VehicleSpec spec;
    spec.front_drive = false;
    Rig r(spec);
    tt::DriveInput in;
    in.throttle = 0.5f;
    in.motor_on = true;
    r.world->drive(in);
    CHECK(r.fake->joints[0].def.motor);
    CHECK_FALSE(r.fake->joints[1].def.motor);   // not driven
    CHECK(r.fake->joints[0].def.motor_speed == doctest::Approx(-0.5f * spec.max_speed));   // negative: rolls right
    CHECK(r.fake->joints[0].def.max_motor_torque == doctest::Approx(0.5f * spec.max_torque));
    in.boost = 1;
    r.world->drive(in);
    CHECK(r.fake->joints[0].def.motor_speed == doctest::Approx(-0.5f * spec.max_speed * 1.5f));
    CHECK(r.fake->joints[0].def.max_motor_torque == doctest::Approx(0.5f * spec.max_torque * 2));
    in.motor_on = false;
    r.world->drive(in);
    CHECK_FALSE(r.fake->joints[0].def.motor);   // engine off
    in.motor_on = true;
    in.throttle = 0;
    r.world->drive(in);
    CHECK_FALSE(r.fake->joints[0].def.motor);   // no gas
    in.throttle = 9;
    r.world->drive(in);
    CHECK(r.fake->joints[0].def.max_motor_torque == doctest::Approx(spec.max_torque * 2));   // throttle clamped to 1
}

TEST_CASE("Turbo pushes along the chassis, wherever its nose points") {
    Rig r;
    r.fake->bodies[1].angle = 0.5f;
    tt::DriveInput in;
    in.boost = 1;
    r.world->drive(in);
    const V2 f = r.fake->force_on(r.chassis);
    const float magnitude = r.spec.boost_force * r.spec.mass;
    CHECK(f.x == doctest::Approx(std::cos(0.5f) * magnitude));
    CHECK(f.y == doctest::Approx(std::sin(0.5f) * magnitude));
}

TEST_CASE("in the air, leaning turns the vehicle, and gas or brake pitch it a little") {
    Rig r;   // no contacts yet: airborne
    tt::DriveInput in;
    in.lean = 1;
    r.world->drive(in);
    CHECK(r.fake->torque_on(r.chassis) == doctest::Approx(r.spec.air_torque * 2.2f));
    r.step();
    in.lean = 0;
    in.throttle = 1;
    in.motor_on = true;
    r.world->drive(in);
    CHECK(r.fake->torque_on(r.chassis) == doctest::Approx(-r.spec.air_torque));
}

TEST_CASE("on the ground, the motor's reaction is mostly cancelled, and leaning back holds a wheelie") {
    Rig r;
    r.land();
    tt::DriveInput in;
    in.throttle = 1;
    in.motor_on = true;
    r.world->drive(in);
    CHECK(r.fake->torque_on(r.chassis) == doctest::Approx(-r.spec.max_torque * 2 * r.spec.wheelie_resistance));   // both wheels driven
    r.step();
    in.throttle = 0;
    in.lean = 1;
    r.world->drive(in);
    const float cap = r.spec.max_torque + r.spec.air_torque * 1.5f + r.spec.mass * 4.0f;
    CHECK(r.fake->torque_on(r.chassis) == doctest::Approx(cap));   // flat and still: full assist, capped
    r.step();
    r.fake->bodies[1].angle = 0.7f;   // at the wheelie angle for full lean: it holds
    r.world->drive(in);
    CHECK(r.fake->torque_on(r.chassis) == doctest::Approx(0).epsilon(1e-4));
}

TEST_CASE("leaning forward on the ground dips the nose only while the rear wheel is down") {
    Rig r;
    r.land();
    tt::DriveInput in;
    in.lean = -1;
    r.world->drive(in);
    CHECK(r.fake->torque_on(r.chassis) == doctest::Approx(-r.spec.air_torque * 1.2f));
    r.step({ { GROUND, REAR, false } });   // the rear wheel lifts: a stoppie
    r.world->drive(in);
    CHECK(r.fake->torque_on(r.chassis) == 0);
}

TEST_CASE("contacts with the ground decide grounded wheels, landing impacts and roof hits; others don't count") {
    Rig r;
    r.fake->bodies[2].velocity = { 0, -6 };   // the rear wheel falling at 6 m/s
    r.fake->bodies[3].velocity = { 0, 2 };    // the front rising
    r.step({ { GROUND, REAR, true }, { FRONT, GROUND, true } });
    CHECK(r.world->wheel_grounded(0));
    CHECK(r.world->wheel_grounded(1));
    CHECK(r.world->landing_impact() == doctest::Approx(6));   // the hardest landing; a rising wheel counts as 0
    CHECK_FALSE(r.world->chassis_hit());
    r.step({ { CHASSIS, GROUND, true } });
    CHECK(r.world->chassis_hit());
    CHECK(r.world->landing_impact() == 0);   // per step
    r.step({ { REAR, FRONT, true }, { GROUND, CHASSIS, false } });   // wheel on wheel; the roof leaving
    CHECK_FALSE(r.world->chassis_hit());
    r.step({ { GROUND, REAR, false }, { GROUND, REAR, false } });   // ends never take a count below zero
    CHECK_FALSE(r.world->wheel_grounded(0));
    CHECK(r.world->wheel_grounded(1));
    r.step({ { GROUND, 99, true } });   // something unknown on the ground
    CHECK(r.fake->last_substeps == 4);
}

TEST_CASE("the pose is the chassis's and the wheels' state, read from the physics") {
    Rig r;
    r.fake->bodies[1].position = { 12, 3 };
    r.fake->bodies[1].angle = 0.3f;
    r.fake->bodies[1].velocity = { 4, -1 };
    r.fake->bodies[1].spin = 2;
    r.fake->bodies[3].position = { 13, 2.5f };
    r.fake->bodies[3].angle = 1.5f;
    const tt::Pose p = r.world->pose();
    CHECK(p.x == 12);
    CHECK(p.y == 3);
    CHECK(p.angle == doctest::Approx(0.3f));
    CHECK(p.vx == 4);
    CHECK(p.vy == -1);
    CHECK(p.omega == 2);
    CHECK(p.wheel_x[1] == 13);
    CHECK(p.wheel_y[1] == 2.5f);
    CHECK(p.wheel_angle[1] == doctest::Approx(1.5f));
    tt::World& w = *r.world;
    w.drive(0.5f, true);   // the shorthand: gas only
    CHECK(r.fake->joints[0].def.motor_speed == doctest::Approx(-0.5f * r.spec.max_speed));
}
