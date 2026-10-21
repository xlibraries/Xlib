#include "feel.h"
#include <algorithm>
#include <cmath>

namespace tt {

namespace {

float ease(float value, float target, float rate, float dt) { return value + (target - value) * std::min(1.0f, rate * dt); }

} // namespace

Mood target_mood(const Run& run, const Pose& pose, bool grounded, float speed, float time) {
    Mood m;
    switch (run.state) {
        case RunState::Crashed: m.eyes = 0.35f; m.smile = -0.8f; m.brow = 0.6f; m.dizzy = true; m.look_x = 0; return m;
        case RunState::OutOfFuel: m.eyes = 0.55f; m.smile = -0.6f; m.brow = 0.5f; m.look_y = -0.5f; return m;   // sad
        case RunState::Finished: m.eyes = 1.15f; m.smile = 1; m.brow = 0.7f; m.mouth_open = 0.5f; return m;      // thrilled
        case RunState::Ready: m.eyes = 1; m.smile = 0.35f; m.look_x = 0.4f + 0.4f * std::sin(time * 0.7f); m.look_y = 0.2f * std::sin(time * 1.1f); return m;
        case RunState::Driving: break;
    }
    if (run.boosting) { m.eyes = 0.65f; m.smile = 1; m.brow = -0.9f; m.look_x = 1; return m; }               // focused grin
    if (!grounded) { m.eyes = 1.5f; m.mouth_open = 1; m.brow = 1; m.smile = 0.2f; m.look_x = 0.8f; m.look_y = pose.vy > 0 ? 0.5f : -0.4f; return m; }
    if (speed > 7) { m.eyes = 0.9f; m.smile = 0.9f; m.brow = -0.35f; m.look_x = 1; return m; }                // enjoying the speed
    if (pose.vx < -0.5f) { m.eyes = 1; m.smile = 0; m.brow = 0.2f; m.look_x = -0.8f; return m; }               // reversing: looking back
    m.eyes = 1; m.smile = 0.5f; m.brow = 0; m.look_x = 0.7f;
    return m;
}

void update_feel(Feel& f, const Run& run, const Pose& pose, bool grounded, float impact, float dt, float time) {
    const float speed = std::fabs(pose.vx);
    Mood t = target_mood(run, pose, grounded, speed, time);
    // a hard landing squints for a moment
    if (impact > 3.0f) f.impact_timer = 0.25f;
    f.impact_timer = std::max(0.0f, f.impact_timer - dt);
    if (f.impact_timer > 0 && !t.dizzy) { t.eyes = std::min(t.eyes, 0.3f); t.mouth_open = 0; t.smile = std::min(t.smile, -0.2f); }

    Mood& m = f.mood;
    m.eyes = ease(m.eyes, t.eyes, 14, dt);
    m.smile = ease(m.smile, t.smile, 8, dt);
    m.brow = ease(m.brow, t.brow, 10, dt);
    m.mouth_open = ease(m.mouth_open, t.mouth_open, 12, dt);
    m.look_x = ease(m.look_x, t.look_x, 6, dt);
    m.look_y = ease(m.look_y, t.look_y, 6, dt);
    m.dizzy = t.dizzy;

    // blinks: every 2.5–4.5 s, 0.12 s long (a fixed sequence, so it's repeatable)
    if (f.blink > 0) f.blink = std::max(0.0f, f.blink - dt);
    else {
        f.until_blink -= dt;
        if (f.until_blink <= 0) { f.blink = 0.12f; f.blinks++; f.until_blink = 2.5f + 2.0f * std::fabs(std::sin(f.blinks * 2.4f)); }
    }

    // squash and stretch: landings compress the body, take-offs stretch it; a spring brings it back
    if (impact > 2.0f) f.squash_v -= std::min(impact, 12.0f) * 0.45f;
    const float target = !grounded && pose.vy > 3.0f ? 1.08f : 1.0f;
    f.squash_v += (target - f.squash) * 160.0f * dt - f.squash_v * 12.0f * dt;
    f.squash += f.squash_v * dt;
    f.squash = std::max(0.7f, std::min(1.25f, f.squash));

    // screen shake from heavy landings and crashes, decaying fast
    if (impact > 4.5f) f.shake = std::min(1.0f, f.shake + impact * 0.07f);
    if (run.state == RunState::Crashed && f.shake < 0.5f && run.events.size()) f.shake = 0.8f;
    f.shake *= std::exp(-7.0f * dt);
    if (f.shake < 0.01f) f.shake = 0;

    f.boost_glow = ease(f.boost_glow, run.boosting ? 1.0f : 0.0f, run.boosting ? 10 : 4, dt);
}

} // namespace tt
