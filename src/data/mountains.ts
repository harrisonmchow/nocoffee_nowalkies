// The mountains the camp can sit on, and everything tuned per mountain:
// scale, where the camp shelf is, the mist, and how the camera frames it.
//
// Each .glb is processed from its Sketchfab original (transforms baked,
// merged, simplified, compressed) with a flat shelf levelled into it for
// the camp. `shelf` and `baseY` are in the file's own units and must
// match the processed file.
import type { ModelCredit } from './camp';

/** Drifting cloud sprites. x/z are relative to `mist.centre`, in metres. */
export type MistBand = {
  count: number;
  y: [number, number];
  x: [number, number];
  z: [number, number];
  size: [number, number];
  opacity: [number, number];
};

export type MountainConfig = {
  id: string;
  name: string;
  model: string;
  /** File units to metres. */
  scale: number;
  shelf: { x: number; y: number; z: number };
  baseY: number;
  /** Multiply the rock's colour, e.g. to warm it. */
  tint?: string;
  /** Force matte rock (for files with no roughness map, which render glossy). */
  matte?: boolean;
  mist: {
    /** Fully fogged at or below this height (m). */
    bottom: number;
    /** Clear at or above this height (m). */
    top: number;
    /** Dense floor of mist, gone by this height (m). 0 for none. */
    floor: number;
    density: number;
    /** Where cloud bands and the radial fade are centred. */
    centre: 'shelf' | 'origin';
    /** Fade the ground out with distance from the centre: [start, end] m. */
    radial?: [number, number];
    /** For open terrain tiles: fade toward the side and front edges, m from the origin. */
    tile?: { x: [number, number]; front: [number, number] };
    /** Plain distance fog [near, far], m. */
    distance: [number, number];
    bands: MistBand[];
  };
  camera: {
    /** Height (m) the overview looks at, above the centre. */
    targetY: number;
    /** Overview look-at offset on x/z from the shelf, m. */
    targetOffset?: [number, number];
    az: number;
    polar: number;
    dist: number;
    /** Multiply `dist` on portrait screens. */
    portrait: number;
    min: number;
    max: number;
    azRange: [number, number];
    polarRange: [number, number];
    /** Zooming in past this on the overview dives to camp. */
    diveAt: number;
    /** Orbit range at camp (a tile's back edge drops into nothing). */
    campAz?: [number, number];
  };
  credit: ModelCredit;
};

const ALL_ROUND: [number, number] = [-Infinity, Infinity];

// The tall, open-mountain mist both full mountains share: a dense floor,
// a long soft gradient, and the tile edges dissolved in a ring.
const fullMountainMist = (radial: [number, number]): MountainConfig['mist'] => ({
  bottom: 0,
  top: 235,
  floor: 130,
  density: 0.0028,
  centre: 'shelf',
  radial,
  distance: [2600, 6500],
  bands: [
    { count: 110, y: [0, 110], x: [-1000, 1000], z: [-1000, 1000], size: [280, 560], opacity: [0.65, 0.95] },
    { count: 30, y: [120, 240], x: [-800, 800], z: [-800, 800], size: [160, 320], opacity: [0.18, 0.38] },
  ],
});

const fullMountainCamera: MountainConfig['camera'] = {
  targetY: 175,
  az: 0.5,
  polar: 1.3,
  dist: 1450,
  portrait: 1.15,
  min: 780,
  max: 2100,
  azRange: ALL_ROUND,
  polarRange: [0.75, 1.5],
  diveAt: 795,
};

export const mountains: MountainConfig[] = [
  {
    id: 'only-a-mountain',
    name: 'Crown',
    model: '/models/mountains/only-a-mountain.glb',
    // 27 units across: about 1.3 km wide and 385 m tall.
    scale: 50,
    shelf: { x: -1.94, y: 7.60838, z: 1.65 },
    baseY: 0,
    matte: true,
    // Nearest tile edge is ~575 m from the peak.
    mist: fullMountainMist([470, 580]),
    camera: fullMountainCamera,
    credit: {
      title: 'Only A Mountain',
      author: 'hirnlaich',
      license: 'CC BY 4.0',
      source: 'https://sketchfab.com/3d-models/only-a-mountain-777d23df1c5c483c9bf35fb0116f740a',
    },
  },
  {
    id: 'single-mountain',
    name: 'Cone',
    model: '/models/mountains/single-mountain.glb',
    // 12.7 units across: scaled to match the Crown, 1.3 km and 385 m.
    scale: 105,
    shelf: { x: -0.289, y: 3.64523, z: 1.077 },
    baseY: 0,
    matte: true,
    // Nearest tile edge is ~555 m from the peak.
    mist: fullMountainMist([450, 545]),
    camera: fullMountainCamera,
    credit: {
      title: 'Single-mountain',
      author: 'hirnlaich',
      license: 'CC BY 4.0',
      source: 'https://sketchfab.com/3d-models/single-mountain-12bffed6861143d985583cf563cad6f0',
    },
  },
  {
    id: 'mountain-peak',
    name: 'Ridge',
    model: '/models/mountains/mountain-peak.glb',
    // An open terrain tile, 3.15 units across: 630 m wide, 320 m tall.
    // Only its front looks right, so the camera stays in a front arc.
    scale: 200,
    shelf: { x: -0.3, y: 1.53482, z: -1.414 },
    baseY: 0.04745,
    tint: '#efe9df',
    mist: {
      bottom: 20,
      top: 150,
      floor: 0,
      density: 0.0035,
      centre: 'origin',
      tile: { x: [173, 305], front: [110, 299] },
      distance: [1500, 4200],
      bands: [
        { count: 34, y: [10, 95], x: [-650, 650], z: [-250, 420], size: [220, 420], opacity: [0.55, 0.85] },
        { count: 12, y: [150, 240], x: [-500, 500], z: [-150, 300], size: [120, 260], opacity: [0.25, 0.45] },
        { count: 6, y: [252, 277], x: [-300, 200], z: [-330, -150], size: [70, 140], opacity: [0.3, 0.5] },
      ],
    },
    camera: {
      targetY: 130,
      targetOffset: [40, 223],
      az: 0.18,
      polar: 1.25,
      dist: 1180,
      portrait: 0.8,
      min: 640,
      max: 1600,
      azRange: [-0.9, 1.1],
      polarRange: [0.8, 1.5],
      diveAt: 655,
      campAz: [-1.4, 1.9],
    },
    credit: {
      title: 'Mountain peak',
      author: 'Bapichu',
      license: 'CC BY 4.0',
      source: 'https://sketchfab.com/3d-models/mountain-peak-fbd8fd40b51d40f5a7c0a7dc7526a192',
    },
  },
];
