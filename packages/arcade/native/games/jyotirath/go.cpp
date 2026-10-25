#include "go.h"

#include <algorithm>
#include <deque>
#include <map>
#include <set>

namespace jr {

namespace {

int lane_index(const Piece& p, int node) {
    for (size_t i = 0; i < p.lane.size(); i++) if (p.lane[i] == node) return static_cast<int>(i);
    return -1;
}

} // namespace

void Board::link(int a, int b) {
    adj[a].push_back(b);
    adj[b].push_back(a);
}

bool Board::adjacent(int a, int b) const { return std::find(adj[a].begin(), adj[a].end(), b) != adj[a].end(); }

Board lower_town_board() {
    Board b;
    // rows every 7.5 m along the road through the Lower Town; a row has one node in the middle of the road, or
    // two lanes either side of it where the road splits round something
    std::map<std::pair<int, int>, int> at;   // (row, lane -1/0/+1) -> node
    const auto node = [&](int row, int lane) {
        const auto key = std::make_pair(row, lane);
        if (!at.count(key)) {
            at[key] = static_cast<int>(b.nodes.size());
            b.nodes.push_back({ 282 + 7.5f * row, lane * 1.25f });
            b.adj.emplace_back();
        }
        return at[key];
    };
    const auto single = [&](int from, int to) { for (int r = from; r < to; r++) b.link(node(r, 0), node(r + 1, 0)); };
    /** Two lanes from row `from` to `to`, split from the single node before and joining the one after. */
    const auto split = [&](int from, int to, std::vector<int> rungs) {
        for (int lane : { -1, 1 }) {
            b.link(node(from - 1, 0), node(from, lane));
            for (int r = from; r < to; r++) b.link(node(r, lane), node(r + 1, lane));
            b.link(node(to, lane), node(to + 1, 0));
        }
        for (int r : rungs) b.link(node(r, -1), node(r, 1));
    };
    single(0, 2);
    split(3, 7, { 5 });
    single(8, 9);
    split(10, 14, { 12 });
    single(15, 16);
    split(17, 21, { 19 });
    b.start = node(0, 0);
    b.exit = node(22, 0);

    const auto lane = [&](int lane_, int from, int to) { std::vector<int> l; for (int r = from; r <= to; r++) l.push_back(node(r, lane_)); return l; };
    // a handcart up and down the right lane; a watchman guarding the left
    { Piece p{ PieceKind::Cart, node(5, 1), lane(1, 3, 7) }; b.pieces.push_back(p); }
    { Piece p{ PieceKind::Watchman, node(6, -1), {} }; p.facing = node(5, -1); b.pieces.push_back(p); }
    // a cart rolling across the road between the lanes; a watchman looking back down the left lane; another
    // guarding the way on, facing forwards
    { Piece p{ PieceKind::Cart, node(12, -1), { node(12, -1), node(12, 1) } }; b.pieces.push_back(p); }
    { Piece p{ PieceKind::Watchman, node(13, -1), {} }; p.facing = node(12, -1); b.pieces.push_back(p); }
    { Piece p{ PieceKind::Watchman, node(15, 0), {} }; p.facing = node(16, 0); b.pieces.push_back(p); }
    // the zebu at the top of the right lane, ready to charge down it; a watchman across the rung on the left
    { Piece p{ PieceKind::Bull, node(21, 1), lane(1, 17, 21) }; p.dir = -1; b.pieces.push_back(p); }
    { Piece p{ PieceKind::Watchman, node(19, -1), {} }; p.facing = node(19, 1); b.pieces.push_back(p); }

    b.artifacts = { node(6, 1), node(10, -1), node(18, 1), node(17, -1) };
    b.par = solve(b);
    return b;
}

void GoState::reset() {
    player = from = board->start;
    pieces = board->pieces;
    before.clear();
    for (const Piece& p : pieces) before.push_back(p.node);
    taken.assign(board->artifacts.size(), false);
    moves = 0;
    won = caught = false;
    caught_by = -1;
}

int GoState::next_of(const Piece& p) const {
    if (p.out) return p.node;
    const int i = lane_index(p, p.node);
    switch (p.kind) {
        case PieceKind::Watchman: return p.node;
        case PieceKind::Cart: {
            if (i < 0 || p.lane.size() < 2) return p.node;
            int d = p.dir;
            if (i + d < 0 || i + d >= static_cast<int>(p.lane.size())) d = -d;
            return p.lane[i + d];
        }
        case PieceKind::Bull: {
            // charges one node a turn towards you while you're in its lane, ahead of it
            const int j = lane_index(p, player);
            if (i < 0 || j < 0 || (j - i) * p.dir <= 0) return p.node;
            return p.lane[i + p.dir];
        }
    }
    return p.node;
}

int GoState::threat_of(const Piece& p) const {
    if (p.out) return -1;
    if (p.kind == PieceKind::Watchman) return p.facing;
    if (p.kind == PieceKind::Bull) {   // a bull threatens the next node down its lane, charging or not
        const int i = lane_index(p, p.node);
        const int n = i + p.dir;
        return n >= 0 && n < static_cast<int>(p.lane.size()) ? p.lane[n] : -1;
    }
    const int n = next_of(p);
    return n == p.node ? -1 : n;
}

Outcome GoState::move(int to) {
    if (won || caught || to < 0 || to >= static_cast<int>(board->nodes.size()) || !board->adjacent(player, to)) return Outcome::Blocked;
    // stepping onto someone: from the side or behind you nudge them aside; into the face of one, you're caught
    for (size_t k = 0; k < pieces.size(); k++) {
        Piece& p = pieces[k];
        if (p.out || p.node != to) continue;
        if (threat_of(p) == player) { from = player; player = to; moves++; caught = true; caught_by = static_cast<int>(k); return Outcome::Caught; }
        p.out = true;
    }
    from = player;
    player = to;
    moves++;
    for (size_t k = 0; k < board->artifacts.size(); k++) if (board->artifacts[k] == to) taken[k] = true;
    for (size_t k = 0; k < pieces.size(); k++) before[k] = pieces[k].node;
    if (to == board->exit) { won = true; return Outcome::Won; }

    // everyone else's turn
    for (size_t k = 0; k < pieces.size(); k++) {
        Piece& p = pieces[k];
        if (p.out) continue;
        const int n = next_of(p);
        if (p.kind == PieceKind::Cart && n != p.node) {
            const int i = lane_index(p, p.node), j = lane_index(p, n);
            p.dir = j > i ? 1 : -1;
        }
        p.node = n;
        if (p.node == player) { caught = true; caught_by = static_cast<int>(k); }
    }
    for (size_t k = 0; k < pieces.size() && !caught; k++) {
        const Piece& p = pieces[k];
        if (!p.out && p.kind == PieceKind::Watchman && p.facing == player) { caught = true; caught_by = static_cast<int>(k); }
    }
    return caught ? Outcome::Caught : Outcome::Moved;
}

int GoState::artifacts() const { return static_cast<int>(std::count(taken.begin(), taken.end(), true)); }

int GoState::stars() const {
    if (!won) return 0;
    return 1 + (artifacts() == static_cast<int>(taken.size()) ? 1 : 0) + (board->par > 0 && moves <= board->par ? 1 : 0);
}

namespace {

/** Breadth first over (your node, every piece's node, direction and whether it's out): the depth and first move of
 *  the shortest win from `start`. */
std::pair<int, int> search(const GoState& start) {
    const auto key = [](const GoState& s) {
        std::vector<int> k = { s.player };
        for (const Piece& p : s.pieces) { k.push_back(p.node); k.push_back(p.dir); k.push_back(p.out); }
        return k;
    };
    struct Item { GoState s; int depth, first; };
    std::deque<Item> queue = { { start, 0, -1 } };
    std::set<std::vector<int>> seen = { key(start) };
    while (!queue.empty()) {
        Item it = queue.front();
        queue.pop_front();
        if (it.depth > 80) break;
        for (int to : it.s.board->adj[it.s.player]) {
            GoState next = it.s;
            const Outcome o = next.move(to);
            const int first = it.first < 0 ? to : it.first;
            if (o == Outcome::Won) return { it.depth + 1, first };
            if (o != Outcome::Moved) continue;
            if (seen.insert(key(next)).second) queue.push_back({ next, it.depth + 1, first });
        }
    }
    return { -1, -1 };
}

} // namespace

int solve(const Board& b) { return search(GoState(b)).first; }

int best_move(const GoState& s) { return s.won || s.caught ? -1 : search(s).second; }

} // namespace jr
