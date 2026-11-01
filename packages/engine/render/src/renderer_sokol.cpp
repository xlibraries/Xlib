/**
 * @file renderer_sokol.cpp
 * @brief xl_render.h on sokol_gfx (WebGPU or WebGL2): three passes a frame. The sun's shadow map (a depth texture,
 * compared in hardware when sampled); the backdrop and the lit scene into a multisampled target; then the post pass
 * on screen, with the overlay on top. Compiles sokol_gfx's implementation for the modules that use the package.
 */
#define SOKOL_GFX_IMPL
#include "sokol_gfx.h"
#undef SOKOL_GFX_IMPL   // sokol_gfx.h's implementation isn't guarded against a second include (the headers below)
#define HANDMADE_MATH_USE_RADIANS
#include "HandmadeMath.h"
#include "render.glsl.h"
#include "sokol_backend.h"

#include <cmath>
#include <cstddef>
#include <cstring>
#include <vector>

namespace xl::render::sokol {

namespace {

HMM_Mat4 hmm(const Mat4& m) { HMM_Mat4 r; std::memcpy(&r, m.m, sizeof r); return r; }
HMM_Vec4 v4(Vec3 v, float w = 1) { return HMM_V4(v.x, v.y, v.z, w); }

struct GpuMesh { sg_buffer vbuf{}, ibuf{}; int count = 0; };

sg_pipeline_desc mesh_layout(sg_shader shader, bool full) {
    sg_pipeline_desc pd = {};
    pd.shader = shader;
    pd.layout.buffers[0].stride = sizeof(Vertex);
    if (full) {
        pd.layout.attrs[ATTR_lit_position] = { 0, offsetof(Vertex, pos), SG_VERTEXFORMAT_FLOAT3 };
        pd.layout.attrs[ATTR_lit_normal] = { 0, offsetof(Vertex, normal), SG_VERTEXFORMAT_FLOAT3 };
        pd.layout.attrs[ATTR_lit_color0] = { 0, offsetof(Vertex, color), SG_VERTEXFORMAT_UBYTE4N };
        pd.layout.attrs[ATTR_lit_material] = { 0, offsetof(Vertex, material), SG_VERTEXFORMAT_UBYTE4N };
    } else {
        pd.layout.attrs[ATTR_shadow_position] = { 0, offsetof(Vertex, pos), SG_VERTEXFORMAT_FLOAT3 };
    }
    pd.index_type = SG_INDEXTYPE_UINT32;
    pd.depth.write_enabled = true;
    pd.depth.compare = SG_COMPAREFUNC_LESS_EQUAL;
    pd.depth.pixel_format = SG_PIXELFORMAT_DEPTH;
    pd.cull_mode = SG_CULLMODE_NONE;
    return pd;
}

class SokolRenderer;

/** A pass over the scene: into the shadow map, or lit. */
class ScenePass final : public Pass {
public:
    ScenePass(const SokolRenderer& r, const Frame& f, bool shadow) : r_(r), f_(f), shadow_(shadow), view_proj_(hmm(f.view_proj)), light_vp_(hmm(f.light_vp)) {}
    bool shadow() const override { return shadow_; }
    void draw(Mesh mesh, const Mat4& model, const Look& look) override;

private:
    const SokolRenderer& r_;
    const Frame& f_;
    bool shadow_;
    HMM_Mat4 view_proj_, light_vp_;
};

class SokolRenderer final : public Renderer {
public:
    SokolRenderer(const Config& config, const Surface& surface) : config_(config), surface_(surface) {
        sg_desc gfx = {};
        gfx.environment = surface.environment();
        gfx.logger = surface.logger;
        gfx.buffer_pool_size = config.buffers;
        sg_setup(&gfx);
        zo_ = sg_query_backend() == SG_BACKEND_WGPU;

        // the shadow map: a depth texture, sampled with a comparison
        sg_image_desc img = {};
        img.usage.depth_stencil_attachment = true;
        img.width = img.height = config.shadow_size;
        img.pixel_format = SG_PIXELFORMAT_DEPTH;
        img.sample_count = 1;
        shadow_depth_ = sg_make_image(&img);
        sg_view_desc v = {};
        v.depth_stencil_attachment.image = shadow_depth_;
        shadow_att_ = sg_make_view(&v);
        v = {};
        v.texture.image = shadow_depth_;
        shadow_tex_ = sg_make_view(&v);
        sg_sampler_desc smp = {};
        smp.min_filter = smp.mag_filter = SG_FILTER_LINEAR;
        smp.wrap_u = smp.wrap_v = SG_WRAP_CLAMP_TO_EDGE;
        smp.compare = SG_COMPAREFUNC_LESS;
        shadow_smp_ = sg_make_sampler(&smp);
        smp.compare = SG_COMPAREFUNC_NEVER;
        post_smp_ = sg_make_sampler(&smp);

        const sg_environment env = surface.environment();
        sg_pipeline_desc sp = mesh_layout(sg_make_shader(shadow_shader_desc(surface.shaders())), false);
        sp.colors[0].pixel_format = SG_PIXELFORMAT_NONE;   // depth only
        sp.sample_count = 1;
        sp.depth.bias = 1.0f;
        sp.depth.bias_slope_scale = 1.5f;
        shadow_pip_ = sg_make_pipeline(&sp);
        sg_pipeline_desc lp = mesh_layout(sg_make_shader(lit_shader_desc(surface.shaders())), true);
        lp.colors[0].pixel_format = env.defaults.color_format;
        lp.sample_count = config.msaa;
        lit_pip_ = sg_make_pipeline(&lp);
        sg_pipeline_desc sky = {};
        sky.shader = sg_make_shader(sky_shader_desc(surface.shaders()));
        sky.colors[0].pixel_format = env.defaults.color_format;
        sky.depth.pixel_format = SG_PIXELFORMAT_DEPTH;
        sky.sample_count = config.msaa;
        sky_pip_ = sg_make_pipeline(&sky);
        sg_pipeline_desc post = {};
        post.shader = sg_make_shader(post_shader_desc(surface.shaders()));
        post_pip_ = sg_make_pipeline(&post);
    }

    ~SokolRenderer() override { sg_shutdown(); }

    Mesh upload(const Vertex* vertices, size_t vertex_count, const uint32_t* indices, size_t index_count) override {
        if (vertex_count == 0 || index_count == 0) return {};
        GpuMesh g;
        sg_buffer_desc vb = {};
        vb.usage.vertex_buffer = true;
        vb.data = { vertices, vertex_count * sizeof(Vertex) };
        g.vbuf = sg_make_buffer(&vb);
        sg_buffer_desc ib = {};
        ib.usage.index_buffer = true;
        ib.data = { indices, index_count * sizeof(uint32_t) };
        g.ibuf = sg_make_buffer(&ib);
        g.count = static_cast<int>(index_count);
        if (!free_.empty()) {
            const uint32_t id = free_.back();
            free_.pop_back();
            meshes_[id - 1] = g;
            return { id };
        }
        meshes_.push_back(g);
        return { static_cast<uint32_t>(meshes_.size()) };
    }

    void release(Mesh mesh) override {
        if (!mesh.valid() || mesh.id > meshes_.size() || meshes_[mesh.id - 1].count == 0) return;
        GpuMesh& g = meshes_[mesh.id - 1];
        sg_destroy_buffer(g.vbuf);
        sg_destroy_buffer(g.ibuf);
        g = GpuMesh{};
        free_.push_back(mesh.id);
    }

    bool zero_to_one() const override { return zo_; }
    int shadow_size() const override { return config_.shadow_size; }

    void render(const Frame& f, const std::function<void(Pass&)>& scene, const std::function<void()>& overlay) override {
        // 1. the shadow map
        {
            sg_pass pass = {};
            pass.action.depth.load_action = SG_LOADACTION_CLEAR;
            pass.action.depth.clear_value = 1.0f;
            pass.action.depth.store_action = SG_STOREACTION_STORE;   // the default throws depth away (WebGPU does)
            pass.attachments.depth_stencil = shadow_att_;
            sg_begin_pass(&pass);
            sg_apply_pipeline(shadow_pip_);
            ScenePass p(*this, f, true);
            if (scene) scene(p);
            sg_end_pass();
        }

        // 2. the backdrop and the lit scene
        ensure_scene(f.width, f.height);
        const float w = static_cast<float>(f.width), h = static_cast<float>(f.height);
        {
            sg_pass pass = {};
            pass.action.colors[0].load_action = SG_LOADACTION_CLEAR;
            pass.action.colors[0].store_action = SG_STOREACTION_DONTCARE;
            pass.action.colors[0].clear_value = { f.clear[0], f.clear[1], f.clear[2], f.clear[3] };
            pass.attachments.colors[0] = scene_msaa_att_;
            pass.attachments.resolves[0] = scene_resolve_att_;   // none when single-sampled
            pass.attachments.depth_stencil = scene_depth_att_;
            sg_begin_pass(&pass);
            sg_apply_pipeline(sky_pip_);
            const Backdrop& bd = f.backdrop;
            sky_params_t sky = {};
            sky.top = v4(bd.top);
            sky.bottom = v4(bd.bottom);
            sky.glow = v4(bd.glow, bd.glow_strength);
            sky.centre = HMM_V4(bd.glow_x, bd.glow_y, w / h, 0);
            sg_apply_uniforms(UB_sky_params, SG_RANGE(sky));
            sg_draw(0, 3, 1);
            sg_apply_pipeline(lit_pip_);
            const Lighting& l = f.lighting;
            lit_fs_params_t fs = {};
            fs.sun_dir = v4(l.sun_dir, l.sun_intensity);
            fs.sun_color = v4(l.sun_color, l.lamp_glow);
            fs.sky_top = v4(l.sky_top, l.exposure);
            fs.sky_horizon = v4(l.sky_horizon);
            fs.ground_color = v4(l.ground);
            fs.cam_pos = v4(f.eye, f.time);
            fs.shadow_info = HMM_V4(1.0f / config_.shadow_size, l.shadow_bias, sg_query_features().origin_top_left ? 1.0f : 0.0f, l.shadow_strength);
            fs.haze = v4(l.haze, l.haze_strength);
            sg_apply_uniforms(UB_lit_fs_params, SG_RANGE(fs));
            ScenePass p(*this, f, false);
            if (scene) scene(p);
            sg_end_pass();
        }

        // 3. on screen: post-processing, then the overlay
        {
            sg_pass pass = {};
            pass.action.colors[0].load_action = SG_LOADACTION_DONTCARE;
            pass.swapchain = surface_.swapchain();
            sg_begin_pass(&pass);
            sg_apply_pipeline(post_pip_);
            sg_bindings b = {};
            b.views[VIEW_scene_tex] = scene_tex_;
            b.samplers[SMP_scene_smp] = post_smp_;
            sg_apply_bindings(&b);
            const Post& po = f.post;
            post_params_t p = {};
            p.texel = HMM_V4(1.0f / w, 1.0f / h, sg_query_features().origin_top_left ? 0.0f : 1.0f, std::fmod(f.time, 10.0f));
            p.focus = HMM_V4(po.focus_y, po.focus_half, po.blur, po.bloom);
            p.grade = HMM_V4(po.vignette, po.saturation, po.grain, po.streak);
            p.centre = HMM_V4(po.streak_x, po.streak_y, 0, 0);
            sg_apply_uniforms(UB_post_params, SG_RANGE(p));
            sg_draw(0, 3, 1);
            if (overlay) overlay();
            sg_end_pass();
        }
        sg_commit();
    }

    /** Draws a mesh in a pass (ScenePass::draw). */
    void draw(bool shadow, const HMM_Mat4& view_proj, const HMM_Mat4& light_vp, float time, Mesh mesh, const Mat4& model, const Look& look) const {
        if (!mesh.valid() || mesh.id > meshes_.size() || meshes_[mesh.id - 1].count == 0) return;
        const GpuMesh& m = meshes_[mesh.id - 1];
        const HMM_Mat4 mm = hmm(model);
        sg_bindings b = {};
        b.vertex_buffers[0] = m.vbuf;
        b.index_buffer = m.ibuf;
        if (shadow) {
            sg_apply_bindings(&b);
            shadow_params_t p = {};
            p.light_mvp = HMM_MulM4(light_vp, mm);
            sg_apply_uniforms(UB_shadow_params, SG_RANGE(p));
        } else {
            b.views[VIEW_shadow_tex] = shadow_tex_;
            b.samplers[SMP_shadow_smp] = shadow_smp_;
            sg_apply_bindings(&b);
            lit_vs_params_t p = {};
            p.view_proj = view_proj;
            p.model = mm;
            p.light_vp = light_vp;
            p.tint = v4(look.tint);
            p.depth_map = HMM_V4(zo_ ? 1.0f : 0.5f, zo_ ? 0.0f : 0.5f, time, 0);
            p.reveal = HMM_V4(look.reveal.x, look.reveal.z, look.reveal.radius, look.reveal.on ? 1.0f : 0.0f);
            sg_apply_uniforms(UB_lit_vs_params, SG_RANGE(p));
        }
        sg_draw(0, m.count, 1);
    }

private:
    /**
     * (Re)creates the scene target at the framebuffer's size: multisampled with a resolve texture, or (one sample) a
     * texture drawn into directly.
     */
    void ensure_scene(int w, int h) {
        if (w == scene_w_ && h == scene_h_) return;
        if (scene_w_) {
            for (sg_view v : { scene_msaa_att_, scene_resolve_att_, scene_depth_att_, scene_tex_ }) if (v.id) sg_destroy_view(v);
            for (sg_image i : { scene_msaa_, scene_resolve_, scene_depth_ }) if (i.id) sg_destroy_image(i);
        }
        scene_w_ = w; scene_h_ = h;
        const bool msaa = config_.msaa > 1;
        const sg_environment env = surface_.environment();
        sg_image_desc img = {};
        img.usage.color_attachment = true;
        img.width = w; img.height = h;
        img.pixel_format = env.defaults.color_format;
        img.sample_count = config_.msaa;
        sg_image_desc res = img;
        if (msaa) {
            scene_msaa_ = sg_make_image(&img);
            res.usage = {};
            res.usage.resolve_attachment = true;
            res.sample_count = 1;
        }
        scene_resolve_ = sg_make_image(&res);
        sg_image_desc depth = img;
        depth.usage = {};
        depth.usage.depth_stencil_attachment = true;
        depth.pixel_format = SG_PIXELFORMAT_DEPTH;
        scene_depth_ = sg_make_image(&depth);
        sg_view_desc v = {};
        v.color_attachment.image = msaa ? scene_msaa_ : scene_resolve_;
        scene_msaa_att_ = sg_make_view(&v);
        scene_resolve_att_ = {};
        if (msaa) {
            v = {};
            v.resolve_attachment.image = scene_resolve_;
            scene_resolve_att_ = sg_make_view(&v);
        }
        v = {};
        v.depth_stencil_attachment.image = scene_depth_;
        scene_depth_att_ = sg_make_view(&v);
        v = {};
        v.texture.image = scene_resolve_;
        scene_tex_ = sg_make_view(&v);
    }

    Config config_;
    Surface surface_;
    bool zo_ = false;   // WebGPU's clip space has z in 0..1
    std::vector<GpuMesh> meshes_;   // by id - 1
    std::vector<uint32_t> free_;    // released ids, reused first
    sg_pipeline shadow_pip_{}, lit_pip_{}, sky_pip_{}, post_pip_{};
    sg_image shadow_depth_{};
    sg_view shadow_att_{}, shadow_tex_{};
    sg_sampler shadow_smp_{}, post_smp_{};
    sg_image scene_msaa_{}, scene_resolve_{}, scene_depth_{};
    sg_view scene_msaa_att_{}, scene_resolve_att_{}, scene_depth_att_{}, scene_tex_{};
    int scene_w_ = 0, scene_h_ = 0;
};

void ScenePass::draw(Mesh mesh, const Mat4& model, const Look& look) { r_.draw(shadow_, view_proj_, light_vp_, f_.time, mesh, model, look); }

} // namespace

std::unique_ptr<Renderer> create(const Renderer::Config& config, const Surface& surface) { return std::make_unique<SokolRenderer>(config, surface); }

} // namespace xl::render::sokol
