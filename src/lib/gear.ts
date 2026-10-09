import { getCollection, getEntry, render } from 'astro:content';
import {
  itemTypes,
  itemTypeKeys,
  zonesFor,
  categories,
  type Category,
  type ItemType,
  type Zone,
} from '../data/gear-types';
import { crew, type CrewId } from '../data/site';

export type GearItem = {
  id: string;
  name: string;
  brand?: string;
  category: Category;
  type: ItemType;
  weightG?: number;
  worn?: boolean;
  image?: ImageMetadata;
  notes?: string;
  link?: string;
};

/** Clothing is worn unless marked otherwise; gear is packed unless marked otherwise. */
export const isWorn = (i: GearItem) => i.worn ?? i.category === 'clothing';

const typeOrder = (t: ItemType) => itemTypeKeys.indexOf(t);
export const sortItems = (items: GearItem[]) =>
  [...items].sort((a, b) => typeOrder(a.type) - typeOrder(b.type));

export function totals(items: GearItem[]) {
  const sum = (xs: GearItem[]) => xs.reduce((a, i) => a + (i.weightG ?? 0), 0);
  const weighed = items.filter((i) => i.weightG !== undefined);
  const worn = items.filter(isWorn);
  const packed = items.filter((i) => !isWorn(i));
  const byCategory = Object.fromEntries(
    categories.map((c) => {
      const xs = items.filter((i) => i.category === c);
      return [c, { count: xs.length, weightG: sum(xs) }];
    }),
  ) as Record<Category, { count: number; weightG: number }>;
  return {
    count: items.length,
    weighedCount: weighed.length,
    hasWeights: weighed.length > 0,
    totalG: sum(items),
    /** Base weight: everything carried in the pack. */
    baseG: sum(packed),
    wornG: sum(worn),
    byCategory,
  };
}

export function formatWeight(g?: number) {
  if (g === undefined || g === 0) return '—';
  return g >= 1000 ? `${(g / 1000).toFixed(2)} kg` : `${Math.round(g)} g`;
}

export const formatOz = (g?: number) => (g ? `${(g / 28.3495).toFixed(1)} oz` : '—');

export function byZone(items: GearItem[], category: Category) {
  return zonesFor[category]
    .map((zone) => ({
      zone,
      items: items.filter((i) => i.category === category && itemTypes[i.type].zone === zone),
    }))
    .filter((z): z is { zone: Zone; items: GearItem[] } => z.items.length > 0);
}

export const personTone: Record<CrewId, 'green' | 'blue' | 'yellow' | 'red'> = {
  harry: 'green',
  kevin: 'blue',
  caleb: 'yellow',
  mikey: 'red',
};

/** Everything a gear page needs for one person. */
export async function getLoadout(person: CrewId) {
  const loadout = await getEntry('loadouts', person);
  const gear = await getEntry('gear', person);
  if (!loadout) throw new Error(`Missing src/content/loadouts/${person}.md`);
  const items = sortItems((gear?.data.items ?? []) as GearItem[]);
  const who = crew.find((c) => c.id === person)!;
  return {
    id: person,
    name: who.name,
    loadout,
    items,
    sample: Boolean(loadout.data.sample || gear?.data.sample),
    totals: totals(items),
    render: () => render(loadout),
  };
}

export async function getLoadouts() {
  const entries = await getCollection('loadouts');
  const order = crew.map((c) => c.id);
  const ids = entries.map((e) => e.data.person as CrewId).sort((a, b) => order.indexOf(a) - order.indexOf(b));
  return Promise.all(ids.map(getLoadout));
}

export const gearHref = (person: string, category?: Category, item?: string) =>
  `/gear/${person}/${category ? `${category}/` : ''}${item ? `${item}/` : ''}`;
