// Bot Lab's world: a robot on a floor, in the engine's physics (Jolt, through xl_physics). Headless: it runs in the
// runtime worker next to the bench, which couples it to the circuit every few steps (the motors' torques in, the
// wheels' speeds out), and in Node for the tests. No drawing here; the app's view gets the poses.
//
// Frames: y up, metres, kilograms, seconds. The robot's own frame has x forward and z to its right; its left wheel
// sits at -z. Wheel speeds are measured relative to the chassis, positive when rolling forward.
#include <emscripten/emscripten.h>
#include <cmath>
#include <memory>
#include "xl_physics.h"

using namespace xl::phys;

namespace {

struct Robot {
    Body chassis, left, right, caster;
    Joint left_hinge, right_hinge;
    float chassis_y = 0;      // the chassis centre's height above the floor
    float torque_left = 0, torque_right = 0;
};

std::unique_ptr<World> world;
Robot robot;
bool has_robot = false;

V3 add(V3 a, V3 b) { return {a.x + b.x, a.y + b.y, a.z + b.z}; }
V3 scale(V3 a, float s) { return {a.x * s, a.y * s, a.z * s}; }
float dot(V3 a, V3 b) { return a.x * b.x + a.y * b.y + a.z * b.z; }
Quat mul(Quat a, Quat b) {
    return {a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y, a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
            a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w, a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z};
}

/** The axle direction in the world: the chassis's -z (its left), so a wheel rolling forward spins positively about it. */
V3 axle() { return rotate(world->pose(robot.chassis).rotation, {0, 0, -1}); }

float wheel_speed(Body wheel) {
    const V3 a = axle();
    return dot(world->velocity(wheel).angular, a) - dot(world->velocity(robot.chassis).angular, a);
}

void write_pose(Body body, float* out) {
    const Pose p = world->pose(body);
    out[0] = p.position.x; out[1] = p.position.y; out[2] = p.position.z;
    out[3] = p.rotation.x; out[4] = p.rotation.y; out[5] = p.rotation.z; out[6] = p.rotation.w;
}

}  // namespace

extern "C" {

/** A fresh world: a 20 m square floor whose top is y = 0. */
EMSCRIPTEN_KEEPALIVE void bl_reset() {
    world = World::create(9.81f);
    world->set_tolerances(0.0005f, 0.005f);   // millimetres: the robot's wheels are 32 mm
    world->add_box(Motion::Static, {0, -0.05f, 0}, {}, {10, 0.05f, 10}, 0, {1.0f, 0.0f});
    has_robot = false;
}

/**
 * A two-wheeled robot with a caster. p: chassis length, width, height, mass; wheel radius, width, mass; track (between
 * the wheels' centres); axle offset forward of the chassis centre; caster offset; caster radius; x, z, heading (rad).
 */
EMSCRIPTEN_KEEPALIVE int bl_robot(const float* p) {
    if (!world) bl_reset();
    const float len = p[0], wid = p[1], hgt = p[2], mass = p[3], wr = p[4], ww = p[5], wm = p[6], track = p[7], axle_x = p[8], caster_x = p[9], cr = p[10];
    const float x = p[11], z = p[12], heading = p[13];
    if (len <= 0 || wid <= 0 || hgt <= 0 || mass <= 0 || wr <= 0 || ww <= 0 || wm <= 0 || track <= wid || cr <= 0 || cr * 2 >= wr * 2 + hgt) return 0;
    const Quat yaw = axis_angle({0, 1, 0}, heading);
    // the chassis floats just above the caster's top, so nothing overlaps (jointed bodies still collide)
    robot.chassis_y = std::fmax(cr * 2 + 0.002f, wr * 0.5f) + hgt / 2;
    const V3 centre = {x, robot.chassis_y, z};
    robot.chassis = world->add_box(Motion::Dynamic, centre, yaw, {len / 2, hgt / 2, wid / 2}, mass, {0.4f, 0.0f});
    const Quat wheel_rot = mul(yaw, axis_angle({1, 0, 0}, 1.5707963f));   // cylinders are along y; turn them onto z
    const auto local = [&](V3 v) { return add(centre, rotate(yaw, v)); };
    const V3 lpos = local({axle_x, wr - robot.chassis_y, -track / 2}), rpos = local({axle_x, wr - robot.chassis_y, track / 2});
    robot.left = world->add_cylinder(Motion::Dynamic, lpos, wheel_rot, ww / 2, wr, wm, {1.0f, 0.0f});
    robot.right = world->add_cylinder(Motion::Dynamic, rpos, wheel_rot, ww / 2, wr, wm, {1.0f, 0.0f});
    const V3 axis = rotate(yaw, {0, 0, -1});
    robot.left_hinge = world->add_hinge(robot.chassis, robot.left, {lpos, axis});
    robot.right_hinge = world->add_hinge(robot.chassis, robot.right, {rpos, axis});
    // the caster: a frictionless ball welded under the chassis
    robot.caster = world->add_sphere(Motion::Dynamic, local({caster_x, cr - robot.chassis_y, 0}), cr, 0.02f, {0.0f, 0.0f});
    world->add_fixed(robot.chassis, robot.caster);
    robot.torque_left = robot.torque_right = 0;
    has_robot = true;
    return 1;
}

/** The motors' torques on the wheels this step, N·m (positive drives forward); the chassis takes the reaction. */
EMSCRIPTEN_KEEPALIVE void bl_torque(float left, float right) {
    robot.torque_left = left;
    robot.torque_right = right;
}

EMSCRIPTEN_KEEPALIVE void bl_step(float dt, int substeps) {
    if (!world) return;
    if (has_robot) {
        const V3 a = axle();
        world->apply_torque(robot.left, scale(a, robot.torque_left));
        world->apply_torque(robot.right, scale(a, robot.torque_right));
        world->apply_torque(robot.chassis, scale(a, -(robot.torque_left + robot.torque_right)));
    }
    world->step(dt, substeps < 1 ? 1 : substeps);
}

/**
 * The robot's state into out[26]: chassis pose (position xyz, rotation xyzw), left and right wheel poses, the caster's
 * position, then the left and right wheel speeds (rad/s, relative to the chassis, + forward).
 */
EMSCRIPTEN_KEEPALIVE void bl_state(float* out) {
    if (!has_robot) return;
    write_pose(robot.chassis, out);
    write_pose(robot.left, out + 7);
    write_pose(robot.right, out + 14);
    const V3 c = world->pose(robot.caster).position;
    out[21] = c.x; out[22] = c.y; out[23] = c.z;
    out[24] = wheel_speed(robot.left);
    out[25] = wheel_speed(robot.right);
}

/** Where a point of the robot (x forward, z right, in its frame) is over the floor: out[0] = x, out[1] = z. */
EMSCRIPTEN_KEEPALIVE void bl_point(float lx, float lz, float* out) {
    if (!has_robot) return;
    const Pose p = world->pose(robot.chassis);
    const V3 w = add(p.position, rotate(p.rotation, {lx, 0, lz}));
    out[0] = w.x;
    out[1] = w.z;
}

}  // extern "C"
