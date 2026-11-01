// JyotiRath's assets: the board's markers: the chevron, the pointer, the glow ring and the gaze ring.
#include "models.h"
#include "parts.h"
#include "palette.h"

#include <algorithm>
#include <cmath>

namespace jr {

Mesh build_chevron() {
    Mesh m;
    const Material red = mat(0xE8452E, 0.5f, 0, 0.6f);
    for (int s = -1; s <= 1; s += 2) m.rounded_box({ 0.34f, 0.04f, 0.09f }, 0.02f, red, translate({ -0.08f, 0, s * 0.11f }) * rotate_y(s * 0.7f), 1);
    return m;
}

Mesh build_pointer() {
    Mesh m;
    const Material g = mat(0xFFD36B, 0.4f, 0.3f, 0.9f);
    m.lathe({ { 0, 0 }, { 0.32f, 0.42f }, { 0.13f, 0.42f }, { 0.13f, 0.95f }, { 0, 0.95f } }, 20, g);
    return m;
}

Mesh build_glow_ring() {
    Mesh m;
    m.torus(1, 0.03f, 96, 6, mat(0xFFD36B, 0.4f, 0, 1.0f), scale({ 1, 0.5f, 1 }));
    return m;
}

Mesh build_gaze() {
    Mesh m;
    m.torus(0.44f, 0.05f, 36, 6, mat(0xE8452E, 0.5f, 0, 0.6f), scale({ 1, 0.4f, 1 }));
    m.sphere(0.07f, 10, mat(0xE8452E, 0.5f, 0, 0.6f), scale({ 1, 0.3f, 1 }));
    return m;
}

} // namespace jr
