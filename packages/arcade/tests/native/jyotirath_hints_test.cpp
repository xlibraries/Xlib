#include "doctest.h"
#include "games/jyotirath/go.h"
#include "games/jyotirath/hints.h"

using namespace jr;

namespace {

/** A line of n nodes along the road, start at 0, exit at the end. */
Board line(int n) {
    Board b;
    for (int i = 0; i < n; i++) b.add(static_cast<float>(i) * 5, 0);
    for (int i = 0; i + 1 < n; i++) b.link(i, i + 1);
    b.exit = n - 1;
    return b;
}

Piece watchman(int node, int facing, int sight = 1) { Piece p{ PieceKind::Watchman, node, {} }; p.facing = facing; p.sight = sight; return p; }

uint32_t all_but(std::initializer_list<Hint> hs) {
    uint32_t m = ~0u;
    for (Hint h : hs) m &= ~hint_bit(h);
    return m;
}

} // namespace

TEST_CASE("the first hint shows how to move, until you've moved") {
    GoState g(chapter_board(0));
    const HintCue c = next_hint(g, 0);
    CHECK(c.hint == Hint::Move);
    CHECK(hint_text(c).find("W A S D") != std::string::npos);
    g.move(g.board->adj[g.player][0]);
    CHECK(next_hint(g, 0).hint != Hint::Move);
    CHECK_FALSE(next_hint(g, ~0u).any());   // all learnt: nothing more to say
}

TEST_CASE("hints come when they're useful: a red arrow beside you, an eye beside you, a back turned to you") {
    Board b = line(6);
    b.pieces.push_back(Piece{ PieceKind::Cart, 3, { 2, 3, 4 } });
    b.pieces[0].dir = -1;   // rolling towards you
    GoState s(b);
    s.moves = 1;
    s.player = 1;
    const HintCue danger = next_hint(s, 0);
    CHECK(danger.hint == Hint::Danger);
    CHECK(danger.node == 2);
    CHECK(next_hint(s, all_but({})).hint == Hint::Count);

    Board w = line(6);
    w.pieces.push_back(watchman(3, 2));
    GoState v(w);
    v.moves = 1;
    v.player = 1;
    const HintCue gaze = next_hint(v, 0);
    CHECK(gaze.hint == Hint::Gaze);
    CHECK(gaze.node == 2);

    Board n = line(6);
    n.pieces.push_back(watchman(2, 3));   // looking away from you
    GoState u(n);
    u.moves = 1;
    u.player = 1;
    const HintCue nudge = next_hint(u, all_but({ Hint::Nudge }));
    CHECK(nudge.hint == Hint::Nudge);
    CHECK(nudge.node == 2);
}

TEST_CASE("a tool's hint comes when it would help, naming its key") {
    Board w = line(6);
    w.pieces.push_back(watchman(3, 2));
    GoState g(w, { Tool::Beads, Tool::Bell });
    g.moves = 1;
    g.player = 1;
    const HintCue c = next_hint(g, all_but({ Hint::Bell, Hint::Beads }));
    CHECK(c.hint == Hint::Bell);   // the beads wouldn't help with a watchman
    CHECK(c.slot == 1);
    CHECK(hint_text(c).find("Press 2") != std::string::npos);
    GoState far(w, { Tool::Bell });
    far.moves = 1;
    CHECK(next_hint(far, all_but({ Hint::Bell })).hint != Hint::Bell);   // nowhere near him yet
}

TEST_CASE("sacks, stones, the exit and the thief each get a hint the first time they matter") {
    Board k = line(6);
    k.pieces.push_back(Piece{ PieceKind::Sack, 2, {} });
    GoState g(k);
    g.moves = 1;
    g.player = 1;
    CHECK(next_hint(g, all_but({ Hint::Sack })).hint == Hint::Sack);
    Board s = line(6);
    s.nodes[2].sink = 0;
    GoState t(s);
    t.moves = 1;
    t.player = 1;
    CHECK(next_hint(t, all_but({ Hint::Stones })).hint == Hint::Stones);
    const Board road = line(6);
    GoState e(road);
    e.moves = 1;
    CHECK_FALSE(next_hint(e, all_but({ Hint::Exit })).any());   // five steps away
    e.player = 3;
    CHECK(next_hint(e, all_but({ Hint::Exit })).hint == Hint::Exit);
    GoState thief(chapter_board(BOARDS - 1));
    thief.moves = 1;
    CHECK(next_hint(thief, all_but({ Hint::Thief })).hint == Hint::Thief);
}
