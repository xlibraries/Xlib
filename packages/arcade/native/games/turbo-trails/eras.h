// The ten eras of Turbo Trails: vehicle, terrain character, colours, landmarks with a fact each, and the story
// card (from the design in docs/turbo-trails-plan.md). Data only, so tests can check it.
#pragma once
#include <cstdint>
#include "physics.h"
#include "terrain.h"
#include "xl_color.h"

namespace tt {

using Rgb = xl::Rgb;

struct Landmark { const char* name; const char* fact; };

struct Era {
    const char* name;         // "Chariots"
    const char* place;        // "Indus Valley, India"
    const char* year;         // "2000 BCE"
    const char* vehicle;      // "JyotiRath, a war chariot"
    const char* story;        // the intro card
    VehicleSpec spec;
    TerrainProfile terrain;
    Rgb sky_top, sky_bottom, far_hills, near_hills, ground, ground_top, body, accent;
    bool wheels_visible;      // false for the hover vehicle
    bool electric;            // battery instead of fuel (same mechanic, different words)
    const Landmark* landmarks;
    int landmark_count;
};

const Era& era(int index);
int era_count();

} // namespace tt
