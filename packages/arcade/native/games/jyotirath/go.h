// JyotiRath's boards: the districts as turn-based boards, in the style of Hitman GO. The road and its lanes become
// nodes and lines; JyotiRath hops one node a turn, then everything else takes a step:
//  - handcarts roll back and forth along their lanes, villagers walk their loops;
//  - watchmen look one way, as far as their sight reaches (pillars and sacks block it);
//  - a zebu bull charges down its lane while you're in line with it;
//  - sacks can be pushed one node along a straight line, to block a lane or a sight line;
//  - stepping stones in the Great Bath sink every other turn;
//  - the Bronze Thief runs round his ring, always to the spot on it farthest from you: corner him and step onto him.
// Step onto someone from the side or behind and you nudge them aside; be where one is about to go, in front of a
// watchman or on a sunken stone, and you're caught (the board starts over). Tools you carry change a turn: the seal
// (a watchman beside you waves you through), the bell (watchmen turn round), beads (carts and villagers wait), grain
// (the zebu stops to eat). Most boards are cleared by reaching the exit; the last has none: catch the thief.
// Graphics-free; a solver finds par.
#pragma once
#include "track.h"

#include <vector>

namespace jr {

struct GoNode {
    float s, lat;          // where it sits on the road
    bool pillar = false;   // a pillar: nobody stands here, and it blocks sight
    int sink = -1;         // a stepping stone: under water on turns where (turn + sink) is odd; -1 for solid ground
};

enum class PieceKind { Cart, Watchman, Bull, Sack, Villager, Thief };

struct Piece {
    PieceKind kind;
    int node;
    std::vector<int> lane;   // a cart's, villager's, bull's or the thief's track, in order
    int dir = 1;             // which way along the lane it's heading (+1 up the list, -1 down)
    int facing = -1;         // a watchman's: the node he looks at
    int sight = 1;           // how many nodes a watchman sees
    bool loop = false;       // a villager walks its lane round and round
    bool out = false;        // nudged aside (or waved you through)
};

struct BoardItem { int node; Tool tool; };   // Tool::None marks a clue (the Buddhist fragment)

struct Board {
    const char* name = "";
    std::vector<GoNode> nodes;
    std::vector<std::vector<int>> adj;
    int start = 0, exit = 0;      // exit -1: there's a thief to catch instead
    std::vector<BoardItem> items;
    std::vector<Piece> pieces;
    int par = 0;                  // the fewest moves to clear it without tools (from the solver)
    int add(float s, float lat);
    void link(int a, int b);
    bool adjacent(int a, int b) const;
    /** The neighbour of `node` that carries on most straight from `from` (dot ≥ 0.85), or -1. */
    int straight_on(int from, int node) const;
    bool submerged(int node, int turn) const;
};

enum class Outcome { Moved, Blocked, Caught, Won };

struct GoState {
    const Board* board = nullptr;
    int player = 0, from = 0;          // where JyotiRath is, and was before the last move
    std::vector<Piece> pieces;
    std::vector<int> before;           // each piece's node before the last turn (for animation)
    std::vector<bool> taken;           // items collected
    std::vector<Tool> bag;             // what you carry (two at most)
    int moves = 0;
    int nudges = 0;                    // people and animals nudged aside (not sacks, not those who waved you through)
    bool bull_nudged = false;
    int bell = 0, beads = 0, grain = 0;   // turns left on each tool's effect
    bool won = false, caught = false;
    int caught_by = -1;                // a piece, or -2 for sinking

    explicit GoState(const Board& b, std::vector<Tool> carried = {}) : board(&b), start_bag(std::move(carried)) { reset(); }
    void reset();
    /** Your move to a neighbouring node, then everyone else's. */
    Outcome move(int to);
    /** Use the tool in a bag slot: it takes your turn. Blocked (and kept) if it would do nothing. */
    Outcome use(int slot);
    /** Where a piece will step on its next turn (its own node if it stays). */
    int next_of(const Piece& p) const;
    /** The nodes a piece threatens: a watchman's sight line, a cart's or bull's next step (the thief threatens nobody). */
    std::vector<int> threats(const Piece& p) const;
    bool threatens(const Piece& p, int node) const;
    int items_found() const;
    bool clue_found() const;
    /** 1 for clearing it, +1 for every item, +1 for par or better. */
    int stars() const;

private:
    std::vector<Tool> start_bag;
    bool occupied(int node) const;
    void pieces_turn();
};

/** The fewest moves that clear a board without tools, or -1 if it can't be done. */
int solve(const Board& b);
/** The first move of a shortest way to clear the board from here (without tools), or -1. */
int best_move(const GoState& s);

/** Chapter I's boards: 0 the Lower Town, 1 the Granary, 2 the Great Bath, 3 the Citadel, 4 the Upper Town, and 5
 *  the Bronze Thief in the Dancing Girl's plaza. */
constexpr int BOARDS = 6;
const Board& chapter_board(int i);

} // namespace jr
