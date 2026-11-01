/**
 * @file xl_render_fake.h
 * @brief A stand-in Renderer for tests of code built on xl_render.h: it draws nothing.
 *
 * It keeps what it's given (each mesh's vertices and indices, each frame) and records every draw, pass by pass, the
 * way the real one would make them: render() calls the scene with the shadow pass, then the lit one, then the
 * overlay. Empty meshes aren't uploaded, released ids are reused, and draws of meshes that don't exist are skipped,
 * as on the GPU. So a test can check what code draws, where, and how it looks, without a GPU.
 */
#pragma once
#include "xl_render.h"

#include <vector>

namespace xl::render {

/** The fake renderer. */
class FakeRenderer final : public Renderer {
public:
    /** A mesh as the fake keeps it. */
    struct FakeMesh {
        std::vector<Vertex> vertices;   ///< Its vertices.
        std::vector<uint32_t> indices;  ///< Its triangles.
        bool live = false;              ///< False once released.
    };
    /** A draw, as made. */
    struct Draw {
        bool shadow = false;   ///< In the shadow pass (otherwise the lit one).
        Mesh mesh;             ///< What.
        Mat4 model;            ///< Where.
        Look look;             ///< How.
    };

    std::vector<FakeMesh> meshes;   ///< Every mesh uploaded, by id - 1.
    std::vector<Frame> frames;      ///< Every frame rendered.
    std::vector<Draw> draws;        ///< The last frame's draws, the shadow pass's first.
    int overlays = 0;               ///< How many times the overlay was called.
    bool depth_zero_to_one = false; ///< What zero_to_one() answers (WebGPU: true).
    Config config;                  ///< What shadow_size() answers from.

    Mesh upload(const Vertex* vertices, size_t vertex_count, const uint32_t* indices, size_t index_count) override {
        if (vertex_count == 0 || index_count == 0) return {};
        FakeMesh m{ std::vector<Vertex>(vertices, vertices + vertex_count), std::vector<uint32_t>(indices, indices + index_count), true };
        for (size_t i = 0; i < meshes.size(); i++) if (!meshes[i].live) { meshes[i] = m; return { static_cast<uint32_t>(i + 1) }; }
        meshes.push_back(m);
        return { static_cast<uint32_t>(meshes.size()) };
    }
    using Renderer::upload;
    void release(Mesh mesh) override { if (live(mesh)) meshes[mesh.id - 1] = FakeMesh{}; }
    bool zero_to_one() const override { return depth_zero_to_one; }
    int shadow_size() const override { return config.shadow_size; }

    void render(const Frame& frame, const std::function<void(Pass&)>& scene, const std::function<void()>& overlay) override {
        frames.push_back(frame);
        draws.clear();
        for (bool shadow : { true, false }) {
            Recorder pass(*this, shadow);
            if (scene) scene(pass);
        }
        if (overlay) { overlay(); overlays++; }
    }

    /** @param mesh A handle. @return Whether it names a mesh that's uploaded and not released. */
    bool live(Mesh mesh) const { return mesh.valid() && mesh.id <= meshes.size() && meshes[mesh.id - 1].live; }
    /** @param shadow Which pass. @return The last frame's draws in it. */
    std::vector<Draw> in_pass(bool shadow) const { std::vector<Draw> out; for (const Draw& d : draws) if (d.shadow == shadow) out.push_back(d); return out; }

private:
    class Recorder final : public Pass {
    public:
        Recorder(FakeRenderer& r, bool shadow) : r_(r), shadow_(shadow) {}
        bool shadow() const override { return shadow_; }
        void draw(Mesh mesh, const Mat4& model, const Look& look) override { if (r_.live(mesh)) r_.draws.push_back({ shadow_, mesh, model, look }); }

    private:
        FakeRenderer& r_;
        bool shadow_;
    };
};

} // namespace xl::render
