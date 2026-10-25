// JyotiRath: every model, built from mesh.h's primitives. The chariot faces +X with +Y up and +Z on its right;
// its origin is on the ground between the wheels. Moving parts (wheels, eyes, lids) are separate meshes so main.cpp
// can turn them; so are the things that move about the road (artifacts, pots, handcarts, tumbleweeds, the Guide).
// The land is built in chunks along the road so only what's near the camera is drawn. Graphics-free.
#pragma once
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
Mesh build_artifact(ArtifactKind kind);
Mesh build_pot();
Mesh build_shard();
Mesh build_tumbleweed();
/** A handcart loaded with pots and sacks, about the origin, its length along +X. */
Mesh build_handcart();
/** A soft blob for dust and splashes (its colour comes from the draw). */
Mesh build_puff();

/** The land between s0 and s1 along the road: ground, strata, road and every prop standing there. */
Mesh build_chunk(const Track& t, float s0, float s1);

} // namespace jr
