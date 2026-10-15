// The camp on the /camp island. Proof of concept: generic gear and
// downloaded models. Later each of us gets our own list with our own kit.
//
// `model` is a .glb in /public/models. If the file is missing the scene
// draws a simple stand-in so the page still works.
// `inside: true` items only appear once you open the tent.

export type ModelCredit = {
  title: string;
  author: string;
  license: 'CC BY 4.0' | 'Sketchfab Free Standard';
  source: string;
};

export type GearItem = {
  id: string;
  name: string;
  /** One plain line for the info card. */
  note: string;
  kind: 'shelter' | 'sit' | 'fire' | 'person' | 'clothes' | 'sleep';
  model?: string;
  credit?: ModelCredit;
  inside?: boolean;
};

export const camp: GearItem[] = [
  {
    id: 'tent',
    name: 'Tent',
    note: 'Generic two-person tent. Fly, inner and a vestibule for wet boots.',
    kind: 'shelter',
    model: '/models/tent.glb',
    credit: {
      title: 'Modern Camping Tent',
      author: 'Guy in a Poncho',
      license: 'CC BY 4.0',
      source: 'https://sketchfab.com/3d-models/modern-camping-tent-3f624d58d582430595179bdf9a156be3',
    },
  },
  {
    id: 'chair',
    name: 'Chair',
    note: 'An armchair, for now. Our real folding chairs are lighter and less comfortable.',
    kind: 'sit',
    model: '/models/chair.glb',
    credit: {
      title: 'Vintage Wooden Armchair - Low Poly / Game Ready',
      author: 'RenendStudio',
      license: 'CC BY 4.0',
      source: 'https://sketchfab.com/3d-models/vintage-wooden-armchair-low-poly-game-ready-2b7ae6f828844ee4a64c7417a7b78486',
    },
  },
  {
    id: 'fire',
    name: 'Campfire',
    note: 'Only where fires are allowed. Coffee first, then the walk.',
    kind: 'fire',
    model: '/models/campfire.glb',
    credit: {
      title: 'Low poly wood fire',
      author: 'assetfactory',
      license: 'Sketchfab Free Standard',
      source: 'https://sketchfab.com/3d-models/low-poly-wood-fire-39236d53619e468f9487ffff472c43e9',
    },
  },
  {
    id: 'person',
    name: 'One of us',
    note: 'A stand-in for now. Harry, Kevin, Caleb or Mikey, eventually.',
    kind: 'person',
    model: '/models/person.glb',
    credit: {
      title: 'Fisherman',
      author: 'CharlieCatling',
      license: 'Sketchfab Free Standard',
      source: 'https://sketchfab.com/3d-models/fisherman-79c8c6391e1d4a6c9b0a2a4b165017b2',
    },
  },
  {
    id: 'clothes',
    name: 'Layers',
    note: 'Shell, fleece, base layer and socks, laid out to dry.',
    kind: 'clothes',
  },
  {
    id: 'mat',
    name: 'Sleeping mat',
    note: 'Inflatable mat. The difference between sleeping and lying there.',
    kind: 'sleep',
    inside: true,
  },
  {
    id: 'bag',
    name: 'Sleeping bag',
    note: 'Three-season bag, rated to around zero.',
    kind: 'sleep',
    inside: true,
  },
  {
    id: 'pillow',
    name: 'Pillow',
    note: 'Inflatable pillow, or a stuff sack full of tomorrow’s clothes.',
    kind: 'sleep',
    inside: true,
  },
];

// The mountain the camp sits on. The file is a terrain tile, processed
// from the original: transforms baked, simplified, and a flat shelf
// levelled into it for the camp. `shelf` and `baseY` are in the file's
// own units and must match the processed file.
export const mountain = {
  model: '/models/mountain.glb',
  shelf: { x: -0.3, y: 1.53482, z: -1.414 },
  baseY: 0.04745,
  credit: {
    title: 'Mountain peak',
    author: 'Bapichu',
    license: 'CC BY 4.0',
    source: 'https://sketchfab.com/3d-models/mountain-peak-fbd8fd40b51d40f5a7c0a7dc7526a192',
  } satisfies ModelCredit,
};

export const modelCredits = [mountain.credit, ...camp.flatMap((g) => (g.credit ? [g.credit] : []))];
