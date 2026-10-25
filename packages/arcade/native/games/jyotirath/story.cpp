#include "story.h"
#include "track.h"

namespace jr {

const char* speaker_name(Speaker s) {
    switch (s) {
        case Speaker::Narrator: return "Narrator";
        case Speaker::JyotiRath: return "JyotiRath";
        case Speaker::Guide: return "Guide";
    }
    return "";
}

const std::vector<Stop>& chapter_one() {
    using S = Speaker;
    static const std::vector<Stop> stops = {
        { 0, "", {
            { S::JyotiRath, "Whoa, where am I?" },
            { S::Narrator, "You find yourself thrown onto an empty, vast desert road. You're in the middle of nowhere." },
            { S::JyotiRath, "What's going on? What am I supposed to do here?" },
            { S::Narrator, "Use W, A, S and D to drive. Explore the barren desert." },
        }, "Drive 30 m", true },
        { 30, "", {
            { S::JyotiRath, "Okay, this is kind of cool." },
            { S::Narrator, "Collect the broken artifacts on the road: they keep you going." },
        }, "Explore the desert", false },
        { at::SIGNBOARD, "Indus Valley", {
            { S::Narrator, "As you explore the barren desert, you come across a signboard: \"Welcome to the land of the Indus Valley Civilization.\"" },
        }, "Follow the road into the city", true },
        { at::LOWER_TOWN, "The Lower Town", {
            { S::Narrator, "You come across the Lower Town: mud-brick houses, narrow lanes and wells. Mind the potholes." },
        }, "Find the Granary", true },
        { at::GRANARY, "The Granary", {
            { S::Narrator, "You have arrived at the Granary. This large building was used for grain storage. It was an essential part of life in Mohenjo-Daro." },
            { S::JyotiRath, "Wow! These ancient people sure knew how to store food!" },
        }, "On to the Great Bath", true },
        { at::GREAT_BATH, "The Great Bath", {
            { S::Narrator, "Behold, the Great Bath! This large water tank was probably used for ritual bathing. It was the centre of social life in Mohenjo-Daro." },
            { S::JyotiRath, "I can't believe how advanced this civilization was!" },
        }, "Find the Assembly Hall", true },
        { at::ASSEMBLY, "The Assembly Hall", {
            { S::Narrator, "This is the Assembly Hall, in the Lower Town. It is believed to have been used for administration. It's where important decisions were made." },
            { S::JyotiRath, "I wonder what kind of decisions they made here. It must have been interesting!" },
        }, "On to the Great Stupa", true },
        { at::STUPA, "The Great Stupa", {
            { S::Narrator, "You have arrived at the Great Stupa. This large Buddhist monument is believed to have been built in the later period of Mohenjo-Daro's history." },
            { S::JyotiRath, "Interesting. So, this civilization had connections to Buddhism?" },
        }, "Climb to the Upper Town", true },
        { at::UPPER_TOWN, "The Upper Town", {
            { S::Narrator, "Welcome to the Upper Town of Mohenjo-Daro. Here you will find several large public buildings, including the Great Hall." },
            { S::JyotiRath, "I can't wait to explore the Upper Town!" },
        }, "Find the Great Hall", true },
        { at::GREAT_HALL, "The Great Hall", {
            { S::Narrator, "You have arrived at the Great Hall, a large public building in the Upper Town. It was likely used for meetings and public gatherings." },
            { S::JyotiRath, "I can imagine the important conversations and decisions that took place here!" },
        }, "Reach the plaza", true },
        { at::DANCING_GIRL, "The Dancing Girl", {
            { S::Narrator, "Behold, the Dancing Girl! This famous bronze statue found in Mohenjo-Daro is believed to show a young girl in a dancing pose." },
            { S::JyotiRath, "Wow! It's amazing that they were able to create such detailed sculptures so long ago." },
            { S::Narrator, "As you collect these ancient artifacts, you gain insight into the rich history of the region." },
            { S::Guide, "Great work! You've collected some valuable pieces of history. One of them is a fragment of a Buddhist sculpture, from the Kushan period, around the 2nd century AD." },
            { S::JyotiRath, "Interesting. But what does it have to do with Mohenjo-Daro?" },
            { S::Guide, "This sculpture might be connected to the Ajanta Caves in Maharashtra, renowned for their Buddhist art. Perhaps the same artisans worked on both." },
            { S::JyotiRath, "That's amazing! I had no idea there was a link between these two sites." },
            { S::Guide, "It's fascinating how connected these places are. You never know what you might discover next!" },
        }, "", true },
    };
    return stops;
}

} // namespace jr
