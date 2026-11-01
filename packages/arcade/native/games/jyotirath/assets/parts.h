// JyotiRath's assets, inside: the helpers several asset files share (parts.cpp). Not for the game: it uses models.h.
#pragma once
#include "palette.h"

#include <utility>
#include <vector>

namespace jr {

constexpr float PI = 3.14159265358979f;
/** A lathe's profile: (radius, height) pairs from bottom to top. */
using Profile = std::vector<std::pair<float, float>>;

/** A bell or onion dome: lathe of a classic profile, `h` tall. */
void onion(Mesh& m, V3 base, float r, float h, const Material& mt, const Xform& x = {});
/** A kalash finial: a pot with a spike. */
void kalash(Mesh& m, V3 base, float s, const Material& mt, const Xform& x = {});
/** A clay pot's profile at size s. */
Profile pot_profile(float s);
/** A clay pot of size s through x, varied by seed. */
void pot_at(Mesh& m, const Xform& x, float s, uint32_t seed);
/** A townsperson: a dhoti or a sari in one of a few colours, some with a pot on the head. Facing +X. */
void person(Mesh& m, uint32_t seed, const Xform& X);
/** The bronze Dancing Girl herself, standing on the origin. */
void statue(Mesh& m, const Xform& X);

} // namespace jr
