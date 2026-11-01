#include "xl_font.h"
#define STB_TRUETYPE_IMPLEMENTATION
#include "stb/stb_truetype.h"

namespace xl {

namespace {

uint32_t be32(const uint8_t* p) { return (uint32_t(p[0]) << 24) | (uint32_t(p[1]) << 16) | (uint32_t(p[2]) << 8) | p[3]; }
uint16_t be16(const uint8_t* p) { return uint16_t((p[0] << 8) | p[1]); }

// stb_truetype trusts its input completely (it reads whatever offsets the table directory says), so check that
// the bytes are a TrueType/OpenType file whose table directory and tables all lie inside the buffer first.
bool looks_like_truetype(const std::vector<uint8_t>& d) {
    if (d.size() < 12) return false;
    const uint32_t tag = be32(d.data());
    if (tag != 0x00010000u && tag != 0x74727565u /* 'true' */ && tag != 0x4F54544Fu /* 'OTTO' */ && tag != 0x74797031u /* 'typ1' */) return false;
    const size_t tables = be16(d.data() + 4);
    if (tables == 0 || 12 + tables * 16 > d.size()) return false;
    for (size_t i = 0; i < tables; i++) {
        const uint8_t* entry = d.data() + 12 + i * 16;
        const uint64_t offset = be32(entry + 8), length = be32(entry + 12);
        if (offset + length > d.size()) return false;
    }
    return true;
}

} // namespace

bool Font::bake(const std::vector<uint8_t>& ttf, float px, int atlas_size) {
    ok = false;
    stbtt_fontinfo info;
    if (!looks_like_truetype(ttf) || !stbtt_InitFont(&info, ttf.data(), 0)) return false;
    atlas_w = atlas_h = atlas_size;
    atlas.assign(static_cast<size_t>(atlas_w) * atlas_h, 0);
    stbtt_pack_context pack;
    if (!stbtt_PackBegin(&pack, atlas.data(), atlas_w, atlas_h, 0, 1, nullptr)) return false;
    stbtt_PackSetOversampling(&pack, 2, 2);
    stbtt_packedchar packed[96];
    const int packed_ok = stbtt_PackFontRange(&pack, ttf.data(), 0, px, 32, 96, packed);
    stbtt_PackEnd(&pack);
    if (!packed_ok) return false;
    for (int i = 0; i < 96; i++) {
        float x = 0, y = 0;
        stbtt_aligned_quad q;
        stbtt_GetPackedQuad(packed, atlas_w, atlas_h, i, &x, &y, &q, 0);
        glyphs[i] = { q.s0, q.t0, q.s1, q.t1, q.x0, q.y0, q.x1, q.y1, packed[i].xadvance };
    }
    int a, d, gap;
    stbtt_GetFontVMetrics(&info, &a, &d, &gap);
    const float scale = stbtt_ScaleForPixelHeight(&info, px);
    baked_px = px;
    ascent = a * scale; descent = d * scale; line_height = (a - d + gap) * scale;
    ok = true;
    return true;
}

float Font::width(const std::string& text, float px) const {
    if (!ok || baked_px <= 0) return 0;
    float w = 0;
    for (char c : text) w += glyph(c).advance;
    return w * px / baked_px;
}

} // namespace xl
