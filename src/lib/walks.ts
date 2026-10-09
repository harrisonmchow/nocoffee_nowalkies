import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { getCollection, type CollectionEntry } from 'astro:content';
import { parseGpx, type Track } from './gpx';

export type Walk = CollectionEntry<'walks'>;

export const walkSlug = (w: Walk) => w.id.split('/').pop()!;
export const walkHref = (w: Walk) => `/places/${w.data.region}/${walkSlug(w)}/`;

/** Published walks, newest first; undated walks last. */
export async function getWalks(region?: string) {
  const all = await getCollection('walks', (w: Walk) => !w.data.draft && (!region || w.data.region === region));
  return all.sort((a: Walk, b: Walk) => (b.data.date?.getTime() ?? 0) - (a.data.date?.getTime() ?? 0));
}

export function loadTrack(w: Walk): Track | undefined {
  if (!w.data.gpx || !w.filePath) return undefined;
  return parseGpx(readFileSync(join(dirname(w.filePath), w.data.gpx), 'utf8'));
}

/** Stats shown on signs and the walk header. Front-matter values win over GPX. */
export function walkStats(w: Walk, track = loadTrack(w)) {
  return {
    distanceKm: w.data.distanceKm ?? track?.distanceKm,
    gainM: w.data.elevationGainM ?? track?.gainM,
    nights: w.data.nights,
    grade: w.data.grade,
    date: w.data.date,
  };
}

export const formatKm = (km?: number) => (km === undefined ? undefined : `${km < 10 ? km.toFixed(1) : Math.round(km)} km`);
export const formatM = (m?: number) => (m === undefined ? undefined : `${Math.round(m).toLocaleString('en-AU')} m`);
export const formatNights = (n?: number) =>
  n === undefined ? undefined : n === 0 ? 'Day walk' : `${n} night${n === 1 ? '' : 's'}`;
export const formatDate = (d?: Date) =>
  d?.toLocaleDateString('en-AU', { month: 'long', year: 'numeric' });

export function walkMeta(w: Walk) {
  const s = walkStats(w);
  return [w.data.sample ? 'Sample' : undefined, formatNights(s.nights), formatKm(s.distanceKm), formatDate(s.date)]
    .filter(Boolean)
    .join(' · ');
}
