// How JyotiRath feels and how the picture reacts: the face's expression, squash-and-stretch on landings and
// take-offs, screen shake and the Turbo glow. Pure functions of the run, so tests can check them; art.h draws them.
#pragma once
#include "physics.h"
#include "rules.h"

namespace tt {

/** A face, Pixar-style: every value eases toward its target so expressions flow rather than snap. */
struct Mood {
    float eyes = 1;        // 0 shut … 1 open … 1.5 wide
    float smile = 0.3f;    // -1 grimace … 1 grin
    float brow = 0;        // -1 furrowed (determined/angry) … 1 raised (surprised)
    float mouth_open = 0;  // 0 closed … 1 "whoa"
    float look_x = 0.4f;   // where the pupils point, -1 back … 1 ahead
    float look_y = 0;      // -1 down … 1 up
    bool dizzy = false;    // crossed-out eyes after a crash
};

struct Feel {
    Mood mood;             // the current, eased expression
    float squash = 1;      // vertical scale of the body (horizontal is 1/squash)
    float squash_v = 0;
    float shake = 0;       // 0..1 screen shake strength
    float boost_glow = 0;  // 0..1 flame/speed-line strength (eases in and out)
    float blink = 0;       // 0 = eyes as the mood says; >0 = mid-blink (seconds left)
    float until_blink = 3; // seconds until the next blink
    float impact_timer = 0;
    int blinks = 0;
};

/** The expression the situation calls for (what the eased mood heads toward). */
Mood target_mood(const Run& run, const Pose& pose, bool grounded, float speed, float time);
/** Advances the feel by dt: eases the mood, blinks, springs the squash, decays the shake. */
void update_feel(Feel& f, const Run& run, const Pose& pose, bool grounded, float impact, float dt, float time);

} // namespace tt
