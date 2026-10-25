// JyotiRath, Chapter I: the road through Mohenjo-Daro. One long winding road on a floating ribbon of land, through
// the zones of the chapter: drives on the open stretches (the desert, the canal road with its one shortcut, the
// grain road, the climb) and the districts where the boards are (the Lower Town, the Granary, the Great Bath, the
// Citadel, the Upper Town), the lamp road at dusk, then the Dancing Girl's plaza. Placed props with their colliders and the district each
// belongs to (ruined until its board is cleared), tools to pick up, potholes, a canal. Graphics-free; models.cpp
// turns it into meshes.
#pragma once
#include <cstdint>
#include <vector>

namespace jr {

struct V2 { float x = 0, z = 0; };

enum class Surface { Road, Ground, Water, Void };

enum class Zone { Start, Desert, LowerTown, CanalRoad, Granary, GrainRoad, GreatBath, Citadel, Climb, UpperTown, LampRoad, Plaza };
constexpr int ZONES = 12;
/** Where each zone starts along the road (metres); the road ends at ROAD_END, the plaza's far edge at LAND_END. */
constexpr float ZONE_START[ZONES] = { 0, 40, 260, 470, 790, 880, 1170, 1260, 1420, 1700, 1880, 2130 };
constexpr float ROAD_END = 2210, LAND_END = 2255;
constexpr float CLIMB_START = 1420, CLIMB_END = 1690, CLIMB_HEIGHT = 6;   // up to the Upper Town

/** The districts that are ruins until their board is cleared: the Lower Town, the Granary, the Great Bath, the
 *  Citadel, the Upper Town (with the plaza). */
constexpr int DISTRICTS = 5;
/** The district a zone belongs to, or -1. */
int district_of(int zone);

/** Where the landmarks stand, metres along the road. */
namespace at {
constexpr float SIGNBOARD = 248, GRANARY = 835, GREAT_BATH = 1212, ASSEMBLY = 1300, STUPA = 1378, GREAT_HALL = 1835,
                DANCING_GIRL = 2226;
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
    Basket, Rug, Stall, PrayerFlags, Villager, Wheat, Canal, SackPile,                // life along the road
    Granary, GreatBath, AssemblyHall, Stupa, GreatHall, DancingGirl, Guide, FlowerBed, // the landmarks
};
struct Prop {
    PropKind kind; float x, z, yaw, scale; uint32_t seed; float s;
    float y = 0;
    int district = -1;    // ruined until this district's board is cleared (-1: always as it is)
    bool ruin = false;    // set when building the ruined version
};

/** The tools you carry onto the boards (two at most). */
enum class Tool : uint8_t { None, Seal, Grain, Bell, Beads };
struct Pickup { float x, z, s; Tool tool; };
struct Pothole { float x, z, r, s; };
/** A lamp post on the lamp road, just off the road's edge: light it by driving close past. */
struct Beacon { float x, z, s; };
constexpr float BEACON_REACH = 2.6f;

/** A mud-brick house's footprint and height, from its seed (the collider and the model agree). */
struct HouseShape { float w, d, h; bool upper; };
HouseShape house_shape(uint32_t seed, bool grand = false);

/** Landmark footprints (full sizes, before yaw). */
constexpr float BATH_W = 11, BATH_D = 8, STUPA_R = 4.2f, GRANARY_W = 10, GRANARY_D = 6, HALL_W = 10, HALL_D = 7,
                ASSEMBLY_W = 9, ASSEMBLY_D = 9, CART_W = 2.2f, CART_D = 1.3f;

struct Track {
    std::vector<Sample> samples;   // every 0.25 m from 0 to LAND_END
    float length = LAND_END;
    std::vector<Circle> circles;   // colliders
    std::vector<Box> boxes;
    std::vector<Prop> props;
    std::vector<Pickup> pickups;
    std::vector<Pothole> potholes;
    std::vector<float> tumbleweed_lanes;   // where tumbleweeds blow across the desert road
    std::vector<Beacon> beacons;           // the lamp road's lamp posts, in order
    // the canal road's one shortcut: a plank bridge across the mouth of its first bend, gated unless earned
    V2 shortcut_a, shortcut_b;
    float shortcut_from = 0, shortcut_to = 0;   // where it leaves and rejoins the road
    std::vector<Box> shortcut_gates;
    V2 basin;                                   // the pond inside that bend
    float basin_r = 0;

    /** The centre line at distance s (clamped to the land), interpolated. */
    Sample at(float s) const;
    /** The distance along the road nearest (x, z) and the signed distance from it (positive to the right of travel). */
    float nearest(float x, float z, float* lateral = nullptr, float hint = -1) const;
    Zone zone(float s) const;
    /** The road's half width at s. */
    float road_half(float s) const;
    float elevation(float s) const;
    bool on_land(float x, float z, float hint = -1) const;
    /** On the shortcut's bridge (whether or not it's open). */
    bool on_shortcut(float x, float z) const;
    Surface surface(float x, float z, float hint = -1) const;
    /** Height of the ground: the road's elevation, with dunes rising away from it in the desert. */
    float height(float x, float z, float hint = -1) const;
    /** The same, for a point already known to be `lat` across the road at s. */
    float ground(float s, float lat, float x, float z) const;
    /** The canal along the canal road: its centre's distance across the road (positive: right), or 0 elsewhere. */
    float canal_lat(float s) const;
};

constexpr float CANAL_HALF = 0.9f;

Track build_track(uint32_t seed = 7);

} // namespace jr
