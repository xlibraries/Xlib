#include "logic.h"
#include <algorithm>
#include <cmath>

namespace breakout {
namespace {

// '.' empty, digits = hit points (colour follows the row)
const char* LEVELS[][8] = {
    { "..........", "1111111111", "1111111111", "1111111111", "1111111111", "..........", "..........", ".........." },
    { "2222222222", "2111111112", "2122222212", "2121111212", "2122222212", "2111111112", "2222222222", ".........." },
    { "....33....", "...3223...", "..321123..", ".32111123.", "..321123..", "...3223...", "....33....", ".........." },
    { "3.3.3.3.3.", ".2.2.2.2.2", "1.1.1.1.1.", ".1.1.1.1.1", "2.2.2.2.2.", ".3.3.3.3.3", "..........", ".........." },
};
constexpr int LEVEL_COUNT = sizeof(LEVELS) / sizeof(LEVELS[0]);
constexpr float BRICK_W = 56.0f, BRICK_H = 18.0f, GAP = 6.0f, TOP = 50.0f;

float clampf(float v, float lo, float hi) { return std::max(lo, std::min(hi, v)); }

uint32_t next_rand(Game& g) {
    g.rng ^= g.rng << 13; g.rng ^= g.rng >> 17; g.rng ^= g.rng << 5;
    return g.rng;
}

void reset_ball(Game& g) {
    g.balls.clear();
    g.balls.push_back({ { g.paddle_x, PADDLE_Y - BALL_R - 1 }, { 0, 0 }, true });
}

void launch(Game& g, Ball& b) {
    b.stuck = false;
    const float angle = -1.25f + (next_rand(g) % 100) / 100.0f * 0.5f;   // up, slightly to one side
    b.v = { std::cos(angle) * g.speed * (next_rand(g) % 2 ? 1 : -1) * 0.6f, std::sin(angle) * g.speed };
    const float len = std::sqrt(b.v.x * b.v.x + b.v.y * b.v.y);
    b.v = { b.v.x / len * g.speed, b.v.y / len * g.speed };
}

// Ball vs axis-aligned box: pushes the ball out along the shallower axis and reflects. Returns true on a hit.
bool collide_box(Ball& b, float x, float y, float w, float h) {
    const float cx = clampf(b.p.x, x, x + w), cy = clampf(b.p.y, y, y + h);
    const float dx = b.p.x - cx, dy = b.p.y - cy;
    if (dx * dx + dy * dy > BALL_R * BALL_R) return false;
    const float overlap_x = std::min(b.p.x + BALL_R - x, x + w - (b.p.x - BALL_R));
    const float overlap_y = std::min(b.p.y + BALL_R - y, y + h - (b.p.y - BALL_R));
    if (overlap_x < overlap_y) {
        b.v.x = (b.p.x < x + w / 2) ? -std::fabs(b.v.x) : std::fabs(b.v.x);
        b.p.x += (b.v.x < 0 ? -overlap_x : overlap_x);
    } else {
        b.v.y = (b.p.y < y + h / 2) ? -std::fabs(b.v.y) : std::fabs(b.v.y);
        b.p.y += (b.v.y < 0 ? -overlap_y : overlap_y);
    }
    return true;
}

void step_ball(Game& g, Ball& b, float dt) {
    b.p.x += b.v.x * dt;
    b.p.y += b.v.y * dt;

    // walls
    if (b.p.x < BALL_R) { b.p.x = BALL_R; b.v.x = std::fabs(b.v.x); g.events.push_back(Event::WallHit); }
    if (b.p.x > FIELD_W - BALL_R) { b.p.x = FIELD_W - BALL_R; b.v.x = -std::fabs(b.v.x); g.events.push_back(Event::WallHit); }
    if (b.p.y < BALL_R) { b.p.y = BALL_R; b.v.y = std::fabs(b.v.y); g.events.push_back(Event::WallHit); }

    // paddle: the bounce angle depends on where the ball lands (centre = straight up, edges = steep)
    const float px = g.paddle_x - g.paddle_w / 2;
    if (b.v.y > 0 && b.p.y + BALL_R >= PADDLE_Y && b.p.y < PADDLE_Y + PADDLE_H &&
        b.p.x >= px - BALL_R && b.p.x <= px + g.paddle_w + BALL_R) {
        const float offset = clampf((b.p.x - g.paddle_x) / (g.paddle_w / 2), -1.0f, 1.0f);
        const float angle = offset * 1.05f;   // up to ~60° from vertical
        b.v = { std::sin(angle) * g.speed, -std::cos(angle) * g.speed };
        b.p.y = PADDLE_Y - BALL_R;
        g.events.push_back(Event::PaddleHit);
    }

    // bricks (one per step keeps reflections sane)
    for (Brick& br : g.bricks) {
        if (br.hp <= 0 || !collide_box(b, br.x, br.y, br.w, br.h)) continue;
        br.hp--;
        g.hits.push_back({ br.x + br.w / 2, br.y + br.h / 2 });
        if (br.hp > 0) {
            g.score += 10;
            g.events.push_back(Event::BrickHit);
        } else {
            g.score += 50;
            g.events.push_back(Event::BrickBroken);
            if (next_rand(g) % 8 == 0) g.powerups.push_back({ { br.x + br.w / 2, br.y + br.h / 2 }, next_rand(g) % 2 ? PowerKind::Wide : PowerKind::Multi });
        }
        break;
    }
}

} // namespace

int level_count() { return LEVEL_COUNT; }

int bricks_left(const Game& g) {
    return static_cast<int>(std::count_if(g.bricks.begin(), g.bricks.end(), [](const Brick& b) { return b.hp > 0; }));
}

void start_level(Game& g, int level) {
    g.level = level % LEVEL_COUNT;
    g.speed = BALL_SPEED * (1.0f + 0.08f * level);   // a little faster each level (and each lap through them)
    g.bricks.clear();
    g.powerups.clear();
    g.paddle_w = PADDLE_W;
    g.wide_timer = 0;
    const float left = (FIELD_W - (10 * BRICK_W + 9 * GAP)) / 2;
    for (int row = 0; row < 8; row++) {
        for (int col = 0; col < 10; col++) {
            const char c = LEVELS[g.level][row][col];
            if (c >= '1' && c <= '9') g.bricks.push_back({ left + col * (BRICK_W + GAP), TOP + row * (BRICK_H + GAP), BRICK_W, BRICK_H, c - '0', row });
        }
    }
    reset_ball(g);
    g.phase = Phase::Ready;
}

void new_game(Game& g) {
    const uint32_t rng = g.rng;
    g = Game{};
    g.rng = rng;
    start_level(g, 0);
}

void update(Game& g, float dt, const Input& in) {
    g.events.clear();
    g.hits.clear();
    dt = std::min(dt, 1.0f / 20.0f);   // a long hitch (tab switch) mustn't teleport the ball

    if (g.phase == Phase::GameOver || g.phase == Phase::LevelCleared) {
        if (in.launch) {
            if (g.phase == Phase::GameOver) new_game(g);
            else start_level(g, g.level + 1);
        }
        return;
    }

    // paddle
    if (in.target_x >= 0) g.paddle_x = in.target_x;
    g.paddle_x += in.dir * 520.0f * dt;
    g.paddle_x = clampf(g.paddle_x, g.paddle_w / 2, FIELD_W - g.paddle_w / 2);
    if (g.wide_timer > 0 && (g.wide_timer -= dt) <= 0) g.paddle_w = PADDLE_W;

    if (g.phase == Phase::Ready) {
        for (Ball& b : g.balls) b.p = { g.paddle_x, PADDLE_Y - BALL_R - 1 };
        if (in.launch) {
            for (Ball& b : g.balls) launch(g, b);
            g.phase = Phase::Playing;
        }
        return;
    }

    // balls, in small sub-steps so even fast balls can't pass through a brick
    const float max_move = BALL_R * 0.5f;
    const int steps = std::max(1, static_cast<int>(std::ceil(g.speed * dt / max_move)));
    for (int s = 0; s < steps; s++) for (Ball& b : g.balls) step_ball(g, b, dt / steps);
    g.balls.erase(std::remove_if(g.balls.begin(), g.balls.end(), [](const Ball& b) { return b.p.y > FIELD_H + BALL_R; }), g.balls.end());

    // power-ups fall; caught ones apply
    for (PowerUp& p : g.powerups) p.p.y += 120.0f * dt;
    for (auto it = g.powerups.begin(); it != g.powerups.end();) {
        const bool caught = it->p.y >= PADDLE_Y && it->p.y <= PADDLE_Y + PADDLE_H + 10 && std::fabs(it->p.x - g.paddle_x) <= g.paddle_w / 2 + 8;
        if (caught) {
            g.events.push_back(Event::PowerUp);
            if (it->kind == PowerKind::Wide) { g.paddle_w = PADDLE_W * 1.6f; g.wide_timer = 12.0f; }
            else if (!g.balls.empty()) {
                const Ball base = g.balls.front();
                for (float a : { -0.5f, 0.5f }) {
                    Ball extra = base;
                    const float c = std::cos(a), s = std::sin(a);
                    extra.v = { base.v.x * c - base.v.y * s, base.v.x * s + base.v.y * c };
                    if (extra.v.y > 0) extra.v.y = -extra.v.y;
                    g.balls.push_back(extra);
                }
            }
        }
        if (caught || it->p.y > FIELD_H + 20) it = g.powerups.erase(it); else ++it;
    }

    if (bricks_left(g) == 0) {
        g.phase = Phase::LevelCleared;
        g.score += 500;
        g.events.push_back(Event::LevelCleared);
    } else if (g.balls.empty()) {
        g.lives--;
        g.events.push_back(Event::LifeLost);
        g.paddle_w = PADDLE_W;
        g.wide_timer = 0;
        g.powerups.clear();
        if (g.lives <= 0) {
            g.phase = Phase::GameOver;
            g.events.push_back(Event::GameOver);
        } else {
            reset_ball(g);
            g.phase = Phase::Ready;
        }
    }
}

} // namespace breakout
