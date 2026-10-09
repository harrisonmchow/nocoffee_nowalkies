# Adding content

Everything on the site comes from files in this repo. Edit them, run `npm run build`, and deploy `dist/`. Anything marked `sample: true` shows a "Sample" tag on the site, so you can tell what still needs replacing.

## Walks

Each walk is a folder inside its region:

```
src/content/walks/<region>/<walk-name>/
  index.md      ← the write-up
  route.gpx     ← optional: exported from Strava, Garmin or AllTrails
  cover.jpg     ← photos for this walk, any names you like
  day-2.jpg
```

`<region>` is one of `blue-mountains`, `warrumbungles`, `kosciuszko`, `tasmania` or `ala-archa`. The folder name becomes the URL, so `kosciuszko/main-range-loop/` is served at `/places/kosciuszko/main-range-loop/`.

The top of `index.md` holds the details. Only the first four fields are required:

```yaml
---
title: Main Range loop
region: kosciuszko
summary: One or two sentences for the top of the page and for link previews.
cover: ./cover.jpg
coverAlt: Describe the cover photo for people who can't see it.

date: 2026-01-18
nights: 1               # 0 for a day walk
walkers: [harry, kevin, caleb, mikey]
author: harry           # who wrote it, shown as "Words by Harry"
grade: 4                # Australian Walking Track Grading System, 1 to 5
gpx: route.gpx          # distance and climbing are worked out from this
distanceKm: 22          # optional: override the GPX numbers if they look off
elevationGainM: 900
gallery:
  - image: ./day-2.jpg
    caption: Morning at Seamans Hut
    by: Kevin
---
```

Below the second `---`, write the walk in Markdown. Use `## Headings` for days or sections, and put photos between paragraphs with `![What the photo shows](./photo.jpg)`.

The route map and elevation profile only appear when a GPX file is present. To get one, export it from Strava (activity → ⋯ → Export GPX), Garmin Connect (⚙ → Export to GPX) or AllTrails (Download route → GPX).

To delete the samples, remove each `sample-walk` folder.

## Gear

Each person has two files:

- `src/content/loadouts/<person>.md` holds their figure photo and their write-up on the setup.
- `src/content/gear/<person>.yaml` lists their items. Put cut-out photos of the items in `src/content/gear/<person>/`.

An item looks like this:

```yaml
items:
  - id: rain-jacket          # lowercase-with-dashes; becomes the URL
    name: Torrent Shell 3L   # the model
    brand: Patagonia
    category: clothing       # clothing or gear
    type: rain-jacket        # see the list below
    weightG: 394             # grams, from a kitchen scale
    worn: false              # clothing counts as worn unless false; gear counts as packed unless true
    image: ./harry/rain-jacket.png
    notes: Why you carry it, what you'd change.
    link: https://example.com/product
```

**Clothing types:** `hat`, `gloves`, `rain-jacket`, `down-jacket`, `fleece`, `shirt`, `pants`, `socks`, `shoes`.

**Gear types:** `bag`, `tent`, `sleeping-pad`, `sleeping-bag`, `quilt`, `cooking`, `water`, `electronics`, `first-aid`, `accessories`.

The type decides where the item sits on the flat-lay. To add a new type, add one line to `src/data/gear-types.ts`.

Weights are added up automatically:

- **Base weight:** everything in the pack.
- **Worn:** everything on your body.
- **Total:** base plus worn.

Until any item has a weight, the pages show "weights to come".

## Gear reviews

Each review is a folder:

```
src/content/reviews/<review-name>/
  index.md      ← the review
  cover.jpg     ← optional photo; without one, the item's drawing is used
```

The folder name becomes the URL, so `harry-rain-jacket/` is served at `/gear/reviews/harry-rain-jacket/`.

The top of `index.md` holds the details:

```yaml
---
title: Two winters in the Torrent Shell
summary: One or two sentences for the review list and link previews.
itemName: Torrent Shell 3L
brand: Patagonia
type: rain-jacket          # same types as gear lists
author: harry
date: 2026-07-01
rating: 4                  # out of 5, half steps allowed (3.5)
verdict: still-carrying    # still-carrying, would-buy-again or retired
acquired: bought           # bought, gifted or paid-partnership (always shown)
partner: Brand name        # required when gifted or paid-partnership
tested:
  trips: 9
  nights: 14
  km: 210
  since: 2024-06-01
pros:
  - Stays dry in sideways rain.
cons:
  - Hood doesn't fit over a helmet.
item: { person: harry, id: rain-jacket }   # links to the item in Harry's kit
walks: [kosciuszko/main-range-loop]        # walks it was used on
cover: ./cover.jpg
coverAlt: Describe the photo.
---
```

Below the second `---`, write the review in Markdown.

**How we got it is always shown.**
- Every review and every card in the list shows whether the item was bought, gifted, or part of a paid partnership.
- Gifted and paid items must name the brand. The build fails if `partner` is missing.
- This matches the ACCC's expectation that Australian creators clearly disclose gifted and paid content.

**Links are checked when the site builds:**
- The build fails if an `item` or `walks` entry doesn't match a real loadout item or walk folder, so broken links can't go live.
- A linked item's page shows a "Read Harry's review" sign.
- Each walk listed in `walks` shows the review under "Gear reviewed on this walk".

To delete the samples, remove the `sample-*` folders.

## Making the figures and flat-lays

The gear section is built around two kinds of picture. Each person needs one full-body figure in kit, and each item needs a top-down cut-out. Until they exist, the site draws ink stand-ins.

### Figures (one per person)

1. **Shoot.** Put the phone on a tripod at hip height, about 3 m away, in portrait orientation. Stand against a plain wall in open shade (no direct sun), and use the same spot for all four people. Wear the full kit with the pack on, face the camera, and hold your arms slightly away from your body so the straps and hip belt show.
2. **Cut out.** Any of these work:
   - Photoroom
   - remove.bg
   - Apple Photos: long-press the subject, then Copy Subject
   - Open-source `rembg` with the BiRefNet model: `pip install "rembg[cli]"`, then `rembg i -m birefnet-general in.jpg out.png`
3. **Frame.** Make a 1200 × 1800 px transparent PNG with the feet at about 96% of the height and the top of the head at about 6%. Every figure using the same frame keeps the lineup level and the transitions aligned.
4. **Optional studio pass.** An image-editing model can even out lighting across the four photos. Options include OpenAI's image edit, Google's Gemini 2.5 Flash Image and Black Forest Labs' Flux Kontext. A prompt like this works: *"Keep this person's identity and every item of clothing and gear exactly as it is. Relight as soft, even studio light. Plain transparent background. Full body, same framing."*
   - Compare the result with the original photo carefully. These models like to change logos, colours, buckles and strap layouts, and the whole point is that this is your real kit.
5. **Save and point to it.** Save the result as `src/content/loadouts/<person>.png`. Add `figure: ./<person>.png` and a `figureAlt:` description to that person's `.md` file.
6. **Set the focus points.** In the same file, set `focus:` so the category markers land on the right places: `clothing` on the chest, `gear` on the pack. Values are percentages across (`x`) and down (`y`) the figure.

**A future idea:** shoot 8–16 photos while the person turns on the spot, then cut them out the same way. They could become a drag-to-rotate turntable on the person page.

### Item flat-lays

1. **Shoot** each item from directly overhead on a plain sheet in daylight. Use a phone level app to keep the camera square, and keep the camera at the same height for every item so their sizes stay true to each other.
   - Alternatively, lay out the whole kit tidily (knolling) and take one photo. Then split it into items with Segment Anything (segment-anything.com) or a Photoroom batch.
2. **Cut out** each item to a square transparent PNG, roughly 1200 × 1200 px.
   - Generative fill can tidy creases or a stray shadow. Don't let it redraw branding.
3. **Save** each one in `src/content/gear/<person>/` and set `image:` on the item.

## Photos

The region photos currently shown are openly licensed stand-ins from Wikimedia Commons, listed on `/credits` and in `src/data/stand-in-credits.json`. Photos from walk folders appear on the Photos page and the region pages automatically. Once you have enough of your own, remove the stand-ins from `src/data/photos.ts`.
