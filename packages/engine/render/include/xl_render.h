/**
 * @file xl_render.h
 * @brief 3D rendering: the contract, with no graphics API's types in it.
 *
 * One look, lit like a stylised film: a sun with soft shadows (a shadow map), physically based specular with a sky
 * reflection, wrapped diffuse, warm subsurface on skin, translucent foliage, animated water, hemisphere ambient,
 * per-vertex ambient occlusion, a rim light, a haze below y = 0 and ACES tone mapping; drawn into a multisampled target
 * over a gradient backdrop, then post-processed on screen (tilt-shift, bloom, a streak, a split-tone grade, vignette
 * and grain).
 *
 * Meshes are uploaded once (Vertex, below) and drawn by handle. Each frame, Renderer::render() calls the scene twice:
 * once into the shadow map (Pass::shadow() is true) and once lit; then the overlay (a HUD) on top, on screen.
 * Right-handed, y up; matrices are column-major (m[column * 4 + row]), as HandmadeMath and GLSL keep them.
 *
 * Renderer::create() makes the default backend (sokol_gfx: WebGPU or WebGL2). A module that uses
 * `@xlibraries/render` gets sokol_gfx's, sokol_glue's and sokol_log's implementations from it, so its own sources
 * define only SOKOL_APP_IMPL (and SOKOL_GL_IMPL for a sokol_gl HUD), not SOKOL_IMPL. xl_render_fake.h is a stand-in
 * for tests of code that draws.
 */
#pragma once
#include <algorithm>
#include <cstddef>
#include <cstdint>
#include <functional>
#include <memory>
#include <vector>

namespace xl::render {

/** A point, a direction or a colour (linear unless said otherwise). */
struct Vec3 {
    float x = 0;   ///< x, or red.
    float y = 0;   ///< y, or green.
    float z = 0;   ///< z, or blue.
};

/** A 4×4 matrix, column-major: m[column * 4 + row]. The identity by default. */
struct Mat4 {
    float m[16] = { 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1 };   ///< The elements.
};

/** How a surface shades, kept in the top byte of Vertex::material. */
enum Surface : uint8_t {
    PLAIN = 0,       ///< Opaque, lit the usual way.
    FOLIAGE = 32,    ///< Two-sided, wraps light and glows when backlit.
    EYE = 64,        ///< A wet, glassy highlight and a stronger rim.
    SKIN = 128,      ///< Warm light bleeding across the terminator, a stronger rim.
    WATER = 255,     ///< Animated ripples, Fresnel reflection of the sky, sparkle; upward faces breathe.
};

/**
 * The vertex every mesh is made of (32 bytes).
 *
 * `color` is the base colour as authored (sRGB bytes: r in the low byte, then g, b) with ambient occlusion in the top
 * byte (255: none). `material` is roughness, metalness and emission as unsigned normalised bytes (low to high), and the
 * Surface in the top byte.
 */
struct Vertex {
    float pos[3];        ///< Position, in the mesh's space.
    float normal[3];     ///< Unit normal.
    uint32_t color;      ///< r, g, b, ambient occlusion.
    uint32_t material;   ///< Roughness, metalness, emission, Surface.
};
static_assert(sizeof(Vertex) == 32, "the shaders read 32-byte vertices");

/** @param v A value in 0..1 (clamped). @return It as an unsigned normalised byte, rounded. */
inline uint8_t unorm8(float v) { return static_cast<uint8_t>(std::max(0.0f, std::min(1.0f, v)) * 255.0f + 0.5f); }

/** @param r Red. @param g Green. @param b Blue (0..1, as authored). @param ao Ambient occlusion (1: none). @return Vertex::color. */
inline uint32_t pack_color(float r, float g, float b, float ao) {
    return unorm8(r) | unorm8(g) << 8 | unorm8(b) << 16 | static_cast<uint32_t>(unorm8(ao)) << 24;
}

/** @param rough Roughness. @param metal Metalness. @param emissive Emission (0..1). @param kind How it shades. @return Vertex::material. */
inline uint32_t pack_material(float rough, float metal, float emissive, Surface kind) {
    return unorm8(rough) | unorm8(metal) << 8 | unorm8(emissive) << 16 | static_cast<uint32_t>(kind) << 24;
}

/** An uploaded mesh's handle; 0 is none. */
struct Mesh {
    uint32_t id = 0;   ///< The renderer's number for it.
    /** @return Whether it names a mesh. */
    bool valid() const { return id != 0; }
};

/** The sun and the sky's light on everything lit. */
struct Lighting {
    Vec3 sun_dir{ 0, 1, 0 };           ///< Towards the sun (normalised by the shader).
    float sun_intensity = 1;           ///< The sun's strength.
    Vec3 sun_color{ 1, 1, 1 };         ///< The sun's colour.
    float lamp_glow = 0;               ///< Extra glow on emissive surfaces (lamps and flames at dusk).
    Vec3 sky_top{ 0.4f, 0.5f, 0.7f };  ///< The sky overhead (ambient and reflections).
    float exposure = 1;                ///< Scales the light before tone mapping.
    Vec3 sky_horizon{ 0.7f, 0.7f, 0.7f };   ///< The sky at the horizon (ambient, reflections, the rim light).
    Vec3 ground{ 0.2f, 0.2f, 0.2f };   ///< Light bounced up from the ground.
    Vec3 haze{ 0, 0, 0 };              ///< The colour things fade into below y = 0.
    float haze_strength = 0;           ///< How far they fade (0: not at all).
    float shadow_strength = 0.8f;      ///< How dark shadows are (0: none, 1: no sunlight at all).
    float shadow_bias = 0.0015f;       ///< Depth bias against shadow acne, in shadow-map depth.
};

/** The gradient behind everything (display colours, already tone mapped). */
struct Backdrop {
    Vec3 top{ 0.5f, 0.6f, 0.8f };      ///< The colour at the top of the screen.
    Vec3 bottom{ 0.8f, 0.8f, 0.8f };   ///< At the bottom.
    Vec3 glow{ 1, 1, 1 };              ///< A soft glow's colour.
    float glow_strength = 0;           ///< Its strength.
    float glow_x = 0.5f;               ///< Where it is, across the screen (0..1).
    float glow_y = 0.5f;               ///< Up the screen (0..1, y up).
};

/** The on-screen pass. */
struct Post {
    float focus_y = 0.5f;      ///< The sharp band's centre (0..1, y up).
    float focus_half = 1;      ///< The sharp band's half height (a screen's height or more: no tilt-shift).
    float blur = 0;            ///< Blur outside the band, in pixels.
    float bloom = 0;           ///< How much bright areas glow.
    float vignette = 0;        ///< Darkening towards the corners.
    float saturation = 1;      ///< 1: as rendered.
    float grain = 0;           ///< Film grain's strength.
    float streak = 0;          ///< Speed streaks radiating from (streak_x, streak_y), 0..1.
    float streak_x = 0.5f;     ///< Where they radiate from (0..1).
    float streak_y = 0.5f;     ///< (0..1, y up).
};

/** Everything one frame needs besides the scene. */
struct Frame {
    int width = 1;             ///< The framebuffer's size, in pixels.
    int height = 1;            ///< (The scene target follows it.)
    Mat4 view_proj;            ///< The camera: projection × view (see Renderer::zero_to_one()).
    Vec3 eye;                  ///< Where the camera is.
    Mat4 light_vp;             ///< The sun's projection × view, for the shadow map (an orthographic box round the scene).
    float time = 0;            ///< Seconds; animates water, foliage and grain.
    Lighting lighting;         ///< The light.
    Backdrop backdrop;         ///< Behind everything.
    Post post;                 ///< On screen.
    float clear[4] = { 0, 0, 0, 1 };   ///< The scene target's clear colour (the backdrop covers it).
};

/**
 * A wave of light spreading over the ground: beyond its radius a mesh waits sunk 0.9 below where it belongs, and it
 * rises and glows as the wave passes.
 */
struct Reveal {
    float x = 0;           ///< The wave's centre, world x.
    float z = 0;           ///< The wave's centre, world z.
    float radius = 0;      ///< How far it has spread.
    bool on = false;       ///< Whether it runs (off: everything in place).
};

/** What a draw call needs besides the mesh and where it goes. */
struct Look {
    Vec3 tint{ 1, 1, 1 };  ///< Multiplies the base colour (linear).
    Reveal reveal;         ///< A wave of light it's revealed by.
};

/** One of the frame's two passes over the scene. */
class Pass {
public:
    virtual ~Pass() = default;
    /** @return Whether this is the shadow map's pass (depth only: tints, reveals and overlays don't matter). */
    virtual bool shadow() const = 0;
    /**
     * Draws a mesh.
     * @param mesh What (an invalid handle draws nothing).
     * @param model Where: the mesh's space to the world's.
     * @param look Its tint and reveal.
     */
    virtual void draw(Mesh mesh, const Mat4& model, const Look& look = {}) = 0;
};

/** The renderer: owns the GPU device, the meshes, the shadow map and the scene target. */
class Renderer {
public:
    /** How the renderer is set up. */
    struct Config {
        int shadow_size = 2048;   ///< The shadow map's size, in texels.
        int msaa = 4;             ///< The scene target's samples per pixel.
        int buffers = 256;        ///< How many GPU buffers can exist at once (two per mesh).
    };
    /**
     * The default backend, set up on the app's window (call it from the app's init).
     * @param config Its settings.
     * @return The renderer.
     */
    static std::unique_ptr<Renderer> create(const Config& config);
    /** The default backend with the default settings. @return The renderer. */
    static std::unique_ptr<Renderer> create() { return create(Config{}); }
    virtual ~Renderer() = default;

    /**
     * Uploads a mesh.
     * @param vertices Its vertices.
     * @param vertex_count How many.
     * @param indices Three per triangle.
     * @param index_count How many.
     * @return Its handle (invalid when there's nothing to draw).
     */
    virtual Mesh upload(const Vertex* vertices, size_t vertex_count, const uint32_t* indices, size_t index_count) = 0;
    /** @param vertices Its vertices. @param indices Three per triangle. @return The uploaded mesh's handle. */
    Mesh upload(const std::vector<Vertex>& vertices, const std::vector<uint32_t>& indices) { return upload(vertices.data(), vertices.size(), indices.data(), indices.size()); }
    /** @param mesh A mesh to free (an invalid handle is ignored); its handle is then invalid. */
    virtual void release(Mesh mesh) = 0;
    /** @return Whether clip-space depth runs 0..1 (WebGPU) rather than -1..1 (WebGL): build projections to match. */
    virtual bool zero_to_one() const = 0;
    /** @return The shadow map's size in texels (to snap Frame::light_vp to whole texels, so shadow edges don't crawl). */
    virtual int shadow_size() const = 0;

    /**
     * Renders a frame: the shadow map, the backdrop and the lit scene into the multisampled target, then the post pass
     * and the overlay on screen.
     * @param frame The camera, the light, the backdrop and the post pass.
     * @param scene Called twice, with the shadow pass and then the lit one; draws the scene.
     * @param overlay Called once, inside the on-screen pass after the post pass (for a HUD).
     */
    virtual void render(const Frame& frame, const std::function<void(Pass&)>& scene, const std::function<void()>& overlay = {}) = 0;
};

} // namespace xl::render
