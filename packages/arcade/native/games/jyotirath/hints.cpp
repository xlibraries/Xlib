#include "hints.h"

#include <algorithm>
#include <deque>

namespace jr {

namespace {

bool mover(PieceKind k) { return k == PieceKind::Cart || k == PieceKind::Villager || k == PieceKind::Bull; }

/** A neighbour of yours that `when` holds for, or -1. */
template <typename F> int neighbour(const GoState& g, F when) {
    for (int n : g.board->adj[g.player]) if (when(n)) return n;
    return -1;
}

bool threatened_by(const GoState& g, int node, bool watchmen) {
    for (const Piece& p : g.pieces) {
        if (p.out || (p.kind == PieceKind::Watchman) != watchmen || (!watchmen && !mover(p.kind))) continue;
        if (g.threatens(p, node)) return true;
    }
    return false;
}

int piece_at(const GoState& g, int node) {
    for (size_t k = 0; k < g.pieces.size(); k++) if (!g.pieces[k].out && g.pieces[k].node == node) return static_cast<int>(k);
    return -1;
}

/** Whether you're in a zebu's lane ahead of it (or one step from it). */
bool in_bull_lane(const GoState& g, int node) {
    for (const Piece& p : g.pieces) {
        if (p.out || p.kind != PieceKind::Bull) continue;
        const auto at = [&](int n) { return static_cast<int>(std::find(p.lane.begin(), p.lane.end(), n) - p.lane.begin()); };
        const int i = at(p.node), j = at(node);
        if (j < static_cast<int>(p.lane.size()) && (j - i) * p.dir > 0) return true;
    }
    return false;
}

int steps_to(const GoState& g, int target) {
    std::vector<int> d(g.board->nodes.size(), -1);
    std::deque<int> q = { g.player };
    d[g.player] = 0;
    while (!q.empty()) {
        const int a = q.front();
        q.pop_front();
        if (a == target) return d[a];
        for (int b : g.board->adj[a]) if (d[b] < 0 && !g.board->nodes[b].pillar) { d[b] = d[a] + 1; q.push_back(b); }
    }
    return 1 << 20;
}

} // namespace

HintCue next_hint(const GoState& g, uint32_t seen) {
    HintCue c;
    if (g.won || g.caught) return c;
    const auto open = [&](Hint h) { return !(seen & hint_bit(h)); };
    const auto cue = [&](Hint h, int node = -1, int slot = -1) { c.hint = h; c.node = node; c.slot = slot; return c; };

    if (open(Hint::Move) && g.moves == 0) return cue(Hint::Move);
    if (open(Hint::Thief)) for (const Piece& p : g.pieces) if (!p.out && p.kind == PieceKind::Thief) return cue(Hint::Thief, p.node);
    if (open(Hint::Danger)) { const int n = neighbour(g, [&](int n) { return threatened_by(g, n, false); }); if (n >= 0) return cue(Hint::Danger, n); }
    if (open(Hint::Gaze)) { const int n = neighbour(g, [&](int n) { return threatened_by(g, n, true); }); if (n >= 0) return cue(Hint::Gaze, n); }

    // a tool that would help right now
    for (size_t k = 0; k < g.bag.size(); k++) {
        const Tool t = g.bag[k];
        GoState trial = g;
        if (trial.use(static_cast<int>(k)) == Outcome::Blocked) continue;
        bool useful = false;
        Hint h = Hint::Count;
        switch (t) {
            case Tool::Seal: h = Hint::Seal; useful = true; break;   // only works with a watchman beside you
            case Tool::Bell: h = Hint::Bell; useful = neighbour(g, [&](int n) { return threatened_by(g, n, true); }) >= 0; break;
            case Tool::Beads: h = Hint::Beads; useful = neighbour(g, [&](int n) { return threatened_by(g, n, false); }) >= 0; break;
            case Tool::Grain: h = Hint::Grain; useful = in_bull_lane(g, g.player) || neighbour(g, [&](int n) { return in_bull_lane(g, n); }) >= 0; break;
            case Tool::None: break;
        }
        if (useful && open(h)) return cue(h, -1, static_cast<int>(k));
    }

    if (open(Hint::Nudge)) {
        const int n = neighbour(g, [&](int n) {
            const int who = piece_at(g, n);
            if (who < 0 || g.pieces[who].kind == PieceKind::Sack || g.pieces[who].kind == PieceKind::Thief) return false;
            GoState trial = g;
            return trial.move(n) == Outcome::Moved && trial.nudges > g.nudges;
        });
        if (n >= 0) return cue(Hint::Nudge, n);
    }
    if (open(Hint::Sack)) {
        const int n = neighbour(g, [&](int n) {
            const int who = piece_at(g, n);
            if (who < 0 || g.pieces[who].kind != PieceKind::Sack) return false;
            GoState trial = g;
            return trial.move(n) != Outcome::Blocked;
        });
        if (n >= 0) return cue(Hint::Sack, n);
    }
    if (open(Hint::Stones)) { const int n = neighbour(g, [&](int n) { return g.board->nodes[n].sink >= 0; }); if (n >= 0) return cue(Hint::Stones, n); }
    if (open(Hint::Bull)) {
        const int n = neighbour(g, [&](int n) { return in_bull_lane(g, n); });
        if (n >= 0) for (const Piece& p : g.pieces) if (!p.out && p.kind == PieceKind::Bull) return cue(Hint::Bull, p.node);
    }
    if (open(Hint::Pillar)) { const int n = neighbour(g, [&](int n) { return g.board->nodes[n].pillar; }); if (n >= 0) return cue(Hint::Pillar, n); }
    if (open(Hint::Exit) && g.board->exit >= 0 && steps_to(g, g.board->exit) <= 3) return cue(Hint::Exit, g.board->exit);
    if (open(Hint::Bag) && !g.bag.empty()) return cue(Hint::Bag, -1, 0);
    return c;
}

std::string hint_text(const HintCue& c) {
    const std::string key = std::to_string(c.slot + 1);
    switch (c.hint) {
        case Hint::Move: return "Move one step at a time: W A S D, or click a glowing node. Everyone else moves after you.";
        case Hint::Thief: return "He runs round the ring to wherever is farthest from you. Push a sack onto the ring to cut him off, then corner him.";
        case Hint::Danger: return "Red arrow: something rolls onto that spot on its next turn. Don't be standing there.";
        case Hint::Gaze: return "Red eye: a watchman can see that spot. Step there and you're caught. Go round him.";
        case Hint::Seal: return "A watchman is right beside you. Press " + key + " to show him the seal: he bows and waves you through, quietly.";
        case Hint::Bell: return "A watchman's eye is next to you. Press " + key + " to ring the bell: the watchmen turn round for two turns.";
        case Hint::Beads: return "A cart is about to roll next to you. Press " + key + " to show the beads: carts and walkers stop for two turns.";
        case Hint::Grain: return "The zebu is in line with you. Press " + key + " to scatter the grain: it stops to eat for three turns.";
        case Hint::Nudge: return "His back is to you. Step into him to push him aside. It works, but nudges are noisy: they change the road ahead.";
        case Hint::Sack: return "Walk into a sack to push it one step. A sack blocks a cart's way and a watchman's view.";
        case Hint::Stones: return "Stepping stones sink every other turn. Step only onto the ones above the water.";
        case Hint::Bull: return "The zebu charges down its lane while you're in it. Cross quickly, or step out and it stops.";
        case Hint::Pillar: return "Pillars block a watchman's view. Keep one between you and him.";
        case Hint::Exit: return "The golden gate is the way out. Fewer moves than par and every item found earn more stars.";
        case Hint::Bag: return "Your bag holds two tools. Press 1 or 2 to use one: each works on someone different.";
        case Hint::Caught: return "Caught! The board starts over. R starts over any time.";
        case Hint::Count: break;
    }
    return "";
}

} // namespace jr
