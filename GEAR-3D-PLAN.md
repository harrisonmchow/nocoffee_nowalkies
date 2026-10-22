# Gear in 3D: build plan

Status: M0–M2 built, most of M4's gear level, and M3's two remaining camps (Caleb's and Mikey's) without the hub, which waits while `/gear/` is hidden (see Progress). Written 16 October 2026 on branch `harry-feature/3d-modelling`, against three.js r186 (`0.186.1`) and the Astro 7.3 site already in this repo. Updated 17 October 2026 with your answers; the decision log is §11.

Scope: four crew tabs on `/gear/` (Harry, Caleb, Mikey, Kevin). Each tab is a biome with a campsite. Each camp has a second level showing that person's gear and a 3D figure of them in their own kit, with hotspots that open a small panel.

## Progress

**M0 done (17 October 2026).** The foundations are in place, and nothing on the site looks different yet.

- **World:** `src/world/` holds `boot.ts`, `World.ts`, the clock, seeded random and tier guess, the route reader, the test hook and the debug panel. `#world` sits in `GearLayout.astro`, persisted across gear pages, and only clears to bone for now.
- **Switches:** the world is off by default (`PUBLIC_GEAR_WORLD`, set to `on` at launch). `?world=on` or `?world=off` is remembered per browser, `?world=auto` forgets it, and `?world=force` skips the reduced-motion, Save-Data and slow-GPU checks for one load. Dev and test builds also take `?debug`, `?freeze`, `?t=`, `?seed=` and `?tier=`.
- **Content:** the `camps` collection with sample files for all four people, plus optional `colour` and `scene` fields on gear items. The sample camp items carry placeholder `scene` models.
- **Tests:** `npm test` runs 62 checks on desktop Chromium, an emulated Pixel 7 and WebKit, against a production build:
  - 21 fallback screenshot baselines;
  - axe results kept as text snapshots;
  - the world starting, clearing to exact bone and surviving three client navigations as the same canvas;
  - three.js never loading on `/` or `/photos`.
  `npm run test:update` re-records baselines, and contact sheets land in `tests/.output/sheets/`.
- **Measured:** three.js costs about 127 KB gzip (82.5 KB for the world chunk, 44.8 KB for `three.core`), and only once the world starts. The boot script is 2.1 KB.
- **Found along the way:** axe flags issues that predate this work: secondary text in `#787774` on bone is about 4.1:1 (AA needs 4.5:1), and the figure hotspots' accessible names don't include their visible numbers. With the canvas behind the page, axe can't measure contrast over it, so from M4 the tests sample the pixels behind hotspots instead. `npm run check` reports two type errors that also predate this work, in `Sign.astro` and `gear/reviews/[review].astro`.

**M1 done (17 October 2026): Harry's camp.** Still behind the switch: nothing changes on the site until the world is turned on.

- **Terrain:** each camp's ground is generated in a Web Worker from plain-JS height fields (`scene/terrain-fields.ts`), on a grid that packs vertices toward the camp; props are placed from the same functions, so they sit exactly on it.
  - Harry's is a col: the tent sits just back from a rounded brow, the ground falls about 700 m into a valley, ridges climb either side, and a horn with a ridge of lesser peaks stands across the valley.
  - Snow, rock and ground come from height, slope, cavity and ridge masks, with wind-packed sastrugi in the detail normal near the camera.
- **Sky:** an analytic gradient, a cube-face star lattice, the Milky Way, and the aurora: the skill's curtains drawn into a small sky texture and looked up by direction (every frame on high, every 2nd and 4th frame on mid and low).
- **Clouds (changed from §4.1):** the cloud sea isn't cards. It's a slab that every surface shader and the sky work out along their own view rays (`WORLD_CLOUD` in `shaders/chunks.ts`):
  - one secant step finds the billow tops, like parallax mapping;
  - opacity comes from how far the ray travels inside, so mountains fade into the cloud by how deep they stand, with nothing to sort.
  - Cards and stacked slices were tried first. Seen this low, they read as sea ice, and dark slopes ghosted through them like reflections.
  - Soft billboard puffs drift wherever they float clear of the ground. The pointer field pushes and thins both.
- **Camp:** a dome tent with a lit door, boulders, and the campfire (flame cards, instanced embers, a glow sprite and one flickering point light).
- **Camera:** the station is framed into the stage beside the panel with a lens shift, has a portrait pose for phones, and has the bounded look-around.
- **Validated** in `tests/camps.spec.ts`:
  - budgets asserted at whatever tier each run guesses (draw calls, triangles, shader programs);
  - colour checks (aurora green in the sky, the fire's glow, a night scene);
  - frozen captures at the design, near and far views, and a field mosaic;
  - a cursor sweep, with the history decaying after;
  - a 390×844 @2x framing check;
  - contact sheets in `tests/.output/sheets/`.
- **Still to do:** frame times on a real iPhone and a mid-range Android. Headless runs use SwiftShader, so they can't measure speed (§9).

**M2 done (17 October 2026): Kevin's camp and the travel between camps.**

- **Kevin's camp:** a frozen lake in a high basin, the camp on its south shore.
  - Spruce-dark slopes climb to a castellated ridge with terraced cliff bands: instanced spruces near the water, and a forest mask painted on the ground further out.
  - A clear sky, with the Milky Way crossing it and a moon at the frame's edge.
  - Wisps of mist on the ice (small, low puffs).
- **The Director (changed from §5.1):** one 2.2 s timeline.
  - 0–0.55 s: the colour drains to a grey clay model of the camp as the camera lifts away. Clouds and ground keep their shapes in limbo; only the palette changes.
  - 0.55–0.95 s: the world dissolves into the page's paper.
  - 1.0 s: the camps swap under the paper.
  - 1.05–1.6 s: the new camp emerges in grey.
  - 1.6–2.2 s: the colour returns as the camera settles onto the station.
  - The page's HTML swaps once the old camp has drained. A camp that isn't built yet holds under the paper, and after 3 s a thin line runs under the tabs.
  - Reduced motion cuts through paper, and scene time stands still. The 2D gear pages fade to and from paper.
  - Why paper rather than rising cloud: each camp has its own terrain, with clouds at very different heights (above Harry's valley, none over Kevin's lake). Paper hides the swap reliably, and it ties the world to the site's bone.
- **Wiring:**
  - `/gear/<person>/` pages are connected through the ClientRouter, with the persisted tab bar and `aria-current` updated after each swap.
  - Prefetch on hover, focus and touch, and `compileAsync` before a camp is first shown.
  - Interrupts: a new target re-veils from wherever the timeline is, so an abandoned camp is never seen. Back and forward work too.
- **Validated:**
  - a 12-frame contact sheet of Harry to Kevin, seeked through the Director;
  - pure paper (bone, no colour) at the swap instant;
  - an interrupt (Caleb clicked mid-leave, and Kevin's camp never shows);
  - back, prefetch on hover, and the hold with its loading line;
  - reduced motion;
  - frame times on WebKit's real GPU, in their own `frames` project that runs last and alone. The first, cold travel must stay under 100 ms per frame, and the travel back under 50 ms.
- **Measured** (WebKit on this Mac):
  - a travel holds about 60 fps (median 17 ms, p95 19 ms);
  - the worst frames are 30–40 ms: the new camp's first draws, plus about 30 ms for the page's own HTML swap.
  - Phones still need measuring on real devices.
- **Deviation:** no GSAP. The Director is its own small deterministic timeline, which tests seek frame by frame. The world's JavaScript is about 169 KB gzip: the world chunk is 112 KB, three's core 54 KB and the terrain worker 3 KB.
- **Fixed along the way:**
  - Clearing to paper wrote bone's linear values into the canvas (237, 235, 229 instead of 247, 246, 243). three caches the GL clear colour from its last render, which was the pointer field's linear render target. The world now sets the colour again before clearing, so the paper veil matches the page exactly.
  - Pre-compiling the next camp while the current one was visible counted two campfire lights. Programs are keyed on the light count, so every material recompiled when the new camp first showed: a 145 ms frame. The current camp is now hidden for the compile.
  - A newly built camp is drawn once into a single scissored pixel of the next frame, before the real draw covers it. Its buffers then upload, and its pipelines build at the canvas's own format, before it's revealed rather than on the reveal.
- **Caleb and Mikey** are still placeholders. They're built properly in M3.

**M4's gear level done early (17 October 2026), ahead of M3: each camp's landscape, campsite and tent.** Asked for directly, so it comes before Caleb's and Mikey's biomes.

- **On by default (changed from M0):** `PUBLIC_GEAR_WORLD` now defaults to `on`, and every camp file says `ready: true`. `?world=off` turns the world off in one browser (remembered until `?world=auto`). Devices that can't run it, reduced motion and Save-Data still get the 2D pages, which are unchanged.
- **Three levels per camp (changed from §3.4 and §5.4):**
  - **Landscape** (`/gear/<person>/`): the camp seen from afar in its landscape, with a pulsing marker and a "Go to <name>'s campsite" link on it.
  - **Campsite** (`/gear/<person>/camp/`, a new page): reached by the marker, the opened panel's **Go to campsite**, or scrolling (or, on a phone, swiping up). Scrolling zooms toward the camp, then dives.
  - **Tent:** an in-page state of the campsite, not a URL.
- **Moving between the levels:**
  - The dive is 1.8 s, and in the middle the camera passes through a full-screen cloud (`scene/fly-through.ts`).
  - Rising back is 1.6 s, the same way. Both stay in the camp's own colours, with no paper.
  - Tabs still travel through paper, landscape to landscape.
- **Scrolling (decided while building):** scrolling down always goes in and scrolling up comes back out. With scroll-down-to-zoom-out at the campsite, one long trackpad flick could dive in and straight back out. Pulling back past the campsite's far limit rises to the landscape; in the tent, scrolling up leaves it.
- **The campsite:**
  - A bounded orbit: drag to look around, scroll or pinch to zoom, ground-clamped.
  - A stand-in figure in the person's clothing colours, the tent, and the kit placed per camp layout.
  - Hovering lights a thing up in its own colour and shows its card. The person's card lists their clothing, with what's packed; a piece of kit shows its name, brand, weight and a link to its page. Clicking pins the card.
  - Clicking the tent goes inside instead: the camera flies to the door, the fly fades to a ghost, and a warm light comes on. The sleeping bag (or quilt), mat, pillow and headtorch each get a hotspot and card.
  - Esc closes a card, then leaves the tent, then goes up a level.
  - Hotspots are real buttons (keyboard and touch work). They hide under the page's own UI and spread apart when two would overlap.
- **The page:** over a 3D camp, the person panel is a small card (360 px wide, top right on a wide screen) that starts minimized: the way back (at the campsite; the landscape is the top level), the name (48 px rather than 2D's 136 px) and a **Setup details** button. The button opens the rest: the kit tags and keys, **Go to campsite** on the landscape, and the setup details (weights, categories, write-up). The shot reframes when it opens, and jumps rather than slides with reduced motion. In 2D the panel is always open, as before.
- **Phones:**
  - The crew tabs scroll sideways, with the current one scrolled into view. Before, they widened the page, which pushed the fixed canvas past the screen's edge.
  - Hints sit at the foot of the visible stage, above the panel (and above the camp's marker when it lies low), and say "swipe" and "pinch" on touch screens.
- **Kevin's landscape, now the first view of his tab:** from afar, the noise texture's tiling showed as rows of blobs on the ice and camouflage on the slopes.
  - Each terrain octave now sums two lookups at unrelated scales and angles.
  - The forest's edges follow the ground: it holds to the hollows, gives out on the ridges, and has only broad clearings. Its canopy is frosted.
  - The ice has drifts stretched along the wind.
- **Stand-ins (`scene/gear-models.ts`):** the figure, pack, stove and pot, bottle, mat, sleeping bag, quilt, pillow and headtorch, each merged into one mesh per material. A pillow was added to every sample kit, with its own 2D drawing.
- **Measured** (desktop, high tier), all inside the biome budget of 60 calls, 250k triangles and 24 programs:

  | Camp | Landscape | Campsite | Programs |
  | --- | --- | --- | --- |
  | Harry | 19 calls, 98k triangles | 37 calls, 106k triangles | 13 |
  | Kevin | 21 calls, 219k triangles | 39 calls, 227k triangles | 14 |

  The mid tier keeps the calls and drops the triangles (71k and 139k at the campsites).
- **Validated** in `tests/camps.spec.ts`:
  - budgets and colours for both views of both camps;
  - the panel starting minimized, its size, and the shot moving when it opens;
  - the dive seeked frame by frame, with a contact sheet, and the rise on Esc;
  - scrolling in, the dive, zooming and pulling back out;
  - hover cards for the person and the tent, and a pinned card with its link;
  - the tent and its sleep system;
  - a phone run: swipe to dive, tap for cards (on screen), tap into the tent, and the button out;
  - on a phone, nothing wider than the screen, and the current tab in view.

  Also axe with the world running on both pages (`tests/a11y.spec.ts`), and a 2D fallback baseline for `/gear/harry/camp/` (`tests/fallback.spec.ts`).
- **Not yet, from M4's list:**
  - zoned clothing hotspots (the person has one);
  - easing the camera to frame an open card;
  - the camp shadow;
  - dithered fade-ins;
  - geometry-kit audit captures;
  - Caleb's and Mikey's camera framings, which stay placeholders until M3.

**From your notes, later on 17 October 2026.**

- **Gear opens Harry's camp.** The header and footer Gear links go to `/gear/harry/`.
  - The everyone page (`/gear/`) is hidden: still built, marked `noindex`, and nothing links to it.
  - The reviews list's way back goes to Gear's new home.
  - A person's landscape is now the top level: it has no way back, Esc does nothing there, and its key hint drops "Esc back".
- **The card:** its bone ground is 85% opaque, so the camp shows through; the text stays solid.
- **Hotspots are pins:**
  - Each dot sits 30 px above the top of its thing (from its bounding box), on a stem with a small foot.
  - The mat's dot hangs below its front edge, because the bag lies on it.
  - Dots nudged apart get slanted stems.
  - When the camp is small on screen (zoomed out), the dots shrink to 60% and sit closer.
- **Tabs like the reference:** names in capitals straight over the scene, the others dimmed, the current one bright with an underline that draws in. On paper between camps they turn to ink (`data-world-paper`).
- **A dog at Harry's campsite (and, since, Caleb's):** `dog: true` in a camp file adds a generic stand-in (`createDog`).
  - About 55 cm at the shoulder, side-on between the person and the fire.
  - Its tail wags; it costs 5 draw calls.
- **Cloud in front of Harry's landscape** (`scene/foreground-clouds.ts`):
  - A full-screen layer, thick along the bottom and up the sides, and clear around the camp.
  - The cursor's history (the same pointer field) thins it and pushes it along; it fills back in as the history fades.
  - It's anchored to the view direction, so the camera's turn slides it. It swells and thins as you fly in, and is gone for the dive and in the tent.
  - A biome opts in with `foreground`. Harry's cloud sea now has `pointerInfluence: 0`, so it no longer reacts. The pointer debug view shows the raw history.
- **Measured** (desktop, high tier): Harry's landscape is 20 calls, 98k triangles and 14 programs; his campsite 42 calls and 110k triangles.
- **Validated:**
  - a cursor sweep through the cloud in front parts it, and it fills back in, while a sweep over the cloud sea changes nothing (with the camera held still; new `holdLook` and `pixels` hooks);
  - the dog, and the cloud in front, only where they belong (new `shows` hook);
  - each dot above its thing;
  - nothing links to the everyone page, and it's `noindex`;
  - the tabs turn to ink on paper;
  - the 2D person page baseline, re-recorded without its back link.

**M3 done (17 October 2026), except the hub: Caleb's and Mikey's camps.** The hub waits, since `/gear/` is hidden and nothing links to it.

- **Caleb: autumn under Japanese maples** (`scene/maples.ts`, `scene/leaf-fall.ts`).
  - The maples grow by the vegetation skill's structured Ash system, with an Acer palmatum species table: a short trunk forking low into a few leaders, wide spreading tiers, fine twigs.
  - Recorded divergences from the Ash contract: radius-driven terms (gnarliness, tropism) measure radius in 8 cm units, since the scene is in metres; leaves are sprays of three palmate leaves on one drawn texture; the perpendicular twin card only near each twig's tip.
  - Near the camp, about 23 full growths (three seeded variants, instanced, high tier), ringed around the clearing with a clear corridor for the cameras. Out to 700 m, cheap maples: a trunk and crown cards painted with many small leaves.
  - Leaves are coloured per tree from an autumn palette, darker deep in the crown, fluttering from their roots, and glowing when back-lit by the low sun.
  - A carpet of fallen leaves around the tent, and about 100 leaves (60 on mid) drifting down through the clearing, each on its own phase.
  - From afar, the terrain's canopy covers the valley (with a clearing around the camp) and is painted as separate crowns: a cell per tree, shaded as a dome, each tree red or amber. A few evergreens among the maples.
  - Light: a low golden sun from ahead, warm haze lying in the valley, mist puffs on the floor, cool blue shade; mossy rock and soil.
- **Mikey: the coast at sunset** (`scene/sea.ts`, `scene/dune-grass.ts`).
  - The sea follows the water-optics skill's authored analytic surface: one wave list gives the normal and the crest metric; finer ripples add to the normal only and fade before they're unresolved. Fresnel from the air side, against the sky's own radiance; the body is the sand bed at its true depth (sea level less the heightmap), absorbed per channel along the refracted path, plus the water's scatter; the sun's glitter path; foam from the crest metric and where waves break in the shallows. The last metre of depth fades out, so the waterline is soft.
  - Decision: normal-only at every tier (no geometric displacement or crest parallax), since the nearest water is about 100 m from the campsite camera. The bed is shaded from the heightmap, not refracted scene colour; crest foam is instantaneous.
  - The swash, on the terrain (`swash`, run-up height): each wave runs up the beach as a thin sheet and slides back, out of step along the shore, leaving dark glossy wet sand and a foam line.
  - Two terrain fixes on the way: the beach had a 1.2 m step at the waterline (so no swash could show), and the far range's `max` lifted the whole seabed to sea level, so the water had no depth at all.
  - Marram grass in clumps on the dunes and the flat, swaying from the root. A placeholder dual-cab ute (`createCar`: glossy paint, dark glass, an open tray) on the sand, the tent pitched beside it, Mikey between them.
  - Light: the sun low over the sea ahead, lit cloud bands near the horizon, gold and rose highlights over teal-blue shade.
- **What's planted has its own seed** (`?seed=`, 1 by default), so a sweep changes the trees, leaves and grass without moving the land the cameras are framed on.
- **Measured** (desktop, high tier): Caleb's landscape about 30 calls, 205k triangles and 18 programs, his campsite 48 calls and 213k; Mikey's landscape 28 calls and 108k triangles, his campsite 46 calls and 117k. Both stay inside the budget on the mid tier as well.
- **Validated** in `tests/biomes.spec.ts`:
  - each camp's own things are drawn, within budget, on the high and mid tiers, landscape and campsite;
  - a screenshot matrix (landscape, campsite, tent × two tiers, desktop and phone) to a contact sheet;
  - a seed sweep of Caleb's grove: three seeds, the same species, the camp's triangle count within 15%;
  - the sea's diagnostic channels (crest, true depth, Fresnel): depth grows away from the shore, the water far out reflects more than near it, and crests stand up.
- **Not yet:** fern and bamboo-grass undergrowth and leaves on Caleb's tent fly; Mikey's coastal shrubs and the headland's rock detail; reflections in the car's paint (no environment map yet); the camp shadow; checks on real devices.

**Every landscape keeps its camp on screen (17 October 2026).** The camps sat about 78% of the way down the frame, off the bottom of a short window. Now each landscape camera, and its zoom target and portrait variant, is lowered or raised, keeping the way it looks, until its camp is at the middle of the unshifted frame (`seat` in `biome-set.ts`). The page's frame shift then puts it 60% of the way down. Moving the camera rather than tipping it keeps each horizon and sky where it was composed. A camera never comes within 25 m of the ground, which is why Kevin's camp sits a little lower, at 68%. The sea's diagnostics are now taken from a fixed view on the beach, since from the lower landscape camera the waves are finer than a pixel and filtered away, as designed.

**Harry's tent is his real one (18 October 2026): the Zorali SummitSeeker 2P.** Rebuilt in code from the product page's four photos and its listed size, through the img2threejs skill's pipeline, and pitched in Harry's camp in place of the stand-in.

- **How it's built** (`scene/summitseeker-geometry.ts`), the way the tent is pitched:
  - Two main poles run corner to corner on the floor's diagonals, crossing at the hub. Their arch, y = 1.075 (1 - |u|^2.3), is fitted to the side and end photos: flatter on top than a parabola.
  - The brow pole arches across the crown at the crossing, its tips at the two door tops.
  - The inner hangs inside the poles from its clips. Each ring is a quadrilateral through the four pole arms, bowed a little, with its door tops pulled out toward the brow pole's tips. A tan bathtub runs 8.5 cm up, a teal band to 24 cm, then grey mesh with seams along the corners, and a yellow-zipped D door on each side.
  - The fly is the tightest skin over its supports: the convex hull of the poles and brow pole (lifted 2 cm), the corner tabs, the two vestibules' stakes (1.32 m out) and the vents' props, with the bottom left open. That's what gives the photos' flat, taut panels and straight vestibule edges. It's 146 triangles, with normals smoothed across the folds along the poles and kept sharp at the creases.
  - The trim follows the fly: each vestibule's door is its head-side face, piped from the stake up the ridge, under the crown and down the head arm, with rounded corners like the photo's D. Also the hem binding, toggles on cords, a light ridge-and-sun mark (no lettering), the vents' mouths, clips, pole feet, and straps and stakes at the corners and vestibules.
  - Colours are sampled from the photos. Every material is flat colour: the ripstop is below a pixel at every distance the camp shows it.
- **In the camp** (`scene/summitseeker.ts`): 64 parts merged by material into four meshes, in the world's own materials, plus a door panel that glows softly at night with the headtorch inside. About 14.5k triangles and 5 draw calls.
  - It keeps the stand-in's contract: you can point at it (the fly, its door and the floor under the hem), the fly fades to a ghost and the mesh thins to look inside, and the headtorch lights the inside.
  - `camp.ts` now pitches a real tent when a camp's tent item names one (`proc:tent/zorali-summitseeker-2p`); every other camp keeps the stand-in. The camp map in `GearLayout.astro` carries each person's tent, so the real one is pitched as soon as the camp is built: it's there from the landscape, and compiled with the rest of the camp.
  - Decision: no snow on the fly in Harry's snowy camp. Its teal is what makes it this tent, and snow on its sloping panels washed it to beige.
- **Content:** Harry's tent item has the brand line "Zorali SummitSeeker 2P" and a link to the product page. No weight yet, so his totals don't change until it's weighed.
- **Measured** (desktop, high tier): Harry's campsite went from 42 to 44 calls, 110k to 128k triangles, and 17 to 18 programs.
- **Validated:** a new test checks that Harry's camp pitches the SummitSeeker (from the landscape and at the campsite) and that Kevin's keeps the stand-in, and the tent's card names it. The full suite passes apart from the WebKit frame-time check, which is flaky on this machine with or without the tent: over its limits in 3 of 13 runs with it and 1 of 5 without, with typical worst frames of 25–50 ms either way. The tent's geometry takes about 16 ms to build on desktop (48 ms cold), when its camp is built rather than during travel. Harry's budget test now covers the tent. The fallback screenshot of the tent's 2D page is re-recorded with its brand and link; its count was also stale ("4 of 9" before the headtorch, power bank and first aid kit were added).
- **The pipeline's record** (outside the repo, in the session's workspace):
  - The intake, a spec of 64 components generated from the same part list, strict validation, and the blockout, structural and form passes, each rendered from the generated factory and reviewed against the photos. Tier 1 silhouette overlap with the primary photo is 0.95.
  - It stopped at the material pass, where its target was already reached: 0.80 against 0.70, with every critical feature at or above its bar. That pass's per-part colour check matches all 16 colours against a render's five dominant ones, so it can't pass for a tent whose inner, poles and zips hide under the fly. Measured per material instead: the fly, band and mesh are within delta-E 10 of the photos.
- **Not yet:** the vents' visors are subtler than the photos'; the inner door's exact cut and the far side are inferred; the other three camps still have the stand-in.

**Harry's pad, pillow and chair are his real ones (20 October 2026): the NEMO Tensor All-Season, the NEMO Fillo and the Alton Lightweight Camp Chair.** Each was rebuilt in code from its product page's photos and listed size, through the img2threejs skill's pipeline. The pad and pillow replace the stand-ins in Harry's tent, and the chair is new, by the fire.

- **How they're built:** as with the tent, each model's parts are described as data first and then built, so the review renders, the pipeline's specs and the camp all use the same numbers. `scene/kit-geometry.ts` holds what the three share.
  - **The pad** (`scene/tensor-geometry.ts`): the quilted top's height is one function, with 20 baffles along and 9 domed cells across each (counted on the top-down photo), valleys 45% of the top's rise deep and dimples between cells 30%. The top rounds over a squared-off edge to a seam that dips under each valley, over a red-orange base. Each baffle's end bulges 1.5 cm, so the edge is scalloped. The valve, loop and marks sit on the same function, so they lie on the cells exactly.
  - **The pillow** (`scene/fillo-geometry.ts`): two faces rise from a seam over round shoulders to a domed middle, with the corners pinched lower. Its ten stripes (2.6 cm apart and 4 mm wide, measured on the front photo) and the back's navy panel are vertex colours with hard edges, not textures.
  - **The chair** (`scene/alton-chair-geometry.ts`): its frame (hubs, feet and pole tips) and the three photos' cameras were solved together from 28 points measured on the photos, to 12 px rms on 2,000 px. The sling's corners, front edge, seat, seam, patch, slits and pocket were then triangulated from the photos through those cameras. Each of its cross-sections runs from a centre line out to side edges that bow outward, rising gently across the centre panel and then sharply into the side panels. The sling sits slightly skewed on the frame, as the photos show; about half of the measured skew is kept.
  - Colours were sampled from crops of the photos. Every material is flat colour: the chair's ripstop grid is averaged into its colour, since it is below a pixel at camp distances.
- **In the camp** (`scene/kit-models.ts`): each model is merged into one mesh per material in the world's own materials, coloured per vertex. The pad and pillow are one draw call each and the chair two (fabric and frame). They keep the stand-ins' contract: their own highlight, a hotspot and a card.
  - `camp.ts` picks real kit by `proc:<type>/<variant>` (`REAL_KIT`), and every other camp keeps the stand-ins. The real pad says how high things rest on it, so the bag and pillow lift onto its 8.4 cm top. The real pillow lies across the pad's head.
  - The chair stands at a new `chair` spot in Harry's layout (`biome-set.ts`), by the fire and facing it, three-quarter on to the view. Only a camp with that spot and a real chair gets one.
- **Content:** Harry's pad and pillow items have brand lines ("NEMO Tensor All-Season (Regular Wide)", "NEMO Fillo (Silt Stripe)") and links. There is a new chair item (brand line "Alton Lightweight", so it reads "Alton Lightweight Camp chair", with a link), a new `chair` gear type in the flat-lay's "Kitchen and kit" zone, and its drawing. No weights yet, so Harry's totals don't change.
- **Measured** (desktop, high tier): Harry's campsite went from 44 to 46 calls and from 128k to 156k triangles, with programs unchanged at 18 (no new shaders).
- **Validated:** the campsite test now expects the chair's hotspot, and its card names it. A new test checks that Harry's camp shows the real pad, pillow and chair and Kevin's the stand-ins. The pillow's card names the Fillo.
  - The full suite's first run: 116 passed, 10 failed.
  - Re-recorded as intended changes:
    - the flat-lay fallback screenshots (desktop, phone and WebKit), which add the chair and the brand lines; that baseline still read "Tent", from before Harry's tent had its brand line;
    - the axe snapshots of Harry's page and camp page, where an existing label-mismatch entry carries the item count, now 11.
  - Three camp tests timed out under the suite's software-WebGL load and pass when run on their own: Kevin's camp, the SummitSeeker test and going into the tent.
  - The contact sheets and the WebKit frame-time test pass.
  - The biome checks for Caleb's and Mikey's camps time out on this machine at the moment (3 of 5 on desktop, 2 of 3 on phone, different tests on each run). The last commit, without these changes, times out the same way.
- **The pipeline's record** (outside the repo, in the session's workspace):
  - For each model: the intake, a spec generated from the same part list, strict validation, and passes rendered from the generated factory, patched to build from the shipped parts, and reviewed against the photos.
  - The pad and chair went through all eight passes to completion, with part coverage and the action-ready hierarchy checked. Tier 1 silhouette overlap with the primary photo is 0.865 for the pad and 0.853 for the chair.
    - The chair is compared with its photos' own segmentation: the chair's pixels are kept, and the studio's soft floor shadow is set to the background, since that shadow is the photo's light and not the chair. Against the raw photo, the best light-matched render reaches 0.80.
  - The pillow stopped at the material pass, where its target was already reached (0.84 against 0.70, with every critical feature at or above its bar). That pass's per-part colour check can't see the pillow's back (underneath in the primary photo) or its trims (a few pixels each). Measured per material from an ID render instead, the cover is within delta-E 5 of the front photo.
- **Not yet:** the marks' and patch's lettering; the ripstop's grid; the pillow's corners are a little rounder than the photo's soft points; chairs for the other camps.

**Kevin's camp has a snow leopard (22 October 2026), the first third-party model and the first GLB.** "Snow leopard by Poly by Google [CC-BY] (https://creativecommons.org/licenses/by/3.0/) via Poly Pizza (https://poly.pizza/m/26tTvxyxkPC)", credited on `/credits` as §6.7 asks.

- **The asset** (`src/assets/3d/snow-leopard.glb`): the Poly Pizza download, repacked by hand. It keeps the same mesh (988 triangles, standing, facing +z). Its 2048² PNG became a 1024² WebP (`EXT_texture_webp`), and its sampler was switched to trilinear. The credit is in `asset.copyright`. That took it from 1.8 MB to 127 KB. Vite emits it with a hashed name.
  - There's still no `scripts/assets/` pipeline: one GLB didn't justify it. The repack script is in the session's workspace, not the repo.
- **Loading** (`scene/snow-leopard.ts`): `GLTFLoader` is imported dynamically, so its 44 KB chunk loads only for Kevin's camp. The GLB is fetched while Kevin's terrain tile builds (`buildBiomeSet`).
  - If the fetch fails, the camp is built without the leopard.
  - Its mesh is redrawn in the world's own prop material, with no snow, so the haze, grade and firelight treat it like the rest of the camp.
  - Its painted coat (about 0.19 albedo) graded down to a black cat at night, so the material's colour is lifted 1.8×.
- **Where it stands** (`LEOPARD` in `biome-set.ts`): on the open snow in front of the camp, side-on to the view and walking toward the fire. Scaled to about 1 m long and 0.6 m at the shoulder.
  - Spots by the stove and past the fire looked better on desktop, but they sat under the stove and water hotspots or fell outside a phone's narrower frame.
  - This spot is clear of every hotspot and in the default frame on both.
  - It isn't kit, so it has no hotspot or card.
- **Measured** (desktop, high tier): Kevin's campsite is at 40 calls, 228k triangles and 16 programs, all within budget.
- **Validated:**
  - A new camp test checks that Kevin's camp shows the leopard with no hotspot and that Harry's camp has none. Every Kevin test passes on desktop and phone.
  - The fallback screenshots and axe snapshots are unchanged. The footer link is now "Credits", since the page credits the model as well as the photos.

**Harry's pack is his real one (22 October 2026): the Osprey Aether 65 Men's, Large/X-Large, in Deep Water Blue.** It was rebuilt in code from Harry's own two photos of it, from the front and from behind, and its listed size (80 × 40 × 28 cm), through the img2threejs skill's pipeline. It replaces the stand-in pack in his camp.

- **How it's built** (`scene/aether-geometry.ts`): as with the other kit, the parts are described as data first and then built.
  - The bag and lid are one soft loft: superellipse cross-sections from a closed, rounded base up through the lid's overhang to its domed top, fitted to both photos' silhouettes. The front pocket stands 2.2 cm proud.
  - The harness has an arched back panel. The shoulder straps and hip belt are padded bands swept along paths. Unworn, each side hangs the way its photo shows it: the left strap and wing as in the front photo, the right wing flopped open behind as in the back photo.
  - The front's straps, buckles, reflective oval, cords and prints were placed through the photo's fitted camera: a render of the body's surface positions was read at each feature's pixels. That puts them within about a centimetre of the photo.
  - The colours were calibrated region by region, so that the review render matches the photo under the studio's light. The lid's colour is about the body's: it looks lighter in the photo only because it faces the light. The prints are faint tints, and their lettering isn't reproduced.
- **In the camp** (`createOspreyAether` in `scene/kit-models.ts`): three meshes, for the nylon body and lid, the harness, and the trim, coloured per vertex. It stands at the stand-in's spot, and at 80 cm it's taller than the stand-in was (65 cm). `REAL_KIT` picks it by `proc:pack/osprey-aether-65`; every other camp keeps the stand-in pack.
- **Content:** Harry's pack item has a brand line ("Osprey Aether 65") and a link to its listing. No weight yet, so Harry's totals don't change (the listing gives 2.1 kg).
- **Measured** (desktop, high tier): Harry's campsite went from 46 to 47 calls and from 156k to 171k triangles, with programs unchanged at 18.
- **Validated:** the real-kit test now covers the pack: Harry's camp shows the Aether, and Kevin's keeps the stand-in. The campsite test opens the pack's card and checks its brand. Every camp test passes on desktop, phone and WebKit, as do the other suites. The fallback screenshots and axe snapshots are unchanged.
- **The pipeline's record** (outside the repo, in the session's workspace):
  - The intake, a spec of 47 components generated from the same part list, strict validation, and the blockout, structural and form passes, each rendered from the generated factory and reviewed against the photos. Tier 1 silhouette overlap is 0.87 with the front photo and 0.85 with the back one.
  - Like the tent's and the pillow's, it stopped at the material pass, where its target was already reached (0.80 against 0.70). That pass's per-part colour check can't see the grey harness webbing from the front view, where it covers about 1,000 of 495,000 pixels. Every other material clears it.
  - Measured per material from an ID render instead: the nylon is within delta-E 5.5 of the front photo, the blue webbing 2.0 and the prints 4.5. Part coverage and the action-ready hierarchy check out, though the stop leaves them unrecorded in the pipeline's checklist.
- **Not yet:** the wearer's right side, which mirrors the left because no photo shows it; the lettering on the lid and the AETHER 65 print; the ripstop and hex textures; the hip belt's lumbar pad, which is taller in the photo.

---

## 0. Decisions at a glance

| Topic | Recommendation |
| --- | --- |
| Framework | Keep the existing Astro site and add vanilla three.js. No React, no Next. |
| Renderer | `WebGLRenderer` (WebGL2), with GLSL injected through `onBeforeCompile`. WebGPU is not needed for anything in this plan. |
| Versions | `three@0.186.1` and `@types/three@0.186.0`, pinned exactly (no `^`). GSAP was planned but isn't needed: the Director keeps its own timeline (M2). |
| Routes | `/gear/` overview, `/gear/<person>/` biome, `/gear/<person>/camp/` gear level (new). `#<item>` on the camp page opens a hotspot panel. The existing 2D pages stay as the fallback and detail views. |
| Tab order | Harry, Caleb, Mikey, Kevin. This is now the order everywhere on the site (`src/data/site.ts`). |
| Canvas | One canvas inside a `transition:persist` element in `GearLayout.astro`. Only gear pages ever load the 3D code. |
| World | One terrain mesh with four camp zones, re-shaded per biome through uniforms. Per-biome set dressing and per-person camps load lazily. |
| Clouds | Same mechanism as the reference: noise-distorted shader cards and instanced puffs, pushed by a screen-space pointer-history buffer. No raymarched cloud volumes. |
| Look | Full colour like mont-fort for the 3D scenes, with the style guide relaxed for them. The UI around them stays exactly as it is now. |
| Tab change | Leave, then pass through a desaturated "limbo" built from the site's own bone and charcoal, travel, then arrive. About 2.2 s and interruptible. |
| People | Stylised stand-ins for now, standing still and recoloured to each person's clothing. Scans replace them later. |
| Gear models | Generic placeholders for now: parametric tent, pad, quilt, pillow, stove, pot and bottle, a simple pack, and a free (CC0) car with Mikey's tent beside it. Scans or bespoke models replace them later. |
| Campfire | One in every camp, for atmosphere: flame cards, embers and a gently flickering warm light. |
| Sound | None. |
| Compression | Meshopt geometry and KTX2 textures via gltf-transform, with a size and triangle budget check in the build. |
| Mobile | DPR capped at 1.5, no post-processing on the mid tier (grading happens in-material), adaptive render scale, posters when the device is weak. |
| Fallback | Posters rendered from the real scenes by Playwright, plus the existing 2D ink gear pages. No video. |
| Data | Gear stays in `src/content/gear/<person>.yaml`, which gains an optional `scene` block. A new `src/content/camps/<person>.yaml` holds the biome and the camp title. |

---

## 1. What the reference actually does

I studied mont-fort.com with Playwright at 1440×900 and in an iPhone-sized 390×844 @3x context. That covered its network traffic, the JSON headers of its GLBs, the minified app bundle and frame captures of every tab change. The captures and contact sheets are in the session scratchpad (not in the repo) at `/private/tmp/claude-501/-Users-harrychow-nocoffeenowalkies-website/9209855d-c29a-4805-b871-2739e03d8f16/scratchpad/ref-study/`.

**Matches your notes**

- Astro 5.18.2 with `ClientRouter`. The persisted elements are `webgl`, `header`, `menu`, `cursor`, `sound`, `transition-hero` and `footer`.
- three.js r169, in one WebGL2 context with antialias off, alpha on and `powerPreference: high-performance`.
- Lenis and GSAP ScrollTrigger. Scroll scrubs a global `uChapter` uniform, and the terrain vertex shader sinks the mountain with it (`transformed.y -= uChapter * 1.5`).

**Different from what you expected**

- **None of the GLBs are compressed.** They are plain Blender exports, using only `EXT_mesh_gpu_instancing` or `KHR_materials_unlit`. `mountains.glb` is 1.46 MB, one chapter file is 3.18 MB because it embeds a JPEG, and the homepage pulls a 6.7 MB globe. A page weighs 6.4 MB (Fort Energy) to 9.8 MB (home), and phones get the same files. Its loader has fields for mobile variants and KTX2, but none of the assets I inspected use them. Compression is where we can beat it most easily.
- **The camera is authored in Blender.** `mountains.glb` holds polylines named `CameraPath`, `TargetPath`, `Path-TopChapters` and a separate `TargetPath-Mobile` for portrait framing, plus an empty anchor per section (`Homepage`, `Trading`, `FortEnergy`...). One chapter GLB carries five Blender cameras with `LookAt` targets. The code turns the polylines into `CatmullRomCurve3`s.
- **The clouds are 2D.** The cloud meshes are quads (2 triangles each) plus instanced puffs. The fragment shader distorts a vertical UV band with scrolling Perlin and noise textures and `smoothstep`s it into soft layers. The puffs are radial sprites distorted by noise.
- **The cursor interaction is a render target.** A "mouseComputation" pass keeps a screen-space trail texture. Each cloud shader samples it at `gl_FragCoord.xy / uResolution`, jittered by noise, and pushes its UVs by the value (`dUv += .05 * mouse`). The trail decays, so the clouds settle back. On touch devices the pass is never created, so phones get no cloud interaction at all.
- **Re-shading is a config swap on one material.** The single 67k-triangle mountain uses `MeshStandardMaterial` with `onBeforeCompile` chunk injection. Each page applies a config made of:
  - a baked lightmap specific to that page;
  - two tiling detail maps (snow, rock or grass) blended by a snow/rock mask;
  - env-map rotation and intensity, plus an ambient colour;
  - fog near and far, with the fog mixing toward a per-page light colour from a two-colour palette (`uLightColor`, `uDarkColor`).
- **Pages are classes.** Each has `beforeEnter` and `afterLeave`, and that is where set dressing (a lake, the sea, an island, an energy cone) is added and removed. The WebGL transition starts on `astro:before-preparation`, before the new HTML has arrived, and the next page's assets are queued in advance.
- **Tab changes always pass through a neutral limbo.** Frame captures of all four tab changes show the same three phases:
  1. The current scene desaturates to warm grey while a cloud bank rises (0.5 to 1 s).
  2. The camera travels through a grey cloud sea while set dressing swaps out of sight.
  3. The destination's colour blooms back.
  The whole change takes 3.5 to 6 s. Biomes never crossfade directly into each other. The code also has a drag and long-press "slideshow" mode for the tabs.
- **What it skips:** it has no `prefers-reduced-motion` handling and no post-processing composer, caps DPR at 2 on phones, and renders planar reflections (a second scene render) for its lake and sea.

**What we keep:** the persistent canvas, one shared terrain re-shaded by config, Blender-authored camera stations, 2D cloud cards with a pointer-history buffer, and uniform-driven limbo transitions that start on `before-preparation`.

**What we change:** compressed assets with real mobile variants, analytic reflections instead of planar mirrors, reduced-motion and no-WebGL paths, cloud interaction on touch drags, and shorter transitions that can be interrupted.

---

## 2. Skill routing (Three.js Awesome Graphics pack v0.12.0)

These choices follow `threejs-skill-router`. Each skill is loaded only while building the system it owns, and anything the pack doesn't cover is listed below instead of being forced onto the nearest skill. The pack examples we reuse (aurora curtains, snow accumulation, meadow grass, ping-pong pointer history, the LUT atmosphere) are written against `ShaderMaterial`, `onBeforeCompile` and `WebGLRenderTarget`, so they carry over directly to a WebGL renderer.

| System | Skill | What we take from it | Tier notes |
| --- | --- | --- | --- |
| Camera stations, portrait framing, handoffs, pointer look | `threejs-camera-direction` | Offsets derived from subject size; one interpolation stage per handoff (lerp position, slerp orientation); input yaw and pitch only within declared limits; projection updates when near/far change; camera ownership restored when leaving `/gear` | all |
| Transition phases, springs, leaf fall, hotspot focus moves | `threejs-procedural-animation` | Phase timelines, frame-rate-independent springs, exact terminal pose at the end of a move, seeded motion | all |
| Terrain masks (snow, rock, litter, sand, wetness) and cloud density | `threejs-procedural-fields` | One field bundle feeding every channel, with a debug view per field | all |
| Terrain and gear surface response | `threejs-procedural-materials` | Texture-backed snow, soil, moss and sand with procedural masks; specular AA for snow sparkle and wet sand; PBR identities for tent and pack fabrics | fewer samples on mid |
| Parametric gear (tent, pad, quilt, pillow, pot, bottle) | `threejs-procedural-geometry` | Its portable geometry-quality kit (loft, revolve, sweep, pillow panels, solidify, bevels) and its topology, coplanar and clash audits | build time or runtime |
| Maples, conifers, undergrowth, dune grass | `threejs-procedural-vegetation` | Species tables, queue-grown branches, leaf cards with crown-volume normals, rooted wind, distance tiers | trees generated at build time |
| Sky, sun and moon, haze | `threejs-atmosphere-aerial-perspective` | The skill's "small scene" analytic tier. The sky and terrain haze share one sun direction and one set of coefficients | all |
| Snow cover, snow caps on tent, rocks and trees, snowfall | `threejs-precipitation-surfaces` | World-space snow mask with an upward-facing filter, snow height and normals from one source, camera-wrapped snowfall with shared wind | no falling snow on low |
| Aurora, campfires, optional lens flare | `threejs-procedural-vfx` | The aurora curtain field and its equirectangular probe material; instanced analytic sparks for embers; one explicit HDR emission ranking for fire, tent glow and aurora | per-pixel aurora on high only |
| Star fields and the Milky Way | `threejs-raymarched-space-effects` | Only the celestial-sphere star lattice (flux-conserving, filtered by pixel footprint) and the galactic band. No curved rays | all |
| Sea and lake ice | `threejs-water-optics` | Analytic multi-wave displacement with matching normals, side-aware Fresnel, analytic sky reflection, absorption from true depth (we have the heightmap), crest foam | far water normal-only on mid |
| Cursor-reactive clouds | `threejs-temporal-surfaces` | Only its ping-pong history: pointer channels, frame-rate-independent decay, half-float at reduced resolution, rules for resize and reset | off on low |
| Grade and tone mapping | `threejs-exposure-color-grading` | A single tone-map owner and a generated 32³ LUT on the high tier. Exposure is authored per camera station instead of metered | in-material grade on mid and low |
| Glow | `threejs-bloom` | HDR bloom for the aurora, sun, fire and tent glow. Every effect must still read without it | high only |
| Camp shadows | `threejs-shadow-systems` | One bounded shadow map over the camp, rendered once, texel-snapped, with scaled bias. No cascades | gear level only |
| Pass order | `threejs-image-pipeline` | High tier only: bloom, then tone map, then LUT. UI stays in the DOM | high only |
| Evidence | `threejs-visual-validation` | Frozen inputs, a no-post baseline, field mosaics, near/design/far views, seed sweeps and budgets | every milestone |

**Not routed, and why**

- `threejs-volumetric-clouds`: raymarched weather volumes cost too much on a mid-range phone, and they would replace the mechanism that gives the reference its look (2D noise cards plus the pointer field). We borrow only its lighting vocabulary for the card shader: silver lining and a vertical density profile.
- `threejs-spectral-ocean`: FFT cascades and finite-volume beach solvers are WebGPU-first and far over budget for a background sea. Its coastal contracts (blending water, wet sand and dry sand by the water column) inform a documented analytic simplification for Mikey's beach.
- `threejs-parallax-occlusion-mapping`: WebGPU/TSL only, and normal maps with baked AO are enough at our camera distances.
- `threejs-procedural-planets`: built for spherical bodies, while our terrain is a local heightfield. The fields skill already covers the biome masks.
- `threejs-procedural-architecture`: there are no buildings.
- `threejs-screen-space-ambient-occlusion`: AO is baked into lightmaps and vertex colours instead. A GTAO pass is too expensive for the mid tier.

**Gaps in the pack (handled outside it)**

- Making, rigging and posing the human figures (Blender and AI tools). `img2threejs`, installed separately, can build stylised characters as procedural code.
- glTF compression and the asset build (gltf-transform, gltfpack).
- DOM hotspot overlays and accessibility.
- Coordinating Astro routing with the transitions.
- Device tiering and adaptive resolution. `visual-validation` only measures budgets.
- A cheap flame. The pack's fire is a WebGPU voxel simulation, far too heavy here, so the campfire flame is our own animated cards, using the pack's sparks and HDR rules for embers and glow.
- A likeness of Mikey's actual Hilux, later. For now a free (CC0) car stands in.

**Definition of done for every visual system (router acceptance gate):** a deterministic seed or reproducible inputs, debug views for its controlling fields, parameters grouped by what they look like (for example `snowlineM`, `litterAmount`) rather than by formula, a quality tier backed by a real mechanism, and a no-post baseline that still reads.

---

## 3. Architecture

### 3.1 Framework: Astro with vanilla three.js

| Criterion | Astro + vanilla three.js (recommended) | Next or Vite + React Three Fiber |
| --- | --- | --- |
| Fit with what exists | The site is already Astro 7.3, with content collections, Zod schemas, `ClientRouter` on the gear pages, shared-element morphs and keyboard navigation. Nothing has to move. | You would have to port the site or run a second app beside it, and rebuild the content collections and the 2D gear section. |
| Persistent canvas | `transition:persist` on one element in `GearLayout` | A layout-level `<Canvas>` works too |
| Transition orchestration | Imperative timelines drive the camera and uniforms directly, as the reference does | Refs plus `useFrame`. This works, but per-frame state has to be kept out of React state |
| Helpers | About five small modules to write ourselves: loader setup, hotspot projector, quality governor, bounded orbit and asset cache | drei provides `useGLTF` with KTX2, `<Html>`, `PerformanceMonitor`, `AdaptiveDpr` and `CameraControls` |
| JavaScript cost | three only, and only on `/gear` | React, ReactDOM and R3F add roughly 85–100 KB gzip before drei, on every page the app serves |
| Help and examples | Fewer copy-paste examples | A large R3F community |

The middle path is an Astro React island running R3F with `transition:persist`. It works, but you end up running two state systems (Astro routing and React) for a single scene that's driven by timelines. I don't recommend it unless you would rather write React.

### 3.2 Renderer: WebGL2, not WebGPU

1. **The main entry point is Instagram's in-app browser on a phone** (see `PRODUCT.md`). WebGL2 works there on both platforms. Android WebView doesn't enable WebGPU by default, and iOS needs iOS 26 (WebGPU arrived in Safari 26); I couldn't confirm it inside Instagram's WKWebView. A WebGPU build would still need a WebGL2 fallback, so WebGL2 is the baseline either way.
2. **Nothing here needs compute.** Clouds are cards, the pointer history is a two-target ping-pong, vegetation is generated ahead of time, and the water is analytic.
3. **The skills we reuse are GLSL** (see §2).
4. **Bundle size.** Both of three's entry points sit on the same `three.core.js` (287 KB gzip, unminified). The WebGPU entry adds 444 KB gzip on top of that, against 131 KB for the WebGL entry (measured on `0.186.1`). Tree-shaking narrows both, but the node system accounts for most of the difference.
5. **Maturity on mid-range GPUs.** `WebGLRenderer` is the long-tested path on Mali, Adreno and Apple GPUs. `WebGPURenderer`'s WebGL2 backend works, but it's the less-travelled route for mobile performance.

**Revisit if:** you want Gaussian-splat people (r186's new native `GaussianSplat` only runs on `WebGPURenderer`), GPU-simulated grass or fluids, or an FFT sea on desktop. The scene architecture wouldn't change; only the shaders would be ported to TSL.

### 3.3 Versions and current APIs

- Pinned: `three@0.186.1` (published 24 Sep 2026) and `@types/three@0.186.0`. (GSAP was planned here; the Director turned out not to need it.) Dev tools: `@gltf-transform/cli`, `core`, `extensions` and `functions` at `4.5.1`; `meshoptimizer@1.3.0` (gltfpack for quick tests); `@playwright/test@1.64.1`; `@axe-core/playwright@4.14.0`.
- Astro: stay on the installed 7.3 line during the build (latest patch 7.3.8) and pin it exactly. 7.4.0 came out on 15 October.
- Deliberately left out:
  - Lenis: nothing scrolls in 3D mode, and native scroll is better for accessibility.
  - React and R3F.
  - The `postprocessing` library: the high-tier chain is three passes we own.
  - `camera-controls`: our bounded orbit is small.
  - `detect-gpu`: optional later, after heuristics and the runtime governor.
- APIs to use:
  - **Animation loop:** `renderer.setAnimationLoop`, with `THREE.Timer` connected to `document` (the r18x examples have moved to it from `Clock`).
  - **Pre-warming:** `renderer.compileAsync(object, camera, scene)` and `renderer.initTexture()`, run during limbo or idle time.
  - **Loading:** `GLTFLoader` with `setMeshoptDecoder(MeshoptDecoder)` and `setKTX2Loader(new KTX2Loader().detectSupport(renderer))`.
  - **Tone mapping:** `AgXToneMapping`, compared against `NeutralToneMapping` in M1.
  - **Shader injection:** `onBeforeCompile`, always with `customProgramCacheKey`.
  - **Geometry:** `InstancedMesh` for vegetation (GLTFLoader maps `EXT_mesh_gpu_instancing` onto it) and `BatchedMesh` for camp items.
  - **Paths and environment:** `CatmullRomCurve3` in `centripetal` mode sampled with `getPointAt`, and `PMREMGenerator.fromScene` for a small sky environment map.
- Upgrade policy: no caret ranges. Upgrade three between milestones, after reading the migration notes.

### 3.4 Routes and levels

| URL | Level | What renders | No-3D content |
| --- | --- | --- | --- |
| `/gear/` | Hub | Full-colour overview: four summits rising out of a sea of cloud at dawn, each marked with its person's name | Existing lineup |
| `/gear/<person>/` | L1 biome | That person's camp in its landscape | Existing person page (stage, spec list, write-up) |
| `/gear/<person>/camp/` | L2 gear | Close-up of the camp: tent, sleep system, pack, kitchen and the figure, with hotspots | A list of the same items with weights, grouped by zone |
| `/gear/<person>/camp/#<item-id>` | L2 panel | Hotspot panel open, camera framing the item | The same list, scrolled to the item |
| `/gear/<person>/<category>/[...]` | 2D | The existing flat-lay and item pages. The 3D world pauses and shows a dimmed still behind them | as today |

- `camp.astro` is a new static route at `src/pages/gear/[person]/camp.astro`. Astro gives a static segment priority over the dynamic `[category]`, and `camp` doesn't collide with the `clothing` or `gear` category slugs.
- Keyboard navigation reuses the existing `data-up`, `data-prev` and `data-next` contract in `GearLayout.astro`: ←/→ change person, Enter opens, Esc goes up a level.
- The 2D shared-element morphs (`figure-<id>`, `name-<id>`) keep working in fallback mode. When 3D is on, the 2D figure is hidden (a `world-on` class on `html`) so it doesn't morph across the scene.

### 3.5 Navigation lifecycle

| Astro event | World does |
| --- | --- |
| `astro:before-preparation` | Starts the leave phase immediately, so there's a visual response within 100 ms. Starts loading the destination's asset scope. Wraps `event.loader` so the DOM swap waits for both the fetch and the end of the leave phase, which means content swaps while the screen is in limbo. |
| `astro:before-swap` | Keeps the persisted world and tab bar. The world has no transition name, so it crossfades with the rest of the page; that's invisible, because the swap happens while the screen is in limbo. |
| `astro:after-swap` | Re-applies `data-world` on `<html>` (the router replaces `<html>`'s attributes on every swap), reads the new page's data island, updates `aria-current` on the persisted tab bar (persisted DOM doesn't refresh from the new HTML), and binds hotspots and panels. |
| `astro:page-load` | Starts the arrive phase, moves focus to the new `h1` (as now) and announces the camp in a polite live region. |
| Back/forward | The same events with `direction: 'back'`, so the camera reverses along the path. |

### 3.6 Where the canvas lives

- A fixed, full-viewport `div#world` inside `GearLayout.astro`, with `transition:persist="world"` and deliberately no transition name. Named elements are drawn above the page during a view transition, so the world rides in the page's own snapshot instead. It holds the canvas (and, from M5, a poster `<img>`), sits at `z-index: -1` behind all content, and is `aria-hidden="true"`.
- A persisted crew tab bar (`transition:persist="crew-tabs"`) under the site nav, in the order Harry, Caleb, Mikey, Kevin, plus "Pause motion" and "View as list" controls.
- `src/world/boot.ts` is tiny and loads on gear pages only. It checks capabilities and either shows the poster or dynamically `import()`s the world bundle. Vite splits that bundle out, so `/`, `/photos` and the rest never download three.js.
- The page still owns layout. On desktop, panels reuse the existing 5fr/6fr stage-and-panel split, with the stage transparent so the world shows through. On mobile, panels become bottom sheets that scroll on their own, so the canvas can take `touch-action: none` at L1 and L2 without fighting page scroll.

### 3.7 Scene graph and systems

```text
World (renderer, scene, camera, loop, resize, context loss)
├─ Sky            dome; gradient, sun/moon, cirrus, star lattice, aurora layer
├─ Terrain        shared mesh, TerrainMaterial (biome uniforms + field masks + lightmap)
├─ Water          sea plane (Mikey) / lake ice (Kevin); per-biome visibility
├─ Clouds         cloud-sea cards, instanced puffs; read the pointer field
├─ Biomes/<id>    set dressing per biome: instanced trees/rocks, FX (lazy)
├─ Camps/<person> tent, sleep system, pack, kitchen, figure, anchors "hs:<item>" (lazy)
└─ FX             snow, leaves, embers (pooled, instanced)

Systems (outside the graph)
  Uniforms      one global bag: uTime, uLimbo, uBiome params, uResolution, tPointer
  Assets        manifest, scopes (global / biome:<id> / camp:<person>), priorities, LRU disposal
  Quality       tier choice, adaptive render scale, feature toggles, poster switch
  CameraRig     stations, path builder, bounded look/orbit, near/far per level
  Director      transition state machine on its own seekable timeline, interrupt handling
  PointerField  ping-pong history render targets
  Hotspots      projects anchors to screen, drives DOM buttons, occlusion hints
```

Units are metres with Y up. Near and far planes change per level (hub, biome, camp) instead of using a logarithmic depth buffer, which would cost early-z on phones.

### 3.8 State

The URL is the single source of truth. A small store mirrors it, and the World subscribes.

| Field | Values | Owner |
| --- | --- | --- |
| `person` | `harry`, `caleb`, `mikey`, `kevin` or none (hub) | URL |
| `level` | `hub`, `biome`, `camp` | URL |
| `item` | item id or none | URL hash |
| `phase` | `idle`, `leaving`, `travel`, `arriving` | Director |
| `quality` | `high`, `mid`, `low`, `poster` | Quality |
| `motion` | `full`, `reduced`, `paused` | media query plus the user toggle (saved in `localStorage`, guarded by try/catch) |

### 3.9 Content and data flow

Gear data stays where it is. The scene never hardcodes items, brands or weights.

- **`src/content/gear/<person>.yaml`** keeps its current fields and gains two optional ones:

  ```yaml
  - id: tent            # existing fields unchanged
    colour: '#6b7a5a'   # optional: panel swatch, drives parametric models
    scene:              # optional: only items placed in the 3D camp
      model: proc:tent/trekking-pole   # parametric preset, or a GLB id from the manifest
      anchor: tent      # hotspot anchor in the camp layout (defaults to the item id)
  ```

- **New `src/content/camps/<person>.yaml`** (a `camps` collection with a Zod schema):

  ```yaml
  person: harry
  biome: alpine-aurora        # a preset in src/world/biomes/
  title: Snow-capped peak under the aurora
  pose: standing
  posterAlt: <describe the poster for people who can't see it>
  ready: false                # false = 2D figure and placeholder camp
  sample: true
  ```

  The camps are moods, not real trips. By your choice they carry no label, and they don't link to walks.

- Each gear page renders that route's data into a JSON `<script>` island: person, level, items with `scene` fields, camp config and asset scope ids. The World reads it on `astro:page-load`.
- Panels reuse what the site already computes: `getLoadout()`, `totals()`, `formatWeight()`, `formatOz()`, `reviewFor()` and `disclosure()`. A gifted or paid item shows the same disclosure tag in the panel as on its item page.
- Biome art direction (colours, snowline, fog, cloud levels) lives in typed presets under `src/world/biomes/`. It's code-reviewed and can be tuned from `?debug`, with a "copy JSON" export. It isn't content.

### 3.10 Source layout

```text
src/content/camps/<person>.yaml      new collection
src/pages/gear/[person]/camp.astro   new route
src/world/                           client-only, dynamically imported
  boot.ts  World.ts  director/  camera/  systems/  scene/  shaders/  biomes/
public/3d/                           optimised GLB/KTX2 + manifest.json (generated)
assets-src/                          Blender sources: Git LFS or outside the repo
scripts/assets/                      gltf-transform pipeline + budgets.json check
scripts/posters/                     Playwright poster renderer
tests/visual/                        shot lists, contact sheets, budget assertions
```

---

## 4. Visual recipes

### 4.0 Visual contracts

| Level | Subject | Camera distance | Subject on screen | Motion at rest |
| --- | --- | --- | --- | --- |
| Hub | Four summits above the cloud sea | 2–5 km | Massif spans about 60% of the width | Cloud drift, bounded pointer parallax |
| Biome | The camp in its landscape | 60–250 m | Tent 4–8% of frame height | Clouds plus the biome's signature motion (aurora, stars, leaves, waves) |
| Camp | Figure and gear | 2.5–5 m | Figure 45–60% of frame height (desktop), 35–45% (portrait) | Small FX, bounded orbit on drag |

### 4.1 Shared world

**Terrain.** One mesh: about 80k triangles on desktop and a 35k LOD on mid. It has four zones: an alpine col (Harry), a maple valley (Caleb), a cirque with a lake (Kevin) and a cove with a beach (Mikey). From the hub they read as four islands in a sea of cloud. The camps are moods, so the terrain is authored freely, or generated procedurally for the placeholder stage; no real elevation data is needed. Baked at asset time:

- a masks texture (AO/cavity, flow, ridge, zone id);
- a low-res 16-bit heightmap for water depth, cloud contact fade and snowline lookups;
- one lightmap per biome.

Field bundle, following the procedural-fields contract:

```text
world xz (m), height h
 -> slope, aspect (from normal); cavity/AO, flow, ridge (baked)
 -> snow   = f(h - snowline, slope, aspect, wind exposure)
    rock   = f(slope, ridge) minus snow
    litter = f(cavity, flow, tree-density map)            Caleb
    sand   = f(h - seaLevel); wet = f(swash phase, h)      Mikey
 -> albedo blend, roughness, normal-detail strength, sparkle
```

The material is `MeshStandardMaterial` with injected chunks. Every mask has a debug view (`?debug=field:snow`).

**Sky.** One dome and one shader, made of:

- a gradient (zenith, horizon, ground);
- a sun or moon disc with a soft glow;
- a cirrus band;
- a star lattice, with strength set per biome;
- an aurora layer (Harry).

The same sun direction and colours feed terrain haze and cloud lighting. A 64–128 px PMREM is built from the sky while in limbo, so gear and paint pick up matching reflections.

**Clouds.** Three layers:

1. **The cloud sea:** a few large horizontal cards with noise-distorted density, faded where they meet terrain using the heightmap, so no depth texture is needed.
2. **Puffs:** instanced camera-facing sprites around summits and along the edge of the sea (24 on mid, 64 on high).
3. **Cirrus**, painted on the sky dome.

Cards are lit from the biome sun with lit, shadow and rim colours, using a fake normal from the density gradient. Only layers flagged as high elevation read the pointer field (`uPointerInfluence`), per your brief. Valley mist and lake ice fog don't react.

**Pointer field.**

- **Buffers:** two ping-pong render targets at 128×128. They use half-float where `EXT_color_buffer_half_float` exists and encoded RGBA8 otherwise.
- **Each frame:** decay by `exp(-dt/τ)` with τ ≈ 0.7 s, then add a soft splat at the pointer, scaled by its speed. The channels are velocity x and y, plus intensity.
- **In the cloud shader:** the noise lookup is pushed along the velocity, density is thinned by the intensity, and the torn edge brightens a little.
- **Touch:** drags that start on the canvas add to the field. The reference turns this off on touch; we can keep it, because the canvas owns touch at L1 and L2.
- **Debugging:** a debug overlay shows the buffer.

**Limbo.** A preset like the biomes, built from the site's tokens: bone `#f7f6f3` sky and clouds, charcoal `#2f3437` terrain and `#787774` haze, with saturation near zero. It's only seen between tabs, as in the reference. A global `uLimbo` (0 to 1) also drives desaturation in every material, so the move into and out of limbo looks the same everywhere.

**Hub.** Its own full-colour preset rather than limbo: cool dawn light over the cloud sea, like the reference's homepage. Each of the four summits hints at its biome: snow, autumn colour, jagged winter rock and a coastal headland.

**Grade.** Full colour, cinematic but naturalistic, like the reference's scenes. One set of values per biome: exposure, white balance, lift/gamma/gain, saturation, and a signature hue that leads the frame (aurora green, maple red, fire amber, sunset gold). Only the limbo is desaturated.

- **Mid and low tiers:** applied in a shared output chunk, with no extra pass.
- **High tier:** HDR target, then bloom, then AgX tone mapping, then a 32³ LUT generated from the same values.

Tone mapping happens exactly once in both paths.

**Campfire (every camp).** A ring of stones and a few logs (parametric), two to four flame cards with an animated noise shader, instanced embers (the procedural-vfx sparks), a thin smoke wisp, a scorch mark, and one warm point light with a slow, gentle flicker. At night it's the key light on the figure and tent; by day it's a small warm accent. Fire, tent glow and aurora share one HDR emission ranking, so bloom on the high tier and glow cards on mid treat them consistently. The fire casts no shadows, which keeps it to one cheap light.

### 4.2 Harry: snow-capped peak with aurora

Alpine col above a cloud sea, at blue hour or later.

| Aspect | Recipe | Skills |
| --- | --- | --- |
| Terrain | Low snowline, so almost everything is snow. Wind-scoured dark rock on steep faces and ridges (slope and ridge masks). Sastrugi in the detail normal. A cornice lip on the ridge. | fields, materials, precipitation |
| Sky and atmosphere | Deep blue to near-black zenith with faint stars. Aurora curtains low over one horizon, green with a faint magenta upper fringe. Cold haze over the cloud sea. | vfx (aurora), raymarched-space (stars), atmosphere |
| Clouds | The cloud sea below the camp is the hero and reacts to the pointer. Spindrift plumes drift off the summit as animated cards. | fields, temporal (pointer field) |
| Vegetation | None. | — |
| Lighting | Ambient tinted by the aurora: the skill's 32×16 probe exists to light the scene from it. The campfire is the key light on the figure and tent, and the tent also glows from a headtorch inside (emissive fabric). Snow sparkle is filtered. Lightmap baked for a sky-lit night. | vfx, materials |
| Grade | Full colour: deep blues and violets, a vivid aurora green, warm fire and tent amber. | grading, bloom (high) |
| Camp | Tent with snow caps on the fly and guylines to rocks, and a small fire in a ring of stones. Figure standing by the fire. | precipitation (snow caps), vfx (fire) |
| Mid-tier cuts | Aurora from a small sky texture updated over several frames instead of per-pixel raymarching (the skill's per-pixel version takes 75 steps per pixel). No falling spindrift on low. | |

### 4.3 Caleb: autumn under Japanese maples

Forested valley in late-afternoon light.

| Aspect | Recipe | Skills |
| --- | --- | --- |
| Terrain | Snow only as a dusting on distant peaks (high snowline). Soil and moss-covered rocks on the forest floor. Leaf litter gathers in hollows and downhill of trees (cavity, flow and tree density). | fields, materials |
| Sky and atmosphere | Clear sky with a low warm sun. Valley haze with a warm tint. | atmosphere |
| Clouds | Low valley mist that doesn't react. Wisps on the peaks that do. | fields, temporal |
| Vegetation | Japanese maple species table: short trunk, low forks, wide layered crown, fine twigs, palmate leaf cards in red, orange and yellow that vary by tree and crown height. A few evergreens for contrast. Fern and bamboo-grass undergrowth adapted from the meadow-grass system. Instanced leaf decals around the camp. 100–200 falling leaves that flutter. | vegetation, procedural-animation |
| Lighting | Warm directional sun with dappled baked shadows. Leaf cards glow when back-lit. | materials |
| Grade | Warm and rich: saturated maple reds and oranges against cool blue shadow. | grading |
| Camp | Tent pitched on a carpet of leaves, with leaves on the fly, and a fire ring. Figure standing beside the tent. | vfx (fire) |
| Mid-tier cuts | Trees beyond about 120 m become impostor cards. 60 falling leaves. | |

### 4.4 Kevin: Canadian Rockies in winter, under stars

Cirque with a frozen lake beneath jagged peaks, deep night.

| Aspect | Recipe | Skills |
| --- | --- | --- |
| Terrain | Steep layered limestone faces (horizontal strata banding on rock), heavy snow on ledges, smooth avalanche aprons. A frozen lake: snow-dusted ice with clear dark patches and cracks. | fields, materials, precipitation |
| Sky and atmosphere | Clear sky with dense stars and a Milky Way band with dust lanes, plus an optional thin moon. | raymarched-space (stars), atmosphere |
| Clouds | Thin wisps on the peaks (reactive). Faint ice fog over the lake (not reactive). | fields, temporal |
| Vegetation | Snow-laden spruce and fir: one central trunk with drooping whorls of branches. Snow caps come from the precipitation skill's upward-facing filter. Distant trees are impostors. | vegetation, precipitation |
| Water and ice | The ice reflects the analytic sky, so stars reflect crisply without a reflection pass. Fresnel and crack normals. | water-optics |
| Lighting | Cool moonlight (baked into the lightmap, dynamic for the camp). A warm campfire point light with flicker, and embers. | vfx (sparks), bloom (high) |
| Grade | Deep navy and high contrast, with the fire's amber as the warm accent. | grading |
| Camp | Tent near the lake shore, campfire, figure standing by the fire. | vfx (fire) |
| Mid-tier cuts | No falling snow. One dynamic point light. | |

### 4.5 Mikey: coast at sunset, next to the car

| Aspect | Recipe | Skills |
| --- | --- | --- |
| Terrain | Dry sand grading into wet sand and the swash zone. Dunes with grass, and a rocky headland where the range meets the sea. | fields, materials |
| Sky and atmosphere | Sunset gradient with the sun low over the sea, cloud undersides lit pink, a glow around the sun and warm haze. | atmosphere |
| Clouds | Lit cloud bands near the horizon. The high bands react to the pointer. | fields, temporal |
| Vegetation | Sparse dune grass using the meadow-grass system, plus a few coastal shrubs. | vegetation |
| Water | Analytic waves with absorption from true depth (from the heightmap). Fresnel against the analytic sunset sky, a glinting sun path and crest foam from the shared crest metric. An analytic swash band (a run-up function along shoreline distance) blends water, wet sand and dry sand by the water column. This is a documented simplification of the spectral-ocean coastal contracts. | water-optics |
| Lighting | Low orange sun with long shadows (baked, plus the camp shadow map). Purple-blue sky fill. Glossy paint on the car. | materials, shadows |
| Grade | Vivid sunset: gold, rose and violet highlights over teal-blue shadows. | grading, bloom (high) |
| Camp | A generic placeholder car on the sand flat behind the dunes, the tent pitched beside it, and a beach fire. Figure standing between the car and the tent. | vfx (fire) |
| Mid-tier cuts | Displaced water only near the shore, normal-only water further out, no lens flare. | |

**Telling the two night scenes apart:** both now have a fire, so the sky and setting carry the difference. Harry's is blue hour above the clouds, under the aurora. Kevin's is deep night, with dense stars over a frozen lake.

### 4.6 Fit with the style guide (decided)

You chose full colour like mont-fort, so the style guide is relaxed for the 3D scenes on `/gear`: skies can be gradients, colour can be saturated, and light can glow. `PRODUCT.md` now records this as a scoped exception.

The UI around the scenes stays exactly as it is now: bone panels, ink type, hairlines, charcoal hotspot discs and sign labels. New controls (the crew tabs, hotspots, panels, "Pause motion") reuse those existing components. The limbo between tabs stays desaturated, in the site's bone and charcoal, which is also what the reference does.

---

## 5. Transitions

### 5.1 Tab to tab: the limbo pass

As built in M2 (the original plan had rising cloud as the wipe; see Progress):

```text
t (s)   0.0      0.55      0.95  1.0  1.05       1.6        2.2   (mobile x0.9)
        |- drain -|- veil --|- swap -|- unveil --|- colour --|
camera  lift up and back from A ----->| B's approach, above and behind -> B's station
uLimbo  0 ------> 1 ====================================== 1 -------> 0
uPaper  0 ======= 0 ------> 1 ======== 1 ------> 0 ======================= 0
swap                            at 1.0 s, under paper: B's set, puffs, biome uniforms
DOM     new HTML swapped once A has drained (uLimbo = 1)
```

- **Parameter blending:** each biome parameter set blends from A toward LIMBO during leave, then from LIMBO toward B during arrive. Never blend A straight into B: the in-between states (half-autumn, half-snow) look wrong, and the limbo hides the change. Continuous values that are valid at both ends, such as sun direction, can travel directly.
- **Resource safety:** B's scope is prefetched on tab hover, focus or touchstart, and pre-compiled with `compileAsync` before the swap. If it isn't ready, travel holds in limbo (the clouds keep moving) for up to 3 s, then a thin loading line appears in the tab bar.
- **Why shorter than the reference's 3.5–6 s:** people will flick between four friends, so about 2.2 s, interruptible, keeps it feeling responsive.
- **Optional flourish:** a horizontal strip of the four crew names in the display serif slides as you travel, like the reference's title strip.

### 5.2 Camera paths

- **Stations:** authored in Blender as empties (`cam:<person>:biome`, `tgt:<person>:biome`, `cam:<person>:camp`, `tgt:<person>:camp`, `cam:hub`, plus `:portrait` variants) and exported with the terrain, as the reference does.
- **Travel paths:** built at runtime from A's station, A's exit point (up and back), a limbo waypoint above the sea between the zones, B's entry point and B's station. They use a centripetal `CatmullRomCurve3` sampled by arc length. That keeps it to four sets of stations rather than twelve authored paths.
- **Orientation:** slerped between station rotations, with a look toward the horizon mid-path. There's one interpolation stage, with no second smoother stacked on the handoff.
- **Feel:** ease-in-out by arc length, capped angular velocity and no roll.
- **At rest:** pointer parallax is a bounded offset (±1.5° yaw, ±1° pitch) on a critically damped spring, faded to zero during transitions.
- **Portrait framing:** station variants, plus a field of view derived from the subject's width, so the tent or figure takes the same share of the screen as in §4.0.

### 5.3 Hub and biome

- **Dive:** the camera falls from the overview into the cloud sea. While the frame is filled with cloud, the hub preset switches to B's, so the cloud layer itself is the wipe. The camera then breaks out at B's station. 1.8 s.
- **Back to the hub:** the reverse, in 1.6 s.

### 5.4 Biome and camp: zooming into the gear

- **Entering the camp:** no limbo, because the biome stays. The camera dollies along an authored curve from the biome station to the camp station over 1.4 s, and the near and far planes tighten at the end. Set dressing swaps to its near LODs. Camp meshes fade in with dithered alpha (no sorting problems), and hotspots fade in 0.3 s after arrival.
- **Loading:** the camp scope is prefetched when the biome settles. If it still isn't ready on click, the camera starts a slow push-in while the rest loads, capped at 3 s.
- **Backing out** (Esc or the back button): the reverse, 1.0 s.
- **Hotspot focus:** opening a panel eases the camera (0.6 s) to frame the item away from the panel on desktop, or above the sheet on mobile. Closing it returns.
- **Optional later, "Lay it out":** every item animates from its camp position into a knolled grid on the ground under a top-down camera. It's the existing flat-lay, as a 3D move.

### 5.5 Interruptions and history

- A new target during **leave or travel** rebuilds the path from the current camera pose and parameter state (no snapping).
- A new target during **arrive** reverses into limbo first.
- **Back and forward** reuse the same paths in reverse.
- **Rapid key repeats** collapse into the latest target.

### 5.6 Reduced motion

Posters are the default. A "Show 3D without motion" toggle (remembered) gives:

- cuts through a 150 ms fade to bone;
- frozen clouds, aurora, fire and particles;
- no parallax and no camera focus moves.

---

## 6. Asset pipeline (the riskiest part)

**Decided (17 October):** generic placeholders and stylised stand-ins now, scans later. Everything below is arranged so a scan or a bespoke model can replace a placeholder by changing one `scene.model` id, keeping the same anchors and budgets.

### 6.1 People

**Now: stylised stand-ins, standing still.** Start from one free base figure, for example Quaternius's Universal Base Characters. They're free and rigged; the pack page says CC0, but read the licence in the download, because Quaternius is moving to its own licence. For each person:

- a relaxed standing pose (arms down), set once in Blender and baked, so nothing needs a rig at runtime;
- their real clothing colours on the matching garments (jacket, pants, hat, shoes), with the pack worn or set down by the tent;
- simple likeness cues: height, hair colour and length, beard, glasses or hat.

`img2threejs` (installed, outside the pack) is an alternative: it can build each stand-in as procedural code from one photo.

Clothing hotspots sit per zone, matching the flat-lay: head and hands, layers, legs, feet. Each opens a panel listing that zone's items with weights, so a shirt, a fleece and two jackets don't stack four hotspots on one chest.

**Later: scans.** Standing still suits scanning: a phone photogrammetry scan (RealityScan, Polycam or KIRI Engine) of each person standing in full kit can drop in without rigging. Expect a heavy, messy mesh that needs cleanup (hands, hair, loose fabric), then decimation to 12–20k triangles and a baked texture set before it fits the budget. Scans are realistic, so they replace the stand-ins all at once rather than mixing with them. Gaussian splats remain a poor fit: they can't be relit, run 10–40 MB, and three's native `GaussianSplat` only runs on `WebGPURenderer`.

If scanning disappoints, the other routes still stand: an AI image-to-3D draft (Tripo or Meshy, or Hunyuan3D run locally), a shared base body with modelled garments, or a commissioned artist. If a rig is ever needed, use AccuRIG 2 or Rigify: Mixamo still works but is in maintenance mode, and was down for several days in June 2025. Ready Player Me shut down on 31 January 2026.

### 6.2 Gear

**Now: generic placeholders**, built with the geometry kit so they're properly sized and lit, and need no licences. The first real models are Harry's: his tent, the Zorali SummitSeeker 2P (Progress, 18 October 2026), his pad, pillow and chair, the NEMO Tensor All-Season, NEMO Fillo and Alton Lightweight Camp Chair (Progress, 20 October 2026), and his pack, the Osprey Aether 65 (Progress, 22 October 2026). All are parametric, as planned below, from their photos and spec sheets.

| Item | Placeholder now | Later | Triangles |
| --- | --- | --- | --- |
| Tent | Generic trekking-pole or dome tent: poles as sweeps, fly as lofted panels with sag, door rolled back | Stay parametric, sized from the real tent's spec sheet; tents scan badly (thin, shiny, featureless) | 3–8k |
| Sleeping pad | Pillow panel with baffles | Same, from the real pad's dimensions | 1–2k |
| Quilt or bag | Lofted shell with baffle ridges, draped | Same | 2–4k |
| Pillow | Pillow panel | Same | ≤1k |
| Pack | Rounded blockout with straps and a lid | Scan: a stuffed pack is rigid and scans well | 4–8k |
| Stove, pot, mug, canister, bottles | Revolve plus small parts | Stay parametric; shiny metal scans badly | 1–3k each |
| Headtorch and small items | Simple shapes | Scan or model | ≤1k each |
| Campfire | Stone ring, logs, flame cards, embers, light | Unchanged | ≤3k |
| Clothing | On the stand-in figure, with hotspots per zone | On the scanned figure | — |

Placeholders use a neutral colour unless the YAML item has a `colour`. They're generated in code, so they cost almost nothing to download, and the camp's gear stays at or under 35k triangles. Swapping a placeholder for a scan later means changing that item's `scene.model` id; its anchor and panel stay the same. Kenney's Survival Kit (CC0, glTF) may have usable camp props too, but its contents aren't listed, so check the download.

### 6.3 The car

- **Now:** a generic car from Kenney's Car Kit (CC0, glTF, 40+ vehicles including trucks). Pick a pickup or ute if the pack has one, otherwise an SUV, then recolour it and add baked AO. Mikey's tent is pitched beside it.
- **Later:** scan or model the real Hilux. If you ever buy a model instead, check that the licence allows real-time web use, where anyone can download the file (many "royalty-free" licences forbid distributing extractable models), and decimate it to 25k triangles or fewer.

### 6.4 Landscape

- **Terrain:** generated procedurally for the placeholder stage (the fields skill's terrain contract, seeded), then refined in Blender, Gaea or World Creator if needed. There's no real elevation data, since the camps are moods. Decimated to budget, with masks baked and per-biome lightmaps rendered in Cycles.
- **Tiling textures:** Poly Haven or ambientCG (CC0) for snow, rock, forest floor, sand and bark. 512² on mid, 1K on high, encoded to KTX2.
- **Vegetation:** generated by our own Node script using the vegetation skill's systems, seeded, exported with `GLTFExporter` and then optimised. Placements are stored as GPU instances.
- **Sky, clouds, aurora, stars and water:** code, plus three small noise textures. Nothing to download beyond those.

### 6.5 Optimisation pipeline

1. **Blender export:** binary glTF, +Y up, transforms applied, and named empties for camera stations and hotspot anchors.
2. **`scripts/assets/build.mjs`** (gltf-transform 4.5.1 Node API):
   - geometry: dedup, prune, weld, simplify where allowed, quantize, then meshopt compression;
   - textures: resized per tier and encoded to KTX2 (ETC1S for colour and lightmaps, UASTC for normals), which needs the KTX-Software CLI installed;
   - output: `mid` and `high` variants, plus `public/3d/manifest.json` with bytes, triangles and texture sizes.
3. **Budget gate:** the build fails if any asset exceeds its line in `scripts/assets/budgets.json`.
4. **Runtime:** GLTFLoader with MeshoptDecoder and `KTX2Loader.detectSupport(renderer)`. Three's Basis transcoder is copied to `public/3d/basis/`.
   - The transcoder is a one-time 0.26 MB gzip download, so it isn't worth it for one texture. It pays off once there are 15 or more textures, because phone GPU memory, not bandwidth, is the tighter limit inside Instagram's browser.
   - The first slice can use WebP while there are only a few textures.
5. **Caching:** hashed filenames with long-lived immutable cache headers. The host should serve `model/gltf-binary`, `image/ktx2` and `application/wasm`, and compress the JS and wasm. GLB and KTX2 files are already compressed.
6. **Sources:** `.blend` files and photos stay out of git, or go in Git LFS.

### 6.6 What you need to supply

**Now, for the placeholders**

1. **A complete gear YAML for each person:** brand, model, size or variant, colour, and weight in grams from a kitchen scale.
2. **Each person's look:** clothing colours (jacket, pants, hat, shoes, pack), height in cm, hair colour and length, beard, glasses. One full-length photo in kit covers all of it.
3. **Consent** from each person to a stylised likeness on the site.

**Later, for scans**

From each person:

1. **Figure photos or a scan session:** the same setup as the figure shoot in `CONTENT.md`, extended.
   - Phone on a tripod at chest height, about 3 m away, against a plain wall in open shade.
   - Arms 30–45° out from the body.
   - Full kit with the pack, then again without it.
   - Front, back, left, right and the four three-quarter angles.
   - Optional: a slow 30–60 s video circling the person.
2. **Head:** front, three-quarter and profile with a neutral expression, plus one smiling. Hair from behind. Glasses or hat on and off.
3. **Clothing close-ups:** each garment flat and worn, with logo areas included as reference only. A white sheet or grey card in frame for colour.
4. **Height in cm.** Build notes are optional.
5. **A pose**, if you want something other than standing.
6. **For each item to be scanned or modelled:** product page link (dimensions), and photos from 4 sides and the top. The `CONTENT.md` flat-lay shots double as texture reference.
7. **Tent:** pitched from 4 sides, door open, inside, and the guyline layout.
8. **Sleep system** as you lay it out inside the tent.
9. **Biome references:** 5–10 images of the mood you want.
10. **Consent** to publishing a realistic 3D likeness, and to uploading photos to any third-party 3D service.

From Mikey, as well: the Hilux's generation and year, cab type, colour and accessories (canopy, rack, awning, bar, wheels), plus photos from 8 angles or a scan of the car.

### 6.7 Licences, privacy and consent

- Get each person's written consent (a message is enough) for a 3D likeness on the site.
- Before uploading faces to an AI 3D service, read its terms on training and retention. Prefer a plan that opts out, or run Hunyuan3D locally.
- List every third-party asset (textures, the placeholder car and figures, any bought model, anything CC-BY) on `/credits`, as the photo stand-ins are listed now. CC0 doesn't require credit, but listing it is a courtesy and tracks what still needs replacing.
- Don't put generated logos on models. Brand names live in the panel text from YAML, which keeps them accurate and keeps the ACCC disclosure in one place.

---

## 7. Performance budget

**Device classes**

| Class | Examples | Target |
| --- | --- | --- |
| Desktop | Apple M-series laptops, recent Windows laptops with integrated GPUs | 60 fps |
| Mid-range phone (the bar) | iPhone 12–13 class; Galaxy A5x and Pixel 6a–7a class | 60 fps when settled, 45 or better during transitions, never below 30 |
| Low | iPhone 11 class, Galaxy A1x–A2x class, memory-starved in-app browsers | Low tier or posters |

**Tiers**

| | High | Mid | Low | Poster |
| --- | --- | --- | --- | --- |
| DPR cap | 2.0 | 1.5 | 1.0 | — |
| Render scale (adaptive) | 0.8–1.0 | 0.7–1.0 | 0.6–0.85 | — |
| Post | HDR target, bloom, AgX, LUT | none (in-material grade) | none | — |
| MSAA | on when DPR ≤ 1.5 | on when DPR ≤ 1.5 | off | — |
| Pointer field | on | on | off | — |
| Puffs / falling particles | 64 / full | 24 / reduced | 8 / none | — |
| Campfire | flame cards, 150 embers, smoke | flame cards, 80 embers | flame cards, no embers | — |
| Vegetation density | 100% | 50% | 25% | — |
| Aurora | per-pixel, half resolution | sky texture updated over several frames | static texture | — |
| Camp shadow map | 2048, rendered once | 1024, rendered once | blob shadows | — |

**Budgets per level (mid tier is binding)**

| Metric | Hub | Biome | Camp |
| --- | --- | --- | --- |
| Draw calls | ≤ 25 | ≤ 60 | ≤ 80 |
| Visible triangles | ≤ 120k | ≤ 250k | ≤ 300k |
| GPU frame time | ≤ 10 ms | ≤ 10 ms | ≤ 10 ms |
| Main-thread JS per frame | ≤ 3 ms | ≤ 3 ms | ≤ 3 ms |

Across the whole session: no more than 96 MB of resident textures and render targets, no more than 24 shader programs (all compiled before they're first shown), and at most two dynamic point lights in view on the mid tier (the campfire, plus the tent glow at night). No frame during a transition may take longer than 50 ms on desktop or 100 ms on a phone.

**Downloads (over the wire, mid variants)**

| Item | Budget |
| --- | --- |
| `boot.ts` (capability check, poster switch) | < 5 KB |
| World JS (three r186 WebGL path, loaders, our code) | ≤ 280 KB gzip. The reference's equivalent bundle is 229 KB compressed |
| Decoders: meshopt 8 KB, Basis transcoder 260 KB (cached after first use) | ≤ 270 KB |
| Global world: terrain, masks, heightmap, noise | ≤ 700 KB |
| Each biome: set dressing, detail textures, lightmap | ≤ 600 KB (Mikey's car adds about 200–400 KB) |
| Each camp with placeholders: stand-in figure about 150 KB, gear generated in code | ≤ 300 KB |
| Each camp after scans: figure about 350 KB, gear about 400 KB | ≤ 900 KB |
| Poster (AVIF, 1600w desktop / 800w mobile) | ≤ 120 KB / ≤ 60 KB |
| **First 3D view at `/gear/`** | **about 1.25 MB**; the HTML lineup paints first and the canvas fades in |
| **Hub, one biome and its camp** | **about 2.8 MB** after scans; about 2.2 MB with placeholders |
| **Everything (four biomes, four camps)** | **≤ 8 MB**, against 6.4–9.8 MB for a single reference page |

**Loading strategy**

- HTML and CSS paint immediately and never wait on WebGL. The world fades in when its first frame is ready.
- Priority order: current scope, then the hovered or adjacent tab, then idle prefetch in tab order. Idle prefetch only happens on fast connections, and not when `Save-Data` is set.
- Every scope is compiled (`compileAsync`) and its textures uploaded (`initTexture`) while hidden in limbo or during idle time.
- KTX2 transcoding runs in workers (the loader's default).
- On mid and low tiers at most two camps stay resident, with the least recently used disposed (geometry, materials and textures released explicitly).
- The loop runs only while visible. It pauses on `visibilitychange`, renders a still under the 2D flat-lay and item pages, and stops entirely when "Pause motion" is on.

**Adaptive governor**

- **Starting tier:** WebGL2 support, max texture size, the GPU string where available, `deviceMemory`, core count, viewport size and Save-Data.
- **At runtime:** measure frame times over 2 s windows, using `EXT_disjoint_timer_query_webgl2` GPU timing where it exists (not on iOS).
- **Stepping down:** render scale first, then features, then the tier.
- **Hysteresis:** prevents flip-flopping between tiers.
- **Last resort:** if frame rate stays under 24 fps at the lowest settings, switch to posters with a one-line note.

**Fallback triggers**

- No WebGL2, a failed context, or repeated context loss: posters.
- `prefers-reduced-motion: reduce`: posters, with the opt-in described in §5.6.
- Save-Data or a 2G/3G `effectiveType`: posters, with an opt-in.
- Low tier that can't hold 24 fps: posters.

Posters are rendered from the real scenes by `scripts/posters` (Playwright) at every station, at 16:9 and 9:19.5, and served through Astro's `<Picture>`. They can also become `og:image` per person for Instagram shares.

Why posters and not video: someone asking for reduced motion shouldn't get a moving loop, weak devices handle images better than decoding video, a loop costs ten times the bytes, and posters regenerate from the real scenes, so they never drift from the 3D look.

---

## 8. Accessibility

- **DOM first.** Everything meaningful is HTML. The canvas is `aria-hidden="true"` decoration. With JS or WebGL off, the existing 2D gear section works exactly as it does today.
- **Tabs are navigation.** Use links in `<nav aria-label="Crew camps">` with `aria-current="page"`, not ARIA `role="tab"`, because each one changes the URL and the heading. Arrow keys follow the existing lineup and person-page behaviour. Focus moves to the new `h1` after each change, as it does now.
- **Hotspots are buttons.** They sit in an ordered list in a logical order: gear zones (sleep, pack, shelter, kit, as in `zonesFor`), then clothing head to toe. Each has an accessible name such as "Tent: <brand> <model>, 765 grams", plus `aria-expanded` and `aria-controls`. Positions update through `transform`, without layout. A focused hotspot eases the camera to reveal its item, so keyboard users always see what they've focused.
- **Panels.** A non-modal panel: Esc closes it and returns focus to its hotspot, and ←/→ step through items as they do on item pages. The panel shows the weight in grams and ounces, worn or packed, notes, the review link and its disclosure tag, and "Full details" (the existing item page).
- **Announcements.** One polite live region in the persisted chrome announces arrivals only ("Kevin's camp: Canadian Rockies in winter, at night").
- **Motion.** Reduced-motion defaults (§5.6). A visible "Pause motion" toggle covers WCAG 2.2.2 for clouds, aurora, fire and particles. No camera roll, transitions no longer than 2.4 s, and nothing flashes more than three times a second, which is why the fire's flicker stays slow and low in amplitude.
- **Contrast.** Text never sits directly on the scene; it's on bone panels with ink. Hotspot discs keep the existing charcoal disc with a white numeral, plus a 2 px bone ring so they hold up on night scenes. The background behind each hotspot is sampled from screenshots in tests.
- **Touch.** Hit areas of at least 44 px around the 36 px discs.
- **Posters** have authored alt text (`posterAlt` in the camps YAML).
- **Testing:** an axe-core scan of every route and state, a scripted keyboard-only tour in Playwright, and manual VoiceOver and TalkBack passes at M5 and M6.

---

## 9. Milestones

Effort is in rough focused days for someone comfortable with three.js. Scanning is in elapsed time, because it depends on scan sessions.

On test rendering: headless Chromium renders WebGL with SwiftShader. That's fine for deterministic screenshots and useless for performance numbers. Performance comes from headed runs on a real GPU, plus real phones through remote inspection.

**M0. Foundations (2–3 days). Done 17 October 2026; see Progress at the top.**

- Build:
  - Pinned dependencies.
  - The persisted `#world` container that only clears to bone, and `boot.ts`.
  - Debug and test switches: `?debug`, plus `?freeze&t=&seed=` for deterministic time.
  - A `window.__world` test hook (development and test builds only).
  - The `camps` collection, the optional `scene` fields and sample data.
  - Playwright projects for desktop Chromium, an emulated phone and WebKit, run against `astro preview`, plus a contact-sheet helper.
- Validate with Playwright:
  - Baseline screenshots of today's 2D gear routes at desktop and mobile with 3D off. These become the fallback regression set.
  - An axe baseline.
  - The canvas element survives three client navigations.
  - Network capture on `/` and `/photos` shows no three.js.

**M1. Smallest playable slice: Harry's biome and the clouds (4–6 days). Done 17 October 2026, except the frame-time check on real phones; see Progress.**

- Build:
  - Placeholder terrain with the field bundle and snow/rock shading.
  - The sky with stars and aurora, starting with the sky-texture method.
  - The cloud sea and puffs, and the pointer field.
  - One station with bounded parallax.
  - A placeholder campfire (flame cards, embers, flickering light) and a generic tent at the camp.
  - In-material grade and a quality stub (DPR cap, render scale).
- Validate with Playwright:
  - Frozen-time captures at the design, near and far views.
  - A field mosaic (height, slope, snow, rock, cloud density, pointer buffer).
  - A cursor sweep: 5 frames during it and 1 after settling, compared with the reference's behaviour.
  - A 390×844 @2x capture, and `renderer.info` budgets asserted.
  - A frame-time check on one iPhone and one mid-range Android.

**M2. Second biome and the transition (4–6 days). Done 17 October 2026; see Progress.**

- Build:
  - Kevin's biome (stars, frozen lake, placeholder conifers).
  - The Director with leave, limbo, travel and arrive.
  - `/gear/harry/` and `/gear/kevin/` connected through `ClientRouter`, with the persisted tab bar and `aria-current` updated after swaps.
  - Prefetch, `compileAsync` warm-up, interruptions, and back and forward.
- Validate with Playwright:
  - Seek the Director deterministically and capture 12 frames per transition into a contact sheet.
  - Assert that the frame at the swap instant is pure limbo (saturation below a threshold).
  - A long-frame detector during transitions.
  - An interrupt sequence (Caleb clicked mid-travel) and a back-button sequence.
  - A reduced-motion run showing cuts and frozen clouds.

**M3. All four biomes and the hub (6–9 days). Caleb's and Mikey's camps done 17 October 2026; the hub waits while `/gear/` is hidden. See Progress.**

- Build:
  - Caleb (maples, litter mask, falling leaves).
  - Mikey (sunset sky, analytic sea and swash, dune grass, and the placeholder car with the tent beside it).
  - The `/gear/` hub with four camp markers, and dive transitions.
- Validate with Playwright:
  - A screenshot matrix: 5 views × 2 viewports × 2 tiers.
  - Budget assertions per biome.
  - A vegetation seed sweep (3 seeds), checking that species identity holds.
  - A water diagnostics mosaic (normals, foam metric, depth absorption).
  - Hub-to-each sheets and two tab-to-tab sheets.

**M4. Gear level with placeholders, Harry first and then the other three (6–8 days). Mostly done 17 October 2026, ahead of M3; see Progress for what's left.**

- Build:
  - The `/gear/<person>/camp/` route and each camp's layout (stations and anchors).
  - Parametric tent, pad, quilt, pillow, stove, pot and bottle from the geometry kit, a pack blockout, and the campfire refined for close range.
  - Four stylised stand-in figures, standing, recoloured from each person's clothing, with clothing hotspots per zone.
  - Hotspots from YAML, and the panel with brand, model, weight, disclosure and review link.
  - Enter and exit moves, the bounded orbit, and the camp shadow rendered once.
- Validate with Playwright:
  - Camp captures at desktop and mobile.
  - A hotspot alignment test: anchors inside the viewport and no overlapping labels at the design view.
  - Panel states.
  - A keyboard-only tour (Tab order follows the zones, Enter opens, Esc closes and then exits).
  - An axe scan.
  - Geometry-kit audits pass, with wireframe and normal debug captures.

**M5. Fallbacks, accessibility and performance hardening (4–5 days)**

- Build:
  - The governor with hysteresis.
  - The poster generator, and the reduced-motion and Save-Data paths.
  - The no-WebGL path and the Pause toggle.
  - Context-loss recovery, the camp LRU, and OG images.
- Validate with Playwright:
  - The suite with WebGL disabled, showing poster screenshots.
  - The reduced-motion suite.
  - Per-route network totals from resource timing, asserted against §7.
  - Memory after visiting all four camps on a phone.
  - Lighthouse on `/gear/`, confirming the HTML still paints first.

**M6. Launch with placeholders (3–4 days)**

- Build: an art pass on all four biomes, `/credits` entries, and Vercel headers for the 3D files.
- Validate:
  - The full Playwright matrix, with baselines locked.
  - Real devices, including Instagram's in-app browser on iOS and Android.
  - VoiceOver and TalkBack passes.

**M7. Later: scans (elapsed time depends on the scan sessions)**

- Build: scan each person standing in kit, then the pack, other rigid gear and the Hilux. Clean up, run the asset pipeline, and swap each placeholder by its `scene.model` id.
- Validate with Playwright:
  - Matched-camera comparison sheets of photo against render, reviewed with each person.
  - The asset budget report.
  - Baselines updated deliberately.

**M8. Optional:** the "Lay it out" flat-lay mode and seasonal variants.

The router's execution order maps onto these milestones:

- visual contract and camera (M1);
- subject systems before lighting and atmosphere (M1–M3);
- the image pipeline last, and only on the high tier (M5);
- visual validation in every milestone.

---

## 10. Risks

| Risk | Mitigation |
| --- | --- |
| Figures look uncanny or unlike the person | Stylised stand-ins for now; when scans arrive, cleanup to budget and a matched-camera review with each person before sign-off |
| Scans take far longer than code | The section launches on placeholders (M6); scans swap in one at a time; `ready: false` falls back to the 2D figure |
| Performance in Instagram's in-app browser | WebGL2, a mid tier without post, adaptive scale, posters, LRU disposal, context-loss recovery; tested there in M5 and M6 |
| Shader compiles stall a transition | 24 programs or fewer, `compileAsync` and `initTexture` during limbo or idle, a long-frame detector in tests |
| The browser's view transition snapshots the canvas | The world has no transition name, so it stays under the page in the page's own snapshot, and the DOM swaps during limbo, so old and new frames match; checked in Chrome, Safari and Firefox in M2 |
| Full colour on phones without post-processing | Glow from additive cards and in-material grading, as the reference does (it has no post-processing on any device); real bloom only on the high tier |
| Imagined camps read as real trips | Accepted: no labels, by your choice. Camps don't link to walks |
| Licences (bought models, stock assets, AI output) | Check before buying; credit on `/credits`; prefer CC0 and our own builds |
| Gear changes over time | Panels come from data; gear is parametric; a missing model falls back to a generic placeholder |
| The two night biomes look alike | Different times, light sources and signature hues (§4.5) |
| Accessibility regressions | DOM-first design, with axe and keyboard tests in CI |

---

## 11. Decisions (17 October 2026)

| # | Question | Decision |
| --- | --- | --- |
| 1 | Look against the style guide | Full colour like mont-fort for the 3D scenes; the guide is relaxed for them (recorded in `PRODUCT.md`) |
| 2 | What `/gear/` opens on | The overview above the clouds |
| 3 | Tab order | Harry, Caleb, Mikey, Kevin, everywhere. Done: `src/data/site.ts` and the copy that lists the four of you |
| 4 | Keep the 2D gear pages | Not answered, so the plan assumes the recommendation: they stay as the fallback and detail views |
| 5 | Real places or moods | Moods, with no label on the page. Camps don't link to walks |
| 6 | People | Stylised, for now |
| 7 | Who makes the models | Generic placeholders now; scans later |
| 8 | Pose | Standing still |
| 9 | What gets modelled | The core camp set plus clothing on the figure, the rest list-only, and a campfire in every camp |
| 10 | Mikey's Hilux | Later. A generic car for now, with the tent pitched beside it |
| 11 | Clouds on touch drags | Yes |
| 12 | Ambient sound | None |
| 13 | Hosting | Not final; likely Vercel. Static output needs no adapter, and long cache headers for `/3d/` go in `vercel.json` |
| 14 | Transition length | About 2.2 s |
| 15 | UI around the full-colour scenes | Unchanged: the site's UI exactly as it is now |
| 16 | A tag marking camps as imagined | None. Existing "Sample" tags and the gifted/paid disclosure tags stay |

**Still open (neither blocks M0–M2)**

- **Question 4:** confirm the 2D pages stay, or say if 3D should replace the lineup and person pages.
- **When scans happen:** this sets when M7 can start.

---

## Sources

- Reference: https://mont-fort.com/fort-energy/ and its `/`, `/trading/`, `/capital/` and `/maritime/` tabs, inspected 16 Oct 2026.
- three.js docs (GLTFLoader, KTX2Loader, compressed glTF example): https://github.com/mrdoob/three.js
- Astro view transitions guide: https://docs.astro.build/en/guides/view-transitions/
- three.js r186 Gaussian splats (WebGPURenderer only): https://radiancefields.com/three.js-ships-its-native-gaussian-splat-renderer-and-splat-raycasting-in-r186
- WebGPU in Safari 26: https://webkit.org/blog/17333/webkit-features-in-safari-26-0/
- WebGPU in major browsers: https://web.dev/blog/webgpu-supported-major-browsers
- Mobile WebGPU and WebView status: https://app.cinevva.com/guides/webgl-webgpu-not-supported-fix and https://www.abratabia.com/mobile-web-games/mobile-webgl-support.php
- Mixamo status and alternatives: https://app.cinevva.com/guides/free-character-animations-rigging
- Ready Player Me shutdown: https://avatarsdk.com/blog/2026/08/31/avatar-platforms-2026-whos-alive-whos-gone/
- AI image-to-3D comparisons (vendor-written, treat as directional): https://www.tripo3d.ai/blog/meshy-alternative and https://www.meshy.ai/blog/best-ai-tools-for-3d-game-assets and https://fuser.studio/articles/best-ai-3d-model-generators
- Placeholder sources: Kenney Car Kit https://kenney-assets.itch.io/car-kit, Kenney Survival Kit https://kenney-assets.itch.io/survival-kit, Quaternius Universal Base Characters https://quaternius.itch.io/universal-base-characters
