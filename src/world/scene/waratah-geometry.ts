// The Neve Gear Waratah down quilt (-6C, Regular), drawn in code from Neve's
// product photos (closed and opened flat from above, the lining, the footbox
// from the side and its end on a mat, the collar's drawcord), laid over the
// sleeping mat with its opening down, as it lies before anyone gets in.
//
// How it's built: one lofted surface swept head to foot. Its section is an
// arch over the mat whose flanks fall past the mat's sides to the floor. Past
// the hips the flanks lift and curl under it, so the footbox is a closed tube
// lying on the mat, and its end closes in a dome gathered by a drawcord. Box
// baffles pinch the loft: lengthwise over the torso, crosswise in the footbox,
// with a chest baffle under the collar. A pale lining sits inside, offset by
// the loft, seen through the head opening. Colour follows Neve's three-panel
// cut: navy, with a black panel down the sleeper's right flank, a black collar
// and a black footbox end.
//
// Y up, metres, origin on the mat's top at its middle (the quilt's own y 0 is
// the mat's top, and its flanks drop MAT below that to the floor). Along x:
// head (collar) toward -x, foot toward +x; the black panel on the +z side.
//
// Inferred (no photo or listing gives it): the size, from the 6' fit and the
// mat in Neve's side photo; how it drapes empty over a mat; the underside, its
// zip and pad straps, which lie hidden under it. The NEVE GEAR and WARATAH
// prints and the taffeta's crinkle are below a pixel at camp distance.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Sampled from Neve's photos: the navy shell's crowns and grooves, the black panels, the lining. */
export const WARATAH_COLOURS = { shell: '#3d5878', panel: '#1c1b1d', lining: '#cdd8e2', cord: '#e8e8e4', hardware: '#202022' } as const;

export type WaratahMaterials = Record<'shell' | 'panel' | 'lining' | 'cord' | 'hardware', THREE.Material>;

const HEAD = -0.56; // the collar's edge, clear of the pillow
const COLLAR = 0.08; // the black collar band
const HIPS = 0.0; // where the flanks start to lift off the floor
const LIFTED = 0.28; // flanks level with the mat's top, and start to curl under
const CLOSED = 0.46; // the footbox closed underneath
const FOOT_BAFFLES = 0.4; // where the baffles turn crosswise
const CAP = 0.8; // the black end cap starts
const FOOT = 0.92; // the gather
const PITCH = 0.085; // the torso's baffle spacing
const FOOT_PITCH = 0.1; // the footbox's: four between its first seam and the cap
const GROOVE = 0.022; // how far each baffle seam pinches the loft
const LOFT = 0.03; // shell to lining
const TORSO = 0.3; // the arch's half-width over the torso: 4 cm clear of a 52 cm mat's sides

const ALONG = 76; // rows from the collar to the cap
const CAP_ROWS = 14;
const ACROSS = 48; // columns, hem to hem; the side panel's edges fall on columns 35 and 43
const PANEL = [0.4583, 0.7917] as const; // the side panel, as a fraction of the half-section from the crown

const smooth = (t: number) => {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** A superellipse's signed coordinate: squarer than a circle, so the quilt rests broad on the mat. */
const sq = (v: number, n = 3) => Math.sign(v) * Math.pow(Math.abs(v), 2 / n);

type Section = { a: number; c: number; yc: number; hem: number; curl: number };

/** The arch's half-width over the torso for a mat `width` wide: 4 cm clear of its sides, and never narrower than over a 52 cm mat. */
export const torsoFor = (width: number) => Math.max(TORSO, width / 2 + 0.04);

/** The section's shape at x (before the cap closes it): half-width, half-height and centre of the arch, how far its flanks have curled under, and the height their hems hang to. */
function sectionAt(x: number, mat: number, torso = TORSO): Section {
  const a = lerp(torso, 0.185, smooth((x - LIFTED) / 0.3));
  // The footbox stands taller than the torso: its loft is top and bottom, and the end puffs up most.
  const c = lerp(0.055, 0.08, smooth((x - HEAD) / 0.3)) + 0.025 * smooth((x - FOOT_BAFFLES) / 0.3) + 0.025 * smooth((x - CAP + 0.12) / 0.12);
  const yc = c + 0.004; // the arch's lowest point clears the mat's crowns
  // The hems hang to the floor over the torso, rise to rest on the mat, then the flanks curl under.
  const hem = lerp(-mat, 0.004, smooth((x - HIPS) / (LIFTED - HIPS)));
  const curl = (Math.PI / 2) * smooth((x - LIFTED) / (CLOSED - LIFTED));
  return { a, c, yc, hem, curl };
}

/**
 * The section as ACROSS + 1 points, hem to hem (z, y), with their outward normals, and the arc
 * position w of each from the crown (metres, signed: + toward +z). Sampled evenly by arc length
 * from a dense outline: the arch's upper quarter, then the curl under, then the flank's drop to
 * its hem, so the section is closed by the floor or the mat wherever it's open.
 */
function sectionPoints(s: Section, mat: number) {
  const dense: [number, number][] = [];
  for (let i = 0; i <= 24; i++) {
    const t = (Math.PI / 2) * (1 - i / 24);
    dense.push([s.a * sq(Math.cos(t)), s.yc + s.c * sq(Math.sin(t))]);
  }
  for (let i = 1; i <= 16 && s.curl > 0; i++) {
    const t = -s.curl * (i / 16);
    dense.push([s.a * sq(Math.cos(t)), s.yc + s.c * sq(Math.sin(t))]);
  }
  const [z0, y0] = dense[dense.length - 1];
  const drop = y0 - s.hem;
  // Falling from there to the hem, flaring a little where it hangs below the mat's top.
  const flare = 0.03 * Math.max(0, -s.hem) / mat;
  for (let i = 1; i <= 12 && drop > 1e-5; i++) {
    const d = i / 12;
    dense.push([z0 + flare * d * d, y0 - drop * d]);
  }
  const len = [0];
  for (let i = 1; i < dense.length; i++) len.push(len[i - 1] + Math.hypot(dense[i][0] - dense[i - 1][0], dense[i][1] - dense[i - 1][1]));
  const half = len[len.length - 1];
  const out: { z: number; y: number; nz: number; ny: number; w: number }[] = [];
  let k = 0;
  for (let i = 0; i <= ACROSS; i++) {
    const f = -1 + (2 * i) / ACROSS;
    const w = Math.abs(f) * half;
    while (k > 0 && len[k] > w) k--;
    while (k < len.length - 2 && len[k + 1] < w) k++;
    const span = len[k + 1] - len[k] || 1;
    const t = Math.min(1, Math.max(0, (w - len[k]) / span));
    const z = lerp(dense[k][0], dense[k + 1][0], t);
    const y = lerp(dense[k][1], dense[k + 1][1], t);
    // Outward: the tangent (toward the hem) turned a quarter, so the crown's points up.
    let tz = dense[k + 1][0] - dense[k][0], ty = dense[k + 1][1] - dense[k][1];
    const tl = Math.hypot(tz, ty) || 1;
    tz /= tl;
    ty /= tl;
    const side = f < 0 ? -1 : 1;
    out.push({ z: side * z, y, nz: -side * ty, ny: tz, w: f * half });
  }
  return { points: out, half };
}

/** How much loft the baffles leave at (x, w): 1 on a crown, 0 in a seam. */
function lobe(x: number, w: number) {
  if (x < HEAD + COLLAR) return 1;
  if (x >= CAP) return 1;
  if (x >= FOOT_BAFFLES) return Math.sqrt(Math.abs(Math.sin((Math.PI * (x - FOOT_BAFFLES)) / FOOT_PITCH)));
  // Lengthwise over the torso, closed off by the chest baffle and the first footbox seam.
  const across = Math.sqrt(Math.abs(Math.cos((Math.PI * w) / PITCH)));
  const ends = Math.sqrt(smooth((x - HEAD - COLLAR) / 0.035) * smooth((FOOT_BAFFLES - x) / 0.035));
  return across * ends;
}

type Row = { x: number; s: Section; k: number; cap: number };

/** Every row's place and section: even steps to the cap, then a quarter turn into its dome. */
function rows(mat: number, torso: number): Row[] {
  const out: Row[] = [];
  for (let j = 0; j <= ALONG; j++) {
    const x = HEAD + ((CAP - HEAD) * j) / ALONG;
    out.push({ x, s: sectionAt(x, mat, torso), k: 1, cap: 0 });
  }
  const end = sectionAt(CAP, mat, torso);
  for (let j = 1; j <= CAP_ROWS; j++) {
    const psi = (Math.PI / 2) * (j / CAP_ROWS);
    // Blunt: the end face stands nearly upright, rounding over only at its shoulders.
    const k = Math.pow(Math.cos(psi), 0.45);
    out.push({ x: CAP + (FOOT - CAP) * Math.sin(psi), s: { ...end, a: end.a * k, c: end.c * k, hem: end.yc - end.c * k }, k, cap: j / CAP_ROWS });
  }
  return out;
}

type Vertex = { outer: THREE.Vector3; inner: THREE.Vector3; w: number };

/** The surface's vertices row by row: the shell, pinched by its baffles, and the lining a loft's depth inside it. */
function sample(mat: number, torso: number) {
  return rows(mat, torso).map((r) =>
    sectionPoints(r.s, mat).points.map((p, i): Vertex => {
      // The collar rolls a little proud; the cap's gathers wrinkle toward the cord.
      const roll = 0.012 * (1 - smooth((r.x - HEAD) / COLLAR));
      const gathers = 0.012 * r.cap * r.cap * Math.sin((i / ACROSS) * Math.PI * 14);
      const d = -GROOVE * (1 - lobe(r.x, p.w)) + roll + gathers;
      const inset = LOFT * r.k;
      return {
        outer: new THREE.Vector3(r.x, p.y + p.ny * d, p.z + p.nz * d),
        inner: new THREE.Vector3(r.x, p.y - p.ny * inset, p.z - p.nz * inset),
        w: i / ACROSS,
      };
    }),
  );
}

/** Which material a cell of the shell takes: the collar, the end cap and the side panel are black. */
function panelled(x: number, f: number) {
  if (x < HEAD + COLLAR || x > CAP) return true;
  return f > PANEL[0] && f < PANEL[1];
}

/** The shell, the lining and the rims joining them, split by material. */
function surfaces(mat: number, torso: number) {
  const grid = sample(mat, torso);
  const R = grid.length, C = ACROSS + 1;
  const pos: number[] = [];
  for (const row of grid) for (const v of row) pos.push(v.outer.x, v.outer.y, v.outer.z);
  const navy: number[] = [], black: number[] = [];
  for (let r = 0; r < R - 1; r++) {
    for (let c = 0; c < C - 1; c++) {
      const a = r * C + c, b = a + 1, d = a + C, e = d + 1;
      const x = (grid[r][c].outer.x + grid[r + 1][c].outer.x) / 2;
      const f = ((c + 0.5) / ACROSS) * 2 - 1;
      // Wound so the outside faces out (rows run toward +x, columns toward +z).
      (panelled(x, f) ? black : navy).push(a, b, d, b, e, d);
    }
  }
  const shell = new THREE.BufferGeometry();
  shell.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  shell.setIndex([...navy, ...black]);
  shell.computeVertexNormals();
  const split = (index: number[]) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', shell.getAttribute('position'));
    g.setAttribute('normal', shell.getAttribute('normal'));
    g.setIndex(index);
    return g;
  };

  // The lining at half the shell's resolution, wound to face in.
  const lin: number[] = [], linIndex: number[] = [];
  const rowsIn = grid.filter((_, r) => r % 2 === 0 || r === R - 1);
  const colsIn = (row: Vertex[]) => row.filter((_, c) => c % 2 === 0);
  for (const row of rowsIn) for (const v of colsIn(row)) lin.push(v.inner.x, v.inner.y, v.inner.z);
  const CI = ACROSS / 2 + 1;
  for (let r = 0; r < rowsIn.length - 1; r++) {
    for (let c = 0; c < CI - 1; c++) {
      const a = r * CI + c, b = a + 1, d = a + CI, e = d + 1;
      linIndex.push(a, d, b, b, d, e);
    }
  }
  const lining = new THREE.BufferGeometry();
  lining.setAttribute('position', new THREE.Float32BufferAttribute(lin, 3));
  lining.setIndex(linIndex);
  lining.computeVertexNormals();

  // Rims: the collar's edge (black) and the two hems (navy), joining shell to lining.
  const strip = (pairs: [THREE.Vector3, THREE.Vector3][], flip: boolean) => {
    const p: number[] = [];
    for (let i = 0; i < pairs.length - 1; i++) {
      const [o0, i0] = pairs[i], [o1, i1] = pairs[i + 1];
      const quad = flip ? [o0, o1, i0, o1, i1, i0] : [o0, i0, o1, o1, i0, i1];
      for (const v of quad) p.push(v.x, v.y, v.z);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    g.computeVertexNormals();
    return g;
  };
  const collarRim = strip(grid[0].map((v) => [v.outer, v.inner]), false);
  // The hems run only as far as the section is open: where the flanks have curled under and met, there's no edge.
  const open = grid.filter((row) => row[0].outer.distanceTo(row[ACROSS].outer) > 0.002);
  const hems = mergeGeometries([
    strip(open.map((row) => [row[0].outer, row[0].inner]), true),
    strip(open.map((row) => [row[ACROSS].outer, row[ACROSS].inner]), false),
  ])!;
  return { navy: split(navy), black: split(black), lining, collarRim, hems, grid };
}

/** The footbox's drawcord: a white loop out of the gather, through its cord lock, lying slack over the end. */
function footCord(gather: THREE.Vector3, mat: number) {
  const floor = -mat + 0.003;
  const p = (x: number, y: number, z: number) => new THREE.Vector3(gather.x + x, y, z);
  const curve = new THREE.CatmullRomCurve3([
    p(0, gather.y, 0.004),
    p(0.022, gather.y - 0.01, 0.01),
    p(0.05, gather.y - 0.05, 0.024),
    p(0.075, floor + 0.01, 0.03),
    p(0.12, floor, 0.012),
    p(0.11, floor, -0.03),
    p(0.07, floor + 0.01, -0.018),
    p(0.045, gather.y - 0.05, -0.006),
    p(0.022, gather.y - 0.012, -0.004),
    p(0, gather.y, -0.004),
  ]);
  return new THREE.TubeGeometry(curve, 40, 0.0018, 5, false).toNonIndexed();
}

/** A flat cord lock: a rounded block with the cord through it. */
function cordLock(at: THREE.Vector3, yaw = 0) {
  const g = new THREE.CapsuleGeometry(0.007, 0.012, 3, 8);
  g.rotateZ(Math.PI / 2);
  g.scale(1, 0.65, 1);
  g.rotateY(yaw);
  g.translate(at.x, at.y, at.z);
  return g.toNonIndexed();
}

/** The neck's shock cord: a short white tail from the collar's corner, on the panel's side. */
function neckCord(start: THREE.Vector3, mat: number) {
  const curve = new THREE.CatmullRomCurve3([
    start,
    start.clone().add(new THREE.Vector3(-0.015, -0.02, 0.012)),
    start.clone().add(new THREE.Vector3(-0.03, -0.06, 0.03)),
    new THREE.Vector3(start.x - 0.045, -mat + 0.004, start.z + 0.05),
  ]);
  return new THREE.TubeGeometry(curve, 14, 0.0014, 5, false).toNonIndexed();
}

/**
 * The quilt as a few meshes, one per material, for a mat `mat` thick (its flanks reach the floor
 * that far below the quilt's origin), its torso's arch `torso` wide each side (torsoFor a wider mat).
 */
export function buildWaratah(m: WaratahMaterials, mat: number, torso = TORSO) {
  const meshes: THREE.Mesh[] = [];
  const add = (g: THREE.BufferGeometry, material: THREE.Material, name: string) => {
    const mesh = new THREE.Mesh(g, material);
    mesh.name = name;
    meshes.push(mesh);
  };
  const s = surfaces(mat, torso);
  add(s.navy, m.shell, 'shell');
  add(s.black, m.panel, 'panels');
  add(s.collarRim, m.panel, 'collar-rim');
  add(s.hems, m.shell, 'hems');
  add(s.lining, m.lining, 'lining');
  const tip = s.grid[s.grid.length - 1][0].outer;
  add(footCord(tip, mat), m.cord, 'foot-drawcord');
  // The neck's cord lock sits at the collar's corner on the panel's flank.
  const corner = s.grid[0][Math.round(ACROSS * 0.92)].outer;
  add(neckCord(corner, mat), m.cord, 'neck-cord');
  add(mergeGeometries([cordLock(tip.clone().add(new THREE.Vector3(0.012, -0.004, 0)), Math.PI / 2), cordLock(corner.clone().add(new THREE.Vector3(-0.01, -0.012, 0.008)))])!, m.hardware, 'cord-locks');
  return meshes;
}

/** The quilt's highest point over the mat's top, for the hotspot. */
export const WARATAH_LOFT = sectionAt(0.6, 0.07).yc + sectionAt(0.6, 0.07).c;
