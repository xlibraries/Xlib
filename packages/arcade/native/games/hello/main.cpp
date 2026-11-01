// Hello: a spinning, glowing cube with the backend name and frame rate. Proves the whole pipeline on both
// WebGPU and WebGL2.
#define SOKOL_IMPL
#include "sokol_gfx.h"
#include "sokol_app.h"
#include "sokol_glue.h"
#include "sokol_log.h"
#include "sokol_debugtext.h"
#define HANDMADE_MATH_USE_RADIANS
#include "HandmadeMath.h"
#include "xl.h"
#include "hello.glsl.h"

#include <cstdio>

namespace {

struct {
    sg_pipeline pip;
    sg_bindings bind;
    sg_pass_action pass;
    float angle = 0.0f;
    float time = 0.0f;
    float fps = 0.0f;
    float spin = 1.0f;
} state;

struct Vertex { float x, y, z; float r, g, b, a; float nx, ny, nz; };

void init() {
    sg_desc gfx = {};
    gfx.environment = sglue_environment();
    gfx.logger.func = slog_func;
    sg_setup(&gfx);

    sdtx_desc_t text = {};
    text.fonts[0] = sdtx_font_oric();
    text.logger.func = slog_func;
    sdtx_setup(&text);

    // A cube with one candy colour per face
    const float c[6][3] = { {1.0f, 0.36f, 0.37f}, {1.0f, 0.79f, 0.24f}, {0.15f, 0.76f, 0.55f},
                            {0.04f, 0.61f, 1.0f}, {0.55f, 0.36f, 0.96f}, {1.0f, 0.24f, 0.5f} };
    const float n[6][3] = { {0, 0, -1}, {0, 0, 1}, {-1, 0, 0}, {1, 0, 0}, {0, -1, 0}, {0, 1, 0} };
    const float p[6][4][3] = {
        {{-1,-1,-1},{ 1,-1,-1},{ 1, 1,-1},{-1, 1,-1}}, {{-1,-1, 1},{ 1,-1, 1},{ 1, 1, 1},{-1, 1, 1}},
        {{-1,-1,-1},{-1, 1,-1},{-1, 1, 1},{-1,-1, 1}}, {{ 1,-1,-1},{ 1, 1,-1},{ 1, 1, 1},{ 1,-1, 1}},
        {{-1,-1,-1},{-1,-1, 1},{ 1,-1, 1},{ 1,-1,-1}}, {{-1, 1,-1},{-1, 1, 1},{ 1, 1, 1},{ 1, 1,-1}},
    };
    Vertex vertices[24];
    uint16_t indices[36];
    for (int f = 0; f < 6; f++) {
        for (int v = 0; v < 4; v++) {
            vertices[f * 4 + v] = { p[f][v][0], p[f][v][1], p[f][v][2], c[f][0], c[f][1], c[f][2], 1.0f, n[f][0], n[f][1], n[f][2] };
        }
        const uint16_t base = static_cast<uint16_t>(f * 4);
        const bool flip = (f % 2) == 0;   // keep every face counter-clockwise from outside
        const uint16_t quad[6] = { 0, 1, 2, 0, 2, 3 };
        const uint16_t quad_flip[6] = { 0, 2, 1, 0, 3, 2 };
        for (int i = 0; i < 6; i++) indices[f * 6 + i] = base + (flip ? quad_flip[i] : quad[i]);
    }

    sg_buffer_desc vb = {};
    vb.data = SG_RANGE(vertices);
    state.bind.vertex_buffers[0] = sg_make_buffer(&vb);
    sg_buffer_desc ib = {};
    ib.usage.index_buffer = true;
    ib.data = SG_RANGE(indices);
    state.bind.index_buffer = sg_make_buffer(&ib);

    sg_pipeline_desc pip = {};
    pip.shader = sg_make_shader(hello_shader_desc(sg_query_backend()));
    pip.layout.attrs[ATTR_hello_position].format = SG_VERTEXFORMAT_FLOAT3;
    pip.layout.attrs[ATTR_hello_color0].format = SG_VERTEXFORMAT_FLOAT4;
    pip.layout.attrs[ATTR_hello_normal].format = SG_VERTEXFORMAT_FLOAT3;
    pip.index_type = SG_INDEXTYPE_UINT16;
    pip.cull_mode = SG_CULLMODE_BACK;
    pip.depth.write_enabled = true;
    pip.depth.compare = SG_COMPAREFUNC_LESS_EQUAL;
    state.pip = sg_make_pipeline(&pip);

    state.pass.colors[0].load_action = SG_LOADACTION_CLEAR;
    state.pass.colors[0].clear_value = { 0.11f, 0.08f, 0.22f, 1.0f };
}

void frame() {
    if (xl::paused()) return;   // minimized or tab hidden: no work, nothing drawn
    const float dt = static_cast<float>(sapp_frame_duration());
    xl::report_frame(dt);
    state.time += dt;
    if (xl::gamepad().pressed(xl::PAD_A)) state.spin = -state.spin;
    xl::end_frame();
    state.angle += dt * state.spin;
    state.fps = state.fps * 0.95f + (dt > 0 ? 1.0f / dt : 0) * 0.05f;

    const float w = sapp_widthf(), h = sapp_heightf();
    const HMM_Mat4 proj = HMM_Perspective_RH_NO(HMM_AngleDeg(55.0f), w / h, 0.1f, 50.0f);
    const HMM_Mat4 view = HMM_LookAt_RH(HMM_V3(0.0f, 1.6f, 5.5f), HMM_V3(0, 0, 0), HMM_V3(0, 1, 0));
    const HMM_Mat4 model = HMM_MulM4(HMM_Rotate_RH(state.angle, HMM_V3(0, 1, 0)), HMM_Rotate_RH(state.angle * 0.6f, HMM_V3(1, 0, 0)));
    vs_params_t vs = { HMM_MulM4(HMM_MulM4(proj, view), model), model };
    fs_params_t fs = { state.time };

    sdtx_canvas(w / sapp_dpi_scale() * 0.5f, h / sapp_dpi_scale() * 0.5f);
    sdtx_origin(1.0f, 1.0f);
    sdtx_color3f(1.0f, 0.79f, 0.24f);
    sdtx_printf("XLIB ARCADE\n");
    sdtx_color3f(0.9f, 0.9f, 1.0f);
    sdtx_printf("%s  %.0f FPS\n\n", xl::backend_name(), state.fps);
    sdtx_color3f(0.6f, 0.6f, 0.8f);
    sdtx_printf(xl::focused() ? "SPACE: reverse spin" : "click to focus");

    sg_pass pass = {};
    pass.action = state.pass;
    pass.swapchain = sglue_swapchain();
    sg_begin_pass(&pass);
    sg_apply_pipeline(state.pip);
    sg_apply_bindings(&state.bind);
    sg_apply_uniforms(UB_vs_params, SG_RANGE(vs));
    sg_apply_uniforms(UB_fs_params, SG_RANGE(fs));
    sg_draw(0, 36, 1);
    sdtx_draw();
    sg_end_pass();
    sg_commit();
}

void event(const sapp_event* e) {
    if (e->type == SAPP_EVENTTYPE_KEY_DOWN && xl::focused() && e->key_code == SAPP_KEYCODE_SPACE) state.spin = -state.spin;
}

void cleanup() {
    sdtx_shutdown();
    sg_shutdown();
}

} // namespace

sapp_desc sokol_main(int argc, char* argv[]) {
    sapp_desc desc = {};
    desc.init_cb = init;
    desc.frame_cb = frame;
    desc.event_cb = event;
    desc.cleanup_cb = cleanup;
    desc.window_title = "Hello";
    desc.logger.func = slog_func;
    return xl::app_desc(argc, argv, desc);
}
