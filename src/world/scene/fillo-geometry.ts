// Harry's pillow, the NEMO Fillo in Silt Stripe, rebuilt from its product
// photos and its size (43 x 27 x 10 cm) through the img2threejs pipeline.
// In its own frame: lying flat, its long side along x, the striped face up,
// y up from the ground.
//
// A soft cushion: two domed faces meeting in a seam a third of the way up,
// each rising from it over a round shoulder, the corners pinched a little
// lower. The stripes are colour bands on the
// face's own vertices with hard edges (pairs of rows a whisker apart), not a
// texture; so is the back's navy panel. The valve, a loop and the label sit
// on one short edge.
import { Color, Quaternion, Vector3, type BufferGeometry } from 'three';
import { gridSurface, mergeByMesh, primitiveGeometry, quat, steps, v3, type KitPart } from './kit-geometry';

export const FILLO = {
  length: 0.43,
  width: 0.27,
  /** The face's height above the seam, and the back's depth below it (flattened on the ground). */
  top: 0.066,
  seam: 0.035,
  /** The shape: the outline's corner radius; the shoulder each face rises over from the seam, and how round it is (2 a quarter ellipse, higher boxier); how much its middle domes; how much lower the corners are. */
  corner: 0.008,
  shoulder: 0.07,
  roundness: 1.6,
  crown: 0.18,
  pinch: 0.45,
  /** Ten stripes along the length, 2.6 cm apart across the middle, each 4 mm wide (counted and measured on the front photo). */
  stripes: 10,
  stripeGap: 0.026,
  stripeWidth: 0.004,
  /** The back's navy panel: in from the long edges and the short ones (it runs the full length). */
  panelInset: [0.032, 0],
  /** The two stripes on each of the back's sage bands, in from the long edge. */
  bandStripes: [0.01, 0.02],
};
const F = FILLO;

/** As the photos show them. */
export const FILLO_COLOURS = {
  sage: '#97aaad',
  stripe: '#607476',
  navy: '#323f55',
  black: '#1d1e21',
};
const C = FILLO_COLOURS;

/** How far (x, z) is inside the outline: a rectangle with rounded corners. */
function inside(x: number, z: number) {
  const hx = F.length / 2;
  const hz = F.width / 2;
  const dx = Math.abs(x) - (hx - F.corner);
  const dz = Math.abs(z) - (hz - F.corner);
  if (dx > 0 && dz > 0) return F.corner - Math.hypot(dx, dz);
  return Math.min(hx - Math.abs(x), hz - Math.abs(z));
}
/** How far up a face is at (x, z): 0 at the seam, rising over a round shoulder to a gently domed middle, lower toward the pinched corners. */
function dome(x: number, z: number) {
  const k = Math.min(1, Math.max(0, inside(x, z) / F.shoulder));
  const shoulder = (1 - (1 - k) ** F.roundness) ** (1 / F.roundness);
  const u = x / (F.length / 2);
  const w = z / (F.width / 2);
  const middle = 1 - F.crown * (u * u + w * w);
  const corner = 1 - F.pinch * Math.abs(u * w) ** 3;
  return shoulder * middle * corner;
}
/** (u, v) in [0, 1]² to the outline, its corner squares mapped onto quarter discs. */
function footprint(u: number, v: number) {
  let x = -F.length / 2 + F.length * u;
  let z = -F.width / 2 + F.width * v;
  const cx = F.length / 2 - F.corner;
  const cz = F.width / 2 - F.corner;
  const dx = Math.abs(x) - cx;
  const dz = Math.abs(z) - cz;
  if (dx > 0 && dz > 0) {
    const a = dx / F.corner;
    const b = dz / F.corner;
    x = Math.sign(x) * (cx + F.corner * a * Math.sqrt(1 - (b * b) / 2));
    z = Math.sign(z) * (cz + F.corner * b * Math.sqrt(1 - (a * a) / 2));
  }
  return [x, z] as const;
}
export const filloTop = (x: number, z: number) => F.seam + F.top * dome(x, z);
export const filloBack = (x: number, z: number) => Math.max(0.002, F.seam * (1 - dome(x, z) ** 0.6));

/** Rows (across) for a face: the given hard edges, each as a pair a whisker apart, filled between and dense toward the seam. */
function rowsWithEdges(edges: number[]) {
  const half = F.width / 2;
  const fill = steps(-1, 1, 25).map((t) => Math.sign(t) * Math.abs(t) ** 0.8 * half);
  const pairs = edges.flatMap((z) => [z - 0.0004, z + 0.0004]);
  const all = [...fill, ...pairs].filter((z) => z >= -half && z <= half);
  return [...new Set(all.map((z) => Math.round(z * 1e6) / 1e6))].sort((a, b) => a - b).map((z) => (z + half) / F.width);
}
function columns(edges: number[] = []) {
  const half = F.length / 2;
  const fill = steps(-1, 1, 37).map((t) => Math.sign(t) * Math.abs(t) ** 0.8 * half);
  const all = [...fill, ...edges.flatMap((x) => [x - 0.0004, x + 0.0004])];
  return [...new Set(all.map((x) => Math.round(x * 1e6) / 1e6))].sort((a, b) => a - b).map((x) => (x + half) / F.length);
}

/** The stripes' centres across the face. */
export function stripeCentres() {
  return Array.from({ length: F.stripes }, (_, i) => (i - (F.stripes - 1) / 2) * F.stripeGap);
}

/** Everything the pillow is made of, described. */
export function filloParts(): KitPart[] {
  const parts: KitPart[] = [
    { id: 'pillow-face', mesh: 'cover', colour: C.sage, kind: 'surface', surface: 'face', params: { stripes: stripeCentres().map((z) => Math.round(z * 1e5) / 1e5) } },
    { id: 'pillow-back', mesh: 'cover', colour: C.navy, kind: 'surface', surface: 'back', params: { inset: F.panelInset } },
  ];
  const edge = F.length / 2;
  const half = F.width / 2;
  // The valve, out of the seam at one corner of the short edge (+x), and the loop and label beside it.
  const sideways = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), new Vector3(1, 0, 0));
  parts.push({ id: 'pillow-valve', mesh: 'trim', colour: C.black, kind: 'cylinder', position: v3(new Vector3(edge + 0.004, F.seam, -(half - 0.035))), quaternion: quat(sideways), radius: 0.011, height: 0.02, radial: 12 });
  parts.push({ id: 'pillow-valve-cap', mesh: 'trim', colour: C.black, kind: 'cylinder', position: v3(new Vector3(edge + 0.016, F.seam, -(half - 0.035))), quaternion: quat(sideways), radius: 0.0125, height: 0.006, radial: 12 });
  const flat = new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), new Vector3(0, 1, 0));
  parts.push({ id: 'pillow-loop', mesh: 'trim', colour: C.black, kind: 'torus', position: [edge + 0.008, F.seam, 0.012], quaternion: quat(flat), radius: 0.009, tube: 0.0022, arc: Math.PI * 2 });
  parts.push({ id: 'pillow-label', mesh: 'trim', colour: C.black, kind: 'box', position: [edge + 0.006, F.seam, half - 0.05], quaternion: [0, 0, 0, 1], size: [0.014, 0.002, 0.038] });
  return parts;
}

/** One part as geometry. */
export function filloGeometry(part: KitPart): BufferGeometry {
  if (part.kind !== 'surface') return primitiveGeometry(part);
  const sage = new Color(C.sage);
  const stripe = new Color(C.stripe);
  const navy = new Color(C.navy);
  const point = footprint;
  if (part.surface === 'face') {
    const centres = (part.params as { stripes: number[] }).stripes;
    const w = F.stripeWidth / 2;
    const edges = centres.flatMap((z) => [z - w, z + w]);
    return gridSurface(
      columns(),
      rowsWithEdges(edges),
      (u, v, out) => {
        const [x, z] = point(u, v);
        return out.set(x, filloTop(x, z), z);
      },
      (_u, _v, p) => (centres.some((z) => Math.abs(p.z - z) < w) ? stripe : sage),
    );
  }
  if (part.surface === 'back') {
    const [inZ, inX] = (part.params as { inset: [number, number] }).inset;
    const z0 = F.width / 2 - inZ;
    const x0 = F.length / 2 - inX;
    // The sage bands along the long edges carry two stripes each.
    const w = F.stripeWidth / 2;
    const bands = F.bandStripes.flatMap((d) => [F.width / 2 - d, -(F.width / 2 - d)]);
    return gridSurface(
      columns([-x0, x0]),
      rowsWithEdges([-z0, z0, ...bands.flatMap((z) => [z - w, z + w])]),
      (u, v, out) => {
        const [x, z] = point(u, v);
        return out.set(x, filloBack(x, z), z);
      },
      (_u, _v, p) => (Math.abs(p.z) < z0 && Math.abs(p.x) < x0 ? navy : bands.some((z) => Math.abs(p.z - z) < w) ? stripe : sage),
      true,
    );
  }
  throw new Error(`fillo: no ${part.surface} surface`);
}

/** The pillow as one geometry per mesh: the cover and its trim. */
export function buildFillo(parts = filloParts()) {
  return mergeByMesh(parts, filloGeometry);
}
