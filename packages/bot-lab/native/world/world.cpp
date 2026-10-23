// Bot Lab's world: machines on a floor, in the engine's physics (Jolt, through xl_physics). Headless: it runs in the
// runtime worker next to the bench, which couples it to the circuit every few steps, and in Node for the tests. It
// draws nothing; every body it makes is registered with its shape, size and colour (bl_shapes) and its pose
// (bl_poses), which is all a view needs.
//
// Machines: a two-wheeled robot (bl_robot: motors' torques in, wheel speeds out), a five-servo arm (bl_arm: servo
// angles in, joint angles out), a conveyor belt (bl_conveyor: a motor sets the belt's speed), a bin, and cubes.
//
// Frames: y up, metres, kilograms, seconds. The robot's own frame has x forward and z to its right.
#include <emscripten/emscripten.h>
#include <algorithm>
#include <cmath>
#include <memory>
#include <vector>
#include "xl_physics.h"

using namespace xl::phys;

namespace {

enum Shape { BOX = 0, CYLINDER = 1, SPHERE = 2 };

/** A body as views draw it: shape, size (box: half extents; cylinder: radius, half height; sphere: radius), colour */
struct Drawn { Body body; Shape shape; float a, b, c; float r, g, bl; };

struct Robot {
    Body chassis, left, right, caster;
    Joint left_hinge, right_hinge;
    float chassis_y = 0;
    float torque_left = 0, torque_right = 0;
};

/** The arm's joints, in order: base (yaw), shoulder, elbow, wrist, gripper (both fingers) */
constexpr int ARM_JOINTS = 5;
struct Arm {
    Joint joints[ARM_JOINTS] = {};
    Joint second_finger = {};
    std::vector<Body> bodies;         // woken whenever they're driven (a motor's new target doesn't wake a sleeper)
    float limit[ARM_JOINTS] = {};     // torque (N·m) or, for the gripper, force (N)
    float target[ARM_JOINTS] = {};    // radians, or the fingers' opening (m)
    float finger_open = 0.02f;        // each finger's travel from closed to open
};

struct Conveyor { Body body; V3 dir; float speed = 0; float top = 0; float half_len = 0, half_wid = 0; V3 centre; };

std::unique_ptr<World> world;
std::vector<Drawn> drawn;
Robot robot;
bool has_robot = false;
Arm arm;
bool has_arm = false;
Conveyor conveyor;
bool has_conveyor = false;
std::vector<Body> cubes;

V3 add(V3 a, V3 b) { return {a.x + b.x, a.y + b.y, a.z + b.z}; }
V3 scale(V3 a, float s) { return {a.x * s, a.y * s, a.z * s}; }
float dot(V3 a, V3 b) { return a.x * b.x + a.y * b.y + a.z * b.z; }
Quat mul(Quat a, Quat b) {
    return {a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y, a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
            a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w, a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z};
}

Body box(Motion m, V3 at, Quat q, V3 half, float mass, Material mat, float r, float g, float b) {
    const Body body = world->add_box(m, at, q, half, mass, mat);
    drawn.push_back({body, BOX, half.x, half.y, half.z, r, g, b});
    return body;
}
Body cylinder(Motion m, V3 at, Quat q, float half_height, float radius, float mass, Material mat, float r, float g, float b) {
    const Body body = world->add_cylinder(m, at, q, half_height, radius, mass, mat);
    drawn.push_back({body, CYLINDER, radius, half_height, 0, r, g, b});
    return body;
}
Body sphere(Motion m, V3 at, float radius, float mass, Material mat, float r, float g, float b) {
    const Body body = world->add_sphere(m, at, radius, mass, mat);
    drawn.push_back({body, SPHERE, radius, 0, 0, r, g, b});
    return body;
}

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

/** The belt's surface moves (friction carries what rests on it); cubes on it are kept awake while it runs. */
void run_belt() {
    if (!has_conveyor) return;
    world->set_surface_velocity(conveyor.body, scale(conveyor.dir, conveyor.speed));
    if (std::fabs(conveyor.speed) < 1e-4f) return;
    for (Body cube : cubes) if (world->touching(cube, conveyor.body)) world->wake(cube);
}

}  // namespace

extern "C" {

/** A fresh world: a 20 m square floor whose top is y = 0, with millimetre contact tolerances (small machines). */
EMSCRIPTEN_KEEPALIVE void bl_reset() {
    world = World::create(9.81f);
    world->set_tolerances(0.0005f, 0.005f);
    world->add_box(Motion::Static, {0, -0.05f, 0}, {}, {10, 0.05f, 10}, 0, {1.0f, 0.0f});
    drawn.clear();
    cubes.clear();
    has_robot = has_arm = has_conveyor = false;
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
    robot.chassis_y = std::fmax(cr * 2 + 0.002f, wr * 0.5f) + hgt / 2;
    const V3 centre = {x, robot.chassis_y, z};
    robot.chassis = box(Motion::Dynamic, centre, yaw, {len / 2, hgt / 2, wid / 2}, mass, {0.4f, 0.0f}, 0.17f, 0.43f, 0.35f);
    const Quat wheel_rot = mul(yaw, axis_angle({1, 0, 0}, 1.5707963f));
    const auto local = [&](V3 v) { return add(centre, rotate(yaw, v)); };
    const V3 lpos = local({axle_x, wr - robot.chassis_y, -track / 2}), rpos = local({axle_x, wr - robot.chassis_y, track / 2});
    robot.left = cylinder(Motion::Dynamic, lpos, wheel_rot, ww / 2, wr, wm, {1.0f, 0.0f}, 0.12f, 0.12f, 0.12f);
    robot.right = cylinder(Motion::Dynamic, rpos, wheel_rot, ww / 2, wr, wm, {1.0f, 0.0f}, 0.12f, 0.12f, 0.12f);
    const V3 axis = rotate(yaw, {0, 0, -1});
    robot.left_hinge = world->add_hinge(robot.chassis, robot.left, {lpos, axis});
    robot.right_hinge = world->add_hinge(robot.chassis, robot.right, {rpos, axis});
    robot.caster = sphere(Motion::Dynamic, local({caster_x, cr - robot.chassis_y, 0}), cr, 0.02f, {0.0f, 0.0f}, 0.6f, 0.68f, 0.64f);
    world->add_fixed(robot.chassis, robot.caster);
    robot.torque_left = robot.torque_right = 0;
    has_robot = true;
    return 1;
}

EMSCRIPTEN_KEEPALIVE void bl_torque(float left, float right) { robot.torque_left = left; robot.torque_right = right; }

/**
 * A desktop arm on a fixed base: base yaw, shoulder, elbow and wrist servos, and a two-finger gripper. p: x, z,
 * heading; upper arm and forearm lengths; then the five servos' limits (N·m; the gripper's in N). At its neutral pose
 * (every servo at 90°) the upper arm stands straight up, the forearm points forward and the gripper points down.
 */
EMSCRIPTEN_KEEPALIVE int bl_arm(const float* p) {
    if (!world) bl_reset();
    const float x = p[0], z = p[1], heading = p[2], l1 = p[3], l2 = p[4];
    if (l1 < 0.04f || l2 < 0.04f || l1 > 0.4f || l2 > 0.4f) return 0;
    for (int i = 0; i < ARM_JOINTS; i++) { arm.limit[i] = std::max(0.0f, p[5 + i]); arm.target[i] = 0; }
    const Quat yaw = axis_angle({0, 1, 0}, heading);
    const auto at = [&](V3 v) { return add({x, 0, z}, rotate(yaw, v)); };
    const V3 up = {0, 1, 0}, side = rotate(yaw, {0, 0, 1});      // the arm bends about its own z (side) axis
    const Material plastic = {0.5f, 0.0f};
    // a heavy base on the floor, a turntable on it
    const Body base = cylinder(Motion::Static, at({0, 0.015f, 0}), {}, 0.015f, 0.055f, 0, plastic, 0.2f, 0.22f, 0.25f);
    // the turntable rides 2 mm above the base on its hinge (a bearing): resting on it, friction would make it stick
    const Body table = cylinder(Motion::Dynamic, at({0, 0.042f, 0}), {}, 0.01f, 0.045f, 0.06f, plastic, 0.95f, 0.55f, 0.15f);
    arm.joints[0] = world->add_hinge(base, table, {at({0, 0.042f, 0}), up});
    // Links stop short of their neighbours' joints: jointed bodies still collide, so nothing may overlap at rest.
    // shoulder at 7 cm; the upper arm stands up from it
    const float sh = 0.07f, gap = 0.012f;
    const Body upper = box(Motion::Dynamic, at({0, sh + l1 / 2, 0}), yaw, {0.012f, l1 / 2 - gap, 0.015f}, 0.04f, plastic, 0.95f, 0.55f, 0.15f);
    arm.joints[1] = world->add_hinge(table, upper, {at({0, sh, 0}), side});
    // the elbow at the top; the forearm points forward
    const V3 elbow = at({0, sh + l1, 0});
    const Body fore = box(Motion::Dynamic, at({l2 / 2, sh + l1, 0}), yaw, {l2 / 2 - gap, 0.01f, 0.013f}, 0.03f, plastic, 0.95f, 0.55f, 0.15f);
    arm.joints[2] = world->add_hinge(upper, fore, {elbow, side});
    // the wrist at its end; the gripper's palm hangs below it
    const V3 wrist = at({l2, sh + l1, 0});
    const Body palm = box(Motion::Dynamic, at({l2, sh + l1 - 0.027f, 0}), yaw, {0.008f, 0.015f, 0.03f}, 0.02f, plastic, 0.3f, 0.32f, 0.35f);
    arm.joints[3] = world->add_hinge(fore, palm, {wrist, side});
    // two fingers below the palm, sliding across it (the gripper's servo drives both, mirrored); they grip 6.5 cm
    // below the wrist
    const Material grip = {1.2f, 0.0f};
    const float fy = sh + l1 - 0.065f;
    arm.finger_open = 0.02f;
    const Body f1 = box(Motion::Dynamic, at({l2, fy, -0.025f}), yaw, {0.006f, 0.02f, 0.003f}, 0.006f, grip, 0.85f, 0.85f, 0.85f);
    const Body f2 = box(Motion::Dynamic, at({l2, fy, 0.025f}), yaw, {0.006f, 0.02f, 0.003f}, 0.006f, grip, 0.85f, 0.85f, 0.85f);
    arm.joints[4] = world->add_slider(palm, f1, {at({l2, fy, -0.025f}), side});
    arm.second_finger = world->add_slider(palm, f2, {at({l2, fy, 0.025f}), scale(side, -1)});
    arm.bodies = {table, upper, fore, palm, f1, f2};
    has_arm = true;
    return 1;
}

/**
 * Where the arm's servos want to be: radians from neutral for the base, shoulder, elbow and wrist; for the gripper,
 * 0 (open) to 1 (closed).
 */
EMSCRIPTEN_KEEPALIVE void bl_arm_target(float base, float shoulder, float elbow, float wrist, float grip) {
    arm.target[0] = base; arm.target[1] = shoulder; arm.target[2] = elbow; arm.target[3] = wrist;
    arm.target[4] = std::clamp(grip, 0.0f, 1.0f) * arm.finger_open * 0.95f;   // each finger's travel inwards
}

/** The joints' actual angles (radians) and the gripper's closing (0..1), into out[5]. */
EMSCRIPTEN_KEEPALIVE void bl_arm_state(float* out) {
    if (!has_arm) return;
    for (int i = 0; i < 4; i++) out[i] = world->joint_position(arm.joints[i]);
    out[4] = world->joint_position(arm.joints[4]) / (arm.finger_open * 0.95f);
}

/** A conveyor belt: a box `len` long (along heading), `wid` wide, its top `hgt` above the floor. */
EMSCRIPTEN_KEEPALIVE int bl_conveyor(float x, float z, float heading, float len, float wid, float hgt) {
    if (!world) bl_reset();
    if (len <= 0.05f || wid <= 0.01f || hgt <= 0.005f) return 0;
    const Quat yaw = axis_angle({0, 1, 0}, heading);
    conveyor.body = box(Motion::Static, {x, hgt / 2, z}, yaw, {len / 2, hgt / 2, wid / 2}, 0, {0.6f, 0.0f}, 0.14f, 0.14f, 0.15f);
    conveyor.dir = rotate(yaw, {1, 0, 0});
    conveyor.top = hgt;
    conveyor.half_len = len / 2;
    conveyor.half_wid = wid / 2;
    conveyor.centre = {x, hgt, z};
    conveyor.speed = 0;
    // an end stop: cubes wait against it at the far end while the belt slides under them
    const V3 end = add(V3{x, hgt + 0.012f, z}, scale(conveyor.dir, len / 2 + 0.003f));
    box(Motion::Static, end, yaw, {0.003f, 0.012f, wid / 2}, 0, {0.3f, 0.0f}, 0.75f, 0.2f, 0.2f);
    has_conveyor = true;
    return 1;
}

/** The belt's surface speed, m/s (positive runs towards its far end) */
EMSCRIPTEN_KEEPALIVE void bl_belt(float speed) { conveyor.speed = speed; }

/** A cube of `size` (m) and `mass` (kg), coloured (r, g, b); returns its index among the cubes. */
EMSCRIPTEN_KEEPALIVE int bl_cube(float x, float y, float z, float size, float mass, float r, float g, float b) {
    if (!world) bl_reset();
    cubes.push_back(box(Motion::Dynamic, {x, y, z}, {}, {size / 2, size / 2, size / 2}, mass, {0.8f, 0.0f}, r, g, b));
    return static_cast<int>(cubes.size()) - 1;
}

/** Cube i's position into out[3] */
EMSCRIPTEN_KEEPALIVE void bl_cube_pos(int i, float* out) {
    if (i < 0 || i >= static_cast<int>(cubes.size())) return;
    const V3 p = world->pose(cubes[i]).position;
    out[0] = p.x; out[1] = p.y; out[2] = p.z;
}

/** A bin: a floor plate and four walls, `size` square (inside) and `depth` deep. */
EMSCRIPTEN_KEEPALIVE void bl_bin(float x, float z, float size, float depth) {
    if (!world) bl_reset();
    const float t = 0.004f, h = size / 2;
    const Material m = {0.6f, 0.0f};
    box(Motion::Static, {x, t / 2, z}, {}, {h + t, t / 2, h + t}, 0, m, 0.2f, 0.45f, 0.75f);
    box(Motion::Static, {x - h - t / 2, depth / 2, z}, {}, {t / 2, depth / 2, h + t}, 0, m, 0.2f, 0.45f, 0.75f);
    box(Motion::Static, {x + h + t / 2, depth / 2, z}, {}, {t / 2, depth / 2, h + t}, 0, m, 0.2f, 0.45f, 0.75f);
    box(Motion::Static, {x, depth / 2, z - h - t / 2}, {}, {h, depth / 2, t / 2}, 0, m, 0.2f, 0.45f, 0.75f);
    box(Motion::Static, {x, depth / 2, z + h + t / 2}, {}, {h, depth / 2, t / 2}, 0, m, 0.2f, 0.45f, 0.75f);
}

/** What's below (x, height, z), looking straight down: 1 if a cube is within `range`, else 0. */
EMSCRIPTEN_KEEPALIVE int bl_sees_cube(float x, float height, float z, float range) {
    RayHit hit;
    if (!world || !world->raycast({x, height, z}, {0, -1, 0}, range, hit)) return 0;
    return std::find(cubes.begin(), cubes.end(), hit.body) != cubes.end() ? 1 : 0;
}

EMSCRIPTEN_KEEPALIVE void bl_step(float dt, int substeps) {
    if (!world) return;
    if (has_robot) {
        const V3 a = axle();
        world->apply_torque(robot.left, scale(a, robot.torque_left));
        world->apply_torque(robot.right, scale(a, robot.torque_right));
        world->apply_torque(robot.chassis, scale(a, -(robot.torque_left + robot.torque_right)));
    }
    if (has_arm) {
        for (Body b : arm.bodies) world->wake(b);
        for (int i = 0; i < 4; i++) world->motor_position(arm.joints[i], arm.target[i], arm.limit[i], 80, 1);
        world->motor_position(arm.joints[4], arm.target[4], arm.limit[4], 40, 1);
        world->motor_position(arm.second_finger, arm.target[4], arm.limit[4], 40, 1);
    }
    run_belt();
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

/** How many bodies there are to draw */
EMSCRIPTEN_KEEPALIVE int bl_body_count() { return static_cast<int>(drawn.size()); }

/** Each body's look into out[7 × count]: shape (0 box, 1 cylinder, 2 sphere), size a, b, c, colour r, g, b */
EMSCRIPTEN_KEEPALIVE void bl_shapes(float* out) {
    for (size_t i = 0; i < drawn.size(); i++) {
        const Drawn& d = drawn[i];
        float* o = out + i * 7;
        o[0] = static_cast<float>(d.shape); o[1] = d.a; o[2] = d.b; o[3] = d.c; o[4] = d.r; o[5] = d.g; o[6] = d.bl;
    }
}

/** Each body's pose into out[7 × count]: position xyz, rotation xyzw */
EMSCRIPTEN_KEEPALIVE void bl_poses(float* out) {
    for (size_t i = 0; i < drawn.size(); i++) write_pose(drawn[i].body, out + i * 7);
}

}  // extern "C"
