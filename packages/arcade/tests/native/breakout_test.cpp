#include "doctest.h"
#include "games/breakout/logic.h"
#include <algorithm>
#include <cmath>

using namespace breakout;

namespace {
bool has(const Game& g, Event e) { return std::find(g.events.begin(), g.events.end(), e) != g.events.end(); }
Input launch() { Input in; in.launch = true; return in; }
// Clears the field except for what the test sets up
void empty_field(Game& g) { g.bricks.clear(); g.bricks.push_back({ 0, -100, 1, 1, 1, 0 }); }   // one unreachable brick keeps the level going
}

TEST_CASE("a new game waits on the paddle until launched") {
    Game g;
    new_game(g);
    CHECK(g.phase == Phase::Ready);
    CHECK(g.lives == START_LIVES);
    CHECK(bricks_left(g) == 40);
    REQUIRE(g.balls.size() == 1);
    Input move; move.target_x = 100;
    update(g, 0.016f, move);
    CHECK(g.balls[0].p.x == doctest::Approx(100));   // the stuck ball follows the paddle
    update(g, 0.016f, launch());
    CHECK(g.phase == Phase::Playing);
    CHECK(g.balls[0].v.y < 0);   // launched upwards
    CHECK(std::hypot(g.balls[0].v.x, g.balls[0].v.y) == doctest::Approx(g.speed));
}

TEST_CASE("the ball bounces off the side and top walls") {
    Game g; new_game(g); update(g, 0.016f, launch()); empty_field(g);
    g.balls[0].p = { 3 * BALL_R, 200 }; g.balls[0].v = { -300, 0 };
    update(g, 0.05f, {});
    CHECK(g.balls[0].v.x > 0);
    CHECK(has(g, Event::WallHit));
    g.balls[0].p = { 300, 3 * BALL_R }; g.balls[0].v = { 0, -300 };
    update(g, 0.05f, {});
    CHECK(g.balls[0].v.y > 0);
}

TEST_CASE("the paddle sends the ball back up, steeper towards its edges") {
    Game g; new_game(g); update(g, 0.016f, launch()); empty_field(g);
    g.paddle_x = 320;
    g.balls[0].p = { 320, PADDLE_Y - BALL_R - 2 }; g.balls[0].v = { 0, 300 };
    update(g, 0.02f, {});
    CHECK(has(g, Event::PaddleHit));
    CHECK(g.balls[0].v.y < 0);
    CHECK(std::fabs(g.balls[0].v.x) < 1.0f);   // centre: straight up

    g.balls[0].p = { 320 + PADDLE_W / 2 - 2, PADDLE_Y - BALL_R - 2 }; g.balls[0].v = { 0, 300 };
    update(g, 0.02f, {});
    CHECK(g.balls[0].v.x > 200);               // near the right edge: sharply right
}

TEST_CASE("bricks take hits, score and break") {
    Game g; new_game(g); update(g, 0.016f, launch());
    g.bricks = { { 300, 100, 56, 18, 2, 0 } };
    g.balls[0].p = { 328, 130 }; g.balls[0].v = { 0, -300 };
    update(g, 0.05f, {});
    CHECK(has(g, Event::BrickHit));
    CHECK(g.bricks[0].hp == 1);
    CHECK(g.score == 10);
    CHECK(g.balls[0].v.y > 0);   // reflected
    g.balls[0].p = { 328, 130 }; g.balls[0].v = { 0, -300 };
    update(g, 0.05f, {});
    CHECK(has(g, Event::BrickBroken));
    CHECK(g.score == 10 + 50 + 500);   // the last brick also clears the level
    CHECK(g.phase == Phase::LevelCleared);
}

TEST_CASE("a very fast ball can't pass through a brick") {
    Game g; new_game(g); update(g, 0.016f, launch());
    g.bricks = { { 300, 100, 56, 18, 1, 0 }, { 0, -100, 1, 1, 1, 0 } };
    g.speed = 3000;
    g.balls[0].p = { 328, 200 }; g.balls[0].v = { 0, -3000 };   // ends 150 px up, past the brick
    update(g, 0.05f, {});   // would move 150 px in one go without sub-steps
    CHECK(g.bricks[0].hp == 0);
}

TEST_CASE("losing every ball costs a life, and the last life ends the game") {
    Game g; new_game(g); update(g, 0.016f, launch()); empty_field(g);
    g.balls[0].p = { 50, FIELD_H - 2 }; g.balls[0].v = { 0, 400 };
    update(g, 0.05f, {});
    CHECK(has(g, Event::LifeLost));
    CHECK(g.lives == START_LIVES - 1);
    CHECK(g.phase == Phase::Ready);
    g.lives = 1;
    update(g, 0.016f, launch());
    g.balls[0].p = { 50, FIELD_H - 2 }; g.balls[0].v = { 0, 400 };
    update(g, 0.05f, {});
    CHECK(g.phase == Phase::GameOver);
    CHECK(has(g, Event::GameOver));
    update(g, 0.016f, launch());   // any launch starts over
    CHECK(g.phase == Phase::Ready);
    CHECK(g.lives == START_LIVES);
    CHECK(g.score == 0);
}

TEST_CASE("clearing a level moves on to the next, faster") {
    Game g; new_game(g);
    g.phase = Phase::LevelCleared;
    const float speed = g.speed;
    update(g, 0.016f, launch());
    CHECK(g.level == 1);
    CHECK(g.speed > speed);
    CHECK(bricks_left(g) > 0);
}

TEST_CASE("every level has bricks") {
    Game g;
    for (int i = 0; i < level_count(); i++) { start_level(g, i); CHECK(bricks_left(g) > 0); }
}

TEST_CASE("power-ups: wide paddle and extra balls") {
    Game g; new_game(g); update(g, 0.016f, launch()); empty_field(g);
    g.balls[0].p = { 100, 100 }; g.balls[0].v = { 0, -300 };
    g.powerups = { { { g.paddle_x, PADDLE_Y + 2 }, PowerKind::Wide } };
    update(g, 0.016f, {});
    CHECK(has(g, Event::PowerUp));
    CHECK(g.paddle_w > PADDLE_W);
    g.powerups = { { { g.paddle_x, PADDLE_Y + 2 }, PowerKind::Multi } };
    update(g, 0.016f, {});
    CHECK(g.balls.size() == 3);
}

TEST_CASE("the paddle stays inside the field") {
    Game g; new_game(g);
    Input in; in.target_x = 5000;
    update(g, 0.016f, in);
    CHECK(g.paddle_x == doctest::Approx(FIELD_W - g.paddle_w / 2));
    in.target_x = -1; in.dir = -1;
    for (int i = 0; i < 200; i++) update(g, 0.016f, in);
    CHECK(g.paddle_x == doctest::Approx(g.paddle_w / 2));
}

TEST_CASE("the paddle stays where it was: after keys, a lost life and a new level; only a new game re-centres it") {
    Game g; new_game(g);
    Input right; right.dir = 1;
    for (int i = 0; i < 20; i++) update(g, 0.016f, right);
    const float moved = g.paddle_x;
    CHECK(moved > FIELD_W / 2 + 50);
    update(g, 0.016f, {});                 // key released: no target, no movement
    CHECK(g.paddle_x == doctest::Approx(moved));

    update(g, 0.016f, launch()); empty_field(g);
    g.balls[0].p = { 50, FIELD_H - 2 }; g.balls[0].v = { 0, 400 };
    update(g, 0.05f, {});
    CHECK(has(g, Event::LifeLost));
    CHECK(g.paddle_x == doctest::Approx(moved));
    CHECK(g.balls[0].p.x == doctest::Approx(moved));   // the next ball waits on the paddle where it is

    g.phase = Phase::LevelCleared;
    update(g, 0.016f, launch());
    CHECK(g.level == 1);
    CHECK(g.paddle_x == doctest::Approx(moved));

    g.phase = Phase::GameOver;
    update(g, 0.016f, launch());
    CHECK(g.paddle_x == doctest::Approx(FIELD_W / 2));
}

