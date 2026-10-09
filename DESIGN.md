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
---

# Design System: No Coffee / No Walkies

## Overview

**Creative North Star: "The Trackhead"**

The site is the sign at the start of a walk. Australian national-park trackhead signage sets the system: a timber-black post, white fingerpost plates with a pointed end, a serif place name, mono coordinates and a bold arrow. The fingerposts are both the navigation and the identity. Around them sits a warm, flat editorial page (the user-confirmed minimalist-ui guide in SKILL.md is binding): bone ground, charcoal ink, hairline 1px borders, and colour only in small washed-out pastel tags.

Density is low and the type contrast is high. Huge Instrument Serif words carry the places; Geist does the plain talking; Geist Mono carries coordinates, credits and counts. Photography is desaturated and warmed by one filter, so stand-in and real photos sit in the same palette. One continuous hand-drawn hairline trail runs down the left gutter of each long page, starting at an open ring and ending at a filled dot. A to-scale latitude figure plots all five regions on a 10-degree grid as the one data illustration.

Motion is quiet: one long-tailed ease (`cubic-bezier(0.16, 1, 0.3, 1)`), a 12px rise-and-fade scroll entry, signs that slide 4px toward where they point, and photos that crossfade. Everything collapses to near-instant under reduced motion.

**Key Characteristics:**
- Fingerpost signs (plate + authored SVG pointed tip + serif name + mono coordinates + Phosphor bold arrow) as navigation and selectors.
- Warm monochrome with spot pastels used only for region tags and figure highlights.
- Flat surfaces: 1px #EAEAEA borders and white-on-bone tonal steps, no resting shadows.
- One enormous serif region word that never shrinks below its band.
- A single continuous hairline trail per long page.
- Photos graded `saturate(0.82) sepia(0.08)`.

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
- **Pale Red / Brick** (red-bg / red-fg): the "draft" / "Stand-ins" status tag. It marks provisional content.

### Named Rules
**The Grade Tag Rule.** Pastels appear only as pill tags or small figure highlights, always as a bg/fg pair. They never fill a section, a button or a card.

**The One Post Rule.** Charcoal at mass (the active plate, the 6px post, the primary button) is the only heavy colour on the page. Each sign group gets one active plate.

## Typography

**Display Font:** Instrument Serif (with Newsreader, Georgia)
**Body Font:** Geist Variable (with Helvetica Neue, Helvetica)
**Label/Mono Font:** Geist Mono Variable (with SF Mono, ui-monospace)

**Character:** The condensed, high-contrast serif works like a place name routed into a sign. The neutral grotesk and the tabular mono read like the small print beneath it. All h1 to h3 elements are serif at weight 400 with negative tracking and balanced wrapping.

### Hierarchy
- **Hero word** (400, `min(10.5vw, band × 0.78)`, 1.12, -0.035em): the single region name in the home band. It stays on one line and swaps with a clip-path wipe.
- **Display** (400, `clamp(3.25rem, 8vw, 7rem)` to `clamp(4rem, 11vw, 9rem)`, 0.95 to 0.98, -0.04em): page h1s and closing statements.
- **Headline** (400, `clamp(2.5rem, 5vw, 4rem)` to `4.5rem`, -0.03em): section h2s. Statement h2s step down to `clamp(2rem, 4.4vw, 3.6rem)` at 1.08.
- **Title** (400, 1.625rem to 1.75rem): sign names, card titles, crew names and numbered-list heads. Small signs use 1.25rem.
- **Body** (400, 1.0625rem, 1.6, ss01): running text, which is capped at 34 to 52ch. Secondary body is 0.9375rem.
- **Label** (500, 0.8125rem, mute, sentence case): field labels in fact lists and footer columns. It is never an eyebrow above a heading.
- **Tag** (600, 0.6875rem, 0.06em, uppercase): pastel pills only.
- **Mono** (400, 0.75rem, 0.02em, tabular): coordinates, counts, credits and figure axes.

### Named Rules
**The Serif Speaks Places Rule.** Serif is used for names, places and statements. Sans is used for instructions and explanation. The hero h1 is deliberately sans at 1.0625rem/500 because the big word does the shouting.

**The Coordinates Are Mono Rule.** Any latitude, longitude, count or licence string is set in mono with tabular figures.

## Layout

The content column is 1240px max (`max`) with a fluid gutter of `clamp(16px, 4vw, 48px)`. Sections are separated by `clamp(96px, 14vw, 160px)` of top padding and no dividers. Text-plus-figure sections use a 5fr/6fr split with a `clamp(32px, 6vw, 96px)` gap. The text column is sticky under the nav (`nav-h + 32px`) and unsticks below 860px.

The home first viewport is a full-bleed photo with a right column of 340 to 420px holding the post and five signs. Below it, a band of `clamp(150px, 24svh, 240px)` holds the hero word. Below 959px the layout stacks: photo (40svh), word, signs, intro. The places bento is a 6-column grid (4+2 rows, then 2/2, then 3/3) with 16px gaps. It goes to 2 columns at 959px and 1 column at 600px. Card grids use 16px gaps and sign stacks use 8px. Breakpoints observed: 380, 600, 720, 760, 860, 959 and 1399px.

The trail sits in the left gutter: at `max(8px, (100vw − max)/2 − 64px)` on wide screens, and as a thin gutter-width line from 1399px down.

## Elevation & Depth

The system is flat. Depth comes from tonal steps (white plates and cards on bone, paper footer) and 1px hairlines. The only blur is on sticky bars (nav: `saturate(1.2) blur(10px)` over 86% bone). The only shadow is an ultra-diffuse hover lift on place cards. Ghost buttons draw their border as an inset 1px ring, not a shadow.

### Shadow Vocabulary
- **Card hover lift** (`box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04)`): place cards on hover only, together with a border shift to #dcdbd8.

### Named Rules
**The Flat Plate Rule.** Surfaces are flat at rest. A shadow appears only as a hover response and never above 0.04 opacity.

## Shapes

Corners scale with an object's size and its relation to signage. Signs are crisp (3px on the plate's back corners, with a sharp pointed tip). Controls are 5px, photos 6px, cards 10px and the one feature panel 12px. Pills (9999px) are only for tags. The fingerpost tip is an authored SVG chevron with a non-scaling 1px stroke that continues the plate border, so the plate reads as one cut shape. The post is a 6px charcoal bar with 1px corners. Trail ends are 9px circles (7px on narrow screens).

## Components

### Fingerpost Sign (signature)
A crisp plate pointing right. It is the navigation, the hero selector and the photo filter.
- **Shape:** 1px hairline border on three sides, 3px left corners, and a 20px SVG tip (16px at 600px and below, 14px for the small size).
- **Content:** serif name (1.625rem), then a meta row of a grade tag and mono coordinates in mute, then a Phosphor bold arrow.
- **States:** hover slides the plate 4px right and the arrow 2px more. Active press adds `scale(0.99)`. The selected sign inverts to a charcoal plate with white text and mute-on-ink meta (`aria-pressed`). All transitions are 260ms on the house ease.
- **Mounting:** stacks of signs hang 8px apart off a 6px charcoal post to their left.
- **Small variant:** 1.25rem name and 9/12/14px padding. Used in the sticky photo-filter bar with the meta row hidden.

### Buttons
- **Shape:** gently squared (5px).
- **Primary:** charcoal fill, white 0.9375rem/500 text, padding 0.85em 1.3em, optional trailing Phosphor icon with a 0.6em gap.
- **Hover / Active:** fill shifts to #333333; press scales to 0.98 over 200ms.
- **Ghost:** transparent with an inset 1px hairline ring, ink text; hover fills white.
- **Text link CTA:** 0.9375rem/500 with a 1px ink underline border. The quiet variant uses mute text over a hairline and takes ink on hover.

### Chips (Tags)
- **Style:** pastel bg/fg pill, 11px/600 uppercase at 0.06em tracking, padding 0.2em 0.65em.
- **Variants:** NSW green, TAS blue, KGZ yellow, draft red.

### Cards / Containers
- **Corner Style:** 10px cards, 12px for the single brand panel.
- **Background:** plate white on bone.
- **Shadow Strategy:** flat; hover lift only (see Elevation).
- **Border:** 1px hairline.
- **Internal Padding:** 24px, fluid to `clamp(20px, 2.4vw, 32px)` on place cards. The panel uses `clamp(32px, 5vw, 64px)`.
- **Media:** full-bleed top image with overflow clipped and a 900ms zoom of 1.025 on hover.

### Lists
Fact lists and numbered asks have no boxes. Rows are separated by a 1px hairline bottom border, with a label or mono counter in a fixed left column (40 to 76px).

### Navigation
- **Style:** 64px sticky bar, translucent bone with blur and a soft hairline bottom. The serif wordmark is "No Coffee / No Walkies" with a muted slash.
- **Links:** Geist 0.9375rem in slate ink. Hover and `aria-current` turn the text ink and add a 1px ink underline border.
- **Mobile (720px and below):** the first link is dropped, the Instagram label becomes visually hidden (icon only), and the wordmark shrinks to 1.15rem.

### Icon Button
A 44px square with a white fill, hairline border and 5px radius. Hover fills bone; press scales to 0.96. Used for the lightbox controls.

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

### Don't:
- **Don't** use Inter, Roboto or Open Sans, or thin-line icon sets (Lucide, Feather, Heroicons).
- **Don't** use gradients, neon colours or glassmorphism beyond the sticky-bar blur.
- **Don't** fill sections, buttons or cards with pastel or saturated colour; pastels are tags and figure highlights only.
- **Don't** use shadows heavier than `0 2px 8px rgba(0,0,0,0.04)`, or any shadow at rest.
- **Don't** use pill radius for cards, panels or primary buttons.
- **Don't** use pure black (#000000) for text.
- **Don't** put a small label or eyebrow above a heading; labels name fields, not sections.
- **Don't** use emojis.
