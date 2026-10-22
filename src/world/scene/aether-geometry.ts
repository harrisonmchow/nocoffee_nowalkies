// Harry's pack, the Osprey Aether 65 (Men's, Large/X-Large, Deep Water Blue),
// rebuilt from its product photos and its listed size (80 x 40 x 28 cm
// overall) through the img2threejs pipeline. In its own frame: standing on
// its base, its front (the pocket) toward +z and its harness toward -z, +x
// the wearer's right, y up from the ground.
//
// The bag and its lid are one soft body: cross-sections (superellipses with
// their own front and back reach) stacked from a rounded base to the lid's
// domed top, the lid a little wider where it overhangs. The front pocket and
// the back panel lie on the body; the shoulder straps and the hip belt are
// padded bands swept along paths. Webbing, buckles, cords and marks follow
// the body's surface. Colour regions (the lid, the darker front panel) are on
// the vertices.
import { CatmullRomCurve3, Color, Quaternion, Vector3, type BufferGeometry } from 'three';
import { gridSurface, mergeByMesh, primitiveGeometry, quat, round, smoothstep, steps, v3, type KitPart, type Vec3 } from './kit-geometry';

export const AETHER = {
  height: 0.8,
  /** The body's cross-sections, base to top: [y, half-width, front reach (z), back reach (z, negative)]; closed at both ends. */
  sections: [
    [0.0, 0.0, 0.0, 0.0],
    [0.01, 0.1, 0.055, -0.07],
    [0.04, 0.165, 0.105, -0.105],
    [0.14, 0.168, 0.13, -0.106],
    [0.3, 0.16, 0.124, -0.103],
    [0.5, 0.155, 0.119, -0.103],
    [0.61, 0.153, 0.112, -0.104],
    [0.66, 0.165, 0.118, -0.118],
    [0.73, 0.148, 0.088, -0.124],
    [0.78, 0.13, 0.066, -0.11],
    [0.8, 0.0, 0.0, -0.02],
  ] as [number, number, number, number][],
  /** How square the cross-sections are (2 an ellipse, higher squarer). */
  squareness: 4.0,
  /** Where the lid begins, up the front and up the back (its lower edge dips at the front). */
  lid: { front: 0.635, back: 0.665 },
  /** The front shove-it pocket: its span across (x, a little to the wearer's right, as the photo maps) and up, and how far it stands proud. */
  pocket: { x0: -0.1, x1: 0.14, y0: 0.21, y1: 0.535, proud: 0.022 },
  /** The harness: the back panel, the shoulder straps and the hip belt. */
  backPanel: { y0: 0.14, y1: 0.62, halfWidth: 0.118, bulge: 0.025 },
  /**
   * Each shoulder strap's path, x outward (the left strap's mirrored): from the yoke at the top of the back panel,
   * hooking out and hanging wide down the back panel's edges to the hip belt. Unworn, each hangs its own way: the
   * left as the front photo sees it, the right as the back photo does.
   */
  strap: {
    right: [
      [0.075, 0.59, -0.125],
      [0.09, 0.57, -0.185],
      [0.1, 0.52, -0.165],
      [0.1, 0.41, -0.165],
      [0.11, 0.28, -0.153],
      [0.125, 0.19, -0.145],
    ] as Vec3[],
    left: [
      [0.075, 0.59, -0.125],
      [0.1, 0.57, -0.165],
      [0.125, 0.52, -0.18],
      [0.135, 0.41, -0.185],
      [0.135, 0.28, -0.17],
      [0.14, 0.19, -0.15],
    ] as Vec3[],
  },
  strapWidth: 0.07,
  strapThickness: 0.02,
  /** The hip belt's path round the lower back: its middle, and each wing out to its tip, x outward (the left's mirrored; each as its photo sees it). */
  hipBelt: {
    centre: [0.0, 0.165, -0.13] as Vec3,
    // Flopped open straight out behind, as the back photo shows it; the left curves forward round the side.
    right: [
      [0.1, 0.163, -0.128],
      [0.17, 0.155, -0.142],
      [0.238, 0.145, -0.141],
      [0.29, 0.135, -0.14],
    ] as Vec3[],
    left: [
      [0.1, 0.163, -0.128],
      [0.17, 0.155, -0.11],
      [0.23, 0.145, -0.085],
      [0.28, 0.135, -0.06],
    ] as Vec3[],
  },
  hipBeltHeight: 0.12,
  hipBeltThickness: 0.028,
  /** How wide the hip belt's hanging webbing loop spreads (1 its full reach). */
  loopWidth: 0.7,
};
const P = AETHER;

/** Albedos calibrated so the review studio's render matches the primary photo region by region (calibrate.py). */
export const AETHER_COLOURS = {
  body: '#0a5679',
  lid: '#0c5174',
  panel: '#16506e',
  strapFace: '#0d4f78',
  harness: '#1f1f20',
  /** The padded parts' foam (shoulder straps, hip belt), a lighter black than the back panel's mesh, as the photos show. */
  pad: '#2d2d2f',
  webbing: '#164a6c',
  /** The harness's own webbing: the sternum strap, the load lifters, the hip belt's. */
  belt: '#464748',
  buckle: '#141516',
  reflective: '#b9bdc0',
  cord: '#1d5486',
  seam: '#07344f',
  print: '#cfd5d9',
};
const C = AETHER_COLOURS;

/** The body's cross-section numbers at height y (interpolated, smooth). */
function section(y: number) {
  const s = P.sections;
  let i = 0;
  while (i < s.length - 2 && y > s[i + 1][0]) i++;
  const [y0, a0, f0, b0] = s[i];
  const [y1, a1, f1, b1] = s[i + 1];
  const t = smoothstep(0, 1, Math.min(1, Math.max(0, (y - y0) / (y1 - y0))));
  return { a: a0 + (a1 - a0) * t, f: f0 + (f1 - f0) * t, b: b0 + (b1 - b0) * t };
}
const E = () => 2 / P.squareness;

/** A point on the body at (u around from the wearer's right, through the front, v from the base to the top). */
export function bodyPoint(u: number, v: number, out = new Vector3()) {
  const y = P.height * Math.min(1, Math.max(0, v));
  const { a, f, b } = section(y);
  const th = 2 * Math.PI * u;
  const c = Math.cos(th);
  const s = Math.sin(th);
  const x = Math.sign(c) * Math.abs(c) ** E() * a;
  const zn = Math.sign(s) * Math.abs(s) ** E();
  // The front pocket stands proud of the body over its span.
  return out.set(x, y, zn >= 0 ? zn * f + pocketBulge(x, y) * zn : zn * -b);
}
/** How far the pocket stands proud at (x, y) on the front. */
function pocketBulge(x: number, y: number) {
  const { x0, x1, y0, y1, proud } = P.pocket;
  const s = Math.min(x - x0, x1 - x) / ((x1 - x0) / 2);
  const t = (y - y0) / (y1 - y0);
  if (s <= 0 || t <= 0 || t >= 1) return 0;
  return proud * smoothstep(0, 0.25, s) * Math.sin(Math.PI * t) ** 0.6;
}
/** u (around) where the body's front reaches across to x, at height y: its front half. */
export function frontU(x: number, y: number) {
  const { a } = section(y);
  const c = Math.sign(x) * Math.min(1, Math.abs(x) / a) ** (1 / E());
  return Math.acos(Math.max(-1, Math.min(1, c))) / (2 * Math.PI);
}
/** Its outward normal at (u, v), from the surface's own derivatives. */
function bodyNormal(u: number, v: number) {
  const d = 1e-4;
  const du = bodyPoint(u + d, v).sub(bodyPoint(u - d, v));
  const dv = bodyPoint(u, Math.min(1, v + d)).sub(bodyPoint(u, Math.max(0, v - d)));
  return new Vector3().crossVectors(dv, du).normalize();
}
/** A point on the body lifted along its normal. */
export function onBody(u: number, v: number, by: number) {
  return bodyPoint(u, v).addScaledVector(bodyNormal(u, v), by);
}
const V = (y: number) => y / P.height;

/** A band of webbing lying on the body, from (u0, y0) to (u1, y1), lifted off it. */
function band(id: string, u0: number, y0: number, u1: number, y1: number, colour = C.webbing, width = 0.022): KitPart {
  return { id, mesh: 'trim', colour, kind: 'surface', surface: 'band', params: { u0: round(u0), y0, u1: round(u1), y1, width } };
}
/** A buckle on the body at (u, y): a small black block on its surface, turned along the band. */
function buckle(id: string, u: number, y: number, dir: 'across' | 'down', size: Vec3 = [0.034, 0.012, 0.042]): KitPart {
  const v = V(y);
  const at = onBody(u, v, 0.008);
  const n = bodyNormal(u, v);
  const tangent = dir === 'down' ? new Vector3(0, -1, 0) : bodyPoint(u - 0.005, v).sub(bodyPoint(u + 0.005, v)).normalize();
  // Its thin axis along the normal, its long axis along the band.
  const q = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), n);
  const long = new Vector3(0, 0, 1).applyQuaternion(q);
  const twist = new Quaternion().setFromUnitVectors(long, tangent.clone().addScaledVector(n, -tangent.dot(n)).normalize());
  return { id, mesh: 'trim', colour: C.buckle, kind: 'box', position: v3(at), quaternion: quat(twist.multiply(q)), size };
}
/** The same, its ends placed across the front by x (the front is nearly flat, so u bunches toward its corners). */
function bandX(id: string, x0: number, y0: number, x1: number, y1: number, colour = C.webbing, width = 0.022): KitPart {
  return band(id, frontU(x0, y0), y0, frontU(x1, y1), y1, colour, width);
}
/** A flat mark lying on the front, its centre at (x, y) and its size in metres. */
function mark(id: string, x: number, y: number, width: number, height: number, colour: string): KitPart {
  return { id, mesh: 'trim', colour, kind: 'surface', surface: 'mark', params: { x, y, width, height } };
}
/** A flat strip lying on the front along (x, y) points: printed reflective tape, a seam. */
function strip(id: string, points: [number, number][], width: number, colour: string): KitPart {
  return { id, mesh: 'trim', colour, kind: 'surface', surface: 'strip', params: { points: points.map(([x, y]) => [round(x), round(y)]), width } };
}
/** A colour part way from one to another, blended as the eye sees them (sRGB): a print's fine lines read as a tint at a distance. */
function tint(from: string, to: string, k: number) {
  const a = parseInt(from.slice(1), 16);
  const b = parseInt(to.slice(1), 16);
  const mix = (shift: number) => Math.round(((a >> shift) & 255) * (1 - k) + ((b >> shift) & 255) * k);
  return '#' + ((mix(16) << 16) | (mix(8) << 8) | mix(0)).toString(16).padStart(6, '0');
}
/** A cord along points on the body (as (u, y) pairs), lifted off it. */
function cord(id: string, points: [number, number][], radius: number, colour: string, lift = 0.006, closed = false, perPoint = 6): KitPart {
  return { id, mesh: 'trim', colour, kind: 'tube', points: points.map(([u, y]) => v3(onBody(u, V(y), lift))), radius, closed, radial: 5, tubular: points.length * perPoint };
}
/** The same along points on the front given as (x, y). */
function cordX(id: string, points: [number, number][], radius: number, colour: string, lift = 0.006): KitPart {
  return cord(id, points.map(([x, y]) => [frontU(x, y), y]), radius, colour, lift);
}

/** Everything the pack is made of, described. */
export function aetherParts(): KitPart[] {
  const parts: KitPart[] = [
    { id: 'pack-body', mesh: 'fabric', colour: C.body, kind: 'surface', surface: 'body', params: { around: 72, up: 64 } },
    { id: 'pack-back-panel', mesh: 'harness', colour: C.harness, kind: 'surface', surface: 'backPanel', params: {} },
    { id: 'pack-hip-belt', mesh: 'harness', colour: C.pad, kind: 'surface', surface: 'hipBelt', params: {} },
  ];
  for (const side of ['right', 'left'] as const) {
    parts.push({ id: `pack-shoulder-strap-${side}`, mesh: 'harness', colour: C.pad, kind: 'surface', surface: 'shoulderStrap', params: { side } });
  }
  // u runs round the body: 0 the wearer's right, 0.25 the front's middle, 0.5 the left, 0.75 the back's middle.
  // The front, placed by x where the primary photo maps onto the body: the lid's two straps at the front's
  // corners, a third strap down from the pocket's top, two straps across the pocket, a short strap at the base.
  for (const [k, x] of [['right', 0.138], ['left', -0.138]] as const) {
    parts.push(bandX(`pack-lid-strap-${k}`, x, 0.6, x, 0.46));
    parts.push(buckle(`pack-lid-buckle-${k}`, frontU(x, 0.557), 0.557, 'down'));
  }
  parts.push(bandX('pack-front-strap', 0.03, 0.54, 0.032, 0.45));
  parts.push(buckle('pack-front-buckle', frontU(0.03, 0.507), 0.507, 'down'));
  parts.push(band('pack-pocket-strap-upper', frontU(-0.072, 0.44), 0.44, 0.1, 0.452));
  parts.push(buckle('pack-pocket-buckle-upper', frontU(0.074, 0.441), 0.441, 'across'));
  parts.push(band('pack-pocket-strap-lower', frontU(-0.053, 0.217), 0.217, 0.1, 0.232));
  parts.push(buckle('pack-pocket-buckle-lower', frontU(0.088, 0.223), 0.223, 'across'));
  parts.push(bandX('pack-base-strap', -0.056, 0.162, -0.046, 0.075));
  parts.push(buckle('pack-base-buckle', frontU(-0.052, 0.117), 0.117, 'down'));
  // The base strap's elastic cord, looped round it, and the sleeping-bag compartment's zip across the base.
  parts.push(cordX('pack-base-cord', [[-0.078, 0.15], [-0.074, 0.1], [-0.05, 0.072], [-0.03, 0.095], [-0.022, 0.146]], 0.0028, C.cord));
  parts.push(strip('pack-base-zip', steps(0, 1, 9).map((k) => [-0.13 + 0.26 * k, 0.172 - 0.024 * k + 0.012 * Math.sin(Math.PI * k)] as [number, number]), 0.004, C.seam));
  // Each side: two compression straps with their buckles near the front, and the side zip.
  for (const [k, u0, u1] of [['left', 0.62, 0.4], ['right', 0.88, 1.1]] as const) {
    parts.push(band(`pack-side-strap-upper-${k}`, u0, 0.5, u1, 0.535));
    parts.push(band(`pack-side-strap-lower-${k}`, u0, 0.2, u1, 0.235));
    const ub = k === 'left' ? 0.43 : 1.07;
    parts.push(buckle(`pack-side-buckle-upper-${k}`, ub, 0.53, 'across'));
    parts.push(buckle(`pack-side-buckle-lower-${k}`, ub, 0.23, 'across'));
    const uz = k === 'left' ? 0.5 : 0.0;
    parts.push(cord(`pack-side-zip-${k}`, [[uz, 0.26], [uz, 0.4], [uz, 0.55]], 0.0025, C.seam, 0.003));
  }
  // The pocket's reflective oval: a rounded oblong of printed tape in four pieces (top, sides, bottom).
  const ov = { x: 0.038, y: 0.333, hw: 0.034, hh: 0.0625 };
  const piece = (from: number, to: number) =>
    steps(from * Math.PI, to * Math.PI, 11).map((a) => {
      const c = Math.cos(a);
      const s = Math.sin(a);
      return [ov.x + ov.hw * Math.sign(c) * Math.abs(c) ** 0.8, ov.y + ov.hh * Math.sign(s) * Math.abs(s) ** 0.8] as [number, number];
    });
  parts.push(strip('pack-reflective-top', piece(0.22, 0.78), 0.008, C.reflective));
  parts.push(strip('pack-reflective-left', piece(0.85, 1.15), 0.007, C.reflective));
  parts.push(strip('pack-reflective-bottom', piece(1.22, 1.78), 0.009, C.reflective));
  parts.push(strip('pack-reflective-right', piece(-0.15, 0.15), 0.007, C.reflective));
  // The pocket's drawcord from its top left, and its cord lock.
  parts.push(cordX('pack-drawcord', [[-0.074, 0.458], [-0.084, 0.43], [-0.064, 0.413], [-0.044, 0.401], [-0.027, 0.393]], 0.0022, C.buckle));
  parts.push(buckle('pack-cord-lock', frontU(-0.083, 0.427), 0.427, 'down', [0.014, 0.01, 0.024]));
  // A tool loop at the front's right base.
  parts.push(cord('pack-tool-loop', [[0.1, 0.17], [0.06, 0.12], [0.07, 0.06], [0.11, 0.1]], 0.003, C.cord, 0.025, true));
  // The marks: the Osprey name and bird on the lid, AETHER 65 on the lower front, as tints (no lettering).
  parts.push(mark('pack-mark-lid', 0.002, 0.7, 0.066, 0.05, tint(C.lid, C.print, 0.12)));
  parts.push(mark('pack-mark-name', 0.083, 0.124, 0.104, 0.013, tint(C.body, C.print, 0.12)));
  // The piped seams that set the lid and the pocket apart: round the lid's lower edge, round the pocket, and up the
  // upper panel's slanting left edge.
  const lidEdge = (u: number) => P.lid.back + (P.lid.front - P.lid.back) * Math.max(0, Math.sin(2 * Math.PI * u));
  parts.push(cord('pack-lid-seam', steps(0, 1, 49).slice(0, -1).map((u) => [u, lidEdge(u)] as [number, number]), 0.003, C.seam, 0.001, true, 2));
  const { x0, x1, y0, y1 } = P.pocket;
  parts.push(cordX('pack-pocket-seam', [[x1, y0], [x0 + 0.06, y0], [x0, y0 + 0.02], [x0, y1 - 0.02], [x0 + 0.03, y1], [(x0 + x1) / 2, y1 + 0.006], [x1, y1]], 0.0025, C.seam, 0.001));
  parts.push(cordX('pack-panel-seam', [[x0 + 0.03, y1], [x0 + 0.05, y1 + 0.04], [x0 + 0.055, P.lid.front]], 0.0025, C.seam, 0.001));
  // The hip belt's webbing, its two ends buckled and hanging in a loop behind the back (as the pack stands, unworn).
  const right = P.hipBelt.right[P.hipBelt.right.length - 1];
  const left = P.hipBelt.left[P.hipBelt.left.length - 1];
  const w = P.loopWidth;
  const loop: Vec3[] = [[right[0], right[1] - 0.03, right[2]], [0.22 * w, 0.075, -0.17], [0.08 * w, 0.052, -0.205], [-0.08 * w, 0.052, -0.205], [-0.22 * w, 0.075, -0.17], [-left[0], left[1] - 0.03, left[2]]];
  parts.push({ id: 'pack-hip-belt-webbing', mesh: 'trim', colour: C.belt, kind: 'tube', points: loop, radius: 0.008, closed: false, radial: 6, tubular: 36 });
  parts.push({ id: 'pack-hip-belt-buckle', mesh: 'trim', colour: C.buckle, kind: 'box', position: [round(0.12 * w), 0.056, -0.204], quaternion: [0, 0, 0, 1], size: [0.06, 0.04, 0.016] });
  // The harness's small parts: the sternum strap and its buckle, the load lifters.
  const strapAt = (side: 1 | -1, k: number) => strapCurve(side).getPointAt(k);
  const sternumL = strapAt(-1, 0.55);
  const sternumR = strapAt(1, 0.55);
  parts.push({ id: 'pack-sternum-strap', mesh: 'trim', colour: C.belt, kind: 'tube', points: [v3(sternumR.clone().add(new Vector3(0, 0, -0.012))), v3(sternumL.clone().add(new Vector3(0, 0, -0.012)))], radius: 0.006, closed: false, radial: 4, tubular: 4 });
  parts.push({ id: 'pack-sternum-buckle', mesh: 'trim', colour: C.buckle, kind: 'box', position: v3(sternumL.clone().add(sternumR).multiplyScalar(0.5).add(new Vector3(0.02, 0, -0.012))), quaternion: [0, 0, 0, 1], size: [0.04, 0.025, 0.012] });
  for (const side of [1, -1] as const) {
    const top = strapAt(side, 0.18);
    const anchor = bodyPoint(side > 0 ? 0.83 : 0.67, V(0.66));
    parts.push({ id: `pack-load-lifter-${side > 0 ? 'right' : 'left'}`, mesh: 'trim', colour: C.belt, kind: 'tube', points: [v3(top), v3(anchor)], radius: 0.005, closed: false, radial: 4, tubular: 3 });
  }
  return parts;
}

/** A shoulder strap's centre line: +1 the wearer's right, -1 the left. */
function strapCurve(side: 1 | -1) {
  return new CatmullRomCurve3((side > 0 ? P.strap.right : P.strap.left).map(([x, y, z]) => new Vector3(side * x, y, z)), false, 'centripetal');
}
/** The hip belt's centre line, wing tip to wing tip. */
function hipBeltCurve() {
  const { centre, right, left } = P.hipBelt;
  const pts = [...left.slice().reverse().map(([x, y, z]) => new Vector3(-x, y, z)), new Vector3(...centre), ...right.map(([x, y, z]) => new Vector3(x, y, z))];
  return new CatmullRomCurve3(pts, false, 'centripetal');
}

/**
 * A padded band swept along a curve: a rounded-rectangle cross-section (width
 * across, thickness through) kept square to the curve, its "out" face (away
 * from the pack) one colour and the rest another.
 */
function paddedBand(curve: CatmullRomCurve3, width: (k: number) => number, thickness: number, across: (k: number, tangent: Vector3) => Vector3, outColour: Color, edgeColour: Color, segments = 28, faceWidth = 1) {
  const ring = steps(0, 1, 17).slice(0, -1);
  const corner = (a: number) => {
    // A rounded rectangle: a squircle in (across, through).
    const c = Math.cos(2 * Math.PI * a);
    const s = Math.sin(2 * Math.PI * a);
    return [Math.sign(c) * Math.abs(c) ** 0.4, Math.sign(s) * Math.abs(s) ** 0.4];
  };
  return gridSurface([...ring, 1], steps(0, 1, segments + 1), (a, k, out) => {
    const p = curve.getPointAt(k);
    const t = curve.getTangentAt(k);
    const w = across(k, t).normalize();
    const n = new Vector3().crossVectors(t, w).normalize();
    const [ca, cs] = corner(a);
    return out.copy(p).addScaledVector(w, (ca * width(k)) / 2).addScaledVector(n, (cs * thickness) / 2);
  }, (a) => (Math.sin(2 * Math.PI * a) < -0.3 && Math.abs(Math.cos(2 * Math.PI * a)) < faceWidth ? outColour : edgeColour));
}

/** One part as geometry. */
export function aetherGeometry(part: KitPart): BufferGeometry {
  if (part.kind !== 'surface') return primitiveGeometry(part);
  const body = new Color(C.body);
  const lid = new Color(C.lid);
  const panel = new Color(C.panel);
  const black = new Color(C.harness);
  const pad = new Color(C.pad);
  const colour = new Color(part.colour);
  if (part.surface === 'body') {
    const p = part.params as { around: number; up: number };
    const { y0, y1 } = P.pocket;
    return gridSurface(steps(0, 1, p.around + 1), steps(0, 1, p.up + 1), (u, v, out) => bodyPoint(u, v, out), (u, _v, q) => {
      // The lid: from its lower edge (lower at the front) to the top.
      const front = Math.max(0, Math.sin(2 * Math.PI * u));
      const edge = P.lid.back + (P.lid.front - P.lid.back) * front;
      if (q.y >= edge) return lid;
      // The darker panel across the front, between the lid and the pocket, and the pocket's border.
      // The darker panel across the upper front, between the lid and the pocket, its left edge slanting up from the
      // pocket's top left corner; and the pocket's border.
      const { x0, x1 } = P.pocket;
      const onFront = front > 0.75;
      if (onFront && q.y > y1 - 0.01 && q.x > x0 + (q.y - y1) * 0.55) return panel;
      const inPocket = q.x > x0 && q.x < x1 && q.y > y0 && q.y < y1 && front > 0.5;
      if (inPocket && (q.x < x0 + 0.012 || q.x > x1 - 0.012 || q.y < y0 + 0.012)) return panel;
      return body;
    }, true);
  }
  if (part.surface === 'backPanel') {
    // An arched mesh panel over the back, standing a little proud of it.
    const { y0, y1, halfWidth, bulge } = P.backPanel;
    return gridSurface(steps(0, 1, 13), steps(0, 1, 17), (s, t, out) => {
      const x = (s - 0.5) * 2 * halfWidth;
      const y = y0 + (y1 - y0) * t;
      const back = section(y).b;
      const arch = Math.sin(Math.PI * s) ** 0.6 * Math.sin(Math.PI * t) ** 0.5;
      return out.set(x, y, back - 0.01 - bulge * arch);
    }, () => black);
  }
  if (part.surface === 'shoulderStrap') {
    const side = (part.params as { side: 'right' | 'left' }).side === 'right' ? 1 : -1;
    // Its width across, square to the path and level with the ground where it can be.
    // The outer face blue down its middle, its edges and the side against the wearer black.
    return paddedBand(strapCurve(side), (k) => P.strapWidth * (0.75 + 0.25 * Math.sin(Math.PI * Math.min(1, k * 1.2))), P.strapThickness, (_k, t) => new Vector3(1, 0, 0).addScaledVector(t, -t.x), new Color(C.strapFace), pad, 28, 0.45);
  }
  if (part.surface === 'hipBelt') {
    // Upright across its height, square to the path; blue outside on the wings (their pockets), black padding elsewhere.
    const curve = hipBeltCurve();
    const g = paddedBand(curve, (k) => P.hipBeltHeight * (1 - 0.35 * Math.abs(2 * k - 1) ** 2), P.hipBeltThickness, () => new Vector3(0, 1, 0), pad, pad, 40);
    const position = g.getAttribute('position');
    const colours = g.getAttribute('color');
    for (let i = 0; i < position.count; i++) {
      // The wings' last stretch, outside: the hip-belt pockets.
      const x = Math.abs(position.getX(i));
      if (x > 0.2) colours.setXYZ(i, body.r, body.g, body.b);
    }
    return g;
  }
  if (part.surface === 'band') {
    const { u0, y0, u1, y1, width } = part.params as { u0: number; y0: number; u1: number; y1: number; width: number };
    const v0 = V(y0);
    const v1 = V(y1);
    return gridSurface(steps(0, 1, 3), steps(0, 1, 13), (s, k, out) => {
      const u = u0 + (u1 - u0) * k;
      const v = v0 + (v1 - v0) * k;
      const p = onBody(u, v, 0.003);
      const ahead = onBody(u + (u1 - u0) * 0.01, v + (v1 - v0) * 0.01, 0.003);
      const n = bodyNormal(u, v);
      const w = new Vector3().crossVectors(ahead.sub(p).normalize(), n).normalize();
      return out.copy(p).addScaledVector(w, (s - 0.5) * width);
    }, () => colour);
  }
  if (part.surface === 'mark') {
    const { x, y, width, height } = part.params as { x: number; y: number; width: number; height: number };
    return gridSurface(steps(0, 1, 5), steps(0, 1, 3), (s, t, out) => {
      const yy = y + (t - 0.5) * height;
      return out.copy(onBody(frontU(x + (s - 0.5) * width, yy), V(yy), 0.0025));
    }, () => colour, true);
  }
  if (part.surface === 'strip') {
    const { points, width } = part.params as { points: [number, number][]; width: number };
    const on = points.map(([x, y]) => onBody(frontU(x, y), V(y), 0.0025));
    const normals = points.map(([x, y]) => bodyNormal(frontU(x, y), V(y)));
    return gridSurface(steps(0, 1, 3), steps(0, 1, points.length), (s, k, out) => {
      const i = Math.round(k * (points.length - 1));
      const along = on[Math.min(i + 1, on.length - 1)].clone().sub(on[Math.max(i - 1, 0)]).normalize();
      const across = new Vector3().crossVectors(along, normals[i]).normalize();
      return out.copy(on[i]).addScaledVector(across, (s - 0.5) * width);
    }, () => colour);
  }
  throw new Error(`aether: no ${part.surface} surface`);
}

/** The pack as one geometry per mesh: the fabric (bag, lid, pocket), the harness (back panel, straps, hip belt) and the trim (webbing, buckles, cords, marks). */
export function buildAether(parts = aetherParts()) {
  return mergeByMesh(parts, aetherGeometry);
}

