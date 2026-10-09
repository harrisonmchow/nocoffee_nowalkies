---
name: No Coffee / No Walkies
description: Four friends, five places, one Instagram account, set as a national-park trackhead sign.
colors:
  bone: "#f7f6f3"
  paper: "#fbfbfa"
  white: "#ffffff"
  ink: "#111111"
  ink-2: "#2f3437"
  mute: "#787774"
  mute-on-ink: "#a9a8a4"
  rule: "#eaeaea"
  rule-soft: "rgba(0, 0, 0, 0.06)"
  ink-hover: "#333333"
  green-bg: "#edf3ec"
  green-fg: "#346538"
  blue-bg: "#e1f3fe"
  blue-fg: "#1f6c9f"
  yellow-bg: "#fbf3db"
  yellow-fg: "#956400"
  red-bg: "#fdebec"
  red-fg: "#9f2f2d"
typography:
  display:
    fontFamily: "Instrument Serif, Newsreader, Georgia, serif"
    fontSize: "clamp(3.25rem, 8vw, 7rem)"
    fontWeight: 400
    lineHeight: 0.98
    letterSpacing: "-0.04em"
  headline:
    fontFamily: "Instrument Serif, Newsreader, Georgia, serif"
    fontSize: "clamp(2.5rem, 5vw, 4rem)"
    fontWeight: 400
    lineHeight: 1.05
    letterSpacing: "-0.03em"
  title:
    fontFamily: "Instrument Serif, Newsreader, Georgia, serif"
    fontSize: "1.625rem"
    fontWeight: 400
    lineHeight: 1.05
    letterSpacing: "-0.015em"
  body:
    fontFamily: "Geist Variable, Helvetica Neue, Helvetica, sans-serif"
    fontSize: "1.0625rem"
    fontWeight: 400
    lineHeight: 1.6
    fontFeature: "'ss01'"
  body-small:
    fontFamily: "Geist Variable, Helvetica Neue, Helvetica, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.6
  body-large:
    fontFamily: "Geist Variable, Helvetica Neue, Helvetica, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 400
    lineHeight: 1.7
  meta:
    fontFamily: "Geist Variable, Helvetica Neue, Helvetica, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "Geist Variable, Helvetica Neue, Helvetica, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 500
  tag:
    fontFamily: "Geist Variable, Helvetica Neue, Helvetica, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 600
    lineHeight: 1.5
    letterSpacing: "0.06em"
  mono:
    fontFamily: "Geist Mono Variable, SF Mono, ui-monospace, monospace"
    fontSize: "0.75rem"
    fontWeight: 400
    letterSpacing: "0.02em"
    fontFeature: "'tnum'"
rounded:
  sign: "3px"
  control: "5px"
  photo: "6px"
  tile: "8px"
  card: "10px"
  panel: "12px"
  pill: "9999px"
spacing:
  gutter: "clamp(16px, 4vw, 48px)"
  section: "clamp(96px, 14vw, 160px)"
  max: "1240px"
  nav-h: "64px"
  grid-gap: "16px"
  sign-stack: "8px"
  card-pad: "24px"
  knoll-gutter: "clamp(20px, 3vw, 40px)"
  tile-lg: "240px"
  tile-md: "180px"
  tile-sm: "132px"
  hotspot: "36px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.white}"
    typography: "{typography.body-small}"
    rounded: "{rounded.control}"
    padding: "0.85em 1.3em"
  button-primary-hover:
    backgroundColor: "{colors.ink-hover}"
    textColor: "{colors.white}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "0.85em 1.3em"
  button-ghost-hover:
    backgroundColor: "{colors.white}"
  sign:
    backgroundColor: "{colors.white}"
    textColor: "{colors.ink}"
    typography: "{typography.title}"
    rounded: "{rounded.sign}"
    padding: "14px 18px 14px 20px"
  sign-active:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.white}"
  sign-sm:
    backgroundColor: "{colors.white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sign}"
    padding: "9px 12px 9px 14px"
  tag-nsw:
    backgroundColor: "{colors.green-bg}"
    textColor: "{colors.green-fg}"
    typography: "{typography.tag}"
    rounded: "{rounded.pill}"
    padding: "0.2em 0.65em"
  tag-tas:
    backgroundColor: "{colors.blue-bg}"
    textColor: "{colors.blue-fg}"
    rounded: "{rounded.pill}"
    padding: "0.2em 0.65em"
  tag-kgz:
    backgroundColor: "{colors.yellow-bg}"
    textColor: "{colors.yellow-fg}"
    rounded: "{rounded.pill}"
    padding: "0.2em 0.65em"
  tag-draft:
    backgroundColor: "{colors.red-bg}"
    textColor: "{colors.red-fg}"
    rounded: "{rounded.pill}"
    padding: "0.2em 0.65em"
  tag-grade-1:
    backgroundColor: "{colors.green-bg}"
    textColor: "{colors.green-fg}"
    typography: "{typography.tag}"
    rounded: "{rounded.pill}"
    padding: "0.2em 0.65em"
  tag-grade-2:
    backgroundColor: "{colors.blue-bg}"
    textColor: "{colors.blue-fg}"
    rounded: "{rounded.pill}"
    padding: "0.2em 0.65em"
  tag-grade-3:
    backgroundColor: "{colors.yellow-bg}"
    textColor: "{colors.yellow-fg}"
    rounded: "{rounded.pill}"
    padding: "0.2em 0.65em"
  tag-grade-4:
    backgroundColor: "{colors.red-bg}"
    textColor: "{colors.red-fg}"
    rounded: "{rounded.pill}"
    padding: "0.2em 0.65em"
  tag-grade-5:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.white}"
    rounded: "{rounded.pill}"
    padding: "0.2em 0.65em"
  card:
    backgroundColor: "{colors.white}"
    rounded: "{rounded.card}"
    padding: "{spacing.card-pad}"
  panel:
    backgroundColor: "{colors.white}"
    rounded: "{rounded.panel}"
    padding: "clamp(32px, 5vw, 64px)"
  nav:
    backgroundColor: "rgba(247, 246, 243, 0.86)"
    textColor: "{colors.ink-2}"
    height: "{spacing.nav-h}"
  icon-button:
    backgroundColor: "{colors.white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    size: "44px"
  floor:
    backgroundColor: "{colors.paper}"
    rounded: "{rounded.panel}"
    padding: "clamp(28px, 4vw, 56px) clamp(20px, 4vw, 56px)"
  flat-tile:
    textColor: "{colors.ink}"
    typography: "{typography.body-small}"
    rounded: "{rounded.tile}"
    padding: "6px"
    width: "{spacing.tile-md}"
  hotspot-dot:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.white}"
    typography: "{typography.mono}"
    rounded: "{rounded.pill}"
    size: "{spacing.hotspot}"
  hotspot-label:
    backgroundColor: "{colors.white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sign}"
    padding: "5px 10px"
  kbd:
    backgroundColor: "{colors.bone}"
    textColor: "{colors.ink-2}"
    typography: "{typography.mono}"
    rounded: "4px"
    height: "24px"
    padding: "0 6px"
  weight-bar:
    rounded: "{rounded.sign}"
    height: "28px"
  back-link:
    textColor: "{colors.ink-2}"
    typography: "{typography.body-small}"
    padding: "6px 0"
---

# Design System: No Coffee / No Walkies

## Overview

**Creative North Star: "The Trackhead"**

The site is the sign at the start of a walk. Australian national-park trackhead signage sets the system: a timber-black post, white fingerpost plates with a pointed end, a serif place name, mono coordinates and a bold arrow. The fingerposts are both the navigation and the identity. Around them sits a warm, flat editorial page (the user-confirmed minimalist-ui guide in SKILL.md is binding): bone ground, charcoal ink, hairline 1px borders, and colour only in small washed-out pastel tags.

Density is low and the type contrast is high. Huge Instrument Serif words carry the places; Geist does the plain talking; Geist Mono carries coordinates, credits and counts. Photography is desaturated and warmed by one filter, so stand-in and real photos sit in the same palette. One continuous hand-drawn hairline trail runs down the left gutter of each long page, starting at an open ring and ending at a filled dot. A to-scale latitude figure plots all five regions on a 10-degree grid. Two later data figures follow the same ink-on-white language: a route trace with an elevation profile on walk pages, and a weight bar on gear pages.

Illustration is ink line on white: stand-in figures and top-down item drawings use a 2.5px non-scaling charcoal stroke, white fills, and one flat pastel shape set behind and off-centre. That shape is the person's tone. The gear section adds a game-style inspect camera to the same world. A lineup of four figures standing on 1px ink floor lines leads to a person stage with ink hotspots. From there the view dives into a knolled flat-lay on a dotted paper floor, then into a single item. Signs and the 6px post still carry navigation at every level.

Motion is quiet: one long-tailed ease (`cubic-bezier(0.16, 1, 0.3, 1)`), a 12px rise-and-fade scroll entry, signs that slide 4px toward where they point, and photos that crossfade. Between gear views, one camera move carries the eye: the same figure, name and item morph from page to page as shared elements, while the page underneath swaps quickly. Everything collapses to near-instant under reduced motion, and view transitions are switched off.

**Key Characteristics:**
- Fingerpost signs (plate + authored SVG pointed tip + serif name + mono coordinates + Phosphor bold arrow) as navigation and selectors.
- Warm monochrome with spot pastels used only for region tags and figure highlights.
- Flat surfaces: 1px #EAEAEA borders and white-on-bone tonal steps, no resting shadows.
- One enormous serif region word that never shrinks below its band.
- A single continuous hairline trail per long page.
- Photos graded `saturate(0.82) sepia(0.08)`.
- Ink drawings: 2.5px non-scaling charcoal line, white fills, one pastel offset shape in the owner's tone.
- Shared-element view transitions as the gear camera: lineup to person to flat-lay to item.

## Colors

Warm monochrome on a bone ground, with four washed-out pastels used as signage grades.

### Primary
- **Trackhead Charcoal** (ink): all text, the sign post, the active sign plate, primary buttons, trail line, focus ring and figure dots. It is never pure black.

### Neutral
- **Warm Bone** (bone): page canvas, the translucent nav, lightbox ground, and the open ring at the start of the trail.
- **Paper** (paper): the footer and lightbox control bar. It sits one step lighter than the canvas.
- **Plate White** (white): sign plates, cards, the brand panel and icon buttons. White on bone is the only elevation step.
- **Slate Ink** (ink-2): body copy that is secondary but still reads, such as ledes, blurbs, nav links and footer links.
- **Trail Grey** (mute): meta text, coordinates, credits, labels and the nav wordmark slash.
- **Grey on Ink** (mute-on-ink): meta text on the active charcoal plate.
- **Hairline** (rule): every structural border and divider, the latitude grid, and the resting sign border.
- **Soft Hairline** (rule-soft): the bottom edge of sticky translucent bars (nav, photo sign bar).
- **Charcoal Hover** (ink-hover): primary button hover only.

### Tertiary (spot pastels)
- **Pale Green / Moss** (green-bg / green-fg): the NSW tag and the Australian cluster ring in the latitude figure.
- **Pale Blue / Lake** (blue-bg / blue-fg): the TAS tag.
- **Pale Yellow / Ochre** (yellow-bg / yellow-fg): the KGZ tag, the Ala Archa halo and text selection.
- **Pale Red / Brick** (red-bg / red-fg): the "draft" / "Stand-ins" / "Sample kit" status tag. It marks provisional content.

The same four pairs carry two further mappings:
- **Walk grades** follow the Australian Walking Track Grading System from 1 (easiest) to 5 (hardest): green, blue, yellow, red, then a charcoal pill with white text for grade 5. The grade tag sits beside the walk name and distance.
- **Person tones**: Harry green, Kevin blue, Caleb yellow, Mikey red. A person's tone (the `-bg` value only) fills the circle behind their figure and the offset tile behind each of their item drawings.

Data figures use the `-bg` values as flat fills inside ink outlines: the elevation profile and the start-marker ring in green, and weight-bar segments in green (clothing) and blue (gear).

### Named Rules
**The Grade Tag Rule.** Pastels appear only as pill tags (always as a bg/fg pair), small figure highlights, or the flat grounds of ink drawings and data figures (person offset shapes, weight-bar segments, the elevation fill). Those grounds always sit under or inside charcoal line. Pastels never fill a section, a button or a card.

**The Person Tone Rule.** Each crew member owns one pastel ground, and it appears only on their own figure and item drawings. Never mix two people's tones in one drawing.

**The One Post Rule.** Charcoal at mass (the active plate, the 6px post, the primary button) is the only heavy colour on the page. Each sign group gets one active plate.

## Typography

**Display Font:** Instrument Serif (with Newsreader, Georgia)
**Body Font:** Geist Variable (with Helvetica Neue, Helvetica)
**Label/Mono Font:** Geist Mono Variable (with SF Mono, ui-monospace)

**Character:** The condensed, high-contrast serif works like a place name routed into a sign. The neutral grotesk and the tabular mono read like the small print beneath it. All h1 to h3 elements are serif at weight 400 with negative tracking and balanced wrapping.

### Hierarchy
- **Hero word** (400, `min(10.5vw, band × 0.78)`, 1.12, -0.035em): the single region name in the home band. It stays on one line and swaps with a clip-path wipe.
- **Display** (400, `clamp(3.25rem, 8vw, 7rem)` to `clamp(4rem, 11vw, 9rem)`, 0.92 to 0.98, -0.035 to -0.04em): page h1s and closing statements. Gear h1s step down as the camera moves in: the lineup at the top of the range, the person name just under it, then the category (`clamp(3rem, 7.5vw, 6rem)`) and the item (`clamp(3rem, 6.5vw, 5.5rem)`). The region page's hero word (`clamp(3.5rem, 10.5vw, 11rem)`, 1.02) repeats the home band's single place word.
- **Headline** (400, `clamp(2.5rem, 5vw, 4rem)` to `4.5rem`, -0.03em): section h2s. Statement h2s step down to `clamp(2rem, 4.4vw, 3.6rem)` at 1.08.
- **Title** (400, 1.625rem to 1.75rem): sign names, card titles, crew names, numbered-list heads and walk stat values. Small signs and hotspot labels use 1.25rem. Lineup names are serif at `clamp(2rem, 3.4vw, 3rem)`.
- **Body** (400, 1.0625rem, 1.6, ss01): running text, which is capped at 34 to 52ch. Secondary body is 0.9375rem.
- **Body large** (400, 1.125rem, 1.7): long-form prose (walk write-ups, gear setups) capped at 68ch in slate ink, page ledes and the item brand line.
- **Meta** (400, 0.875rem): spec-list terms, meta rows under a person's name, weight-bar legends, lineup "inspect" CTAs and notes beside a draft tag.
- **Label** (500, 0.8125rem, mute, sentence case): field labels in fact lists and footer columns. It is never an eyebrow above a heading.
- **Tag** (600, 0.6875rem, 0.06em, uppercase): pastel pills only.
- **Mono** (400, 0.75rem, 0.02em, tabular): coordinates, counts, credits and figure axes.

### Named Rules
**The Serif Speaks Places Rule.** Serif is used for names, places and statements. Sans is used for instructions and explanation. The hero h1 is deliberately sans at 1.0625rem/500 because the big word does the shouting.

**The Coordinates Are Mono Rule.** Any latitude, longitude, count, weight, distance or licence string is set in mono with tabular figures. This includes spec-list values, hotspot numbers, keyboard keys and route-map axes.

## Layout

The content column is 1240px max (`max`) with a fluid gutter of `clamp(16px, 4vw, 48px)`. Sections are separated by `clamp(96px, 14vw, 160px)` of top padding and no dividers. Text-plus-figure sections use a 5fr/6fr split with a `clamp(32px, 6vw, 96px)` gap. The text column is sticky under the nav (`nav-h + 32px`) and unsticks below 860px.

The home first viewport is a full-bleed photo with a right column of 340 to 420px holding the post and five signs. Below it, a band of `clamp(150px, 24svh, 240px)` holds the hero word. Below 959px the layout stacks: photo (40svh), word, signs, intro. The places bento is a 6-column grid (4+2 rows, then 2/2, then 3/3) with 16px gaps. It goes to 2 columns at 959px and 1 column at 600px. Card grids use 16px gaps and sign stacks use 8px. Breakpoints observed: 380, 600, 720, 760, 860, 959 and 1399px.

The gear section reuses the 5fr/6fr split. On the person page, the stage on the left is sticky under the nav at `100svh − nav-h − 48px` (min 520px) and holds the figure; the panel on the right holds the name, spec list, category signs on a post, and the setup text. The item page flips to 6fr/5fr, with the drawing on the dotted floor on the left. The lineup is a 4-column row with a `clamp(12px, 2.5vw, 40px)` gap. Below 860px it becomes a horizontal snap scroller of 62vw cards that bleeds into the gutter, and every split stacks with the stage at 58svh.

**The Knolling Rule.** A flat-lay lays items out unrotated, at one scale per footprint class (large 240px, medium 180px, small 132px). Groups sit side by side on one shared bottom baseline, separated by one gutter (`clamp(20px, 3vw, 40px)`; ×2 between groups, ×1.6 between rows), each with a mute label under a hairline. Clothing reads head to toe with one group per row. Below 860px tiles go to a 2-column grid, and large items span both columns, capped at 260px.

Walk pages open on a 56svh photo, then a text column, then a stat strip of hairline-divided cells (min 150px, 2 columns below 600px). The route, prose (centred, 68ch) and gallery follow in sequence. Region pages open on a 58svh photo and a hero word, with a 5fr/6fr walks section whose walk signs hang off the post. Keyboard hints appear only at 700px and up on hover-capable fine pointers.

The trail sits in the left gutter: at `max(8px, (100vw − max)/2 − 64px)` on wide screens, and as a thin gutter-width line from 1399px down.

## Elevation & Depth

The system is flat. Depth comes from tonal steps (white plates and cards on bone, paper footer) and 1px hairlines. The only blur is on sticky bars (nav: `saturate(1.2) blur(10px)` over 86% bone). The only shadow is an ultra-diffuse hover lift on place cards. Ghost buttons draw their border as an inset 1px ring, not a shadow. Hotspot discs carry a 6px bone ring (85% bone) that separates them from the drawing beneath, which is also a ring and not a shadow.

Gear floors (the flat-lay and the item stage) are paper with a faint dot grid: a 1px charcoal dot at 8% opacity every 24px, inside a hairline 12px panel. The ghosted dive backdrop adds depth by distance, not by shadow: the person's figure is scaled far past the viewport behind the flat-lay or item, at 8% opacity with `blur(2px) grayscale(0.4)` on its content.

### Shadow Vocabulary
- **Card hover lift** (`box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04)`): place cards on hover only, together with a border shift to #dcdbd8.
- **Hotspot halo** (`box-shadow: 0 0 0 6px rgba(247, 246, 243, 0.85)`): a spread ring with no offset or blur, used only on hotspot discs.

### Named Rules
**The Flat Plate Rule.** Surfaces are flat at rest. A shadow appears only as a hover response and never above 0.04 opacity.

## Shapes

Corners scale with an object's size and its relation to signage. Signs are crisp (3px on the plate's back corners, with a sharp pointed tip). Controls are 5px, photos 6px, cards 10px and the one feature panel 12px. Pills (9999px) are only for tags. The fingerpost tip is an authored SVG chevron with a non-scaling 1px stroke that continues the plate border, so the plate reads as one cut shape. The post is a 6px charcoal bar with 1px corners. Trail ends are 9px circles (7px on narrow screens).

Gear adds a small set of forms. Figures share one 2:3 frame, with feet at 96% height, and stand on a 1px charcoal floor line drawn at 96.4%, inset 4 to 6% from each side. Flat-lay tiles and their hit areas use 8px (`tile`). An item drawing sits on a square, with its pastel tile at 64% size, offset down-right (24% / 22%) and rounded to 12% of its size. Hotspots are 36px charcoal discs. The weight bar is a 28px strip with a 1px ink outline and 3px corners, and keyboard keys are 24px caps with 4px corners and a 2px bottom edge.

## Components

### Fingerpost Sign (signature)
A crisp plate pointing right. It is the navigation, the hero selector and the photo filter.
- **Shape:** 1px hairline border on three sides, 3px left corners, and a 20px SVG tip (16px at 600px and below, 14px for the small size).
- **Content:** serif name (1.625rem), then a meta row of a grade tag and mono coordinates in mute, then a Phosphor bold arrow.
- **States:** hover slides the plate 4px right and the arrow 2px more. Active press adds `scale(0.99)`. The selected sign inverts to a charcoal plate with white text and mute-on-ink meta (`aria-pressed`). All transitions are 260ms on the house ease.
- **Mounting:** stacks of signs hang 8px apart off a 6px charcoal post to their left.
- **Small variant:** 1.25rem name and 9/12/14px padding. Used in the sticky photo-filter bar with the meta row hidden.

### Stand-in Figure
A whole person drawn in ink. It is a placeholder until a cut-out photo arrives, and it shares the photo's frame.
- **Frame:** a 2:3 box with feet at 96% and the head top near 6%, so focus points and transitions line up for everyone.
- **Drawing:** white-filled body parts outlined in 2.5px non-scaling ink. Limbs are drawn as a 40-unit ink stroke with a 35-unit white stroke inside, and the poles are bare ink. A 150-unit circle in the person's tone sits behind the torso, off-centre to the right.
- **Real cut-out:** when a photo exists, it replaces the drawing inside the same frame.
- **Ghost mode:** the backdrop of a dive. Opacity, blur and grayscale are set on the figure's content rather than on an ancestor, so view-transition snapshots carry them. Inside the dive the strokes scale with the zoom instead of staying at 2.5px, so the line thickens like a camera move.

### Item Drawing
A top-down view of one item type in a 200 × 200 drawing. Shapes marked as fill are white and everything else is a 2.5px non-scaling ink line with round caps and joins. The owner's pastel tile sits behind it, offset down-right. A real top-down cut-out replaces the drawing when one exists.

### Lineup
Four figures in a row, each over a serif name and a meta line (count and weight), with an "inspect" CTA that rises 4px into view on hover.
- **Hover / focus:** the chosen figure lifts 6px; the others fade to 0.38 opacity and grayscale over 360ms. This is a character-select dim, and arrow keys move between people.
- **Mobile:** a horizontal snap scroller. The CTA is always visible and nothing dims.

### Person Stage and Hotspots
The sticky figure stage. Each hotspot is a 36px charcoal disc with a mono number, beside a sign-style label (white, hairline border, 3px corners, 1.25rem serif). Labels can sit left or right of the disc. Hovering or focusing a category sign or hotspot "peeks": the figure scales to 1.14 toward that category's focus point over 700ms. The disc scales to 1.12 on hover.

### Spec List
A borderless definition list with hairline rows, and a hairline on top. Each row is a mute 0.875rem term in a `minmax(110px, 0.8fr)` column, then the value at 0.9375rem. Numeric values are mono 0.875rem with tabular figures, and missing values read "Not weighed yet" in mute.

### Flat-lay
A paper floor with a dot grid and a hairline 12px panel, holding knolled tiles (see the Knolling Rule). Each tile is the item drawing, then its name (0.9375rem, centred, two-line minimum height), then the weight in mono mute. On hover the drawing lifts 5px over 300ms. When you arrive from above, tiles lay down in a cascade: from 16px above at 1.04 scale, 640ms each, staggered 70ms after a 220ms wait. Stepping back out of an item skips the cascade. Category switching uses small signs in a row, with their meta hidden.

### Item Stage
The drawing on the dotted floor (up to 520px, 340px on mobile) beside the item's name, brand line, spec list and notes. At the bottom, a hairline step row holds previous/next text links with Phosphor arrows, and the links underline on hover. Esc goes up a level and the arrow keys step sideways.

### Keyboard Hints
Inline `kbd` caps: mono 0.75rem in slate ink, on a bone fill with a hairline border, a 2px bottom edge and 4px corners, followed by a mute 0.8125rem phrase. They are shown only on hover-capable fine pointers at 700px and up.

### Weight Bar
A proportional strip: 28px tall, 1px ink outline, 3px corners. Segments are separated by 1px ink rules (minimum 3px wide) and filled with the category pastel. Below it, a legend gives each segment a 12px ink-outlined key, a label and a mono weight, at 0.875rem in an auto-fill grid with 180px minimum columns.

### Route Map
A white hairline 10px panel holding the route on a hairline grid. The track is a 2.5-unit ink line on a 9-unit white halo. Km ticks are white circles with ink outlines, start is a ring filled in green, finish is a filled ink dot, and there is an ink scale bar. Labels are mono with a white paint-order stroke. Underneath, the elevation profile is a second white panel: a green area under a 2px ink line, with mono axis labels in a fixed 132-unit left gutter. Scrubbing the profile shows a dashed ink cursor on the profile and a matching cursor on the map (200ms fade in). The caption row holds mono stats in slate ink.

### Lightbox
A full-viewport bone dialog that fades in over 320ms. The photo is contained with a padding of `clamp(16px, 3vw, 40px)`. The bottom bar is paper with a hairline top and holds the caption (mono credit in mute), the count and 44px icon buttons. Below 600px the bar stacks.

### Prose
Long-form body text set in body large (1.125rem/1.7, slate ink, 68ch), with 1.1em between blocks. h2 and h3 are serif in ink with generous space above, and a block that follows a heading closes up to 0.6em. Links are ink and images are graded like every other photo. A blockquote is set as 1.6rem serif in ink with no rule or quote marks.

### Back Link
A 0.9375rem/500 text link in slate ink with a Phosphor arrow-left, naming the level above ("Everyone", the person's name). On hover it takes ink and a 1px ink underline border. It sits above a page's h1 as navigation, not as a label.

### Buttons
- **Shape:** gently squared (5px).
- **Primary:** charcoal fill, white 0.9375rem/500 text, padding 0.85em 1.3em, optional trailing Phosphor icon with a 0.6em gap.
- **Hover / Active:** fill shifts to #333333; press scales to 0.98 over 200ms.
- **Ghost:** transparent with an inset 1px hairline ring, ink text; hover fills white.
- **Text link CTA:** 0.9375rem/500 with a 1px ink underline border. The quiet variant uses mute text over a hairline and takes ink on hover.

### Chips (Tags)
- **Style:** pastel bg/fg pill, 11px/600 uppercase at 0.06em tracking, padding 0.2em 0.65em.
- **Variants:** NSW green, TAS blue, KGZ yellow, draft red. Walk grades run 1 to 5 (green, blue, yellow, red, charcoal).
- **Numbered variant:** inside a category sign, the tag becomes a charcoal pill with a white number that matches its hotspot.

### Cards / Containers
- **Corner Style:** 10px cards, 12px for the single brand panel.
- **Background:** plate white on bone.
- **Shadow Strategy:** flat; hover lift only (see Elevation).
- **Border:** 1px hairline.
- **Internal Padding:** 24px, fluid to `clamp(20px, 2.4vw, 32px)` on place cards. The panel uses `clamp(32px, 5vw, 64px)`.
- **Media:** full-bleed top image with overflow clipped and a 900ms zoom of 1.025 on hover.

### Lists
Fact lists, spec lists, walk stats and numbered asks have no boxes. Rows are separated by a 1px hairline bottom border, with a label or mono counter in a fixed left column (40 to 76px).

### Navigation
- **Style:** 64px sticky bar, translucent bone with blur and a soft hairline bottom. The serif wordmark is "No Coffee / No Walkies" with a muted slash.
- **Links:** Geist 0.9375rem in slate ink. Hover and `aria-current` turn the text ink and add a 1px ink underline border.
- **Mobile (720px and below):** the first link is dropped, the Instagram label becomes visually hidden (icon only), and the wordmark shrinks to 1.15rem.

### Icon Button
A 44px square with a white fill, hairline border and 5px radius. Hover fills bone; press scales to 0.96. Used for the lightbox controls (see Lightbox).

### Trail
A 1px charcoal hand-drawn S-curve SVG (non-scaling stroke) behind the content of each long page. It starts at an open bone ring and ends at a filled charcoal dot. It is decorative (`aria-hidden`) and ignores pointer events.

### Latitude Figure
An equirectangular grid of 10-degree squares in hairline. The equator is dashed in mute. Region dots are charcoal, labels are serif and axes are mono. Pastel figure highlights (the cluster ring in green, the isolated-point halo in yellow) follow the tag pairs, and a dotted charcoal link is labelled in italic serif.

## Do's and Don'ts

### Do:
- **Do** use the fingerpost sign for any choice between places, with one active charcoal plate per group.
- **Do** keep every border a 1px hairline (#EAEAEA) and every resting surface flat.
- **Do** grade every photo with `filter: saturate(0.82) sepia(0.08)` and credit stand-ins in mono beside a red draft tag.
- **Do** set coordinates, counts and licences in Geist Mono with tabular figures.
- **Do** use Phosphor Icons in the bold weight, inlined as SVG.
- **Do** animate with `cubic-bezier(0.16, 1, 0.3, 1)`: 600ms 12px scroll entry staggered by 80ms, and 200 to 260ms state changes.
- **Do** keep h1 to h3 in Instrument Serif at weight 400 with negative tracking.
- **Do** draw stand-ins as ink on white: a 2.5px non-scaling charcoal stroke, white fills, and one pastel ground in the owner's tone.
- **Do** carry a gear view change as one camera move: give the same element the same view-transition name on both pages (`figure-<person>`, `name-<person>`, `item-<person>-<id>`), with a 640ms group morph and a fast root swap (180ms out, 360ms in after 90ms).
- **Do** knoll flat-lays: unrotated items, one scale per footprint class, one baseline and one gutter.
- **Do** give every inspect view a way up (Esc and a back link) and a way sideways (arrow keys and previous/next links).

### Don't:
- **Don't** use Inter, Roboto or Open Sans, or thin-line icon sets (Lucide, Feather, Heroicons).
- **Don't** use gradients, neon colours or glassmorphism beyond the sticky-bar blur.
- **Don't** fill sections, buttons or cards with pastel or saturated colour; pastels are tags, figure highlights and the grounds of ink drawings and data figures only.
- **Don't** use shadows heavier than `0 2px 8px rgba(0,0,0,0.04)`, or any shadow at rest.
- **Don't** use pill radius for cards, panels or primary buttons.
- **Don't** use pure black (#000000) for text.
- **Don't** put a small label or eyebrow above a heading; labels name fields, not sections.
- **Don't** use emojis.
- **Don't** rotate, scatter or overlap flat-lay items.
