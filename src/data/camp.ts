// The camp on the /camp mountain. Proof of concept: generic gear and
// downloaded models. Later each of us gets our own list with our own kit.
//
// `model` is a .glb in /public/models. If the file is missing the scene
// draws a simple stand-in so the page still works.
// `inside: true` items only appear once you open the tent.
import { mountains } from './mountains';

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
    note: 'Our real folding chair, scanned on 16 October 2026.',
    kind: 'sit',
    model: '/models/chair.glb',
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
    name: 'Harry',
    note: 'Harry, scanned with a coffee in hand. Kevin, Caleb and Mikey next.',
    kind: 'person',
    model: '/models/harry.glb',
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

export const modelCredits = [
  ...mountains.map((m) => m.credit),
  ...camp.flatMap((g) => (g.credit ? [g.credit] : [])),
];
