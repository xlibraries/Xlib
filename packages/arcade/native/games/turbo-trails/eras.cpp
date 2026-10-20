#include "eras.h"

namespace tt {
namespace {

const Landmark INDIA[] = {
    { "Mohenjo-Daro", "A planned city of 40,000 people with covered drains, 4,500 years ago." },
    { "The Great Bath", "The oldest public water tank in the world, sealed with bitumen." },
    { "Dholavira", "Its reservoirs caught monsoon water for a city in the desert." },
    { "Lothal dockyard", "Possibly the world's first tidal dock, trading with Mesopotamia." },
};
const Landmark ENGLAND[] = {
    { "Ironbridge", "The first bridge made of cast iron, finished in 1779." },
    { "Cugnot's steam dray", "The 1769 steam wagon crawled at walking pace and crashed into a wall." },
    { "Coalbrookdale", "Coke-fired furnaces here lit the Industrial Revolution." },
    { "Rocket's run", "In 1829 Stephenson's Rocket won the Rainhill Trials at 30 mph." },
};
const Landmark FRANCE_1830[] = {
    { "Route Royale", "Post roads let a coach cover 100 km a day with changes of horses." },
    { "Château de Chambord", "A Loire château with a double-helix staircase." },
    { "Vineyards of Burgundy", "Carriages carried the harvest to market before railways did." },
    { "Paris omnibus", "The 1828 omnibus was the first public bus: 14 seats, horse-drawn." },
};
const Landmark GERMANY[] = {
    { "Mannheim", "Bertha Benz drove the first long road trip from here in 1888, 106 km." },
    { "Black Forest", "The first petrol station: a pharmacy in Wiesloch that sold ligroin." },
    { "Heidelberg", "Its castle looks over the Neckar, which Bertha crossed on her trip." },
    { "Pforzheim", "Bertha's destination; she fixed a fuel line with a hatpin on the way." },
};
const Landmark USA_1903[] = {
    { "Milwaukee", "In a 10 by 15 foot shed, Harley and Davidson built their first motorcycle." },
    { "Route 66 (before it was)", "The road that would become Route 66 was still dirt wagon track." },
    { "Oil derricks", "Texas gushers in 1901 made petrol cheap enough for everyone." },
    { "Kitty Hawk", "The same year, the Wright brothers flew for 12 seconds." },
};
const Landmark FRANCE_1911[] = {
    { "Le Mans", "The first Grand Prix was held near here in 1906 on public roads." },
    { "Indianapolis idea", "1911 saw the first Indy 500; France invented the Grand Prix." },
    { "Mulsanne straight", "Six kilometres of straight road, later the fastest part of Le Mans." },
    { "Bugatti's workshop", "Ettore Bugatti's Molsheim cars won by being light, not big." },
};
const Landmark USA_1935[] = {
    { "Monument Valley", "Sandstone buttes 300 metres tall, in Navajo country." },
    { "Dust Bowl road", "Families drove west on these roads in the 1930s droughts." },
    { "Grand Canyon rim", "A mile deep, carved by the Colorado over six million years." },
    { "The Jeep's birthplace", "In 1940 the Army asked for a 4x4 in 49 days. Bantam delivered." },
};
const Landmark ITALY[] = {
    { "Amalfi Coast", "The coast road, cut into cliffs, opened in 1853." },
    { "Maranello", "Ferrari moved its factory here in 1943." },
    { "Mille Miglia route", "A thousand-mile road race from Brescia to Rome and back." },
    { "Modena", "Home of Maserati, balsamic vinegar and opera." },
};
const Landmark USA_1996[] = {
    { "Los Angeles", "The GM EV1 was leased here in 1996, the first modern electric car." },
    { "Silicon Valley", "Where the next electric cars would be designed a decade later." },
    { "Hoover Dam", "Hydroelectric power since 1936, enough for 1.3 million people." },
    { "Pacific Coast Highway", "Along the ocean, with charging stations only a dream in 1996." },
};
const Landmark JAPAN[] = {
    { "Shibuya Crossing", "Up to 3,000 people cross at once, every two minutes." },
    { "Tokyo Skytree", "634 metres, the tallest tower in the world." },
    { "Maglev test track", "The L0 maglev reached 603 km/h floating on magnets." },
    { "Mount Fuji", "3,776 metres, visible from Tokyo on a clear winter morning." },
};

Era make(const char* name, const char* place, const char* year, const char* vehicle, const char* story,
         VehicleSpec spec, TerrainProfile terrain, Rgb sky_top, Rgb sky_bottom, Rgb far, Rgb near, Rgb ground, Rgb ground_top, Rgb body, Rgb accent,
         const Landmark* marks, int count, bool wheels = true, bool electric = false) {
    return Era{ name, place, year, vehicle, story, spec, terrain, sky_top, sky_bottom, far, near, ground, ground_top, body, accent, wheels, electric, marks, count };
}

VehicleSpec vehicle(float w, float h, float wheel_r, float base, float mass, float torque, float speed, float hz, float damp, float grip, float air, bool front, bool rear) {
    VehicleSpec s;
    s.chassis_w = w; s.chassis_h = h; s.wheel_r = wheel_r; s.wheel_base = base; s.wheel_y = -h * 0.45f; s.mass = mass;
    s.max_torque = torque; s.max_speed = speed; s.suspension_hz = hz; s.suspension_damping = damp; s.tyre_friction = grip; s.air_torque = air;
    s.front_drive = front; s.rear_drive = rear;
    return s;
}

const Era ERAS[] = {
    make("Chariots", "Indus Valley, India", "2000 BCE", "JyotiRath, a light racing chariot",
         "The game begins where roads did. You are JyotiRath, a chariot of the Indus Valley, racing between planned cities with covered drains and great baths. Light, quick, and easy to tip: the first wheels taught the world to balance.",
         vehicle(1.5f, 0.42f, 0.34f, 1.15f, 0.9f, 5.0f, 26.0f, 3.6f, 0.6f, 1.1f, 2.4f, false, true),
         { 1.8f, 26.0f, 0.35f, 1.0f, 2400.0f },
         { 0.99f, 0.78f, 0.45f }, { 1.0f, 0.93f, 0.75f }, { 0.78f, 0.55f, 0.36f }, { 0.62f, 0.38f, 0.24f }, { 0.74f, 0.52f, 0.30f }, { 0.93f, 0.75f, 0.45f }, { 0.85f, 0.18f, 0.16f }, { 1.0f, 0.82f, 0.25f },
         INDIA, 4),
    make("Steam", "Shropshire, England", "1769", "A steam carriage with a boiler on its back",
         "To England, where coal and iron turned water into motion. Your steam carriage is heavy and slow to wake, but once the boiler is hot nothing on the road can push harder. The Industrial Revolution is rolling.",
         vehicle(2.0f, 0.7f, 0.42f, 1.4f, 2.2f, 11.0f, 15.0f, 3.0f, 0.8f, 1.0f, 1.6f, false, true),
         { 2.6f, 32.0f, 0.3f, 1.1f, 2400.0f },
         { 0.55f, 0.65f, 0.72f }, { 0.85f, 0.88f, 0.86f }, { 0.45f, 0.55f, 0.42f }, { 0.30f, 0.45f, 0.28f }, { 0.36f, 0.48f, 0.25f }, { 0.52f, 0.68f, 0.32f }, { 0.25f, 0.22f, 0.2f }, { 0.78f, 0.55f, 0.2f },
         ENGLAND, 4),
    make("Carriages", "Loire Valley, France", "1830", "A horse-drawn carriage, tall and elegant",
         "France, by carriage, along post roads lined with vineyards and chateaux. Tall and elegant, a carriage tips if you take a hill too fast, so keep the horses calm and the wheels on the road.",
         vehicle(1.8f, 0.9f, 0.5f, 1.5f, 1.4f, 6.0f, 20.0f, 3.2f, 0.5f, 1.0f, 1.8f, false, true),
         { 2.2f, 30.0f, 0.25f, 0.9f, 2400.0f },
         { 0.62f, 0.78f, 0.95f }, { 0.92f, 0.95f, 0.98f }, { 0.55f, 0.62f, 0.5f }, { 0.4f, 0.55f, 0.32f }, { 0.45f, 0.55f, 0.28f }, { 0.6f, 0.75f, 0.35f }, { 0.2f, 0.25f, 0.45f }, { 0.9f, 0.8f, 0.5f },
         FRANCE_1830, 4),
    make("Motorwagen", "Baden, Germany", "1885", "A three-wheeled Benz Patent-Motorwagen",
         "Germany, 1885. A single cylinder coughs to life under a bench seat: the first car. Thin wheels and little power, but Bertha Benz will prove it can cross the country, fixing it with a hatpin and a garter on the way.",
         vehicle(1.6f, 0.5f, 0.45f, 1.3f, 1.1f, 5.5f, 22.0f, 3.4f, 0.55f, 0.95f, 2.0f, false, true),
         { 2.3f, 28.0f, 0.4f, 1.1f, 2400.0f },
         { 0.6f, 0.7f, 0.82f }, { 0.9f, 0.9f, 0.9f }, { 0.35f, 0.45f, 0.4f }, { 0.25f, 0.38f, 0.28f }, { 0.4f, 0.42f, 0.3f }, { 0.55f, 0.62f, 0.38f }, { 0.3f, 0.3f, 0.32f }, { 0.75f, 0.6f, 0.3f },
         GERMANY, 4),
    make("Motorcycles", "Great Plains, USA", "1903", "An early Harley-Davidson",
         "America, 1903. Two wheels, a single cylinder and the open plains. A motorcycle rewards balance: lean into the throttle, land on the back wheel, and the road is yours.",
         vehicle(1.3f, 0.3f, 0.38f, 1.25f, 0.6f, 6.5f, 30.0f, 4.5f, 0.6f, 1.15f, 3.2f, false, true),
         { 2.0f, 24.0f, 0.5f, 1.2f, 2400.0f },
         { 0.45f, 0.65f, 0.95f }, { 0.95f, 0.85f, 0.65f }, { 0.75f, 0.65f, 0.45f }, { 0.62f, 0.52f, 0.32f }, { 0.68f, 0.55f, 0.32f }, { 0.82f, 0.7f, 0.4f }, { 0.55f, 0.1f, 0.1f }, { 0.9f, 0.9f, 0.9f },
         USA_1903, 4),
    make("Grand Prix", "Sarthe, France", "1911", "A Grand Prix racer, low and fast",
         "Back to France for the birth of motorsport. Your racer is fast and low, and that is the problem: bumps that a cart would shrug off will send you flying. Speed is only useful if you keep it.",
         vehicle(2.2f, 0.4f, 0.36f, 1.7f, 1.0f, 7.5f, 38.0f, 5.0f, 0.65f, 1.3f, 2.2f, false, true),
         { 1.6f, 36.0f, 0.55f, 1.3f, 2400.0f },
         { 0.5f, 0.7f, 0.9f }, { 0.9f, 0.92f, 0.85f }, { 0.5f, 0.6f, 0.45f }, { 0.35f, 0.5f, 0.3f }, { 0.5f, 0.5f, 0.45f }, { 0.62f, 0.62f, 0.55f }, { 0.1f, 0.3f, 0.7f }, { 0.95f, 0.95f, 0.95f },
         FRANCE_1911, 4),
    make("Off-road", "Canyonlands, USA", "1935", "A four-wheel-drive truck with big tyres",
         "The American West in a 4x4. Big tyres, both axles driven, and canyons that drop away under you. This is where off-road driving was invented, one rock at a time.",
         vehicle(1.9f, 0.7f, 0.5f, 1.4f, 1.8f, 12.0f, 20.0f, 3.0f, 0.7f, 1.5f, 2.0f, true, true),
         { 3.2f, 22.0f, 0.6f, 1.4f, 2400.0f },
         { 0.95f, 0.6f, 0.35f }, { 1.0f, 0.85f, 0.6f }, { 0.75f, 0.4f, 0.3f }, { 0.6f, 0.3f, 0.22f }, { 0.7f, 0.42f, 0.28f }, { 0.85f, 0.55f, 0.35f }, { 0.35f, 0.4f, 0.25f }, { 0.9f, 0.85f, 0.6f },
         USA_1935, 4),
    make("Sports cars", "Amalfi Coast, Italy", "1950", "An Italian roadster",
         "Italy, 1950, a roadster on the coast road. Quick, grippy, beautiful. The cliffs are close and the corners are closer; drive like the road was drawn for you, because it was.",
         vehicle(1.9f, 0.45f, 0.36f, 1.5f, 1.1f, 8.0f, 34.0f, 4.6f, 0.7f, 1.4f, 2.3f, false, true),
         { 1.9f, 30.0f, 0.4f, 1.1f, 2400.0f },
         { 0.3f, 0.6f, 0.95f }, { 0.85f, 0.92f, 1.0f }, { 0.4f, 0.5f, 0.6f }, { 0.3f, 0.42f, 0.4f }, { 0.55f, 0.5f, 0.42f }, { 0.7f, 0.65f, 0.5f }, { 0.85f, 0.1f, 0.1f }, { 0.95f, 0.9f, 0.7f },
         ITALY, 4),
    make("Electric", "California, USA", "1996", "An electric coupe, silent and quick",
         "America, 1996. No engine noise, only the hum of a motor and full torque from a standstill. Your battery is your fuel, and the charging stations are few. The future has started, quietly.",
         vehicle(1.9f, 0.5f, 0.35f, 1.5f, 1.3f, 9.0f, 32.0f, 4.4f, 0.75f, 1.3f, 2.2f, true, true),
         { 2.0f, 30.0f, 0.3f, 1.0f, 2400.0f },
         { 0.08f, 0.08f, 0.25f }, { 0.35f, 0.2f, 0.45f }, { 0.15f, 0.15f, 0.3f }, { 0.1f, 0.1f, 0.22f }, { 0.2f, 0.2f, 0.25f }, { 0.35f, 0.35f, 0.4f }, { 0.75f, 0.8f, 0.85f }, { 0.2f, 0.9f, 1.0f },
         USA_1996, 4, true, true),
    make("Hover", "Tokyo, Japan", "2025", "A hover vehicle on a magnetic cushion",
         "Tokyo, 2025 and a little beyond. Your vehicle floats on a magnetic cushion, so the road hardly matters, until you leave it. The last chapter is about where roads go next.",
         vehicle(2.0f, 0.45f, 0.3f, 1.5f, 1.0f, 5.5f, 36.0f, 2.6f, 0.9f, 1.2f, 2.6f, true, true),
         { 1.2f, 40.0f, 0.15f, 0.8f, 2400.0f },
         { 0.05f, 0.03f, 0.12f }, { 0.25f, 0.08f, 0.35f }, { 0.12f, 0.08f, 0.25f }, { 0.08f, 0.05f, 0.18f }, { 0.1f, 0.1f, 0.15f }, { 0.2f, 0.6f, 0.8f }, { 0.9f, 0.9f, 1.0f }, { 1.0f, 0.3f, 0.7f },
         JAPAN, 4, false, true),
};

} // namespace

constexpr int COUNT = sizeof(ERAS) / sizeof(ERAS[0]);
static_assert(COUNT == 10, "ten eras");

const Era& era(int index) { return ERAS[index < 0 ? 0 : index >= COUNT ? COUNT - 1 : index]; }
int era_count() { return COUNT; }

} // namespace tt
