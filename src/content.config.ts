import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';
import { regions } from './data/regions';
import { crewIds } from './data/site';
import { itemTypeKeys, categories } from './data/gear-types';
import { biomeIds } from './data/biomes';

const regionSlugs = regions.map((r) => r.slug) as [string, ...string[]];

// One folder per walk: src/content/walks/<region>/<walk>/index.md
// Photos and an optional route.gpx sit beside the Markdown file.
const walks = defineCollection({
  loader: glob({
    pattern: '*/*/index.md',
    base: './src/content/walks',
    generateId: ({ entry }) => entry.replace(/\/index\.md$/, ''),
  }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      region: z.enum(regionSlugs),
      summary: z.string(),
      date: z.coerce.date().optional(),
      nights: z.number().int().min(0).optional(),
      walkers: z.array(z.enum(crewIds)).default([]),
      author: z.enum(crewIds).optional(),
      /** Australian Walking Track Grading System, 1 (easiest) to 5 (hardest). */
      grade: z.number().int().min(1).max(5).optional(),
      /** Override the values computed from route.gpx. */
      distanceKm: z.number().positive().optional(),
      elevationGainM: z.number().min(0).optional(),
      gpx: z.string().optional(),
      cover: image(),
      coverAlt: z.string(),
      gallery: z
        .array(z.object({ image: image(), caption: z.string(), by: z.string().optional() }))
        .default([]),
      sample: z.boolean().default(false),
      draft: z.boolean().default(false),
    }),
});

// One file per person: src/content/loadouts/<person>.md
// The Markdown body is the person's write-up about their setup.
const point = z.object({ x: z.number().min(0).max(100), y: z.number().min(0).max(100) });
const loadouts = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/loadouts' }),
  schema: ({ image }) =>
    z.object({
      person: z.enum(crewIds),
      figure: image().optional(),
      figureAlt: z.string().optional(),
      updated: z.coerce.date().optional(),
      /** Where on the figure each category lives, in % of the figure box. */
      focus: z.object({ clothing: point, gear: point }),
      sample: z.boolean().default(false),
    }),
});

// One file per person: src/content/gear/<person>.yaml, cut-outs in src/content/gear/<person>/
const gear = defineCollection({
  loader: glob({ pattern: '*.yaml', base: './src/content/gear' }),
  schema: ({ image }) =>
    z.object({
      sample: z.boolean().default(false),
      items: z.array(
        z.object({
          id: z.string().regex(/^[a-z0-9-]+$/),
          name: z.string(),
          brand: z.string().optional(),
          category: z.enum(categories),
          type: z.enum(itemTypeKeys),
          weightG: z.number().positive().optional(),
          /** Worn on the body rather than carried in the pack. */
          worn: z.boolean().optional(),
          image: image().optional(),
          notes: z.string().optional(),
          link: z.url().optional(),
          /** A hex colour, e.g. '#6b7a5a'. Tints the item's 3D placeholder. */
          colour: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
          /** Only for items that appear in the 3D camp. Clothing shows on the figure instead. */
          scene: z
            .object({
              /** A placeholder preset such as proc:tent/trekking-pole, or a model id from the 3D asset manifest. */
              model: z.string().regex(/^(proc:)?[a-z0-9][a-z0-9/-]*$/),
              /** Where the item's hotspot sits in the camp layout. Defaults to the item id. */
              anchor: z.string().regex(/^[a-z0-9-]+$/).optional(),
            })
            .optional(),
        }),
      ),
    }),
});

// One file per person: src/content/camps/<person>.yaml
// Their camp in the 3D world on /gear. Camps are imagined moods, not real trips.
const camps = defineCollection({
  loader: glob({ pattern: '*.yaml', base: './src/content/camps' }),
  schema: z.object({
    person: z.enum(crewIds),
    biome: z.enum(biomeIds),
    title: z.string(),
    pose: z.enum(['standing']).default('standing'),
    /** Alt text for the camp's poster, the still shown when 3D can't run. */
    posterAlt: z.string().optional(),
    /** False until the 3D camp is worth showing; until then the page keeps the 2D figure. */
    ready: z.boolean().default(false),
    /** A dog at the campsite (a generic stand-in for now). */
    dog: z.boolean().default(false),
    sample: z.boolean().default(false),
  }),
});

// One folder per review: src/content/reviews/<review-name>/index.md
// Photos sit beside the Markdown file.
const reviews = defineCollection({
  loader: glob({
    pattern: '*/index.md',
    base: './src/content/reviews',
    generateId: ({ entry }) => entry.replace(/\/index\.md$/, ''),
  }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      summary: z.string(),
      /** The product being reviewed. */
      itemName: z.string(),
      brand: z.string().optional(),
      type: z.enum(itemTypeKeys),
      author: z.enum(crewIds),
      date: z.coerce.date().optional(),
      /** Out of 5, in half steps. */
      rating: z.number().min(0.5).max(5).multipleOf(0.5),
      verdict: z.enum(['still-carrying', 'would-buy-again', 'retired']),
      /** How we got it. Shown on every review and card (ACCC disclosure). */
      acquired: z.enum(['bought', 'gifted', 'paid-partnership']),
      /** The brand that gifted it or paid for the partnership. */
      partner: z.string().optional(),
      tested: z
        .object({
          trips: z.number().int().positive().optional(),
          nights: z.number().int().positive().optional(),
          km: z.number().positive().optional(),
          since: z.coerce.date().optional(),
        })
        .optional(),
      pros: z.array(z.string()).default([]),
      cons: z.array(z.string()).default([]),
      /** The same item in someone's loadout, e.g. { person: harry, id: rain-jacket }. */
      item: z.object({ person: z.enum(crewIds), id: z.string() }).optional(),
      /** Walks it was used on, as <region>/<walk>, e.g. kosciuszko/main-range-loop. */
      walks: z.array(z.string()).default([]),
      cover: image().optional(),
      coverAlt: z.string().optional(),
      sample: z.boolean().default(false),
      draft: z.boolean().default(false),
    })
    .refine((r) => r.acquired === 'bought' || Boolean(r.partner), {
      message: 'Gifted and paid-partnership reviews must name the partner brand',
      path: ['partner'],
    }),
});

export const collections = { walks, loadouts, gear, reviews, camps };
