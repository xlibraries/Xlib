/**
 * @file backend_jolt.cpp
 * @brief xl_physics.h on Jolt Physics v5.6.0 (third_party/jolt, compiled once as a library): single-threaded and
 * cross-platform deterministic. World::create() returns this world.
 */
#include "xl_physics.h"

#include <Jolt/Jolt.h>
#include <Jolt/RegisterTypes.h>
#include <Jolt/Core/Factory.h>
#include <Jolt/Core/JobSystemSingleThreaded.h>
#include <Jolt/Core/TempAllocator.h>
#include <Jolt/Physics/Body/BodyCreationSettings.h>
#include <Jolt/Physics/Body/BodyInterface.h>
#include <Jolt/Physics/Collision/BroadPhase/BroadPhaseLayer.h>
#include <Jolt/Physics/Collision/CastResult.h>
#include <Jolt/Physics/Collision/ObjectLayer.h>
#include <Jolt/Physics/Collision/RayCast.h>
#include <Jolt/Physics/Collision/Shape/BoxShape.h>
#include <Jolt/Physics/Collision/Shape/CapsuleShape.h>
#include <Jolt/Physics/Collision/Shape/CylinderShape.h>
#include <Jolt/Physics/Collision/Shape/HeightFieldShape.h>
#include <Jolt/Physics/Collision/Shape/MeshShape.h>
#include <Jolt/Physics/Collision/Shape/SphereShape.h>
#include <Jolt/Physics/Constraints/FixedConstraint.h>
#include <Jolt/Physics/Constraints/HingeConstraint.h>
#include <Jolt/Physics/Constraints/SliderConstraint.h>
#include <Jolt/Physics/PhysicsSettings.h>
#include <Jolt/Physics/PhysicsSystem.h>

#include <algorithm>
#include <cmath>
#include <map>
#include <mutex>
#include <unordered_map>

namespace xl::phys {

namespace {

// Two object layers (static / moving) over two broad-phase layers; moving things collide with everything.
namespace Layers { constexpr JPH::ObjectLayer NON_MOVING = 0, MOVING = 1, COUNT = 2; }
namespace BP { constexpr JPH::BroadPhaseLayer NON_MOVING(0), MOVING(1); constexpr JPH::uint COUNT = 2; }

class BroadPhaseLayers final : public JPH::BroadPhaseLayerInterface {
public:
    JPH::uint GetNumBroadPhaseLayers() const override { return BP::COUNT; }
    JPH::BroadPhaseLayer GetBroadPhaseLayer(JPH::ObjectLayer layer) const override { return layer == Layers::NON_MOVING ? BP::NON_MOVING : BP::MOVING; }
#if defined(JPH_EXTERNAL_PROFILE) || defined(JPH_PROFILE_ENABLED)
    const char* GetBroadPhaseLayerName(JPH::BroadPhaseLayer layer) const override { return layer == BP::NON_MOVING ? "NON_MOVING" : "MOVING"; }
#endif
};

class ObjectVsBroadPhase final : public JPH::ObjectVsBroadPhaseLayerFilter {
public:
    bool ShouldCollide(JPH::ObjectLayer layer, JPH::BroadPhaseLayer bp) const override { return layer == Layers::MOVING || bp == BP::MOVING; }
};

class ObjectPairs final : public JPH::ObjectLayerPairFilter {
public:
    bool ShouldCollide(JPH::ObjectLayer a, JPH::ObjectLayer b) const override { return a == Layers::MOVING || b == Layers::MOVING; }
};

/** Which bodies are touching. Pairs enter on contact and leave when it ends; Jolt also reports a removal when an
 *  island falls asleep, so a pair whose bodies are all at rest is kept ("kept") until one of them moves again.
 *  Sub-shape contacts are counted so a pair leaves only when the last one ends. Removals are applied after the
 *  step, when the bodies' activity is known. */
class Contacts final : public JPH::ContactListener {
public:
    struct Entry { int count = 0; bool kept = false; };
    std::map<std::pair<uint32_t, uint32_t>, Entry> pairs;
    std::vector<std::pair<uint32_t, uint32_t>> removed;   // during the step

    /** Bodies whose surfaces move (conveyor belts): body id → surface velocity */
    std::map<uint32_t, JPH::Vec3> surfaces;

    void OnContactAdded(const JPH::Body& a, const JPH::Body& b, const JPH::ContactManifold&, JPH::ContactSettings& settings) override {
        Entry& e = pairs[key(a.GetID(), b.GetID())];
        if (e.kept) { e.kept = false; e.count = 0; }
        e.count++;
        surface(a, b, settings);
    }
    void OnContactPersisted(const JPH::Body& a, const JPH::Body& b, const JPH::ContactManifold&, JPH::ContactSettings& settings) override { surface(a, b, settings); }

    /** Jolt wants the relative surface velocity: body 2's surface velocity minus body 1's. */
    void surface(const JPH::Body& a, const JPH::Body& b, JPH::ContactSettings& settings) const {
        if (surfaces.empty()) return;
        JPH::Vec3 v = JPH::Vec3::sZero();
        if (auto it = surfaces.find(b.GetID().GetIndexAndSequenceNumber()); it != surfaces.end()) v += it->second;
        if (auto it = surfaces.find(a.GetID().GetIndexAndSequenceNumber()); it != surfaces.end()) v -= it->second;
        settings.mRelativeLinearSurfaceVelocity = v;
    }
    void OnContactRemoved(const JPH::SubShapeIDPair& pair) override { removed.push_back(key(pair.GetBody1ID(), pair.GetBody2ID())); }

    /** Applies the step's removals: a pair ends unless every body in it is now at rest (then the island slept). */
    void settle(const JPH::BodyInterface& bodies) {
        for (const auto& k : removed) {
            auto it = pairs.find(k);
            if (it == pairs.end() || it->second.kept) continue;
            if (--it->second.count > 0) continue;
            const bool resting = !bodies.IsActive(JPH::BodyID(k.first)) && !bodies.IsActive(JPH::BodyID(k.second));
            if (resting) it->second.kept = true; else pairs.erase(it);
        }
        removed.clear();
    }
    bool touching(uint32_t a, uint32_t b) const { return pairs.count({ std::min(a, b), std::max(a, b) }) > 0; }
    /** Forgets a body that's being destroyed (Jolt doesn't send removals for it). */
    void forget(uint32_t id) { for (auto it = pairs.begin(); it != pairs.end();) it = it->first.first == id || it->first.second == id ? pairs.erase(it) : std::next(it); }
private:
    static std::pair<uint32_t, uint32_t> key(JPH::BodyID a, JPH::BodyID b) {
        const uint32_t x = a.GetIndexAndSequenceNumber(), y = b.GetIndexAndSequenceNumber();
        return { std::min(x, y), std::max(x, y) };
    }
};

void init_jolt() {
    static std::once_flag once;
    std::call_once(once, [] {
        JPH::RegisterDefaultAllocator();
        JPH::Factory::sInstance = new JPH::Factory();
        JPH::RegisterTypes();
    });
}

JPH::Vec3 jv(V3 v) { return JPH::Vec3(v.x, v.y, v.z); }
JPH::RVec3 jr(V3 v) { return JPH::RVec3(v.x, v.y, v.z); }
JPH::Quat jq(Quat q) { return JPH::Quat(q.x, q.y, q.z, q.w); }
V3 xv(JPH::Vec3Arg v) { return { v.GetX(), v.GetY(), v.GetZ() }; }
V3 xr(JPH::RVec3Arg v) { return { static_cast<float>(v.GetX()), static_cast<float>(v.GetY()), static_cast<float>(v.GetZ()) }; }
Quat xq(JPH::QuatArg q) { return { q.GetX(), q.GetY(), q.GetZ(), q.GetW() }; }
JPH::EMotionType motion_of(Motion m) { return m == Motion::Static ? JPH::EMotionType::Static : m == Motion::Kinematic ? JPH::EMotionType::Kinematic : JPH::EMotionType::Dynamic; }

class JoltWorld final : public World {
public:
    explicit JoltWorld(float gravity) : temp_(16 * 1024 * 1024), jobs_(JPH::cMaxPhysicsJobs) {
        init_jolt();
        system_.Init(2048, 0, 4096, 2048, bp_layers_, obj_vs_bp_, obj_pairs_);
        system_.SetGravity(JPH::Vec3(0, -gravity, 0));
        system_.SetContactListener(&contacts_);
    }
    ~JoltWorld() override {
        JPH::BodyInterface& bi = system_.GetBodyInterface();
        for (auto& [id, body] : bodies_) { bi.RemoveBody(body->GetID()); bi.DestroyBody(body->GetID()); }
    }

    Body add_box(Motion motion, V3 position, Quat rotation, V3 half, float mass, Material material) override {
        return add(new JPH::BoxShape(jv(half), std::min({ 0.05f, half.x, half.y, half.z }) * 0.9f), motion, position, rotation, mass, material);
    }
    Body add_sphere(Motion motion, V3 position, float radius, float mass, Material material) override {
        return add(new JPH::SphereShape(radius), motion, position, {}, mass, material);
    }
    Body add_capsule(Motion motion, V3 position, Quat rotation, float half_height, float radius, float mass, Material material) override {
        return add(new JPH::CapsuleShape(half_height, radius), motion, position, rotation, mass, material);
    }
    Body add_cylinder(Motion motion, V3 position, Quat rotation, float half_height, float radius, float mass, Material material) override {
        return add(new JPH::CylinderShape(half_height, radius, std::min(0.05f, radius * 0.2f)), motion, position, rotation, mass, material);
    }
    Body add_mesh(const std::vector<float>& positions, const std::vector<uint32_t>& indices, Material material) override {
        JPH::VertexList vertices;
        for (size_t i = 0; i + 2 < positions.size(); i += 3) vertices.push_back(JPH::Float3(positions[i], positions[i + 1], positions[i + 2]));
        JPH::IndexedTriangleList triangles;
        for (size_t i = 0; i + 2 < indices.size(); i += 3) triangles.push_back(JPH::IndexedTriangle(indices[i], indices[i + 1], indices[i + 2]));
        JPH::MeshShapeSettings settings(vertices, triangles);
        const JPH::ShapeSettings::ShapeResult result = settings.Create();
        if (result.HasError()) return {};
        return add(result.Get(), Motion::Static, {}, {}, 0, material);
    }
    Body add_height_field(const std::vector<float>& heights, int n, V3 origin, float spacing, Material material) override {
        if (n < 2 || n % 2 != 0 || heights.size() < static_cast<size_t>(n) * n) return {};
        JPH::HeightFieldShapeSettings settings(heights.data(), jv(origin), JPH::Vec3(spacing, 1, spacing), static_cast<JPH::uint>(n));
        const JPH::ShapeSettings::ShapeResult result = settings.Create();
        if (result.HasError()) return {};
        return add(result.Get(), Motion::Static, {}, {}, 0, material);
    }
    void remove(Body body) override {
        JPH::Body* b = find(body);
        if (!b) return;
        JPH::BodyInterface& bi = system_.GetBodyInterface();
        bi.RemoveBody(b->GetID());
        bi.DestroyBody(b->GetID());
        contacts_.forget(body.id);
        bodies_.erase(body.id);
    }

    Pose pose(Body body) const override {
        const JPH::Body* b = find(body);
        if (!b) return {};
        return { xr(b->GetPosition()), xq(b->GetRotation()) };
    }
    Velocity velocity(Body body) const override {
        const JPH::Body* b = find(body);
        if (!b) return {};
        return { xv(b->GetLinearVelocity()), xv(b->GetAngularVelocity()) };
    }
    void set_velocity(Body body, V3 linear, V3 angular) override {
        if (const JPH::Body* b = find(body)) system_.GetBodyInterface().SetLinearAndAngularVelocity(b->GetID(), jv(linear), jv(angular));
    }
    void move_kinematic(Body body, V3 position, Quat rotation, float dt) override {
        if (const JPH::Body* b = find(body)) system_.GetBodyInterface().MoveKinematic(b->GetID(), jr(position), jq(rotation), dt);
    }
    void apply_force(Body body, V3 force) override { if (const JPH::Body* b = find(body)) system_.GetBodyInterface().AddForce(b->GetID(), jv(force)); }
    void apply_torque(Body body, V3 torque) override { if (const JPH::Body* b = find(body)) system_.GetBodyInterface().AddTorque(b->GetID(), jv(torque)); }
    void apply_impulse(Body body, V3 impulse) override { if (const JPH::Body* b = find(body)) system_.GetBodyInterface().AddImpulse(b->GetID(), jv(impulse)); }
    bool active(Body body) const override { const JPH::Body* b = find(body); return b && b->IsActive(); }

    Joint add_hinge(Body a, Body b, const Hinge& h) override {
        JPH::HingeConstraintSettings s;
        s.mSpace = JPH::EConstraintSpace::WorldSpace;
        s.mPoint1 = s.mPoint2 = jr(h.pivot);
        const JPH::Vec3 axis = jv(h.axis).Normalized();
        s.mHingeAxis1 = s.mHingeAxis2 = axis;
        s.mNormalAxis1 = s.mNormalAxis2 = axis.GetNormalizedPerpendicular();
        if (h.limited) { s.mLimitsMin = h.min_angle; s.mLimitsMax = h.max_angle; }
        return add_constraint(s, a, b);
    }    void set_surface_velocity(Body body, V3 velocity) override {
        if (velocity.x == 0 && velocity.y == 0 && velocity.z == 0) contacts_.surfaces.erase(body.id);
        else contacts_.surfaces[body.id] = jv(velocity);
    }
    void wake(Body body) override {
        auto it = bodies_.find(body.id);
        if (it != bodies_.end()) system_.GetBodyInterface().ActivateBody(it->second->GetID());
    }

    Joint add_slider(Body a, Body b, const Slider& sl) override {
        JPH::SliderConstraintSettings s;
        s.mSpace = JPH::EConstraintSpace::WorldSpace;
        s.mPoint1 = s.mPoint2 = jr(sl.point);
        s.SetSliderAxis(jv(sl.axis).Normalized());
        if (sl.limited) { s.mLimitsMin = sl.min_distance; s.mLimitsMax = sl.max_distance; }
        return add_constraint(s, a, b);
    }
    Joint add_fixed(Body a, Body b) override {
        JPH::FixedConstraintSettings s;
        s.mAutoDetectPoint = true;
        return add_constraint(s, a, b);
    }
    void remove(Joint joint) override {
        auto it = joints_.find(joint.id);
        if (it == joints_.end()) return;
        system_.RemoveConstraint(it->second);
        joints_.erase(it);
    }
    void motor_velocity(Joint joint, float velocity, float limit) override {
        JPH::Constraint* c = find(joint);
        if (!c) return;
        if (auto* h = dynamic_cast_hinge(c)) {
            h->GetMotorSettings().SetTorqueLimit(limit);
            h->SetMotorState(limit > 0 ? JPH::EMotorState::Velocity : JPH::EMotorState::Off);
            h->SetTargetAngularVelocity(velocity);
        } else if (auto* s = dynamic_cast_slider(c)) {
            s->GetMotorSettings().SetForceLimit(limit);
            s->SetMotorState(limit > 0 ? JPH::EMotorState::Velocity : JPH::EMotorState::Off);
            s->SetTargetVelocity(velocity);
        }
    }
    void motor_position(Joint joint, float target, float limit, float frequency, float damping) override {
        JPH::Constraint* c = find(joint);
        if (!c) return;
        if (auto* h = dynamic_cast_hinge(c)) {
            JPH::MotorSettings& m = h->GetMotorSettings();
            m.mSpringSettings.mFrequency = frequency; m.mSpringSettings.mDamping = damping;
            m.SetTorqueLimit(limit);
            h->SetMotorState(limit > 0 ? JPH::EMotorState::Position : JPH::EMotorState::Off);
            h->SetTargetAngle(target);
        } else if (auto* s = dynamic_cast_slider(c)) {
            JPH::MotorSettings& m = s->GetMotorSettings();
            m.mSpringSettings.mFrequency = frequency; m.mSpringSettings.mDamping = damping;
            m.SetForceLimit(limit);
            s->SetMotorState(limit > 0 ? JPH::EMotorState::Position : JPH::EMotorState::Off);
            s->SetTargetPosition(target);
        }
    }
    float joint_position(Joint joint) const override {
        const JPH::Constraint* c = find(joint);
        if (!c) return 0;
        if (c->GetSubType() == JPH::EConstraintSubType::Hinge) return static_cast<const JPH::HingeConstraint*>(c)->GetCurrentAngle();
        if (c->GetSubType() == JPH::EConstraintSubType::Slider) return static_cast<const JPH::SliderConstraint*>(c)->GetCurrentPosition();
        return 0;
    }

    void step(float dt, int substeps) override {
        system_.Update(dt, std::max(1, substeps), &temp_, &jobs_);
        contacts_.settle(system_.GetBodyInterface());
    }
    bool raycast(V3 origin, V3 direction, float max_distance, RayHit& hit) const override {
        const JPH::Vec3 dir = jv(direction).Normalized() * max_distance;
        const JPH::RRayCast ray{ jr(origin), dir };
        JPH::RayCastResult result;
        if (!system_.GetNarrowPhaseQuery().CastRay(ray, result)) return false;
        const JPH::RVec3 point = ray.GetPointOnRay(result.mFraction);
        hit.body = { result.mBodyID.GetIndexAndSequenceNumber() };
        hit.point = xr(point);
        hit.distance = result.mFraction * max_distance;
        hit.normal = { 0, 1, 0 };
        JPH::BodyLockRead lock(system_.GetBodyLockInterface(), result.mBodyID);
        if (lock.Succeeded()) hit.normal = xv(lock.GetBody().GetWorldSpaceSurfaceNormal(result.mSubShapeID2, point));
        return true;
    }
    std::vector<Body> contacts(Body body) const override {
        std::vector<Body> out;
        for (const auto& [pair, entry] : contacts_.pairs) {
            if (pair.first == body.id) out.push_back({ pair.second });
            else if (pair.second == body.id) out.push_back({ pair.first });
        }
        return out;
    }
    bool touching(Body a, Body b) const override { return contacts_.touching(a.id, b.id); }
    int body_count() const override { return static_cast<int>(bodies_.size()); }

    void set_tolerances(float penetration_slop, float speculative_distance) override {
        JPH::PhysicsSettings settings = system_.GetPhysicsSettings();
        settings.mPenetrationSlop = std::max(0.0f, penetration_slop);
        settings.mSpeculativeContactDistance = std::max(0.0f, speculative_distance);
        system_.SetPhysicsSettings(settings);
    }

private:
    Body add(const JPH::Shape* shape, Motion motion, V3 position, Quat rotation, float mass, Material material) {
        JPH::BodyCreationSettings settings(shape, jr(position), jq(rotation), motion_of(motion), motion == Motion::Static ? Layers::NON_MOVING : Layers::MOVING);
        settings.mFriction = material.friction;
        settings.mRestitution = material.restitution;
        if (motion == Motion::Dynamic && mass > 0) {
            settings.mOverrideMassProperties = JPH::EOverrideMassProperties::CalculateInertia;
            settings.mMassPropertiesOverride.mMass = mass;
        }
        JPH::Body* body = system_.GetBodyInterface().CreateBody(settings);
        if (!body) return {};
        system_.GetBodyInterface().AddBody(body->GetID(), JPH::EActivation::Activate);
        const uint32_t id = body->GetID().GetIndexAndSequenceNumber();
        bodies_[id] = body;
        return { id };
    }
    Joint add_constraint(JPH::TwoBodyConstraintSettings& s, Body a, Body b) {
        JPH::Body* ba = find(a);
        JPH::Body* bb = find(b);
        if (!ba && !bb) return {};
        JPH::Constraint* c = s.Create(ba ? *ba : JPH::Body::sFixedToWorld, bb ? *bb : JPH::Body::sFixedToWorld);
        system_.AddConstraint(c);
        joints_[++next_joint_] = c;
        return { next_joint_ };
    }
    JPH::Body* find(Body body) const { auto it = bodies_.find(body.id); return it == bodies_.end() ? nullptr : it->second; }
    JPH::Constraint* find(Joint joint) const { auto it = joints_.find(joint.id); return it == joints_.end() ? nullptr : it->second; }
    static JPH::HingeConstraint* dynamic_cast_hinge(JPH::Constraint* c) { return c->GetSubType() == JPH::EConstraintSubType::Hinge ? static_cast<JPH::HingeConstraint*>(c) : nullptr; }
    static JPH::SliderConstraint* dynamic_cast_slider(JPH::Constraint* c) { return c->GetSubType() == JPH::EConstraintSubType::Slider ? static_cast<JPH::SliderConstraint*>(c) : nullptr; }

    JPH::TempAllocatorImpl temp_;
    JPH::JobSystemSingleThreaded jobs_;
    BroadPhaseLayers bp_layers_;
    ObjectVsBroadPhase obj_vs_bp_;
    ObjectPairs obj_pairs_;
    Contacts contacts_;
    JPH::PhysicsSystem system_;
    std::unordered_map<uint32_t, JPH::Body*> bodies_;
    std::unordered_map<uint32_t, JPH::Constraint*> joints_;
    uint32_t next_joint_ = 0;
};

} // namespace

std::unique_ptr<World> World::create(float gravity) { return std::make_unique<JoltWorld>(gravity); }

Quat axis_angle(V3 axis, float angle) {
    const float len = std::sqrt(axis.x * axis.x + axis.y * axis.y + axis.z * axis.z);
    if (len < 1e-8f) return {};
    const float s = std::sin(angle / 2) / len;
    return { axis.x * s, axis.y * s, axis.z * s, std::cos(angle / 2) };
}

V3 rotate(Quat q, V3 v) { return xv(jq(q) * jv(v)); }

Quat euler(float yaw, float pitch, float roll) {
    return xq(JPH::Quat::sRotation(JPH::Vec3::sAxisY(), yaw) * JPH::Quat::sRotation(JPH::Vec3::sAxisZ(), pitch) * JPH::Quat::sRotation(JPH::Vec3::sAxisX(), roll));
}

} // namespace xl::phys
