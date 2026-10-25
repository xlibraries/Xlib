// JyotiRath, Chapter I: the road through Mohenjo-Daro. One long winding road on a floating ribbon of land (a
// diorama you drive along), in stretches from the design: the empty desert, the barren desert, the Lower Town, the
// Granary, the Great Bath, the Assembly Hall, the Great Stupa, the Upper Town (uphill), the Great Hall and the
// Dancing Girl's plaza. Placed props with their colliders, artifacts (fuel), pottery, potholes and handcarts that
// cross the road. Graphics-free; models.cpp turns it into meshes.
#pragma once
#include <cstdint>
#include <vector>

namespace jr {

struct V2 { float x = 0, z = 0; };

enum class Surface { Road, Ground, Void };

enum class Zone { Start, Desert, LowerTown, Granary, GreatBath, Assembly, Stupa, UpperTown, GreatHall, Plaza };
constexpr int ZONES = 10;
/** Where each zone starts along the road (metres); the road ends at ROAD_END, the plaza's far edge at LAND_END. */
constexpr float ZONE_START[ZONES] = { 0, 40, 260, 470, 530, 600, 760, 890, 1080, 1150 };
constexpr float ROAD_END = 1270, LAND_END = 1300;
constexpr float CLIMB_START = 890, CLIMB_END = 975, CLIMB_HEIGHT = 6;   // up into the Upper Town

/** Where the story stops (the landmarks), metres along the road. */
namespace at {
constexpr float SIGNBOARD = 248, LOWER_TOWN = 272, GRANARY = 492, GREAT_BATH = 560, ASSEMBLY = 680, STUPA = 812,
                UPPER_TOWN = 902, GREAT_HALL = 1108, DANCING_GIRL = 1270;
}

struct Sample {
    float x, z, tx, tz, s;
    float left, right;   // how far the land reaches either side of the road (left of travel, right of travel)
};
struct Circle { float x, z, r; };
struct Box { float x, z, hx, hz, yaw; };   // an oriented rectangle (yaw about +Y, radians)

enum class PropKind {
    House, Palm, Shrub, Rock, Well, Cart, Lamp,                                       // shared
    SunBanner, Cactus, Tumbleweed, CamelBones, Signboard,                             // the desert
    Basket, Rug, Stall, PrayerFlags,                                                  // street life
    Granary, GreatBath, AssemblyHall, Stupa, GreatHall, DancingGirl, Guide, FlowerBed, // the landmarks
};
struct Prop { PropKind kind; float x, z, yaw, scale; uint32_t seed; float s; float y = 0; };

enum class ArtifactKind { Seal, Figurine, Beads, Shard, Bronze, Fragment };
struct Artifact { float x, z, s; ArtifactKind kind; };
struct Pothole { float x, z, r, s; };
/** A handcart pushed back and forth across the road. */
struct Mover { float s, reach, period, phase; };

/** A mud-brick house's footprint and height, from its seed (the collider and the model agree). */
struct HouseShape { float w, d, h; bool upper; };
HouseShape house_shape(uint32_t seed, bool grand = false);

/** Landmark footprints (full sizes, before yaw). */
constexpr float BATH_W = 11, BATH_D = 8, STUPA_R = 4.2f, GRANARY_W = 10, GRANARY_D = 6, HALL_W = 10, HALL_D = 7,
                ASSEMBLY_W = 9, ASSEMBLY_D = 9, CART_W = 2.2f, CART_D = 1.3f, MOVER_W = 1.6f, MOVER_D = 1.0f;

struct Track {
    std::vector<Sample> samples;   // every 0.25 m from 0 to LAND_END
    float length = LAND_END;
    std::vector<Circle> circles;   // colliders
    std::vector<Box> boxes;
    std::vector<Prop> props;
    std::vector<Artifact> artifacts;
    std::vector<V2> pots;
    std::vector<Pothole> potholes;
    std::vector<Mover> movers;
    std::vector<float> tumbleweed_lanes;   // where tumbleweeds blow across the desert road

    /** The centre line at distance s (clamped to the land), interpolated. */
    Sample at(float s) const;
    /** The distance along the road nearest (x, z) and the signed distance from it (positive to the right of travel). */
    float nearest(float x, float z, float* lateral = nullptr, float hint = -1) const;
    Zone zone(float s) const;
    /** The road's half width at s (narrow lanes in the Lower Town, wide streets up the hill, the whole plaza). */
    float road_half(float s) const;
    float elevation(float s) const;
    bool on_land(float x, float z, float hint = -1) const;
    Surface surface(float x, float z, float hint = -1) const;
    /** Height of the ground: the road's elevation, with dunes rising away from it in the desert. */
    float height(float x, float z, float hint = -1) const;
    /** The same, for a point already known to be `lat` across the road at s. */
    float ground(float s, float lat, float x, float z) const;
    /** A mover's centre and the road's direction there, at time t. */
    V2 mover_at(const Mover& m, float t, float* yaw = nullptr) const;
};

Track build_track(uint32_t seed = 7);

} // namespace jr
