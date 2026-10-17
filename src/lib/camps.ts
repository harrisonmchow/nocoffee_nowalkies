import { getEntry } from 'astro:content';
import type { CrewId } from '../data/site';
import type { CampInfo, CampItem, WorldRoute } from '../world/route';
import { gearHref, getLoadout, isWorn } from './gear';

async function campInfo(person: CrewId): Promise<CampInfo | undefined> {
  const camp = await getEntry('camps', person);
  return camp && { biome: camp.data.biome, title: camp.data.title, ready: camp.data.ready, dog: camp.data.dog };
}

/** The world route for a person's page: their camp's landscape, if they have a camp file. */
export async function campRoute(person: CrewId): Promise<WorldRoute> {
  return { level: 'biome', person, camp: await campInfo(person) };
}

/** The world route for a person's campsite, with their kit for its hover cards. */
export async function campsiteRoute(person: CrewId): Promise<WorldRoute> {
  const { items } = await getLoadout(person);
  const gear = await getEntry('gear', person);
  const raw = new Map((gear?.data.items ?? []).map((i) => [i.id, i]));
  const kit: CampItem[] = items.map((i) => ({
    id: i.id,
    name: i.name,
    brand: i.brand,
    type: i.type,
    category: i.category,
    weightG: i.weightG,
    worn: isWorn(i),
    href: gearHref(person, i.category, i.id),
    model: raw.get(i.id)?.scene?.model,
    colour: raw.get(i.id)?.colour,
  }));
  return { level: 'camp', person, camp: await campInfo(person), items: kit };
}
