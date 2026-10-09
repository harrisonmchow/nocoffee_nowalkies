import type { ImageMetadata } from 'astro';
import { getCollection } from 'astro:content';
import credits from './stand-in-credits.json';
import { crewName } from './site';

// STAND-IN PHOTOGRAPHY. Every photo below is an openly licensed Wikimedia
// Commons image of the right place, used until the group's own photos arrive.
// To swap in real photos: drop files into src/assets/photos/, then replace
// entries here with { image, region, caption, by } and set standIn: false.

const files = import.meta.glob<{ default: ImageMetadata }>(
  '../assets/stand-in/*.jpg',
  { eager: true },
);

export type Photo = {
  image: ImageMetadata;
  region: string;
  caption: string;
  credit: string;
  license?: string;
  /** Where the photo came from: a licence page, or the walk it belongs to. */
  source?: string;
  standIn: boolean;
};

export const photos: Photo[] = credits.map((c) => {
  const name = c.file.split('/').pop()!;
  const mod = files[`../assets/stand-in/${name}`];
  if (!mod) throw new Error(`Missing stand-in photo ${name}`);
  return {
    image: mod.default,
    region: c.region,
    caption: c.title.replace(/\s*\(\d+\)$/, ''),
    credit: c.artist,
    license: c.license,
    source: c.source,
    standIn: true,
  };
});

export const photosFor = (region: string) =>
  photos.filter((p) => p.region === region);

export const leadPhoto = (region: string) => photosFor(region)[0];

/**
 * A region's stand-ins plus every photo from its walks (covers and galleries),
 * without repeating an image that is already in the list.
 */
export async function regionPhotos(region: string): Promise<Photo[]> {
  const list = [...photosFor(region)];
  const key = (img: ImageMetadata) => img.src.split('?')[0];
  const seen = new Set(list.map((p) => key(p.image)));
  const walks = await getCollection('walks', (w) => !w.data.draft && w.data.region === region);
  for (const w of walks) {
    const href = `/places/${region}/${w.id.split('/').pop()}/`;
    const by = w.data.author ? crewName(w.data.author) : 'No Coffee No Walkies';
    const shots = [
      { image: w.data.cover, caption: w.data.coverAlt, by: undefined as string | undefined },
      ...w.data.gallery,
    ];
    for (const g of shots) {
      if (seen.has(key(g.image))) continue;
      seen.add(key(g.image));
      list.push({ image: g.image, region, caption: g.caption, credit: g.by ?? by, source: href, standIn: false });
    }
  }
  return list;
}
