# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Astro (static site). Deploy target: not yet decided.

## Users

- **Primary: followers of @nocoffee_nowalkies.** People who already know the shared Instagram account and come to the site to go deeper: read trip write-ups, browse photos, and get to know the four people behind it.
- **Secondary: brands evaluating the group for UGC work.** They visit the UGC portfolio to judge past collaborations, the group's content quality and its reach before getting in touch.

## Product Purpose

No Coffee No Walkies is the website of a shared Instagram account run by four friends who hike together. It brings together:

1. **Blog:** written posts documenting hiking trips.
2. **Photos:** a place to publish photos the group likes, beyond the Instagram feed.
3. **Trip documentation:** a record of the trips they have taken.
4. **UGC portfolio:** past user-generated content and brand work, presented as a digital portfolio for prospective brand partners.

Success means two things. Followers find the site worth returning to for stories and photos that Instagram can't hold, and brands leave convinced enough to email.

## Positioning

The content is first-hand: four real friends documenting hikes they actually took, in their own words and photos. That is also the UGC offer. The authenticity brands pay for is what the blog and photos already show, so the editorial content serves as the proof for the portfolio.

## Operating Context

- The site sits next to the Instagram account (@nocoffee_nowalkies), which is the main channel. Most visitors probably arrive from an Instagram bio or post link, often on a phone.
- Content comes from real trips. Posts, photos and trip records build up over time as the group keeps hiking.
- Brands browse the portfolio to evaluate, then make contact by email.

## Capabilities and Constraints

- **Brand contact:** email only, a plain link to nocoffeenowalkies@gmail.com. No contact form.
- **People:** the four members are Harry, Kevin, Caleb and Mikey. Each gets a short profile (name, photo, one line), and posts carry author bylines.
- **Hiking regions:** Blue Mountains, Warrumbungles, Kosciuszko National Park, Tasmania, and Ala Archa National Park (Kyrgyzstan).
- **Walks:** each region holds many walks. A walk has a write-up, photos, trip stats, an optional GPX route (drawn as a route map with an elevation profile), and a grade on the Australian Walking Track Grading System. Walks live at `/places/<region>/<walk>/`.
- **Gear:** each person has a current loadout of items. Item fields are name, brand, category (clothing or gear), type, weight in grams, worn or packed, a cut-out image, and notes. Base, worn and total weights are computed from the items.
  - The section reads like inspecting a character in a video game: a lineup of all four people, then one person in full kit, then a bird's-eye flat-lay of a category, then a single item. Viewers can look but not change anything.
  - There is no shared gear: every item belongs to the person who carries it.
- **Gear reviews:** reviews live at `/gear/reviews/`, and each one can be linked from the matching item in someone's loadout.
  - Each review has a score out of 5 (half steps) and a trail verdict: Still carrying, Would buy again, or Retired.
  - It can also carry pros and cons, how long the item was tested, and the walks it was used on.
  - **Disclosure (brand commitment):** every review states how the item was obtained (bought, gifted, or paid partnership), and gifted or paid reviews must name the brand. This follows the ACCC's guidance for Australian creators, and the build enforces it.
- **Figures:** made from a real full-body photo of each person in kit, cut out to a standard frame. Until those exist, an ink stand-in is drawn.
- **Samples:** walks and gear currently ship as labelled samples, with generic items and no brands, weights or trip stories. See `CONTENT.md` for how to replace them.
- **Open decisions:**
  - each member's profile line and photo;
  - the deploy and hosting target;
  - how content is authored (Markdown/MDX content collections are the natural fit for Astro, but this is not confirmed).

## Brand Commitments

- **Name:** No Coffee No Walkies. **Instagram handle:** @nocoffee_nowalkies.
- **Binding visual style guide:** [SKILL.md](SKILL.md) ("minimalist-ui": warm monochrome, editorial serif headings, flat bento grids, muted pastel accents, no gradients or heavy shadows, no emojis, no AI-cliché copy). The user confirmed that all future design work must follow it.
- **No logo or wordmark exists yet.** Don't present an invented mark as an established one.

## Evidence on Hand

The user has confirmed these exist; none are in the repository yet:

- the group's own trip photos;
- written trip posts and captions that can be adapted;
- past UGC and brand collaboration work with real brands.

Absences that future work must not fabricate:

- brand names, collaboration results, follower counts and engagement metrics;
- testimonials;
- member bios;
- trip details (dates, routes, distances, stories) beyond the confirmed region names;
- anyone's actual gear, brands or weights.

Use the real material once it's supplied. Placeholder imagery may stand in during development, but it must never ship as if it were the group's own photos.

## Product Principles

1. **Real trips, real people.** Every story, photo and portfolio piece comes from the group itself. Authenticity is both the content and the commercial offer.
2. **Go deeper than the feed.** The site earns its place by holding what Instagram can't: longer stories, full photo sets and a trip archive.
3. **The portfolio is a by-product of the blog.** Brand work and editorial content should support each other, not feel like two separate sites.
4. **Brand contact takes one step.** A brand that is convinced should be able to email without friction.
