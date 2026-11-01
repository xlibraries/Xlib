/**
 * @file gamepad_test.cpp
 * @brief The contract's own logic: a gamepad button is down while held and pressed only on its first frame.
 */
#include "doctest.h"
#include "sokol_app.h"
#include "xl.h"

TEST_CASE("a gamepad button is down while held, and pressed only on the frame it went down") {
    xl::Gamepad pad;
    pad.buttons = 1u << xl::PAD_A;
    CHECK(pad.down(xl::PAD_A));
    CHECK(pad.pressed(xl::PAD_A));
    CHECK_FALSE(pad.down(xl::PAD_B));
    pad.previous = pad.buttons;   // what xl::end_frame() does
    CHECK(pad.down(xl::PAD_A));
    CHECK_FALSE(pad.pressed(xl::PAD_A));
    pad.buttons = 0;
    CHECK_FALSE(pad.down(xl::PAD_A));
}
