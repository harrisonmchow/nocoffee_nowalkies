import { getCollection, type CollectionEntry } from 'astro:content';
import { itemTypes } from '../data/gear-types';
import { crewName } from '../data/site';
import type { GearItem } from './gear';

export type Review = CollectionEntry<'reviews'>;

export const reviewHref = (r: Review) => `/gear/reviews/${r.id}/`;

/** Published reviews, newest first; undated last. */
export async function getReviews() {
  const all = await getCollection('reviews', (r: Review) => !r.data.draft);
  return all.sort((a: Review, b: Review) => (b.data.date?.getTime() ?? 0) - (a.data.date?.getTime() ?? 0));
}

/** The review of a specific loadout item, if one exists. */
export async function reviewFor(person: string, itemId: string) {
  return (await getReviews()).find((r: Review) => r.data.item?.person === person && r.data.item?.id === itemId);
}

export const verdictLabel = {
  'still-carrying': 'Still carrying',
  'would-buy-again': 'Would buy again',
  retired: 'Retired',
} as const;

/** The disclosure line. Always shown, and always names the brand when it was not bought. */
export function disclosure(r: Review) {
  const { acquired, partner } = r.data;
  if (acquired === 'bought') return { short: 'Bought', long: 'Bought with our own money.' };
  if (acquired === 'gifted') return { short: 'Gifted', long: `Gifted by ${partner}.` };
  return { short: 'Paid partnership', long: `Paid partnership with ${partner}.` };
}

export const reviewCategory = (r: Review) => itemTypes[r.data.type].category;

/** Enough of a GearItem to draw the stand-in art when there is no cover photo. */
export const reviewArtItem = (r: Review): GearItem => ({
  id: r.id,
  name: r.data.itemName,
  brand: r.data.brand,
  category: itemTypes[r.data.type].category,
  type: r.data.type,
});

export function reviewMeta(r: Review) {
  return [crewName(r.data.author), r.data.date?.toLocaleDateString('en-AU', { month: 'long', year: 'numeric' })]
    .filter(Boolean)
    .join(' · ');
}

export function testedLine(r: Review) {
  const t = r.data.tested;
  if (!t) return undefined;
  const parts = [
    t.trips && `${t.trips} trip${t.trips === 1 ? '' : 's'}`,
    t.nights && `${t.nights} night${t.nights === 1 ? '' : 's'}`,
    t.km && `${t.km.toLocaleString('en-AU')} km`,
    t.since && `since ${t.since.toLocaleDateString('en-AU', { month: 'long', year: 'numeric' })}`,
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : undefined;
}
