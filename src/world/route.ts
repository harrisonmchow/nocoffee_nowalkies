import type { BiomeId } from '../data/biomes';
import type { CrewId } from '../data/site';

/**
 * What the world needs to know about the gear page above it. GearLayout renders
 * it into the page as JSON; the world reads it after every navigation.
 */
export type CampInfo = {
  biome: BiomeId;
  title: string;
  ready: boolean;
  /** A dog at the campsite. */
  dog?: boolean;
};

/** One item of a person's kit, as the camp's hover cards show it. */
export type CampItem = {
  id: string;
  name: string;
  brand?: string;
  type: string;
  category: 'clothing' | 'gear';
  weightG?: number;
  worn: boolean;
  /** The item's own page. */
  href: string;
  /** Its 3D stand-in, from the item's `scene.model` (clothing has none: it's on the figure). */
  model?: string;
  /** Tints its stand-in (or, for clothing, the figure's matching garment). */
  colour?: string;
};

export type WorldRoute =
  | { level: 'hub' }
  /** A person's page: their camp's landscape, seen from afar. */
  | {
      level: 'biome';
      person: CrewId;
      /** Missing if the person has no file in src/content/camps/ yet. */
      camp?: CampInfo;
    }
  /** A person's campsite, close up: the figure, the tent and the gear to explore. */
  | { level: 'camp'; person: CrewId; camp?: CampInfo; items: CampItem[] }
  /** The 2D detail pages: flat-lays, items and reviews. */
  | { level: 'detail'; person?: CrewId };

export const ROUTE_ELEMENT_ID = 'world-route';
export const CAMPS_ELEMENT_ID = 'world-camps';

/** Each person's camp, from src/content/camps/: its biome, and whether it's ready for visitors. */
export type CampMap = Partial<Record<string, { biome: BiomeId; ready: boolean }>>;

export function readCamps(doc: Document = document): CampMap {
  try {
    return JSON.parse(doc.getElementById(CAMPS_ELEMENT_ID)?.textContent || '{}');
  } catch {
    return {};
  }
}

/** JSON for a <script type="application/json">, with "<" escaped so the data can't close the tag. */
export function serialiseRoute(route: WorldRoute): string {
  return JSON.stringify(route).replace(/</g, '\\u003c');
}

export function readRoute(doc: Document = document): WorldRoute {
  const text = doc.getElementById(ROUTE_ELEMENT_ID)?.textContent;
  if (!text) return { level: 'detail' };
  try {
    return JSON.parse(text) as WorldRoute;
  } catch {
    return { level: 'detail' };
  }
}
