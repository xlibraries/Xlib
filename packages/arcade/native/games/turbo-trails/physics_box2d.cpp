// Box2D v3 behind the tt::World interface: a chassis box, two wheels on wheel joints (spring suspension + motor),
// the terrain as a one-sided chain shape. Contact events keep the grounded / chassis-hit flags up to date.
#include "physics.h"
#include "box2d/box2d.h"
#include <algorithm>
#include <cmath>

namespace tt {
namespace {

enum Tag : intptr_t { TAG_GROUND = 1, TAG_CHASSIS = 2, TAG_REAR = 3, TAG_FRONT = 4 };

class Box2DWorld final : public World {
public:
    explicit Box2DWorld(float gravity) {
        b2WorldDef wd = b2DefaultWorldDef();
        wd.gravity = { 0.0f, -gravity };
        world_ = b2CreateWorld(&wd);
    }
    ~Box2DWorld() override { b2DestroyWorld(world_); }

    void set_terrain(const std::vector<float>& xs, const std::vector<float>& ys) override {
        // Box2D chains are one-sided: walking the points, the solid side is on the left, so the ground
        // (solid below) is given right to left
        std::vector<b2Vec2> pts(xs.size());
        for (size_t i = 0; i < xs.size(); i++) pts[xs.size() - 1 - i] = { xs[i], ys[i] };
        b2BodyDef bd = b2DefaultBodyDef();
        const b2BodyId ground = b2CreateBody(world_, &bd);
        b2SurfaceMaterial material = {};
        material.friction = 0.9f;
        material.restitution = 0.0f;
        b2ChainDef cd = b2DefaultChainDef();
        cd.points = pts.data();
        cd.count = static_cast<int>(pts.size());
        cd.materials = &material;
        cd.materialCount = 1;
        cd.isLoop = false;
        cd.userData = reinterpret_cast<void*>(TAG_GROUND);
        b2CreateChain(ground, &cd);
    }

    void spawn(const VehicleSpec& spec, float x, float y) override {
        spec_ = spec;
        b2BodyDef bd = b2DefaultBodyDef();
        bd.type = b2_dynamicBody;
        bd.position = { x, y };
        bd.angularDamping = 0.6f;
        chassis_ = b2CreateBody(world_, &bd);
        b2ShapeDef sd = b2DefaultShapeDef();
        sd.density = spec.mass / (spec.chassis_w * spec.chassis_h);
        sd.material.friction = 0.4f;
        sd.enableContactEvents = true;
        sd.userData = reinterpret_cast<void*>(TAG_CHASSIS);
        const b2Polygon box = b2MakeBox(spec.chassis_w / 2, spec.chassis_h / 2);
        b2CreatePolygonShape(chassis_, &sd, &box);

        for (int i = 0; i < 2; i++) {
            const float wx = (i == 0 ? -1 : 1) * spec.wheel_base / 2;
            b2BodyDef wbd = b2DefaultBodyDef();
            wbd.type = b2_dynamicBody;
            wbd.position = { x + wx, y + spec.wheel_y };
            wbd.angularDamping = 0.3f;
            wheels_[i] = b2CreateBody(world_, &wbd);
            b2ShapeDef wsd = b2DefaultShapeDef();
            wsd.density = 0.25f * spec.mass / (3.14159f * spec.wheel_r * spec.wheel_r);
            wsd.material.friction = spec.tyre_friction;
            wsd.material.rollingResistance = 0.01f;
            wsd.enableContactEvents = true;
            wsd.userData = reinterpret_cast<void*>(i == 0 ? TAG_REAR : TAG_FRONT);
            const b2Circle circle = { { 0, 0 }, spec.wheel_r };
            b2CreateCircleShape(wheels_[i], &wsd, &circle);

            b2WheelJointDef jd = b2DefaultWheelJointDef();
            jd.bodyIdA = chassis_;
            jd.bodyIdB = wheels_[i];
            jd.localAnchorA = { wx, spec.wheel_y };
            jd.localAnchorB = { 0, 0 };
            jd.localAxisA = { 0, 1 };
            jd.enableSpring = true;
            jd.hertz = spec.suspension_hz;
            jd.dampingRatio = spec.suspension_damping;
            jd.enableLimit = true;
            jd.lowerTranslation = -0.22f;
            jd.upperTranslation = 0.12f;
            jd.enableMotor = (i == 0 ? spec.rear_drive : spec.front_drive);
            jd.maxMotorTorque = spec.max_torque;
            jd.motorSpeed = 0;
            joints_[i] = b2CreateWheelJoint(world_, &jd);
        }
    }

    void drive(const DriveInput& in) override {
        const float throttle = std::max(-1.0f, std::min(1.0f, in.throttle));
        const float lean = std::max(-1.0f, std::min(1.0f, in.lean));
        const float boost = std::max(0.0f, std::min(1.0f, in.boost));
        const bool motor_on = in.motor_on;
        for (int i = 0; i < 2; i++) {
            const bool driven = i == 0 ? spec_.rear_drive : spec_.front_drive;
            b2WheelJoint_EnableMotor(joints_[i], driven && motor_on && throttle != 0);
            // positive joint speed turns the wheel anticlockwise, which rolls it to the left
            b2WheelJoint_SetMotorSpeed(joints_[i], -throttle * spec_.max_speed * (1 + 0.5f * boost));
            b2WheelJoint_SetMaxMotorTorque(joints_[i], spec_.max_torque * std::fabs(throttle) * (1 + boost));
        }
        if (boost > 0) {
            // Turbo pushes along the chassis, so in the air it goes where the nose points
            const b2Rot rot = b2Body_GetRotation(chassis_);
            const float f = boost * spec_.boost_force * spec_.mass;
            b2Body_ApplyForceToCenter(chassis_, { rot.c * f, rot.s * f }, true);
        }
        // leaning: anticlockwise is nose up. In the air it's the main control. On the ground leaning back takes real
        // torque to lift the front off its suspension; leaning forward only presses the nose a little (pressing hard
        // pole-vaults the vehicle over its front wheel)
        if (lean != 0) {
            float torque = spec_.air_torque * 1.6f;
            if (!airborne()) torque = lean > 0 ? spec_.air_torque * 0.8f + spec_.max_torque * 0.25f : touching_[0] > 0 ? spec_.air_torque * 0.4f : 0.0f;   // a stoppie, never an endo
            b2Body_ApplyTorque(chassis_, lean * torque, true);
        }
        if (throttle == 0) return;
        if (airborne()) {
            // gas / brake pitch the vehicle a little in the air too
            b2Body_ApplyTorque(chassis_, -throttle * spec_.air_torque, true);
        } else if (motor_on) {
            // on the ground the motor's reaction torque would stand the vehicle on its tail; suspension geometry
            // cancels most of it (anti-squat), leaving a bit of pitch for feel
            const int driven = (spec_.rear_drive ? 1 : 0) + (spec_.front_drive ? 1 : 0);
            b2Body_ApplyTorque(chassis_, -throttle * spec_.max_torque * driven * spec_.wheelie_resistance, true);
        }
    }

    void step(float dt) override {
        chassis_hit_ = false;
        impact_ = 0;
        float vy_before[2];
        for (int i = 0; i < 2; i++) vy_before[i] = b2Body_GetLinearVelocity(wheels_[i]).y;
        b2World_Step(world_, dt, 4);
        const b2ContactEvents ev = b2World_GetContactEvents(world_);
        for (int i = 0; i < ev.beginCount; i++) touch(ev.beginEvents[i].shapeIdA, ev.beginEvents[i].shapeIdB, +1, vy_before);
        for (int i = 0; i < ev.endCount; i++) touch(ev.endEvents[i].shapeIdA, ev.endEvents[i].shapeIdB, -1, vy_before);
    }

    Pose pose() const override {
        Pose p;
        const b2Vec2 c = b2Body_GetPosition(chassis_);
        const b2Vec2 v = b2Body_GetLinearVelocity(chassis_);
        p.x = c.x; p.y = c.y; p.angle = b2Rot_GetAngle(b2Body_GetRotation(chassis_));
        p.vx = v.x; p.vy = v.y; p.omega = b2Body_GetAngularVelocity(chassis_);
        for (int i = 0; i < 2; i++) {
            const b2Vec2 w = b2Body_GetPosition(wheels_[i]);
            p.wheel_x[i] = w.x; p.wheel_y[i] = w.y;
            p.wheel_angle[i] = b2Rot_GetAngle(b2Body_GetRotation(wheels_[i]));
        }
        return p;
    }

    bool wheel_grounded(int wheel) const override { return touching_[wheel] > 0; }
    bool chassis_hit() const override { return chassis_hit_; }
    float landing_impact() const override { return impact_; }

private:
    bool airborne() const { return touching_[0] <= 0 && touching_[1] <= 0; }

    void touch(b2ShapeId a, b2ShapeId b, int delta, const float* vy_before) {
        const intptr_t ta = reinterpret_cast<intptr_t>(b2Shape_GetUserData(a));
        const intptr_t tb = reinterpret_cast<intptr_t>(b2Shape_GetUserData(b));
        if (ta != TAG_GROUND && tb != TAG_GROUND) return;
        const intptr_t other = ta == TAG_GROUND ? tb : ta;
        if (other == TAG_CHASSIS) { if (delta > 0) chassis_hit_ = true; return; }
        const int wheel = other == TAG_REAR ? 0 : other == TAG_FRONT ? 1 : -1;
        if (wheel < 0) return;
        touching_[wheel] = std::max(0, touching_[wheel] + delta);
        if (delta > 0) impact_ = std::max(impact_, std::max(0.0f, -vy_before[wheel]));
    }

    b2WorldId world_ = {};
    b2BodyId chassis_ = {};
    b2BodyId wheels_[2] = {};
    b2JointId joints_[2] = {};
    VehicleSpec spec_;
    int touching_[2] = { 0, 0 };
    bool chassis_hit_ = false;
    float impact_ = 0;
};

} // namespace

std::unique_ptr<World> World::create(float gravity) { return std::make_unique<Box2DWorld>(gravity); }

} // namespace tt
