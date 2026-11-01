// JyotiRath's level: the land along the road, the districts (alive or in ruins), the boards painted on the road and
// the gates, assembled from the track (track.h) and the boards (go.h) with the assets (assets/models.h). Graphics-free.
#pragma once
#include "assets/models.h"
#include "go.h"
#include "track.h"

namespace jr {

/** How long each chunk of land is, along the road. */
constexpr float CHUNK = 50;

/** The land between s0 and s1 along the road: ground, strata, road and the props standing there that don't belong
 *  to a district (and the shortcut's bridge). */
Mesh build_chunk(const Track& t, float s0, float s1);
/** A district's buildings and life: alive, or as ruins. */
Mesh build_district(const Track& t, int district, bool alive);
/** The gates across the shortcut's bridge (drawn while it's closed). */
Mesh build_gates(const Track& t);
/** Board mode's nodes and lines, painted on the road (the exit gold, the start ringed). */
Mesh build_board(const Track& t, const Board& b);
/** A tool, floating where it lies (a golden ring beneath it). */
Mesh build_tool(Tool tool);

} // namespace jr
