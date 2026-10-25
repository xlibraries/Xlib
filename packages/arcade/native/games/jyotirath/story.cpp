#include "story.h"

namespace jr {

namespace {

using S = Speaker;
constexpr Speaker L = Speaker::Local;

const std::vector<Line> DESERT = {
    { S::JyotiRath, "Whoa, where am I?" },
    { S::Narrator, "You find yourself thrown onto an empty, vast desert road. You're in the middle of nowhere." },
    { S::JyotiRath, "What's going on? What am I supposed to do here?" },
    { S::Narrator, "Use W, A, S and D to drive. Things lie by the road: a seal, a bell, beads, grain. Pick them up; you can carry two." },
    { S::JyotiRath, "Okay, this is kind of cool." },
};
const std::vector<Line> LOWER_TOWN = {
    { S::Narrator, "You come across a signboard: \"Welcome to the land of the Indus Valley Civilization.\"" },
    { S::Narrator, "Beyond it lies the Lower Town, in ruins: mud-brick houses, narrow lanes and wells. Its lanes are crowded with handcarts, watchmen and a zebu." },
    { S::Narrator, "Wherever JyotiRath's light passes, the ruins remember. Get through, and the whole district wakes. How you get through will change the road ahead." },
    { S::JyotiRath, "Step by step. I can do that." },
};
const std::vector<Line> CANAL_QUIET = {
    { L, "Psst! I saw you slip through the lanes without a fuss. Take the plank bridge across the pond on the canal road.", "Potter" },
    { L, "Nobody uses it, but it'll save you the long way round. I've opened the gates for you.", "Potter" },
    { S::JyotiRath, "A shortcut! Thank you!" },
};
const std::vector<Line> CANAL_ROUGH = {
    { S::Narrator, "Behind you, the zebu you nudged snorts, and paws the ground..." },
    { L, "SNORT!", "Zebu" },
    { S::JyotiRath, "Uh oh. Go, go, go!" },
};
const std::vector<Line> CANAL_SLOW = {
    { L, "Took your time in the lanes, didn't you? The Granary shuts its gates at sundown. You'll have to fly!", "Bell-ringer" },
    { S::JyotiRath, "Better hurry!" },
};
const std::vector<Line> CANAL_STEADY = {
    { L, "Off to the Granary? Follow the canal road, and mind the gates: they shut at sundown.", "Bell-ringer" },
    { S::JyotiRath, "Then let's not dawdle." },
};
const std::vector<Line> GRANARY = {
    { S::Narrator, "You have arrived at the Granary. This large building was used for grain storage. It was an essential part of life in Mohenjo-Daro." },
    { S::JyotiRath, "Wow! These ancient people sure knew how to store food!" },
};
const std::vector<Line> GRAIN_ROAD = {
    { L, "Six sacks of grain for the Great Bath, on you go. Potholes, knocks and rough ground will spill them.", "Granary keeper" },
    { S::JyotiRath, "Smooth driving. Got it." },
};
const std::vector<Line> BATH = {
    { S::Narrator, "Behold, the Great Bath! This large water tank was probably used for ritual bathing. It was the centre of social life in Mohenjo-Daro." },
    { S::JyotiRath, "I can't believe how advanced this civilization was!" },
};
const std::vector<Line> CITADEL = {
    { S::Narrator, "This is the Citadel: the Assembly Hall, where important decisions were made, and the Great Stupa, a Buddhist monument from a later age." },
    { S::JyotiRath, "I wonder what kind of decisions they made here. And Buddhism, here too?" },
    { S::Narrator, "Something old lies in the lanes near the stupa." },
};
const std::vector<Line> CLIMB = {
    { S::Narrator, "Behind the Citadel the sky turns brown. A dust storm is rolling in." },
    { L, "Up to the Upper Town, quick, before it swallows the road!", "Citadel guard" },
    { S::JyotiRath, "Hold on tight!" },
};
const std::vector<Line> UPPER_TOWN = {
    { S::Narrator, "Welcome to the Upper Town of Mohenjo-Daro, with its large public buildings, among them the Great Hall." },
    { S::JyotiRath, "I can't wait to explore the Upper Town!" },
    { S::Narrator, "Its market is the busiest place in the city. Everything you've learned, all at once." },
};
const std::vector<Line> LAMP_ROAD = {
    { L, "The sun's going down, and not one lamp is lit on the road to the plaza. That sun on your prow could light them!", "Lamplighter" },
    { L, "Drive close past each lamp. Every one you light gives you a little more light to drive by.", "Lamplighter" },
    { S::JyotiRath, "Let's light up the city!" },
};
const std::vector<Line> THIEF = {
    { S::Guide, "Stop him! He's quick, but he panics: he always runs to wherever is farthest from you." },
    { S::JyotiRath, "Then I'll leave him nowhere to run." },
};
const std::vector<Line> FINALE_FRAGMENT = {
    { S::Narrator, "Behold, the Dancing Girl! This famous bronze statue found in Mohenjo-Daro is believed to show a young girl in a dancing pose." },
    { S::JyotiRath, "Wow! It's amazing that they were able to create such detailed sculptures so long ago." },
    { S::Guide, "Great work! You've collected some valuable pieces of history. One of them is a fragment of a Buddhist sculpture, from the Kushan period, around the 2nd century AD." },
    { S::JyotiRath, "Interesting. But what does it have to do with Mohenjo-Daro?" },
    { S::Guide, "This sculpture might be connected to the Ajanta Caves in Maharashtra, renowned for their Buddhist art. Perhaps the same artisans worked on both." },
    { S::JyotiRath, "That's amazing! I had no idea there was a link between these two sites." },
    { S::Guide, "It's fascinating how connected these places are. Next stop, Ajanta!" },
};
const std::vector<Line> FINALE_NO_FRAGMENT = {
    { S::Narrator, "Behold, the Dancing Girl! This famous bronze statue found in Mohenjo-Daro is believed to show a young girl in a dancing pose." },
    { S::JyotiRath, "Wow! It's amazing that they were able to create such detailed sculptures so long ago." },
    { S::Guide, "Welcome, traveller. The city is alive again, thanks to you. But somewhere near the Great Stupa lies a fragment of an old sculpture." },
    { S::Guide, "Find it, and it will tell us where your road goes next." },
    { S::JyotiRath, "Back to the Citadel, then!" },
};
const std::vector<Line> NONE = {};

} // namespace

const char* speaker_name(const Line& l) {
    switch (l.who) {
        case Speaker::Narrator: return "Narrator";
        case Speaker::JyotiRath: return "JyotiRath";
        case Speaker::Guide: return "Guide";
        case Speaker::Local: return l.name ? l.name : "";
    }
    return "";
}

const std::vector<Line>& arrival_lines(int board) {
    static const std::vector<Line> arrivals[BOARDS] = {
        { { L, "Whoa, whoa! No racing in the lanes, little chariot. In the city you walk, one step at a time.", "Gatekeeper" },
          { S::JyotiRath, "One step at a time? Then let me light the way." } },
        { { L, "Slow down! Carts in the yard, sacks everywhere. Mind how you go.", "Granary keeper" },
          { S::JyotiRath, "Walking, I promise." } },
        { { L, "Careful, chariot! The Bath's stones sink and rise. One step at a time.", "Bath keeper" },
          { S::JyotiRath, "Light, show me the way across." } },
        { { L, "Halt! The Citadel's watchmen see far down every lane. Step lightly.", "Citadel guard" },
          { S::JyotiRath, "Lightly it is." } },
        { { L, "Make way, make way! Market day in the Upper Town. Walk, don't race!", "Market crier" },
          { S::JyotiRath, "Busy, busy. Here goes." } },
        { { S::Narrator, "The lamps glow round the plaza. There she stands on her plinth: the Dancing Girl." },
          { S::Narrator, "Then a shadow darts out from behind the palms. A masked thief lifts her off the plinth!" },
          { L, "Ha! She's mine now!", "Thief" },
          { S::JyotiRath, "Hey! Put her back!" } },
    };
    return board >= 0 && board < BOARDS ? arrivals[board] : NONE;
}

Figure arrival_figure(int board) {
    switch (board) {
        case 1: case 4: return Figure::Villager;
        case 5: return Figure::Thief;
        default: return Figure::Watchman;
    }
}

Figure departure_figure(const Chapter& c) {
    switch (c.beat) {
        case 2: return c.lower_town == Style::Rough ? Figure::Zebu : c.lower_town == Style::Quiet ? Figure::Villager : Figure::Watchman;
        case 4: case 9: return Figure::Villager;
        case 7: return Figure::Watchman;
        default: return Figure::None;
    }
}

const std::vector<Line>& beat_intro(const Chapter& c) {
    switch (c.beat) {
        case 0: return DESERT;
        case 1: return LOWER_TOWN;
        case 2:
            switch (c.lower_town) {
                case Style::Quiet: return CANAL_QUIET;
                case Style::Rough: return CANAL_ROUGH;
                case Style::Slow: return CANAL_SLOW;
                case Style::Steady: return CANAL_STEADY;
            }
            return CANAL_STEADY;
        case 3: return GRANARY;
        case 4: return GRAIN_ROAD;
        case 5: return BATH;
        case 6: return CITADEL;
        case 7: return CLIMB;
        case 8: return UPPER_TOWN;
        case 9: return LAMP_ROAD;
        case 10: return THIEF;
        case 11: return c.fragment ? FINALE_FRAGMENT : FINALE_NO_FRAGMENT;
        default: return NONE;
    }
}

const std::vector<Line>& board_outro(int board) {
    static const std::vector<Line> outros[BOARDS] = {
        { { S::Narrator, "The Lower Town wakes: walls rise, lamps are lit, neighbours step out of their doors." } },
        { { S::Narrator, "The Granary fills again. Carts roll in from the fields." } },
        { { S::Narrator, "Water pours into the Great Bath, and the colonnade stands tall around it." } },
        { { S::Narrator, "The Assembly Hall's pillars stand whole again, and the stupa gleams white." } },
        { { S::Narrator, "The Upper Town bustles: the market opens, and the Great Hall's doors swing wide." } },
        { { S::Narrator, "Cornered, the thief gives up. He hands back the Dancing Girl, and she goes back on her plinth where she belongs." },
          { L, "Sorry. She's just... so beautiful.", "Thief" } },
    };
    return board >= 0 && board < BOARDS ? outros[board] : NONE;
}

const std::vector<Line>& gift_lines(Tool gift) {
    static const std::vector<Line> beads = { { S::Narrator, "Nobody even noticed you. A trader, impressed, presses a string of beads into your hand." } };
    static const std::vector<Line> bell = { { S::Narrator, "You crossed without a splash or a fuss. The bath keeper gives you a little bronze bell." } };
    static const std::vector<Line> seal = { { S::Narrator, "Not a single watchman disturbed. A scribe gives you a seal of passage." } };
    switch (gift) {
        case Tool::Beads: return beads;
        case Tool::Bell: return bell;
        case Tool::Seal: return seal;
        default: return NONE;
    }
}

const char* fail_text(Fail f) {
    switch (f) {
        case Fail::Fell: return "Whoops! Off the edge.";
        case Fail::Splash: return "Splash! Into the water.";
        case Fail::Caught: return "The zebu caught up with you!";
        case Fail::Late: return "Too late: the gates have closed.";
        case Fail::Spilled: return "All the grain spilled!";
        case Fail::Storm: return "The storm swallowed the road!";
        case Fail::Dark: return "Night fell before you reached the plaza!";
        case Fail::None: return "";
    }
    return "";
}

const char* goal_text(const RunSpec& r) {
    switch (r.goal) {
        case Goal::Reach: return r.shortcut ? "Take the plank bridge to the Granary" : "Follow the road";
        case Goal::Chase: return "Outrun the zebu to the Granary!";
        case Goal::Clock: return "Reach the Granary before its gates close";
        case Goal::Deliver: return "Deliver the grain to the Great Bath";
        case Goal::Storm: return "Climb ahead of the dust storm!";
        case Goal::Lamps: return "Light the lamps on the way to the plaza!";
    }
    return "";
}

} // namespace jr
