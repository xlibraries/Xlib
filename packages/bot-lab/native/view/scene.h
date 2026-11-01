// Bot Lab's 3D view, graphics-free: the meshes (a unit cube, cylinder and sphere every body is drawn as, the floor,
// the track), the orbiting camera, the sun's shadow box, and what's drawn where, through @xlibraries/render. main.cpp
// is the app around it; tests/native/view_test.cpp checks it on render's fake.
#pragma once
#include "xl_render.h"

#include <cstdint>
#include <vector>

namespace bl::view {

using xl::render::Vertex;

/** A mesh before it's uploaded. */
struct MeshData { std::vector<Vertex> vertices; std::vector<uint32_t> indices; };

/** A unit cube centred on the origin (−0.5..0.5). */
MeshData cube();
/** A cylinder along y, radius 1, height 1 (−0.5..0.5), with a darker stripe so it visibly turns. */
MeshData cylinder(int segments = 28);
/** A unit sphere (radius 1). */
MeshData sphere(int rings = 10, int segments = 16);
/** The floor: a 6 m square of light boards with faint 10 cm squares. */
MeshData floor_mesh();
/** The track: a strip of `width` along the points (x, z), mitred at the corners, a hair above the floor. */
MeshData track_mesh(const float* pts, int n, float width, bool closed);

/** The camera: it orbits a point on the floor. Drag to orbit, scroll to zoom. */
struct Orbit {
    float yaw = 2.3f, pitch = 0.75f, distance = 0.9f;
    float focus_x = 0, focus_y = 0.03f, focus_z = 0;
    /** Turns by a drag of (dx, dy) pixels; the pitch stays between just above the floor and straight down. */
    void drag(float dx, float dy);
    /** Zooms by a scroll of dy, between 25 cm and 4 m. */
    void zoom(float dy);
    /** Looks at (x, y, z), never below 3 cm (the floor's just under). */
    void focus(float x, float y, float z);
};

/** What the page sends, and the meshes it's drawn with. */
struct Scene {
    std::vector<float> shapes;    // 7 per body: shape (0 box, 1 cylinder, 2 sphere), size a b c, colour r g b (sRGB)
    std::vector<float> poses;     // 7 per body: position xyz, rotation xyzw
    std::vector<float> sensors;   // 3 per spot: x, z on the floor, lit (0/1)
    Orbit orbit;
    xl::render::Mesh cube, cylinder, sphere, floor, track;

    /** Uploads the meshes that never change. */
    void setup(xl::render::Renderer& r);
    /** Replaces the track (n points, x, z pairs). */
    void set_track(xl::render::Renderer& r, const float* pts, int n, float width, bool closed);
    /** The frame: the camera, a soft daylight with the sun's shadows round what's looked at, a dark backdrop, a light grade. */
    xl::render::Frame frame(int width, int height, bool zero_to_one, float time) const;
    /** Draws the floor, the track, every body and the sensor spots. */
    void draw(xl::render::Pass& pass) const;
};

} // namespace bl::view
