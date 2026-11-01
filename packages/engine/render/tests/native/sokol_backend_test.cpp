/**
 * @file sokol_backend_test.cpp
 * @brief The sokol_gfx backend on sokol's dummy GPU backend, with sokol's validation on: every resource, pass,
 * binding and uniform block the renderer makes is checked against the shaders' reflection, and any problem sokol
 * reports fails the test. The dummy backend has no shader language of its own, so the shaders' GLES3 descriptions
 * are the ones validated.
 */
#define SOKOL_DUMMY_BACKEND
#include "../../src/renderer_sokol.cpp"

#include "doctest.h"

#include <string>
#include <vector>

using namespace xl::render;

namespace {

std::vector<std::string> problems;

void logger(const char*, uint32_t level, uint32_t, const char* message, uint32_t line, const char*, void*) {
    if (level <= 2) problems.push_back(std::string(message ? message : "?") + " (sokol_gfx.h:" + std::to_string(line) + ")");
}

sg_environment environment() {
    sg_environment e = {};
    e.defaults.color_format = SG_PIXELFORMAT_RGBA8;
    e.defaults.depth_format = SG_PIXELFORMAT_DEPTH_STENCIL;
    e.defaults.sample_count = 1;
    return e;
}

sg_swapchain swapchain() {
    sg_swapchain s = {};
    s.width = 640;
    s.height = 360;
    s.sample_count = 1;
    s.color_format = SG_PIXELFORMAT_RGBA8;
    s.depth_format = SG_PIXELFORMAT_DEPTH_STENCIL;
    return s;
}

sg_backend gles3() { return SG_BACKEND_GLES3; }

std::unique_ptr<Renderer> make(Renderer::Config config = {}) {
    problems.clear();
    return sokol::create(config, { environment, swapchain, { logger, nullptr }, gles3 });
}

struct Tri {
    std::vector<Vertex> v{ { { 0, 0, 0 }, { 0, 1, 0 }, 0, 0 }, { { 1, 0, 0 }, { 0, 1, 0 }, 0, 0 }, { { 0, 0, 1 }, { 0, 1, 0 }, 0, 0 } };
    std::vector<uint32_t> i{ 0, 1, 2 };
};

Frame frame(int w = 640, int h = 360) {
    Frame f;
    f.width = w;
    f.height = h;
    f.time = 12.5f;
    return f;
}

} // namespace

TEST_CASE("setting up makes the shadow map, the samplers and four valid pipelines; tearing down shuts sokol down") {
    {
        auto r = make();
        CHECK(sg_isvalid());
        CHECK(problems.empty());
        const sg_total_stats t = sg_query_stats().total;
        CHECK(t.pipelines.alive == 4);
        CHECK(t.shaders.alive == 4);
        CHECK(t.images.alive == 1);     // the shadow map; the scene target waits for the first frame
        CHECK(t.samplers.alive == 2);
        CHECK(r->shadow_size() == 2048);
        CHECK_FALSE(r->zero_to_one());  // only WebGPU's depth runs 0..1
    }
    CHECK_FALSE(sg_isvalid());
}

TEST_CASE("meshes upload into two buffers each, release frees them, ids are reused, and empty meshes upload nothing") {
    auto r = make();
    Tri t;
    const Mesh a = r->upload(t.v, t.i), b = r->upload(t.v, t.i);
    CHECK(a.id == 1);
    CHECK(b.id == 2);
    CHECK(sg_query_stats().total.buffers.alive == 4);
    CHECK_FALSE(r->upload({}, {}).valid());
    r->release(a);
    r->release(a);        // twice: ignored
    r->release({});       // none
    r->release({ 42 });   // unknown
    CHECK(sg_query_stats().total.buffers.alive == 2);
    CHECK(r->upload(t.v, t.i).id == 1);
    CHECK(problems.empty());
}

TEST_CASE("a frame is three passes: the scene into the shadow map, then the backdrop and the lit scene, then post and the overlay") {
    Renderer::Config config;
    config.shadow_size = 512;
    config.msaa = 1;
    auto r = make(config);
    sg_enable_stats();
    Tri t;
    const Mesh m = r->upload(t.v, t.i);
    std::vector<bool> passes;
    int overlays = 0;
    Look glowing;
    glowing.reveal = { 1, 1, 4, true };
    const auto scene = [&](Pass& p) {
        passes.push_back(p.shadow());
        p.draw(m, Mat4{});
        p.draw(m, Mat4{}, glowing);
        p.draw({}, Mat4{});      // nothing
        p.draw({ 9 }, Mat4{});   // not a mesh
    };
    r->render(frame(), scene, [&] { overlays++; });
    CHECK(passes == std::vector<bool>{ true, false });
    CHECK(overlays == 1);
    const sg_frame_stats s = sg_query_stats().prev_frame;
    CHECK(s.num_passes == 3);
    CHECK(s.num_draw == 2 + 1 + 2 + 1);   // shadow, backdrop, lit, post
    CHECK(sg_query_stats().total.images.alive == 3);   // + the scene target (drawn into directly: one sample) and its depth
    CHECK(sg_query_stats().total.views.alive == 5);    // the shadow map's two; the target's, its depth's, its texture's
    r->render(frame(), {}, {});                         // no scene, no overlay
    CHECK(sg_query_stats().prev_frame.num_draw == 2);
    for (const std::string& p : problems) MESSAGE(p);
    CHECK(problems.empty());
}

TEST_CASE("multisampled, the scene resolves into a texture; a new size makes the target again; the light follows the frame") {
    auto r = make();   // 4 samples
    sg_enable_stats();
    Tri t;
    const Mesh m = r->upload(t.v, t.i);
    const auto scene = [&](Pass& p) { p.draw(m, Mat4{}); };
    r->render(frame(), scene);
    CHECK(sg_query_stats().total.images.alive == 4);   // + the target, its resolve and its depth
    CHECK(sg_query_stats().total.views.alive == 6);
    Frame f = frame(800, 600);
    f.lighting.haze_strength = 0.85f;
    f.post.streak = 1;
    r->render(f, scene);                                // resized: the target is made again, nothing leaks
    CHECK(sg_query_stats().total.images.alive == 4);
    CHECK(sg_query_stats().total.views.alive == 6);
    CHECK(sg_query_stats().prev_frame.num_draw == 1 + 1 + 1 + 1);
    for (const std::string& p : problems) MESSAGE(p);
    CHECK(problems.empty());
}
