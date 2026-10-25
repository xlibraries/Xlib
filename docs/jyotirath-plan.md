# JyotiRath: plan

The "Roads Through Time" design (ClickUp, the same as Turbo Trails') told as a story you drive: JyotiRath, the
golden chariot, travels India one checkpoint at a time, on a road laid across a floating diorama in the style of
Hitman GO's tabletop boards. Level 1 is ten checkpoints (Mohenjo-Daro → Ajanta → Khajuraho → … → INS Kursura); each
is a chapter. **Chapter I, Mohenjo-Daro**, is built. JyotiRath is the "Vicky" of the design doc: the one who talks.

## Chapter I: Mohenjo-Daro

One continuous road, about 1.3 km, through the doc's stretches (its distances doubled):

| Stretch | What happens |
| --- | --- |
| The empty desert | JyotiRath falls onto the road. "Whoa, where am I?" The narrator explains the keys; drive 30 m |
| The barren desert | Dunes, cacti, camel bones, tumbleweeds blowing across; ends at the "Welcome to the land of the Indus Valley Civilization" signboard |
| The Lower Town | Narrow lanes between mud-brick houses, wells, rugs, baskets, potholes, pottery, handcarts crossing |
| The Granary, the Great Bath, the Assembly Hall, the Great Stupa | Each stops you: the narrator's line, then JyotiRath's |
| The Upper Town | The road climbs; wider streets, market stalls, the Great Hall |
| The plaza | The Dancing Girl on her plinth; the Guide explains the Buddhist fragment and its link to the Ajanta Caves |

- **Driving**: W/S/A/D (and arrows, a gamepad). Brake into a turn to drift. Sand is slow; hills pull you back.
- **Fuel**: drains as you drive; **artifacts** on the road (seals, beads, figurines, shards, bronzes, and the
  Buddhist fragment) refill it. Handcarts knock some off.
- **Failing**: running dry or driving off the edge of the land puts you back at the last checkpoint (each
  landmark is one).
- **The story** (`story.cpp`, lines from the doc's script): reaching a stop pulls you up. The narrator speaks on a
  parchment card at the bottom; JyotiRath and the Guide in speech bubbles over their heads. Space, Enter or a
  click moves on.
- **The end**: a chapter card with your artifacts and time, and "Next: the Ajanta Caves".

## Look

- **Mid-poly, made in code** (`mesh.h`: lathes, spheres, capsules, tori, rounded boxes, swept tubes, with a little
  deliberate imperfection). The chariot and charioteer follow the golden concept art; every building, prop and
  character is built in `models.cpp`.
- **Pixar-styled shading** (`shaders/jyotirath.glsl`): GGX specular with a sky reflection (gold reads as gold),
  wrapped diffuse, warm subsurface on skin, translucent leaves and cloth, soft shadows from a depth map, hemisphere
  ambient, per-vertex AO, a rim light, ACES tone mapping; then tilt-shift, bloom and a grade in the post pass.
- **The diorama**: the land is a ribbon either side of the road, its cut edge showing earth strata. A narrow lens
  looks up the road from behind and to the side, turning slowly with it.

## Code

| File | What |
| --- | --- |
| `mesh.h/.cpp` | Mesh builder and primitives |
| `track.h/.cpp` | The road (a turtle walk of arcs), its zones, the land's width, heights, props, colliders, artifacts, potholes, handcarts |
| `story.h/.cpp` | Chapter I's script: the stops, their lines, objectives and checkpoints |
| `drive.h/.cpp` | Handling, collisions, fuel, the journey's phases (landing, talking, driving, respawning, complete) |
| `models.h/.cpp` | Every model; the land built in 50 m chunks |
| `main.cpp` | Rendering (shadow, 4× MSAA scene, post), streaming chunks, camera, dialogue and HUD, sound |

All but `main.cpp` are graphics-free and tested natively (`tests/native/jyotirath_test.cpp`): the road's geometry,
the story's order, the handling, fuel and respawns, and an autopilot that drives the whole chapter, stopping at
every stop. The e2e test drives the start in a browser.

## Next

| | |
| --- | --- |
| **GO-style prototype** | The Lower Town as a turn-based node board (Hitman GO): move one node a turn past carts on patterns, behind a toggle, to compare with free driving |
| **Checkpoint 2: Ajanta Caves** | Narrow passages, carvings; the doc's suspension and tyre upgrades |
| **Upgrades** | The doc's per-checkpoint shop (Mohenjo-Daro: Engine 400) |
| **Phones** | Touch controls |
