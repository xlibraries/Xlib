// Neon Breakout: the game rules, with no graphics or audio, so they can be unit-tested natively
// (tests/native/breakout_test.cpp). Coordinates are a fixed 640×480 field; main.cpp scales it to the window.
#pragma once
#include <cstdint>
#include <vector>

namespace breakout {

constexpr float FIELD_W = 640.0f;
constexpr float FIELD_H = 480.0f;
constexpr float PADDLE_Y = 440.0f;
constexpr float PADDLE_H = 12.0f;
constexpr float PADDLE_W = 90.0f;
constexpr float BALL_R = 6.0f;
constexpr float BALL_SPEED = 330.0f;
constexpr int START_LIVES = 3;

struct Vec2 { float x = 0, y = 0; };

struct Brick {
    float x, y, w, h;
    int hp;        // hits left (0 = gone)
    int color;     // palette index
};

struct Ball {
    Vec2 p, v;
    bool stuck = true;   // resting on the paddle until launched
};

enum class PowerKind { Wide, Multi };
struct PowerUp { Vec2 p; PowerKind kind; };

enum class Event { WallHit, PaddleHit, BrickHit, BrickBroken, PowerUp, LifeLost, LevelCleared, GameOver };

enum class Phase { Ready, Playing, LevelCleared, GameOver };

struct Input {
    float target_x = -1.0f;   // paddle centre wanted by the mouse/touch (negative = none)
    int dir = 0;              // keyboard: -1 left, +1 right
    bool launch = false;      // space / click
};

struct Game {
    Phase phase = Phase::Ready;
    int level = 0;
    int score = 0;
    int lives = START_LIVES;
    float paddle_x = FIELD_W / 2;   // centre
    float paddle_w = PADDLE_W;
    float wide_timer = 0;
    float speed = BALL_SPEED;
    std::vector<Brick> bricks;
    std::vector<Ball> balls;
    std::vector<PowerUp> powerups;
    std::vector<Event> events;      // what happened this update (for sound and particles)
    std::vector<Vec2> hits;         // where bricks were hit this update
    uint32_t rng = 0x9e3779b9u;
};

int level_count();
/** Starts level `level` (keeps score and lives). */
void start_level(Game& g, int level);
/** A fresh game from level 0. */
void new_game(Game& g);
/** Advances the game by dt seconds. */
void update(Game& g, float dt, const Input& in);
/** Bricks still standing. */
int bricks_left(const Game& g);

} // namespace breakout
