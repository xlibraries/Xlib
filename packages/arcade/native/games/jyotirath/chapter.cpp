#include "chapter.h"

#include <algorithm>
#include <cstdio>
#include <cstdlib>

namespace jr {

const std::vector<Beat>& chapter_beats() {
    static const std::vector<Beat> beats = {
        { BeatKind::Drive, 0, "The desert road" },
        { BeatKind::Board, 0, "The Lower Town" },
        { BeatKind::Drive, 1, "The canal road" },
        { BeatKind::Board, 1, "The Granary" },
        { BeatKind::Drive, 2, "The grain road" },
        { BeatKind::Board, 2, "The Great Bath" },
        { BeatKind::Board, 3, "The Citadel" },
        { BeatKind::Drive, 3, "The climb" },
        { BeatKind::Board, 4, "The Upper Town" },
        { BeatKind::Drive, 4, "The lamp road" },
        { BeatKind::Board, 5, "The Bronze Thief" },
        { BeatKind::Finale, 0, "The Dancing Girl" },
    };
    return beats;
}

Style style_of(const GoState& g) {
    if (g.bull_nudged || g.nudges >= 2) return Style::Rough;
    if (g.nudges == 0) return Style::Quiet;
    if (g.board->par > 0 && g.moves > g.board->par + 8) return Style::Slow;
    return Style::Steady;
}

namespace {
float board_start(int b) { const Board& x = chapter_board(b); return x.nodes[x.start].s; }
float board_end(int b) {
    const Board& x = chapter_board(b);
    if (x.exit >= 0) return x.nodes[x.exit].s;
    float s = 0;
    for (const GoNode& n : x.nodes) s = std::max(s, n.s);
    return s;
}
} // namespace

RunSpec Chapter::run_spec(int run) const {
    RunSpec r;
    // each drive runs from just past the board before it to just short of the next
    const int before[] = { -1, 0, 1, 3, 4 }, after[] = { 0, 1, 2, 4, 5 };
    if (run >= 0 && run < 5) {
        if (before[run] >= 0) { r.from = board_end(before[run]) + ROLL_OUT; r.speed = 7; }
        r.to = board_start(after[run]) - ROLL_IN;
    }
    switch (run) {
        case 0: r.goal = Goal::Reach; r.from = 4; r.landing = true; break;
        case 1:
            // the Lower Town's way of being solved picks the canal road's challenge
            switch (lower_town) {
                case Style::Quiet: r.goal = Goal::Reach; r.shortcut = true; break;
                case Style::Rough: r.goal = Goal::Chase; break;
                case Style::Slow: r.goal = Goal::Clock; r.time = 29; break;
                case Style::Steady: r.goal = Goal::Clock; r.time = 34; break;
            }
            break;
        case 2: r.goal = Goal::Deliver; r.cargo = 6; break;
        case 3: r.goal = Goal::Storm; break;
        default: r.goal = Goal::Lamps; r.time = 9; break;
    }
    return r;
}

Tool Chapter::board_cleared(int board, const GoState& g) {
    if (board >= 0 && board < DISTRICTS) restored[board] = true;
    bag = g.bag;
    fragment |= g.clue_found();
    last = style_of(g);
    if (board == 0) lower_town = last;
    if (board >= 0 && board < BOARDS) stars[board] = std::max(stars[board], g.stars());
    beat++;
    // a quiet solve earns a gift from someone grateful (the Lower Town's is the shortcut instead; after the thief
    // there's nothing left to need one for)
    if (last == Style::Quiet && board != 0 && board < DISTRICTS && bag.size() < 2) {
        const Tool gift = board == 1 ? Tool::Beads : board == 2 ? Tool::Bell : Tool::Seal;
        bag.push_back(gift);
        return gift;
    }
    return Tool::None;
}

void Chapter::run_done(const Run& r) {
    bag = r.bag;
    if (r.spec.goal == Goal::Lamps) lamps = r.lamps;
    if (r.spec.goal == Goal::Deliver) {
        delivered = r.cargo;
        if (delivered >= 4 && bag.size() < 2) bag.push_back(Tool::Grain);   // the bath keepers send some back with you
    }
    beat++;
}

std::string Chapter::save() const {
    // 2;beat;bag;restored;fragment;last;lower;stars;delivered;lamps
    std::string b, rs, st;
    for (Tool t : bag) b += static_cast<char>('0' + static_cast<int>(t));
    for (bool r : restored) rs += r ? '1' : '0';
    for (int s : stars) st += static_cast<char>('0' + s);
    char buf[128];
    std::snprintf(buf, sizeof buf, "2;%d;%s;%s;%d;%d;%d;%s;%d;%d", beat, b.c_str(), rs.c_str(), fragment ? 1 : 0, static_cast<int>(last), static_cast<int>(lower_town), st.c_str(), delivered, lamps);
    return buf;
}

Chapter Chapter::load(const std::string& s) {
    Chapter c;
    std::vector<std::string> f;
    std::string cur;
    for (char ch : s) { if (ch == ';') { f.push_back(cur); cur.clear(); } else cur += ch; }
    f.push_back(cur);
    if (f.size() < 9 || (f[0] != "1" && f[0] != "2")) return c;
    const int beats = static_cast<int>(chapter_beats().size());
    c.beat = std::max(0, std::min(beats - 1, std::atoi(f[1].c_str())));
    if (f[0] == "1" && c.beat == 9) c.beat = beats - 1;   // the first version's finale (before the lamp road)
    for (char ch : f[2]) { const int t = ch - '0'; if (t >= 1 && t <= 4 && c.bag.size() < 2) c.bag.push_back(static_cast<Tool>(t)); }
    for (size_t i = 0; i < f[3].size() && i < static_cast<size_t>(DISTRICTS); i++) c.restored[i] = f[3][i] == '1';
    c.fragment = f[4] == "1";
    c.last = static_cast<Style>(std::max(0, std::min(3, std::atoi(f[5].c_str()))));
    c.lower_town = static_cast<Style>(std::max(0, std::min(3, std::atoi(f[6].c_str()))));
    for (size_t i = 0; i < f[7].size() && i < static_cast<size_t>(BOARDS); i++) c.stars[i] = std::max(0, std::min(3, f[7][i] - '0'));
    c.delivered = std::max(0, std::atoi(f[8].c_str()));
    if (f.size() > 9) c.lamps = std::max(0, std::atoi(f[9].c_str()));
    return c;
}

const char* tool_name(Tool t) {
    switch (t) {
        case Tool::Seal: return "Seal";
        case Tool::Grain: return "Grain";
        case Tool::Bell: return "Bell";
        case Tool::Beads: return "Beads";
        case Tool::None: return "";
    }
    return "";
}

const char* goal_name(Goal g) {
    switch (g) {
        case Goal::Reach: return "Reach";
        case Goal::Chase: return "Chase";
        case Goal::Clock: return "Clock";
        case Goal::Deliver: return "Deliver";
        case Goal::Storm: return "Storm";
        case Goal::Lamps: return "Lamps";
    }
    return "";
}

} // namespace jr
