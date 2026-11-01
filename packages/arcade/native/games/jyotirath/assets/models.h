// JyotiRath's assets: every model and prop, built with @xlibraries/asset-builder (xl_asset.h) from plain parameters,
// knowing nothing of the game (level.h places them along the road). The chariot faces +X with +Y up and +Z on its
// right; its origin is on the ground between the wheels. Moving parts (wheels, eyes, lids) are separate meshes so
// main.cpp can turn them; so are the things that move about the road (artifacts, pots, handcarts, tumbleweeds, the
// Guide). Graphics-free.
#pragma once
#include "palette.h"

namespace jr {

constexpr float WHEEL_RADIUS = 0.62f;
constexpr V3 WHEEL_AT{ -0.08f, WHEEL_RADIUS, 0.74f };   // the right wheel's centre (the left is mirrored in z)
constexpr V3 EYE_AT{ 0.22f, 1.80f, 0.104f };             // the right eye's centre (the left is mirrored in z)
constexpr float EYE_RADIUS = 0.075f;
constexpr V3 RIDER_HIP{ 0.02f, 1.02f, 0 };              // the rider leans and bobs about this point
/** Lid angles about Z: open (resting just over the iris) and shut. */
constexpr float LID_OPEN = 0.62f, LID_SHUT = -1.45f;

/** Where a prop stands: on (x, y, z), turned by yaw about +Y, scaled; seed picks its variations. */
struct Placement { float x, y, z, yaw, scale; uint32_t seed; };
/** Landmark footprints (full sizes, before yaw): the models and track.cpp's colliders agree. */
constexpr float BATH_W = 11, BATH_D = 8, STUPA_R = 4.2f, GRANARY_W = 10, GRANARY_D = 6, HALL_W = 10, HALL_D = 7,
                ASSEMBLY_W = 9, ASSEMBLY_D = 9, CART_W = 2.2f, CART_D = 1.3f;
/** The canal's half width. */
constexpr float CANAL_HALF = 0.9f;
/** A house's size, and whether it has an upper room. */
struct HouseShape { float w, d, h; bool upper; };
/** A mud-brick house's footprint and height, from its seed (track.cpp's collider and the model agree). */
HouseShape house_shape(uint32_t seed, bool grand = false);
/** The relics: the seal and the beads are tools on the boards; the fragment is the clue. */
enum class Relic { Seal, Shard, Beads, Figurine, Bronze, Fragment };

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
/** A relic, floating where it lies (a golden ring beneath it). */
Mesh build_relic(Relic kind);
/** The bell (a tool), floating where it lies. */
Mesh build_bell();
/** The sack of grain (a tool), floating where it lies. */
Mesh build_grain();
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
/** A flat arrow pointing along +X (where a piece goes next). */
Mesh build_chevron();
/** A flat ring (where a watchman is looking). */
Mesh build_gaze();
/** The bronze Dancing Girl, standing on the origin (off her plinth, so the thief can carry her). */
Mesh build_statue();
/** The Bronze Thief: a hooded, masked figure hugging his arms to his chest, facing +X. */
Mesh build_thief();
/** A lamp post on the lamp road, lit or not. */
Mesh build_beacon(bool lit);
/** A golden arrow pointing down at the origin (a hint pointing at a node). */
Mesh build_pointer();
/** A thin glowing ring of radius 1 in the XZ plane (the wave of light that lights a board). */
Mesh build_glow_ring();

// ---- props, added to a mesh where they stand ----

void house(Mesh& m, const Placement& p, const HouseShape& h);
void palm(Mesh& m, const Placement& p);
void shrub(Mesh& m, const Placement& p);
void rock(Mesh& m, const Placement& p);
void lamp(Mesh& m, const Placement& p);
void well(Mesh& m, const Placement& p);
void cart(Mesh& m, const Placement& p);
void sun_banner(Mesh& m, const Placement& p);
void cactus(Mesh& m, const Placement& p);
void tumbleweed_into(Mesh& m, const Xform& x, uint32_t seed);
void camel_bones(Mesh& m, const Placement& p);
void signboard(Mesh& m, const Placement& p);
void basket(Mesh& m, const Placement& p);
void rug(Mesh& m, const Placement& p);
void stall(Mesh& m, const Placement& p);
void prayer_flags(Mesh& m, const Placement& p);
void villager(Mesh& m, const Placement& p);
void wheat(Mesh& m, const Placement& p);
void canal(Mesh& m, const Placement& p);
void sack_pile(Mesh& m, const Placement& p);
void granary(Mesh& m, const Placement& p);
void great_bath(Mesh& m, const Placement& p);
void assembly_hall(Mesh& m, const Placement& p);
void stupa(Mesh& m, const Placement& p);
void great_hall(Mesh& m, const Placement& p);
void dancing_girl(Mesh& m, const Placement& p);
void flower_bed(Mesh& m, const Placement& p);

} // namespace jr
