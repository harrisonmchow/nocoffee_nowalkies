import type { ImageMetadata } from 'astro';
import credits from './stand-in-credits.json';

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
  license: string;
  source: string;
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
