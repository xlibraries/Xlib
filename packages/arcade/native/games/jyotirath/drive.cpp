#include "drive.h"
#include "mesh.h"

#include <algorithm>
#include <cmath>

namespace jr {

namespace {

constexpr float PI = 3.14159265358979f;
constexpr float GRAVITY = 18;

float clampf(float v, float lo, float hi) { return std::max(lo, std::min(hi, v)); }
float wrap_angle(float a) { while (a > PI) a -= 2 * PI; while (a < -PI) a += 2 * PI; return a; }

/** Pushes the car out of a circle; returns the speed it hit with (0 if it didn't). */
float collide_circle(Car& c, float x, float z, float r) {
    const float dx = c.x - x, dz = c.z - z, d = std::sqrt(dx * dx + dz * dz), overlap = r + CAR_RADIUS - d;
    if (overlap <= 0 || d < 1e-5f) return 0;
    const float nx = dx / d, nz = dz / d;
    c.x += nx * overlap; c.z += nz * overlap;
    const float vn = c.vx * nx + c.vz * nz;
    if (vn >= 0) return 0;
    c.vx -= nx * vn * 1.35f; c.vz -= nz * vn * 1.35f;
    return -vn;
}

/** The same for an oriented box. */
float collide_box(Car& c, const Box& b) {
    const float cs = std::cos(b.yaw), sn = std::sin(b.yaw);
    // into the box's frame: a yaw of θ maps local +X to (cos θ, -sin θ) in (x, z)
    const float dx = c.x - b.x, dz = c.z - b.z;
    const float lx = dx * cs - dz * sn, lz = dx * sn + dz * cs;
    const float px = clampf(lx, -b.hx, b.hx), pz = clampf(lz, -b.hz, b.hz);
    float nx = lx - px, nz = lz - pz, d = std::sqrt(nx * nx + nz * nz), overlap;
    if (d < 1e-5f) {   // the centre is inside: out through the nearest side
        const float ex = b.hx - std::fabs(lx), ez = b.hz - std::fabs(lz);
        if (ex < ez) { nx = lx < 0 ? -1.0f : 1.0f; nz = 0; overlap = ex + CAR_RADIUS; }
        else { nx = 0; nz = lz < 0 ? -1.0f : 1.0f; overlap = ez + CAR_RADIUS; }
    } else {
        overlap = CAR_RADIUS - d;
        if (overlap <= 0) return 0;
        nx /= d; nz /= d;
    }
    const float wx = nx * cs + nz * sn, wz = -nx * sn + nz * cs;
    c.x += wx * overlap; c.z += wz * overlap;
    const float vn = c.vx * wx + c.vz * wz;
    if (vn >= 0) return 0;
    c.vx -= wx * vn * 1.35f; c.vz -= wz * vn * 1.35f;
    return -vn;
}

} // namespace

float Car::forward_speed() const { return vx * std::cos(yaw) + vz * std::sin(yaw); }

void Game::place(float s) {
    const Sample p = track->at(s);
    car = Car{};
    car.x = p.x; car.z = p.z;
    car.yaw = std::atan2(p.tz, p.tx);
    run.s = s;
    car.y = track->height(car.x, car.z, s);
    tumbleweeds.clear();
}

void Game::start(const RunSpec& spec, std::vector<Tool> bag) {
    run = Run{};
    run.spec = spec;
    run.bag = std::move(bag);
    run.cargo = spec.cargo;
    run.picked.assign(track->pickups.size(), false);
    clock = 0;
    last_pothole = bag_full_nag = -1;
    place(spec.from);
    run.chaser = spec.goal == Goal::Chase ? spec.from - CHASE_GAP : spec.goal == Goal::Storm ? spec.from - STORM_GAP : 0;
    if (spec.landing) { car.y += 16; run.state = RunState::Landing; }
}

void Game::step(const Input& raw, float dt) {
    run.events = 0;
    run.bonk = 0;
    clock += dt;
    const Track& t = *track;
    if (run.state == RunState::Failed || run.state == RunState::Done) return;

    // tumbleweeds blow across the desert road ahead of you
    for (Tumbleweed& w : tumbleweeds) { w.x += w.vx * dt; w.z += w.vz * dt; w.spin += dt * 5; w.life += dt; }
    tumbleweeds.erase(std::remove_if(tumbleweeds.begin(), tumbleweeds.end(), [](const Tumbleweed& w) { return w.life > 7; }), tumbleweeds.end());
    for (size_t k = 0; k < t.tumbleweed_lanes.size(); k++) {
        const float lane = t.tumbleweed_lanes[k];
        if (run.s < lane - 45 || run.s > lane + 2) continue;
        const float period = 2.6f;
        if (std::floor(clock / period) != std::floor((clock - dt) / period)) {
            const Sample p = t.at(lane);
            const float side = hash01(static_cast<uint32_t>(clock / period) * 31 + static_cast<uint32_t>(k)) < 0.5f ? -1.0f : 1.0f;
            const float off = side * (t.road_half(lane) + 7), speed = 3.2f + 1.5f * hash01(static_cast<uint32_t>(clock * 10));
            tumbleweeds.push_back({ p.x - p.tz * off, p.z + p.tx * off, p.tz * side * speed, -p.tx * side * speed });
        }
    }
    car.jolt = std::max(0.0f, car.jolt - dt * 3);

    // falling onto the road at the very start
    if (run.state == RunState::Landing) {
        car.vy -= GRAVITY * dt;
        car.y += car.vy * dt;
        const float ground = t.height(car.x, car.z, run.s);
        if (car.y <= ground) {
            car.y = ground;
            if (car.vy < -6) { car.vy = -car.vy * 0.22f; run.events |= EV_LAND; run.bonk = 6; run.event_at = { car.x, car.z }; }
            else { car.vy = 0; run.state = RunState::Driving; }
        }
        return;
    }

    run.time += dt;
    const Input in = raw;
    const float fx = std::cos(car.yaw), fz = std::sin(car.yaw), rx = -fz, rz = fx;
    float vf = car.vx * fx + car.vz * fz, vl = car.vx * rx + car.vz * rz;
    Surface surf = t.surface(car.x, car.z, run.s);
    const bool sand = surf == Surface::Ground;

    const float top = sand ? MAX_SAND : MAX_ROAD;
    if (in.throttle > 0) {
        if (vf < 0) vf += BRAKE * in.throttle * dt;   // rolling back: stop, and on into forwards
        else if (vf < top) vf += in.throttle * ACCEL * (sand ? 0.7f : 1.0f) * dt;
    } else if (in.throttle < 0) {
        if (vf > 0.3f) vf = std::max(0.0f, vf + BRAKE * (car.drifting ? 0.22f : 1.0f) * in.throttle * dt);
        else vf = std::max(-REVERSE_MAX, vf + 9 * in.throttle * dt);
    }
    if (vf > top) vf += (top - vf) * std::min(1.0f, 2.5f * dt);
    vf -= vf * (sand ? 1.1f : 0.22f) * dt;
    if (in.throttle == 0) vf -= std::copysign(std::min(std::fabs(vf), 1.2f * dt), vf);
    {   // hills: gravity along the slope
        const Sample p = t.at(run.s);
        const float slope = (t.elevation(run.s + 0.5f) - t.elevation(run.s - 0.5f)) * (fx * p.tx + fz * p.tz);
        vf -= 9.8f * slope * 0.6f * dt;
    }

    // drifting: brake into a turn at speed and the back steps out; it lasts while you hold the turn
    if (vf > 6 && std::fabs(in.steer) > 0.35f && in.throttle < 0) car.drifting = true;
    if (car.drifting && (vf < 3.5f || std::fabs(in.steer) < 0.15f || (in.throttle >= 0 && std::fabs(vl) < 1.2f))) car.drifting = false;
    const float grip = car.drifting ? 1.4f : sand ? 6.0f : 11.0f;
    vl *= std::exp(-grip * dt);
    car.slip = std::fabs(vl);

    car.steer += (in.steer - car.steer) * std::min(1.0f, dt * 10);
    const float grip_turn = clampf(std::fabs(vf) / 3.5f, 0, 1) * (1 - 0.3f * clampf((std::fabs(vf) - 9) / 8, 0, 1));
    const float target_rate = car.steer * 2.7f * grip_turn * (vf >= 0 ? 1.0f : -1.0f) * (car.drifting ? 1.45f : 1.0f);
    car.yaw_rate += (target_rate - car.yaw_rate) * std::min(1.0f, dt * 9);
    car.vx = fx * vf + rx * vl; car.vz = fz * vf + rz * vl;
    car.yaw = wrap_angle(car.yaw + car.yaw_rate * dt);
    car.x += car.vx * dt; car.z += car.vz * dt;
    car.wheel += vf * dt / 0.55f;

    // the land's props are solid; the shortcut is gated unless it's been earned
    float bonk = 0;
    for (const Circle& c : t.circles) bonk = std::max(bonk, collide_circle(car, c.x, c.z, c.r));
    for (const Box& b : t.boxes) bonk = std::max(bonk, collide_box(car, b));
    if (!run.spec.shortcut) for (const Box& b : t.shortcut_gates) bonk = std::max(bonk, collide_box(car, b));
    run.bonk = bonk;
    if (bonk > 2.5f) { run.events |= EV_BONK; run.event_at = { car.x, car.z }; }
    for (Tumbleweed& w : tumbleweeds) {
        const float dx = w.x - car.x, dz = w.z - car.z, d = std::sqrt(dx * dx + dz * dz);
        if (d > CAR_RADIUS + 0.5f || d < 1e-4f) continue;
        w.vx = dx / d * 6 + car.vx * 0.8f; w.vz = dz / d * 6 + car.vz * 0.8f;
        car.vx *= 0.9f; car.vz *= 0.9f;
        run.events |= EV_TUMBLE;
    }

    // potholes jolt and slow you (and spill a sack)
    bool spilled = bonk > 4;
    for (size_t k = 0; k < t.potholes.size(); k++) {
        const Pothole& h = t.potholes[k];
        const float d2 = (h.x - car.x) * (h.x - car.x) + (h.z - car.z) * (h.z - car.z);
        if (d2 > h.r * h.r) { if (last_pothole == static_cast<int>(k) && d2 > (h.r + 1) * (h.r + 1)) last_pothole = -1; continue; }
        if (last_pothole == static_cast<int>(k)) continue;
        last_pothole = static_cast<int>(k);
        car.vx *= 0.72f; car.vz *= 0.72f;
        car.jolt = 1;
        run.events |= EV_POTHOLE;
        run.event_at = { h.x, h.z };
        spilled = true;
    }
    if (sand && std::fabs(vf) > 4) { run.rough += dt; if (run.rough > 1.4f) { run.rough = 0; spilled = true; } }
    if (spilled && run.spec.goal == Goal::Deliver && run.cargo > 0) { run.cargo--; run.events |= EV_SPILL; run.event_at = { car.x, car.z }; }

    // tools: into the bag if there's room
    for (size_t k = 0; k < t.pickups.size(); k++) {
        const Pickup& p = t.pickups[k];
        if (run.picked[k] || (p.x - car.x) * (p.x - car.x) + (p.z - car.z) * (p.z - car.z) > 1.2f * 1.2f) continue;
        if (run.bag.size() >= 2) { if (bag_full_nag != static_cast<int>(k)) { bag_full_nag = static_cast<int>(k); run.events |= EV_BAG_FULL; } continue; }
        run.picked[k] = true;
        run.bag.push_back(p.tool);
        run.events |= EV_PICKUP;
        run.event_at = { p.x, p.z };
    }

    // where we are: off the land, into the water, or on along the road (and over the bridge)
    surf = t.surface(car.x, car.z, run.s);
    const bool bridge = run.spec.shortcut && t.on_shortcut(car.x, car.z);
    if (surf == Surface::Void || surf == Surface::Water) {
        run.state = RunState::Failed;
        run.fail = surf == Surface::Water ? Fail::Splash : Fail::Fell;
        run.events |= EV_FAIL;
        run.event_at = { car.x, car.z };
        return;
    }
    car.y += ((bridge ? t.elevation(run.s) + 0.08f : t.height(car.x, car.z, run.s)) - car.y) * std::min(1.0f, dt * 14);
    float lat = 0;
    float s = t.nearest(car.x, car.z, &lat, run.s);
    if (std::fabs(lat) > t.road_half(s) + 5) s = t.nearest(car.x, car.z, &lat);   // across the bridge: a jump along the road
    run.s = s;

    // the goal
    const auto fail = [&](Fail f) { run.state = RunState::Failed; run.fail = f; run.events |= EV_FAIL; run.event_at = { car.x, car.z }; };
    switch (run.spec.goal) {
        case Goal::Chase: run.chaser += CHASE_SPEED * dt; if (run.chaser >= run.s - 1.5f) return fail(Fail::Caught); break;
        case Goal::Storm: run.chaser += (STORM_SPEED + run.time * 0.06f) * dt; if (run.chaser >= run.s - 2) return fail(Fail::Storm); break;
        case Goal::Clock: if (run.time > run.spec.time) return fail(Fail::Late); break;
        case Goal::Deliver: if (run.cargo <= 0) return fail(Fail::Spilled); break;
        case Goal::Reach: break;
    }
    if (run.s >= run.spec.to) { run.state = RunState::Done; run.events |= EV_DONE; }
}

Input autopilot(const Game& g) {
    const Track& t = *g.track;
    const Car& c = g.car;
    const float speed = c.forward_speed();
    Sample aim = t.at(g.run.s + 3.5f + std::max(0.0f, speed) * 0.4f);
    float ax = aim.x, az = aim.z;
    // over the bridge when it's open
    const bool on_bridge = t.on_shortcut(c.x, c.z);
    if (g.run.spec.shortcut && ((g.run.s > t.shortcut_from - 3 && g.run.s < t.shortcut_to - 8) || on_bridge) && std::hypot(c.x - t.shortcut_b.x, c.z - t.shortcut_b.z) > 6) {
        ax = t.shortcut_b.x; az = t.shortcut_b.z;   // straight across
    } else if (g.run.bag.size() < 2) {   // a tool a little way ahead, on the road: go for it
        for (size_t k = 0; k < t.pickups.size(); k++) {
            const Pickup& p = t.pickups[k];
            if (g.run.picked[k] || p.s < g.run.s + 2 || p.s > g.run.s + 14 || t.on_shortcut(p.x, p.z)) continue;
            float lat = 0;
            t.nearest(p.x, p.z, &lat, p.s);
            if (std::fabs(lat) > t.road_half(p.s) - 0.3f) continue;   // only the ones on the road
            ax = p.x; az = p.z;
            break;
        }
    }
    const float want = std::atan2(az - c.z, ax - c.x);
    const float diff = wrap_angle(want - c.yaw);
    const Sample a = t.at(g.run.s + 2), b = t.at(g.run.s + 14);
    const float bend = std::fabs(wrap_angle(std::atan2(b.tz, b.tx) - std::atan2(a.tz, a.tx)));
    const float target = MAX_ROAD * (1 - 0.6f * clampf(bend / 1.2f, 0, 1));
    Input in;
    in.steer = clampf(diff * 2.4f, -1, 1);
    in.throttle = speed < target ? 1.0f : speed > target + 2.5f ? -1.0f : 0.15f;
    return in;
}

} // namespace jr
