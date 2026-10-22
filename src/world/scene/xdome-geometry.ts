// Caleb's tent, the Durston X-Dome 2, drawn in code from photos of ours
// (IMG_4842, IMG_4850 on caleb/mountain-poc) and Durston's: its dimension
// diagram (top, end and side views), the fly closed from the side and the
// end, the door open, and the inner pitched alone. Its materials are made by
// the caller (xdome.ts), so they're the world's own.
//
// The frame is one hubbed pole: at each end two legs climb from the corners
// to a hub, and a short ridge joins the hubs. A brow pole crosses over the
// ridge's middle on a strut, and its ends lift the fly into a peak over each
// door. The fly hangs from the poles outside it and sags between them, over
// a near-square footprint (2.2 x 2.0 m) with a peaked vent under each hub.
//
// Each door is a fan from its peak: zipped straight down to the hem, right of
// centre as you face it, and sewn along a seam to the left corner. Opened,
// it's gathered back along that seam and held by its magnets. The inner is a
// parallelogram (2.24 x 1.3 m) set across the fly on the slant, so each
// vestibule is a triangle beside its door, 0.65 m deep at one end and next
// to nothing at the other. It's a grey bathtub with dark mesh walls rising
// steeply off the rim to a peak 1.1 m up, with a door of its own under the
// fly's, cut the same way.
//
// Y up, metres, base centred on the origin, main door facing +z: 2.2 m long
// (x), 2.0 m wide (z), 1.17 m high.
//
// Inferred (no photo shows it): how the gathered doors fold, the inner door's
// exact outline, the shape of the inner's walls between its rim and the
// poles. Stakes and guy-lines are left out, and the inner's solid panels at
// its lower ends.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Durston's diagram: 87 x 79 in between the pole feet, 46 in to the top of the brow pole.
const L = 1.1; // half length, x
const D = 1.0; // half width, z
const HEM = 0.04; // fly hem height above the ground
// The hubs, where each end's legs meet (the top view's Y, 0.76 m apart; 1.05 m up in the end view).
const HUB_X = 0.38, HUB_Y = 1.03;
const RIDGE_Y = 1.05; // the ridge's middle, under the brow strut
// The brow pole: its top over the ridge, and its ends over the doors, where it lifts the fly's peaks
// (in Durston's end view, only a little above the hubs).
const BROW_Y = 1.165, BROW_Z = 0.6, EAR_Y = 1.075;
const HOOD_W = 0.22, HOOD_Y = 0.86; // end vent hood lower edge: half-width just inside the legs, height
const TOP = 1.2; // height the membrane solve is normalised to
const WALL = 0.55; // < 1 makes the walls rise steeply off the hem
const POLE_R = 0.0045;
const CLEAR = 0.012; // pole centre to fabric
const NORMAL_SCALE = 1.0; // cloth wrinkle relief (tuned on the fly against IMG_4842)

// The inner: a parallelogram across the fly. Its ends run along the fly's ends, its long sides on
// the slant, so its centre line is 0.3 m toward the back door at +x and toward the front at -x.
const LI = L - 0.03, WI = 0.665, SKEW = 0.3;
const innerZ = (x: number) => (-SKEW * x) / LI;
const SLANT = Math.cos(Math.atan(SKEW / LI)); // across the inner, per metre along z
const TUB = 0.13; // the bathtub floor runs this far up its walls
const INNER_GAP = 0.06; // how far the inner hangs under the fly
const INNER_SLOPE = 2.6; // its walls' rise per metre in from the rim (about 69 degrees)

// A leg, p 0 at its foot .. 1 at its hub. Durston's end view shows it nearly straight, and the side
// view rising steeply and rounding over into the hub: so it climbs evenly across the end, while in
// plan it keeps to the corner low down and swings in along the tent near the top.
const LEG_BOW = 1.8;
const legPoint = (p: number, sx: number, sz: number) =>
  new THREE.Vector3(sx * (L - (L - HUB_X) * p ** LEG_BOW), legY(p), sz * D * (1 - p));
const legY = (p: number) => HUB_Y * (1 - (1 - p) ** 1.3);
/** Plan distance from a leg, and how far up it the nearest point is, 0 .. 1. */
function legPlan(x: number, z: number, sx: number, sz: number) {
  let best = { p: 0, d: Infinity };
  const N = 32;
  let a = legPoint(0, sx, sz);
  for (let k = 1; k <= N; k++) {
    const b = legPoint(k / N, sx, sz);
    const ex = b.x - a.x, ez = b.z - a.z;
    const f = THREE.MathUtils.clamp(((x - a.x) * ex + (z - a.z) * ez) / (ex * ex + ez * ez), 0, 1);
    const d = Math.hypot(x - a.x - ex * f, z - a.z - ez * f);
    if (d < best.d) best = { p: (k - 1 + f) / N, d };
    a = b;
  }
  return best;
}
const ridgeY = (x: number) => HUB_Y + (RIDGE_Y - HUB_Y) * Math.max(0, 1 - (x / HUB_X) ** 2);
const browY = (z: number) => BROW_Y - (BROW_Y - EAR_Y) * (z / BROW_Z) ** 2;
/** Where a leg crosses this x (on the long sides) or this z (on the ends): the faces start outside them. */
const legZ = (x: number) => (Math.abs(x) > HUB_X ? D * (1 - ((L - Math.abs(x)) / (L - HUB_X)) ** (1 / LEG_BOW)) : 0);
const legX = (z: number) => L - (L - HUB_X) * (1 - Math.abs(z) / D) ** LEG_BOW;

// Doors -------------------------------------------------------------------
// A door leaf, in face coordinates: xl across the face, to the right as you face it from outside
// (x = side * xl), and y up. It's a fan from its peak, between the seam it's sewn on and the zip
// that closes it, and its base closes it.

type Fan = { peakY: number; hingeX: number; zipX: number; baseY: number };
// The fly's door is two leaves, zipped to each other from the peak under the brow pole's end down
// to the hem 0.45 m right of centre (Durston's top view): the large one sewn to the left corner,
// the small one to the right. Open, the whole side between the two seams is open.
const FLY_DOOR: Fan = { peakY: EAR_Y - 0.02, hingeX: -(L - 0.05), zipX: 0.45, baseY: HEM };
const FLY_PANEL: Fan = { ...FLY_DOOR, hingeX: L - 0.05 };
const FLY_OPENING: Fan = { ...FLY_DOOR, zipX: L - 0.05 };
// The inner's: from under the fly's peak down to its tub, zipped to the right as in Durston's
// photo of the inner alone, and pulled aside to the left with the fly's in the open-door shot.
const INNER_DOOR: Fan = { peakY: 1.0, hingeX: -0.8, zipX: 0.3, baseY: TUB };

/** A point on a door, (xl, y): t 0 at its seam .. 1 at its zip, r 0 at the peak .. 1 at its base. */
const doorFan = (f: Fan, t: number, r: number): [number, number] => [(f.hingeX + (f.zipX - f.hingeX) * t) * r, f.peakY + (f.baseY - f.peakY) * r];
/** A door's seam and zip, each from a to b, and its normal into the door. */
const doorEdges = (f: Fan) => {
  const [cx, cy] = doorFan(f, 0.5, 0.6);
  return [[0, f.peakY, f.hingeX, f.baseY], [f.zipX, f.baseY, 0, f.peakY]].map(([ax, ay, bx, by]) => {
    const len = Math.hypot(bx - ax, by - ay);
    const flip = (cx - ax) * -(by - ay) + (cy - ay) * (bx - ax) < 0 ? -1 : 1;
    return { ax, ay, nx: (-flip * (by - ay)) / len, ny: (flip * (bx - ax)) / len };
  });
};
/** How far (xl, y) is inside a door past its seam and its zip, less these margins. */
const doorDepths = (f: Fan, xl: number, y: number, seam: number, zip: number) =>
  doorEdges(f).map(({ ax, ay, nx, ny }, k) => (xl - ax) * nx + (y - ay) * ny - (k ? zip : seam));
/** Whether (xl, y) is inside a door's fan, kept clear of its seam and zip by these margins. */
const inDoor = (f: Fan, xl: number, y: number, seam: number, zip: number) =>
  y >= f.baseY - 0.01 && Math.min(...doorDepths(f, xl, y, seam, zip)) >= 0;
/**
 * A point inside a door moved out onto its nearer edge (less the margins), or null when it's
 * further in than a cell or two: so a hole cut along a grid gets a straight edge.
 */
function toDoorEdge(f: Fan, xl: number, y: number, seam: number, zip: number): [number, number] | null {
  const depths = doorDepths(f, xl, y, seam, zip);
  const k = depths[0] < depths[1] ? 0 : 1;
  if (depths[k] > 0.08) return null;
  const { nx, ny } = doorEdges(f)[k];
  return [xl - depths[k] * nx, y - depths[k] * ny];
}

const COLORS = {
  fly: '#97a698',
  pole: '#c3c7c9',
  hub: '#d4d6d4',
  clip: '#1d1f20',
  webbing: '#b3c2a8',
  inner: '#5d6266', // the inner's tub: mid grey in Durston's photos
  mesh: '#3c4346', // the inner's walls: dark no-see-um
  zip: '#5f6c62', // a darker line down from the peak in Durston's side view
};

function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Smooth value noise on a lattice, deterministic. Wraps every px by py cells. */
function valueNoise(seed: number, px = 64, py = 64) {
  const r = rng(seed);
  const n = 64;
  const table = Array.from({ length: n * n }, () => r() * 2 - 1);
  const at = (i: number, j: number) => table[(((i % px) + px) % px) * n + (((j % py) + py) % py)];
  return (x: number, y: number) => {
    const i = Math.floor(x), j = Math.floor(y);
    const fx = x - i, fy = y - j;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const a = at(i, j) + (at(i + 1, j) - at(i, j)) * sx;
    const b = at(i, j + 1) + (at(i + 1, j + 1) - at(i, j + 1)) * sx;
    return a + (b - a) * sy;
  };
}

// Fly membrane ----------------------------------------------------------
// The fly is a heightfield over the footprint, solved as a pinned membrane:
// held at the hem, pulled up under the legs, the ridge and the brow pole,
// with a small load so the fabric sags between them.

const NX = 64, NZ = 60;
const dx = (2 * L) / NX, dz = (2 * D) / NZ;
const gridX = (i: number) => -L + i * dx;
const gridZ = (j: number) => -D + j * dz;

// The solve runs on u, with height = HEM + (TOP - HEM) * u^WALL, so the
// cloth leaves the hem steeply instead of drooping onto it.
const toU = (y: number) => Math.pow(Math.max(0, (y - HEM) / (TOP - HEM)), 1 / WALL);

function solveMembrane() {
  const h = new Float32Array((NX + 1) * (NZ + 1));
  const pin = new Float32Array(h.length); // 0 free .. 1 fixed
  const target = new Float32Array(h.length);
  const idx = (i: number, j: number) => j * (NX + 1) + i;
  const reach = (d: number) => Math.exp(-((d / (0.75 * dx)) ** 2));

  for (let j = 0; j <= NZ; j++) {
    for (let i = 0; i <= NX; i++) {
      const x = gridX(i), z = gridZ(j);
      const k = idx(i, j);
      h[k] = 0.3;
      if (i === 0 || j === 0 || i === NX || j === NZ) {
        pin[k] = 1;
        target[k] = 0;
        continue;
      }
      let w = 0, t = 0;
      // Under the legs.
      for (const [sx, sz] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
        const { p, d } = legPlan(x, z, sx, sz);
        const wi = reach(d);
        if (wi > w) { w = wi; t = Math.max(HEM, legY(p) - CLEAR); }
      }
      // Under the ridge between the hubs.
      if (Math.abs(x) <= HUB_X) {
        const wi = reach(Math.abs(z));
        if (wi > w) { w = wi; t = ridgeY(x) - CLEAR; }
      }
      // Under the brow pole, which rides over the ridge, so it wins where they cross (pinned a node
      // past its ends, so they seat on the fly's peaks).
      if (Math.abs(z) <= BROW_Z + dz) {
        const wi = reach(Math.abs(x));
        const ty = browY(Math.min(Math.abs(z), BROW_Z)) - CLEAR;
        if (wi > w || (wi > 0.3 && ty > t)) { w = Math.max(w, wi); t = ty; }
      }
      pin[k] = w > 0.05 ? w : 0;
      target[k] = toU(t);
    }
  }

  // Gauss-Seidel with over-relaxation. The load term sags the free cloth.
  const load = 0.35;
  const ax = 1 / (dx * dx), az = 1 / (dz * dz), diag = 2 * ax + 2 * az;
  for (let it = 0; it < 700; it++) {
    for (let j = 1; j < NZ; j++) {
      for (let i = 1; i < NX; i++) {
        const k = idx(i, j);
        const lap = (ax * (h[k - 1] + h[k + 1]) + az * (h[k - NX - 1] + h[k + NX + 1]) - load) / diag;
        const free = h[k] + 1.6 * (lap - h[k]);
        h[k] = free + (target[k] - free) * pin[k];
      }
    }
    for (let k = 0; k < h.length; k++) if (pin[k] === 1) h[k] = target[k];
  }
  for (let k = 0; k < h.length; k++) h[k] = HEM + (TOP - HEM) * Math.pow(Math.max(0, h[k]), WALL);
  return h;
}

/** A cloth surface the doors and trim are laid on: the fly, or the inner under it. */
type Surface = {
  height: (x: number, z: number) => number;
  /**
   * The point on a face where the surface drops to height y: walking out along z at this x
   * (the long sides, axis 'z') or along x at this z (the ends, axis 'x').
   */
  onFace: (u: number, y: number, side: 1 | -1, lift?: number, axis?: 'z' | 'x') => THREE.Vector3;
  normalAt: (x: number, z: number) => THREE.Vector3;
};

/** Upward normal of a heightfield, by central differences. */
const heightNormal = (height: (x: number, z: number) => number) => (x: number, z: number) => {
  const e = 0.01;
  const gx = (height(x + e, z) - height(x - e, z)) / (2 * e);
  const gz = (height(x, z + e) - height(x, z - e)) / (2 * e);
  return new THREE.Vector3(-gx, 1, -gz).normalize();
};

/** Bisects w in lo..hi for where height falls through y, walking outward. */
function walkOut(lo: number, hi: number, y: number, heightAt: (w: number) => number) {
  for (let n = 0; n < 30; n++) {
    const mid = (lo + hi) / 2;
    if (heightAt(mid) > y) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * A door cut out of a surface's grid. Triangles wholly inside a door's fan (kept clear of its seam
 * and zip) go, so the hole stays smaller than the door panel and never shows while it's shut; the
 * kept triangles' corners inside it slide out onto its seam or zip, so the hole's edge runs
 * straight instead of stepping along the grid. sideOf says which door a vertex could be in (0: none).
 */
function cutDoors(pos: number[], tris: number[], s: Surface, fan: Fan, seam: number, zip: number, sideOf: (x: number, y: number, z: number) => 0 | 1 | -1) {
  const sides = Array.from({ length: pos.length / 3 }, (_, k) => {
    const x = pos[3 * k], y = pos[3 * k + 1], z = pos[3 * k + 2];
    const side = sideOf(x, y, z);
    return side && inDoor(fan, side * x, y, seam, zip) ? side : 0;
  });
  const index: number[] = [];
  for (let k = 0; k < tris.length; k += 3) {
    if (sides[tris[k]] && sides[tris[k + 1]] && sides[tris[k + 2]]) continue;
    index.push(tris[k], tris[k + 1], tris[k + 2]);
  }
  for (const k of new Set(index.filter((k) => sides[k]))) {
    const side = sides[k] as 1 | -1;
    const edge = toDoorEdge(fan, side * pos[3 * k], pos[3 * k + 1], seam, zip);
    if (!edge) continue;
    const p = s.onFace(side * edge[0], edge[1], side);
    pos[3 * k] = p.x; pos[3 * k + 1] = p.y; pos[3 * k + 2] = p.z;
  }
  return index;
}

function makeMembrane(): { geometry: THREE.BufferGeometry; m: Surface } {
  const h = solveMembrane();
  const wrinkle = valueNoise(11);
  const idx = (i: number, j: number) => j * (NX + 1) + i;

  // Soft folds, mostly running across the faces, fading out at the pins. Kept to
  // wavelengths of three grid cells or more; the fine wrinkles live in the normal map.
  for (let j = 1; j < NZ; j++) {
    for (let i = 1; i < NX; i++) {
      const x = gridX(i), z = gridZ(j);
      const y = h[idx(i, j)];
      const fade = Math.min(1, (y - HEM) / 0.15) * (1 - y / 1.25);
      h[idx(i, j)] += 0.004 * fade * wrinkle(x * 5, y * 8 + z * 2);
    }
  }

  const height = (x: number, z: number) => {
    const fi = THREE.MathUtils.clamp((x + L) / dx, 0, NX - 1e-6);
    const fj = THREE.MathUtils.clamp((z + D) / dz, 0, NZ - 1e-6);
    const i = Math.floor(fi), j = Math.floor(fj), u = fi - i, v = fj - j;
    const a = h[idx(i, j)] + (h[idx(i + 1, j)] - h[idx(i, j)]) * u;
    const b = h[idx(i, j + 1)] + (h[idx(i + 1, j + 1)] - h[idx(i, j + 1)]) * u;
    return a + (b - a) * v;
  };
  const normalAt = heightNormal(height);
  const onFace = (u: number, y: number, side: 1 | -1, lift = 0, axis: 'z' | 'x' = 'z') => {
    // Walk out from the legs (where the face starts falling) until the fly drops to y.
    const xz = (w: number) => (axis === 'z' ? [u, side * w] : [side * w, u]);
    const w = axis === 'z' ? walkOut(legZ(u), D, y, (w) => height(u, side * w)) : walkOut(legX(u), L, y, (w) => height(side * w, u));
    const [x, z] = xz(w);
    const p = new THREE.Vector3(x, height(x, z), z);
    return lift ? p.addScaledVector(normalAt(x, z), lift) : p;
  };
  const m: Surface = { height, onFace, normalAt };

  // Geometry, with UVs from accumulated arc length so the cloth texture
  // keeps its scale down the steep walls.
  const pos: number[] = [], uv: number[] = [], tris: number[] = [];
  const P = (i: number, j: number) => new THREE.Vector3(gridX(i), h[idx(i, j)], gridZ(j));
  const us = new Float32Array(h.length), vs = new Float32Array(h.length);
  const ci = NX / 2, cj = NZ / 2;
  for (let j = 0; j <= NZ; j++) {
    for (let i = ci + 1; i <= NX; i++) us[idx(i, j)] = us[idx(i - 1, j)] + P(i, j).distanceTo(P(i - 1, j));
    for (let i = ci - 1; i >= 0; i--) us[idx(i, j)] = us[idx(i + 1, j)] - P(i, j).distanceTo(P(i + 1, j));
  }
  for (let i = 0; i <= NX; i++) {
    for (let j = cj + 1; j <= NZ; j++) vs[idx(i, j)] = vs[idx(i, j - 1)] + P(i, j).distanceTo(P(i, j - 1));
    for (let j = cj - 1; j >= 0; j--) vs[idx(i, j)] = vs[idx(i, j + 1)] - P(i, j).distanceTo(P(i, j + 1));
  }
  for (let j = 0; j <= NZ; j++) {
    for (let i = 0; i <= NX; i++) {
      const p = P(i, j);
      pos.push(p.x, p.y, p.z);
      uv.push(us[idx(i, j)] / 0.6, vs[idx(i, j)] / 0.6);
    }
  }
  for (let j = 0; j < NZ; j++) {
    for (let i = 0; i < NX; i++) {
      const a = idx(i, j), b = idx(i + 1, j), c = idx(i, j + 1), d = idx(i + 1, j + 1);
      // Split along the diagonal that follows the nearer leg, so the creases stay clean.
      const x = gridX(i + 0.5), z = gridZ(j + 0.5);
      tris.push(...(x * z > 0 ? [a, c, d, a, d, b] : [a, c, b, b, c, d]));
    }
  }
  // The fly is cut behind both doors. Only the long faces count: near the peak, the roof is close by.
  const index = cutDoors(pos, tris, m, FLY_OPENING, 0.02, 0.02, (x, y, z) =>
    Math.abs(z) > 0.2 && Math.abs(z) > Math.abs(onFace(x, y, z > 0 ? 1 : -1).z) - 0.03 ? (z > 0 ? 1 : -1) : 0);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(index);
  g.computeVertexNormals();
  return { geometry: g, m };
}

// Cloth texture -----------------------------------------------------------
// Normal and roughness maps drawn into canvases: soft wrinkles, with taut
// crests a little glossier. Albedo stays a flat colour. (The 5 mm ripstop
// grid is left out: at prop distance it only shows up as moire.)

function clothMaps() {
  const S = 512;
  const r = rng(5);
  const broad = valueNoise(13, 4, 8); // wraps every 4 x 8 cells: read at (x / 128, y / 64)
  const grainN = valueNoise(17, 64, 64); //                          read at (x / 8, y / 8)
  const height = new Float32Array(S * S);
  // Creases as strokes: mostly across the panel, gently curved, tapering at both ends,
  // drawn with wrap-around so the tile repeats without a seam.
  for (let k = 0; k < 150; k++) {
    let x = r() * S, y = r() * S;
    let a = (r() - 0.5) * 0.9;
    const len = 30 + r() * r() * 220;
    const width = 1.2 + r() * 2.2;
    const amp = 0.5 + r() * 0.5;
    const bend = (r() - 0.5) * 0.02;
    for (let s = 0; s < len; s += 1) {
      const taper = Math.sin((Math.PI * s) / len);
      const reach = Math.ceil(width * 2.5);
      for (let o = -reach; o <= reach; o++) {
        const px = Math.round(x - Math.sin(a) * o), py = Math.round(y + Math.cos(a) * o);
        const i = ((py % S) + S) % S * S + ((px % S) + S) % S;
        height[i] = Math.max(height[i], amp * taper * Math.exp(-((o / width) ** 2)));
      }
      x += Math.cos(a);
      y += Math.sin(a);
      a += bend;
    }
  }
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) height[y * S + x] += 0.35 * broad(x / 128, y / 64);
  }
  const normal = document.createElement('canvas');
  const rough = document.createElement('canvas');
  normal.width = normal.height = rough.width = rough.height = S;
  const nctx = normal.getContext('2d')!, rctx = rough.getContext('2d')!;
  const nimg = nctx.createImageData(S, S), rimg = rctx.createImageData(S, S);
  const at = (x: number, y: number) => height[((y + S) % S) * S + ((x + S) % S)];
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const hx = (at(x + 1, y) - at(x - 1, y)) * 0.5;
      const hy = (at(x, y + 1) - at(x, y - 1)) * 0.5;
      const n = new THREE.Vector3(-hx, -hy, 1).normalize();
      const o = (y * S + x) * 4;
      nimg.data[o] = (n.x * 0.5 + 0.5) * 255;
      nimg.data[o + 1] = (n.y * 0.5 + 0.5) * 255;
      nimg.data[o + 2] = (n.z * 0.5 + 0.5) * 255;
      nimg.data[o + 3] = 255;
      // Roughness 0.66 on the flat cloth, down towards 0.3 on taut crests.
      const crest = THREE.MathUtils.clamp(at(x, y) * 0.6, 0, 1);
      const grain = grainN(x / 8, y / 8) * 0.03;
      const r = (0.66 - 0.36 * crest * crest + grain) * 255;
      rimg.data[o] = rimg.data[o + 1] = rimg.data[o + 2] = r;
      rimg.data[o + 3] = 255;
    }
  }
  nctx.putImageData(nimg, 0, 0);
  rctx.putImageData(rimg, 0, 0);
  const wrap = (cv: HTMLCanvasElement) => {
    const t = new THREE.CanvasTexture(cv);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 4;
    return t;
  };
  return { normalMap: wrap(normal), roughnessMap: wrap(rough) };
}

// Small parts -------------------------------------------------------------

/** One mesh from several static pieces sharing a material: fewer draw calls. */
function merged(pieces: THREE.Object3D[], material: THREE.Material, name: string) {
  const geos = pieces.map((p) => {
    p.updateMatrix();
    const g = (p as THREE.Mesh).geometry.clone().applyMatrix4(p.matrix);
    const out = g.index ? g.toNonIndexed() : g;
    out.deleteAttribute('uv');
    if (!out.attributes.normal) out.computeVertexNormals();
    return out;
  });
  const mesh = new THREE.Mesh(mergeGeometries(geos), material);
  mesh.name = name;
  return mesh;
}

/** Surface detail: rides its parent when the model is exploded, and a click on it picks the parent. */
function detail<T extends THREE.Object3D>(o: T) {
  o.userData.explodeWithParent = true;
  return o;
}

function tube(curve: THREE.Curve<THREE.Vector3>, radius: number, segments: number, material: THREE.Material, name: string) {
  const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, segments, radius, 6, false), material);
  mesh.name = name;
  return mesh;
}

/** A peaked vent hood under the hub on a short end: two flaps meeting at a ridge, propped by a kickstand. */
function ventHood(m: Surface, side: 1 | -1, cloth: THREE.Material, dark: THREE.Material, name: string) {
  const g = new THREE.Group();
  g.name = name;
  // Points on the end face (walking out along x); the hood juts out nearly level so it catches the sky.
  const at = (z: number, y: number, lift = 0) => m.onFace(z, y, side, lift, 'x');
  const out = (p: THREE.Vector3, dy: number, dx: number) => p.add(new THREE.Vector3(side * dx, dy, 0));
  // As in IMG_4842 and Durston's end view, the hood fills the end wall's top triangle: from just under the
  // hub down to an edge running leg to leg.
  const apex = at(0, HUB_Y - 0.035, 0.004);
  const left = out(at(-HOOD_W, HOOD_Y), 0.01, 0.035);
  const right = out(at(HOOD_W, HOOD_Y), 0.01, 0.035);
  const peak = out(at(0, HOOD_Y), 0.015, 0.11);

  // Wind both flaps to face up and out, whichever end this is.
  const up = new THREE.Vector3().subVectors(left, apex).cross(new THREE.Vector3().subVectors(peak, apex)).y > 0;
  const hood = new THREE.BufferGeometry().setFromPoints(up ? [apex, left, peak, apex, peak, right] : [apex, peak, left, apex, right, peak]);
  hood.setAttribute('uv', new THREE.Float32BufferAttribute(
    (up ? [apex, left, peak, apex, peak, right] : [apex, peak, left, apex, right, peak]).flatMap((p) => [p.z / 0.6, -p.y / 0.6]), 2));
  hood.computeVertexNormals();
  const flaps = new THREE.Mesh(hood, cloth);
  flaps.name = `${name}-hood`;

  // The vent opening and the hood's shadow: a dark band on the fly under the overhang.
  const band: THREE.Vector3[] = [];
  const N = 8;
  const bw = HOOD_W - 0.02;
  for (let k = 0; k <= N; k++) {
    const z = -bw + (2 * bw * k) / N;
    const top = HOOD_Y - 0.005 - 0.01 * (Math.abs(z) / bw);
    band.push(at(z, top, 0.002), at(z, top - 0.03 * (1 - 0.7 * Math.abs(z) / bw), 0.002));
  }
  const idx: number[] = [];
  for (let k = 0; k < N; k++) idx.push(2 * k, 2 * k + 1, 2 * k + 2, 2 * k + 2, 2 * k + 1, 2 * k + 3);
  // Face the band out of the tent (it is single-sided).
  const bn = new THREE.Vector3().subVectors(band[1], band[0]).cross(new THREE.Vector3().subVectors(band[2], band[0]));
  if (bn.x * side < 0) for (let k = 0; k < idx.length; k += 3) [idx[k + 1], idx[k + 2]] = [idx[k + 2], idx[k + 1]];
  const gap = new THREE.BufferGeometry().setFromPoints(band);
  gap.setIndex(idx);
  gap.computeVertexNormals();
  const opening = new THREE.Mesh(gap, dark);
  const stand = tube(new THREE.LineCurve3(at(0, HOOD_Y - 0.005, 0.004), peak), 0.003, 2, dark, '');
  const tab = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.035, 0.025), dark);
  tab.position.copy(at(0, HOOD_Y - 0.055, 0.005));
  // The opening, kickstand and webbing tab share a material, so they draw as one mesh.
  flaps.add(detail(merged([opening, stand, tab], dark, `${name}-vent`)));
  g.add(flaps);
  return g;
}

/** A curve that runs along the fly surface through plan points (x, z). */
function surfaceCurve(m: Surface, plan: [number, number][], lift: number) {
  const pts: THREE.Vector3[] = [];
  for (let k = 0; k < plan.length - 1; k++) {
    const [x0, z0] = plan[k], [x1, z1] = plan[k + 1];
    for (let t = 0; t < 1; t += 0.1) {
      const x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
      pts.push(new THREE.Vector3(x, m.height(x, z), z).addScaledVector(m.normalAt(x, z), lift));
    }
  }
  const [x, z] = plan[plan.length - 1];
  pts.push(new THREE.Vector3(x, m.height(x, z), z).addScaledVector(m.normalAt(x, z), lift));
  return new THREE.CatmullRomCurve3(pts);
}

/**
 * How a door leaf opens: gathered toward its seam, losing this share of its width, in folds
 * standing this far proud; and its free corner swung out (and up) this far, as a guyed-out wing.
 */
type Leaf = { fan: Fan; gather: number; folds: number; swing: number };

/**
 * A door on a long side (+1 = +z, -1 = -z), a few mm proud of its surface: its leaves, each the fan
 * from its peak between its seam and its zip, in one mesh. setOpen opens them as in Durston's
 * photos: the large leaf gathered back on its seam, held by its magnets, its folds standing proud
 * toward the base; the small one swung out the other way, its corner guyed out off the ground.
 */
function makeDoor(s: Surface, leaves: Leaf[], side: 1 | -1, cloth: THREE.Material, name: string, toggleMat?: THREE.Material) {
  const on = (xl: number, y: number, lift: number) => s.onFace(side * xl, y, side, lift);
  const NU = 24, NV = 16, per = (NU + 1) * (NV + 1);
  const pos = new Float32Array(per * leaves.length * 3);
  const uv: number[] = [], index: number[] = [];
  leaves.forEach(({ fan }, n) => {
    for (let iu = 0; iu <= NU; iu++) {
      for (let iv = 0; iv <= NV; iv++) {
        const [xl, y] = doorFan(fan, iu / NU, iv / NV);
        uv.push(xl / 0.6, -y / 0.6); // same cloth scale as the fly
      }
    }
    for (let iu = 0; iu < NU; iu++) {
      for (let iv = 0; iv < NV; iv++) {
        const a = n * per + iu * (NV + 1) + iv, b = a + NV + 1;
        index.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
  });
  const geo = new THREE.BufferGeometry();
  const position = new THREE.BufferAttribute(pos, 3);
  geo.setAttribute('position', position);
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  const panel = new THREE.Mesh(geo, cloth);
  panel.name = `${name}-panel`;
  // The magnetic toggle that holds the large leaf open, on its edge halfway down.
  const toggle = toggleMat && new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.03, 0.006), toggleMat);
  if (toggle) {
    toggle.name = `${name}-toggle`;
    panel.add(detail(toggle));
  }
  const door = new THREE.Group();
  door.name = name;
  door.add(panel);

  /** Where a leaf's point (t, r) sits, opened e of the way (eased). */
  const leafPoint = ({ fan, gather, folds, swing }: Leaf, t: number, r: number, e: number, extra = 0) => {
    const [xl, y] = doorFan(fan, t * (1 - gather * e), r);
    // Folds that run out from the peak, and the swing, growing toward the free corner.
    const fold = 0.5 - 0.5 * Math.cos(t * Math.PI * 9);
    const out = e * swing * r ** 1.5 * t ** 1.2;
    const p = on(xl, y, 0.003 + extra + e * r * Math.min(1, t * 6) * folds * (0.22 + 0.78 * fold) + out);
    p.y += 0.6 * out * r;
    return p;
  };
  /** 0 zipped .. 1 open. */
  const setOpen = (k: number) => {
    const e = k * k * (3 - 2 * k);
    leaves.forEach((leaf, n) => {
      for (let iu = 0; iu <= NU; iu++) {
        for (let iv = 0; iv <= NV; iv++) {
          const p = leafPoint(leaf, iu / NU, iv / NV, e);
          position.setXYZ(n * per + iu * (NV + 1) + iv, p.x, p.y, p.z);
        }
      }
    });
    position.needsUpdate = true;
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    if (toggle) {
      const at = toggle.position.copy(leafPoint(leaves[0], 1, 0.5, e, 0.005));
      toggle.lookAt(at.clone().add(s.normalAt(at.x, at.z)));
    }
  };
  setOpen(0);
  // Wind each leaf's triangles so it faces out of the tent, whichever way its fan runs.
  const v = (k: number) => new THREE.Vector3().fromBufferAttribute(position, k);
  const perLeaf = NU * NV * 6;
  leaves.forEach((_, n) => {
    const o = n * perLeaf;
    const n0 = v(index[o + 1]).sub(v(index[o])).cross(v(index[o + 2]).sub(v(index[o])));
    const probe = v(index[o]);
    if (n0.dot(s.normalAt(probe.x, probe.z)) < 0) {
      for (let k = o; k < o + perLeaf; k += 3) [index[k + 1], index[k + 2]] = [index[k + 2], index[k + 1]];
    }
  });
  geo.setIndex(index);
  geo.computeVertexNormals();
  return { door, setOpen };
}

/**
 * The inner, hung under the fly: its surface over the parallelogram floor, rising steeply off the
 * tub's rim and then following the fly a few cm under it. Its doors are cut from its long sides.
 */
function makeInnerSurface(fly: Surface): Surface {
  // How far in from the rim, in plan: to an end, or across to a long side.
  const inFromRim = (x: number, z: number) => Math.min(LI - Math.abs(x), (WI - Math.abs(z - innerZ(x))) * SLANT);
  const height = (x: number, z: number) => Math.max(TUB, Math.min(fly.height(x, z) - INNER_GAP, TUB + INNER_SLOPE * inFromRim(x, z)));
  const normalAt = heightNormal(height);
  const onFace = (u: number, y: number, side: 1 | -1, lift = 0) => {
    // Walk out across the inner from its centre line.
    const w = walkOut(0, WI, y, (w) => height(u, innerZ(u) + side * w));
    const z = innerZ(u) + side * w;
    const p = new THREE.Vector3(u, height(u, z), z);
    return lift ? p.addScaledVector(normalAt(u, z), lift) : p;
  };
  return { height, onFace, normalAt };
}

function makeInner(s: Surface, tubMat: THREE.Material, meshMat: THREE.Material) {
  const NU = 48, NV = 32;
  const pos: number[] = [], tris: number[] = [];
  for (let j = 0; j <= NV; j++) {
    for (let i = 0; i <= NU; i++) {
      const x = (i / NU * 2 - 1) * LI, z = innerZ(x) + (j / NV * 2 - 1) * WI;
      pos.push(x, s.height(x, z), z);
    }
  }
  for (let j = 0; j < NV; j++) {
    for (let i = 0; i < NU; i++) {
      const a = j * (NU + 1) + i, b = a + 1, c = a + NU + 1, d = c + 1;
      tris.push(a, c, b, b, c, d);
    }
  }
  // The doors, on its long sides only, above the tub.
  const index = cutDoors(pos, tris, s, INNER_DOOR, 0.02, 0.015, (x, y, z) => {
    const across = z - innerZ(x);
    return Math.abs(across) > WI - 0.45 && y > TUB + 1e-4 ? (across > 0 ? 1 : -1) : 0;
  });
  const meshGeo = new THREE.BufferGeometry();
  meshGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  meshGeo.setIndex(index);
  meshGeo.computeVertexNormals();
  const walls = new THREE.Mesh(meshGeo, meshMat);
  walls.name = 'inner-mesh';
  // Drawn after the fly and the kit inside, so the see-through mesh never hides them.
  walls.renderOrder = 1;

  // The tub: its floor, and its rim walls up to the mesh.
  const c: [number, number][] = [[-LI, innerZ(-LI) - WI], [LI, innerZ(LI) - WI], [LI, innerZ(LI) + WI], [-LI, innerZ(-LI) + WI]];
  const tub: number[] = [];
  for (const k of [0, 3, 2, 0, 2, 1]) tub.push(c[k][0], 0.002, c[k][1]);
  for (let k = 0; k < 4; k++) {
    const [x0, z0] = c[k], [x1, z1] = c[(k + 1) % 4];
    tub.push(x0, 0, z0, x1, 0, z1, x1, TUB, z1, x0, 0, z0, x1, TUB, z1, x0, TUB, z0);
  }
  const tubGeo = new THREE.BufferGeometry();
  tubGeo.setAttribute('position', new THREE.Float32BufferAttribute(tub, 3));
  tubGeo.computeVertexNormals();
  const floor = new THREE.Mesh(tubGeo, tubMat);
  floor.name = 'inner-tub';

  const inner = new THREE.Group();
  inner.name = 'xdome-inner';
  inner.add(floor, walls);
  return inner;
}

// Poles ---------------------------------------------------------------

/** A leg from its foot in a corner up to its hub. */
const legCurve = (sx: number, sz: number) => new THREE.CatmullRomCurve3(Array.from({ length: 17 }, (_, k) => legPoint(k / 16, sx, sz)));

// The model ---------------------------------------------------------------

export type XDomeMaterials = {
  /** The fly's nylon: its wrinkle normals and roughness are set here. */
  cloth: THREE.MeshStandardMaterial;
  /** The near door's nylon, kept apart from the fly so it can glow on its own. */
  doorCloth: THREE.MeshStandardMaterial;
  alu: THREE.MeshStandardMaterial;
  hub: THREE.MeshStandardMaterial;
  clip: THREE.MeshStandardMaterial;
  webbing: THREE.MeshStandardMaterial;
  /** The inner's bathtub floor. */
  inner: THREE.MeshStandardMaterial;
  /** The inner's no-see-um walls, roof and doors: the caller makes it see-through. */
  mesh: THREE.MeshStandardMaterial;
  zip: THREE.MeshStandardMaterial;
};

export const XDOME_COLOURS = COLORS;
/** Where the brow pole's fitting sits, over the ridge. */
export const XDOME_BROW_Y = BROW_Y;
/** The inner's centre line, z at x: it runs on the slant across the fly. */
export const xdomeInnerZ = innerZ;

/**
 * The X-Dome, in the given materials: the fly (with its vents), its doors, the inner (with its
 * doors), and its poles. setDoor opens the front door, the fly's and the inner's together.
 */
export function buildXDome(mats: XDomeMaterials) {
  const root = new THREE.Group();
  root.name = 'xdome';

  const { normalMap, roughnessMap } = clothMaps();
  for (const cloth of [mats.cloth, mats.doorCloth]) {
    cloth.roughness = 1;
    cloth.roughnessMap = roughnessMap;
    cloth.normalMap = normalMap;
    cloth.normalScale.set(NORMAL_SCALE, NORMAL_SCALE);
    cloth.side = THREE.DoubleSide;
  }
  mats.inner.side = mats.mesh.side = THREE.DoubleSide;
  const { cloth, alu, hub: hubMat, clip: clipMat, webbing: webMat, zip: zipMat } = mats;

  // Fly
  const fly = new THREE.Group();
  fly.name = 'xdome-fly';
  const { geometry, m } = makeMembrane();
  const membrane = new THREE.Mesh(geometry, cloth);
  membrane.name = 'fly-membrane';
  fly.add(membrane);

  // Seams under the brow pole and, on each long side, from the peak to both corners (Durston's
  // top view); the door's zip from the peak down to the hem. (The ends show none.)
  const face = (side: 1 | -1, from: [number, number], to: [number, number], lift: number) => {
    const pts: THREE.Vector3[] = [];
    for (let k = 0; k <= 16; k++) {
      const f = k / 16;
      pts.push(m.onFace(side * (from[0] + (to[0] - from[0]) * f), from[1] + (to[1] - from[1]) * f, side, lift));
    }
    return new THREE.CatmullRomCurve3(pts);
  };
  const peak: [number, number] = [0, FLY_DOOR.peakY];
  const seamCurves = [surfaceCurve(m, [[0, -BROW_Z], [0, BROW_Z]], 0.003)];
  const zips = ([1, -1] as const).map((side) => {
    seamCurves.push(face(side, peak, [FLY_DOOR.hingeX, HEM + 0.01], 0.004), face(side, peak, [FLY_PANEL.hingeX, HEM + 0.01], 0.004));
    return tube(face(side, peak, [FLY_DOOR.zipX * 0.99, HEM + 0.01], 0.006), 0.0018, 40, zipMat, side > 0 ? 'xdome-door-zip' : 'fly-zip');
  });
  const seams = merged(seamCurves.map((curve) => tube(curve, 0.0025, 48, cloth, '')), cloth, 'fly-seams');
  membrane.add(detail(seams), detail(zips[1]));

  // Webbing loops on the fly beside each leg, about halfway up (Durston's end view).
  const loops = new THREE.InstancedMesh(new THREE.BoxGeometry(0.018, 0.05, 0.006), webMat, 4);
  loops.name = 'fly-loops';
  const tmp = new THREE.Object3D();
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz], n) => {
    const x = sx * (L - (L - HUB_X) * 0.3), z = sz * D * 0.62;
    tmp.position.set(x, m.height(x, z), z).addScaledVector(m.normalAt(x, z), 0.005);
    tmp.lookAt(tmp.position.clone().add(m.normalAt(x, z)));
    tmp.updateMatrix();
    loops.setMatrixAt(n, tmp.matrix);
  });
  membrane.add(detail(loops));

  // End vents, under the hub at each end.
  const ventEnd = ventHood(m, 1, cloth, clipMat, 'vent-end');
  const ventEndFar = ventHood(m, -1, cloth, clipMat, 'vent-end-far');
  fly.add(ventEnd, ventEndFar);
  root.add(fly);

  // Doors on both long sides, under the peaks the brow pole lifts.
  const flyLeaves: Leaf[] = [
    { fan: FLY_DOOR, gather: 0.84, folds: 0.036, swing: 0 },
    { fan: FLY_PANEL, gather: 0.84, folds: 0.036, swing: 0 },
  ];
  const front = makeDoor(m, flyLeaves, 1, mats.doorCloth, 'xdome-door', webMat);
  const back = makeDoor(m, flyLeaves, -1, cloth, 'xdome-door-back', webMat);
  // The front zip goes with the leaves: seen while they're zipped, gone once they're apart.
  front.door.add(detail(zips[0]));
  root.add(front.door, back.door);

  // The inner, with its own doors under the fly's.
  const s = makeInnerSurface(m);
  const inner = makeInner(s, mats.inner, mats.mesh);
  const innerLeaves: Leaf[] = [{ fan: INNER_DOOR, gather: 0.84, folds: 0.016, swing: 0 }];
  const innerFront = makeDoor(s, innerLeaves, 1, mats.mesh, 'inner-door');
  const innerBack = makeDoor(s, innerLeaves, -1, mats.mesh, 'inner-door-back');
  for (const d of [innerFront, innerBack]) d.door.children[0].renderOrder = 1;
  inner.add(innerFront.door, innerBack.door);
  root.add(inner);

  // Poles: the legs and the ridge between the hubs, and the brow assembly over the ridge.
  const poles = new THREE.Group();
  poles.name = 'xdome-poles';
  const main = new THREE.Group();
  main.name = 'main-poles';
  const legs: THREE.Mesh[] = [];
  const clips = new THREE.InstancedMesh(new THREE.BoxGeometry(0.022, 0.012, 0.016), clipMat, 18);
  clips.name = 'pole-clips';
  let c = 0;
  const clipAt = (curve: THREE.Curve<THREE.Vector3>, u: number) => {
    const p = curve.getPointAt(u);
    tmp.position.copy(p).y -= CLEAR * 0.5;
    tmp.lookAt(p.clone().add(curve.getTangentAt(u)));
    tmp.updateMatrix();
    clips.setMatrixAt(c++, tmp.matrix);
  };
  const tips: THREE.Mesh[] = [];
  const hubs: THREE.Mesh[] = [];
  for (const [sx, sz] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
    const curve = legCurve(sx, sz);
    legs.push(tube(curve, POLE_R, 32, alu, ''));
    for (const u of [0.25, 0.45, 0.65, 0.85]) clipAt(curve, u);
    const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.03, 8), clipMat);
    tip.position.set(sx * L, 0.015, sz * D);
    tips.push(tip);
  }
  const ridge = new THREE.CatmullRomCurve3([-1, -0.5, 0, 0.5, 1].map((f) => new THREE.Vector3(f * HUB_X, ridgeY(f * HUB_X), 0)));
  legs.push(tube(ridge, POLE_R, 16, alu, ''));
  clipAt(ridge, 0.25);
  clipAt(ridge, 0.75);
  for (const sx of [-1, 1]) {
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.026, 12), hubMat);
    hub.position.set(sx * HUB_X, HUB_Y + POLE_R, 0);
    hubs.push(hub);
  }
  main.add(merged(legs, alu, 'pole-frame'), detail(clips), detail(merged(tips, clipMat, 'pole-tips')), detail(merged(hubs, hubMat, 'pole-hubs')));

  // The brow assembly (the "awning"): the brow pole across z, its ends resting on the fly's
  // peaks, on a short strut from the ridge.
  const awning = new THREE.Group();
  awning.name = 'awning';
  const brow = new THREE.CatmullRomCurve3(
    [-1, -0.8, -0.5, 0, 0.5, 0.8, 1].map((f) => new THREE.Vector3(0, browY(f * BROW_Z) + POLE_R - 0.003, f * BROW_Z)),
  );
  const browTop = new THREE.Vector3(0, BROW_Y + POLE_R - 0.003, 0);
  const strut = tube(new THREE.LineCurve3(new THREE.Vector3(0, ridgeY(0), 0), browTop), POLE_R, 2, alu, '');
  const browPole = merged([tube(brow, POLE_R, 48, alu, ''), strut], alu, 'brow-pole');
  const fitting = new THREE.Mesh(new THREE.SphereGeometry(0.012, 10, 6), hubMat);
  fitting.position.copy(browTop);
  fitting.name = 'brow-fitting';
  browPole.add(detail(fitting));
  awning.add(browPole);
  poles.add(main, awning);
  root.add(poles);

  /** 0 zipped .. 1 open: the front doors, both the fly's leaves and the inner's, opened together. */
  const setDoor = (k: number) => {
    front.setOpen(k);
    innerFront.setOpen(k);
    zips[0].visible = k < 0.02;
  };
  return { root, fly, doors: [front.door, back.door], inner, poles, setDoor, textures: [normalMap, roughnessMap] };
}
