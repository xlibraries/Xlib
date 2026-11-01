/**
 * @file glue.cpp
 * @brief Renderer::create(): the sokol_gfx backend on the app's window (sokol_app through sokol_glue). Compiles
 * sokol_glue's and sokol_log's implementations for the modules that use the package.
 */
#define SOKOL_GLUE_IMPL
#define SOKOL_LOG_IMPL
#include "sokol_gfx.h"
#include "sokol_app.h"
#include "sokol_glue.h"
#include "sokol_log.h"
#include "../src/sokol_backend.h"

namespace xl::render {

std::unique_ptr<Renderer> Renderer::create(const Config& config) {
    return sokol::create(config, { sglue_environment, sglue_swapchain, { slog_func, nullptr }, sg_query_backend });
}

} // namespace xl::render
