// Harry's camp chair, the Alton Lightweight Camp Chair, rebuilt from its
// product photos and its size (50 x 52 x 67 cm) through the img2threejs
// pipeline. In its own frame: facing +z, its left (+x) and right (-x) as the
// sitter's, y up from the ground.
//
// The frame is a hub chair's: a hub under each side of the seat, joined by a
// cross bar; from each hub two legs splay down to a front and a rear foot,
// and two uprights rise to the sling's front corner and the backrest's top
// corner, so each side reads as an X. The sling hangs between the four
// upright tips: a patch whose edges are the front edge, the backrest's top
// and two side edges cut in between seat and back, sagging into a bucket.
import { CatmullRomCurve3, Color, Vector3, type BufferGeometry } from 'three';
import { along, gridSurface, mergeByMesh, primitiveGeometry, quat, round, smoothstep, steps, v3, type KitPart } from './kit-geometry';

// Every point here was measured on the three product photos: the frame's
// points solved together with the photos' cameras, the sling's corners, edges,
// seam, patch, cut-outs and pocket triangulated from them.
export const ALTON = {
  hubs: { x: 0.159, y: 0.19, z: 0.0 },
  feet: { x: 0.177, front: 0.17, rear: -0.124 },
  /** The upright tips, inside the sling's corner pockets. */
  front: { x: 0.245, y: 0.333, z: 0.207 },
  back: { x: 0.243, y: 0.655, z: -0.239 },
  pole: 0.0085,
  /** The sling's corners (the seat's front corners and the backrest's top corners), a few centimetres round the tips. */
  corners: { front: { x: 0.258, y: 0.36, z: 0.25 }, back: { x: 0.262, y: 0.675, z: -0.237 } },
  /**
   * How the sling sits a little skewed on its frame: the left front corner further forward than the
   * right, and the right top corner further forward than the left. The photos put them 3.7 and 5 cm
   * apart; about half of each is kept.
   */
  skew: { front: 0.011, back: 0.012 },
  /** How far its side edges bow outward between the corners. */
  bow: 0.02,
  /** Its centre line (y, z), front edge to top edge: through the front edge's middle, the seat's lowest point, the seat seam, the patch and the top edge's middle. */
  centre: [[0.338, 0.213], [0.275, 0.05], [0.382, -0.094], [0.601, -0.22], [0.68, -0.245]] as [number, number][],
  /** How a cross-section rises from the centre line to the side edges: gently across the centre panel, then sharply past its seams with the side panels (at these shares of the half-width, seat to top). */
  profile: { centre: 0.25, seams: [0.56, 0.74] as [number, number], power: 1.15 },
  /** The corners' radii: the backrest's top corners and the seat's front corners. */
  round: { top: 0.045, front: 0.02 },
  /** The two cut-outs between the seat and the side panels, up to the seam: centre (u across, v along) and half-sizes; teardrops, wider at the bottom. */
  holes: [[0.245, 0.386, 0.024, 0.119], [0.755, 0.386, 0.024, 0.119]] as [number, number, number, number][],
  /** The seam straight across the seat, between the cut-outs' tops: its v. */
  seam: 0.513,
  /** The mesh pocket on the right side: its top along the side edge (between these shares of the edge, front to back), hanging down and back square to it. */
  pocket: { from: 0.232, to: 0.635, depth: [0.12, 0.145] as [number, number] },
  /** The patch on the backrest: its centre (y, z) and size. */
  patch: { y: 0.601, z: -0.22, width: 0.096, height: 0.035 },
};
const A = ALTON;

/** As the photos show them (the sling's with its white grid averaged in). */
export const ALTON_COLOURS = {
  sling: '#858463',
  reinforcement: '#5e5f4a',
  binding: '#4c4f38',
  frame: '#1c1c1e',
  rubber: '#2b2b2a',
  pocket: '#5d583f',
  patch: '#1f1f22',
};
const C = ALTON_COLOURS;

const centreLine = new CatmullRomCurve3(A.centre.map(([y, z]) => new Vector3(0, y, z)), false, 'centripetal');
const edgePoint = new Vector3();
const midPoint = new Vector3();

/** A point along one of the sling's side edges (+1 left, -1 right), front corner (t 0) to top corner (t 1): straight in profile, bowing outward. */
function sideEdge(t: number, sign: 1 | -1, out = new Vector3()) {
  const f = A.corners.front;
  const b = A.corners.back;
  const fz = f.z + sign * A.skew.front;
  const bz = b.z - sign * A.skew.back;
  return out.set(sign * (f.x + (b.x - f.x) * t + A.bow * Math.sin(Math.PI * t)), f.y + (b.y - f.y) * t, fz + (bz - fz) * t);
}
/** A point on the sling at (u across from right to left, v from the front edge to the top): each cross-section runs from the centre line out to the side edges, flat across the seat and rising steeply into the side panels. */
export function slingPoint(u: number, v: number, out = new Vector3()) {
  [u, v] = roundCorners(u, v);
  const s = Math.abs(2 * u - 1);
  const t = Math.min(1, Math.max(0, v));
  const edge = sideEdge(t, u < 0.5 ? -1 : 1, edgePoint);
  const mid = centreLine.getPointAt(t, midPoint);
  const w = rise(s, t);
  return out.set(edge.x * s, mid.y + (edge.y - mid.y) * w, mid.z + (edge.z - mid.z) * w);
}
/** How far a cross-section has risen (0 on the centre line, 1 at the edge) at s across its half-width. */
function rise(s: number, v: number) {
  const { centre, seams, power } = A.profile;
  const s0 = seams[0] + (seams[1] - seams[0]) * smoothstep(0.35, 1, v);
  return centre * s * s + (1 - centre) * Math.max(0, (s - s0) / (1 - s0)) ** power;
}
const EDGE = Math.hypot(A.corners.back.y - A.corners.front.y, A.corners.back.z - A.corners.front.z);
/** (u, v) with the sling's four corners rounded: each corner's square of parameters mapped onto a quarter disc. */
function roundCorners(u: number, v: number): [number, number] {
  const top = v > 0.5;
  const r = top ? A.round.top : A.round.front;
  const rs = r / (top ? A.corners.back.x : A.corners.front.x);
  const rv = r / EDGE;
  const s = Math.abs(2 * u - 1);
  const a = (s - (1 - rs)) / rs;
  const b = top ? (v - (1 - rv)) / rv : (rv - v) / rv;
  if (a <= 0 || b <= 0) return [u, v];
  const s2 = 1 - rs + rs * a * Math.sqrt(1 - (b * b) / 2);
  const b2 = b * Math.sqrt(1 - (a * a) / 2);
  return [0.5 + (Math.sign(u - 0.5) * s2) / 2, top ? 1 - rv + rv * b2 : rv - rv * b2];
}
/** Where along the centre line (v) it passes nearest (y, z). */
function centreV(y: number, z: number) {
  let best = 0;
  let near = Infinity;
  for (let i = 0; i <= 400; i++) {
    const p = centreLine.getPointAt(i / 400, midPoint);
    const d = (p.y - y) ** 2 + (p.z - z) ** 2;
    if (d < near) [near, best] = [d, i / 400];
  }
  return best;
}
function inHole(u: number, v: number) {
  return A.holes.some(([cu, cv, ru, rv]) => {
    const dv = (v - cv) / rv;
    return dv * dv + ((u - cu) / (ru * (1 - 0.45 * dv))) ** 2 < 1;
  });
}

/** A straight tube from a to b (as a cylinder). */
function pole(id: string, a: Vector3, b: Vector3, radius: number, colour = C.frame): KitPart {
  const dir = b.clone().sub(a);
  return { id, mesh: 'frame', colour, kind: 'cylinder', position: v3(a.clone().add(b).multiplyScalar(0.5)), quaternion: quat(along(dir)), radius, height: round(dir.length()), radial: 8 };
}

/** Everything the chair is made of, described. */
export function altonParts(): KitPart[] {
  const parts: KitPart[] = [{ id: 'chair-sling', mesh: 'sling', colour: C.sling, kind: 'surface', surface: 'sling', params: { across: 33, up: 31 } }];
  const hub = (s: 1 | -1) => new Vector3(s * A.hubs.x, A.hubs.y, A.hubs.z);
  for (const s of [1, -1] as const) {
    const side = s > 0 ? 'left' : 'right';
    const h = hub(s);
    const footFront = new Vector3(s * A.feet.x, 0.012, A.feet.front);
    const footRear = new Vector3(s * A.feet.x, 0.012, A.feet.rear);
    const tipFront = new Vector3(s * A.front.x, A.front.y, A.front.z);
    const tipBack = new Vector3(s * A.back.x, A.back.y, A.back.z);
    // Each leg runs on into its rubber foot, to the ground.
    const toGround = (foot: Vector3) => foot.clone().addScaledVector(foot.clone().sub(h).normalize(), foot.y / Math.abs(foot.clone().sub(h).normalize().y));
    parts.push(pole(`chair-leg-front-${side}`, h, toGround(footFront), A.pole));
    parts.push(pole(`chair-leg-rear-${side}`, h, toGround(footRear), A.pole));
    parts.push(pole(`chair-upright-front-${side}`, h, tipFront, A.pole));
    parts.push(pole(`chair-upright-back-${side}`, h, tipBack, A.pole));
    // The hub: a block the five poles socket into.
    parts.push({ id: `chair-hub-${side}`, mesh: 'frame', colour: C.frame, kind: 'sphere', position: v3(h), radius: 0.022, scale: [1.1, 1, 1] });
    // Rubber feet: caps over the legs' ends, standing on the ground.
    for (const [end, foot] of [['front', footFront], ['rear', footRear]] as const) {
      const dir = foot.clone().sub(h).normalize();
      parts.push({ id: `chair-foot-${end}-${side}`, mesh: 'frame', colour: C.rubber, kind: 'cylinder', position: v3(foot.clone().addScaledVector(dir, 0.002)), quaternion: quat(along(dir)), radius: 0.013, radiusTop: 0.0105, height: 0.03, radial: 10 });
    }
    // The webbing pockets round each upright's tip, inside the sling's corner (the photos show none past it).
    for (const [end, tip] of [['front', tipFront], ['back', tipBack]] as const) {
      const dir = tip.clone().sub(h).normalize();
      parts.push({ id: `chair-pocket-${end}-${side}`, mesh: 'trim', colour: C.patch, kind: 'cylinder', position: v3(tip.clone().addScaledVector(dir, -0.024)), quaternion: quat(along(dir)), radius: 0.012, radiusTop: 0.0105, height: 0.034, radial: 8 });
    }
  }
  parts.push(pole('chair-crossbar', hub(-1), hub(1), A.pole));
  parts.push({ id: 'chair-crossbar-joint', mesh: 'frame', colour: C.rubber, kind: 'cylinder', position: [0, A.hubs.y, A.hubs.z], quaternion: quat(along(new Vector3(1, 0, 0))), radius: A.pole + 0.003, height: 0.03, radial: 8 });

  // The sling's binding all round, the seam across the seat, the cut-outs' binding, the side pocket and the patch.
  const outline: Vector3[] = [];
  for (const v of steps(0, 1, 16)) outline.push(lift(0, v, 0));
  for (const u of steps(0, 1, 12).slice(1)) outline.push(lift(u, 1, 0));
  for (const v of steps(1, 0, 16).slice(1)) outline.push(lift(1, v, 0));
  for (const u of steps(1, 0, 12).slice(1, -1)) outline.push(lift(u, 0, 0));
  parts.push({ id: 'chair-binding', mesh: 'trim', colour: C.binding, kind: 'tube', points: outline.map(v3), radius: 0.005, closed: true, radial: 4, tubular: 120 });
  const [cu] = A.holes[0];
  parts.push({ id: 'chair-seat-seam', mesh: 'trim', colour: C.binding, kind: 'tube', points: steps(cu, 1 - cu, 12).map((u) => v3(lift(u, A.seam, 0.002))), radius: 0.0025, closed: false, radial: 3, tubular: 32 });
  for (const [k, hole] of A.holes.entries()) {
    const [hu, hv, ru, rv] = hole;
    const ring = steps(0, Math.PI * 2, 25).slice(0, -1).map((a) => {
      const dv = Math.sin(a);
      return v3(lift(hu + ru * (1 - 0.45 * dv) * Math.cos(a), hv + rv * dv, 0));
    });
    parts.push({ id: `chair-cutout-binding-${k ? 'left' : 'right'}`, mesh: 'trim', colour: C.binding, kind: 'tube', points: ring, radius: 0.004, closed: true, radial: 4, tubular: 48 });
  }
  parts.push({ id: 'chair-side-pocket', mesh: 'trim', colour: C.pocket, kind: 'surface', surface: 'pocket', params: {} });
  const rim = [...steps(0, 1, 8).map((s) => pocketPoint(s, 0)), ...steps(0, 1, 5).slice(1).map((t) => pocketPoint(1, t)), ...steps(1, 0, 8).slice(1).map((s) => pocketPoint(s, 1)), ...steps(1, 0, 5).slice(1, -1).map((t) => pocketPoint(0, t))];
  parts.push({ id: 'chair-side-pocket-binding', mesh: 'trim', colour: C.binding, kind: 'tube', points: rim.map(v3), radius: 0.004, closed: true, radial: 4, tubular: 64 });
  // The patch, where the photos put it on the backrest.
  const pv = centreV(A.patch.y, A.patch.z);
  const halfU = A.patch.width / (4 * sideEdge(pv, 1).x);
  const halfV = A.patch.height / (2 * centreLine.getLength());
  parts.push({ id: 'chair-patch', mesh: 'trim', colour: C.patch, kind: 'surface', surface: 'patch', params: { u0: round(0.5 - halfU), u1: round(0.5 + halfU), v0: round(pv - halfV), v1: round(pv + halfV) } });
  return parts;
}

/** A point on the sling at (u, v) lifted along its normal (toward the sitter) by `by`. */
function lift(u: number, v: number, by: number) {
  const e = 1e-3;
  const p = slingPoint(u, v);
  const n = new Vector3().crossVectors(slingPoint(Math.min(1, u + e), v).sub(slingPoint(Math.max(0, u - e), v)), slingPoint(u, Math.min(1, v + e)).sub(slingPoint(u, Math.max(0, v - e)))).normalize();
  return p.addScaledVector(n, by);
}

/** A point on the side pocket: s along its top (front to back), t down from the side edge, square to it, a little outside the sling. */
function pocketPoint(s: number, t: number, out = new Vector3()) {
  const f = A.corners.front;
  const b = A.corners.back;
  const d = new Vector3(0, b.y - f.y, b.z - f.z).normalize();
  sideEdge(A.pocket.from + (A.pocket.to - A.pocket.from) * s, -1, out);
  const depth = A.pocket.depth[0] + (A.pocket.depth[1] - A.pocket.depth[0]) * s;
  out.y += d.z * (0.008 + depth * t);
  out.z -= d.y * (0.008 + depth * t);
  // Hanging against the side panel, which slopes in below the edge.
  out.x += 0.004 - 0.03 * t * t;
  return out;
}

/** The sling's sample positions: even, and denser round the cut-outs. */
function slingSamples(count: number, around: [number, number][]) {
  const all = [...steps(0, 1, count), ...around.flatMap(([c, r]) => steps(c - 1.5 * r, c + 1.5 * r, 13))].filter((x) => x >= 0 && x <= 1);
  return [...new Set(all.map((x) => Math.round(x * 1e5) / 1e5))].sort((a, b) => a - b);
}

/** One part as geometry. */
export function altonGeometry(part: KitPart): BufferGeometry {
  if (part.kind !== 'surface') return primitiveGeometry(part);
  if (part.surface === 'sling') {
    const p = part.params as { across: number; up: number };
    const olive = new Color(C.sling);
    const darker = new Color(C.reinforcement);
    const g = gridSurface(
      slingSamples(p.across, A.holes.map(([hu, , ru]) => [hu, ru])),
      slingSamples(p.up, [[A.holes[0][1], A.holes[0][3]]]),
      (u, v, out) => slingPoint(u, v, out),
      // Darker reinforcement at the four corners, round the pockets the tips sit in.
      (u, v) => {
        const s = 1 - Math.abs(2 * u - 1);
        return s / 0.24 + (1 - v) / 0.17 < 1 || s / 0.22 + v / 0.16 < 1 ? darker : olive;
      },
    );
    // The cut-outs: leave out the triangles whose middle falls in either.
    const uv = g.getAttribute('uv');
    const index = g.index!.array;
    const kept: number[] = [];
    for (let i = 0; i < index.length; i += 3) {
      const u = (uv.getX(index[i]) + uv.getX(index[i + 1]) + uv.getX(index[i + 2])) / 3;
      const v = (uv.getY(index[i]) + uv.getY(index[i + 1]) + uv.getY(index[i + 2])) / 3;
      if (!inHole(u, v)) kept.push(index[i], index[i + 1], index[i + 2]);
    }
    g.setIndex(kept);
    return g;
  }
  if (part.surface === 'patch') {
    const { u0, u1, v0, v1 } = part.params as { u0: number; u1: number; v0: number; v1: number };
    const black = new Color(C.patch);
    return gridSurface(steps(0, 1, 4), steps(0, 1, 3), (s, t, out) => out.copy(lift(u0 + (u1 - u0) * s, v0 + (v1 - v0) * t, 0.0015)), () => black);
  }
  if (part.surface === 'pocket') {
    const mesh = new Color(C.pocket);
    return gridSurface(steps(0, 1, 8), steps(0, 1, 5), (s, t, out) => pocketPoint(s, t, out), () => mesh);
  }
  throw new Error(`alton: no ${part.surface} surface`);
}

/** The chair as one geometry per mesh: the sling, its trim (binding, pocket, patch, the tips' webbing pockets) and the frame. */
export function buildAlton(parts = altonParts()) {
  return mergeByMesh(parts, altonGeometry);
}

