// The tent, drawn in code from two photos of ours (IMG_4842, IMG_4850).
// A freestanding two-person tent: two hubs, one at the top of each long
// face, each with two legs to its corners; a ridge pole standing proud
// along the top; a peaked vent hood over the door; and a sage nylon fly
// that sags between the poles.
//
// Y up, metres, base centred on the origin, door facing +z. About 2.1 m
// long (x), 1.3 m deep (z), 1.0 m high. Only MeshStandardMaterial: the
// scene clones materials, drives emissive and fades opacity.
//
// The spec this follows lives in .img2threejs/object-sculpt-spec.json.
// Inferred (neither photo shows it): the back face below the vents, the
// ground line, the door outline. Stakes and guy-lines are left out.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const L = 1.05; // half length, x
const D = 0.65; // half depth, z
const HEM = 0.04; // fly hem height above the ground
const HUB_Z = 0.2; // the hubs sit this far either side of the ridge line
const HUB_Y = 0.9;
const hubAt = (side: number) => new THREE.Vector3(0, HUB_Y, side * HUB_Z);
const CORNER = { x: L - 0.004, z: D - 0.004 }; // leg tips sit in the fly's corner grommets
const RIDGE_END = 0.58;
const EAR_Y = 0.862; // the fly's top corners, lifted by the ridge pole ends
const TOP = 1.0; // height the membrane solve is normalised to
const WALL = 0.55; // < 1 makes the walls rise steeply off the hem
const POLE_R = 0.0045;
const CLEAR = 0.012; // pole centre to fabric
const NORMAL_SCALE = 1.0;
const DOOR_OPEN = -2.4; // radians about the hinge edge; folds the door out to its left
const DOOR_W = 0.42, DOOR_BASE = 0.06, DOOR_H = 0.62; // the D: half width, sill, height
/** Top of the door's D outline at x (|x| <= DOOR_W). */
const doorTop = (x: number) => DOOR_BASE + DOOR_H * Math.pow(Math.sqrt(Math.max(0, 1 - (x / DOOR_W) ** 2)), 0.7); // cloth wrinkle relief (tuned on the door face against IMG_4842)

const COLORS = {
  fly: '#97a698',
  pole: '#c3c7c9',
  hub: '#d4d6d4',
  clip: '#1d1f20',
  webbing: '#b3c2a8',
  inner: '#2a3032',
  zip: '#8f9e91', // the photos don't show the zip, so it barely reads
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

// Poles ---------------------------------------------------------------

/** Height of a leg at s = 0 (hub) .. 1 (corner): drops off the hub, bows out lower down. */
const legY = (s: number) => HUB_Y * (1 - s) + 0.26 * Math.sin(Math.PI * s) * Math.sqrt(s);
/** Plan position of a leg at s, from its hub (sz side) to the corner. */
const legXZ = (sx: number, sz: number, s: number) => ({ x: sx * CORNER.x * s, z: sz * (HUB_Z + (CORNER.z - HUB_Z) * s) });

function legCurve(sx: number, sz: number) {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 12; i++) {
    const s = i / 12;
    const p = legXZ(sx, sz, s);
    pts.push(new THREE.Vector3(p.x, legY(s), p.z));
  }
  return new THREE.CatmullRomCurve3(pts);
}

const ridgeCurve = new THREE.CatmullRomCurve3([
  new THREE.Vector3(-RIDGE_END - 0.005, HUB_Y - 0.03, 0),
  new THREE.Vector3(-RIDGE_END + 0.04, 0.9, 0),
  new THREE.Vector3(-0.3, 0.97, 0),
  new THREE.Vector3(0, 1.0, 0),
  new THREE.Vector3(0.3, 0.97, 0),
  new THREE.Vector3(RIDGE_END - 0.04, 0.9, 0),
  new THREE.Vector3(RIDGE_END + 0.005, HUB_Y - 0.03, 0),
]);

// Fly membrane ----------------------------------------------------------
// The fly is a heightfield over the footprint, solved as a pinned membrane:
// held at the hem, pulled up under the four legs and the ridge, with a
// small load so the fabric sags between them.

const NX = 64, NZ = 40;
const dx = (2 * L) / NX, dz = (2 * D) / NZ;

// The solve runs on u, with height = HEM + (TOP - HEM) * u^WALL, so the
// cloth leaves the hem steeply instead of drooping onto it.
const toU = (y: number) => Math.pow(Math.max(0, (y - HEM) / (TOP - HEM)), 1 / WALL);

function solveMembrane() {
  const h = new Float32Array((NX + 1) * (NZ + 1));
  const pin = new Float32Array(h.length); // 0 free .. 1 fixed
  const target = new Float32Array(h.length);
  const idx = (i: number, j: number) => j * (NX + 1) + i;

  const legs = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
  for (let j = 0; j <= NZ; j++) {
    for (let i = 0; i <= NX; i++) {
      const x = -L + i * dx, z = -D + j * dz;
      const k = idx(i, j);
      h[k] = 0.3;
      if (i === 0 || j === 0 || i === NX || j === NZ) {
        pin[k] = 1;
        target[k] = 0;
        continue;
      }
      let w = 0, t = 0;
      // Under each leg, in plan a straight line from its hub to its corner.
      for (const [sx, sz] of legs) {
        const hz = sz * HUB_Z, cx = sx * CORNER.x, cz = sz * CORNER.z - hz;
        const s = THREE.MathUtils.clamp((x * cx + (z - hz) * cz) / (cx * cx + cz * cz), 0, 1);
        const d = Math.hypot(x - cx * s, z - hz - cz * s);
        const wi = Math.exp(-((d / (0.75 * dx)) ** 2));
        if (wi > w) { w = wi; t = Math.max(HEM, legY(s) - CLEAR); }
      }
      // The roof: hung between the two hubs, and along the ridge seam out to
      // the ridge pole's ends, which lift the fly's top corners.
      if (Math.abs(x) <= RIDGE_END + 0.02) { // out past the pole ends, so they seat on the fly
        const wi = Math.exp(-((z / (0.75 * dz)) ** 2));
        const ty = HUB_Y - 0.012 - 0.025 * (Math.abs(x) / RIDGE_END) ** 2;
        if (wi > w) { w = wi; t = ty; }
      }
      if (Math.abs(z) <= HUB_Z) {
        const wi = Math.exp(-((x / (0.75 * dx)) ** 2));
        if (wi > w) { w = wi; t = HUB_Y - 0.012; }
      }
      // End-wall seams, ridge ear straight down to the hem: they keep the end panels flat.
      if (Math.abs(x) > RIDGE_END) {
        const wi = Math.exp(-((z / (0.75 * dz)) ** 2));
        const f = (Math.abs(x) - RIDGE_END) / (L - RIDGE_END);
        const ty = (EAR_Y - 0.004) * (1 - f) + HEM * f;
        if (wi > w) { w = wi; t = ty; }
      }
      pin[k] = w > 0.05 ? w : 0;
      target[k] = toU(t);
    }
  }

  // Gauss-Seidel with over-relaxation. The load term sags the free cloth.
  const load = 0.35 * dx * dx;
  const ax = 1 / (dx * dx), az = 1 / (dz * dz), diag = 2 * ax + 2 * az;
  for (let it = 0; it < 500; it++) {
    for (let j = 1; j < NZ; j++) {
      for (let i = 1; i < NX; i++) {
        const k = idx(i, j);
        const lap = (ax * (h[k - 1] + h[k + 1]) + az * (h[k - NX - 1] + h[k + NX + 1]) - load * ax) / diag;
        const free = h[k] + 1.6 * (lap - h[k]);
        h[k] = free + (target[k] - free) * pin[k];
      }
    }
    for (let k = 0; k < h.length; k++) if (pin[k] === 1) h[k] = target[k];
  }
  for (let k = 0; k < h.length; k++) h[k] = HEM + (TOP - HEM) * Math.pow(Math.max(0, h[k]), WALL);
  return h;
}

type Membrane = {
  height: (x: number, z: number) => number;
  /** A point on the door (+z) or back (-z) face at (x, y), and its outward normal. */
  onFace: (x: number, y: number, side: 1 | -1, lift?: number) => THREE.Vector3;
  normalAt: (x: number, z: number) => THREE.Vector3;
};

function makeMembrane(): { geometry: THREE.BufferGeometry; m: Membrane } {
  const h = solveMembrane();
  const wrinkle = valueNoise(11);
  const idx = (i: number, j: number) => j * (NX + 1) + i;

  // Soft folds, mostly running across the faces, fading out at the pins. Kept to
  // wavelengths of three grid cells or more; the fine wrinkles live in the normal map.
  for (let j = 1; j < NZ; j++) {
    for (let i = 1; i < NX; i++) {
      const x = -L + i * dx, z = -D + j * dz;
      const y = h[idx(i, j)];
      const fade = Math.min(1, (y - HEM) / 0.15) * (1 - y / 1.1);
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
  const normalAt = (x: number, z: number) => {
    const e = 0.01;
    const gx = (height(x + e, z) - height(x - e, z)) / (2 * e);
    const gz = (height(x, z + e) - height(x, z - e)) / (2 * e);
    return new THREE.Vector3(-gx, 1, -gz).normalize();
  };
  const onFace = (x: number, y: number, side: 1 | -1, lift = 0) => {
    // Walk out from the ridge until the fly drops to y.
    let lo = 0, hi = D;
    for (let n = 0; n < 30; n++) {
      const mid = (lo + hi) / 2;
      if (height(x, side * mid) > y) lo = mid;
      else hi = mid;
    }
    const z = side * (lo + hi) / 2;
    const p = new THREE.Vector3(x, height(x, z), z);
    return lift ? p.addScaledVector(normalAt(x, z), lift) : p;
  };

  // Geometry, with UVs from accumulated arc length so the cloth texture
  // keeps its scale down the steep walls.
  const pos: number[] = [], uv: number[] = [], index: number[] = [];
  const P = (i: number, j: number) => new THREE.Vector3(-L + i * dx, h[idx(i, j)], -D + j * dz);
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
  // The fly is cut where the door is: only triangles wholly inside the D go, so the hole
  // stays smaller than the door panel and never shows while the door is shut.
  const inDoor = (k: number) => {
    const x = pos[3 * k], y = pos[3 * k + 1], z = pos[3 * k + 2];
    return z > HUB_Z && Math.abs(x) < DOOR_W && y > DOOR_BASE && y < doorTop(x);
  };
  for (let j = 0; j < NZ; j++) {
    for (let i = 0; i < NX; i++) {
      const a = idx(i, j), b = idx(i + 1, j), c = idx(i, j + 1), d = idx(i + 1, j + 1);
      // Split along the diagonal that follows the nearer leg, so the creases stay clean.
      const x = -L + (i + 0.5) * dx, z = -D + (j + 0.5) * dz;
      const tris = x * z > 0 ? [a, c, d, a, d, b] : [a, c, b, b, c, d];
      for (let k = 0; k < 6; k += 3) {
        if (inDoor(tris[k]) && inDoor(tris[k + 1]) && inDoor(tris[k + 2])) continue;
        index.push(tris[k], tris[k + 1], tris[k + 2]);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(index);
  g.computeVertexNormals();
  return { geometry: g, m: { height, onFace, normalAt } };
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

/** A peaked vent hood: two flaps meeting at a ridge, propped open by a kickstand. */
function ventHood(m: Membrane, side: 1 | -1, cloth: THREE.Material, dark: THREE.Material, name: string) {
  const g = new THREE.Group();
  g.name = name;
  // The hood juts out nearly level from under the hub, so it catches the sky;
  // the kickstand holds its middle out.
  const out = (p: THREE.Vector3, dy: number, dz: number) => p.add(new THREE.Vector3(0, dy, side * dz));
  const apex = m.onFace(0, HUB_Y - 0.04, side, 0.004);
  const left = out(m.onFace(-0.23, 0.75, side), 0.01, 0.04);
  const right = out(m.onFace(0.23, 0.75, side), 0.01, 0.04);
  const peak = out(m.onFace(0, 0.75, side), 0.015, 0.11);

  const hood = new THREE.BufferGeometry().setFromPoints([apex, left, peak, apex, peak, right]);
  hood.setAttribute('uv', new THREE.Float32BufferAttribute(
    [apex, left, peak, apex, peak, right].flatMap((p) => [p.x / 0.6, -p.y / 0.6]), 2));
  hood.computeVertexNormals();
  const flaps = new THREE.Mesh(hood, cloth);
  flaps.name = `${name}-hood`;

  // The vent opening and the hood's shadow: a dark band on the fly under the overhang.
  const band: THREE.Vector3[] = [];
  const N = 8;
  for (let k = 0; k <= N; k++) {
    const x = -0.21 + (0.42 * k) / N;
    const top = 0.745 - 0.01 * (Math.abs(x) / 0.21);
    band.push(m.onFace(x, top, side, 0.002), m.onFace(x, top - 0.035 * (1 - 0.7 * Math.abs(x) / 0.21), side, 0.002));
  }
  const idx: number[] = [];
  for (let k = 0; k < N; k++) idx.push(2 * k, 2 * k + 1, 2 * k + 2, 2 * k + 2, 2 * k + 1, 2 * k + 3);
  const gap = new THREE.BufferGeometry().setFromPoints(band);
  gap.setIndex(idx);
  gap.computeVertexNormals();
  const opening = new THREE.Mesh(gap, dark);
  const stand = tube(new THREE.LineCurve3(m.onFace(0, 0.745, side, 0.004), peak), 0.003, 2, dark, '');
  const tab = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.035, 0.004), dark);
  tab.position.copy(m.onFace(0, 0.69, side, 0.005));
  tab.lookAt(tab.position.clone().add(m.normalAt(tab.position.x, tab.position.z)));
  // The opening, kickstand and webbing tab share a material, so they draw as one mesh.
  flaps.add(detail(merged([opening, stand, tab], dark, `${name}-vent`)));
  g.add(flaps);
  return g;
}

/** A curve that runs along the fly surface through plan points (x, z). */
function surfaceCurve(m: Membrane, plan: [number, number][], lift: number) {
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

// The model ---------------------------------------------------------------

export function createTentModel(): THREE.Group {
  const root = new THREE.Group();
  root.name = 'tent';

  const { normalMap, roughnessMap } = clothMaps();
  normalMap.repeat.set(1, 1);
  const cloth = new THREE.MeshStandardMaterial({
    name: 'fly-nylon',
    color: COLORS.fly,
    roughness: 1,
    roughnessMap,
    normalMap,
    normalScale: new THREE.Vector2(NORMAL_SCALE, NORMAL_SCALE),
    side: THREE.DoubleSide,
  });
  // Dull aluminium. Kept mostly diffuse: the camp scene has no environment map,
  // and a high metalness would render the poles near black instead of pale grey.
  const alu = new THREE.MeshStandardMaterial({ name: 'aluminium', color: COLORS.pole, metalness: 0.35, roughness: 0.45 });
  const hubMat = new THREE.MeshStandardMaterial({ name: 'hub', color: COLORS.hub, roughness: 0.5, metalness: 0.1 });
  const clipMat = new THREE.MeshStandardMaterial({ name: 'clip', color: COLORS.clip, roughness: 0.7 });
  const webMat = new THREE.MeshStandardMaterial({ name: 'webbing', color: COLORS.webbing, roughness: 0.85 });
  const innerMat = new THREE.MeshStandardMaterial({ name: 'inner-floor', color: COLORS.inner, roughness: 0.8, side: THREE.DoubleSide });
  const zipMat = new THREE.MeshStandardMaterial({ name: 'zip', color: COLORS.zip, roughness: 0.6 });

  // Fly
  const fly = new THREE.Group();
  fly.name = 'fly';
  const { geometry, m } = makeMembrane();
  const membrane = new THREE.Mesh(geometry, cloth);
  membrane.name = 'fly-membrane';
  fly.add(membrane);

  // The inner tent's dark bathtub floor, seen as a band under the hem.
  const inset = 0.03, ih = 0.05;
  const skirtShape: [number, number][] = [[-L + inset, -D + inset], [L - inset, -D + inset], [L - inset, D - inset], [-L + inset, D - inset]];
  const skirtPos: number[] = [];
  for (let k = 0; k < 4; k++) {
    const [x0, z0] = skirtShape[k], [x1, z1] = skirtShape[(k + 1) % 4];
    skirtPos.push(x0, 0, z0, x1, 0, z1, x1, ih, z1, x0, 0, z0, x1, ih, z1, x0, ih, z0);
  }
  const skirtGeo = new THREE.BufferGeometry();
  skirtGeo.setAttribute('position', new THREE.Float32BufferAttribute(skirtPos, 3));
  skirtGeo.computeVertexNormals();
  const inner = new THREE.Mesh(skirtGeo, innerMat);
  inner.name = 'inner-floor';
  fly.add(inner);

  // Panel seams: along the roof ridge and down the middle of each end wall.
  const seamTubes = [tube(surfaceCurve(m, [[-RIDGE_END, 0.0], [RIDGE_END, 0.0]], 0.003), 0.0025, 24, cloth, '')];
  for (const sx of [-1, 1]) {
    seamTubes.push(tube(surfaceCurve(m, [[sx * RIDGE_END, 0], [sx * (L - 0.01), 0]], 0.003), 0.0025, 20, cloth, ''));
  }
  const seams = merged(seamTubes, cloth, 'fly-seams');
  membrane.add(detail(seams));

  // Webbing loops beside each leg, about halfway down.
  const loops = new THREE.InstancedMesh(new THREE.BoxGeometry(0.018, 0.05, 0.006), webMat, 4);
  loops.name = 'fly-loops';
  const tmp = new THREE.Object3D();
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz], n) => {
    const s = 0.55;
    const p = legXZ(sx, sz, s);
    const x = p.x - sx * 0.06, z = p.z;
    tmp.position.set(x, m.height(x, z), z).addScaledVector(m.normalAt(x, z), 0.005);
    tmp.lookAt(tmp.position.clone().add(m.normalAt(x, z)));
    tmp.updateMatrix();
    loops.setMatrixAt(n, tmp.matrix);
  });
  membrane.add(detail(loops));

  // Vents: the door one is the peaked awning.
  const dark = clipMat;
  const awning = ventHood(m, 1, cloth, dark, 'awning');
  const ventBack = ventHood(m, -1, cloth, dark, 'vent-back');
  fly.add(awning, ventBack);
  root.add(fly);

  // Door: a D-shaped panel on the +z face, a few mm proud of the fly, with its zip.
  // The outline is inferred; the photos are too dark to read the zip.
  const hinge = m.onFace(-DOOR_W, DOOR_BASE, 1, 0.003);
  const door = new THREE.Group();
  door.name = 'door';
  door.position.copy(hinge);
  const outline = (t: number) => {
    // t 0..1 around the D from the bottom left, up and over, to the bottom right.
    const a = Math.PI * (1 - t);
    return { x: DOOR_W * Math.cos(a), y: DOOR_BASE + DOOR_H * Math.pow(Math.sin(a), 0.7) };
  };
  const doorPos: number[] = [], doorUv: number[] = [], doorIdx: number[] = [];
  const NU = 16, NV = 12;
  for (let iu = 0; iu <= NU; iu++) {
    const o = outline(iu / NU);
    for (let iv = 0; iv <= NV; iv++) {
      const y = DOOR_BASE + (o.y - DOOR_BASE) * (iv / NV);
      const p = m.onFace(o.x, y, 1, 0.003).sub(hinge);
      doorPos.push(p.x, p.y, p.z);
      doorUv.push(o.x / 0.6, -y / 0.6); // same cloth scale as the fly
    }
  }
  for (let iu = 0; iu < NU; iu++) {
    for (let iv = 0; iv < NV; iv++) {
      const a = iu * (NV + 1) + iv, b = a + NV + 1;
      doorIdx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const doorGeo = new THREE.BufferGeometry();
  doorGeo.setAttribute('position', new THREE.Float32BufferAttribute(doorPos, 3));
  doorGeo.setAttribute('uv', new THREE.Float32BufferAttribute(doorUv, 2));
  doorGeo.setIndex(doorIdx);
  doorGeo.computeVertexNormals();
  const doorPanel = new THREE.Mesh(doorGeo, cloth);
  doorPanel.name = 'door-panel';
  const zipPts: THREE.Vector3[] = [];
  for (let k = 0; k <= 24; k++) {
    const o = outline(k / 24);
    zipPts.push(m.onFace(o.x, o.y, 1, 0.006).sub(hinge));
  }
  const zip = tube(new THREE.CatmullRomCurve3(zipPts), 0.0015, 48, zipMat, 'door-zip');
  const toggle = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.035, 0.006), webMat);
  toggle.position.copy(m.onFace(0, 0.42, 1, 0.008).sub(hinge));
  toggle.name = 'door-toggle';
  doorPanel.add(detail(zip), detail(toggle));
  door.add(doorPanel);
  // The door hinges along its own left zip edge, which leans back with the face.
  const hingeTop = outline(0.3);
  const hingeAxis = m.onFace(hingeTop.x, hingeTop.y, 1, 0.003).sub(hinge).normalize();
  root.add(door);

  // Poles
  const poles = new THREE.Group();
  poles.name = 'poles';
  // Each hub carries its two legs and a strut leaning in to the ridge pole's centre fitting.
  const ridgeTop = ridgeCurve.getPointAt(0.5);
  const strutTubes: THREE.Mesh[] = [];
  for (const side of [1, -1]) {
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.028, 12), hubMat);
    hub.position.copy(hubAt(side));
    hub.name = `hub-${side > 0 ? 'front' : 'back'}`;
    poles.add(hub);
    strutTubes.push(tube(new THREE.LineCurve3(hubAt(side), ridgeTop), POLE_R, 2, alu, ''));
  }
  const struts = merged(strutTubes, alu, 'ridge-struts'); // one part: both struts
  const ridge = tube(ridgeCurve, POLE_R, 48, alu, 'ridge-pole');
  const fitting = new THREE.Mesh(new THREE.SphereGeometry(0.012, 10, 6), hubMat);
  fitting.position.copy(ridgeTop);
  fitting.name = 'ridge-fitting';
  ridge.add(detail(fitting));
  const legs = new THREE.Group();
  legs.name = 'pole-legs';
  poles.add(struts, ridge, legs);

  const clips = new THREE.InstancedMesh(new THREE.BoxGeometry(0.022, 0.012, 0.016), clipMat, 16);
  clips.name = 'pole-clips';
  let c = 0;
  const tips: THREE.Mesh[] = [];
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const curve = legCurve(sx, sz);
    const tag = `${sz > 0 ? 'front' : 'back'}-${sx > 0 ? 'right' : 'left'}`;
    legs.add(tube(curve, POLE_R, 40, alu, `leg-${tag}`));
    for (const s of [0.2, 0.4, 0.6, 0.8]) {
      const p = curve.getPointAt(s);
      tmp.position.copy(p).y -= CLEAR * 0.5;
      tmp.lookAt(p.clone().add(curve.getTangentAt(s)));
      tmp.updateMatrix();
      clips.setMatrixAt(c++, tmp.matrix);
    }
    const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.03, 8), clipMat);
    tip.position.set(sx * CORNER.x, 0.015, sz * CORNER.z);
    tips.push(tip);
  }
  legs.add(detail(clips), detail(merged(tips, clipMat, 'pole-tips')));
  root.add(poles);

  root.userData.sculptRuntime = {
    door,
    // Open the door: door.rotateOnAxis(doorHinge.axis, doorHinge.openAngle * t), t = 0..1.
    doorHinge: { axis: hingeAxis, openAngle: DOOR_OPEN },
    nodes: { fly, poles, door, awning },
    destructionGroups: {
      fly: [membrane, inner, awning, ventBack],
      door: [doorPanel],
      frame: [poles.getObjectByName('hub-front')!, poles.getObjectByName('hub-back')!, struts, ridge, legs],
    },
  };
  return root;
}
