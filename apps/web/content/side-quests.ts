// Aman's life outside work, for the Side Quests app: quests, earlier adventures, hobbies and lore.
// Travel stats and routes come from public/side-quests/*.json (scripts/side-quests/); everything here is
// curated by hand. Places are town centres, never addresses.

export type LatLng = [number, number];
export type Rarity = "Legendary" | "Epic" | "Rare" | "Common";

export interface Quest {
    title: string;
    when: string;
    where: string;
    rarity: Rarity;
    tags: string[];
    at: LatLng;
    story: string;
}

export const QUESTS: Quest[] = [
    {
        title: "The Kedarnath Run",
        when: "Oct 2026",
        where: "Rajasthan · Haryana · Uttarakhand",
        rarity: "Legendary",
        tags: ["Road trip", "Himalayan trek"],
        at: [30.735, 79.067],
        story: "Eleven days and about 3,400 km behind the wheel: Jaipur out to Jodhpur, an overnight drive with a midnight dhaba stop at Murthal, then up the Ganga past Haridwar, Rishikesh and Devprayag to trek to Kedarnath at 3,583 m.",
    },
    {
        title: "Parvathamalai",
        when: "Jul 2026",
        where: "Tamil Nadu",
        rarity: "Epic",
        tags: ["Trek"],
        at: [12.44, 78.97],
        story: "One of the toughest temple treks in the south: a steep climb to the hilltop shrine, finishing on rock-cut steps and iron rails.",
    },
    {
        title: "Monsoon Goa",
        when: "Aug 2026",
        where: "South Goa",
        rarity: "Rare",
        tags: ["Train", "Monsoon"],
        at: [15.25, 73.93],
        story: "Overnight train to Madgaon and a few rain-soaked days in South Goa: Benaulim, Cavelossim and the green backroads towards Sanguem.",
    },
    {
        title: "Srirangapatna Ride",
        when: "Aug 2026",
        where: "Karnataka",
        rarity: "Common",
        tags: ["Day ride"],
        at: [12.42, 76.69],
        story: "A day out on the old Mysuru road: Channapatna, Srirangapatna and on to Mysuru.",
    },
    {
        title: "Arunachala Drive",
        when: "May 2026",
        where: "Tamil Nadu",
        rarity: "Common",
        tags: ["Road trip"],
        at: [12.23, 79.07],
        story: "A weekend drive to Tiruvannamalai, the temple town at the foot of Arunachala.",
    },
    {
        title: "Year-End Goa",
        when: "Dec 2025",
        where: "North Goa",
        rarity: "Rare",
        tags: ["Train", "Beaches"],
        at: [15.6, 73.74],
        story: "Train to Londa, then Christmas week in North Goa: Vagator, Morjim, Arambol and the old fort at Tiracol.",
    },
    {
        title: "Dudhsagar with the Team",
        when: "Dec 2025",
        where: "Goa",
        rarity: "Epic",
        tags: ["Trek", "Waterfall"],
        at: [15.31, 74.31],
        story: "A weekend with work friends: the trek to Dudhsagar falls, a boat ride at sunset and long evenings at the beach shacks.",
    },
    {
        title: "Puliyari Hills Off-Road",
        when: "Nov 2025",
        where: "Karnataka · Tamil Nadu border",
        rarity: "Rare",
        tags: ["Motorcycle", "Off-road"],
        at: [12.7, 78.0],
        story: "An impromptu ride that turned into a proper off-road trail. About 170 km on the bike that day.",
    },
    {
        title: "Kodaikanal Road Trip",
        when: "2025",
        where: "Bengaluru → Kodaikanal → Bengaluru",
        rarity: "Rare",
        tags: ["Road trip", "Hills"],
        at: [10.24, 77.49],
        story: "Bengaluru to Kodaikanal and back by car: hairpin bends up the Palani hills, misty viewpoints, pine forests and the lake.",
    },
    {
        title: "Rameswaram to Trivandrum",
        when: "Earlier",
        where: "Bengaluru → Rameswaram → Thiruvananthapuram → Bengaluru",
        rarity: "Epic",
        tags: ["Road trip", "Coast"],
        at: [9.29, 79.31],
        story: "A big loop down the peninsula by car: Bengaluru to Rameswaram across the Pamban bridge, over to Thiruvananthapuram on the Kerala coast, and home again.",
    },
    {
        title: "Edayilakkad Island Run",
        when: "Earlier",
        where: "Bengaluru → Edayilakkad → Bengaluru",
        rarity: "Rare",
        tags: ["Road trip", "Backwaters"],
        at: [12.15, 75.16],
        story: "A road trip to Edayilakkad, a tiny island in the Valiyaparamba backwaters of north Kerala, and back to Bengaluru by car.",
    },
];

// Earlier adventures, from memory rather than the Timeline export (approximate pins)
export const MEMORIES: { name: string; at: LatLng }[] = [
    { name: "Lohagad Fort", at: [18.71, 73.48] },
    { name: "Visapur Fort", at: [18.72, 73.49] },
    { name: "Sus Hill", at: [18.55, 73.75] },
    { name: "Marunji Hill", at: [18.62, 73.73] },
    { name: "Bhushi Dam", at: [18.76, 73.39] },
    { name: "Kasarsai Dam", at: [18.62, 73.66] },
    { name: "Pataleshwar Caves", at: [18.53, 73.85] },
    { name: "Lonavala", at: [18.75, 73.41] },
    { name: "Igatpuri", at: [19.7, 73.56] },
    { name: "Penukonda Fort", at: [14.08, 77.6] },
    { name: "Kolar Gold Fields", at: [12.96, 78.27] },
    { name: "Kotilingeshwara", at: [13.0, 78.26] },
    { name: "Nandi Hills", at: [13.37, 77.68] },
    { name: "Mysuru", at: [12.3, 76.64] },
    { name: "Ooty", at: [11.41, 76.7] },
    { name: "Kodaikanal", at: [10.24, 77.49] },
    { name: "Rameswaram", at: [9.29, 79.31] },
    { name: "Thiruvananthapuram", at: [8.52, 76.94] },
    { name: "Edayilakkad", at: [12.15, 75.16] },
    { name: "Kanha National Park", at: [22.33, 80.61] },
    { name: "Pench National Park", at: [21.7, 79.32] },
    { name: "Pachmarhi", at: [22.47, 78.43] },
    { name: "Kedarnath", at: [30.735, 79.067] },
];

export const ORIGINS: string[] = [
    "Sahyadri forts: Lohagad, Visapur, Sus Hill, Marunji",
    "Bhushi & Kasarsai dams, Pataleshwar Caves",
    "Penukonda Fort & Kolar Gold Fields",
    "Mysuru, Ooty & Nandi Hills",
    "Kanha, Pench & Pachmarhi",
    "Lonavala & Igatpuri",
];

export const SKILLS: { icon: string; name: string; note: string }[] = [
    { icon: "🏍️", name: "Riding", note: "3,674 km on two wheels in the last year, off-road trails when the tarmac gets boring, and his own bike maintenance." },
    { icon: "🥾", name: "Trekking", note: "Kedarnath at 3,583 m, Parvathamalai, Dudhsagar and the Sahyadri forts." },
    { icon: "🎮", name: "Game design", note: "Builds game worlds for fun: Project Balod (a UE5 tactical squad shooter on a fictional island with dynamic weather), Legends of Emperor (a 1v1 arena battler with 18 warrior classes), a 2000 BCE chariot level and TowerStack." },
    { icon: "🎵", name: "Songwriting", note: "Writes original songs. Debugging Love is on YouTube (see Lore)." },
    { icon: "🎨", name: "Painting & digital art", note: "Paints on canvas and on screen." },
    { icon: "🏸", name: "Badminton", note: "Late-evening rallies, most weeks." },
    { icon: "🛼", name: "Roller skating", note: "Skated almost every day through 2022." },
    { icon: "♟️", name: "Chess", note: "Daily puzzles." },
    { icon: "💃", name: "Dance", note: "Never says no to a dance floor." },
    { icon: "🚀", name: "Model rocketry", note: "Builds and launches small rockets." },
    { icon: "🎤", name: "Stand-up comedy", note: "Open-mic regular (from the audience)." },
    { icon: "🗣️", name: "Public speaking", note: "Toastmasters, and welcoming freshers to the college robotics club back in the day." },
    { icon: "🎲", name: "Board games", note: "Shows up to board-game meetups." },
];

export const LORE: string[] = [
    "Pick your constants carefully and play with variables.",
    "Stop trying to 'find' the Elite seat. Build the table.",
];

export const SONG_ID = "aaHlegqIIik";

// Town centres, not addresses
export const HOME_BASE: { name: string; detail: string; at: LatLng } = { name: "Katangi", detail: "Madhya Pradesh 481445", at: [21.77, 79.8] };
export const WORK_BASE: { name: string; at: LatLng } = { name: "Bengaluru", at: [12.97, 77.59] };
