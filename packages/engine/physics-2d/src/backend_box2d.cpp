/**
 * @file backend_box2d.cpp
 * @brief xl_physics2d.h on Box2D v3.1.1 (third_party/box2d, compiled once as a library).
 *
 * Each contract call is one Box2D call with Box2D's own defaults for anything the contract doesn't set, so code moved
 * onto this contract from Box2D directly behaves bit for bit the same. Shape tags travel as Box2D user data.
 */
#include "xl_physics2d.h"

#include "box2d/box2d.h"

#include <cstdint>
#include <vector>

namespace xl::phys2d {
namespace {

b2Vec2 to_b2(V2 v) { return { v.x, v.y }; }
V2 from_b2(b2Vec2 v) { return { v.x, v.y }; }
void* tag_data(uint32_t tag) { return reinterpret_cast<void*>(static_cast<uintptr_t>(tag)); }
uint32_t tag_of(b2ShapeId shape) { return static_cast<uint32_t>(reinterpret_cast<uintptr_t>(b2Shape_GetUserData(shape))); }

/** A Box2D shape definition from the contract's. */
b2ShapeDef shape_def(const ShapeDef& def) {
    b2ShapeDef sd = b2DefaultShapeDef();
    sd.density = def.density;
    sd.material.friction = def.material.friction;
    sd.material.restitution = def.material.restitution;
    sd.material.rollingResistance = def.material.rolling_resistance;
    sd.enableContactEvents = def.contact_events;
    sd.userData = tag_data(def.tag);
    return sd;
}

/** The contract's world on a Box2D world. */
class Box2DWorld final : public World2D {
public:
    explicit Box2DWorld(float gravity) {
        b2WorldDef wd = b2DefaultWorldDef();
        wd.gravity = { 0.0f, -gravity };
        world_ = b2CreateWorld(&wd);
    }
    ~Box2DWorld() override { b2DestroyWorld(world_); }

    Body add_body(const BodyDef& def) override {
        b2BodyDef bd = b2DefaultBodyDef();
        bd.type = def.motion == Motion::Dynamic ? b2_dynamicBody : def.motion == Motion::Kinematic ? b2_kinematicBody : b2_staticBody;
        bd.position = to_b2(def.position);
        if (def.angle != 0) bd.rotation = b2MakeRot(def.angle);
        bd.linearDamping = def.linear_damping;
        bd.angularDamping = def.angular_damping;
        bodies_.push_back(b2CreateBody(world_, &bd));
        return { static_cast<uint32_t>(bodies_.size()) };
    }

    void add_box(Body body, float half_w, float half_h, const ShapeDef& def) override {
        const b2ShapeDef sd = shape_def(def);
        const b2Polygon box = b2MakeBox(half_w, half_h);
        b2CreatePolygonShape(id(body), &sd, &box);
    }

    void add_circle(Body body, V2 center, float radius, const ShapeDef& def) override {
        const b2ShapeDef sd = shape_def(def);
        const b2Circle circle = { to_b2(center), radius };
        b2CreateCircleShape(id(body), &sd, &circle);
    }

    void add_chain(Body body, const std::vector<V2>& points, const ShapeDef& def) override {
        std::vector<b2Vec2> pts;
        pts.reserve(points.size());
        for (const V2& p : points) pts.push_back(to_b2(p));
        b2SurfaceMaterial material = {};
        material.friction = def.material.friction;
        material.restitution = def.material.restitution;
        material.rollingResistance = def.material.rolling_resistance;
        b2ChainDef cd = b2DefaultChainDef();
        cd.points = pts.data();
        cd.count = static_cast<int>(pts.size());
        cd.materials = &material;
        cd.materialCount = 1;
        cd.isLoop = false;
        cd.userData = tag_data(def.tag);
        b2CreateChain(id(body), &cd);
    }

    Joint add_wheel_joint(const WheelJointDef& def) override {
        b2WheelJointDef jd = b2DefaultWheelJointDef();
        jd.bodyIdA = id(def.a);
        jd.bodyIdB = id(def.b);
        jd.localAnchorA = to_b2(def.anchor_a);
        jd.localAnchorB = to_b2(def.anchor_b);
        jd.localAxisA = to_b2(def.axis_a);
        jd.enableSpring = def.spring;
        jd.hertz = def.hertz;
        jd.dampingRatio = def.damping_ratio;
        jd.enableLimit = def.limit;
        jd.lowerTranslation = def.lower;
        jd.upperTranslation = def.upper;
        jd.enableMotor = def.motor;
        jd.maxMotorTorque = def.max_motor_torque;
        jd.motorSpeed = def.motor_speed;
        joints_.push_back(b2CreateWheelJoint(world_, &jd));
        return { static_cast<uint32_t>(joints_.size()) };
    }

    void enable_motor(Joint joint, bool on) override { b2WheelJoint_EnableMotor(id(joint), on); }
    void set_motor_speed(Joint joint, float speed) override { b2WheelJoint_SetMotorSpeed(id(joint), speed); }
    void set_max_motor_torque(Joint joint, float torque) override { b2WheelJoint_SetMaxMotorTorque(id(joint), torque); }
    void apply_force(Body body, V2 force) override { b2Body_ApplyForceToCenter(id(body), to_b2(force), true); }
    void apply_torque(Body body, float torque) override { b2Body_ApplyTorque(id(body), torque, true); }

    void step(float dt, int substeps) override {
        b2World_Step(world_, dt, substeps);
        contacts_.clear();
        const b2ContactEvents ev = b2World_GetContactEvents(world_);
        for (int i = 0; i < ev.beginCount; i++) contacts_.push_back({ tag_of(ev.beginEvents[i].shapeIdA), tag_of(ev.beginEvents[i].shapeIdB), true });
        for (int i = 0; i < ev.endCount; i++) contacts_.push_back({ tag_of(ev.endEvents[i].shapeIdA), tag_of(ev.endEvents[i].shapeIdB), false });
    }

    V2 position(Body body) const override { return from_b2(b2Body_GetPosition(id(body))); }
    Rot rotation(Body body) const override { const b2Rot r = b2Body_GetRotation(id(body)); return { r.c, r.s }; }
    float angle(Body body) const override { return b2Rot_GetAngle(b2Body_GetRotation(id(body))); }
    V2 linear_velocity(Body body) const override { return from_b2(b2Body_GetLinearVelocity(id(body))); }
    float angular_velocity(Body body) const override { return b2Body_GetAngularVelocity(id(body)); }
    const std::vector<ContactEvent>& contacts() const override { return contacts_; }

private:
    b2BodyId id(Body body) const { return bodies_.at(body.id - 1); }
    b2JointId id(Joint joint) const { return joints_.at(joint.id - 1); }

    b2WorldId world_ = {};
    std::vector<b2BodyId> bodies_;
    std::vector<b2JointId> joints_;
    std::vector<ContactEvent> contacts_;
};

} // namespace

std::unique_ptr<World2D> World2D::create(float gravity) { return std::make_unique<Box2DWorld>(gravity); }

} // namespace xl::phys2d
