# Image analysis — tent (IMG_4842 primary, IMG_4850 secondary)

Crops: crops/a_tent.jpg, crops/a_top.jpg, crops/b_tent.jpg, crops/b_top.jpg

## L1 Identification
Freestanding two-person backpacking tent, hubbed frame + raised ridge pole, single-wall-looking
fly over an inner (dark inner floor visible under the hem). primaryDomain=object, confidence 0.9.

## L2 Form & silhouette
Low, wide dome with a short flat ridge. Footprint rectangle, long axis X (2.1 m), short axis Z
(1.3 m), apex ~1.0 m. Bilateral symmetry about both X=0 and Z=0 (approx.). Door (+Z) face is a
large trapezoid: base ~2x the ridge length. End walls (±X) are steep sloped trapezoids.

## Correction of the brief's pole reading (observation first)
- OBSERVED (a_top): a single long pole runs along the LONG axis over the top, standing proud of
  the fly, with up-curved ends clipped to the fly's top corners. It is a ridge/spreader pole, not
  a brow pole over the door.
- OBSERVED (a_top): a white hub sits at the apex; a short strut rises from the hub to a fitting at
  the ridge pole's midpoint; two legs run from the hub down to the two door-side corners (inverted V).
- OBSERVED (b_top/b_tent): from the far side, the same arrangement: hub at top, legs running down
  to the far-side corners (one seen nearly edge-on as a vertical line).
- INFERENCE: the frame is ONE hubbed pole with four legs (hub -> each corner) + the ridge pole.
  "Two long poles crossing over the top" is visually close (the diagonal legs read as an X in plan)
  but there is a hub, not a crossing. Modelled as hub + 4 legs; the crossing detail = hub + strut.
- OBSERVED: the peaked "awning" over the door is a small triangular vent hood just below the hub,
  propped open by a short kickstand (black webbing tab visible under it). A second vent hood is
  visible on the far face in IMG_4850 (b_top, right of the vertical leg).
- CONFIRMED: poles are outside the fly, attached by small black clips (~3–4 per leg).
- CONFIRMED: the fly comes to within a few cm of the ground on all visible sides; a dark band
  under the hem is the inner's bathtub floor.

## L3 Decomposition
macro: fly (door face, back face, two end walls, ridge strip), frame (hub, strut, 4 legs, ridge pole), door, awning (vent hood)
meso: vent hood + kickstand (x2), door panel + zip, hem, panel seams along face/end boundaries
micro: pole clips (black), green velcro loops at legs, door toggle tab, ridge-end grommets, pole tips

## L4 Relationships
<legs, attached-to, hub> socket; <strut, connects, hub+ridge pole> socket; <ridge pole ends, clipped-to, fly ridge corners>;
<clips, attached-to, legs+fly> overlap; <vent hood, attached-to, fly face below hub> overlap; <door, hinged-on, door-face side edge>.

## L5/L6 Materials
fly: coated ripstop nylon, dielectric, roughness ~0.6 (soft sheen along creases), opaque.
Observed colour is blue-shifted by dusk skylight with no direct sun; albedo must be de-lit to a pale
sage green (see material evidence). poles: anodised/dull aluminium, metalness ~0.8, roughness ~0.45,
light grey. hub: white/pale grey plastic-alloy. clips: black plastic, rough. loops: pale green webbing.
inner floor (hem gap): dark charcoal-blue.

## L7 Identity features
raised ridge pole proud of the fly; apex hub + strut; inverted-V legs on the door face;
peaked vent hood under the hub; clips along legs; soft sag/wrinkles between pole lines; low hem.

## L8 Uncertainty
- hidden: back end/back face below ~40% height (shrubs in IMG_4850), ground line on all sides
  (vegetation), stakes and guy-lines (none visible) -> inferred, kept plain or omitted.
- uncertain: door zip line is not readable at this resolution/lighting -> door outline inferred
  (standard curved-top door on the +Z face), low confidence.
- uncertain: exact leg curvature on far side; assumed mirror of door side.
