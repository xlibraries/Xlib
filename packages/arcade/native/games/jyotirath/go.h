// JyotiRath, Board mode: the Lower Town as a turn-based board, in the style of Hitman GO. The road and its lanes
// become nodes and lines; JyotiRath hops one node a turn, then everything else takes a step: handcarts roll up and
// down their lanes, watchmen look one way, a zebu bull charges down its lane when you're in line with it. Step onto
// one from the side or behind and you nudge it out of the way; be where one is about to go, or in front of a
// watchman, and you're caught (the board resets). Reach the far end to clear it. Graphics-free; a solver finds par.
#pragma once
#include "track.h"

#include <vector>

namespace jr {

struct GoNode { float s, lat; };   // where it sits on the road

enum class PieceKind { Cart, Watchman, Bull };

struct Piece {
    PieceKind kind;
    int node;
    std::vector<int> lane;   // a cart's or bull's track, in order; a cart rolls back and forth along it
    int dir = 1;             // which way along the lane it's heading (+1 up the list, -1 down)
    int facing = -1;         // a watchman's: the node he looks at
    bool out = false;        // nudged aside
};

struct Board {
    std::vector<GoNode> nodes;
    std::vector<std::vector<int>> adj;
    int start = 0, exit = 0;
    std::vector<int> artifacts;   // nodes with an artifact on them
    std::vector<Piece> pieces;
    int par = 0;                  // the fewest moves to clear it (from the solver)
    void link(int a, int b);
    bool adjacent(int a, int b) const;
};

/** The Lower Town's board, laid on the road between its lanes. */
Board lower_town_board();

enum class Outcome { Moved, Blocked, Caught, Won };

struct GoState {
    const Board* board = nullptr;
    int player = 0, from = 0;          // where JyotiRath is, and was before the last move
    std::vector<Piece> pieces;
    std::vector<int> before;           // each piece's node before the last turn (for animation)
    std::vector<bool> taken;           // artifacts collected
    int moves = 0;
    bool won = false, caught = false;
    int caught_by = -1;

    explicit GoState(const Board& b) : board(&b) { reset(); }
    void reset();
    /** Your move to a neighbouring node, then everyone else's. */
    Outcome move(int to);
    /** Where a piece will step on its next turn (its own node if it stays). */
    int next_of(const Piece& p) const;
    /** The node a piece is watching (a watchman's gaze, a cart's or bull's next step), or -1. */
    int threat_of(const Piece& p) const;
    int artifacts() const;
    /** 1 for clearing it, +1 for every artifact, +1 for par or better. */
    int stars() const;
};

/** The fewest moves that clear the board (ignoring artifacts), or -1 if it can't be done. */
int solve(const Board& b);
/** The first move of a shortest way to clear the board from here, or -1. */
int best_move(const GoState& s);

} // namespace jr
