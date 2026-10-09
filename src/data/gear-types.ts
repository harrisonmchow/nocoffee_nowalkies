// The item types a loadout can hold. Everything about how a type is shown
// (its label, where it lies on the flat-lay, how big it is) lives here, so adding a type is a one-line change.

export const categories = ['clothing', 'gear'] as const;
export type Category = (typeof categories)[number];

export const categoryLabel: Record<Category, string> = {
  clothing: 'Clothing',
  gear: 'Gear',
};

/** Flat-lay zones. Clothing runs head to toe; gear is grouped by system. */
export type Zone =
  | 'head' | 'layers' | 'legs' | 'feet'
  | 'sleep' | 'pack' | 'shelter' | 'kit';

export type Size = 'sm' | 'md' | 'lg';

type TypeSpec = {
  category: Category;
  label: string;
  zone: Zone;
  size: Size;
};

export const itemTypes = {
  // Clothing, head to toe
  hat: { category: 'clothing', label: 'Hat', zone: 'head', size: 'sm' },
  gloves: { category: 'clothing', label: 'Gloves', zone: 'head', size: 'sm' },
  'rain-jacket': { category: 'clothing', label: 'Rain jacket', zone: 'layers', size: 'lg' },
  'down-jacket': { category: 'clothing', label: 'Down jacket', zone: 'layers', size: 'lg' },
  fleece: { category: 'clothing', label: 'Fleece', zone: 'layers', size: 'md' },
  shirt: { category: 'clothing', label: 'Shirt', zone: 'layers', size: 'md' },
  pants: { category: 'clothing', label: 'Pants', zone: 'legs', size: 'lg' },
  socks: { category: 'clothing', label: 'Socks', zone: 'feet', size: 'sm' },
  shoes: { category: 'clothing', label: 'Shoes', zone: 'feet', size: 'md' },

  // Gear, by system
  'sleeping-pad': { category: 'gear', label: 'Sleeping pad', zone: 'sleep', size: 'md' },
  'sleeping-bag': { category: 'gear', label: 'Sleeping bag', zone: 'sleep', size: 'md' },
  quilt: { category: 'gear', label: 'Quilt', zone: 'sleep', size: 'md' },
  bag: { category: 'gear', label: 'Pack', zone: 'pack', size: 'lg' },
  tent: { category: 'gear', label: 'Tent', zone: 'shelter', size: 'lg' },
  cooking: { category: 'gear', label: 'Cooking', zone: 'kit', size: 'sm' },
  water: { category: 'gear', label: 'Water', zone: 'kit', size: 'sm' },
  electronics: { category: 'gear', label: 'Electronics', zone: 'kit', size: 'sm' },
  'first-aid': { category: 'gear', label: 'First aid', zone: 'kit', size: 'sm' },
  accessories: { category: 'gear', label: 'Accessories', zone: 'kit', size: 'sm' },
} as const satisfies Record<string, TypeSpec>;

export type ItemType = keyof typeof itemTypes;
export const itemTypeKeys = Object.keys(itemTypes) as [ItemType, ...ItemType[]];

/** Zone order on the floor, per category. */
export const zonesFor: Record<Category, Zone[]> = {
  clothing: ['head', 'layers', 'legs', 'feet'],
  gear: ['sleep', 'pack', 'shelter', 'kit'],
};

export const zoneLabel: Record<Zone, string> = {
  head: 'Head and hands',
  layers: 'Layers',
  legs: 'Legs',
  feet: 'Feet',
  sleep: 'Sleep',
  pack: 'Pack',
  shelter: 'Shelter',
  kit: 'Kitchen and kit',
};
