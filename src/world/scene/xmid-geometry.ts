// The Durston X-Mid Pro 2, drawn in code from Durston's product photos and
// its floor plan (durstongear.com/products/x-mid-pro-2-tent-ultralight-thruhiking).
// A rectangular Dyneema fly, 100 x 80 in (2.54 x 2.03 m), stands on two
// trekking poles 46 in (1.17 m) tall, set on a diagonal so the ridge between
// them sags across the tent from corner to corner. The fly is eight taut
// triangles: a roof each side of the ridge, a low end under each peak, and
// on each long side a door (zipped straight down from its peak, hinged on
// the seam from its peak to the far corner) beside a narrow panel with the
// Durston logo. The inner is a parallelogram set inside the fly, its long
// sides square to the floor plan's ends and the poles standing just outside
// them, so its walls rise straight up to each peak: a pale bathtub floor and
// dark no-see-um mesh hung under the fly, with a door under each peak.
// Materials are made by the caller (xmid.ts) so they're the world's own.
//
// Y up, metres, base centred on the origin, front door facing +z, in the
// fly's own frame (its long axis x). XMID_YAW turns it so the inner's long
// axis runs along x instead, which is how the kit inside wants it.
//
// Inferred (no photo shows it): the hem's exact curve, the inner's ends and
// how it follows the fly, the inner doors' outline (from the diagram's zip
// line), the stakes and how far the corners are staked out. Peak vents and
// guy-lines are left out.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

type V2 = [number, number];

const HL = 1.27; // half length, x (100 in)
const HW = 1.015; // half width, z (80 in)
const PEAK = 1.17; // pole height (46 in)
const HEM = 0.025; // the fly's staked points above the ground
const RIDGE_SAG = 0.09; // the ridge's dip midway between the peaks (the side diagram)
const SEAM_SAG = 0.03; // a peak-to-corner seam's dip, per metre: the photos' ends curve in
const HEM_LIFT = 0.035; // the hem's rise between stakes, per metre of hem
const HEM_CUT = 0.022; // and how far it draws in, per metre (a catenary cut)
const BUBBLE = 0.012; // how far a panel's middle gives under its own tension, per metre of panel
const SEGMENTS = 18; // per panel edge

// The inner floor, from the floor plan: a parallelogram with its short sides along z.
const FA: V2 = [-1.1, -0.31], FB: V2 = [1.05, -0.96];
const FC: V2 = [-FA[0], -FA[1]], FD: V2 = [-FB[0], -FB[1]];
const lerp2 = (p: V2, q: V2, t: number): V2 => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
// The poles stand on the inner's long sides, a fifth of the way along.
const PEAK_AT = 0.2;
const P1 = lerp2(FA, FB, PEAK_AT), P2 = lerp2(FC, FD, PEAK_AT);
// The doors' zips run straight down from the peaks to the long hems.
const D1: V2 = [P1[0], -HW], D2: V2 = [P2[0], HW];

const PLAN = { C1: [-HL, -HW], C2: [HL, -HW], C3: [HL, HW], C4: [-HL, HW], P1, P2, D1, D2 } as const satisfies Record<string, V2>;
type Corner = keyof typeof PLAN;

// The fly's panels. The front door (C4 D2 P2) is built on its own.
const ROOF: Corner[][] = [
  ['C4', 'P2', 'P1'], // front roof
  ['C2', 'P1', 'P2'], // back roof
  ['C1', 'C4', 'P1'], // left end, under the back peak
  ['C3', 'C2', 'P2'], // right end, under the front peak
  ['D2', 'C3', 'P2'], // front logo panel
  ['D1', 'C1', 'P1'], // back logo panel
  ['C2', 'D1', 'P1'], // back door, zipped shut
];
const FRONT_DOOR: Corner[] = ['C4', 'D2', 'P2'];
const PANELS = [...ROOF, FRONT_DOOR];

// The inner, inset from its floor plan so the poles stand just outside it.
const INNER_GAP = 0.07; // its roof under the fly
const INNER_INSET_A = 0.02, INNER_INSET_B = 0.035; // along its long sides, and across them
const TUB = 0.14; // bathtub floor height
// Its doors, along each long side as a share of its length: from here to just short of the pole.
const INNER_DOOR = [0.26, 0.74] as const;

const COLORS = {
  fly: '#93b0a8',
  seam: '#6f9489',
  dark: '#1b1d1e',
  pole: '#3a3d40',
  stake: '#b9bcbd',
  floor: '#b7bfbf',
  mesh: '#2c3133',
};

function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The fly ----------------------------------------------------------------
// Flat triangles between the poles' tips and the stakes, with three things
// on top: the ridge sags, the hems rise and draw in between stakes, and each
// panel gives a little in its middle. The edge terms are shared by the two
// panels either side of an edge, so the cloth stays whole across the seams.

const at3 = (c: Corner) => new THREE.Vector3(PLAN[c][0], c[0] === 'P' ? PEAK : HEM, PLAN[c][1]);
const MIDDLE = new THREE.Vector3(0, 0.35, 0);

/** Panel tri's flat normal, out of the tent. */
function outwardNormal(tri: Corner[]) {
  const v = tri.map(at3);
  const n = new THREE.Vector3().subVectors(v[1], v[0]).cross(new THREE.Vector3().subVectors(v[2], v[0])).normalize();
  const centre = v[0].clone().add(v[1]).add(v[2]).divideScalar(3);
  return n.dot(centre.sub(MIDDLE)) < 0 ? n.negate() : n;
}
const isHem = (a: Corner, b: Corner) => a[0] !== 'P' && b[0] !== 'P';

/** How far the cloth along edge a-b sits from the straight line between them, t of the way along. */
function edgeOffset(a: Corner, b: Corner, t: number) {
  const bump = 4 * t * (1 - t);
  if (a[0] === 'P' && b[0] === 'P') return new THREE.Vector3(0, -RIDGE_SAG * bump, 0);
  // Seams from a peak to a corner hang a little; zips and door hinges are pulled straight.
  const seam = (a[0] === 'P' && b[0] === 'C') || (a[0] === 'C' && b[0] === 'P');
  const hinge = (a === 'C4' && b === 'P2') || (a === 'P2' && b === 'C4') || (a === 'C2' && b === 'P1') || (a === 'P1' && b === 'C2');
  if (seam && !hinge) return new THREE.Vector3(0, -SEAM_SAG * at3(a).distanceTo(at3(b)) * bump, 0);
  if (!isHem(a, b)) return new THREE.Vector3();
  const pa = PLAN[a], pb = PLAN[b];
  const len = Math.hypot(pb[0] - pa[0], pb[1] - pa[1]);
  // In toward the middle of the plan, square to the hem.
  let nx = -(pb[1] - pa[1]) / len, nz = (pb[0] - pa[0]) / len;
  const mx = (pa[0] + pb[0]) / 2, mz = (pa[1] + pb[1]) / 2;
  if (nx * mx + nz * mz > 0) (nx = -nx), (nz = -nz);
  return new THREE.Vector3(nx * HEM_CUT * len * bump, HEM_LIFT * len * bump, nz * HEM_CUT * len * bump);
}

/** A point on panel [a, b, c] at barycentric weights (wa, wb, wc). */
function panelPoint(tri: Corner[], w: [number, number, number]) {
  const v = tri.map(at3);
  const p = new THREE.Vector3();
  v.forEach((q, i) => p.addScaledVector(q, w[i]));
  for (let i = 0; i < 3; i++) {
    const j = (i + 1) % 3, k = (i + 2) % 3;
    const s = w[i] + w[j];
    if (s < 1e-9) continue;
    // Full at the edge, fading out towards the far corner.
    p.addScaledVector(edgeOffset(tri[i], tri[j], w[j] / s), (1 - w[k]) ** 3);
  }
  const size = Math.sqrt(new THREE.Vector3().subVectors(v[1], v[0]).cross(new THREE.Vector3().subVectors(v[2], v[0])).length() / 2);
  return p.addScaledVector(outwardNormal(tri), -BUBBLE * size * 27 * w[0] * w[1] * w[2]);
}

/** Panel [a, b, c] as a triangle grid, with uvs laid flat in its own plane at the cloth's scale. */
function panelGeometry(tri: Corner[]) {
  const v = tri.map(at3);
  const u = new THREE.Vector3().subVectors(v[1], v[0]).normalize();
  const n = outwardNormal(tri);
  const w = new THREE.Vector3().crossVectors(n, u);
  // Wound to face out, whichever way round the corners were listed.
  const flip = new THREE.Vector3().subVectors(v[1], v[0]).cross(new THREE.Vector3().subVectors(v[2], v[0])).dot(n) < 0;
  const pos: number[] = [], uv: number[] = [], index: number[] = [];
  const row: number[] = [];
  let k = 0;
  for (let i = 0; i <= SEGMENTS; i++) {
    row.push(k);
    for (let j = 0; j <= SEGMENTS - i; j++) {
      const wb = j / SEGMENTS, wc = i / SEGMENTS;
      const p = panelPoint(tri, [1 - wb - wc, wb, wc]);
      pos.push(p.x, p.y, p.z);
      const d = p.clone().sub(v[0]);
      uv.push(d.dot(u) / 0.6, d.dot(w) / 0.6);
      k++;
    }
  }
  for (let i = 0; i < SEGMENTS; i++) {
    for (let j = 0; j < SEGMENTS - i; j++) {
      const a = row[i] + j, b = a + 1, c = row[i + 1] + j;
      if (flip) index.push(a, c, b);
      else index.push(a, b, c);
      if (j < SEGMENTS - i - 1) {
        if (flip) index.push(b, c, c + 1);
        else index.push(b, c + 1, c);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

/** Barycentric weights of plan point (x, z) in plan triangle tri, or null when it falls outside. */
function planWeights(tri: Corner[], x: number, z: number): [number, number, number] | null {
  const [a, b, c] = tri.map((t) => PLAN[t]);
  const det = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
  const wa = ((b[1] - c[1]) * (x - c[0]) + (c[0] - b[0]) * (z - c[1])) / det;
  const wb = ((c[1] - a[1]) * (x - c[0]) + (a[0] - c[0]) * (z - c[1])) / det;
  const wc = 1 - wa - wb;
  return wa >= -1e-6 && wb >= -1e-6 && wc >= -1e-6 ? [wa, wb, wc] : null;
}

/** The fly's height over plan point (x, z) (near enough: the hem's draw-in is ignored). */
function flyHeight(x: number, z: number) {
  for (const tri of PANELS) {
    const w = planWeights(tri, x, z);
    if (w) return panelPoint(tri, w).y;
  }
  return 0;
}

/** A curve along the fly's edge a-b, lifted off the cloth by `lift`, away from the tent's middle. */
function edgeCurve(a: Corner, b: Corner, lift: number, from = 0, to = 1) {
  const pa = at3(a), pb = at3(b);
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 16; i++) {
    const t = from + ((to - from) * i) / 16;
    const p = pa.clone().lerp(pb, t).add(edgeOffset(a, b, t));
    pts.push(p.addScaledVector(p.clone().sub(MIDDLE).normalize(), lift));
  }
  return new THREE.CatmullRomCurve3(pts);
}

// Cloth texture -----------------------------------------------------------
// Dyneema's crinkle: short, straight creases at every angle (it creases like
// paper, not like nylon), a few broad ones, and its pale mottling where the
// fibres show through. Drawn into canvases; the colour comes from the material.

function dcfMaps() {
  const S = 512;
  const r = rng(23);
  const height = new Float32Array(S * S);
  const stroke = (len: number, width: number, amp: number) => {
    let x = r() * S, y = r() * S;
    const a = r() * Math.PI;
    const cx = Math.cos(a), cy = Math.sin(a);
    for (let s = 0; s < len; s++) {
      const taper = Math.sin((Math.PI * s) / len);
      const reach = Math.ceil(width * 2.2);
      for (let o = -reach; o <= reach; o++) {
        const px = Math.round(x - cy * o), py = Math.round(y + cx * o);
        const i = (((py % S) + S) % S) * S + (((px % S) + S) % S);
        // A ridge with a sharp crest: crinkles fold, they don't roll.
        height[i] += amp * taper * Math.max(0, 1 - Math.abs(o) / width);
      }
      x += cx;
      y += cy;
    }
  };
  for (let k = 0; k < 900; k++) stroke(6 + r() * 26, 1 + r() * 1.5, 0.15 + r() * 0.25);
  for (let k = 0; k < 40; k++) stroke(60 + r() * 160, 2.5 + r() * 2, 0.3 + r() * 0.3);

  const normal = document.createElement('canvas');
  const rough = document.createElement('canvas');
  const albedo = document.createElement('canvas');
  for (const c of [normal, rough, albedo]) c.width = c.height = S;
  const nctx = normal.getContext('2d')!, rctx = rough.getContext('2d')!, actx = albedo.getContext('2d')!;
  const nimg = nctx.createImageData(S, S), rimg = rctx.createImageData(S, S), aimg = actx.createImageData(S, S);
  const at = (x: number, y: number) => height[((y + S) % S) * S + ((x + S) % S)];
  const n = new THREE.Vector3();
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const hx = (at(x + 1, y) - at(x - 1, y)) * 0.5;
      const hy = (at(x, y + 1) - at(x, y - 1)) * 0.5;
      n.set(-hx, -hy, 1).normalize();
      const o = (y * S + x) * 4;
      nimg.data[o] = (n.x * 0.5 + 0.5) * 255;
      nimg.data[o + 1] = (n.y * 0.5 + 0.5) * 255;
      nimg.data[o + 2] = (n.z * 0.5 + 0.5) * 255;
      // Laminate is glossier than nylon; the crinkle's crests catch the light.
      const crest = THREE.MathUtils.clamp(at(x, y) * 0.8, 0, 1);
      rimg.data[o] = rimg.data[o + 1] = rimg.data[o + 2] = (0.52 - 0.22 * crest) * 255;
      // The creases turn the laminate white where it's been folded.
      const white = Math.min(1, Math.max(0, at(x, y) - 0.15) * 0.9);
      const a = 214 + 41 * white;
      aimg.data[o] = aimg.data[o + 1] = aimg.data[o + 2] = a;
      nimg.data[o + 3] = rimg.data[o + 3] = aimg.data[o + 3] = 255;
    }
  }
  nctx.putImageData(nimg, 0, 0);
  rctx.putImageData(rimg, 0, 0);
  actx.putImageData(aimg, 0, 0);
  const wrap = (cv: HTMLCanvasElement) => {
    const t = new THREE.CanvasTexture(cv);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 4;
    return t;
  };
  const map = wrap(albedo);
  map.colorSpace = THREE.SRGBColorSpace;
  return { map, normalMap: wrap(normal), roughnessMap: wrap(rough) };
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

function tube(curve: THREE.Curve<THREE.Vector3>, radius: number, segments: number, material: THREE.Material) {
  return new THREE.Mesh(new THREE.TubeGeometry(curve, segments, radius, 5, false), material);
}

function cylinder(from: THREE.Vector3, to: THREE.Vector3, r0: number, r1: number, material: THREE.Material) {
  const len = from.distanceTo(to);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, len, 8), material);
  m.position.copy(from).lerp(to, 0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize());
  return m;
}

/** Durston's logo, a triangle with a tree cut from it, lying on panel tri near its hem. */
function logo(tri: Corner[], hemFrom: Corner, hemTo: Corner, along: number, material: THREE.Material) {
  const shape = new THREE.Shape();
  const s = 0.15; // side
  const h = (s * Math.sqrt(3)) / 2;
  shape.moveTo(-s / 2, 0).lineTo(s / 2, 0).lineTo(0, h).closePath();
  const hole = new THREE.Path();
  const t = 0.011, ih = h - 3 * t, is = (ih * 2) / Math.sqrt(3);
  hole.moveTo(-is / 2, t).lineTo(is / 2, t).lineTo(0, t + ih).closePath();
  shape.holes.push(hole);
  const tree = new THREE.Shape();
  tree.moveTo(-0.03, 0.04).lineTo(0.03, 0.04).lineTo(0, 0.1).closePath();
  const trunk = new THREE.Shape();
  trunk.moveTo(-0.004, t).lineTo(0.004, t).lineTo(0.004, 0.041).lineTo(-0.004, 0.041).closePath();
  const geo = mergeGeometries([new THREE.ShapeGeometry(shape), new THREE.ShapeGeometry(tree), new THREE.ShapeGeometry(trunk)]);
  // On the panel: x along the hem, y up the panel, z out of it.
  const n = outwardNormal(tri);
  const a = at3(hemFrom), b = at3(hemTo);
  const x = b.clone().sub(a).normalize();
  const y = new THREE.Vector3().crossVectors(n, x);
  const base = a.clone().lerp(b, along).add(edgeOffset(hemFrom, hemTo, along)).addScaledVector(y, 0.07).addScaledVector(n, 0.003);
  const m = new THREE.Mesh(geo, material);
  m.matrix.makeBasis(x, y, n).setPosition(base);
  m.matrix.decompose(m.position, m.quaternion, m.scale);
  return m;
}

/** A stake out from a staked point, along plan direction (dx, dz): its short cord and the stake's head. */
function stakeOut(c: Corner, dx: number, dz: number, cord: THREE.Material, alu: THREE.Material) {
  const p = at3(c);
  const len = Math.hypot(dx, dz);
  const head = new THREE.Vector3(p.x + (dx / len) * 0.16, 0.035, p.z + (dz / len) * 0.16);
  const line = cylinder(p, head, 0.0015, 0.0015, cord);
  // Leaning back from the pull, mostly buried.
  const stake = cylinder(head.clone().add(new THREE.Vector3(-(dx / len) * 0.02, -0.06, -(dz / len) * 0.02)), head.clone().setY(0.045), 0.004, 0.004, alu);
  return [line, stake];
}

// The inner -----------------------------------------------------------------

/** A point on the inner's floor plan: a along its long sides (0 at the left end), b across them (0 at the back). */
function floorAt(a: number, b: number): V2 {
  a = INNER_INSET_A + a * (1 - 2 * INNER_INSET_A);
  b = INNER_INSET_B + b * (1 - 2 * INNER_INSET_B);
  return [FA[0] + a * (FB[0] - FA[0]) + b * (FD[0] - FA[0]), FA[1] + a * (FB[1] - FA[1]) + b * (FD[1] - FA[1])];
}

/** The inner's roof over (a, b): under the fly, never lower than its tub. */
const innerTop = (a: number, b: number) => Math.max(TUB + 0.03, flyHeight(...floorAt(a, b)) - INNER_GAP);
const tubTop = (a: number, b: number) => Math.min(TUB, innerTop(a, b) - 0.03);

/** A strip up the inner's side between heights lo(s) and hi(s), walking the floor's edge from (a0, b0) to (a1, b1). */
function innerWall(
  a0: number, b0: number, a1: number, b1: number,
  lo: (a: number, b: number) => number, hi: (a: number, b: number) => number,
  nu: number, nv: number,
) {
  const pos: number[] = [], index: number[] = [];
  const params: number[] = []; // per vertex: s along, f up (for the door's roll)
  for (let i = 0; i <= nu; i++) {
    const s = i / nu;
    const a = a0 + (a1 - a0) * s, b = b0 + (b1 - b0) * s;
    const [x, z] = floorAt(a, b);
    const y0 = lo(a, b), y1 = hi(a, b);
    for (let j = 0; j <= nv; j++) {
      pos.push(x, y0 + ((y1 - y0) * j) / nv, z);
      params.push(s, j / nv);
    }
  }
  for (let i = 0; i < nu; i++) {
    for (let j = 0; j < nv; j++) {
      const a = i * (nv + 1) + j, b = a + nv + 1;
      index.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(index);
  g.computeVertexNormals();
  return { geometry: g, params };
}

/** The inner's sides, walked round the floor: back (b 0), right end (a 1), front (b 1), left end (a 0). Doors left out. */
const INNER_EDGES: [number, number, number, number][] = [
  [0, 0, INNER_DOOR[0], 0], [INNER_DOOR[1], 0, 1, 0],
  [1, 0, 1, 1],
  [1, 1, INNER_DOOR[1], 1], [INNER_DOOR[0], 1, 0, 1],
  [0, 1, 0, 0],
];

function buildInner(mats: XMidMaterials) {
  const inner = new THREE.Group();
  inner.name = 'xmid-inner';
  const zero = () => 0.004;

  // The tub: its floor and the solid band round its foot.
  const floorPts: number[] = [];
  const corners = [floorAt(0, 0), floorAt(1, 0), floorAt(1, 1), floorAt(0, 1)];
  for (const k of [0, 2, 1, 0, 3, 2]) floorPts.push(corners[k][0], 0.004, corners[k][1]);
  const floorGeo = new THREE.BufferGeometry();
  floorGeo.setAttribute('position', new THREE.Float32BufferAttribute(floorPts, 3));
  floorGeo.computeVertexNormals();
  const tubPieces = [new THREE.Mesh(floorGeo)];
  for (const [a0, b0, a1, b1] of [[0, 0, 1, 0], [1, 0, 1, 1], [1, 1, 0, 1], [0, 1, 0, 0]]) {
    tubPieces.push(new THREE.Mesh(innerWall(a0, b0, a1, b1, zero, tubTop, 24, 1).geometry));
  }
  const tub = merged(tubPieces, mats.floor, 'inner-tub');

  // The mesh: its walls (doors apart) and its roof, following the fly.
  const meshPieces: THREE.Mesh[] = [];
  for (const [a0, b0, a1, b1] of INNER_EDGES) {
    meshPieces.push(new THREE.Mesh(innerWall(a0, b0, a1, b1, tubTop, innerTop, Math.max(2, Math.round(Math.hypot(a1 - a0, b1 - b0) * 28)), 6).geometry));
  }
  const NA = 40, NB = 24;
  const roofPos: number[] = [], roofIdx: number[] = [];
  for (let j = 0; j <= NB; j++) {
    for (let i = 0; i <= NA; i++) {
      const [x, z] = floorAt(i / NA, j / NB);
      roofPos.push(x, innerTop(i / NA, j / NB), z);
    }
  }
  for (let j = 0; j < NB; j++) {
    for (let i = 0; i < NA; i++) {
      const a = j * (NA + 1) + i;
      roofIdx.push(a, a + NA + 1, a + 1, a + 1, a + NA + 1, a + NA + 2);
    }
  }
  const roofGeo = new THREE.BufferGeometry();
  roofGeo.setAttribute('position', new THREE.Float32BufferAttribute(roofPos, 3));
  roofGeo.setIndex(roofIdx);
  roofGeo.computeVertexNormals();
  meshPieces.push(new THREE.Mesh(roofGeo));

  // Black binding where the mesh meets the roof and the tub, and up its corners.
  const binding: THREE.Mesh[] = [];
  const along = (a0: number, b0: number, a1: number, b1: number, y: (a: number, b: number) => number) => {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 20; i++) {
      const a = a0 + ((a1 - a0) * i) / 20, b = b0 + ((b1 - b0) * i) / 20;
      const [x, z] = floorAt(a, b);
      pts.push(new THREE.Vector3(x, y(a, b), z));
    }
    return tube(new THREE.CatmullRomCurve3(pts), 0.0025, 40, mats.dark);
  };
  for (const [a0, b0, a1, b1] of [[0, 0, 1, 0], [1, 0, 1, 1], [1, 1, 0, 1], [0, 1, 0, 0]]) {
    binding.push(along(a0, b0, a1, b1, innerTop), along(a0, b0, a1, b1, tubTop));
  }
  for (const [a, b] of [[0, 0], [1, 0], [1, 1], [0, 1]]) {
    const [x, z] = floorAt(a, b);
    binding.push(cylinder(new THREE.Vector3(x, tubTop(a, b), z), new THREE.Vector3(x, innerTop(a, b), z), 0.0025, 0.0025, mats.dark));
  }
  // Each door's zip: up beside the pole and along the tub.
  for (const b of [0, 1]) {
    const peakSide = b === 1 ? INNER_DOOR[1] : INNER_DOOR[0];
    const [x, z] = floorAt(peakSide, b);
    binding.push(cylinder(new THREE.Vector3(x, tubTop(peakSide, b), z), new THREE.Vector3(x, innerTop(peakSide, b), z), 0.003, 0.003, mats.dark));
  }

  // The doors, mesh panels under each peak. The back one stays zipped (so it's part of the mesh);
  // the front one rolls up to its top edge to open.
  const back = innerWall(INNER_DOOR[0], 0, INNER_DOOR[1], 0, tubTop, innerTop, 16, 10).geometry;
  meshPieces.push(new THREE.Mesh(back));
  const { geometry: doorGeo, params } = innerWall(INNER_DOOR[1], 1, INNER_DOOR[0], 1, tubTop, innerTop, 16, 10);
  const door = new THREE.Mesh(doorGeo, mats.mesh);
  door.name = 'inner-door';
  door.renderOrder = 1;
  const base = Float32Array.from(doorGeo.getAttribute('position').array);
  const mesh = merged(meshPieces, mats.mesh, 'inner-mesh');
  mesh.renderOrder = 1;
  inner.add(tub, mesh, detail(merged(binding, mats.dark, 'inner-binding')), door);
  // Out of the tent, square to the front wall.
  const wall = new THREE.Vector2(FC[0] - FD[0], FC[1] - FD[1]).normalize();
  const out = new THREE.Vector3(-wall.y, 0, wall.x);
  if (out.z < 0) out.negate();
  const position = doorGeo.getAttribute('position') as THREE.BufferAttribute;
  /** 0 zipped shut .. 1 rolled up under its top edge, a little proud of the wall. */
  const setOpen = (k: number) => {
    const n = position.count;
    for (let i = 0; i < n; i++) {
      const f = params[2 * i + 1];
      // The top of this vertex's column (columns of 11, bottom to top).
      const top = base[3 * (i - (i % 11) + 10) + 1], y = base[3 * i + 1];
      position.setXYZ(
        i,
        base[3 * i] + out.x * 0.025 * k * (1 - f),
        top - (top - y) * (1 - 0.9 * k),
        base[3 * i + 2] + out.z * 0.025 * k * (1 - f),
      );
    }
    position.needsUpdate = true;
    doorGeo.computeVertexNormals();
  };
  return { inner, setOpen };
}

// The model ---------------------------------------------------------------

export type XMidMaterials = {
  /** The fly's Dyneema: its crinkle, mottling and roughness are set here. */
  cloth: THREE.MeshStandardMaterial;
  /** The front door's Dyneema, kept apart from the fly so it can glow on its own. */
  doorCloth: THREE.MeshStandardMaterial;
  /** The bonded seams' darker tape. */
  seam: THREE.MeshStandardMaterial;
  /** Zips, cord, binding, the logo and the poles' grips. */
  dark: THREE.MeshStandardMaterial;
  pole: THREE.MeshStandardMaterial;
  stake: THREE.MeshStandardMaterial;
  /** The inner's bathtub floor. */
  floor: THREE.MeshStandardMaterial;
  /** The inner's no-see-um mesh. */
  mesh: THREE.MeshStandardMaterial;
};

export const XMID_COLOURS = COLORS;
/** Turns the fly's frame so the inner's long axis runs along x (its front door still towards +z). */
export const XMID_YAW = Math.atan2(FB[1] - FA[1], FB[0] - FA[0]);
export const XMID_PEAK = PEAK;
/** Fly corners in plan, for anyone fitting the tent to the ground. */
export const XMID_FOOTPRINT = { halfLength: HL, halfWidth: HW };

/** The X-Mid, in the given materials: the fly, its front door, the inner (with its doors) and the poles and stakes. */
export function buildXMid(mats: XMidMaterials) {
  const root = new THREE.Group();
  root.name = 'xmid';

  const { map, normalMap, roughnessMap } = dcfMaps();
  for (const cloth of [mats.cloth, mats.doorCloth]) {
    cloth.map = map;
    cloth.roughness = 1;
    cloth.roughnessMap = roughnessMap;
    cloth.normalMap = normalMap;
    cloth.normalScale.set(0.9, 0.9);
    cloth.side = THREE.DoubleSide;
  }
  mats.floor.side = THREE.DoubleSide;
  mats.mesh.side = THREE.DoubleSide;

  // Fly
  const fly = new THREE.Group();
  fly.name = 'xmid-fly';
  const membrane = new THREE.Mesh(mergeGeometries(ROOF.map(panelGeometry)), mats.cloth);
  membrane.name = 'fly-membrane';
  fly.add(membrane);

  // The bonded seams: the ridge, each peak down to its corners, and the door hinges.
  const seamEdges: [Corner, Corner][] = [['P1', 'P2'], ['P1', 'C1'], ['P1', 'C4'], ['P2', 'C2'], ['P2', 'C3'], ['P2', 'C4'], ['P1', 'C2']];
  const seams = merged(seamEdges.map(([a, b]) => tube(edgeCurve(a, b, 0.002), 0.003, 32, mats.seam)), mats.seam, 'fly-seams');
  // The zips down from each peak, the logos, the poles' tip caps and the cords to the stakes.
  const dark: THREE.Object3D[] = [
    tube(edgeCurve('P2', 'D2', 0.003, 0.03, 1), 0.0028, 24, mats.dark),
    tube(edgeCurve('P1', 'D1', 0.003, 0.03, 1), 0.0028, 24, mats.dark),
    logo(['D2', 'C3', 'P2'], 'D2', 'C3', 0.32, mats.dark),
    logo(['D1', 'C1', 'P1'], 'D1', 'C1', 0.32, mats.dark),
  ];
  for (const p of [at3('P1'), at3('P2')]) dark.push(cylinder(p.clone().setY(PEAK - 0.012), p.clone().setY(PEAK + 0.022), 0.012, 0.009, mats.dark));
  const stakes: THREE.Object3D[] = [];
  const stakeDirs: [Corner, number, number][] = [['C1', -1, -0.8], ['C2', 1, -0.8], ['C3', 1, 0.8], ['C4', -1, 0.8], ['D1', 0, -1], ['D2', 0, 1]];
  for (const [c, dx, dz] of stakeDirs) {
    const [line, stake] = stakeOut(c, dx, dz, mats.dark, mats.stake);
    dark.push(line);
    stakes.push(stake);
  }
  // The trekking poles' grips (handles down) are dark too, so they draw with the trim.
  for (const p of [at3('P1'), at3('P2')]) dark.push(cylinder(p.clone().setY(0), p.clone().setY(0.17), 0.016, 0.014, mats.dark));
  membrane.add(detail(seams), detail(merged(dark, mats.dark, 'fly-trim')));
  fly.add(merged(stakes, mats.stake, 'stakes'));
  root.add(fly);

  // The front door, hinged on its seam from the far corner up to the peak. It opens up and over
  // onto the roof, folded on itself (rolled, near enough), as it's tied back in the photos.
  const c4 = at3('C4'), p2 = at3('P2');
  const hingeX = p2.clone().sub(c4).normalize();
  const toZip = at3('D2').sub(c4);
  const hingeY = toZip.clone().addScaledVector(hingeX, -toZip.dot(hingeX)).normalize();
  const hingeZ = new THREE.Vector3().crossVectors(hingeX, hingeY);
  const frame = new THREE.Matrix4().makeBasis(hingeX, hingeY, hingeZ).setPosition(c4);
  const toLocal = frame.clone().invert();
  const doorGeo = panelGeometry(FRONT_DOOR).applyMatrix4(toLocal);
  const doorPanel = new THREE.Mesh(doorGeo, mats.doorCloth);
  doorPanel.name = 'xmid-door-panel';
  const doorEdge = tube(edgeCurve('P2', 'D2', 0.0015, 0.03, 1), 0.0022, 24, mats.dark);
  doorEdge.geometry.applyMatrix4(toLocal);
  doorPanel.add(detail(doorEdge));
  const door = new THREE.Group();
  door.name = 'xmid-door';
  door.matrix.copy(frame);
  door.matrix.decompose(door.position, door.quaternion, door.scale);
  door.add(doorPanel);
  // How far it turns to lie on the roof: the roof's direction off the hinge, about the hinge,
  // turning through the outside of the tent (the side the panel faces, +z here or -z).
  const roof = at3('P1').applyMatrix4(toLocal);
  const outward = hingeZ.dot(new THREE.Vector3(0, 0.4, 0).sub(c4.clone().lerp(at3('D2'), 0.5)).negate()) > 0 ? 1 : -1;
  let fold = Math.atan2(roof.z, roof.y);
  if (outward > 0 && fold < 0) fold += 2 * Math.PI;
  if (outward < 0 && fold > 0) fold -= 2 * Math.PI;
  fold -= outward * 0.05;
  root.add(door);

  const { inner, setOpen: setInnerOpen } = buildInner(mats);
  root.add(inner);

  // Poles: two trekking poles, grips down (with the fly's trim), tips up into the peaks.
  const poles: THREE.Object3D[] = [];
  for (const p of [at3('P1'), at3('P2')]) {
    const foot = p.clone().setY(0);
    poles.push(
      cylinder(foot.clone().setY(0.17), foot.clone().setY(0.62), 0.009, 0.009, mats.pole),
      cylinder(foot.clone().setY(0.6), foot.clone().setY(0.64), 0.0115, 0.0115, mats.pole), // a section's clamp
      cylinder(foot.clone().setY(0.62), p.clone().setY(PEAK - 0.01), 0.0075, 0.006, mats.pole),
    );
  }
  const frameGroup = new THREE.Group();
  frameGroup.name = 'xmid-poles';
  frameGroup.add(merged(poles, mats.pole, 'trekking-poles'));
  root.add(frameGroup);

  /** 0 zipped .. 1 open: the fly's door folds back onto the roof, and the inner's rolls up. */
  const setDoor = (k: number) => {
    const e = k * k * (3 - 2 * k);
    doorPanel.rotation.x = fold * e;
    // Rolled as it goes over, so it lies along the hinge as a band, not a second roof.
    doorPanel.scale.y = 1 - 0.8 * e;
    setInnerOpen(Math.min(1, k * 1.3));
  };

  return { root, fly, door, inner, poles: frameGroup, setDoor, textures: [map, normalMap, roughnessMap] };
}

/** Plan point (x, z) in the fly's frame, turned into the tent's frame (by XMID_YAW). */
export function xmidToTent(x: number, z: number): V2 {
  const c = Math.cos(XMID_YAW), s = Math.sin(XMID_YAW);
  return [x * c + z * s, -x * s + z * c];
}
