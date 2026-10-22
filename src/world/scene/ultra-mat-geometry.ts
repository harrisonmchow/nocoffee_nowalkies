// The EXPED Ultra 5R sleeping mat (size M), drawn in code from the product
// photos (top views, a three-quarter view from the foot, close-ups of the
// valves and the tubes) and its listed size, 183 x 52 x 7 cm.
//
// How it's built: one welded shell. Across, seven tubes run head to toe, each
// a round crown, pinched to a V at the welds between them; the outer tubes
// round down to the seam at mid-height. Along, each tube closes in a dome, so
// the head and foot edges are scalloped, one lobe per tube. The top and the
// underside are the same surface mirrored about mid-height and meet at that
// seam, so the shell is closed. Two flat valves sit on the foot end's top, and
// the EXPED wordmark runs along the other side's outer tube near the head.
//
// Y up, metres, lying on y 0, centred, along x: head toward -x, foot (and the
// valves) toward +x; the valves on the +z side, the wordmark on the -z side.
//
// Inferred (no photo shows it): the underside mirrors the top; which side the
// valves sit on; the letters' stroke shapes, simplified. The ripstop grid and
// the SYNMAT print are below a pixel at any distance the camp shows them.
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export const ULTRA_LENGTH = 1.83;
export const ULTRA_WIDTH = 0.52;
export const ULTRA_THICKNESS = 0.07;
const TUBES = 7;
const PITCH = ULTRA_WIDTH / TUBES; // about 7.4 cm
const GROOVE = 0.011; // how far each weld pinches in from the crown, top and bottom
const SCALLOP = 0.008; // how far the tube ends stand proud of the welds at each end, in plan
const DOME = ULTRA_THICKNESS / 2; // each tube's end closes over this length
const HALF = ULTRA_THICKNESS / 2;
// The side walls and the tube ends round over as a superellipse, squarer than a half circle:
// the photos show a near-upright wall with rounded edges, not a sausage.
const SQUARE = 2.8;
const roundOver = (s: number) => Math.pow(Math.max(0, 1 - Math.pow(Math.min(1, s), SQUARE)), 1 / SQUARE);

/** EXPED's Lichen, sampled from the photos' crowns and grooves. */
export const ULTRA_COLOURS = { shell: '#95c11f', valve: '#bcdc52', cord: '#3a3c3e', print: '#f2f5ec' } as const;

export type UltraMaterials = Record<'shell' | 'valve' | 'cord' | 'print', THREE.Material>;

/** Where z falls within its tube: -1 at one weld, 0 on the crown, 1 at the next. */
const inTube = (z: number) => {
  const k = Math.min(TUBES - 1, Math.max(0, Math.floor((z + ULTRA_WIDTH / 2) / PITCH)));
  return ((z + ULTRA_WIDTH / 2 - k * PITCH) / PITCH) * 2 - 1;
};

/** Half the shell's thickness at z, away from the ends: broad crowns, narrow V welds, and the outer tubes rounding down to the side seam. */
function halfThickness(z: number) {
  const u = inTube(z);
  const lobe = HALF - GROOVE * (1 - Math.pow(Math.max(0, 1 - u * u), 0.32));
  const out = Math.max(0, (Math.abs(z) - (ULTRA_WIDTH / 2 - HALF)) / HALF);
  return lobe * roundOver(out);
}

/** Where the shell ends along x at z: each tube's dome stands proud of the welds, so the end is scalloped. */
const endX = (z: number) => {
  const u = inTube(z);
  return ULTRA_LENGTH / 2 - SCALLOP * (1 - Math.sqrt(Math.max(0, 1 - u * u)));
};

/** The top surface's height at (x, z), for things that sit on the mat. */
export function ultraTop(x: number, z: number) {
  const e = endX(z);
  const into = Math.max(0, (Math.abs(x) - (e - DOME)) / DOME);
  return HALF + halfThickness(z) * roundOver(into);
}

/** The shell: a grid over plan, the top and the underside mirrored, welded at their shared rim. */
function shell() {
  // Across: each tube's samples bunch toward its welds, where the V is, and toward the side seams.
  const zs: number[] = [];
  const perTube = 8;
  for (let k = 0; k < TUBES; k++) {
    for (let i = 0; i < perTube; i++) {
      const u = -Math.cos((Math.PI * i) / perTube);
      zs.push(-ULTRA_WIDTH / 2 + (k + (u + 1) / 2) * PITCH);
    }
  }
  zs.push(ULTRA_WIDTH / 2);
  // Along: a few rows down the flat middle, and a quarter circle into each end's dome.
  const mid = 6, end = 8;
  const along: { t: number; dome: number; sign: number }[] = [];
  for (let j = end; j > 0; j--) along.push({ t: 0, dome: (Math.PI / 2) * (j / end), sign: -1 });
  for (let j = 0; j <= mid; j++) along.push({ t: j / mid, dome: 0, sign: 0 });
  for (let j = 1; j <= end; j++) along.push({ t: 1, dome: (Math.PI / 2) * (j / end), sign: 1 });
  const pos: number[] = [];
  const index: number[] = [];
  const cols = zs.length, rows = along.length;
  for (const side of [1, -1]) {
    const base = pos.length / 3;
    for (const a of along) {
      for (const z of zs) {
        const e = endX(z);
        const into = Math.sin(a.dome);
        const x = a.sign === 0 ? -(e - DOME) + a.t * 2 * (e - DOME) : a.sign * (e - DOME + DOME * into);
        const h = halfThickness(z) * roundOver(into);
        pos.push(x, HALF + side * h, z);
      }
    }
    for (let r = 0; r < rows - 1; r++) {
      for (let c = 0; c < cols - 1; c++) {
        const a = base + r * cols + c, b = a + 1, d = a + cols, e = d + 1;
        // Diagonals alternate, so a weld's normals aren't dragged to one side by the long
        // quads down the middle. Wound to face out: up for the top, down for the underside.
        const tris = (r + c) % 2 === 0 ? [a, b, d, b, e, d] : [a, b, e, a, e, d];
        if (side < 0) for (let k = 0; k < tris.length; k += 3) [tris[k + 1], tris[k + 2]] = [tris[k + 2], tris[k + 1]];
        index.push(...tris);
      }
    }
  }
  let g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(index);
  // The rim's vertices are shared by top and underside: weld them so the normals round over the seam.
  g = mergeVertices(g, 1e-5);
  g.computeVertexNormals();
  return g;
}

/** A flat valve: its flange set into the shell and the raised ring of its seat. */
function valve(x: number, z: number) {
  const y = ultraTop(x, z);
  const parts: THREE.BufferGeometry[] = [];
  const flange = new THREE.CylinderGeometry(0.028, 0.03, 0.006, 20);
  flange.translate(x, y + 0.001, z);
  parts.push(flange);
  const ring = new THREE.TorusGeometry(0.017, 0.004, 6, 20);
  ring.rotateX(Math.PI / 2);
  ring.translate(x, y + 0.005, z);
  parts.push(ring);
  // Its lid, shut, as it is once the mat's blown up, with its tab toward the foot.
  const lid = new THREE.CylinderGeometry(0.022, 0.022, 0.004, 18);
  lid.translate(x, y + 0.008, z);
  parts.push(lid);
  const tab = new THREE.BoxGeometry(0.018, 0.003, 0.014);
  tab.translate(x + 0.028, y + 0.007, z);
  parts.push(tab);
  return mergeGeometries(parts.map((p) => p.toNonIndexed()))!;
}

/** The IN lid's cord: a loop from its tab, lying slack on the shell beside the valve, toward the edge. */
function cordLoop(x: number, z: number) {
  const at = (dx: number, dz: number, lift = 0.0018) => new THREE.Vector3(x + dx, ultraTop(x + dx, z + dz) + lift, z + dz);
  const curve = new THREE.CatmullRomCurve3([
    at(0.034, 0, 0.009),
    at(0.042, 0.028),
    at(0.022, 0.05),
    at(0.002, 0.042),
    at(0.016, 0.031),
    at(0.03, 0.01, 0.008),
  ]);
  return new THREE.TubeGeometry(curve, 16, 0.0016, 4, false).toNonIndexed();
}

// The wordmark's strokes on a 2 x 3 grid per letter: [a0, b0, a1, b1], a along the reading direction, b up.
const LETTERS: [number, number, number, number][][] = [
  [[0, 0, 0, 3], [0, 3, 2, 3], [0, 1.5, 1.6, 1.5], [0, 0, 2, 0]], // E
  [[0, 0, 2, 3], [0, 3, 2, 0]], // X
  [[0, 0, 0, 3], [0, 3, 2, 3], [2, 3, 2, 1.5], [0, 1.5, 2, 1.5]], // P
  [[0, 0, 0, 3], [0, 3, 2, 3], [0, 1.5, 1.6, 1.5], [0, 0, 2, 0]], // E
  [[0, 0, 0, 3], [0, 3, 1.5, 3], [2, 2.5, 2, 0.5], [0, 0, 1.5, 0]], // D
];

/**
 * EXPED along the -z outer tube near the head, its tops toward that edge, so
 * it reads from the head toward the foot, the right way round from above.
 */
function wordmark() {
  const unit = 0.012; // one grid step: letters 3.6 cm tall
  const stroke = 0.0045;
  const zBase = -ULTRA_WIDTH / 2 + PITCH / 2 + 1.5 * unit;
  const xStart = -ULTRA_LENGTH / 2 + 0.2;
  const parts: THREE.BufferGeometry[] = [];
  LETTERS.forEach((strokes, i) => {
    const x0 = xStart + i * 3.1 * unit;
    for (const [a0, b0, a1, b1] of strokes) {
      // Reading toward +x with tops toward -z.
      const p0 = new THREE.Vector2(x0 + a0 * unit, zBase - b0 * unit);
      const p1 = new THREE.Vector2(x0 + a1 * unit, zBase - b1 * unit);
      const mid = p0.clone().add(p1).multiplyScalar(0.5);
      const len = p0.distanceTo(p1) + stroke;
      const bar = new THREE.BoxGeometry(len, 0.0008, stroke);
      bar.rotateY(-Math.atan2(p1.y - p0.y, p1.x - p0.x));
      bar.translate(mid.x, ultraTop(mid.x, mid.y) + 0.0006, mid.y);
      parts.push(bar.toNonIndexed());
    }
  });
  return mergeGeometries(parts)!;
}

/** The mat as a few meshes, one per material. */
export function buildUltraMat(m: UltraMaterials) {
  const meshes: THREE.Mesh[] = [];
  const add = (g: THREE.BufferGeometry, mat: THREE.Material, name: string) => {
    const mesh = new THREE.Mesh(g, mat);
    mesh.name = name;
    meshes.push(mesh);
  };
  add(shell(), m.shell, 'air-body');
  // On the foot end's top, on the two tubes nearest the +z edge, a little in from the domes.
  const vx = ULTRA_LENGTH / 2 - 0.06;
  const zIn = ULTRA_WIDTH / 2 - PITCH * 1.5;
  const zOut = ULTRA_WIDTH / 2 - PITCH * 2.5;
  add(mergeGeometries([valve(vx, zIn), valve(vx, zOut)])!, m.valve, 'valve-cluster');
  add(cordLoop(vx, zIn), m.cord, 'cord-loop');
  add(wordmark(), m.print, 'logo-print');
  return meshes;
}
