/**
 * @file vehicle.cpp
 * @brief tt::World on the 2D physics contract (xl_physics2d.h): a chassis box, two wheels on wheel joints (spring
 * suspension and a motor), the terrain as a one-sided chain. Contact events keep the grounded and chassis-hit flags
 * up to date. Knows no physics backend: World::create() runs on the default one, and a test can hand it any World2D.
 */
#include "physics.h"
#include "xl_physics2d.h"
#include <algorithm>
#include <cmath>

namespace tt {
namespace {

using namespace xl::phys2d;

enum Tag : uint32_t { TAG_GROUND = 1, TAG_CHASSIS = 2, TAG_REAR = 3, TAG_FRONT = 4 };

class Vehicle final : public World {
public:
    explicit Vehicle(std::unique_ptr<World2D> world) : world_(std::move(world)) {}

    void set_terrain(const std::vector<float>& xs, const std::vector<float>& ys) override {
        // chains are one-sided: walking the points, the solid side is on the left, so the ground (solid below) is
        // given right to left
        std::vector<V2> pts(xs.size());
        for (size_t i = 0; i < xs.size(); i++) pts[xs.size() - 1 - i] = { xs[i], ys[i] };
        const Body ground = world_->add_body({});
        ShapeDef sd;
        sd.material.friction = 0.9f;
        sd.material.restitution = 0.0f;
        sd.tag = TAG_GROUND;
        world_->add_chain(ground, pts, sd);
    }

    void spawn(const VehicleSpec& spec, float x, float y) override {
        spec_ = spec;
        BodyDef bd;
        bd.motion = Motion::Dynamic;
        bd.position = { x, y };
        bd.angular_damping = 0.6f;
        chassis_ = world_->add_body(bd);
        ShapeDef sd;
        sd.density = spec.mass / (spec.chassis_w * spec.chassis_h);
        sd.material.friction = 0.4f;
        sd.tag = TAG_CHASSIS;
        world_->add_box(chassis_, spec.chassis_w / 2, spec.chassis_h / 2, sd);

        for (int i = 0; i < 2; i++) {
            const float wx = (i == 0 ? -1 : 1) * spec.wheel_base / 2;
            BodyDef wbd;
            wbd.motion = Motion::Dynamic;
            wbd.position = { x + wx, y + spec.wheel_y };
            wbd.angular_damping = 0.3f;
            wheels_[i] = world_->add_body(wbd);
            ShapeDef wsd;
            wsd.density = 0.25f * spec.mass / (3.14159f * spec.wheel_r * spec.wheel_r);
            wsd.material.friction = spec.tyre_friction;
            wsd.material.rolling_resistance = 0.01f;
            wsd.tag = i == 0 ? TAG_REAR : TAG_FRONT;
            world_->add_circle(wheels_[i], { 0, 0 }, spec.wheel_r, wsd);

            WheelJointDef jd;
            jd.a = chassis_;
            jd.b = wheels_[i];
            jd.anchor_a = { wx, spec.wheel_y };
            jd.anchor_b = { 0, 0 };
            jd.axis_a = { 0, 1 };
            jd.spring = true;
            jd.hertz = spec.suspension_hz;
            jd.damping_ratio = spec.suspension_damping;
            jd.limit = true;
            jd.lower = -0.22f;
            jd.upper = 0.12f;
            jd.motor = (i == 0 ? spec.rear_drive : spec.front_drive);
            jd.max_motor_torque = spec.max_torque;
            jd.motor_speed = 0;
            joints_[i] = world_->add_wheel_joint(jd);
        }
    }

    void drive(const DriveInput& in) override {
        const float throttle = std::max(-1.0f, std::min(1.0f, in.throttle));
        const float lean = std::max(-1.0f, std::min(1.0f, in.lean));
        const float boost = std::max(0.0f, std::min(1.0f, in.boost));
        const bool motor_on = in.motor_on;
        for (int i = 0; i < 2; i++) {
            const bool driven = i == 0 ? spec_.rear_drive : spec_.front_drive;
            world_->enable_motor(joints_[i], driven && motor_on && throttle != 0);
            // positive joint speed turns the wheel anticlockwise, which rolls it to the left
            world_->set_motor_speed(joints_[i], -throttle * spec_.max_speed * (1 + 0.5f * boost));
            world_->set_max_motor_torque(joints_[i], spec_.max_torque * std::fabs(throttle) * (1 + boost));
        }
        if (boost > 0) {
            // Turbo pushes along the chassis, so in the air it goes where the nose points
            const Rot rot = world_->rotation(chassis_);
            const float f = boost * spec_.boost_force * spec_.mass;
            world_->apply_force(chassis_, { rot.c * f, rot.s * f });
        }
        // leaning: anticlockwise is nose up. In the air it's the main control. On the ground leaning back pulls a
        // wheelie: a little balance assist steers the nose toward about 40 degrees (more with more lean) and holds
        // it there instead of going over. Leaning forward dips the nose (and stops once the rear wheel lifts: a
        // stoppie, never an endo).
        if (lean != 0) {
            if (airborne()) world_->apply_torque(chassis_, lean * spec_.air_torque * 2.2f);
            else if (lean > 0) {
                const float cap = spec_.max_torque + spec_.air_torque * 1.5f + spec_.mass * 4.0f;   // heavy vehicles need more to lift the front
                const float angle = world_->angle(chassis_), omega = world_->angular_velocity(chassis_);
                const float torque = std::max(-cap, std::min(cap, (0.7f * lean - angle) * cap * 6.0f - omega * cap * 0.6f));
                world_->apply_torque(chassis_, torque);
            } else if (touching_[0] > 0) world_->apply_torque(chassis_, lean * spec_.air_torque * 1.2f);
        }
        if (throttle == 0) return;
        if (airborne()) {
            // gas / brake pitch the vehicle a little in the air too
            world_->apply_torque(chassis_, -throttle * spec_.air_torque);
        } else if (motor_on) {
            // on the ground the motor's reaction torque would stand the vehicle on its tail; suspension geometry
            // cancels most of it (anti-squat), leaving a bit of pitch for feel
            const int driven = (spec_.rear_drive ? 1 : 0) + (spec_.front_drive ? 1 : 0);
            world_->apply_torque(chassis_, -throttle * spec_.max_torque * driven * spec_.wheelie_resistance);
        }
    }

    void step(float dt) override {
        chassis_hit_ = false;
        impact_ = 0;
        float vy_before[2];
        for (int i = 0; i < 2; i++) vy_before[i] = world_->linear_velocity(wheels_[i]).y;
        world_->step(dt, 4);
        for (const ContactEvent& e : world_->contacts()) touch(e.tag_a, e.tag_b, e.begin ? +1 : -1, vy_before);
    }

    Pose pose() const override {
        Pose p;
        const V2 c = world_->position(chassis_);
        const V2 v = world_->linear_velocity(chassis_);
        p.x = c.x; p.y = c.y; p.angle = world_->angle(chassis_);
        p.vx = v.x; p.vy = v.y; p.omega = world_->angular_velocity(chassis_);
        for (int i = 0; i < 2; i++) {
            const V2 w = world_->position(wheels_[i]);
            p.wheel_x[i] = w.x; p.wheel_y[i] = w.y;
            p.wheel_angle[i] = world_->angle(wheels_[i]);
        }
        return p;
    }

    bool wheel_grounded(int wheel) const override { return touching_[wheel] > 0; }
    bool chassis_hit() const override { return chassis_hit_; }
    float landing_impact() const override { return impact_; }

private:
    bool airborne() const { return touching_[0] <= 0 && touching_[1] <= 0; }

    void touch(uint32_t ta, uint32_t tb, int delta, const float* vy_before) {
        if (ta != TAG_GROUND && tb != TAG_GROUND) return;
        const uint32_t other = ta == TAG_GROUND ? tb : ta;
        if (other == TAG_CHASSIS) { if (delta > 0) chassis_hit_ = true; return; }
        const int wheel = other == TAG_REAR ? 0 : other == TAG_FRONT ? 1 : -1;
        if (wheel < 0) return;
        touching_[wheel] = std::max(0, touching_[wheel] + delta);
        if (delta > 0) impact_ = std::max(impact_, std::max(0.0f, -vy_before[wheel]));
    }

    std::unique_ptr<World2D> world_;
    Body chassis_;
    Body wheels_[2];
    Joint joints_[2];
    VehicleSpec spec_;
    int touching_[2] = { 0, 0 };
    bool chassis_hit_ = false;
    float impact_ = 0;
};

} // namespace

std::unique_ptr<World> World::create(float gravity) { return std::make_unique<Vehicle>(World2D::create(gravity)); }
std::unique_ptr<World> World::on(std::unique_ptr<xl::phys2d::World2D> physics) { return std::make_unique<Vehicle>(std::move(physics)); }

} // namespace tt
