// The Zorali SummitSeeker 2P, rebuilt from its four product photos and its
// listed dimensions (220 cm long, 130 cm wide at the head and 105 cm at the
// foot, 110 cm high) through the img2threejs pipeline (CONTENT.md, "Models").
// Geometry only, in the tent's own frame: the floor at y 0, the long axis
// along x with the head at -x, the near door and vestibule toward +z.
//
// Built the way the tent is pitched. Two poles run corner to corner, each a
// flexed arch, and cross over the middle. The brow pole arches across the
// crown from one door's top to the other's. The inner tent hangs inside the
// poles from its clips, its door tops pulled out to the brow pole's tips. The
// fly is pulled taut over all of it, so its shape is the tightest skin over
// the frame and its pegs: the poles, the brow pole, the corner tabs, the
// vestibules' stakes and the vents' props (a convex hull). That's what makes
// the flat panels and straight edges the photos show.
//
// Every part is described first (`summitSeekerParts`) and only then built,
// so the review renders, the pipeline's spec and the camp all read the same
// numbers.
import {
  BoxGeometry,
  BufferGeometry,
  CapsuleGeometry,
  CatmullRomCurve3,
  Color,
  CylinderGeometry,
  Float32BufferAttribute,
  Matrix4,
  Quaternion,
  Ray,
  SphereGeometry,
  TubeGeometry,
  Vector3,
} from 'three';
import { ConvexHull } from 'three/addons/math/ConvexHull.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export type Vec3 = [number, number, number];
type Quat = [number, number, number, number];

/** The tent's four meshes: the fly (ghosted to look inside), the inner's solid parts, its mesh canopy, and the frame. */
export type TentMesh = 'fly' | 'body' | 'canopy' | 'frame';

type PartBase = { id: string; mesh: TentMesh; colour: string };
export type Part = PartBase &
  (
    | { kind: 'hull'; supports: Vec3[]; hem: number; vent: { colour: string; below: number } }
    | { kind: 'inner'; from: number; to: number; rings: number; apex: boolean; band?: { below: number; colour: string }; heights?: number[] }
    | { kind: 'floor'; y: number }
    | { kind: 'tube'; points: Vec3[]; radius: number; closed: boolean; radial: number; tubular: number }
    | { kind: 'box'; position: Vec3; quaternion: Quat; size: Vec3 }
    | { kind: 'cylinder'; position: Vec3; quaternion: Quat; radius: number; height: number }
    | { kind: 'capsule'; position: Vec3; quaternion: Quat; radius: number; length: number }
    | { kind: 'sphere'; position: Vec3; radius: number }
    | { kind: 'tri'; points: [Vec3, Vec3, Vec3] }
  );

// ---------------------------------------------------------------- dimensions

export const SUMMITSEEKER = {
  halfLength: 1.1,
  headHalfWidth: 0.65,
  footHalfWidth: 0.525,
  /** The main poles: their arch's height at the middle, its shape (y = height (1 - |u|^shape): 2 a parabola, higher flatter on top, fitted to the side and end photos), and their radius (7.9 mm poles, drawn a little fat to read at a distance). */
  poleHeight: 1.075,
  poleShape: 2.3,
  poleRadius: 0.0055,
  /** The brow pole: across the crown at the crossing, its tips at the door tops. */
  browHalf: 0.55,
  browTip: 0.98,
  browRise: 0.115,
  /** The fly: its hem's height, how far it stands off the poles, how far the vestibules reach. */
  hem: 0.085,
  standoff: 0.014,
  vestibule: 1.32,
  /** How far the inner's clips hold it inside the poles, and how high its solid band and bathtub run. */
  clipDepth: 0.006,
  bandTop: 0.24,
  tubTop: 0.085,
};
const S = SUMMITSEEKER;

/** Colours (sRGB), sampled from the photos: material-evidence in the pipeline's workspace. */
export const SUMMITSEEKER_COLOURS = {
  fly: '#2f7391',
  vent: '#21505f',
  piping: '#c98d45',
  binding: '#b4813f',
  toggle: '#d9862b',
  cord: '#c99a52',
  mark: '#dfe8ea',
  band: '#467686',
  floor: '#a86b35',
  zip: '#e7bd2a',
  mesh: '#d2ccc7',
  seam: '#8f8a84',
  pole: '#9b2335',
  clip: '#1b1b1d',
  stake: '#b9bdc2',
  strap: '#b8452f',
};
const C = SUMMITSEEKER_COLOURS;

const UP = new Vector3(0, 1, 0);
const round = (x: number) => Math.round(x * 1e5) / 1e5;
const v3 = (p: Vector3): Vec3 => [round(p.x), round(p.y), round(p.z)];
const quat = (q: Quaternion): Quat => [round(q.x), round(q.y), round(q.z), round(q.w)];
/** A rotation taking +y to `dir`. */
const along = (dir: Vector3) => new Quaternion().setFromUnitVectors(UP, dir.clone().normalize());
function smoothstep(a: number, b: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

// ---------------------------------------------------------------- the frame

/** The four corners, where the poles' feet sit: head-near, foot-near, foot-far, head-far. */
const FEET = {
  headNear: new Vector3(-S.halfLength, 0, S.headHalfWidth),
  footNear: new Vector3(S.halfLength, 0, S.footHalfWidth),
  footFar: new Vector3(S.halfLength, 0, -S.footHalfWidth),
  headFar: new Vector3(-S.halfLength, 0, -S.headHalfWidth),
};

/** A main pole at u in [-1, 1]: pole A runs head-near to foot-far, pole B head-far to foot-near. */
export function polePoint(pole: 'a' | 'b', u: number, out = new Vector3()) {
  const [from, to] = pole === 'a' ? [FEET.headNear, FEET.footFar] : [FEET.headFar, FEET.footNear];
  out.lerpVectors(from, to, (u + 1) / 2);
  out.y = S.poleHeight * Math.max(0, 1 - Math.abs(u) ** S.poleShape);
  return out;
}

/** The pole's normal in its own (vertical) plane, away from the arch's inside. */
export function poleNormal(pole: 'a' | 'b', u: number, out = new Vector3()) {
  const e = 1e-3;
  const t = polePoint(pole, Math.min(1, u + e)).sub(polePoint(pole, Math.max(-1, u - e))).normalize();
  const across = new Vector3().crossVectors(UP, t).normalize();
  out.crossVectors(t, across).normalize();
  if (out.y < 0) out.negate();
  return out;
}

/** Where the pole's arm reaches height y: u for the head end's arm is negative. */
function armU(y: number) {
  return Math.max(0, 1 - Math.min(y, S.poleHeight) / S.poleHeight) ** (1 / S.poleShape);
}

/** The four arms at height y (head-near, foot-near, foot-far, head-far), each pushed along its normal by `offset`. */
function arms(y: number, offset: number) {
  const u = armU(y);
  const at = (pole: 'a' | 'b', w: number) => polePoint(pole, w).addScaledVector(poleNormal(pole, w), offset);
  return [at('a', -u), at('b', u), at('a', u), at('b', -u)];
}

/** Where the poles cross: the diagonals of a tapered floor cross a little toward its narrow end. */
const CROSSING_U = (() => {
  const t = S.headHalfWidth / (S.headHalfWidth + S.footHalfWidth);
  return 2 * t - 1;
})();
const BROW_X = round(polePoint('a', CROSSING_U).x);

/** The brow pole's centre line, tip to tip (far to near), at the crossing. */
function browLine(count = 17) {
  const points: Vector3[] = [];
  for (let i = 0; i < count; i++) {
    const w = -1 + (2 * i) / (count - 1);
    points.push(new Vector3(BROW_X, S.browTip + S.browRise * (1 - w * w) ** 0.8, w * S.browHalf));
  }
  return points;
}

// ---------------------------------------------------------------- the inner tent

/** Its door tops, pulled out toward the brow pole's tips: how far, by height. */
function doorPull(y: number) {
  return 0.3 * smoothstep(0.25, 1.0, y) * (1 - smoothstep(1.02, S.poleHeight - 0.01, y));
}
const DOOR_PULL_HALF = 0.62;

/** The inner tent's ring at height y: a quadrilateral through its four corners (inside the poles), sides bowed a little, door tops pulled out. */
export function innerRing(y: number, quarter: number) {
  const corners = arms(y, -(S.poleRadius + S.clipDepth));
  const points: Vector3[] = [];
  // Sides in order: near (head-near to foot-near), foot end, far, head end. The long sides bow a little, the door tops much more.
  const bow = [0.035, 0.03, 0.035, 0.03];
  for (let side = 0; side < 4; side++) {
    const a = corners[side];
    const b = corners[(side + 1) % 4];
    const outward = new Vector3().subVectors(b, a).cross(UP).normalize().negate();
    for (let i = 0; i < quarter; i++) {
      const t = i / quarter;
      const p = new Vector3().lerpVectors(a, b, t);
      let push = bow[side] * 4 * t * (1 - t) * (1 - smoothstep(0.7, S.poleHeight, y));
      if (side % 2 === 0) {
        const k = Math.max(0, 1 - Math.abs(p.x - BROW_X) / DOOR_PULL_HALF);
        push += doorPull(y) * k ** 1.5;
      }
      points.push(p.addScaledVector(outward, push));
    }
  }
  return points;
}

/** The inner's long side at (x, y) on the near side (mirror z for the far one), by sampling its ring. */
function innerSide(x: number, y: number) {
  const ring = innerRing(y, 64).slice(0, 64);
  let best = ring[0];
  for (const p of ring) if (Math.abs(p.x - x) < Math.abs(best.x - x)) best = p;
  return best.clone();
}

function innerGeometry(from: number, to: number, rings: number, apex: boolean, band?: { below: number; colour: string }, colour = '#ffffff', heights?: number[]) {
  const quarter = 28;
  const segments = quarter * 4;
  const positions: number[] = [];
  const colours: number[] = [];
  const uvs: number[] = [];
  const index: number[] = [];
  const base = new Color(colour);
  const lip = band ? new Color(band.colour) : base;
  const push = (p: Vector3, u: number, v: number) => {
    positions.push(p.x, p.y, p.z);
    uvs.push(u, v);
    const c = band && p.y < band.below ? lip : base;
    colours.push(c.r, c.g, c.b);
  };
  const steps = apex ? rings : rings - 1;
  if (heights) rings = heights.length;
  for (let k = 0; k < rings; k++) {
    // Rings closer together near the top, where the corners turn in fastest.
    const f = k / (heights ? rings - 1 : steps);
    const y = heights ? heights[k] : from + (to - from) * (apex ? 1 - (1 - f) ** 1.35 : f);
    const ring = innerRing(y, quarter);
    ring.forEach((p, j) => push(p, j / segments, f));
    push(ring[0], 1, f);
  }
  const row = segments + 1;
  for (let k = 0; k < rings - 1; k++) {
    for (let j = 0; j < segments; j++) {
      const a = k * row + j;
      const b = a + row;
      index.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  if (apex) {
    const top = positions.length / 3;
    push(new Vector3(BROW_X, to, 0), 0.5, 1);
    const k = (rings - 1) * row;
    for (let j = 0; j < segments; j++) index.push(k + j, top, k + j + 1);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('color', new Float32BufferAttribute(colours, 3));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  return geometry;
}

function floorGeometry(y: number) {
  const ring = innerRing(0, 28);
  const positions = [0, y, 0];
  const uvs = [0.5, 0.5];
  const index: number[] = [];
  ring.forEach((p) => {
    positions.push(p.x, y, p.z);
    uvs.push(0.5 + p.x / 2.4, 0.5 + p.z / 2.4);
  });
  for (let j = 0; j < ring.length; j++) index.push(0, ((j + 1) % ring.length) + 1, j + 1);
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  return geometry;
}

// ---------------------------------------------------------------- the fly

/** The fly's supports: everything it's pulled taut over. */
export function flySupports() {
  const supports: Vector3[] = [];
  const lift = S.poleRadius + S.standoff;
  for (const pole of ['a', 'b'] as const) {
    for (let i = 0; i <= 60; i++) {
      const u = -0.985 + (1.97 * i) / 60;
      const p = polePoint(pole, u);
      if (p.y < S.hem + 0.03) continue;
      supports.push(p.addScaledVector(poleNormal(pole, u), lift));
    }
  }
  for (const p of browLine(13)) supports.push(p.clone().add(new Vector3(0, lift, Math.sign(p.z) * lift * 0.6)));
  // The corner tabs, just outside the poles' feet, at the hem.
  for (const foot of Object.values(FEET)) supports.push(new Vector3(foot.x * 1.018, S.hem, foot.z + Math.sign(foot.z) * 0.025));
  // Each vestibule's stake point, on the brow pole's line.
  for (const side of [1, -1]) supports.push(new Vector3(BROW_X, S.hem, side * S.vestibule));
  // Each vent's prop, holding its visor out over the end's top.
  for (const end of [1, -1]) {
    const [hn, fn, ff, hf] = arms(0.94, lift);
    const mid = end > 0 ? fn.clone().add(ff).multiplyScalar(0.5) : hn.clone().add(hf).multiplyScalar(0.5);
    supports.push(mid.add(new Vector3(end * 0.15, 0.03, 0)));
  }
  return supports;
}

type Triangle = { a: Vector3; b: Vector3; c: Vector3; n: Vector3 };

/** The hull's faces as triangles, the bottom one (at the hem) left open. */
export function hullTriangles(supports: Vector3[], hem: number): Triangle[] {
  const hull = new ConvexHull().setFromPoints(supports);
  const triangles: Triangle[] = [];
  for (const face of hull.faces) {
    if (face.normal.y < -0.95 && face.midpoint.y < hem + 0.01) continue;
    const e = face.edge;
    triangles.push({ a: e.head().point.clone(), b: e.next.head().point.clone(), c: e.next.next.head().point.clone(), n: face.normal.clone() });
  }
  return triangles;
}

/** The fly: the hull, with normals smoothed across the shallow folds along the poles but kept sharp at the panels' creases. */
function flyGeometry(part: Extract<Part, { kind: 'hull' }>) {
  const triangles = hullTriangles(part.supports.map((p) => new Vector3(...p)), part.hem);
  const key = (p: Vector3) => `${Math.round(p.x * 1e4)},${Math.round(p.y * 1e4)},${Math.round(p.z * 1e4)}`;
  const byVertex = new Map<string, { n: Vector3; area: number }[]>();
  for (const t of triangles) {
    const area = new Vector3().subVectors(t.b, t.a).cross(new Vector3().subVectors(t.c, t.a)).length() / 2;
    for (const p of [t.a, t.b, t.c]) {
      const list = byVertex.get(key(p)) ?? [];
      list.push({ n: t.n, area });
      byVertex.set(key(p), list);
    }
  }
  const crease = Math.cos((24 * Math.PI) / 180);
  const positions: number[] = [];
  const normals: number[] = [];
  const colours: number[] = [];
  const uvs: number[] = [];
  const fabric = new Color(part.colour);
  const vent = new Color(part.vent.colour);
  const n = new Vector3();
  for (const t of triangles) {
    // Under each vent's visor, facing down: the vent's shadowed mouth.
    const mid = t.a.clone().add(t.b).add(t.c).multiplyScalar(1 / 3);
    const c = t.n.y < part.vent.below && mid.y > 0.75 && Math.abs(mid.z) < 0.3 ? vent : fabric;
    for (const p of [t.a, t.b, t.c]) {
      n.set(0, 0, 0);
      for (const f of byVertex.get(key(p))!) if (f.n.dot(t.n) > crease) n.addScaledVector(f.n, f.area);
      n.normalize();
      positions.push(p.x, p.y, p.z);
      normals.push(n.x, n.y, n.z);
      colours.push(c.r, c.g, c.b);
      uvs.push(0.5 + p.x / 2.6, p.y / 1.2);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('color', new Float32BufferAttribute(colours, 3));
  return geometry;
}

/** Where a ray from outside first meets the fly, and the face's normal there. */
function onFly(triangles: Triangle[], toward: Vector3, from: Vector3) {
  const ray = new Ray(from, toward.clone().sub(from).normalize());
  const hit = new Vector3();
  let best = Infinity;
  let normal = new Vector3();
  const point = new Vector3();
  for (const t of triangles) {
    if (ray.intersectTriangle(t.a, t.b, t.c, true, hit)) {
      const d = hit.distanceTo(from);
      if (d < best) {
        best = d;
        point.copy(hit);
        normal = t.n.clone();
      }
    }
  }
  if (best === Infinity) return null;
  return { point, normal };
}

// ---------------------------------------------------------------- the parts

/** Points evenly spaced along a polyline. */
function resample(points: Vector3[], count: number) {
  const lengths = [0];
  for (let i = 1; i < points.length; i++) lengths.push(lengths[i - 1] + points[i].distanceTo(points[i - 1]));
  const total = lengths[lengths.length - 1];
  const out: Vector3[] = [];
  for (let k = 0; k < count; k++) {
    const target = (k / (count - 1)) * total;
    let i = 0;
    while (i < points.length - 2 && lengths[i + 1] < target) i++;
    const f = (target - lengths[i]) / Math.max(1e-9, lengths[i + 1] - lengths[i]);
    out.push(points[i].clone().lerp(points[i + 1], f));
  }
  return out;
}

/**
 * Everything the tent is made of, described: the pipeline's spec is written
 * from this list and the camp builds its four meshes from it.
 */
export function summitSeekerParts(): Part[] {
  const parts: Part[] = [];
  const r = S.poleRadius;
  const tube = (id: string, mesh: TentMesh, colour: string, points: Vector3[], radius: number, closed = false, radial = 5, tubular = 0) =>
    parts.push({ id, mesh, colour, kind: 'tube', points: points.map(v3), radius, closed, radial, tubular: tubular || Math.max(8, points.length * 3) });

  // The fly: one piece, both vestibules and both vents' visors, taut over the frame.
  const supports = flySupports();
  parts.push({ id: 'fly', mesh: 'fly', colour: C.fly, kind: 'hull', supports: supports.map(v3), hem: S.hem, vent: { colour: C.vent, below: -0.25 } });
  const fly = hullTriangles(supports, S.hem);

  // The inner: bathtub floor, the solid band, then the mesh canopy.
  const innerTop = arms(S.poleHeight, -(r + S.clipDepth))[0].y;
  parts.push({ id: 'floor-tub', mesh: 'body', colour: C.floor, kind: 'floor', y: 0.004 });
  // Two rings a millimetre apart at the bathtub's top, so its tan meets the teal at a seam, not a blur.
  const bandHeights = [0, S.tubTop - 0.0005, S.tubTop + 0.0005, (S.tubTop + S.bandTop) / 2, S.bandTop];
  parts.push({ id: 'inner-band', mesh: 'body', colour: C.band, kind: 'inner', from: 0, to: S.bandTop, rings: bandHeights.length, apex: false, band: { below: S.tubTop, colour: C.floor }, heights: bandHeights });
  parts.push({ id: 'inner-mesh', mesh: 'canopy', colour: C.mesh, kind: 'inner', from: S.bandTop, to: innerTop - 0.004, rings: 18, apex: true });

  // The poles: corner to corner, crossing at the hub; the brow pole across the crown.
  for (const pole of ['a', 'b'] as const) {
    const points: Vector3[] = [];
    for (let i = 0; i <= 80; i++) points.push(polePoint(pole, -1 + (2 * i) / 80));
    // Into the corner grommets, a little below the floor line.
    const foot = (p: Vector3, next: Vector3) => p.clone().addScaledVector(p.clone().sub(next).normalize(), 0.012);
    tube(`pole-main-${pole}`, 'frame', C.pole, [foot(points[0], points[1]), ...points, foot(points[80], points[79])], r, false, 6, 110);
  }
  const brow = browLine();
  tube('pole-brow', 'frame', C.pole, brow, r, false, 6, 48);
  const hub = polePoint('a', CROSSING_U);
  const browBottom = brow[8].y - r;
  parts.push({ id: 'pole-hub', mesh: 'frame', colour: C.clip, kind: 'cylinder', position: [BROW_X, round((hub.y - r - 0.004 + browBottom) / 2), 0], quaternion: [0, 0, 0, 1], radius: 0.014, height: round(browBottom - hub.y + r + 0.004) });
  for (const [i, end] of [brow[0], brow[brow.length - 1]].entries()) {
    const next = i === 0 ? brow[1] : brow[brow.length - 2];
    const dir = end.clone().sub(next).normalize();
    parts.push({ id: `pole-brow-tip-${i === 0 ? 'far' : 'near'}`, mesh: 'frame', colour: C.clip, kind: 'cylinder', position: v3(end.clone().addScaledVector(dir, 0.008)), quaternion: quat(along(dir)), radius: r + 0.0025, height: 0.024 });
  }
  for (const pole of ['a', 'b'] as const) {
    for (const [k, u] of [-1, 1].entries()) {
      const p = polePoint(pole, u);
      const dir = p.clone().sub(polePoint(pole, u * 0.97)).normalize();
      parts.push({ id: `pole-foot-${pole}${k}`, mesh: 'frame', colour: C.clip, kind: 'cylinder', position: v3(p.addScaledVector(dir, -0.004)), quaternion: quat(along(dir)), radius: r + 0.002, height: 0.03 });
    }
  }
  // Clips holding the inner to the main poles: four up each arm.
  for (const pole of ['a', 'b'] as const) {
    for (const [arm, sign] of [[0, -1], [1, 1]] as const) {
      for (const [k, y] of [0.3, 0.52, 0.72, 0.9].entries()) {
        const u = sign * armU(y);
        const p = polePoint(pole, u);
        const n = poleNormal(pole, u);
        const t = polePoint(pole, u + 0.01).sub(polePoint(pole, u - 0.01)).normalize();
        const basis = new Matrix4().makeBasis(new Vector3().crossVectors(n, t).normalize(), n, t);
        parts.push({ id: `pole-clip-${pole}${arm}-${k}`, mesh: 'frame', colour: C.clip, kind: 'box', position: v3(p.addScaledVector(n, -r * 1.2)), quaternion: quat(new Quaternion().setFromRotationMatrix(basis)), size: [0.013, 0.012, 0.026] });
      }
    }
  }

  // The fly's trim: the hem binding, each vestibule door's piping (up the poles and across under the crown), the toggles and cords, and the mark.
  {
    const hemEdges: [Vector3, Vector3][] = [];
    for (const t of fly) {
      for (const [a, b] of [[t.a, t.b], [t.b, t.c], [t.c, t.a]] as const) {
        if (a.y < S.hem + 0.002 && b.y < S.hem + 0.002) hemEdges.push([a, b]);
      }
    }
    // Walk the open edge loop round the hem.
    const k = (p: Vector3) => `${Math.round(p.x * 1e4)},${Math.round(p.z * 1e4)}`;
    const next = new Map<string, Vector3>();
    for (const [a, b] of hemEdges) next.set(k(a), b);
    const start = hemEdges[0][0];
    const loop: Vector3[] = [start];
    for (let p = next.get(k(start)); p && k(p) !== k(start) && loop.length < 64; p = next.get(k(p))) loop.push(p);
    const dense: Vector3[] = [];
    loop.forEach((p, i) => {
      const q = loop[(i + 1) % loop.length];
      for (let j = 0; j < 8; j++) dense.push(p.clone().lerp(q, j / 8));
    });
    const centre = new Vector3(BROW_X, S.hem, 0);
    tube('fly-hem-binding', 'fly', C.binding, dense.map((p) => p.clone().add(p.clone().sub(centre).setY(0).normalize().multiplyScalar(0.004)).setY(S.hem - 0.002)), 0.0055, true, 4, 160);
  }
  // Each vestibule's door is its head-side face: piped up the ridge from the stake to the brow pole's tip, across under the crown to the head arm, and down the arm to the corner.
  const browTips = [brow[brow.length - 1], brow[0]];
  for (const side of [1, -1] as const) {
    const lift = r + S.standoff;
    const stakeAt = new Vector3(BROW_X, S.hem + 0.008, side * S.vestibule);
    const tip = browTips[side > 0 ? 0 : 1].clone().add(new Vector3(0, lift, side * lift * 0.6));
    const ridge: Vector3[] = [];
    for (let i = 0; i <= 10; i++) ridge.push(stakeAt.clone().lerp(tip, i / 10));
    const [pole, sign] = side > 0 ? (['a', -1] as const) : (['b', -1] as const);
    const arm: Vector3[] = [];
    for (let i = 0; i <= 14; i++) {
      const y = 0.95 - (0.95 - S.hem - 0.01) * (i / 14);
      const u = sign * armU(y);
      arm.push(polePoint(pole, u).addScaledVector(poleNormal(pole, u), lift));
    }
    // Round the door's two top corners, as the photo's D: a curve from 14 cm before each corner to 14 cm after it.
    const fillet = (a: Vector3, corner: Vector3, b: Vector3, size: number) => {
      const from = corner.clone().addScaledVector(a.clone().sub(corner).normalize(), size);
      const to = corner.clone().addScaledVector(b.clone().sub(corner).normalize(), size);
      const curve: Vector3[] = [];
      for (let i = 0; i <= 8; i++) {
        const t = i / 8;
        curve.push(from.clone().multiplyScalar((1 - t) ** 2).addScaledVector(corner, 2 * t * (1 - t)).addScaledVector(to, t * t));
      }
      return curve;
    };
    const keep = (points: Vector3[], from: Vector3, to: Vector3, size: number) => points.filter((p) => p.distanceTo(from) > size && p.distanceTo(to) > size);
    const bend = 0.14;
    const top = [0.2, 0.4, 0.6, 0.8].map((t) => tip.clone().lerp(arm[0], t));
    const outline = [
      ...keep(ridge, tip, tip, bend),
      ...fillet(stakeAt, tip, arm[0], bend),
      ...keep(top, tip, arm[0], bend),
      ...fillet(tip, arm[0], arm[arm.length - 1], bend),
      ...keep(arm, arm[0], arm[0], bend),
    ].map((p) => {
      const hit = onFly(fly, p, p.clone().add(new Vector3(-0.2, 0.25, side * 1.2)));
      return hit ? hit.point.addScaledVector(hit.normal, 0.006) : p;
    });
    tube(`fly-door-piping-${side > 0 ? 'near' : 'far'}`, 'fly', C.piping, resample(outline, 64), 0.005, false, 4, 84);
  }
  const onEnd = (end: 1 | -1, z: number, y: number, lift: number) => {
    const hit = onFly(fly, new Vector3(0, y, z), new Vector3(end * 3, y, z));
    return hit ? hit.point.addScaledVector(hit.normal, lift) : new Vector3(end, y, z);
  };
  for (const end of [1, -1] as const) {
    for (const zSide of [1, -1]) {
      const z = 0.29 * zSide;
      const name = `${end > 0 ? 'foot' : 'head'}-${zSide > 0 ? 'near' : 'far'}`;
      parts.push({ id: `fly-toggle-${name}`, mesh: 'fly', colour: C.toggle, kind: 'capsule', position: v3(onEnd(end, z, 0.66, 0.013)), quaternion: [0, 0, 0, 1], radius: 0.0065, length: 0.026 });
      tube(`fly-toggle-cord-${name}`, 'fly', C.cord, [0.685, 0.75, 0.81, 0.865].map((y, i) => onEnd(end, z * (1 + 0.05 * i), y, 0.005)), 0.0017, false, 3, 12);
    }
  }
  for (const end of [1, -1] as const) {
    // Each vent's mouth, in the visor's shadow: a dark triangle on the end, just under it.
    const [l, rr, t] = [onEnd(end, -0.24, 0.865, 0.003), onEnd(end, 0.24, 0.865, 0.003), onEnd(end, 0, 0.955, 0.003)];
    parts.push({ id: `fly-vent-${end > 0 ? 'foot' : 'head'}`, mesh: 'fly', colour: C.vent, kind: 'tri', points: [v3(l), v3(rr), v3(t)] });
  }
  {
    // The mark: a ridge line of mountains and a sun, no lettering.
    const ridge: [number, number][] = [[-0.16, 0.48], [-0.095, 0.48], [-0.055, 0.525], [-0.025, 0.5], [0.025, 0.558], [0.085, 0.488], [0.16, 0.488]];
    tube('fly-mark', 'fly', C.mark, ridge.map(([z, y]) => onEnd(-1, -z, y, 0.004)), 0.0035, false, 3, 28);
    parts.push({ id: 'fly-mark-sun', mesh: 'fly', colour: C.mark, kind: 'sphere', position: v3(onEnd(-1, -0.06, 0.58, 0.004)), radius: 0.009 });
    // And a small one low on the near vestibule's other face, by its stake.
    const small = ridge.map(([z, y]) => {
      const p = new Vector3(BROW_X + 0.32 + z * 0.45, 0.2 + (y - 0.48) * 0.45, 2);
      const hit = onFly(fly, p.clone().setZ(0), p);
      return hit ? hit.point.addScaledVector(hit.normal, 0.004) : p;
    });
    tube('fly-mark-small', 'fly', C.mark, small, 0.0022, false, 3, 20);
  }

  // The inner's trim: the yellow zips of both D doors, and the grey binding where the mesh panels meet.
  for (const side of [1, -1] as const) {
    // A D toward the head: its straight edge down from the brow pole's tip, its curve toward the head end.
    const zip: [number, number][] = [[0.42, 0.1], [0.12, 0.1], [-0.2, 0.1], [-0.36, 0.105], [-0.35, 0.3], [-0.3, 0.52], [-0.22, 0.7], [-0.1, 0.84], [0.0, 0.93], [BROW_X, 0.975]];
    tube(`inner-door-zip-${side > 0 ? 'near' : 'far'}`, 'body', C.zip, zip.map(([x, y]) => innerSide(x, y).add(new Vector3(0, 0, 0.004)).multiply(new Vector3(1, 1, side))), 0.0045, false, 4, 48);
  }
  for (const [k, [pole, sign]] of ([['a', -1], ['b', 1], ['a', 1], ['b', -1]] as const).entries()) {
    const seam: Vector3[] = [];
    for (let i = 0; i <= 14; i++) {
      const y = S.bandTop + (innerTop - 0.03 - S.bandTop) * (i / 14);
      const u = sign * armU(y);
      seam.push(polePoint(pole, u).addScaledVector(poleNormal(pole, u), -(r + S.clipDepth - 0.002)));
    }
    tube(`inner-mesh-seam-${k}`, 'body', C.seam, seam, 0.003, false, 3, 36);
  }

  // Guy-outs: a strap from each fly corner and each vestibule's tip down to a stake.
  const stake = (id: string, at: Vector3, away: Vector3) => {
    const lean = away.clone().setY(0).normalize().multiplyScalar(0.27).add(UP).normalize();
    parts.push({ id, mesh: 'frame', colour: C.stake, kind: 'cylinder', position: v3(at.clone().addScaledVector(lean, 0.01)), quaternion: quat(along(lean)), radius: 0.0035, height: 0.08 });
  };
  const guy = (name: string, hem: Vector3, out: number) => {
    const away = hem.clone().sub(new Vector3(BROW_X, hem.y, 0)).setY(0).normalize();
    const ground = hem.clone().setY(0.012).addScaledVector(away, out);
    const mid = hem.clone().lerp(ground, 0.5);
    mid.y -= 0.004;
    tube(`guy-strap-${name}`, 'frame', C.strap, [hem.clone().setY(hem.y - 0.005), mid, ground], 0.0022, false, 3, 6);
    stake(`stake-${name}`, ground, away);
  };
  for (const [name, foot] of Object.entries(FEET)) guy(name.replace(/([A-Z])/, '-$1').toLowerCase(), new Vector3(foot.x * 1.018, S.hem, foot.z + Math.sign(foot.z) * 0.025), 0.12);
  guy('vestibule-near', new Vector3(BROW_X, S.hem, S.vestibule), 0.1);
  guy('vestibule-far', new Vector3(BROW_X, S.hem, -S.vestibule), 0.1);
  return parts;
}

// ---------------------------------------------------------------- building

function coloured(geometry: BufferGeometry, colour: string) {
  const c = new Color(colour);
  const count = geometry.getAttribute('position').count;
  const values = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) values.set([c.r, c.g, c.b], i * 3);
  geometry.setAttribute('color', new Float32BufferAttribute(values, 3));
  return geometry;
}

/** One part as geometry, in the tent's frame, with its colour per vertex. */
export function partGeometry(part: Part): BufferGeometry {
  const place = (g: BufferGeometry, position: Vec3, quaternion: Quat) =>
    g.applyMatrix4(new Matrix4().compose(new Vector3(...position), new Quaternion(...quaternion), new Vector3(1, 1, 1)));
  switch (part.kind) {
    case 'hull':
      return flyGeometry(part);
    case 'inner':
      return innerGeometry(part.from, part.to, part.rings, part.apex, part.band, part.colour, part.heights);
    case 'floor':
      return coloured(floorGeometry(part.y), part.colour);
    case 'tube': {
      const curve = new CatmullRomCurve3(part.points.map((p) => new Vector3(...p)), part.closed, 'centripetal');
      return coloured(new TubeGeometry(curve, part.tubular, part.radius, part.radial, part.closed), part.colour);
    }
    case 'box':
      return coloured(place(new BoxGeometry(...part.size), part.position, part.quaternion), part.colour);
    case 'cylinder':
      return coloured(place(new CylinderGeometry(part.radius, part.radius, part.height, 8, 1), part.position, part.quaternion), part.colour);
    case 'capsule':
      return coloured(place(new CapsuleGeometry(part.radius, part.length, 3, 8), part.position, part.quaternion), part.colour);
    case 'sphere':
      return coloured(new SphereGeometry(part.radius, 8, 6).translate(...part.position), part.colour);
    case 'tri': {
      const g = new BufferGeometry();
      g.setAttribute('position', new Float32BufferAttribute(part.points.flat(), 3));
      g.setAttribute('uv', new Float32BufferAttribute([0, 0, 1, 0, 0.5, 1], 2));
      g.setIndex([0, 1, 2]);
      g.computeVertexNormals();
      return coloured(g, part.colour);
    }
  }
}

/** The tent as four geometries, one per mesh, each part's colour baked in per vertex. */
export function buildSummitSeeker(parts = summitSeekerParts()) {
  const groups: Record<TentMesh, BufferGeometry[]> = { fly: [], body: [], canopy: [], frame: [] };
  for (const part of parts) groups[part.mesh].push(partGeometry(part));
  const merged = {} as Record<TentMesh, BufferGeometry>;
  for (const mesh of Object.keys(groups) as TentMesh[]) {
    const list = groups[mesh];
    // The fly's hull comes unindexed (its creases need a normal per face), so a mesh holding it merges unindexed.
    const flat = list.some((g) => !g.index);
    const ready = flat ? list.map((g) => (g.index ? g.toNonIndexed() : g)) : list;
    const g = ready.length === 1 ? ready[0] : mergeGeometries(ready, false);
    if (!g) throw new Error(`summitseeker: could not merge the ${mesh} parts`);
    for (const part of new Set([...list, ...ready])) if (part !== g) part.dispose();
    merged[mesh] = g;
  }
  return merged;
}

/** Inside the tent, in its own frame: where the sleeping kit goes, and the headtorch's light. */
export const SUMMITSEEKER_INSIDE = {
  pad: new Vector3(-0.02, 0.004, -0.04),
  bed: new Vector3(0, 0.059, -0.04),
  pillow: new Vector3(-0.76, 0.104, -0.04),
  headtorch: new Vector3(BROW_X, 0.93, 0),
  light: new Vector3(BROW_X, 0.88, 0),
  /** The hotspot's anchor, over the crown. */
  anchor: new Vector3(BROW_X, S.browTip + S.browRise + 0.02, 0.15),
};
