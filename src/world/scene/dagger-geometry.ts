// The NEMO Dagger OSMO 3P, drawn in code from NEMO's product photos (on
// paddypallin.com.au: the pitched fly from two quarters, an end, and above;
// the inner on its poles from the side, an end and above) and its listed
// size: a 229 x 178 cm floor and 106 cm of headroom.
//
// How it stands: one hubbed pole. A spine runs the length of the roof, and
// at each end a hub splits it into two legs that arch down to the floor's
// corners, so each end of the frame is an arch across the width. A short
// cross pole rides over the middle of the spine and reaches out past both
// long walls; its tips lift the fly into an eave over each door. The fly
// goes over everything, so outside no pole shows: a lime ripstop shell, staked
// at the four corners and out to two stakes on each long side, where the
// vestibules make it an octagon from above. Each vestibule's door is zipped
// in a J from the eave down to a vestibule stake. The fly lifts off the
// ground at the ends, showing the inner's grey bathtub floor.
//
// Y up, metres, floor centred on the origin, long axis x, main door facing +z.
//
// Inferred (no photo shows it): where exactly the hubs sit along the spine
// (the top view foreshortens them), the cross pole's tip height, and the
// vestibule stakes' spacing (from the top view and the listed 1.1 m² each).
// The NEMO shield on each end is a plain shield, its N left out. Guy-lines,
// the inner's pockets and vents are left out.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const L = 1.145; // half length, x (229 cm)
const D = 0.89; // half width, z (178 cm)
const PEAK = 1.06; // the spine at its middle
// Where each end's hub splits the spine into two legs: close to the end (the top view's notches),
// low enough that the side view's arch runs smoothly corner to corner.
const HUB_X = 0.86, HUB_Y = 0.76;
const CROSS_Y = PEAK + 0.022; // the cross pole riding over the spine
const EAVE_Z = 0.86, EAVE_Y = 0.78; // the cross pole's tips, lifting the fly over each door
const POLE_R = 0.0045;
const CLEAR = 0.012; // pole centre to fly
// Vestibules: on each long side the fly is staked out to two points, this far
// either side of the middle and this far past the floor.
const STAKE_X = 0.45, VEST = 0.64;
const HEM = 0.03; // fly hem above the ground where staked
const END_LIFT = 0.27; // how high the hem arches at the middle of each end (the end view)
const SIDE_LIFT = 0.07; // and between stakes along the long sides
const TUB = 0.13; // the inner's bathtub floor
const INNER_GAP = 0.06; // the inner's roof under the fly

/** Half-width of the fly's footprint at x: the floor edge, out to the vestibule stakes. */
const hemZ = (x: number) => D + VEST * THREE.MathUtils.clamp((L - Math.abs(x)) / (L - STAKE_X), 0, 1);
/** The door's J zip in plan, from the eave (t 0) to the vestibule stake toward -x (t 1). */
const zipPlan = (t: number): [number, number] => [-STAKE_X * t * t, EAVE_Z + (D + VEST - EAVE_Z) * t];

const COLORS = {
  fly: '#8f8c34',
  seam: '#a3a043',
  inner: '#aab0b1',
  tub: '#55575a',
  pole: '#7b8084',
  cross: '#c6d33f', // the cross pole and the accents: NEMO's lime
  hub: '#4a4d50',
  zip: '#5d6063', // the grey storm-flap reveal along each door
  logo: '#5b5a2a',
};

function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Poles ---------------------------------------------------------------

/** The spine's height at x, between the hubs: nearly flat, rounding down to them. */
const spineY = (x: number) => PEAK - (PEAK - HUB_Y) * (x / HUB_X) ** 2;
/** A leg from a hub (s 0) to its corner (s 1), straight in plan, arching down steeply to the ground. */
const legPoint = (sx: number, sz: number, s: number) =>
  new THREE.Vector3(sx * (HUB_X + (L - HUB_X) * s), HUB_Y * Math.pow(Math.max(0, 1 - s * s), 0.62), sz * D * s);
/** The cross pole at z: over the spine, falling to the eaves. */
const crossY = (z: number) => CROSS_Y - (CROSS_Y - EAVE_Y) * Math.abs(z / EAVE_Z) ** 2.2;

// Fly membrane ----------------------------------------------------------
// A heightfield over the footprint, solved as a pinned membrane: held at the
// hem, pushed up by the spine, the legs and the cross pole, with a small load
// so the fabric sags between them.

// The mesh's grid is warped per column so its edge follows the hem exactly.
const NX = 72, NZ = 64;
const dx = (2 * L) / NX;
const gridX = (i: number) => -L + i * dx;
const gridZ = (i: number, j: number) => (j / NZ * 2 - 1) * hemZ(gridX(i));

/** The hem's height at a boundary point: arched at the ends, a little between stakes on the sides. */
function hemY(x: number, z: number, end: boolean) {
  if (end) return HEM + END_LIFT * (1 - (z / D) ** 2);
  const ax = Math.abs(x);
  const t = ax <= STAKE_X ? (ax + STAKE_X) / (2 * STAKE_X) : (ax - STAKE_X) / (L - STAKE_X);
  return HEM + SIDE_LIFT * Math.sin(Math.PI * t) * (ax <= STAKE_X ? 0.6 : 1);
}

/** Distance in plan from (x, z) to the segment a-b, and how far along it. */
function toSegment(x: number, z: number, ax: number, az: number, bx: number, bz: number) {
  const ux = bx - ax, uz = bz - az;
  const s = THREE.MathUtils.clamp(((x - ax) * ux + (z - az) * uz) / (ux * ux + uz * uz), 0, 1);
  return { d: Math.hypot(x - ax - ux * s, z - az - uz * s), s };
}

/**
 * The membrane's height, solved on a regular grid over the footprint's bounds
 * (a warped grid's Laplacian bulges the tapering vestibules) and returned as
 * a bilinear lookup. Everything outside the hem is held at the hem's height.
 */
function solveMembrane() {
  const S = 0.03; // grid spacing, m
  const ZM = D + VEST;
  const nx = Math.ceil((2 * L) / S) + 2, nz = Math.ceil((2 * ZM) / S) + 2;
  const ox = -L - S, oz = -ZM - S;
  const h = new Float32Array(nx * nz);
  const pin = new Float32Array(h.length);
  const target = new Float32Array(h.length);
  const reach = 0.75 * S;

  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const x = ox + i * S, z = oz + j * S;
      const k = j * nx + i;
      h[k] = HEM;
      if (Math.abs(x) >= L || Math.abs(z) >= hemZ(x)) {
        pin[k] = 1;
        const cx = THREE.MathUtils.clamp(x, -L, L);
        target[k] = Math.abs(x) >= L && Math.abs(z) < D ? hemY(cx, z, true) : hemY(cx, 0, false);
        continue;
      }
      let w = 0, t = 0;
      const under = (d: number, y: number) => {
        const wi = Math.exp(-((d / reach) ** 2));
        if (wi > w) { w = wi; t = y + CLEAR; }
      };
      // The spine between the hubs.
      if (Math.abs(x) <= HUB_X) under(Math.abs(z), spineY(x));
      // The four legs, straight in plan from each hub to its corner.
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const { d, s } = toSegment(x, z, sx * HUB_X, 0, sx * L, sz * D);
        if (s < 0.97) under(d, legPoint(sx, sz, s).y);
      }
      // The cross pole, to its tips at the eaves.
      if (Math.abs(z) <= EAVE_Z) under(Math.abs(x), crossY(z));
      // The fly is cut to run taut from each eave down to the corners beside it: a crease, with no pole under it.
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const { d, s } = toSegment(x, z, 0, sz * EAVE_Z, sx * L, sz * D);
        if (s > 0.03 && s < 0.97) under(d, EAVE_Y + (HEM - EAVE_Y) * s - CLEAR);
      }
      pin[k] = w > 0.05 ? w : 0;
      target[k] = t;
    }
  }

  // Gauss-Seidel, over-relaxed near the optimum for a grid this size. The load term sags the free cloth.
  const load = 0.08 * S * S;
  for (let it = 0; it < 1600; it++) {
    for (let j = 1; j < nz - 1; j++) {
      for (let i = 1; i < nx - 1; i++) {
        const k = j * nx + i;
        if (pin[k] === 1) continue;
        const lap = (h[k - 1] + h[k + 1] + h[k - nx] + h[k + nx] - load) / 4;
        const free = h[k] + 1.92 * (lap - h[k]);
        // Poles only push the fly up; between them it hangs.
        h[k] = pin[k] ? free + (Math.max(free, target[k]) - free) * pin[k] : free;
      }
    }
    if (it === 0) for (let k = 0; k < h.length; k++) if (pin[k] === 1) h[k] = target[k];
  }
  return (x: number, z: number) => {
    const fi = THREE.MathUtils.clamp((x - ox) / S, 0, nx - 1 - 1e-6);
    const fj = THREE.MathUtils.clamp((z - oz) / S, 0, nz - 1 - 1e-6);
    const i = Math.floor(fi), j = Math.floor(fj), u = fi - i, v = fj - j;
    const k = j * nx + i;
    const a = h[k] + (h[k + 1] - h[k]) * u;
    const b = h[k + nx] + (h[k + nx + 1] - h[k + nx]) * u;
    return a + (b - a) * v;
  };
}

type Membrane = {
  height: (x: number, z: number) => number;
  normalAt: (x: number, z: number) => THREE.Vector3;
};

/** Which of the fly's panels a point falls in: an end (beyond its legs), a vestibule (beyond the eave's creases), or a quarter of the roof. */
function panelAt(x: number, z: number) {
  const sx = x > 0 ? 1 : -1, sz = z > 0 ? 1 : -1;
  const ax = Math.abs(x), az = Math.abs(z);
  if (az < D && ax > HUB_X + (L - HUB_X) * (az / D)) return `end${sx}`;
  if (az > EAVE_Z + (D - EAVE_Z) * (ax / L)) return `vestibule${sz}`;
  return `roof${sx}${sz}`;
}

/** Which door (if any) a point on the fly belongs to: +1 the front, -1 the back (turned half round), 0 neither. */
function doorAt(x: number, z: number) {
  const side = z > 0 ? 1 : -1;
  const az = Math.abs(z), xl = side * x; // the back door is the front turned half round
  // Outside the crease from the eave down to the corner on the door's side, and short of the zip.
  if (xl > 0 || az <= EAVE_Z + (D - EAVE_Z) * (-xl / L)) return 0;
  const t = THREE.MathUtils.clamp((az - EAVE_Z) / (D + VEST - EAVE_Z), 0, 1);
  return xl < zipPlan(t)[0] ? side : 0;
}

function makeMembrane() {
  const solved = solveMembrane();
  const idx = (i: number, j: number) => j * (NX + 1) + i;
  // Sampled onto the mesh's grid, whose edge follows the hem exactly: z = v * hemZ(x), v in -1..1.
  const h = new Float32Array((NX + 1) * (NZ + 1));
  for (let j = 0; j <= NZ; j++) {
    for (let i = 0; i <= NX; i++) {
      const x = gridX(i), z = gridZ(i, j);
      const edge = i === 0 || i === NX || j === 0 || j === NZ;
      h[idx(i, j)] = edge ? hemY(x, z, i === 0 || i === NX) : solved(x, z);
    }
  }

  const height = (x: number, z: number) => {
    const fi = THREE.MathUtils.clamp((x + L) / dx, 0, NX - 1e-6);
    const fj = THREE.MathUtils.clamp(((z / hemZ(x) + 1) / 2) * NZ, 0, NZ - 1e-6);
    const i = Math.floor(fi), j = Math.floor(fj), u = fi - i, v = fj - j;
    const a = h[idx(i, j)] + (h[idx(i + 1, j)] - h[idx(i, j)]) * u;
    const b = h[idx(i, j + 1)] + (h[idx(i + 1, j + 1)] - h[idx(i, j + 1)]) * u;
    return a + (b - a) * v;
  };
  const normalAt = (x: number, z: number) => {
    const e = 0.01;
    const gx = (height(x + e, z) - height(x - e, z)) / (2 * e);
    const gz = (height(x, z + e) - height(x, z - e)) / (2 * e);
    return new THREE.Vector3(-gx, 1, -gz).normalize();
  };

  // UVs from accumulated arc length, so the cloth's wrinkles keep their scale down the steep walls.
  const pos: number[] = [], uv: number[] = [];
  const P = (i: number, j: number) => new THREE.Vector3(gridX(i), h[idx(i, j)], gridZ(i, j));
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
  // The triangles, sorted into the fly's panels and its two doors by where each one's middle falls.
  const panels = new Map<string, { fly: number[]; doors: Record<number, number[]> }>();
  for (let j = 0; j < NZ; j++) {
    for (let i = 0; i < NX; i++) {
      const a = idx(i, j), b = idx(i + 1, j), c = idx(i, j + 1), d = idx(i + 1, j + 1);
      // Split along the diagonal that follows the nearer leg, so the creases stay clean.
      const x = gridX(i + 0.5), z = (gridZ(i, j) + gridZ(i + 1, j + 1)) / 2;
      const tris = x * z > 0 ? [a, c, d, a, d, b] : [a, c, b, b, c, d];
      for (let k = 0; k < 6; k += 3) {
        let mx = 0, mz = 0;
        for (let n = 0; n < 3; n++) { mx += pos[3 * tris[k + n]] / 3; mz += pos[3 * tris[k + n] + 2] / 3; }
        const key = panelAt(mx, mz);
        if (!panels.has(key)) panels.set(key, { fly: [], doors: { 1: [], [-1]: [] } });
        const panel = panels.get(key)!;
        const door = doorAt(mx, mz);
        (door ? panel.doors[door] : panel.fly).push(tris[k], tris[k + 1], tris[k + 2]);
      }
    }
  }
  // Each panel takes its normals from its own triangles alone (its door included), so the
  // seams between panels shade as the crisp creases the photos show.
  const normals = (index: number[]) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(index);
    g.computeVertexNormals();
    return g.getAttribute('normal').array as Float32Array;
  };
  /** A geometry of just the vertices these triangles use. */
  const compact = (index: number[], normal: Float32Array) => {
    const remap = new Map<number, number>();
    const p: number[] = [], n: number[] = [], t: number[] = [];
    const out = index.map((v) => {
      let r = remap.get(v);
      if (r === undefined) {
        remap.set(v, (r = remap.size));
        p.push(pos[3 * v], pos[3 * v + 1], pos[3 * v + 2]);
        n.push(normal[3 * v], normal[3 * v + 1], normal[3 * v + 2]);
        t.push(uv[2 * v], uv[2 * v + 1]);
      }
      return r;
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(t, 2));
    g.setIndex(out);
    return g;
  };
  const parts: THREE.BufferGeometry[][] = [[], [], []];
  for (const panel of panels.values()) {
    const normal = normals([...panel.fly, ...panel.doors[1], ...panel.doors[-1]]);
    [panel.fly, panel.doors[1], panel.doors[-1]].forEach((index, n) => index.length && parts[n].push(compact(index, normal)));
  }
  const [fly, front, back] = parts.map((list) => mergeGeometries(list));
  return { fly, doors: [front, back] as const, m: { height, normalAt } satisfies Membrane };
}

// Cloth texture -----------------------------------------------------------
// A normal map of soft creases, mostly across the panels. Albedo stays a flat
// colour: the OSMO ripstop grid is below a pixel at camp distance.

function clothNormals() {
  const S = 256;
  const r = rng(7);
  const height = new Float32Array(S * S);
  for (let k = 0; k < 70; k++) {
    let x = r() * S, y = r() * S;
    let a = (r() - 0.5) * 0.8;
    const len = 20 + r() * r() * 110;
    const width = 1 + r() * 1.6;
    const amp = 0.5 + r() * 0.5;
    for (let s = 0; s < len; s++) {
      const taper = Math.sin((Math.PI * s) / len);
      const reach = Math.ceil(width * 2.5);
      for (let o = -reach; o <= reach; o++) {
        const px = Math.round(x - Math.sin(a) * o), py = Math.round(y + Math.cos(a) * o);
        const i = ((py % S) + S) % S * S + ((px % S) + S) % S;
        height[i] = Math.max(height[i], amp * taper * Math.exp(-((o / width) ** 2)));
      }
      x += Math.cos(a);
      y += Math.sin(a);
      a += (r() - 0.5) * 0.02;
    }
  }
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = S;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(S, S);
  const at = (x: number, y: number) => height[((y + S) % S) * S + ((x + S) % S)];
  const n = new THREE.Vector3();
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      n.set(-(at(x + 1, y) - at(x - 1, y)) * 0.5, -(at(x, y + 1) - at(x, y - 1)) * 0.5, 1).normalize();
      const o = (y * S + x) * 4;
      img.data[o] = (n.x * 0.5 + 0.5) * 255;
      img.data[o + 1] = (n.y * 0.5 + 0.5) * 255;
      img.data[o + 2] = (n.z * 0.5 + 0.5) * 255;
      img.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
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

const tube = (curve: THREE.Curve<THREE.Vector3>, radius: number, segments: number) =>
  new THREE.Mesh(new THREE.TubeGeometry(curve, segments, radius, 6, false));

/** A curve that runs along the fly surface through plan points (x, z), lifted off it. */
function surfaceCurve(m: Membrane, plan: [number, number][], lift: number) {
  const pts: THREE.Vector3[] = [];
  const on = (x: number, z: number) => new THREE.Vector3(x, m.height(x, z), z).addScaledVector(m.normalAt(x, z), lift);
  for (let k = 0; k < plan.length - 1; k++) {
    const [x0, z0] = plan[k], [x1, z1] = plan[k + 1];
    for (let t = 0; t < 1; t += 0.125) pts.push(on(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t));
  }
  pts.push(on(...plan[plan.length - 1]));
  return new THREE.CatmullRomCurve3(pts);
}

/** A flat strip lying on the fly along plan points, `width` across: a door's grey reveal. */
function surfaceStrip(m: Membrane, plan: [number, number][], width: number, lift: number) {
  const pos: number[] = [], index: number[] = [];
  plan.forEach(([x, z], k) => {
    const [ax, az] = plan[Math.max(0, k - 1)], [bx, bz] = plan[Math.min(plan.length - 1, k + 1)];
    const tx = bx - ax, tz = bz - az, tl = Math.hypot(tx, tz) || 1;
    // Across the strip in plan; the reveal shows on the door's side of the zip only.
    const nx = -tz / tl, nz = tx / tl;
    for (const o of [0, width]) {
      const px = x + nx * o, pz = z + nz * o;
      const p = new THREE.Vector3(px, m.height(px, pz), pz).addScaledVector(m.normalAt(px, pz), lift);
      pos.push(p.x, p.y, p.z);
    }
    if (k > 0) index.push(2 * k - 2, 2 * k - 1, 2 * k, 2 * k, 2 * k - 1, 2 * k + 1);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(index);
  g.computeVertexNormals();
  return new THREE.Mesh(g);
}

/** The NEMO shield, flat on the fly at the middle of an end (+1 the +x end). */
function shield(m: Membrane, end: 1 | -1, material: THREE.Material) {
  const s = new THREE.Shape();
  s.moveTo(-0.055, 0.06);
  s.lineTo(0.055, 0.06);
  s.lineTo(0.055, -0.005);
  s.quadraticCurveTo(0.05, -0.05, 0, -0.07);
  s.quadraticCurveTo(-0.05, -0.05, -0.055, -0.005);
  s.closePath();
  const mesh = new THREE.Mesh(new THREE.ShapeGeometry(s, 6), material);
  // Where the end face stands at about two-thirds height.
  const y = 0.7;
  let lo = 0, hi = L;
  for (let n = 0; n < 30; n++) {
    const mid = (lo + hi) / 2;
    if (m.height(end * mid, 0) > y) lo = mid;
    else hi = mid;
  }
  const x = (end * (lo + hi)) / 2;
  const n = m.normalAt(x, 0);
  mesh.position.set(x, m.height(x, 0), 0).addScaledVector(n, 0.004);
  mesh.lookAt(mesh.position.clone().add(n));
  // Upright on the sloping face: its local y along the face's uphill line.
  const up = new THREE.Vector3(0, 1, 0).projectOnPlane(n).normalize();
  const localUp = new THREE.Vector3(0, 1, 0).applyQuaternion(mesh.quaternion);
  mesh.rotateZ(Math.atan2(new THREE.Vector3().crossVectors(localUp, up).dot(n), localUp.dot(up)));
  return mesh;
}

// The inner ---------------------------------------------------------------

/**
 * The inner tent, hung under the fly: a grey canopy over a darker bathtub
 * floor. A heightfield over the floor's rectangle, under the fly by a gap and
 * rising steeply from its edges.
 */
function makeInner(m: Membrane) {
  const N = 40, M = 32;
  const pos: number[] = [], index: { tub: number[]; wall: number[] } = { tub: [], wall: [] };
  const lid = (x: number, z: number) => {
    const edge = Math.min(L - Math.abs(x), D - Math.abs(z));
    return Math.max(0, Math.min(m.height(x, z) - INNER_GAP, edge * 9));
  };
  // Rings from the edge inward, bunched near the edge where the wall rises.
  for (let j = 0; j <= M; j++) {
    for (let i = 0; i <= N; i++) {
      const s = (k: number, n: number) => {
        const t = (k / n) * 2 - 1;
        return Math.sign(t) * (1 - Math.pow(1 - Math.abs(t), 1.6));
      };
      const x = s(i, N) * L * 0.995, z = s(j, M) * D * 0.995;
      pos.push(x, lid(x, z), z);
    }
  }
  const at = (i: number, j: number) => j * (N + 1) + i;
  for (let j = 0; j < M; j++) {
    for (let i = 0; i < N; i++) {
      const q = [at(i, j), at(i, j + 1), at(i + 1, j), at(i + 1, j), at(i, j + 1), at(i + 1, j + 1)];
      for (let k = 0; k < 6; k += 3) {
        const y = (pos[3 * q[k] + 1] + pos[3 * q[k + 1] + 1] + pos[3 * q[k + 2] + 1]) / 3;
        (y < TUB ? index.tub : index.wall).push(q[k], q[k + 1], q[k + 2]);
      }
    }
  }
  const geometry = (idx: number[]) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  };
  // The floor itself, just above the ground.
  const floor = new THREE.PlaneGeometry(2 * L, 2 * D).rotateX(-Math.PI / 2).translate(0, 0.004, 0).deleteAttribute('uv');
  return { tub: mergeGeometries([geometry(index.tub).toNonIndexed(), floor.toNonIndexed()]), wall: geometry(index.wall) };
}

// The model ---------------------------------------------------------------

export type DaggerMaterials = {
  /** The fly's ripstop: its crease normals are set here. */
  cloth: THREE.MeshStandardMaterial;
  /** The front door's ripstop, kept apart from the fly so it can glow on its own. */
  doorCloth: THREE.MeshStandardMaterial;
  seam: THREE.MeshStandardMaterial;
  pole: THREE.MeshStandardMaterial;
  cross: THREE.MeshStandardMaterial;
  hub: THREE.MeshStandardMaterial;
  zip: THREE.MeshStandardMaterial;
  logo: THREE.MeshStandardMaterial;
  inner: THREE.MeshStandardMaterial;
  tub: THREE.MeshStandardMaterial;
};

export const DAGGER_COLOURS = COLORS;
/** The top of the cross pole: the frame's full height as drawn. */
export const DAGGER_TOP = CROSS_Y + POLE_R;
/** Inside, in its own space (floor at y 0, long axis x, door toward +z). */
export const DAGGER_INSIDE = {
  pad: new THREE.Vector3(0, 0, 0.1),
  bed: new THREE.Vector3(0.02, 0.055, 0.1),
  pillow: new THREE.Vector3(-0.82, 0.1, 0.1),
  // Hung from the spine.
  headtorch: new THREE.Vector3(0.15, PEAK - 0.12, 0),
};

/** The Dagger, in the given materials: the fly (with its seams, stakes and the inner), its doors, and its poles. */
export function buildDagger(mats: DaggerMaterials) {
  const normalMap = clothNormals();
  for (const cloth of [mats.cloth, mats.doorCloth]) {
    cloth.normalMap = normalMap;
    cloth.normalScale.set(0.8, 0.8);
    cloth.side = THREE.DoubleSide;
  }
  mats.inner.side = mats.tub.side = mats.zip.side = THREE.DoubleSide;

  const { fly: flyGeo, doors: doorGeos, m } = makeMembrane();
  const fly = new THREE.Mesh(flyGeo, mats.cloth);
  fly.name = 'dagger-fly';

  // Seams: down the spine, across under the cross pole, and from each hub to its corner.
  const seamPlans: [number, number][][] = [
    [[-HUB_X, 0], [HUB_X, 0]],
    [[0, -EAVE_Z], [0, EAVE_Z]],
  ];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) seamPlans.push([[sx * HUB_X, 0], [sx * (L - 0.02), sz * (D - 0.02)]]);
  fly.add(detail(merged(seamPlans.map((p) => tube(surfaceCurve(m, p, 0.002), 0.0025, 40)), mats.seam, 'fly-seams')));

  // The shield on each end, and the lime clip points along each leg seam.
  fly.add(detail(merged([shield(m, 1, mats.logo), shield(m, -1, mats.logo)], mats.logo, 'fly-logos')));
  const tabs: THREE.Mesh[] = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    for (const s of [0.35, 0.7]) {
      const x = sx * (HUB_X + (L - HUB_X) * s), z = sz * D * s;
      const tab = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.014, 0.004));
      const n = m.normalAt(x, z);
      tab.position.set(x, m.height(x, z), z).addScaledVector(n, 0.004);
      tab.lookAt(tab.position.clone().add(n));
      tabs.push(tab);
    }
  }
  fly.add(detail(merged(tabs, mats.cross, 'fly-tabs')));

  // Stakes at the corners and the vestibule points, with a lime tensioner at each corner.
  const stakes: THREE.Mesh[] = [], tensioners: THREE.Mesh[] = [];
  const stakeAt = (x: number, z: number, out: number) => {
    const dir = new THREE.Vector3(x, 0, z).normalize();
    const p = new THREE.Vector3(x, 0, z).addScaledVector(dir, out);
    const stake = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.09, 5));
    stake.position.copy(p).setY(0.03);
    stake.rotation.set(dir.z * 0.35, 0, -dir.x * 0.35);
    stakes.push(stake);
    return p;
  };
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const p = stakeAt(sx * L, sz * D, 0.12);
    // The cord from the corner out to its stake.
    const cord = tube(new THREE.LineCurve3(new THREE.Vector3(sx * L, HEM, sz * D), p.clone().setY(0.06)), 0.0014, 1);
    const toggle = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.006, 0.022));
    toggle.position.set(sx * L, HEM + 0.01, sz * D);
    tensioners.push(cord, toggle);
    stakeAt(sx * STAKE_X, sz * (D + VEST), 0.06);
  }
  fly.add(detail(merged(stakes, mats.hub, 'stakes')), detail(merged(tensioners, mats.cross, 'tensioners')));

  // The inner, seen under the fly's lifted ends and through it from inside.
  const innerGeo = makeInner(m);
  const inner = new THREE.Mesh(innerGeo.wall, mats.inner);
  inner.name = 'inner';
  const tub = new THREE.Mesh(innerGeo.tub, mats.tub);
  tub.name = 'inner-floor';
  fly.add(inner, tub);

  // The doors: each the vestibule's panel beside its J zip, with the grey reveal along the zip.
  const doors = doorGeos.map((g, n) => {
    const side = n === 0 ? 1 : -1;
    const door = new THREE.Mesh(g, n === 0 ? mats.doorCloth : mats.cloth);
    door.name = n === 0 ? 'dagger-door' : 'dagger-door-back';
    const plan: [number, number][] = [];
    for (let k = 0; k <= 16; k++) {
      const [x, z] = zipPlan(Math.min(0.985, k / 16));
      plan.push([side * x, side * z]);
    }
    door.add(detail(merged([surfaceStrip(m, plan, -side * 0.035, 0.003)], mats.zip, `${door.name}-reveal`)));
    return door;
  });

  // Poles: the spine with its legs, hubs at each end, and the lime cross pole riding over it.
  const poles = new THREE.Group();
  poles.name = 'dagger-poles';
  const spinePts: THREE.Vector3[] = [];
  for (let k = -8; k <= 8; k++) spinePts.push(new THREE.Vector3((k / 8) * HUB_X, spineY((k / 8) * HUB_X), 0));
  const frame = [tube(new THREE.CatmullRomCurve3(spinePts), POLE_R, 32)];
  const hubs: THREE.Mesh[] = [], feet: THREE.Mesh[] = [];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const pts: THREE.Vector3[] = [];
      for (let k = 0; k <= 12; k++) pts.push(legPoint(sx, sz, k / 12));
      frame.push(tube(new THREE.CatmullRomCurve3(pts), POLE_R, 32));
      const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.03, 8));
      foot.position.set(sx * L, 0.015, sz * D);
      feet.push(foot);
    }
    const hub = new THREE.Mesh(new THREE.SphereGeometry(0.014, 10, 6));
    hub.position.set(sx * HUB_X, HUB_Y, 0);
    hubs.push(hub);
  }
  const crossPts: THREE.Vector3[] = [];
  for (let k = -8; k <= 8; k++) crossPts.push(new THREE.Vector3(0, crossY((k / 8) * EAVE_Z), (k / 8) * EAVE_Z));
  const spine = merged(frame, mats.pole, 'spine');
  spine.add(detail(merged([...hubs, ...feet], mats.hub, 'pole-hubs')));
  const cross = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(crossPts), 32, POLE_R, 6, false), mats.cross);
  cross.name = 'cross-pole';
  poles.add(spine, cross);

  return { fly, doors: [doors[0], doors[1]] as const, poles, textures: [normalMap] };
}
