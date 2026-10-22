// Harry's sleeping pad, the NEMO Tensor All-Season (Regular Wide), rebuilt
// from its product photos and its size (183 x 64 cm, 3.5 in thick) through
// the img2threejs pipeline. In its own frame: lying along x with the head at
// -x, y up from the ground.
//
// One closed body: a grey quilted top over a red-orange base, meeting in a
// seam a third of the way up the side. The top's height comes from one
// function: twenty transverse baffles, each pinched into a row of nine
// domed cells, rounding down into the side wall, whose edge bulges a little
// at every baffle's end. The valve, the loop and the marks sit on the same
// function, so they lie on the cells exactly.
import { Color, Quaternion, Vector3, type BufferGeometry } from 'three';
import { gridSurface, mergeByMesh, primitiveGeometry, steps, v3, along, quat, type KitPart } from './kit-geometry';

export const TENSOR = {
  length: 1.83,
  width: 0.64,
  height: 0.089,
  /** Where the grey top meets the red-orange base, up the side. */
  seam: 0.038,
  corner: 0.05,
  baffles: 20,
  cells: 9,
  /** How deep the valleys between baffles, and the dimples between cells, are, as a share of the top's height above the seam. */
  valley: 0.45,
  dimple: 0.3,
  /** How far each baffle's end bulges past the side. */
  scallop: 0.015,
  /** The bands in from the edge over which the top rounds down to the seam, and the base (a near-upright wall) up to it. */
  edge: 0.032,
  baseEdge: 0.014,
  /** How much the seam dips under each valley between baffles. */
  seamDip: 0.012,
};
const T = TENSOR;

/** As the photos show them (sampled from crops of the lit top, the base, the valve and the marks). */
export const TENSOR_COLOURS = {
  top: '#abb2b3',
  base: '#dd4a2b',
  valve: '#9aa1a4',
  mark: '#d8402c',
};
const C = TENSOR_COLOURS;

const frac = (x: number) => x - Math.floor(x);

/** The pad's outline: half its width at x (a bulge at each baffle's end), and how far (x, z) is inside it. */
function halfWidth(x: number) {
  const s = frac(((x + T.length / 2) / T.length) * T.baffles);
  return T.width / 2 + T.scallop * (Math.sin(Math.PI * s) ** 0.5 - 0.7);
}
function inside(x: number, z: number) {
  const hx = T.length / 2;
  const hz = halfWidth(x);
  const dx = Math.abs(x) - (hx - T.corner);
  const dz = Math.abs(z) - (hz - T.corner);
  if (dx > 0 && dz > 0) return T.corner - Math.hypot(dx, dz);
  return Math.min(hx - Math.abs(x), hz - Math.abs(z));
}

/** The quilting at (x, z): 1 on a cell's crown, less in the valleys and dimples. */
function quilt(x: number, z: number) {
  const s = frac(((x + T.length / 2) / T.length) * T.baffles);
  const t = frac(((z + T.width / 2) / T.width) * T.cells);
  const baffle = Math.sin(Math.PI * s) ** 0.5;
  const cell = Math.sin(Math.PI * t) ** 0.4;
  return 1 - T.valley * (1 - baffle) - T.dimple * (1 - cell);
}

/** How a surface rounds to the seam near the edge: 0 at the outline, 1 a band in. Squarer than a circle, so the side stands near upright. */
const rounding = (e: number, band = T.edge) => {
  const k = Math.min(1, Math.max(0, e / band));
  return (1 - (1 - k) ** 3) ** (1 / 3);
};

/** The baffle at x: 1 at its crown, 0 in the valley between it and the next. */
const baffleAt = (x: number) => Math.sin(Math.PI * frac(((x + T.length / 2) / T.length) * T.baffles)) ** 0.5;
/** The seam's height at x: lower under each valley, so it runs wavy along the side, as the photos show. */
const seamAt = (x: number) => T.seam - T.seamDip * (1 - baffleAt(x));

/** The top's height at (x, z). */
export function tensorTop(x: number, z: number) {
  // The valleys and dimples run right out to the edge, as the photos' side wall shows.
  const seam = seamAt(x);
  return seam + (T.height - seam) * rounding(inside(x, z)) * (0.35 + 0.65 * quilt(x, z));
}
/** The base's height at (x, z): flat on the ground, rounding up to the seam. */
export function tensorBase(x: number, z: number) {
  return seamAt(x) * (1 - rounding(inside(x, z), T.baseEdge) * 0.97);
}

/** (u, v) in [0, 1]² to the pad's footprint: its four corners rounded (the corner squares mapped onto quarter discs). */
function footprint(u: number, v: number) {
  let x = -T.length / 2 + T.length * u;
  let z = -halfWidth(x) + 2 * halfWidth(x) * v;
  const cx = T.length / 2 - T.corner;
  const cz = halfWidth(x) - T.corner;
  const dx = Math.abs(x) - cx;
  const dz = Math.abs(z) - cz;
  if (dx > 0 && dz > 0) {
    const a = dx / T.corner;
    const b = dz / T.corner;
    x = Math.sign(x) * (cx + T.corner * a * Math.sqrt(1 - (b * b) / 2));
    z = Math.sign(z) * (cz + T.corner * b * Math.sqrt(1 - (a * a) / 2));
  }
  return [x, z] as const;
}

/**
 * Sample positions along one axis: each quilting period cut into `per` even
 * steps, so the samples never beat against the baffles or cells (which
 * shows as kinks across the top), plus extra samples in the band where the
 * side rounds.
 */
function aligned(periods: number, per: number, band: number) {
  const extra = [0.06, 0.16, 0.3, 0.48, 0.7].map((k) => k * band);
  const all = [...steps(0, 1, periods * per + 1), ...extra, ...extra.map((k) => 1 - k)];
  return [...new Set(all.map((x) => Math.round(x * 1e6) / 1e6))].sort((a, b) => a - b);
}

/** A flat mark on the top, its corners (x0, z0)-(x1, z1), lifted 1.5 mm off the cells. */
function mark(id: string, x0: number, z0: number, x1: number, z1: number): KitPart {
  return { id, mesh: 'marks', colour: C.mark, kind: 'surface', surface: 'mark', params: { x0, z0, x1, z1 } };
}

/** Everything the pad is made of, described. */
export function tensorParts(): KitPart[] {
  const parts: KitPart[] = [
    { id: 'pad-top', mesh: 'top', colour: C.top, kind: 'surface', surface: 'top', params: { perBaffle: 5, perCell: 4 } },
    { id: 'pad-base', mesh: 'base', colour: C.base, kind: 'surface', surface: 'base', params: { perBaffle: 2, perCell: 1 } },
  ];
  // The valve, flush in a head corner's cell (on the right, seen from above with the head at the top).
  const vx = -T.length / 2 + 0.065;
  const vz = -(T.width / 2 - 0.07);
  const e = 1e-3;
  const n = new Vector3(-(tensorTop(vx + e, vz) - tensorTop(vx - e, vz)) / (2 * e), 1, -(tensorTop(vx, vz + e) - tensorTop(vx, vz - e)) / (2 * e)).normalize();
  const at = new Vector3(vx, tensorTop(vx, vz), vz);
  parts.push({ id: 'pad-valve', mesh: 'valve', colour: C.valve, kind: 'cylinder', position: v3(at.clone().addScaledVector(n, 0.004)), quaternion: quat(along(n)), radius: 0.024, height: 0.01, radial: 16 });
  parts.push({ id: 'pad-valve-mark', mesh: 'marks', colour: C.mark, kind: 'cylinder', position: v3(at.clone().addScaledVector(n, 0.0095)), quaternion: quat(along(n)), radius: 0.008, height: 0.002, radial: 12 });
  // The loop, sewn into the head's seam at the middle.
  const flat = new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), new Vector3(0, 1, 0));
  parts.push({ id: 'pad-loop', mesh: 'valve', colour: C.valve, kind: 'torus', position: [round3(-T.length / 2 - 0.012), T.seam, 0], quaternion: quat(flat), radius: 0.011, tube: 0.0035, arc: Math.PI * 2 });
  // The marks, plain red (no lettering): NEMO's shield and word near the head, TENSOR along the side toward the foot.
  const mx = -T.length / 2 + 0.17;
  parts.push(mark('pad-mark-shield', mx - 0.016, 0.045, mx + 0.016, 0.075));
  parts.push(mark('pad-mark-word', mx - 0.012, -0.075, mx + 0.012, 0.035));
  parts.push(mark('pad-mark-tensor', 0.1, T.width / 2 - 0.1, 0.24, T.width / 2 - 0.08));
  return parts;
}
const round3 = (x: number) => Math.round(x * 1e5) / 1e5;

/** One part as geometry. */
export function tensorGeometry(part: KitPart): BufferGeometry {
  if (part.kind !== 'surface') return primitiveGeometry(part);
  const top = new Color(C.top);
  const base = new Color(C.base);
  const red = new Color(C.mark);
  if (part.surface === 'top' || part.surface === 'base') {
    const isTop = part.surface === 'top';
    const p = part.params as { perBaffle: number; perCell: number };
    const bandU = (T.edge * 1.2) / T.length;
    const bandV = (T.edge * 1.2) / T.width;
    return gridSurface(
      aligned(T.baffles, p.perBaffle, bandU),
      aligned(T.cells, p.perCell, bandV),
      (u, v, out) => {
        const [x, z] = footprint(u, v);
        // The base a hair inside the top's edge, so its coarser outline never shows past it from above.
        const k = isTop ? 1 : 0.998;
        return out.set(x * k, isTop ? tensorTop(x, z) : tensorBase(x, z), z * k);
      },
      () => (isTop ? top : base),
      !isTop,
    );
  }
  if (part.surface === 'mark') {
    const { x0, z0, x1, z1 } = part.params as { x0: number; z0: number; x1: number; z1: number };
    return gridSurface(
      steps(0, 1, 8),
      steps(0, 1, 4),
      (u, v, out) => {
        const x = x0 + (x1 - x0) * u;
        const z = z0 + (z1 - z0) * v;
        return out.set(x, tensorTop(x, z) + 0.0015, z);
      },
      () => red,
    );
  }
  throw new Error(`tensor: no ${part.surface} surface`);
}

/** The pad as one geometry per mesh: top, base, valve, marks. */
export function buildTensor(parts = tensorParts()) {
  return mergeByMesh(parts, tensorGeometry);
}
