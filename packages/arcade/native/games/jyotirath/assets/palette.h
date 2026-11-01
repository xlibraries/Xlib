// JyotiRath's palette: the materials its models and its land are made of (xl_asset.h's Material).
#pragma once
#include "xl_asset.h"

namespace jr {

using namespace xl::asset;

inline Material gold() { return mat(0xF2B84B, 0.26f, 1.0f); }
inline Material gold_dark() { return mat(0xD08F2E, 0.34f, 1.0f); }
inline Material gold_cloth() { return mat(0xE9B44C, 0.45f, 0.7f); }
inline Material cream() { return mat(0xF3E4C6, 0.5f); }
inline Material wood() { return mat(0x7E4C2A, 0.62f); }
inline Material wood_dark() { return mat(0x55321C, 0.7f); }
inline Material teal() { return mat(0x63C7D6, 0.62f); }
inline Material teal_velvet() { return mat(0x1F8C93, 0.85f); }
inline Material ruby() { return mat(0xC81E35, 0.18f); }
inline Material emerald() { return mat(0x1FA387, 0.18f); }
inline Material skin() { return mat(0xB7704A, 0.52f, 0, 0, Material::SKIN); }
inline Material blush() { return mat(0xC47452, 0.5f, 0, 0, Material::SKIN); }
inline Material hair() { return mat(0x1B1311, 0.34f); }
inline Material kohl() { return mat(0x120A08, 0.45f); }
inline Material lip() { return mat(0x93303B, 0.38f); }
inline Material sandstone() { return mat(0xE2C394, 0.72f); }
inline Material brick() { return mat(0xC4825A, 0.88f); }
inline Material plaster() { return mat(0xEBE1CB, 0.8f); }
inline Material terracotta() { return mat(0xB5562E, 0.72f); }
inline Material water() { return mat(0x2E8FA3, 0.08f, 0, 0, Material::WATER); }
inline Material leaf() { return mat(0x4A8236, 0.6f, 0, 0, Material::FOLIAGE); }
inline Material bronze() { return mat(0x7A5434, 0.4f, 1.0f); }
inline Material bone() { return mat(0xEDE3CF, 0.7f); }
inline Material straw() { return mat(0xC9A35F, 0.85f); }
inline Material saffron() { return mat(0xE8862A, 0.8f); }
} // namespace jr
