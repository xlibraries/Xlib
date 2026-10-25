# JyotiRath: plan

The "Roads Through Time" design (ClickUp, the same as Turbo Trails') told as a story in 3D: JyotiRath, the golden
chariot, travels India one checkpoint at a time, across floating dioramas. Level 1 is ten checkpoints
(Mohenjo-Daro → Ajanta → … → INS Kursura); each is a chapter. JyotiRath is the "Vicky" of the design doc: the one
who talks.

## The idea: the place decides how you move

In a city you can't race: the lanes are full of carts, watchmen and animals, so you think one step at a time.
That's the **board** (turn-based, in the style of Hitman GO). Between places the road opens up and speed and nerve
matter. That's the **drive**. Most of a chapter is boards (about 70%); drives are short (45–90 s) and carry you
from one district to the next. Neither stands alone: each produces what the other needs.

### Drives give boards their tools

Artifacts are tools, each with one use on the boards. You carry **two at most**, so picking one up is a choice;
the good ones sit on the risky lines of a drive.

| Tool | On a board |
| --- | --- |
| Unicorn seal | A trader's pass: one watchman waves you through |
| Grain sack | Dropped on your node: the zebu comes to eat it and stays two turns |
| Bronze bell | Every watchman turns round for two turns |
| Beads | Every cart driver waits two turns |

Using one takes a turn. A bad drive means scraping through the next board the hard way; a good one means
arriving with options.

### Boards decide the next drive

How you solve a board changes the drive after it:

- **Quietly** (nobody nudged): a grateful local shows you **the shortcut** on the next drive. Shortcuts are rare
  because they're earned.
- **Roughly** (you nudged the zebu, or several others): the zebu is angry and the next drive is **a chase**.
- **Slowly** (well over par): the next drive is **against the clock** (the Granary's gates are closing).
- Otherwise the drive is the place's own challenge: deliver the grain without spilling it, or climb before
  the dust storm closes in.

### Within a level: consequence, restoration, story

- **Consequence**: your choice on a board changes the next drive straight away. That's the hook: what happens if
  I solve it the other way?
- **Restoration**: Mohenjo-Daro starts as ruins, as the design doc describes. Clearing a district's board brings
  it back to life in front of you: walls rise, lamps light, the Great Bath fills, people return.
- **Story through objects**: some artifacts are clues, not tools (the Buddhist fragment points to Ajanta); they
  unlock the doc's lore and the next chapter.

Between chapters (later): coins for the doc's upgrades (Mohenjo-Daro: Engine 400), a museum of artifacts,
cosmetics.

## Chapter I: Mohenjo-Daro

| # | | What happens |
| --- | --- | --- |
| 1 | Drive | The desert road, a tutorial. Thrown onto the road ("Whoa, where am I?"); the signboard; the first tool |
| 2 | **Board** | The Lower Town: carts, watchmen, the zebu. Ruins until you clear it |
| 3 | Drive | The canal road. Chase, clock or shortcut, depending on how you solved the Lower Town |
| 4 | **Board** | The Granary: push sacks into the lanes to block carts and sight lines. You leave with grain |
| 5 | Drive | The grain road: deliver the sacks to the Great Bath; potholes and knocks spill them |
| 6 | **Board** | The Great Bath: stepping stones that sink every other turn |
| 7 | **Board** | The Citadel (the Assembly Hall and the Great Stupa): pillars that block long sight lines; the fragment |
| 8 | Drive | The climb: a dust storm closing in from behind |
| 9 | **Board** | The Upper Town and the Great Hall: everything at once |
| 10 | Story | The Dancing Girl; the Guide; the fragment points to Ajanta |

A failed drive or a caught board starts that beat over; nothing else is lost. Progress (the beat, your tools,
the districts restored) is saved on the device.

## Look

- **Mid-poly, made in code** (`mesh.h`: lathes, spheres, capsules, tori, rounded boxes, swept tubes, with a little
  deliberate imperfection). The chariot and charioteer follow the golden concept art; every building, prop and
  character is built in `models.cpp`, each district twice: ruined and alive.
- **Pixar-styled shading** (`shaders/jyotirath.glsl`): GGX specular with a sky reflection, wrapped diffuse, warm
  subsurface on skin, translucent leaves and cloth, soft shadows from a depth map, hemisphere ambient, per-vertex
  AO, a rim light, ACES tone mapping; then tilt-shift, bloom and a grade in the post pass.
- **The diorama**: the land is a ribbon either side of the road, its cut edge showing earth strata. Boards are
  painted on it with white nodes and lines.

## Code

| File | What |
| --- | --- |
| `mesh.h/.cpp` | Mesh builder and primitives |
| `track.h/.cpp` | The road (a turtle walk of arcs), its zones, the land, heights, props, colliders |
| `go.h/.cpp` | Boards: pieces, sacks, sinking stones, sight lines, tools, the rules, the solver |
| `boards.cpp` | Chapter I's five boards |
| `drive.h/.cpp` | Handling, collisions and a drive's goal (reach, chase, clock, deliver, storm) |
| `chapter.h/.cpp` | The chapter's beats, your tools, the consequences of each board, restoration, saving |
| `story.h/.cpp` | What's said, beat by beat |
| `models.h/.cpp` | Every model; the land in chunks, the districts ruined and alive |
| `main.cpp` | Rendering, the camera, both modes, dialogue and HUD, sound |

Everything but `main.cpp` is graphics-free and tested natively.
