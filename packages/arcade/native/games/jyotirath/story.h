// JyotiRath, Chapter I's words (from the design doc's script for "Checkpoint 1: Mohen-Jo-Daro"): what's said as each
// beat begins (the canal road's depends on how you solved the Lower Town), as each district comes back to life, and
// at the end (which depends on whether you found the fragment). Graphics-free.
#pragma once
#include "chapter.h"

#include <vector>

namespace jr {

enum class Speaker { Narrator, JyotiRath, Guide };

struct Line { Speaker who; const char* text; };

const char* speaker_name(Speaker s);

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
