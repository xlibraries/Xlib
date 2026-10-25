// JyotiRath's hand-holding on the boards: each rule is taught once, at the moment it can be used. The first move
// shows the keys; a red arrow next to you explains carts; an eye explains watchmen; someone with their back to you
// explains nudging; a tool that would help right now explains that tool; and so on. Which hints have been seen is
// a bitmask the game keeps on the device. Graphics-free.
#pragma once
#include "go.h"

#include <cstdint>
#include <string>

namespace jr {

/** Caught is taught by the game itself the first time you're caught (that R starts over). */
enum class Hint : uint8_t { Move, Thief, Danger, Gaze, Seal, Bell, Beads, Grain, Nudge, Sack, Stones, Bull, Pillar, Exit, Bag, Caught, Count };

/** A hint and where it points: a node on the board (-1: none, or every neighbour for Move) or a bag slot. */
struct HintCue {
    Hint hint = Hint::Count;
    int node = -1;
    int slot = -1;
    bool any() const { return hint != Hint::Count; }
};

constexpr uint32_t hint_bit(Hint h) { return 1u << static_cast<int>(h); }

/** The most useful hint for this moment that hasn't been seen (its bit clear in `seen`), or none. */
HintCue next_hint(const GoState& g, uint32_t seen);
/** What the hint says (naming the key for a tool in the bag). */
std::string hint_text(const HintCue& c);

} // namespace jr
