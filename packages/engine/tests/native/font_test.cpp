#include "doctest.h"
#include "xl_font.h"
#include <fstream>
#include <iterator>
#include <vector>

using namespace xl;

TEST_CASE("font: Lilita One bakes into an atlas with every printable glyph and sensible widths") {
    std::ifstream in("native/fonts/LilitaOne-Regular.ttf", std::ios::binary);
    REQUIRE(in.good());
    std::vector<uint8_t> ttf((std::istreambuf_iterator<char>(in)), std::istreambuf_iterator<char>());
    Font f;
    REQUIRE(f.bake(ttf, 44));
    CHECK(f.atlas_w == 1024);
    size_t inked = 0;
    for (uint8_t a : f.atlas) inked += a > 0;
    CHECK(inked > 10000);                       // glyphs actually rendered
    CHECK(f.ascent > 30);
    CHECK(f.descent < 0);
    for (char c = 'A'; c <= 'Z'; c++) CHECK(f.glyph(c).advance > 5);
    CHECK(f.width("WWW", 44) > f.width("iii", 44) * 1.5f);
    CHECK(f.width("TURBO", 22) == doctest::Approx(f.width("TURBO", 44) * 0.5f));
    CHECK(f.glyph('\n').advance == f.glyph('?').advance);   // unknown characters draw as '?'
    // junk is refused before stb_truetype gets to read offsets out of it
    Font bad;
    CHECK(!bad.bake({ 1, 2, 3 }, 48));
    CHECK(bad.width("x", 48) == 0);
    std::vector<uint8_t> truncated(ttf.begin(), ttf.begin() + 2000);   // a real header whose tables run past the end
    CHECK(!bad.bake(truncated, 48));
    std::vector<uint8_t> forged = { 0, 1, 0, 0, 0xff, 0xff, 0, 0, 0, 0, 0, 0 };   // 65535 tables in 12 bytes
    CHECK(!bad.bake(forged, 48));
}

