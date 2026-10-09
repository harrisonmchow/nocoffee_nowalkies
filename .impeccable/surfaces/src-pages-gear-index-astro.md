---
version: 1
slug: "src-pages-gear-index-astro"
primary_target: "src/pages/gear/index.astro"
related_targets: ["src/pages/gear/[person]/index.astro","src/pages/places/[region]/index.astro","src/pages/gear/reviews/index.astro"]
---

# Surface brief: Gear (lineup, person, category, item) and Walks (region, walk)

Scope: `/gear/reviews/` and `/gear/reviews/[review]/` (Read mode, added later), `/gear/`, `/gear/[person]/`, `/gear/[person]/[category]/`, `/gear/[person]/[category]/[item]/` (Experience mode). `/places/[region]/` and `/places/[region]/[walk]/` (Read mode).
World: inherits The Trackhead (DESIGN.md, SKILL.md binding). No new identity.
Audience: followers browsing the group's kit and trips; brands checking the gear they actually use.
Content: labelled samples (generic items, no brands or weights, no invented trip stories). The single sample GPX is synthetic and labelled as such.

## Direction contract

THESIS: inspect a hiker the way a game lets you inspect a character. One continuous camera moves from the lineup to the person to a laid-out category to a single item, read-only. This replaces the default arrangement of a product table or card grid of gear.

OWN-WORLD: bone ground, ink line, pastel offset shapes per person (Harry green, Kevin blue, Caleb yellow, Mikey red). Figures are 2:3 cut-outs standing on a 1px ink floor line. Flat-lays are knolled, unrotated items on a paper floor with a faint dot grid. Hotspots are ink discs with sign-style labels. Signs and the 6px post carry navigation.

STORY: the visitor sees all four in kit, picks one, reads their base/worn/total and setup, dives into clothing or gear laid out head to toe or by system, inspects one item, and steps through items with arrows or goes back with Esc.

FIRST VIEWPORT: Gear lineup. A huge "Gear" serif heading with a lede and Samples note on the left, and key hints on the right. Four full figures standing on floor lines in a row, with names in serif and counts underneath. Hovering one dims the rest. Signature interaction: shared-element view transitions. The figure morphs from the lineup into the person stage, then dives (zooms toward the category's focus point and fades to a backdrop) into the flat-lay. Each item's art morphs into the item page and back.

FORM: video-game character inspect screen inside the Trackhead world. Specified by the user, so no concept roll for this surface. Builds on seed key 7c83c0ac.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Reviews extension
Reviews inherit this contract. The hub is a ledger list of rows, not a card grid: item drawing or cover, serif title, product, summary, then a meta line with the rating (five ink markers, half steps), verdict tag, disclosure tag and author. A review page reuses the item-stage floor for the art, then the title, product line, a bordered disclosure notice (always present; a paid partnership gets an ink border and an ink tag), rating and verdict, spec list, pros and cons, prose, walks it was carried on, and prev/next. `review-<id>` morphs the art from hub row to review. Item pages and walk pages link to reviews with signs.

## Unresolved
- Real figures (photo cut-outs per CONTENT.md), real items, weights and brands.
- Real walk write-ups and GPX files.
