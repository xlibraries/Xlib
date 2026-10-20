// Shader Playground: draws one full-window fragment shader. The page composes and validates the shader source
// (src/playground/) and hands it over with pg_set_shader(); this side only builds the pipeline and feeds uniforms.
#define SOKOL_IMPL
#include "sokol_gfx.h"
#include "sokol_app.h"
#include "sokol_glue.h"
#include "sokol_log.h"
#define XL_IMPL
#include "xl.h"

namespace {

#if defined(SOKOL_WGPU)
const char* VERTEX_SOURCE =
    "@vertex fn main(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {\n"
    "    let p = vec2f(f32((i << 1u) & 2u), f32(i & 2u));\n"
    "    return vec4f(p * 2.0 - 1.0, 0.0, 1.0);\n"
    "}\n";
#else
const char* VERTEX_SOURCE =
    "#version 300 es\n"
    "void main() {\n"
    "    vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));\n"
    "    gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);\n"
    "}\n";
#endif

// Matches the uniform declarations in src/playground/compose.ts
struct Params { float resolution[2]; float time; float time_delta; float mouse[4]; };

struct {
    sg_shader shader = {};
    sg_pipeline pip = {};
    float time = 0;
    float mouse[4] = { 0, 0, 0, 0 };
} st;

sg_pipeline build(const char* fragment_source, sg_shader* shader_out) {
    sg_shader_desc sd = {};
    sd.vertex_func.source = VERTEX_SOURCE;
    sd.fragment_func.source = fragment_source;
    sd.uniform_blocks[0].stage = SG_SHADERSTAGE_FRAGMENT;
    sd.uniform_blocks[0].layout = SG_UNIFORMLAYOUT_STD140;
    sd.uniform_blocks[0].size = sizeof(Params);
    sd.uniform_blocks[0].glsl_uniforms[0].type = SG_UNIFORMTYPE_FLOAT4;
    sd.uniform_blocks[0].glsl_uniforms[0].array_count = 2;
    sd.uniform_blocks[0].glsl_uniforms[0].glsl_name = "u_params";
    sd.uniform_blocks[0].wgsl_group0_binding_n = 0;
    sd.label = "playground";
    const sg_shader shader = sg_make_shader(&sd);
    if (sg_query_shader_state(shader) != SG_RESOURCESTATE_VALID) {
        sg_destroy_shader(shader);
        return {};
    }
    sg_pipeline_desc pd = {};
    pd.shader = shader;
    const sg_pipeline pip = sg_make_pipeline(&pd);
    if (sg_query_pipeline_state(pip) != SG_RESOURCESTATE_VALID) {
        sg_destroy_pipeline(pip);
        sg_destroy_shader(shader);
        return {};
    }
    *shader_out = shader;
    return pip;
}

} // namespace

extern "C" {
/** Called by the page with a complete, already-validated fragment shader. Returns 1 if it's now running. */
EMSCRIPTEN_KEEPALIVE int pg_set_shader(const char* fragment_source) {
    sg_shader shader = {};
    const sg_pipeline pip = build(fragment_source, &shader);
    if (pip.id == SG_INVALID_ID) return 0;
    if (st.pip.id != SG_INVALID_ID) { sg_destroy_pipeline(st.pip); sg_destroy_shader(st.shader); }
    st.pip = pip;
    st.shader = shader;
    return 1;
}
/** Restart the clock (iTime / u.time). */
EMSCRIPTEN_KEEPALIVE void pg_reset_time() { st.time = 0; }
}

namespace {

void init() {
    sg_desc gfx = {};
    gfx.environment = sglue_environment();
    gfx.logger.func = slog_func;
    sg_setup(&gfx);
}

void frame() {
    if (xl::paused()) return;
    const float dt = static_cast<float>(sapp_frame_duration());
    xl::report_frame(dt);
    st.time += dt;

    sg_pass pass = {};
    pass.action.colors[0].load_action = SG_LOADACTION_CLEAR;
    pass.action.colors[0].clear_value = { 0.05f, 0.03f, 0.1f, 1 };
    pass.swapchain = sglue_swapchain();
    sg_begin_pass(&pass);
    if (st.pip.id != SG_INVALID_ID) {
        Params p = { { sapp_widthf(), sapp_heightf() }, st.time, dt, { st.mouse[0], st.mouse[1], st.mouse[2], st.mouse[3] } };
        sg_apply_pipeline(st.pip);
        sg_apply_uniforms(0, SG_RANGE(p));
        sg_draw(0, 3, 1);
    }
    sg_end_pass();
    sg_commit();
}

void event(const sapp_event* e) {
    // iMouse: xy = pointer in pixels (origin bottom-left, like Shadertoy), z = 1 while pressed
    if (e->type == SAPP_EVENTTYPE_MOUSE_MOVE || e->type == SAPP_EVENTTYPE_MOUSE_DOWN || e->type == SAPP_EVENTTYPE_MOUSE_UP) {
        st.mouse[0] = e->mouse_x;
        st.mouse[1] = sapp_heightf() - e->mouse_y;
        if (e->type == SAPP_EVENTTYPE_MOUSE_DOWN) { st.mouse[2] = 1; st.mouse[3] = 1; }
        if (e->type == SAPP_EVENTTYPE_MOUSE_UP) st.mouse[2] = 0;
    }
}

void cleanup() { sg_shutdown(); }

} // namespace

sapp_desc sokol_main(int argc, char* argv[]) {
    sapp_desc desc = {};
    desc.init_cb = init;
    desc.frame_cb = frame;
    desc.event_cb = event;
    desc.cleanup_cb = cleanup;
    desc.window_title = "Shader Playground";
    desc.logger.func = slog_func;
    return xl::app_desc(argc, argv, desc);
}
