// JyotiRath, Chapter I's script (from the design doc, "Level 1: Chariots → Checkpoint 1: Mohen-Jo-Daro"): what is
// said at each stop along the road, by whom, and what to do next. Graphics-free.
#pragma once
#include <vector>

namespace jr {

enum class Speaker { Narrator, JyotiRath, Guide };

struct Line { Speaker who; const char* text; };

struct Stop {
    float s;                 // where along the road it happens
    const char* place;       // shown as a title on arrival ("" for none)
    std::vector<Line> lines;
    const char* objective;   // shown once the talking is done
    bool checkpoint;         // you come back here after running out of fuel or falling off
};

/** The chapter's stops, in order; the first plays when you land, the last ends the chapter. */
const std::vector<Stop>& chapter_one();

const char* speaker_name(Speaker s);

} // namespace jr
