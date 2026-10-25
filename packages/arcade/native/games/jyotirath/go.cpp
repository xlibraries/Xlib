#include "go.h"

#include <algorithm>
#include <cmath>
#include <deque>
#include <set>

namespace jr {

namespace {

int lane_index(const Piece& p, int node) {
    for (size_t i = 0; i < p.lane.size(); i++) if (p.lane[i] == node) return static_cast<int>(i);
    return -1;
}

bool walker(const Piece& p) { return p.kind == PieceKind::Cart || p.kind == PieceKind::Villager; }

} // namespace

// ---------- the board ----------

int Board::add(float s, float lat) {
    nodes.push_back({ s, lat });
    adj.emplace_back();
    return static_cast<int>(nodes.size()) - 1;
}

void Board::link(int a, int b) {
    if (adjacent(a, b)) return;
    adj[a].push_back(b);
    adj[b].push_back(a);
}

bool Board::adjacent(int a, int b) const { return std::find(adj[a].begin(), adj[a].end(), b) != adj[a].end(); }

int Board::straight_on(int from, int node) const {
    float dx = nodes[node].s - nodes[from].s, dz = nodes[node].lat - nodes[from].lat;
    const float l = std::hypot(dx, dz);
    if (l < 1e-5f) return -1;
    dx /= l; dz /= l;
    int best = -1;
    float best_dot = 0.85f;
    for (int n : adj[node]) {
        if (n == from) continue;
        float ex = nodes[n].s - nodes[node].s, ez = nodes[n].lat - nodes[node].lat;
        const float m = std::hypot(ex, ez);
        if (m < 1e-5f) continue;
        const float d = (ex * dx + ez * dz) / m;
        if (d >= best_dot) { best_dot = d; best = n; }
    }
    return best;
}

bool Board::submerged(int node, int turn) const {
    const int k = nodes[node].sink;
    return k >= 0 && ((turn + k) & 1);
}

// ---------- the rules ----------

void GoState::reset() {
    player = from = board->start;
    pieces = board->pieces;
    before.clear();
    for (const Piece& p : pieces) before.push_back(p.node);
    taken.assign(board->items.size(), false);
    bag = start_bag;
    moves = nudges = 0;
    bull_nudged = false;
    bell = beads = grain = 0;
    won = caught = false;
    caught_by = -1;
}

bool GoState::occupied(int node) const {
    for (const Piece& p : pieces) if (!p.out && p.node == node) return true;
    return false;
}

int GoState::next_of(const Piece& p) const {
    if (p.out || p.kind == PieceKind::Sack || p.kind == PieceKind::Watchman) return p.node;
    const int i = lane_index(p, p.node), n = static_cast<int>(p.lane.size());
    if (i < 0 || n < 2) return p.node;
    const auto free = [&](int node) {
        if (board->nodes[node].pillar) return false;
        for (const Piece& q : pieces) if (!q.out && q.kind == PieceKind::Sack && q.node == node) return false;
        return true;
    };
    if (walker(p)) {
        if (beads > 0) return p.node;
        if (p.loop) { const int t = p.lane[((i + p.dir) % n + n) % n]; return free(t) ? t : p.node; }
        for (int d : { p.dir, -p.dir }) {
            if (i + d < 0 || i + d >= n) continue;
            if (free(p.lane[i + d])) return p.lane[i + d];
        }
        return p.node;
    }
    // the bull charges one node a turn towards you while you're in its lane ahead of it
    if (grain > 0) return p.node;
    const int j = lane_index(p, player);
    if (j < 0 || (j - i) * p.dir <= 0 || i + p.dir < 0 || i + p.dir >= n) return p.node;
    return free(p.lane[i + p.dir]) ? p.lane[i + p.dir] : p.node;
}

std::vector<int> GoState::threats(const Piece& p) const {
    std::vector<int> out;
    if (p.out || p.kind == PieceKind::Sack) return out;
    if (p.kind == PieceKind::Watchman) {
        // his sight runs straight from where he faces (or behind him, while the bell rings)
        int prev = p.node, n = bell > 0 ? board->straight_on(p.facing, p.node) : p.facing;
        for (int k = 0; k < p.sight && n >= 0; k++) {
            if (board->nodes[n].pillar) break;
            bool sack = false;
            for (const Piece& q : pieces) if (!q.out && q.kind == PieceKind::Sack && q.node == n) sack = true;
            if (sack) break;
            out.push_back(n);
            const int next = board->straight_on(prev, n);
            prev = n;
            n = next;
        }
        return out;
    }
    if (walker(p)) {
        if (beads > 0) return out;
        const int n = next_of(p);
        if (n != p.node) out.push_back(n);
        return out;
    }
    // a bull threatens the next node down its lane, charging or not
    if (grain > 0) return out;
    const int i = lane_index(p, p.node), n = i + p.dir;
    if (i >= 0 && n >= 0 && n < static_cast<int>(p.lane.size()) && !board->nodes[p.lane[n]].pillar) out.push_back(p.lane[n]);
    return out;
}

bool GoState::threatens(const Piece& p, int node) const {
    const std::vector<int> t = threats(p);
    return std::find(t.begin(), t.end(), node) != t.end();
}

void GoState::pieces_turn() {
    for (size_t k = 0; k < pieces.size(); k++) {
        Piece& p = pieces[k];
        if (p.out || p.kind == PieceKind::Sack || p.kind == PieceKind::Watchman) continue;
        const int n = next_of(p);
        if (walker(p) && !p.loop && n != p.node) {
            const int i = lane_index(p, p.node), j = lane_index(p, n);
            p.dir = j > i ? 1 : -1;
        }
        p.node = n;
        if (p.node == player && !caught) { caught = true; caught_by = static_cast<int>(k); }
    }
    for (size_t k = 0; k < pieces.size() && !caught; k++) {
        const Piece& p = pieces[k];
        if (p.kind == PieceKind::Watchman && threatens(p, player)) { caught = true; caught_by = static_cast<int>(k); }
    }
    if (!caught && board->submerged(player, moves)) { caught = true; caught_by = -2; }
    bell = std::max(0, bell - 1);
    beads = std::max(0, beads - 1);
    grain = std::max(0, grain - 1);
}

Outcome GoState::move(int to) {
    if (won || caught || to < 0 || to >= static_cast<int>(board->nodes.size()) || !board->adjacent(player, to) || board->nodes[to].pillar) return Outcome::Blocked;
    for (size_t k = 0; k < pieces.size(); k++) before[k] = pieces[k].node;
    // a sack in the way slides one node on, if there's room straight ahead of it
    for (Piece& p : pieces) {
        if (p.out || p.kind != PieceKind::Sack || p.node != to) continue;
        const int beyond = board->straight_on(player, to);
        if (beyond < 0 || board->nodes[beyond].pillar || occupied(beyond) || beyond == board->exit) return Outcome::Blocked;
        p.node = beyond;
    }
    // stepping onto someone: from the side or behind you nudge them aside; into the face of one, you're caught
    for (size_t k = 0; k < pieces.size(); k++) {
        Piece& p = pieces[k];
        if (p.out || p.kind == PieceKind::Sack || p.node != to) continue;
        if (threatens(p, player)) { from = player; player = to; moves++; caught = true; caught_by = static_cast<int>(k); return Outcome::Caught; }
        p.out = true;
        nudges++;
        if (p.kind == PieceKind::Bull) bull_nudged = true;
    }
    from = player;
    player = to;
    moves++;
    for (size_t k = 0; k < board->items.size(); k++) {
        if (taken[k] || board->items[k].node != to) continue;
        if (board->items[k].tool == Tool::None) taken[k] = true;   // a clue: always yours
        else if (bag.size() < 2) { bag.push_back(board->items[k].tool); taken[k] = true; }
    }
    if (to == board->exit) { won = true; return Outcome::Won; }
    pieces_turn();
    return caught ? Outcome::Caught : Outcome::Moved;
}

Outcome GoState::use(int slot) {
    if (won || caught || slot < 0 || slot >= static_cast<int>(bag.size())) return Outcome::Blocked;
    const Tool t = bag[slot];
    const auto any = [&](PieceKind k) { for (const Piece& p : pieces) if (!p.out && p.kind == k) return true; return false; };
    switch (t) {
        case Tool::Seal: {   // a watchman beside you waves you through
            int who = -1;
            for (size_t k = 0; k < pieces.size(); k++) if (!pieces[k].out && pieces[k].kind == PieceKind::Watchman && board->adjacent(player, pieces[k].node)) who = static_cast<int>(k);
            if (who < 0) return Outcome::Blocked;
            pieces[who].out = true;
            break;
        }
        case Tool::Bell: if (!any(PieceKind::Watchman)) return Outcome::Blocked; bell = 2; break;
        case Tool::Beads: if (!any(PieceKind::Cart) && !any(PieceKind::Villager)) return Outcome::Blocked; beads = 2; break;
        case Tool::Grain: if (!any(PieceKind::Bull)) return Outcome::Blocked; grain = 3; break;
        case Tool::None: return Outcome::Blocked;
    }
    bag.erase(bag.begin() + slot);
    for (size_t k = 0; k < pieces.size(); k++) before[k] = pieces[k].node;
    from = player;
    moves++;
    pieces_turn();
    return caught ? Outcome::Caught : Outcome::Moved;
}

int GoState::items_found() const { return static_cast<int>(std::count(taken.begin(), taken.end(), true)); }

bool GoState::clue_found() const {
    for (size_t k = 0; k < board->items.size(); k++) if (board->items[k].tool == Tool::None && taken[k]) return true;
    return false;
}

int GoState::stars() const {
    if (!won) return 0;
    return 1 + (items_found() == static_cast<int>(taken.size()) ? 1 : 0) + (board->par > 0 && moves <= board->par ? 1 : 0);
}

// ---------- the solver ----------

namespace {

/** Breadth first over (your node, every piece's node, direction and whether it's out, the stones' phase): the
 *  depth and first move of the shortest win from `start`, moving only (no tools). */
std::pair<int, int> search(const GoState& start) {
    bool sinks = false;
    for (const GoNode& n : start.board->nodes) sinks |= n.sink >= 0;
    const auto key = [&](const GoState& s) {
        std::vector<int> k = { s.player, sinks ? (s.moves & 1) : 0, s.bell, s.beads, s.grain };
        for (const Piece& p : s.pieces) { k.push_back(p.node); k.push_back(p.dir); k.push_back(p.out); }
        return k;
    };
    struct Item { GoState s; int depth, first; };
    std::deque<Item> queue = { { start, 0, -1 } };
    std::set<std::vector<int>> seen = { key(start) };
    while (!queue.empty()) {
        Item it = queue.front();
        queue.pop_front();
        if (it.depth > 120) break;
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
