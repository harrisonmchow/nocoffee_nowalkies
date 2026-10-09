// The five places the group has walked. Coordinates mark the spot the
// lead photo was taken near, rounded to two decimals.
// `blurb` is public, general description of the place, not a trip report.
// Trip notes live in `notes` once the group writes them.

export type Region = {
  slug: string;
  name: string;
  /** The one big word on the trackhead. */
  word: string;
  where: string;
  tag: 'NSW' | 'TAS' | 'KGZ';
  lat: number;
  lon: number;
  blurb: string;
  notes?: string;
};

export const regions: Region[] = [
  {
    slug: 'blue-mountains',
    name: 'Blue Mountains',
    word: 'Blue Mountains',
    where: 'New South Wales',
    tag: 'NSW',
    lat: -33.63,
    lon: 150.31,
    blurb:
      'Sandstone cliffs and eucalypt valleys about two hours west of Sydney. The Grose Valley drops away below Govetts Leap.',
  },
  {
    slug: 'warrumbungles',
    name: 'Warrumbungles',
    word: 'Warrumbungles',
    where: 'New South Wales',
    tag: 'NSW',
    lat: -31.27,
    lon: 149.03,
    blurb:
      'Volcanic spires in the central west. The Breadknife and the Grand High Tops sit in Australia’s first Dark Sky Park.',
  },
  {
    slug: 'kosciuszko',
    name: 'Kosciuszko',
    word: 'Kosciuszko',
    where: 'New South Wales',
    tag: 'NSW',
    lat: -36.46,
    lon: 148.26,
    blurb:
      'The Main Range and the highest ground on the Australian mainland, 2,228 metres at the summit.',
  },
  {
    slug: 'tasmania',
    name: 'Tasmania',
    word: 'Tasmania',
    where: 'Tasmania',
    tag: 'TAS',
    lat: -41.68,
    lon: 145.95,
    blurb:
      'Dolerite peaks, buttongrass plains and Dove Lake under Cradle Mountain.',
  },
  {
    slug: 'ala-archa',
    name: 'Ala Archa',
    word: 'Ala Archa',
    where: 'Kyrgyzstan',
    tag: 'KGZ',
    lat: 42.56,
    lon: 74.49,
    blurb:
      'An alpine gorge in the Kyrgyz Ala-Too range of the Tian Shan, about 40 km south of Bishkek.',
  },
];

export function formatCoord(lat: number, lon: number) {
  const ns = lat < 0 ? 'S' : 'N';
  const ew = lon < 0 ? 'W' : 'E';
  return `${Math.abs(lat).toFixed(2)}°${ns} ${Math.abs(lon).toFixed(2)}°${ew}`;
}
