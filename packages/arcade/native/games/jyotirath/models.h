// JyotiRath: every model, built from mesh.h's primitives. The chariot faces +X with +Y up and +Z on its right;
// its origin is on the ground between the wheels. Moving parts (wheels, eyes, lids) are separate meshes so main.cpp
// can turn them; so are the things that move about the road (artifacts, pots, handcarts, tumbleweeds, the Guide).
// The land is built in chunks along the road so only what's near the camera is drawn. Graphics-free.
#pragma once
#include "go.h"
#include "mesh.h"
#include "track.h"

namespace jr {

constexpr float WHEEL_RADIUS = 0.62f;
constexpr V3 WHEEL_AT{ -0.08f, WHEEL_RADIUS, 0.74f };   // the right wheel's centre (the left is mirrored in z)
constexpr V3 EYE_AT{ 0.22f, 1.80f, 0.104f };             // the right eye's centre (the left is mirrored in z)
constexpr float EYE_RADIUS = 0.075f;
constexpr V3 RIDER_HIP{ 0.02f, 1.02f, 0 };              // the rider leans and bobs about this point
/** Lid angles about Z: open (resting just over the iris) and shut. */
constexpr float LID_OPEN = 0.62f, LID_SHUT = -1.45f;
/** How long each chunk of land is, along the road. */
constexpr float CHUNK = 50;

/** The golden chariot: the bowl, the prow, the domes, the gong and the axle (no wheels). */
Mesh build_chariot();
/** A spoked wheel about the origin, its axle along +Z (the hub's dome on the +Z side). */
Mesh build_wheel(float radius = WHEEL_RADIUS);
/** The charioteer standing in the bowl, in the chariot's space: everything but the irises and lids. */
Mesh build_rider();
/** One eye's iris, pupil and catch-light, about the eye's centre, looking along +X. */
Mesh build_iris();
/** One upper eyelid with its kohl line, about the eye's centre: a cap over +Y; turn it about Z to blink. */
Mesh build_lid();

/** The Guide: an old scholar in a saffron turban with a scroll, standing on the origin, facing +X. */
Mesh build_guide();
/** A tool, floating where it lies (a golden ring beneath it). */
Mesh build_tool(Tool tool);
/** The Buddhist fragment (the clue). */
Mesh build_fragment();
Mesh build_villager(uint32_t seed);
Mesh build_sack();
/** A stepping stone, its top at the origin. */
Mesh build_stone();
Mesh build_pot();
Mesh build_shard();
Mesh build_tumbleweed();
/** A handcart loaded with pots and sacks, about the origin, its length along +X. */
Mesh build_handcart();
/** A soft blob for dust and splashes (its colour comes from the draw). */
Mesh build_puff();

/** A watchman with a spear, standing on the origin, facing +X. */
Mesh build_watchman();
/** A zebu bull with painted horns and a marigold garland, standing on the origin, facing +X. */
Mesh build_zebu();
/** Board mode's nodes and lines, painted on the road (the exit gold, the start ringed). */
Mesh build_board(const Track& t, const Board& b);
/** A flat arrow pointing along +X (where a piece goes next). */
Mesh build_chevron();
/** A flat ring (where a watchman is looking). */
Mesh build_gaze();

/** The land between s0 and s1 along the road: ground, strata, road and the props standing there that don't belong
 *  to a district (and the shortcut's bridge). */
Mesh build_chunk(const Track& t, float s0, float s1);
/** A district's buildings and life: alive, or as ruins. */
Mesh build_district(const Track& t, int district, bool alive);
/** The gates across the shortcut's bridge (drawn while it's closed). */
Mesh build_gates(const Track& t);

} // namespace jr
