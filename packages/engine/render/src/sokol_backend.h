/**
 * @file sokol_backend.h
 * @brief The sokol_gfx backend's seam (private to the package): the renderer, given what it needs from the window.
 *
 * app/glue.cpp hands it the app's window (sokol_glue); the package's tests hand it a stand-in, on sokol's dummy backend.
 */
#pragma once
#include "sokol_gfx.h"
#include "xl_render.h"

namespace xl::render::sokol {

/** What the backend needs from the window. */
struct Surface {
    sg_environment (*environment)();   ///< The device and the default pixel formats.
    sg_swapchain (*swapchain)();       ///< This frame's on-screen target.
    sg_logger logger;                  ///< Where sokol_gfx reports problems.
    sg_backend (*shaders)();           ///< Which shader language to use (the backend's own: sg_query_backend).
};

/**
 * Sets sokol_gfx up (it must not be set up already) and makes the renderer; destroying it shuts sokol_gfx down.
 * @param config The renderer's settings.
 * @param surface The window.
 * @return The renderer.
 */
std::unique_ptr<Renderer> create(const Renderer::Config& config, const Surface& surface);

} // namespace xl::render::sokol
