// Caleb's Japanese maple (threejs-procedural-vegetation). A garden maple
// grown old: one to three sinuous stems forking low into a few long limbs
// that rise, arch out and droop at their ends; sparse side branches off the
// limbs; and fine, kinked twigs hanging from those, carrying the leaves. The
// limbs are far apart, so the crown is a broad, layered umbrella that's open
// underneath: you see the limbs winding through it, with room between them.
// Divergences from the skill's structured Ash system, for this species:
//  - a branch is a walk, not a run of jittered rings: its heading follows two
//    slow waves (yaw and pitch) and a few elbow kinks, rising from where it
//    leaves its parent to a droop at its tip, so limbs wind like the
//    references' rather than wobble;
//  - the hierarchy is fixed at four named levels (stems, limbs, branches,
//    twigs), each with its own table entry, and children leave their parent
//    alternately left and right in stratified slots;
//  - rings are swept with parallel-transport frames (no helices), radii follow
//    the pipe model from the stem down, and each child starts buried in its
//    parent so the joint closes;
//  - leaves are sprays of three palmate leaves on one texture, only on twigs
//    and the outer ends of branches, held near level in layers, coloured per
//    tree from an autumn palette and shaded by crown position (aCrown); their
//    normals blend the card's with the crown's volume, and only the spray at
//    a twig's tip gets a perpendicular twin.
// There's one, a giant over the camp: the valley's only maple, so it can be
// four times a garden maple and still cost less than a grove of small ones.
import { BufferGeometry, CanvasTexture, Color, Float32BufferAttribute, MathUtils, Matrix4, Mesh, Object3D, Quaternion, SRGBColorSpace, Vector3 } from 'three';
import { createSimplex2D } from '../systems/noise';
import { createRandom } from '../systems/random';
import type { WorldUniforms } from '../systems/uniforms';
import { createPropMaterial } from './props-material';
import type { HeightField, TerrainSpec } from './terrain-fields';

type Range = [number, number];

/** How a branch winds: angles in degrees, lengths in metres (at size 1). */
type Winding = {
  /** Pitch where it leaves its parent, and where it ends. */
  rise: Range;
  droop: Range;
  /** The waves' amplitude, and their wavelength. */
  wave: number;
  wavelength: Range;
  /** The largest elbow, and how many per wavelength (about). */
  kink: number;
  /** Metres per ring. */
  step: number;
  /** Radial segments. */
  sides: number;
};

type Species = {
  /** The odds of one, two and three stems from the ground. */
  stems: [number, number, number];
  trunk: Winding & { height: Range; radius: number; flare: number };
  limbs: Winding & { count: Range; length: Range; radius: number };
  branches: Winding & { count: Range; start: number; length: Range; spread: Range; radius: number };
  twigs: Winding & { count: Range; start: number; length: Range; spread: Range; radius: number };
  leaves: { perTwig: number; perBranch: number; size: number; sizeVariance: number };
};

/** Acer palmatum as an old garden tree: about 5 m tall and twice as wide at size 1. */
export const JAPANESE_MAPLE: Species = {
  stems: [0.5, 0.3, 0.2],
  trunk: { height: [1.3, 2.0], radius: 0.24, flare: 0.5, rise: [70, 84], droop: [58, 72], wave: 24, wavelength: [1.2, 1.8], kink: 14, step: 0.22, sides: 10 },
  limbs: { count: [3, 5], length: [3.8, 5.2], radius: 0.74, rise: [42, 68], droop: [-6, -24], wave: 34, wavelength: [1.1, 1.7], kink: 26, step: 0.34, sides: 6 },
  branches: { count: [3, 5], start: 0.3, length: [1.3, 2.3], spread: [45, 85], radius: 0.52, rise: [-6, 22], droop: [-22, -48], wave: 30, wavelength: [0.6, 1.0], kink: 28, step: 0.34, sides: 4 },
  twigs: { count: [3, 5], start: 0.2, length: [0.5, 1.0], spread: [35, 75], radius: 0.016, rise: [-10, 10], droop: [-30, -65], wave: 0, wavelength: [0.4, 0.4], kink: 30, step: 0.75, sides: 3 },
  leaves: { perTwig: 5, perBranch: 3, size: 0.62, sizeVariance: 0.25 },
};

const UP = new Vector3(0, 1, 0);
const DEG = Math.PI / 180;

/** A branch's centre line: points, unit headings and radii, one per ring. */
type Path = { points: Vector3[]; headings: Vector3[]; radii: number[]; length: number };

/** The point, heading and radius a fraction `t` of the way along a path. */
function along(path: Path, t: number) {
  const scaled = MathUtils.clamp(t, 0, 1) * (path.points.length - 1);
  const a = Math.min(Math.floor(scaled), path.points.length - 2);
  const f = scaled - a;
  return {
    point: new Vector3().lerpVectors(path.points[a], path.points[a + 1], f),
    heading: new Vector3().lerpVectors(path.headings[a], path.headings[a + 1], f).normalize(),
    radius: MathUtils.lerp(path.radii[a], path.radii[a + 1], f),
  };
}

const headingOf = (yaw: number, pitch: number) => new Vector3(Math.cos(pitch) * Math.cos(yaw), Math.sin(pitch), Math.cos(pitch) * Math.sin(yaw));
const yawOf = (v: Vector3) => Math.atan2(v.z, v.x);

export type MapleGrowth = { bark: BufferGeometry; leaves: BufferGeometry; stats: { branches: number[]; leafCards: number; reach: number; height: number } };

/**
 * Grow one maple from a seed at a size (1: a garden maple of about 5 m):
 * bark tubes and leaf cards, in the tree's own space (base at the origin). A
 * larger tree isn't just scaled up: its limbs carry more branches and its
 * branches more twigs, its leaf sprays grow a little, and its trunk and limbs
 * get more sides, so it stays as full and as round up close. Given `reach` (a
 * yaw), it leans that way: one stem, its limbs all round but longest there.
 */
export function growMaple(species: Species, seed: number, size = 1, reach?: number): MapleGrowth {
  const random = createRandom(seed);
  const range = ([min, max]: Range) => min + (max - min) * random();
  const count = (r: Range) => Math.round(range([r[0] - 0.49, r[1] + 0.49]));
  const bark = { position: [] as number[], normal: [] as number[], index: [] as number[] };
  const leaf = { position: [] as number[], normal: [] as number[], uv: [] as number[], index: [] as number[] };
  const cards: { origin: Vector3; normal: Vector3 }[] = [];
  const stats = { branches: [0, 0, 0, 0], leafCards: 0, reach: 0, height: 0 };
  const big = Math.max(1, size);
  /** More sides on a thicker branch, up to twice the table's. */
  const girth = (w: Winding) => Math.round(w.sides * Math.min(2, Math.sqrt(big)));

  /**
   * Walk a branch from `from`, starting along (yaw, its winding's rise): the
   * pitch eases from rise to droop, two waves wind it, and elbows kink it.
   * `radius` maps the fraction along it and the metres from its start to a radius.
   * Above `floor` (all but the stems, which start underground) it levels out
   * rather than going lower, so no bough sweeps down into the ground.
   */
  const walk = (from: Vector3, yaw: number, length: number, w: Winding, rise: number, droop: number, radius: (t: number, s: number) => number, floor = 0.3): Path => {
    const rings = Math.max(1, Math.ceil(length / (w.step * Math.sqrt(size))));
    const ds = length / rings;
    const wavelength = range(w.wavelength) * size;
    const waveYaw = w.wave * DEG * (0.7 + 0.3 * random());
    const wavePitch = w.wave * DEG * 0.7;
    const [phaseYaw, phasePitch, ratio] = [random() * Math.PI * 2, random() * Math.PI * 2, 0.55 + random() * 0.5];
    const waveAt = (s: number) => ({
      yaw: waveYaw * (Math.sin((Math.PI * 2 * s) / wavelength + phaseYaw) - Math.sin(phaseYaw)),
      pitch: wavePitch * (Math.sin((Math.PI * 2 * s) / (wavelength * ratio) + phasePitch) - Math.sin(phasePitch)),
    });
    let elbowYaw = 0;
    let elbowPitch = 0;
    let nextElbow = wavelength * (0.3 + random() * 0.5);
    const points = [from.clone()];
    const headings: Vector3[] = [];
    const radii = [radius(0, 0)];
    const at = from.clone();
    for (let i = 0; i < rings; i++) {
      const s = i * ds;
      if (s >= nextElbow) {
        elbowYaw += (random() * 2 - 1) * w.kink * DEG;
        elbowPitch += (random() * 2 - 1) * w.kink * DEG * 0.6;
        nextElbow += wavelength * (0.35 + random() * 0.5);
      }
      const t = s / length;
      const wave = waveAt(s);
      let pitch = MathUtils.clamp(MathUtils.lerp(rise, droop, MathUtils.smoothstep(t, 0.12, 1)) + wave.pitch + elbowPitch, -75 * DEG, 84 * DEG);
      if (at.y + Math.sin(pitch) * ds < floor) pitch = Math.max(pitch, 0);
      const heading = headingOf(yaw + wave.yaw + elbowYaw, pitch);
      headings.push(heading);
      at.addScaledVector(heading, ds);
      points.push(at.clone());
      radii.push(radius((i + 1) / rings, (i + 1) * ds));
    }
    headings.push(headings[headings.length - 1].clone());
    return { points, headings, radii, length };
  };

  /** Sweep rings along a path with parallel-transport frames. */
  const tube = (path: Path, sides: number) => {
    const start = bark.position.length / 3;
    const tangent = new Vector3();
    let previous = path.headings[0].clone();
    const normal = new Vector3().crossVectors(previous, Math.abs(previous.y) < 0.9 ? UP : new Vector3(1, 0, 0)).normalize();
    const binormal = new Vector3();
    const turn = new Quaternion();
    for (let i = 0; i < path.points.length; i++) {
      const a = path.points[Math.max(0, i - 1)];
      const b = path.points[Math.min(path.points.length - 1, i + 1)];
      tangent.subVectors(b, a).normalize();
      normal.applyQuaternion(turn.setFromUnitVectors(previous, tangent));
      previous = tangent.clone();
      binormal.crossVectors(tangent, normal);
      for (let k = 0; k <= sides; k++) {
        const angle = (Math.PI * 2 * (k % sides)) / sides;
        const n = normal.clone().multiplyScalar(Math.cos(angle)).addScaledVector(binormal, Math.sin(angle));
        const v = n.clone().multiplyScalar(path.radii[i]).add(path.points[i]);
        bark.position.push(v.x, v.y, v.z);
        bark.normal.push(n.x, n.y, n.z);
      }
    }
    const ring = sides + 1;
    for (let i = 0; i < path.points.length - 1; i++) {
      for (let k = 0; k < sides; k++) {
        const a = start + i * ring + k;
        bark.index.push(a, a + 1, a + ring, a + 1, a + ring + 1, a + ring);
      }
    }
  };

  /** A spray of leaves: its stalk along `direction`, held near level and rolled a little. */
  const spray = (origin: Vector3, direction: Vector3, twin: boolean) => {
    const l = species.leaves;
    const length = l.size * big ** 0.3 * (1 + (random() * 2 - 1) * l.sizeVariance);
    const side = new Vector3().crossVectors(direction, UP).normalize().applyAxisAngle(direction, (random() * 2 - 1) * 50 * DEG);
    const quad = (across: Vector3) => {
      const base = leaf.position.length / 3;
      const normal = new Vector3().crossVectors(across, direction).normalize();
      ([[-0.5, 1], [-0.5, 0], [0.5, 0], [0.5, 1]] as const).forEach(([x, y]) => {
        const v = origin.clone().addScaledVector(across, x * length).addScaledVector(direction, y * length);
        leaf.position.push(v.x, v.y, v.z);
        leaf.normal.push(normal.x, normal.y, normal.z);
        leaf.uv.push(x + 0.5, y);
      });
      leaf.index.push(base, base + 1, base + 2, base, base + 2, base + 3);
      cards.push({ origin: origin.clone(), normal });
      stats.leafCards++;
    };
    quad(side);
    if (twin) quad(new Vector3().crossVectors(side, direction).normalize());
  };
  /** A spray's stalk: out to one side of the twig's heading, from a little below level to a little above. */
  const stalk = (heading: Vector3, side: number) =>
    headingOf(yawOf(heading) + side * (25 + random() * 45) * DEG, (-45 + random() * 50) * DEG);

  /** Children along a parent, alternately left and right, in stratified slots from `start` to its tip. */
  const sideways = (parent: Path, n: number, start: number, grow: (point: Vector3, heading: Vector3, radius: number, t: number, side: number) => void) => {
    let side = random() < 0.5 ? -1 : 1;
    for (let i = 0; i < n; i++) {
      const t = start + ((i + 0.2 + random() * 0.6) / n) * (1 - start);
      const at = along(parent, t);
      // Buried in the parent, so the joint closes.
      grow(at.point.addScaledVector(at.heading, -at.radius * 0.3), at.heading, at.radius, t, side);
      side = random() < 0.85 ? -side : side;
    }
  };

  const twig = (from: Vector3, heading: Vector3, parentRadius: number, side: number) => {
    const w = species.twigs;
    const length = range(w.length) * Math.sqrt(size);
    const r0 = Math.min(w.radius * size, parentRadius * 0.8);
    const path = walk(from, yawOf(heading) + side * range(w.spread) * DEG, length, w, range(w.rise) * DEG, range(w.droop) * DEG, (t) => r0 * (1 - 0.75 * t));
    tube(path, w.sides);
    stats.branches[3]++;
    const l = species.leaves;
    for (let i = 0; i < l.perTwig; i++) {
      const at = along(path, 0.25 + ((i + random()) / l.perTwig) * 0.7);
      spray(at.point, stalk(at.heading, i % 2 ? 1 : -1), false);
    }
    const tip = path.points[path.points.length - 1];
    spray(tip, headingOf(yawOf(path.headings[path.headings.length - 1]), (-20 + random() * 25) * DEG), true);
  };

  const branch = (from: Vector3, heading: Vector3, parentRadius: number, t: number, side: number, fork = false) => {
    const w = species.branches;
    // Shorter toward the limb's tip; a fork is a limb in miniature, longer and closer to its parent's line.
    const length = range(w.length) * size * (1 - 0.45 * t) * (fork ? 1.6 : 1);
    const r0 = parentRadius * w.radius * (fork ? 1.2 : 1);
    const spread = fork ? range([20, 38]) : range(w.spread);
    const path = walk(from, yawOf(heading) + side * spread * DEG, length, w, range(w.rise) * DEG, range(w.droop) * DEG, (u) => r0 * (1 - 0.8 * u ** 0.8) + 0.003);
    tube(path, Math.min(6, girth(w)));
    stats.branches[2]++;
    sideways(path, Math.round(count(species.twigs.count) * Math.max(1, size * 0.7)), species.twigs.start, (p, h, r, _u, s) => twig(p, h, r, s));
    const tip = along(path, 1);
    twig(tip.point, tip.heading, tip.radius, 0);
    const l = species.leaves;
    for (let i = 0; i < l.perBranch; i++) {
      const at = along(path, 0.55 + ((i + random()) / l.perBranch) * 0.45);
      spray(at.point, stalk(at.heading, i % 2 ? 1 : -1), false);
    }
  };

  const limb = (from: Vector3, yaw: number, r0: number, leader: boolean, stretch = 1) => {
    const w = species.limbs;
    const length = range(w.length) * size * (leader ? 0.8 : 1) * stretch;
    const rise = leader ? range([70, 80]) : range(w.rise);
    const path = walk(from, yaw, length, w, rise * DEG, range(w.droop) * DEG, (t) => r0 * (1 - 0.82 * t ** 0.85) + 0.004);
    tube(path, girth(w));
    stats.branches[1]++;
    // A limb forks once about halfway, more often than not; then side branches, then twigs on its bare outer end.
    const forkAt = random() < 0.65 ? 0.4 + random() * 0.25 : -1;
    if (forkAt > 0) {
      const at = along(path, forkAt);
      branch(at.point, at.heading, at.radius, forkAt, random() < 0.5 ? -1 : 1, true);
    }
    // Longer limbs carry more branches, not the same few spread thinner.
    sideways(path, Math.round(count(species.branches.count) * big), species.branches.start, (p, h, r, t, s) => branch(p, h, r, t, s));
    sideways(path, 2, 0.65, (p, h, r, _t, s) => twig(p, h, r, s));
    const tip = along(path, 1);
    twig(tip.point, tip.heading, tip.radius, 0);
  };

  // The stems: one, or two or three leaning apart from a shared root.
  const pick = random();
  const stems = reach !== undefined || pick < species.stems[0] ? 1 : pick < species.stems[0] + species.stems[1] ? 2 : 3;
  // Smaller trees have fewer limbs, not just shorter ones; however large, no more than seven, so the crown stays open.
  const limbs = Math.min(7, Math.max(stems + 1, Math.round(count(species.limbs.count) * (0.55 + 0.45 * size))));
  const azimuth = reach ?? random() * Math.PI * 2;
  const w = species.trunk;
  let limbIndex = 0;
  for (let j = 0; j < stems; j++) {
    const yaw = azimuth + (j / stems) * Math.PI * 2 + (random() - 0.5) * (reach === undefined ? 0.6 : 0.2);
    const r0 = (w.radius * size) / Math.sqrt(stems);
    const height = range(w.height) * size * (stems > 1 ? 1.2 : 1);
    const from = new Vector3(Math.cos(yaw), 0, Math.sin(yaw)).multiplyScalar(stems > 1 ? r0 * 0.9 : 0).setY(-0.15);
    const lean = stems > 1 ? -12 : reach !== undefined ? -8 : 0;
    const stem = walk(from, yaw, height, w, (range(w.rise) + lean) * DEG, (range(w.droop) + lean) * DEG, (t, s) => r0 * (1 - 0.22 * t) * (1 + w.flare * Math.exp(-s / (0.3 * size))), -Infinity);
    tube(stem, girth(w));
    stats.branches[0]++;
    // Its share of the limbs, from its upper part, fanned around it (a lone stem's go all the way round).
    const share = Math.round(((j + 1) * limbs) / stems) - Math.round((j * limbs) / stems);
    const fan = stems === 1 ? Math.PI * 2 : (Math.PI * 2) / stems + 1.2;
    for (let k = 0; k < share; k++, limbIndex++) {
      const t = k === 0 ? 1 : 0.6 + ((k - 0.5 + random() * 0.8) / share) * 0.4;
      const at = along(stem, t);
      const limbYaw = stems === 1 ? azimuth + ((k + 0.5 + (random() - 0.5) * 0.6) / share) * fan : yaw + ((k + 0.5) / share - 0.5) * fan + (random() - 0.5) * 0.3;
      const stretch = reach !== undefined ? 0.85 + 0.3 * Math.cos(limbYaw - azimuth) : 1;
      // The first at the stem's top carries on its girth; the leader climbs.
      limb(at.point.addScaledVector(at.heading, k === 0 ? 0 : -at.radius * 0.3), limbYaw, at.radius * (k === 0 ? 1 : species.limbs.radius), limbIndex === 0 && stems === 1, stretch);
    }
  }

  const barkGeometry = new BufferGeometry();
  barkGeometry.setAttribute('position', new Float32BufferAttribute(bark.position, 3));
  barkGeometry.setAttribute('normal', new Float32BufferAttribute(bark.normal, 3));
  barkGeometry.setIndex(bark.index);
  barkGeometry.computeBoundingSphere();

  const leafGeometry = new BufferGeometry();
  leafGeometry.setAttribute('position', new Float32BufferAttribute(leaf.position, 3));
  leafGeometry.setAttribute('uv', new Float32BufferAttribute(leaf.uv, 2));
  leafGeometry.setIndex(leaf.index);
  leafGeometry.computeBoundingBox();
  leafGeometry.computeBoundingSphere();
  leafGeometry.setAttribute('normal', crownNormals(leafGeometry, leaf.normal, cards));
  leafGeometry.setAttribute('aCrown', crownOf(leafGeometry));
  const box = leafGeometry.boundingBox!;
  stats.reach = Math.max(-box.min.x, box.max.x, -box.min.z, box.max.z);
  stats.height = box.max.y;
  return { bark: barkGeometry, leaves: leafGeometry, stats };
}

/**
 * Leaf normals from both the card and the crown's volume: each card's own
 * normal, turned to face out of the crown, bent toward the way out of an
 * ellipsoid around the crown (a dome, so centred low), so it shades as a mass.
 */
function crownNormals(geometry: BufferGeometry, own: number[], cards: { origin: Vector3; normal: Vector3 }[]) {
  const box = geometry.boundingBox!;
  const centre = new Vector3();
  const half = new Vector3();
  box.getCenter(centre);
  box.getSize(half).multiplyScalar(0.5);
  centre.y -= half.y * 0.5;
  const position = geometry.getAttribute('position');
  const normals = new Float32Array(own.length);
  const out = new Vector3();
  const n = new Vector3();
  for (let c = 0; c < cards.length; c++) {
    const card = cards[c];
    const facing = out.subVectors(card.origin, centre).divide(half).dot(card.normal) < 0 ? -1 : 1;
    for (let k = 0; k < 4; k++) {
      const i = c * 4 + k;
      out.set(position.getX(i), position.getY(i), position.getZ(i)).sub(centre).divide(half).normalize();
      n.copy(card.normal).multiplyScalar(facing * 0.5).add(out).normalize();
      normals.set([n.x, n.y, n.z], i * 3);
    }
  }
  return new Float32BufferAttribute(normals, 3);
}

/** Each leaf vertex's place in the crown: 0 deep inside and low, 1 at the top and the rim. */
function crownOf(geometry: BufferGeometry) {
  const position = geometry.getAttribute('position');
  const box = geometry.boundingBox!;
  const centre = new Vector3();
  box.getCenter(centre);
  const reach = Math.max(box.max.x - box.min.x, box.max.z - box.min.z) / 2 || 1;
  const crown = new Float32Array(position.count);
  for (let i = 0; i < position.count; i++) {
    const height = (position.getY(i) - box.min.y) / Math.max(box.max.y - box.min.y, 1e-3);
    const rim = Math.hypot(position.getX(i) - centre.x, position.getZ(i) - centre.z) / reach;
    crown[i] = MathUtils.clamp(height * 0.65 + rim * 0.45, 0, 1);
  }
  return new Float32BufferAttribute(crown, 1);
}

// ---------------------------------------------------------------- leaf textures

/** One palmate leaf, stalk at (0, 0) pointing down the canvas, lobes up: seven pointed lobes, the middle ones longest. */
function palmate(g: CanvasRenderingContext2D, x: number, y: number, size: number, angle: number, shade: string) {
  g.save();
  g.translate(x, y);
  g.rotate(angle);
  g.fillStyle = shade;
  g.strokeStyle = shade;
  g.lineWidth = size * 0.05;
  g.beginPath();
  g.moveTo(0, 0);
  g.lineTo(0, size * 0.35);
  g.stroke();
  const lobes = 7;
  for (let i = 0; i < lobes; i++) {
    const t = (i / (lobes - 1)) * 2 - 1;
    const a = t * 2.3;
    const length = size * (1 - 0.5 * t * t);
    const width = size * 0.17;
    g.save();
    g.rotate(a);
    g.beginPath();
    g.moveTo(0, 0);
    g.quadraticCurveTo(width, -length * 0.42, 0, -length);
    g.quadraticCurveTo(-width, -length * 0.42, 0, 0);
    g.fill();
    g.restore();
  }
  g.restore();
}

let sprayTexture: CanvasTexture | null = null;
/** Three leaves on their stalks, meeting at the card's root (bottom middle). White: the tree's colour tints them. */
function spray() {
  if (sprayTexture) return sprayTexture;
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d')!;
  palmate(g, size * 0.5, size * 0.62, size * 0.36, 0, '#ffffff');
  palmate(g, size * 0.3, size * 0.78, size * 0.26, -0.85, '#e4e4e4');
  palmate(g, size * 0.7, size * 0.78, size * 0.26, 0.85, '#ececec');
  sprayTexture = new CanvasTexture(canvas);
  sprayTexture.colorSpace = SRGBColorSpace;
  sprayTexture.anisotropy = 4;
  return sprayTexture;
}

let singleTexture: CanvasTexture | null = null;
/** One leaf, centred, for leaves in the air. */
function single() {
  if (singleTexture) return singleTexture;
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d')!;
  palmate(g, size * 0.5, size * 0.62, size * 0.42, 0, '#ffffff');
  singleTexture = new CanvasTexture(canvas);
  singleTexture.colorSpace = SRGBColorSpace;
  return singleTexture;
}

/** The leaf textures, white so each use tints them: sprays of three (on the trees and the ground), and single leaves. */
export const leafTextures = () => ({ spray: spray(), single: single() });

// ---------------------------------------------------------------- the maple

/** Autumn reds through to yellows, Japanese maples mostly red. */
export const AUTUMN = ['#a51d1a', '#bf2a1b', '#c9391c', '#d4521e', '#de7a1f', '#e3a42b', '#9b1a2a'];

/** The crown's colours, deep in it to its sunlit top: mostly reds, warming to orange and a little gold. */
const CROWN = ['#8f1626', '#a51d1a', '#bf2a1b', '#c9391c', '#d4521e', '#de7a1f', '#e3a42b'].map((c) => new Color(c));

export type MapleOptions = {
  seed: number;
  /** The camp's centre: the tree stands just behind it from the views, the whole camp under its crown. */
  camp: { x: number; z: number };
};

/** Where the camp's views come from (the orbit's start, the approach and the landscape). */
const VIEW = new Vector3(-0.27, 0, 1).normalize();
/** Four garden maples tall. */
const HEIGHT = 18;
/** Under the crown, around the camp, nothing hangs lower than this: the camp and the orbit's camera stay clear. */
const CLEAR = { radius: 13, height: 3.2 };

/**
 * The one maple in the valley: a giant, four times a garden maple, its
 * trunk just behind the camp from the views and its crown over all of it.
 * Of a few seeds, the one grown closest to its height, fitted to it.
 */
export function createMaple(uniforms: WorldUniforms, starLayers: number, spec: TerrainSpec, ground: HeightField, options: MapleOptions) {
  const group = new Object3D();
  group.name = 'maple';
  const slope = (x: number, z: number) =>
    Math.hypot(spec.height(x + 2, z) - spec.height(x - 2, z), spec.height(x, z + 2) - spec.height(x, z - 2)) / 4;
  const growths = [0, 1, 2].map((k) => growMaple(JAPANESE_MAPLE, options.seed * 31 + 4111 + k * 613, 4, 0));
  growths.sort((a, b) => Math.abs(a.stats.height - HEIGHT) - Math.abs(b.stats.height - HEIGHT));
  growths.slice(1).forEach((g) => [g.bark, g.leaves].forEach((geometry) => geometry.dispose()));
  const tree = growths[0];
  const s = MathUtils.clamp(HEIGHT / tree.stats.height, 0.85, 1.2);

  // The trunk 7–10 m behind the camp, on the first level enough spot, turned so its longer side (+x) leans over the camp.
  const { x: cx, z: cz } = options.camp;
  const away = Math.atan2(-VIEW.z, -VIEW.x);
  let at = new Vector3(cx + Math.cos(away) * 8, 0, cz + Math.sin(away) * 8);
  search: for (const turn of [0.35, -0.35, 0.8, -0.8, 0]) {
    for (const d of [8, 7, 10]) {
      const x = cx + Math.cos(away + turn) * d;
      const z = cz + Math.sin(away + turn) * d;
      if (slope(x, z) > 0.3) continue;
      at = new Vector3(x, 0, z);
      break search;
    }
  }
  // At the lowest ground under the trunk, so no side of its root hangs in the air.
  const width = 1.4 * s;
  let y = ground(at.x, at.z);
  for (let k = 0; k < 8; k++) y = Math.min(y, ground(at.x + Math.cos(k * 0.785) * width, at.z + Math.sin(k * 0.785) * width));
  at.y = y - 0.1;
  const placed = new Matrix4().compose(at, new Quaternion().setFromAxisAngle(UP, Math.atan2(-(cz - at.z), cx - at.x)), new Vector3(s, s, s));
  clearUnder(tree.leaves, placed, options.camp, ground);
  tint(tree.leaves, options.seed);

  const barkMaterial = createPropMaterial(uniforms, starLayers, { color: '#4b403b', roughness: 0.9 });
  const leafMaterial = createPropMaterial(uniforms, starLayers, { color: '#ffffff', roughness: 0.7, foliage: { map: spray() } });
  leafMaterial.vertexColors = true;
  const bark = new Mesh(tree.bark, barkMaterial);
  const leaves = new Mesh(tree.leaves, leafMaterial);
  bark.name = 'maple-bark';
  leaves.name = 'maple-leaves';
  for (const mesh of [bark, leaves]) {
    placed.decompose(mesh.position, mesh.quaternion, mesh.scale);
    group.add(mesh);
  }

  return {
    group,
    stats: { ...tree.stats, scale: s, trunk: at, triangles: (tree.bark.index!.count + tree.leaves.index!.count) / 3 },
    dispose() {
      [tree.bark, tree.leaves, barkMaterial, leafMaterial].forEach((d) => d.dispose());
    },
  };
}

/**
 * Drop the leaf cards (of a tree placed by `placed`) that hang low around the
 * camp: within CLEAR.radius of it and below CLEAR.height off the ground, as
 * the low growth over a pitch is cleared, so the camp stands under the crown, not in it.
 */
function clearUnder(leaves: BufferGeometry, placed: Matrix4, spot: { x: number; z: number }, ground: HeightField) {
  const position = leaves.getAttribute('position');
  const index = leaves.getIndex()!;
  const kept: number[] = [];
  const v = new Vector3();
  for (let c = 0; c < index.count; c += 6) {
    let low = false;
    for (let k = 0; k < 6 && !low; k++) {
      v.fromBufferAttribute(position, index.getX(c + k)).applyMatrix4(placed);
      low = Math.hypot(v.x - spot.x, v.z - spot.z) < CLEAR.radius && v.y - ground(v.x, v.z) < CLEAR.height;
    }
    if (!low) for (let k = 0; k < 6; k++) kept.push(index.getX(c + k));
  }
  leaves.setIndex(kept);
}

/**
 * Colour the crown card by card, in broad patches (a slow noise over where
 * each card is) warming toward the top: on one tree that size a single tint
 * reads flat, and card-by-card noise reads as confetti.
 */
function tint(leaves: BufferGeometry, seed: number) {
  const patches = createSimplex2D(seed + 5);
  const position = leaves.getAttribute('position');
  const box = leaves.boundingBox!;
  const colours = new Float32Array(position.count * 3);
  const colour = new Color();
  for (let i = 0; i < position.count; i += 4) {
    const [x, y, z] = [position.getX(i), position.getY(i), position.getZ(i)];
    const up = (y - box.min.y) / Math.max(1e-3, box.max.y - box.min.y);
    const t = MathUtils.clamp(0.35 + 0.4 * patches(x / 5, z / 5) + 0.35 * up - 0.15 + 0.1 * patches(x / 1.3 + 40, y / 1.3), 0, 0.999) ** 1.4;
    const f = t * (CROWN.length - 1);
    colour.copy(CROWN[Math.floor(f)]).lerp(CROWN[Math.floor(f) + 1], f - Math.floor(f));
    for (let k = 0; k < 4; k++) colours.set([colour.r, colour.g, colour.b], (i + k) * 3);
  }
  leaves.setAttribute('color', new Float32BufferAttribute(colours, 3));
}
