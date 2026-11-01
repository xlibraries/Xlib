// Bot Lab's 3D view of the world: the floor, the track and every body in it, drawn through @xlibraries/render (soft
// daylight, the sun's shadows). It doesn't simulate anything: the page passes the track (bl_view_track), the bodies'
// looks (bl_view_bodies: shape, size, colour, as native/world registers them) and each snapshot's poses
// (bl_view_poses), the robot's sensor spots (bl_view_sensors) and what to look at (bl_view_focus). Drag to orbit,
// scroll to zoom. What's drawn is scene.h's (tested natively); this is the app around it.
#define SOKOL_APP_IMPL   // sokol_gfx, sokol_glue and sokol_log come with @xlibraries/render
#include "sokol_app.h"
#include "sokol_log.h"
#include "xl.h"
#include "xl_render.h"
#include "scene.h"
#include <emscripten/emscripten.h>
#include <algorithm>
#include <memory>
#include <vector>

namespace {

struct {
    std::unique_ptr<xl::render::Renderer> renderer;
    bl::view::Scene scene;
    // the page may send the track before the renderer is up (its first frame): it's built then
    std::vector<float> track_points;
    float track_width = 0.019f;
    bool track_closed = true, track_dirty = false;
    bool dragging = false;
    float time = 0;
} st;

void init() {
    st.renderer = xl::render::Renderer::create();
    st.scene.setup(*st.renderer);
}

void frame() {
    if (st.track_dirty) {
        st.scene.set_track(*st.renderer, st.track_points.data(), static_cast<int>(st.track_points.size() / 2), st.track_width, st.track_closed);
        st.track_dirty = false;
    }
    if (xl::paused()) return;
    const float dt = static_cast<float>(sapp_frame_duration());
    st.time += dt;
    xl::report_frame(dt);
    xl::end_frame();
    st.renderer->render(st.scene.frame(sapp_width(), sapp_height(), st.renderer->zero_to_one(), st.time), [](xl::render::Pass& pass) { st.scene.draw(pass); });
}

void event(const sapp_event* e) {
    switch (e->type) {
        case SAPP_EVENTTYPE_MOUSE_DOWN: st.dragging = true; break;
        case SAPP_EVENTTYPE_MOUSE_UP: st.dragging = false; break;
        case SAPP_EVENTTYPE_MOUSE_MOVE:
            if (st.dragging) st.scene.orbit.drag(e->mouse_dx, e->mouse_dy);
            break;
        case SAPP_EVENTTYPE_MOUSE_SCROLL: st.scene.orbit.zoom(e->scroll_y); break;
        case SAPP_EVENTTYPE_TOUCHES_MOVED:
            if (e->num_touches == 1) {
                static float last_x = e->touches[0].pos_x, last_y = e->touches[0].pos_y;
                st.scene.orbit.drag(e->touches[0].pos_x - last_x, e->touches[0].pos_y - last_y);
                last_x = e->touches[0].pos_x; last_y = e->touches[0].pos_y;
            }
            break;
        default: break;
    }
}

void cleanup() { st.renderer.reset(); }   // shuts sokol_gfx down

}  // namespace

extern "C" {

/** The track: n points (x, z pairs), its width, whether it loops */
EMSCRIPTEN_KEEPALIVE void bl_view_track(const float* pts, int n, float width, int closed) {
    st.track_points.assign(pts, pts + std::max(0, n) * 2);
    st.track_width = width;
    st.track_closed = closed != 0;
    st.track_dirty = true;
}

/** The bodies' looks: n × 7 floats (shape, size a b c, colour r g b) */
EMSCRIPTEN_KEEPALIVE void bl_view_bodies(const float* shapes, int n) { st.scene.shapes.assign(shapes, shapes + std::max(0, n) * 7); }

/** The bodies' poses: n × 7 floats (position xyz, rotation xyzw) */
EMSCRIPTEN_KEEPALIVE void bl_view_poses(const float* poses, int n) { st.scene.poses.assign(poses, poses + std::max(0, n) * 7); }

/** The robot's sensor spots: n × 3 floats (x, z on the floor, lit) */
EMSCRIPTEN_KEEPALIVE void bl_view_sensors(const float* spots, int n) { st.scene.sensors.assign(spots, spots + std::max(0, n) * 3); }

/** What the camera looks at (it orbits this point on the floor) */
EMSCRIPTEN_KEEPALIVE void bl_view_focus(float x, float y, float z) { st.scene.orbit.focus(x, y, z); }

}  // extern "C"

sapp_desc sokol_main(int argc, char* argv[]) {
    sapp_desc desc = {};
    desc.init_cb = init;
    desc.frame_cb = frame;
    desc.event_cb = event;
    desc.cleanup_cb = cleanup;
    desc.window_title = "Bot Lab";
    desc.sample_count = 1;   // the renderer draws into its own 4× target
    desc.logger.func = slog_func;
    return xl::app_desc(argc, argv, desc);
}
