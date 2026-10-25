#include "doctest.h"
#include "games/jyotirath/go.h"
#include "games/jyotirath/track.h"

#include <algorithm>
#include <cmath>

using namespace jr;

namespace {
const Board& board() { static const Board b = lower_town_board(); return b; }
int find(const Board& b, PieceKind k, int nth = 0) {
    for (size_t i = 0; i < b.pieces.size(); i++) if (b.pieces[i].kind == k && nth-- == 0) return static_cast<int>(i);
    return -1;
}
/** A tiny board: a line of n nodes, 0..n-1, start at 0, exit at the end. */
Board line(int n) {
    Board b;
    for (int i = 0; i < n; i++) { b.nodes.push_back({ static_cast<float>(i), 0 }); b.adj.emplace_back(); }
    for (int i = 0; i + 1 < n; i++) b.link(i, i + 1);
    b.exit = n - 1;
    return b;
}
}

TEST_CASE("the Lower Town board lies on the Lower Town's road, joined up from start to exit") {
    const Board& b = board();
    const Track t = build_track();
    CHECK(b.nodes.size() > 30);
    for (const GoNode& n : b.nodes) {
        CHECK(t.zone(n.s) == Zone::LowerTown);
        CHECK(std::fabs(n.lat) < t.road_half(n.s));
    }
    for (size_t i = 0; i < b.adj.size(); i++) {
        CHECK_FALSE(b.adj[i].empty());
        for (int j : b.adj[i]) CHECK(b.adjacent(j, static_cast<int>(i)));   // links go both ways
    }
    CHECK(b.nodes[b.exit].s > b.nodes[b.start].s + 100);
    CHECK(b.artifacts.size() == 4);
    CHECK(find(b, PieceKind::Cart) >= 0);
    CHECK(find(b, PieceKind::Watchman) >= 0);
    CHECK(find(b, PieceKind::Bull) >= 0);
}

TEST_CASE("the board can be cleared, and not by walking straight up the middle") {
    const Board& b = board();
    REQUIRE(b.par > 0);
    MESSAGE("par " << b.par);
    CHECK(b.par >= 22);   // at least one node per row
    CHECK(solve(b) == b.par);
}

TEST_CASE("following the best move clears the board in par, from the start or from part way") {
    GoState s(board());
    int steps = 0;
    while (!s.won && steps < 200) { const int to = best_move(s); REQUIRE(to >= 0); CHECK(s.move(to) != Outcome::Caught); steps++; }
    CHECK(s.won);
    CHECK(s.moves == board().par);
    GoState t(board());
    t.move(board().adj[t.player][0]);
    int more = 0;
    while (!t.won && more < 200) { t.move(best_move(t)); more++; }
    CHECK(t.won);
    CHECK_FALSE(t.caught);
}

TEST_CASE("you move one neighbouring node at a time; anywhere else is blocked") {
    GoState s(board());
    const int far = board().exit;
    CHECK(s.move(far) == Outcome::Blocked);
    CHECK(s.moves == 0);
    const int next = board().adj[s.player][0];
    CHECK(s.move(next) == Outcome::Moved);
    CHECK(s.player == next);
    CHECK(s.from == board().start);
    CHECK(s.moves == 1);
}

TEST_CASE("a cart rolls to the end of its lane and back; stepping where it's going is caught, stepping on it from behind nudges it aside") {
    Board b = line(6);
    Piece cart{ PieceKind::Cart, 3, { 2, 3, 4 } };
    b.pieces.push_back(cart);
    GoState s(b);
    CHECK(s.next_of(s.pieces[0]) == 4);
    s.move(1);                       // the cart rolls on to 4, the end of its lane
    CHECK(s.pieces[0].node == 4);
    CHECK(s.next_of(s.pieces[0]) == 3);   // and turns back
    CHECK(s.move(2) == Outcome::Moved);   // it rolls to 3
    CHECK(s.pieces[0].node == 3);
    CHECK(s.threat_of(s.pieces[0]) == 2); // coming at you
    CHECK(s.move(3) == Outcome::Caught);  // into its face
    CHECK(s.caught);

    GoState t(b);
    t.move(1);
    t.move(2);   // cart at 3, heading to 2: step back out of its way
    CHECK(t.move(1) == Outcome::Moved);
    CHECK(t.pieces[0].node == 2);           // the end of its lane: it'll turn away, back to 3
    CHECK(t.threat_of(t.pieces[0]) == 3);
    CHECK(t.move(2) == Outcome::Moved);     // so stepping onto it now is from behind
    CHECK(t.pieces[0].out);
    Board c = line(6);
    Piece behind{ PieceKind::Cart, 2, { 2, 3, 4 } };
    c.pieces.push_back(behind);
    GoState u(c);
    u.move(1);   // the cart rolls away to 3
    u.move(2);   // to 4
    CHECK(u.pieces[0].node == 4);
    u.move(3);   // it turns back towards you: caught
    CHECK(u.caught);
}

TEST_CASE("a watchman catches you in front of him; from behind you nudge him aside") {
    Board b = line(5);
    Piece w{ PieceKind::Watchman, 2, {} };
    w.facing = 1;
    b.pieces.push_back(w);
    GoState s(b);
    CHECK(s.move(1) == Outcome::Caught);
    Board c = line(5);
    Piece away{ PieceKind::Watchman, 2, {} };
    away.facing = 3;
    c.pieces.push_back(away);
    GoState t(c);
    CHECK(t.move(1) == Outcome::Moved);
    CHECK(t.move(2) == Outcome::Moved);
    CHECK(t.pieces[0].out);
    CHECK(t.move(3) == Outcome::Moved);   // his gaze is gone with him
    CHECK(t.move(4) == Outcome::Won);
}

TEST_CASE("the bull charges down its lane once you're in line, and stops when you leave it") {
    // a lane 0..4 with a side node 5 off node 1
    Board b = line(5);
    b.nodes.push_back({ 0, 1 }); b.adj.emplace_back();
    b.link(1, 5);
    Piece bull{ PieceKind::Bull, 4, { 0, 1, 2, 3, 4 } };
    bull.dir = -1;
    b.pieces.push_back(bull);
    GoState s(b);
    CHECK(s.next_of(s.pieces[0]) == 3);   // you're at 0, in its lane: it comes
    s.move(5);                            // off the lane
    CHECK(s.pieces[0].node == 4);         // it stays put
    s.move(1);                            // back in line
    CHECK(s.pieces[0].node == 3);
    s.move(5);
    CHECK(s.pieces[0].node == 3);
    s.move(1);
    CHECK(s.pieces[0].node == 2);
    CHECK(s.move(2) == Outcome::Caught);  // into its horns
}

TEST_CASE("artifacts are picked up on the way; stars for clearing, every artifact and par") {
    Board b = line(4);
    b.artifacts = { 2 };
    b.par = 3;
    GoState s(b);
    s.move(1); s.move(2);
    CHECK(s.artifacts() == 1);
    CHECK(s.move(3) == Outcome::Won);
    CHECK(s.won);
    CHECK(s.stars() == 3);
    GoState t(b);
    t.move(1); t.move(0); t.move(1); t.move(2); t.move(3);
    CHECK(t.stars() == 2);   // over par
    t.reset();
    CHECK(t.moves == 0);
    CHECK(t.artifacts() == 0);
    CHECK(t.player == b.start);
}
