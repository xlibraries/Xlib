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
    j.s = s;
    car.y = track->height(car.x, car.z, s);
    tumbleweeds.clear();
}

void Game::reset() {
    j = Journey{};
    taken.assign(track->artifacts.size(), false);
    pots.clear();
    for (const V2& p : track->pots) { Pot pot{ p.x, 0.0f, p.z }; pots.push_back(pot); }
    clock = 0;
    last_pothole = -1;
    place(4);
    car.y = 16;   // dropped from the sky onto the empty road
}

void Game::finish_talking() {
    if (j.phase != Phase::Talking) return;
    const int last = static_cast<int>(chapter_one().size()) - 1;
    if (j.stop >= last) { j.phase = Phase::Complete; j.events |= EV_COMPLETE; return; }
    j.stop++;
    j.phase = Phase::Driving;
}

void Game::step(const Input& raw, float dt) {
    j.events &= EV_COMPLETE;   // finish_talking may have set it between steps
    j.bonk = 0;
    clock += dt;
    const Track& t = *track;
    const std::vector<Stop>& stops = chapter_one();

    // pots in flight
    for (Pot& p : pots) {
        if (!p.hit || p.broken) continue;
        p.vy -= GRAVITY * dt;
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        p.spin += dt * 9;
        const float ground = t.height(p.x, p.z, j.s);
        if (p.y <= ground && p.vy < 0) { p.broken = true; p.y = ground; j.events |= EV_POT_BREAK; j.event_at = { p.x, p.z }; }
    }
    // tumbleweeds blow across the desert road ahead of you
    for (Tumbleweed& w : tumbleweeds) { w.x += w.vx * dt; w.z += w.vz * dt; w.spin += dt * 5; w.life += dt; }
    tumbleweeds.erase(std::remove_if(tumbleweeds.begin(), tumbleweeds.end(), [](const Tumbleweed& w) { return w.life > 7; }), tumbleweeds.end());
    if (j.phase == Phase::Driving) {
        for (size_t k = 0; k < t.tumbleweed_lanes.size(); k++) {
            const float lane = t.tumbleweed_lanes[k];
            if (j.s < lane - 45 || j.s > lane + 2) continue;
            const float period = 2.6f;
            if (std::floor(clock / period) != std::floor((clock - dt) / period)) {
                const Sample p = t.at(lane);
                const float side = hash01(static_cast<uint32_t>(clock / period) * 31 + static_cast<uint32_t>(k)) < 0.5f ? -1.0f : 1.0f;
                const float off = side * (t.road_half(lane) + 7), speed = 3.2f + 1.5f * hash01(static_cast<uint32_t>(clock * 10));
                tumbleweeds.push_back({ p.x - p.tz * off, p.z + p.tx * off, p.tz * side * speed, -p.tx * side * speed });
            }
        }
    }
    j.ghost = std::max(0.0f, j.ghost - dt);
    car.jolt = std::max(0.0f, car.jolt - dt * 3);

    // falling onto the road at the start
    if (j.phase == Phase::Landing) {
        j.landing -= dt;
        car.vy -= GRAVITY * dt;
        car.y += car.vy * dt;
        const float ground = t.height(car.x, car.z, j.s);
        if (car.y <= ground) {
            car.y = ground;
            if (car.vy < -6) { car.vy = -car.vy * 0.22f; j.events |= EV_LAND; j.bonk = 6; j.event_at = { car.x, car.z }; }
            else car.vy = 0;
        }
        if (j.landing <= 0 && car.y <= ground + 0.01f) { car.y = ground; car.vy = 0; j.phase = Phase::Talking; j.stop = 0; j.events |= EV_STOP; }
        return;
    }

    // waiting to be put back after running dry or driving off the land
    if (j.phase == Phase::Respawning) {
        j.respawn -= dt;
        if (!j.out_of_fuel) {
            car.vy -= GRAVITY * dt;
            car.y += car.vy * dt;
            car.x += car.vx * dt * 0.5f; car.z += car.vz * dt * 0.5f;
        }
        if (j.respawn <= 0) {
            place(stops[j.checkpoint].s + 1.5f);
            j.fuel = std::max(j.fuel, FUEL_RESPAWN);
            j.ghost = 1.2f;
            j.phase = Phase::Driving;
            j.events |= EV_RESPAWN;
        }
        return;
    }

    Input in = raw;
    const float fx = std::cos(car.yaw), fz = std::sin(car.yaw), rx = -fz, rz = fx;
    float vf = car.vx * fx + car.vz * fz, vl = car.vx * rx + car.vz * rz;
    if (j.phase == Phase::Talking || j.phase == Phase::Complete) in = Input{ vf > 0.4f ? -1.0f : 0.0f, 0 };   // pull up and listen
    if (j.phase == Phase::Driving) j.time += dt;
    const Surface surf = t.surface(car.x, car.z, j.s);
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
        const Sample p = t.at(j.s);
        const float slope = (t.elevation(j.s + 0.5f) - t.elevation(j.s - 0.5f)) * (fx * p.tx + fz * p.tz);
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
    if (j.phase == Phase::Driving) j.fuel = std::max(0.0f, j.fuel - (FUEL_IDLE + FUEL_GAS * std::max(0.0f, in.throttle)) * dt);

    // the town is solid; handcarts cross the road
    float bonk = 0;
    for (const Circle& c : t.circles) bonk = std::max(bonk, collide_circle(car, c.x, c.z, c.r));
    for (const Box& b : t.boxes) bonk = std::max(bonk, collide_box(car, b));
    bool cart_hit = false;
    for (const Mover& m : t.movers) {
        float yaw = 0;
        const V2 p = t.mover_at(m, clock, &yaw);
        const float hit = collide_box(car, { p.x, p.z, MOVER_W / 2, MOVER_D / 2, yaw });
        if (hit > 1.5f && j.ghost <= 0) cart_hit = true;
        bonk = std::max(bonk, hit);
    }
    j.bonk = bonk;
    if (bonk > 2.5f) { j.events |= EV_BONK; j.event_at = { car.x, car.z }; }
    if (cart_hit && j.phase == Phase::Driving) j.fuel = std::max(0.0f, j.fuel - FUEL_BONK);
    for (Tumbleweed& w : tumbleweeds) {
        const float dx = w.x - car.x, dz = w.z - car.z, d = std::sqrt(dx * dx + dz * dz);
        if (d > CAR_RADIUS + 0.5f || d < 1e-4f) continue;
        w.vx = dx / d * 6 + car.vx * 0.8f; w.vz = dz / d * 6 + car.vz * 0.8f;
        car.vx *= 0.9f; car.vz *= 0.9f;
        j.events |= EV_TUMBLE;
    }

    // potholes jolt and slow you
    for (size_t k = 0; k < t.potholes.size(); k++) {
        const Pothole& h = t.potholes[k];
        const float d2 = (h.x - car.x) * (h.x - car.x) + (h.z - car.z) * (h.z - car.z);
        if (d2 > h.r * h.r) { if (last_pothole == static_cast<int>(k) && d2 > (h.r + 1) * (h.r + 1)) last_pothole = -1; continue; }
        if (last_pothole == static_cast<int>(k)) continue;
        last_pothole = static_cast<int>(k);
        car.vx *= 0.72f; car.vz *= 0.72f;
        car.jolt = 1;
        j.events |= EV_POTHOLE;
        j.event_at = { h.x, h.z };
    }

    // pots fly; artifacts are collected
    for (Pot& p : pots) {
        if (p.hit || j.ghost > 0) continue;
        const float dx = p.x - car.x, dz = p.z - car.z, d = std::sqrt(dx * dx + dz * dz);
        if (d > CAR_RADIUS + 0.3f) continue;
        const float speed = std::sqrt(car.vx * car.vx + car.vz * car.vz);
        const float nx = d > 1e-4f ? dx / d : fx, nz = d > 1e-4f ? dz / d : fz;
        p.hit = true;
        p.vx = car.vx * 1.1f + nx * 2.5f; p.vz = car.vz * 1.1f + nz * 2.5f; p.vy = 3.5f + speed * 0.18f;
        p.y = t.height(p.x, p.z, j.s) + 0.05f;
        car.vx *= 0.93f; car.vz *= 0.93f;
        j.events |= EV_POT_HIT;
        j.event_at = { p.x, p.z };
    }
    for (size_t k = 0; k < t.artifacts.size(); k++) {
        const Artifact& a = t.artifacts[k];
        if (taken[k] || (a.x - car.x) * (a.x - car.x) + (a.z - car.z) * (a.z - car.z) > 1.15f * 1.15f) continue;
        taken[k] = true;
        j.artifacts++;
        if (a.kind == ArtifactKind::Fragment) j.fragment = true;
        j.fuel = std::min(1.0f, j.fuel + FUEL_ARTIFACT);
        j.events |= EV_ARTIFACT;
        j.event_at = { a.x, a.z };
    }

    // off the edge of the land: a fall; out of fuel: towed back
    if (t.surface(car.x, car.z, j.s) == Surface::Void) {
        j.phase = Phase::Respawning; j.respawn = RESPAWN_DELAY; j.out_of_fuel = false;
        j.events |= EV_FALL; j.event_at = { car.x, car.z };
        car.vy = 2; car.drifting = false;
        return;
    }
    car.y += (t.height(car.x, car.z, j.s) - car.y) * std::min(1.0f, dt * 14);
    j.s = t.nearest(car.x, car.z, nullptr, j.s);
    if (j.phase == Phase::Driving && j.fuel <= 0) {
        j.phase = Phase::Respawning; j.respawn = RESPAWN_DELAY; j.out_of_fuel = true;
        j.events |= EV_OUT_OF_FUEL;
        return;
    }

    // the next stop in the story
    if (j.phase == Phase::Driving && j.stop < static_cast<int>(stops.size()) && j.s >= stops[j.stop].s) {
        j.phase = Phase::Talking;
        if (stops[j.stop].checkpoint) j.checkpoint = j.stop;
        j.events |= EV_STOP;
    }
}

Input autopilot(const Game& g) {
    const Track& t = *g.track;
    const Car& c = g.car;
    const float speed = c.forward_speed();
    Sample aim = t.at(g.j.s + 3.5f + std::max(0.0f, speed) * 0.4f);
    float ax = aim.x, az = aim.z;
    // an artifact a little way ahead, on the road: go for it
    for (size_t k = 0; k < t.artifacts.size(); k++) {
        const Artifact& a = t.artifacts[k];
        if (g.taken[k] || a.s < g.j.s + 2 || a.s > g.j.s + 14) continue;
        ax = a.x; az = a.z;
        break;
    }
    const float want = std::atan2(az - c.z, ax - c.x);
    const float diff = wrap_angle(want - c.yaw);
    const Sample a = t.at(g.j.s + 2), b = t.at(g.j.s + 14);
    const float bend = std::fabs(wrap_angle(std::atan2(b.tz, b.tx) - std::atan2(a.tz, a.tx)));
    const float target = MAX_ROAD * (1 - 0.6f * clampf(bend / 1.2f, 0, 1));
    Input in;
    in.steer = clampf(diff * 2.4f, -1, 1);
    in.throttle = speed < target ? 1.0f : speed > target + 2.5f ? -1.0f : 0.15f;
    return in;
}

} // namespace jr
