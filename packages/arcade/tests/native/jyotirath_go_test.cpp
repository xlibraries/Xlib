#include "doctest.h"
#include "games/jyotirath/go.h"
#include "games/jyotirath/track.h"

#include <algorithm>
#include <cmath>

using namespace jr;

namespace {

/** A tiny board: a line of n nodes along the road, 0..n-1, start at 0, exit at the end. */
Board line(int n) {
    Board b;
    for (int i = 0; i < n; i++) b.add(static_cast<float>(i) * 5, 0);
    for (int i = 0; i + 1 < n; i++) b.link(i, i + 1);
    b.exit = n - 1;
    return b;
}

/** A small grid: rows × 3 lanes, node(r, l) = r * 3 + l, joined along and across; exit at the far middle. */
Board grid(int rows) {
    Board b;
    for (int r = 0; r < rows; r++) for (int l = 0; l < 3; l++) b.add(r * 5.0f, (l - 1) * 2.0f);
    for (int r = 0; r < rows; r++) for (int l = 0; l < 3; l++) {
        if (r + 1 < rows) b.link(r * 3 + l, (r + 1) * 3 + l);
        if (l < 2) b.link(r * 3 + l, r * 3 + l + 1);
    }
    b.start = 1;
    b.exit = (rows - 1) * 3 + 1;
    return b;
}

Piece watchman(int node, int facing, int sight = 1) { Piece p{ PieceKind::Watchman, node, {} }; p.facing = facing; p.sight = sight; return p; }

} // namespace

TEST_CASE("every board of the chapter lies on its district's road, joined up, and can be cleared") {
    const Track t = build_track();
    const Zone zones[BOARDS] = { Zone::LowerTown, Zone::Granary, Zone::GreatBath, Zone::Citadel, Zone::UpperTown };
    for (int i = 0; i < BOARDS; i++) {
        const Board& b = chapter_board(i);
        INFO(b.name);
        CHECK(b.nodes.size() > 25);
        for (const GoNode& n : b.nodes) CHECK(std::fabs(n.lat) < t.road_half(n.s));
        CHECK(t.zone(b.nodes[b.start].s) == zones[i]);
        for (size_t k = 0; k < b.adj.size(); k++) for (int j : b.adj[k]) CHECK(b.adjacent(j, static_cast<int>(k)));
        REQUIRE(b.par > 0);
        MESSAGE(b.name << ": par " << b.par);
        CHECK(b.items.size() >= 2);
    }
    // each district teaches its own thing
    bool sacks = false, stones = false, pillars = false, long_sight = false, villagers = false;
    for (int i = 0; i < BOARDS; i++) {
        const Board& b = chapter_board(i);
        for (const Piece& p : b.pieces) { sacks |= p.kind == PieceKind::Sack; villagers |= p.kind == PieceKind::Villager; long_sight |= p.kind == PieceKind::Watchman && p.sight > 2; }
        for (const GoNode& n : b.nodes) { stones |= n.sink >= 0; pillars |= n.pillar; }
    }
    CHECK(sacks); CHECK(stones); CHECK(pillars); CHECK(long_sight); CHECK(villagers);
    int clues = 0;
    for (const BoardItem& it : chapter_board(3).items) clues += it.tool == Tool::None;
    CHECK(clues == 1);   // the fragment, in the Citadel
}

TEST_CASE("following the best move clears every board in par") {
    for (int i = 0; i < BOARDS; i++) {
        const Board& b = chapter_board(i);
        GoState s(b);
        int steps = 0;
        while (!s.won && steps < 200) { const int to = best_move(s); REQUIRE(to >= 0); CHECK(s.move(to) != Outcome::Caught); steps++; }
        CHECK(s.won);
        CHECK(s.moves == b.par);
    }
}

TEST_CASE("you move one neighbouring node at a time; pillars and far nodes are blocked") {
    Board b = grid(4);
    b.nodes[4].pillar = true;
    GoState s(b);
    CHECK(s.move(b.exit) == Outcome::Blocked);
    CHECK(s.move(4) == Outcome::Blocked);
    CHECK(s.move(0) == Outcome::Moved);
    CHECK(s.moves == 1);
}

TEST_CASE("a cart rolls to the end of its lane and back; into its face you're caught, from behind you nudge it") {
    Board b = line(6);
    b.pieces.push_back(Piece{ PieceKind::Cart, 3, { 2, 3, 4 } });
    GoState s(b);
    CHECK(s.next_of(s.pieces[0]) == 4);
    s.move(1);
    CHECK(s.pieces[0].node == 4);
    CHECK(s.next_of(s.pieces[0]) == 3);   // turns back
    s.move(2);
    CHECK(s.pieces[0].node == 3);
    CHECK(s.threatens(s.pieces[0], 2));
    CHECK(s.move(3) == Outcome::Caught);
    GoState t(b);
    t.move(1); t.move(2); t.move(1);      // it rolls to 2, the end of its lane: it'll turn away
    CHECK(t.pieces[0].node == 2);
    CHECK(t.move(2) == Outcome::Moved);
    CHECK(t.pieces[0].out);
    CHECK(t.nudges == 1);
}

TEST_CASE("a watchman sees as far as his sight, until a pillar or a sack blocks it") {
    Board b = line(8);
    b.pieces.push_back(watchman(6, 5, 4));
    GoState s(b);
    std::vector<int> seen = s.threats(s.pieces[0]);
    CHECK(seen == std::vector<int>{ 5, 4, 3, 2 });
    CHECK(s.move(1) == Outcome::Moved);
    CHECK(s.move(2) == Outcome::Caught);
    Board p = line(8);
    p.nodes[4].pillar = true;
    p.pieces.push_back(watchman(6, 5, 4));
    GoState q(p);
    CHECK(q.threats(q.pieces[0]) == std::vector<int>{ 5 });
    Board k = line(8);
    k.pieces.push_back(watchman(6, 5, 4));
    k.pieces.push_back(Piece{ PieceKind::Sack, 4, {} });
    GoState r(k);
    CHECK(r.threats(r.pieces[0]) == std::vector<int>{ 5 });
}

TEST_CASE("a sack slides one node on when you walk into it, if there's room straight ahead") {
    Board b = grid(5);
    b.pieces.push_back(Piece{ PieceKind::Sack, 4, {} });   // the middle of row 1
    GoState s(b);
    CHECK(s.move(4) == Outcome::Moved);
    CHECK(s.player == 4);
    CHECK(s.pieces[0].node == 7);
    CHECK(s.before[0] == 4);
    CHECK(s.nudges == 0);   // sacks don't count
    Board w = grid(3);
    w.pieces.push_back(Piece{ PieceKind::Sack, 4, {} });
    w.pieces.push_back(Piece{ PieceKind::Sack, 7, {} });   // another right behind it: no room
    GoState t(w);
    CHECK(t.move(4) == Outcome::Blocked);
    // a sack in a cart's lane turns the cart back
    Board c = line(6);
    c.pieces.push_back(Piece{ PieceKind::Cart, 3, { 2, 3, 4, 5 } });
    c.pieces.push_back(Piece{ PieceKind::Sack, 4, {} });
    GoState u(c);
    CHECK(u.next_of(u.pieces[0]) == 2);
}

TEST_CASE("the zebu charges down its lane while you're in line, and stops when you leave it") {
    Board b = line(5);
    const int side = b.add(5, 2);
    b.link(1, side);
    Piece bull{ PieceKind::Bull, 4, { 0, 1, 2, 3, 4 } };
    bull.dir = -1;
    b.pieces.push_back(bull);
    GoState s(b);
    CHECK(s.next_of(s.pieces[0]) == 3);
    s.move(side);
    CHECK(s.pieces[0].node == 4);
    s.move(1);
    CHECK(s.pieces[0].node == 3);
    s.move(side);
    s.move(1);
    CHECK(s.pieces[0].node == 2);
    CHECK(s.move(2) == Outcome::Caught);
}

TEST_CASE("stepping stones sink every other turn; landing on a sunken one is caught") {
    Board b = line(5);
    b.nodes[1].sink = 0;   // under water on odd turns
    b.nodes[2].sink = 1;   // under water on even turns
    GoState s(b);
    CHECK_FALSE(b.submerged(1, 0));
    CHECK(b.submerged(1, 1));
    CHECK(s.move(1) == Outcome::Caught);   // you land on turn 1: it's under
    CHECK(s.caught_by == -2);
    Board c = line(5);
    c.nodes[1].sink = 1;   // up on odd turns
    c.nodes[2].sink = 0;   // up on even turns
    GoState t(c);
    CHECK(t.move(1) == Outcome::Moved);
    CHECK(t.move(2) == Outcome::Moved);
}

TEST_CASE("tools: the seal waves a watchman aside, the bell turns them round, beads stop carts, grain the zebu") {
    Board b = line(6);
    b.pieces.push_back(watchman(2, 1));
    GoState s(b, { Tool::Seal, Tool::Bell });
    CHECK(s.use(0) == Outcome::Blocked);   // nobody beside you yet
    s.move(1);
    CHECK(s.caught);                       // in front of him
    GoState t(b, { Tool::Seal });
    Board side = line(6);
    const int beside = side.add(10, 2);
    side.link(beside, 2);
    side.link(0, beside);
    side.pieces.push_back(watchman(2, 1));
    GoState u(side, { Tool::Seal });
    u.move(beside);
    REQUIRE_FALSE(u.caught);
    CHECK(u.use(0) == Outcome::Moved);
    CHECK(u.pieces[0].out);
    CHECK(u.bag.empty());
    CHECK(u.nudges == 0);                  // waved through, not nudged
    // the bell: for two turns the watchman looks the other way
    Board bl = line(6);
    bl.pieces.push_back(watchman(2, 1));
    GoState v(bl, { Tool::Bell });
    CHECK(v.use(0) == Outcome::Moved);
    CHECK(v.bell == 1);
    CHECK(v.threats(v.pieces[0]) == std::vector<int>{ 3 });
    CHECK(v.move(1) == Outcome::Moved);    // safe while he looks away
    // beads: carts wait
    Board c = line(6);
    c.pieces.push_back(Piece{ PieceKind::Cart, 3, { 2, 3, 4 } });
    GoState w(c, { Tool::Beads });
    CHECK(w.use(0) == Outcome::Moved);
    CHECK(w.pieces[0].node == 3);
    CHECK(w.threats(w.pieces[0]).empty());
    // grain: the zebu stops to eat
    Board z = line(5);
    Piece bull{ PieceKind::Bull, 4, { 0, 1, 2, 3, 4 } };
    bull.dir = -1;
    z.pieces.push_back(bull);
    GoState x(z, { Tool::Grain });
    CHECK(x.use(0) == Outcome::Moved);
    CHECK(x.pieces[0].node == 4);
    x.move(1);
    CHECK(x.pieces[0].node == 4);
    CHECK(x.use(0) == Outcome::Blocked);   // nothing left in the bag
}

TEST_CASE("items go in the bag, two at most; a clue always; stars for clearing, every item and par") {
    Board b = line(5);
    b.items = { { 1, Tool::Bell }, { 2, Tool::Beads }, { 3, Tool::None } };
    b.par = 4;
    GoState s(b, { Tool::Seal });
    s.move(1); s.move(2); s.move(3);
    CHECK(s.bag.size() == 2);
    CHECK(s.taken[0]);
    CHECK_FALSE(s.taken[1]);               // no room
    CHECK(s.clue_found());
    CHECK(s.move(4) == Outcome::Won);
    CHECK(s.stars() == 2);                 // cleared, par; missed an item
    GoState t(b);
    t.move(1); t.move(2); t.move(3); t.move(4);
    CHECK(t.stars() == 3);
    t.reset();
    CHECK(t.moves == 0);
    CHECK(t.items_found() == 0);
    CHECK(t.player == b.start);
}
