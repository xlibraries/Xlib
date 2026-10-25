// JyotiRath, Chapter I's words (from the design doc's script for "Checkpoint 1: Mohen-Jo-Daro"): what's said as each
// beat begins (the canal road's depends on how you solved the Lower Town), as each district comes back to life, and
// at the end (which depends on whether you found the fragment). Between beats, the people of the city: someone at
// each district's edge stops the chariot before its board, and someone sends you off on each drive (a potter with a
// shortcut, a bell-ringer, the zebu you annoyed, a lamplighter). Graphics-free.
#pragma once
#include "chapter.h"

#include <vector>

namespace jr {

enum class Speaker { Narrator, JyotiRath, Guide, Local };

/** A line; a Local says who they are. */
struct Line { Speaker who; const char* text; const char* name = nullptr; };

const char* speaker_name(const Line& l);

/** Who stands by the road in a scene between beats (drawn beside it, the speech bubble over them). */
enum class Figure { None, Villager, Watchman, Zebu, Thief };

/** What's said as the chariot rolls up to a board (before its lanes light up), and who says it. */
const std::vector<Line>& arrival_lines(int board);
Figure arrival_figure(int board);
/** Who sends you off on the chapter's current drive (its words are beat_intro). */
Figure departure_figure(const Chapter& c);

/** What's said as a beat begins. */
const std::vector<Line>& beat_intro(const Chapter& c);
/** As a district's board is cleared and it comes back to life. */
const std::vector<Line>& board_outro(int board);
/** A grateful local's gift after a quiet solve. */
const std::vector<Line>& gift_lines(Tool gift);
/** Why a drive failed. */
const char* fail_text(Fail f);
/** What a drive asks of you, in a few words. */
const char* goal_text(const RunSpec& r);

} // namespace jr
