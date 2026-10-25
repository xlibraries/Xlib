// JyotiRath, Chapter I's shape: ten beats, drives between boards. The chapter carries your bag of tools from beat to
// beat, remembers how you solved each board (quietly, roughly, slowly) and lets that choose the next drive: quiet
// earns the canal road's shortcut, rough sets the zebu after you, slow puts you against the Granary's clock. Clearing
// a board restores its district. Saved on the device as a short string. Graphics-free.
#pragma once
#include "drive.h"
#include "go.h"

#include <string>
#include <vector>

namespace jr {

enum class BeatKind { Drive, Board, Finale };
struct Beat { BeatKind kind; int index; const char* title; };   // index: the drive's or the board's

/** The chapter, in order: drive, board, drive, board, drive, board, board, drive, board, finale. */
const std::vector<Beat>& chapter_beats();

/** How a board was solved: nobody nudged, the zebu or several people nudged, well over par, or none of those. */
enum class Style { Steady, Quiet, Rough, Slow };
Style style_of(const GoState& g);

struct Chapter {
    int beat = 0;
    std::vector<Tool> bag;
    bool restored[DISTRICTS] = {};
    bool fragment = false;            // the clue that points to Ajanta
    Style last = Style::Steady;       // how the last board was solved
    Style lower_town = Style::Steady; // the Lower Town's (it picks the canal road's challenge)
    int stars[BOARDS] = {};
    int delivered = 0;                // sacks of grain that reached the Great Bath

    const Beat& current() const { return chapter_beats()[beat]; }
    /** The drive for a drive beat, shaped by what came before. */
    RunSpec run_spec(int run) const;
    /** A board was cleared: restore its district, keep the bag and the clue, note the style, move on. Returns
     *  the gift a quiet solve earns (or Tool::None). */
    Tool board_cleared(int board, const GoState& g);
    /** A drive was finished: keep the bag, count the grain, move on. */
    void run_done(const Run& r);
    bool complete() const { return beat >= static_cast<int>(chapter_beats().size()) - 1; }

    std::string save() const;
    static Chapter load(const std::string& s);
};

const char* tool_name(Tool t);
const char* goal_name(Goal g);

} // namespace jr
