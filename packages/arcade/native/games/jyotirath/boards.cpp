// Chapter I's boards, laid on the road through each district: rows of nodes along it, in lanes across it; and the
// last, a ring round the Dancing Girl's plinth.
#include "go.h"

#include <cmath>
#include <map>

namespace jr {

namespace {

/** Rows `step` metres apart from s0, in lanes at the given distances across the road. */
struct Grid {
    Board& b;
    float s0, step;
    std::vector<float> lanes;
    std::map<std::pair<int, int>, int> at;

    int n(int row, int lane) {
        const auto key = std::make_pair(row, lane);
        const auto it = at.find(key);
        if (it != at.end()) return it->second;
        return at[key] = b.add(s0 + step * row, lanes[lane]);
    }
    /** A single node per row, down the middle lane, from row a to row b. */
    void line(int a, int bb, int lane) { for (int r = a; r < bb; r++) b.link(n(r, lane), n(r + 1, lane)); }
    /** Every lane from row a to row bb, joined along and across. */
    void grid(int a, int bb, std::vector<int> ls, bool rungs) {
        for (int l : ls) for (int r = a; r < bb; r++) b.link(n(r, l), n(r + 1, l));
        if (rungs) for (int r = a; r <= bb; r++) for (size_t k = 0; k + 1 < ls.size(); k++) b.link(n(r, ls[k]), n(r, ls[k + 1]));
    }
    void rung(int row, int l0, int l1) { b.link(n(row, l0), n(row, l1)); }
    /** Join one node to the first row of a set of lanes (or the last row of them to one node). */
    void fan(int row, int lane, int to_row, std::vector<int> ls) { for (int l : ls) b.link(n(row, lane), n(to_row, l)); }
    std::vector<int> lane(int l, int a, int bb) { std::vector<int> v; for (int r = a; r <= bb; r++) v.push_back(n(r, l)); return v; }
};

Piece watchman(int node, int facing, int sight = 1) { Piece p{ PieceKind::Watchman, node, {} }; p.facing = facing; p.sight = sight; return p; }
Piece cart(std::vector<int> lane, int start, int dir = 1) { Piece p{ PieceKind::Cart, lane[start], lane }; p.dir = dir; return p; }
Piece villager(std::vector<int> loop, int start) { Piece p{ PieceKind::Villager, loop[start], loop }; p.loop = true; return p; }
Piece bull(std::vector<int> lane, int start, int dir) { Piece p{ PieceKind::Bull, lane[start], lane }; p.dir = dir; return p; }
Piece sack(int node) { return Piece{ PieceKind::Sack, node, {} }; }
Piece thief(std::vector<int> ring, int start) { Piece p{ PieceKind::Thief, ring[start], ring }; p.loop = true; return p; }

/** The Lower Town: carts, watchmen and a zebu in narrow lanes. Three lanes: 0 left, 1 middle, 2 right. */
Board lower_town() {
    Board b;
    b.name = "The Lower Town";
    Grid g{ b, 282, 7.5f, { -1.25f, 0, 1.25f }, {} };
    const auto split = [&](int from, int to, std::vector<int> rungs) {
        g.fan(from - 1, 1, from, { 0, 2 });
        g.grid(from, to, { 0, 2 }, false);
        g.fan(to + 1, 1, to, { 0, 2 });
        for (int r : rungs) g.rung(r, 0, 2);
    };
    g.line(0, 2, 1);
    split(3, 7, { 5 });
    g.line(8, 9, 1);
    split(10, 14, { 12 });
    g.line(15, 16, 1);
    split(17, 21, { 19 });
    b.start = g.n(0, 1);
    b.exit = g.n(22, 1);
    b.pieces = {
        cart(g.lane(2, 3, 7), 2),
        watchman(g.n(6, 0), g.n(5, 0)),
        cart({ g.n(12, 0), g.n(12, 2) }, 0),
        watchman(g.n(13, 0), g.n(12, 0)),
        watchman(g.n(15, 1), g.n(16, 1)),
        bull(g.lane(2, 17, 21), 4, -1),
        watchman(g.n(19, 0), g.n(19, 2)),
    };
    b.items = { { g.n(6, 2), Tool::Bell }, { g.n(10, 0), Tool::Seal }, { g.n(18, 2), Tool::Grain }, { g.n(17, 0), Tool::Beads } };
    return b;
}

/** The Granary: a yard of three lanes, two carts, a watchman looking down the middle, sacks to push. */
Board granary() {
    Board b;
    b.name = "The Granary";
    Grid g{ b, 796, 7, { -2.2f, 0, 2.2f }, {} };
    g.line(0, 1, 1);
    g.fan(1, 1, 2, { 0, 1, 2 });
    g.grid(2, 9, { 0, 1, 2 }, true);
    g.fan(10, 1, 9, { 0, 1, 2 });
    g.line(10, 12, 1);
    b.start = g.n(0, 1);
    b.exit = g.n(12, 1);
    b.pieces = {
        watchman(g.n(8, 1), g.n(7, 1), 4),
        cart(g.lane(0, 2, 8), 3),
        cart(g.lane(2, 6, 9), 1, -1),
        watchman(g.n(5, 2), g.n(5, 1), 2),
        sack(g.n(3, 1)),
        sack(g.n(6, 2)),
        sack(g.n(5, 0)),
    };
    b.items = { { g.n(8, 2), Tool::Grain }, { g.n(2, 0), Tool::Seal } };
    return b;
}

/** The Great Bath: a tank of stepping stones that sink every other turn; a watchman at the far steps. */
Board great_bath() {
    Board b;
    b.name = "The Great Bath";
    Grid g{ b, 1176, 6.5f, { -2.0f, 0, 2.0f }, {} };
    g.line(0, 2, 1);
    g.fan(2, 1, 3, { 0, 1, 2 });
    g.grid(3, 9, { 0, 1, 2 }, true);
    const int phase[7][3] = { { 0, 0, 1 }, { 1, -1, 1 }, { 1, 0, 0 }, { 1, -1, 1 }, { 1, -1, 1 }, { 1, 0, 1 }, { 0, -1, -1 } };   // found by search: par 19
    for (int r = 3; r <= 9; r++) for (int l = 0; l < 3; l++) b.nodes[g.n(r, l)].sink = phase[r - 3][l];
    g.fan(10, 0, 9, { 0, 1 });
    g.fan(10, 2, 9, { 1, 2 });
    g.fan(11, 1, 10, { 0, 2 });
    g.line(11, 13, 1);
    b.start = g.n(0, 1);
    b.exit = g.n(13, 1);
    b.pieces = { watchman(g.n(11, 1), g.n(12, 1)) };
    b.items = { { g.n(6, 2), Tool::Bell }, { g.n(8, 0), Tool::Beads } };
    return b;
}

/** The Citadel: long sight lines down the lanes, broken by pillars; priests walking round the stupa; the fragment. */
Board citadel() {
    Board b;
    b.name = "The Citadel";
    Grid g{ b, 1266, 8, { -2.4f, 0, 2.4f }, {} };
    g.line(0, 1, 1);
    g.fan(1, 1, 2, { 0, 1, 2 });
    g.grid(2, 8, { 0, 1, 2 }, true);
    b.nodes[g.n(4, 1)].pillar = true;
    b.nodes[g.n(6, 0)].pillar = true;
    g.fan(9, 1, 8, { 0, 1, 2 });
    g.fan(9, 1, 10, { 0, 1, 2 });
    g.grid(10, 16, { 0, 1, 2 }, true);
    b.nodes[g.n(13, 1)].pillar = true;
    g.fan(17, 1, 16, { 0, 1, 2 });
    g.line(17, 19, 1);
    b.start = g.n(0, 1);
    b.exit = g.n(19, 1);
    b.pieces = {
        watchman(g.n(8, 2), g.n(7, 2), 5),
        watchman(g.n(2, 0), g.n(3, 0), 5),
        cart(g.lane(1, 5, 8), 0),
        villager({ g.n(11, 0), g.n(12, 0), g.n(13, 0), g.n(14, 0), g.n(14, 1), g.n(14, 2), g.n(13, 2), g.n(12, 2), g.n(11, 2), g.n(11, 1) }, 0),
        villager({ g.n(11, 0), g.n(12, 0), g.n(13, 0), g.n(14, 0), g.n(14, 1), g.n(14, 2), g.n(13, 2), g.n(12, 2), g.n(11, 2), g.n(11, 1) }, 5),
        watchman(g.n(16, 1), g.n(15, 1), 2),
    };
    b.items = { { g.n(12, 2), Tool::None }, { g.n(15, 0), Tool::Seal } };
    return b;
}

/** The Upper Town: everything at once. A cart and a walker in the market, a zebu's lane, watchmen, sacks. */
Board upper_town() {
    Board b;
    b.name = "The Upper Town";
    Grid g{ b, 1706, 7.5f, { -2.2f, 0, 2.2f }, {} };
    g.line(0, 1, 1);
    g.fan(1, 1, 2, { 0, 1, 2 });
    g.grid(2, 7, { 0, 1, 2 }, true);
    g.fan(8, 1, 7, { 0, 1, 2 });
    g.fan(8, 1, 9, { 0, 2 });
    g.grid(9, 15, { 0, 2 }, false);
    g.rung(10, 0, 2);
    g.rung(12, 0, 2);
    g.fan(16, 1, 15, { 0, 2 });
    g.fan(16, 1, 17, { 0, 1, 2 });
    g.grid(17, 22, { 0, 1, 2 }, true);
    g.fan(23, 1, 22, { 0, 1, 2 });
    b.start = g.n(0, 1);
    b.exit = g.n(23, 1);
    b.pieces = {
        cart(g.lane(0, 2, 7), 1),
        villager({ g.n(3, 1), g.n(3, 2), g.n(4, 2), g.n(5, 2), g.n(5, 1), g.n(4, 1) }, 0),
        watchman(g.n(7, 1), g.n(6, 1), 3),
        sack(g.n(5, 0)),
        bull(g.lane(2, 9, 15), 6, -1),
        watchman(g.n(12, 0), g.n(11, 0), 2),
        sack(g.n(13, 2)),
        watchman(g.n(19, 0), g.n(19, 1), 3),
        watchman(g.n(21, 2), g.n(20, 2), 3),
        villager({ g.n(18, 1), g.n(19, 1), g.n(19, 2), g.n(18, 2) }, 2),
        sack(g.n(17, 2)),
    };
    b.items = { { g.n(4, 0), Tool::Beads }, { g.n(14, 2), Tool::Seal }, { g.n(20, 0), Tool::Bell } };
    return b;
}

/** The Bronze Thief: a ring of twelve nodes round the Dancing Girl's plinth, an outer walk round that, spokes between
 *  them, a path in from the road. He runs round the inner ring away from you: push a sack onto it to cut him off,
 *  then corner him. */
Board bronze_thief() {
    Board b;
    b.name = "The Bronze Thief";
    const float c = at::DANCING_GIRL, PI = 3.14159265f;
    constexpr int N = 10;
    // k counts round from the side facing the road (k = 0), towards the right of the way in
    const auto polar = [&](float r, float k) { const float a = k * 2 * PI / N; return b.add(c - r * std::cos(a), r * std::sin(a)); };
    std::vector<int> ring, outer(N, -1), spoke(N, -1);
    for (int k = 0; k < N; k++) ring.push_back(polar(7.5f, static_cast<float>(k)));
    for (int k = 0; k < N; k++) b.link(ring[k], ring[(k + 1) % N]);
    for (int k = 1; k < N; k++) outer[k] = polar(13.5f, static_cast<float>(k));
    for (int k = 1; k + 1 < N; k++) b.link(outer[k], outer[k + 1]);
    // the way in from the road, splitting to the ring and both ends of the outer walk
    const int e0 = polar(21, 0), e1 = polar(16.5f, 0), e2 = polar(11.5f, 0);
    b.link(e0, e1); b.link(e1, e2); b.link(e2, ring[0]);
    b.link(e1, outer[1]); b.link(e1, outer[N - 1]);
    // spokes from the ring out to the walk, a node between
    for (int k : { 3, 5, 7 }) { spoke[k] = polar(10.5f, static_cast<float>(k)); b.link(ring[k], spoke[k]); b.link(spoke[k], outer[k]); }
    b.start = e0;
    b.exit = -1;
    // his lookouts watch the spots you'd push the sacks from
    b.pieces = {
        thief(ring, 5),
        sack(spoke[3]),
        sack(spoke[7]),
        watchman(outer[4], outer[3], 2),
        watchman(outer[6], outer[7], 2),
    };
    b.items = { { outer[5], Tool::Beads }, { outer[2], Tool::Bell } };
    return b;
}

} // namespace

const Board& chapter_board(int i) {
    static std::vector<Board> boards;
    if (boards.empty()) {
        boards = { lower_town(), granary(), great_bath(), citadel(), upper_town(), bronze_thief() };
        for (Board& b : boards) b.par = solve(b);
    }
    return boards[i];
}

} // namespace jr
