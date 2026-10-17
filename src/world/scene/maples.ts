// Caleb's Japanese maples (threejs-procedural-vegetation). The growth is the
// skill's structured Ash system: a queue of branch jobs, each a run of
// oriented rings with an inherited continuation from its tip, stratified
// lateral children with independently shuffled angular slots, seeded
// gnarliness and twist, and a gentle tropism; leaves only on the final level,
// as rooted cards. Intentional divergences from the Ash contract:
//  - the species table is Acer palmatum's: a short trunk forking low into a
//    few leaders, wide spreading tiers, fine twigs, small leaf sprays;
//  - the scene is in metres, so the radius-driven terms (gnarliness
//    amplification and the tropism step) measure radius in RADIUS_UNIT;
//  - leaves are sprays of three palmate leaves on one texture, coloured per
//    tree from an autumn palette and shaded by crown position (aCrown);
//  - each leaf card is a single card plus its perpendicular twin only near
//    the tip, to halve the leaf triangles.
// Near the camp the trees are full growths (three seeded variants,
// instanced); further out they are a trunk and a few crown cards painted
// with many small leaves, which is what a maple is from 100 m away.
import {
  BufferGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  Euler,
  Float32BufferAttribute,
  InstancedMesh,
  MathUtils,
  Matrix4,
  Object3D,
  PlaneGeometry,
  Quaternion,
  SRGBColorSpace,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createSimplex2D } from '../systems/noise';
import { createRandom } from '../systems/random';
import type { WorldUniforms } from '../systems/uniforms';
import { createPropMaterial } from './props-material';
import type { TerrainSpec } from './terrain-fields';

/** Branch radius that counts as one unit in the radius-driven terms. */
const RADIUS_UNIT = 0.08;

type Species = {
  levels: number;
  length: number[];
  /** Level 0: the trunk's base radius in metres; after that, a factor of the parent's radius where the child leaves it. */
  radius: number[];
  sections: number[];
  segments: number[];
  children: number[];
  start: number[];
  /** Degrees away from the parent. */
  angle: number[];
  gnarliness: number[];
  twist: number[];
  taper: number[];
  force: { direction: [number, number, number]; strength: number };
  leaves: { count: number; start: number; angle: number; size: number; sizeVariance: number };
};

/** Acer palmatum, about 5–6 m tall and wider than tall. */
export const JAPANESE_MAPLE: Species = {
  levels: 3,
  length: [1.9, 2.7, 1.9, 0.8],
  radius: [0.16, 0.7, 0.62, 0.6],
  sections: [6, 5, 3, 2],
  segments: [7, 5, 4, 3],
  children: [4, 3, 3, 0],
  start: [0, 0.45, 0.3, 0.25],
  angle: [0, 34, 66, 50],
  gnarliness: [0.04, 0.14, 0.12, 0.1],
  twist: [0.12, -0.08, 0.05, 0],
  taper: [0.55, 0.62, 0.66, 0.7],
  force: { direction: [0, 1, 0], strength: 0.004 },
  leaves: { count: 7, start: 0.15, angle: 58, size: 0.6, sizeVariance: 0.28 },
};

type Section = { origin: Vector3; orientation: Euler; radius: number };
type Job = { origin: Vector3; orientation: Euler; length: number; radius: number; level: number; sections: number; segments: number };

const UP = new Vector3(0, 1, 0);
const X_AXIS = new Vector3(1, 0, 0);

function interpolate(sections: Section[], along: number): Section {
  const scaled = along * (sections.length - 1);
  const a = Math.min(Math.floor(scaled), sections.length - 1);
  const b = Math.min(a + 1, sections.length - 1);
  const t = scaled - a;
  const qa = new Quaternion().setFromEuler(sections[a].orientation);
  const qb = new Quaternion().setFromEuler(sections[b].orientation);
  return {
    origin: new Vector3().lerpVectors(sections[a].origin, sections[b].origin, t),
    radius: MathUtils.lerp(sections[a].radius, sections[b].radius, t),
    // As the contract has it: from B, slerped toward A by t.
    orientation: new Euler().setFromQuaternion(qb.slerp(qa, t)),
  };
}

/** Shuffled 0..count-1. */
function shuffled(random: () => number, count: number) {
  const values = Array.from({ length: count }, (_, i) => i);
  for (let i = count - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [values[i], values[j]] = [values[j], values[i]];
  }
  return values;
}

/** Child orientation: the parent's, turned to its azimuth, then tipped out by the emergence angle. */
function childOrientation(parent: Euler, azimuth: number, angle: number) {
  const q = new Quaternion().setFromEuler(parent);
  q.multiply(new Quaternion().setFromAxisAngle(UP, azimuth).multiply(new Quaternion().setFromAxisAngle(X_AXIS, angle)));
  return new Euler().setFromQuaternion(q);
}

export type MapleGrowth = { bark: BufferGeometry; leaves: BufferGeometry; stats: { jobs: number[]; leafCards: number } };

/** Grow one maple from a seed: bark rings and leaf cards, both in the tree's own space (base at the origin). */
export function growMaple(species: Species, seed: number): MapleGrowth {
  const random = createRandom(seed);
  const range = (max: number, min = 0) => min + (max - min) * random();
  const force = new Vector3(...species.force.direction).normalize();
  const bark = { position: [] as number[], normal: [] as number[], index: [] as number[] };
  const leaf = { position: [] as number[], normal: [] as number[], uv: [] as number[], index: [] as number[] };
  const stats = { jobs: new Array(species.levels + 1).fill(0), leafCards: 0 };
  const jobs: Job[] = [
    { origin: new Vector3(), orientation: new Euler(), length: species.length[0], radius: species.radius[0], level: 0, sections: species.sections[0], segments: species.segments[0] },
  ];

  const card = (origin: Vector3, orientation: Euler, size: number, turn: number) => {
    const base = leaf.position.length / 3;
    const corners: [number, number][] = [[-0.5, 1], [-0.5, 0], [0.5, 0], [0.5, 1]];
    const uvs: [number, number][] = [[0, 1], [0, 0], [1, 0], [1, 1]];
    const normal = new Vector3(0, 0, 1).applyEuler(orientation).normalize();
    corners.forEach(([x, y], k) => {
      const v = new Vector3(x * size, y * size, 0).applyAxisAngle(UP, turn).applyEuler(orientation).add(origin);
      // Rounded normals: the card's own normal bent toward the vertex, so the crown shades as a volume.
      const n = normal.clone().add(v.clone().sub(origin)).normalize();
      leaf.position.push(v.x, v.y, v.z);
      leaf.normal.push(n.x, n.y, n.z);
      leaf.uv.push(uvs[k][0], uvs[k][1]);
    });
    leaf.index.push(base, base + 1, base + 2, base, base + 2, base + 3);
    stats.leafCards++;
  };
  const leafAt = (origin: Vector3, orientation: Euler, double: boolean) => {
    const l = species.leaves;
    const size = l.size * (1 + range(l.sizeVariance, -l.sizeVariance));
    card(origin, orientation, size, 0);
    if (double) card(origin, orientation, size, Math.PI / 2);
  };
  const leavesAlong = (sections: Section[]) => {
    const l = species.leaves;
    const offset = random();
    const slots = shuffled(random, l.count);
    const step = (1 - l.start) / l.count;
    for (let s = 0; s < l.count; s++) {
      const along = l.start + (s + random()) * step;
      const at = interpolate(sections, along);
      const azimuth = Math.PI * 2 * (offset + (slots[s] + range(0.5, -0.5)) / l.count);
      leafAt(at.origin, childOrientation(at.orientation, azimuth, MathUtils.degToRad(l.angle)), along > 0.75);
    }
  };
  const lateral = (parentLevel: number, sections: Section[]) => {
    const level = parentLevel + 1;
    const count = species.children[parentLevel];
    const start = species.start[level];
    const offset = random();
    const slots = shuffled(random, count);
    const step = (1 - start) / count;
    for (let s = 0; s < count; s++) {
      const along = start + (s + random()) * step;
      const at = interpolate(sections, along);
      const azimuth = Math.PI * 2 * (offset + (slots[s] + range(0.5, -0.5)) / count);
      jobs.push({
        origin: at.origin,
        orientation: childOrientation(at.orientation, azimuth, MathUtils.degToRad(species.angle[level])),
        length: species.length[level] * (0.85 + random() * 0.3),
        radius: species.radius[level] * at.radius,
        level,
        sections: species.sections[level],
        segments: species.segments[level],
      });
    }
  };

  while (jobs.length) {
    const job = jobs.shift()!;
    stats.jobs[job.level]++;
    const start = bark.position.length / 3;
    const orientation = job.orientation.clone();
    const origin = job.origin.clone();
    const sectionLength = job.length / job.sections;
    const sections: Section[] = [];
    for (let i = 0; i <= job.sections; i++) {
      let radius = job.radius * (1 - species.taper[job.level] * (i / job.sections));
      if (i === job.sections && job.level === species.levels) radius = 0.0015;
      for (let k = 0; k <= job.segments; k++) {
        const a = (Math.PI * 2 * (k % job.segments)) / job.segments;
        const radial = new Vector3(Math.cos(a), 0, Math.sin(a));
        const v = radial.clone().multiplyScalar(radius).applyEuler(orientation).add(origin);
        const n = radial.applyEuler(orientation).normalize();
        bark.position.push(v.x, v.y, v.z);
        bark.normal.push(n.x, n.y, n.z);
      }
      sections.push({ origin: origin.clone(), orientation: orientation.clone(), radius });
      origin.add(new Vector3(0, sectionLength, 0).applyEuler(orientation));
      const unit = Math.max(radius, 0.0015) / RADIUS_UNIT;
      const gnarl = Math.max(1, 1 / Math.sqrt(unit)) * species.gnarliness[job.level];
      orientation.x += range(gnarl, -gnarl);
      orientation.z += range(gnarl, -gnarl);
      const q = new Quaternion().setFromEuler(orientation).multiply(new Quaternion().setFromAxisAngle(UP, species.twist[job.level]));
      const sectionUp = UP.clone().applyQuaternion(q);
      const axis = new Vector3().crossVectors(sectionUp, force);
      const sine = axis.length();
      if (sine > 1e-6) {
        axis.divideScalar(sine);
        const full = Math.atan2(sine, sectionUp.dot(force));
        q.premultiply(new Quaternion().setFromAxisAngle(axis, MathUtils.clamp(species.force.strength / unit, -full, full)));
      }
      orientation.setFromQuaternion(q);
    }
    const ring = job.segments + 1;
    for (let i = 0; i < job.sections; i++) {
      for (let k = 0; k < job.segments; k++) {
        const a = start + i * ring + k;
        const b = a + 1;
        const c = a + ring;
        const d = b + ring;
        bark.index.push(a, c, b, b, c, d);
      }
    }
    const tip = sections[sections.length - 1];
    if (job.level < species.levels) {
      const next = job.level + 1;
      // The continuation from the tip: what keeps the crown irregular rather than a candelabra.
      jobs.push({ origin: tip.origin, orientation: tip.orientation, length: species.length[next], radius: tip.radius, level: next, sections: job.sections, segments: job.segments });
      lateral(job.level, sections);
    } else {
      leafAt(tip.origin, tip.orientation, true);
      leavesAlong(sections);
    }
  }

  const barkGeometry = new BufferGeometry();
  barkGeometry.setAttribute('position', new Float32BufferAttribute(bark.position, 3));
  barkGeometry.setAttribute('normal', new Float32BufferAttribute(bark.normal, 3));
  barkGeometry.setIndex(bark.index);
  barkGeometry.computeBoundingSphere();

  const leafGeometry = new BufferGeometry();
  leafGeometry.setAttribute('position', new Float32BufferAttribute(leaf.position, 3));
  leafGeometry.setAttribute('normal', new Float32BufferAttribute(leaf.normal, 3));
  leafGeometry.setAttribute('uv', new Float32BufferAttribute(leaf.uv, 2));
  leafGeometry.setIndex(leaf.index);
  leafGeometry.computeBoundingBox();
  leafGeometry.computeBoundingSphere();
  leafGeometry.setAttribute('aCrown', crownOf(leafGeometry));
  return { bark: barkGeometry, leaves: leafGeometry, stats };
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

let massTexture: CanvasTexture | null = null;
/** A mass of small leaves in a soft circle, for the crowns of trees far off. */
function mass() {
  if (massTexture) return massTexture;
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d')!;
  const random = createRandom(77);
  for (let i = 0; i < 220; i++) {
    const r = Math.sqrt(random()) * size * 0.42;
    const a = random() * Math.PI * 2;
    const grey = Math.round(170 + random() * 85);
    palmate(g, size / 2 + Math.cos(a) * r, size / 2 + Math.sin(a) * r * 0.9, size * (0.05 + random() * 0.04), random() * Math.PI * 2, `rgb(${grey},${grey},${grey})`);
  }
  massTexture = new CanvasTexture(canvas);
  massTexture.colorSpace = SRGBColorSpace;
  return massTexture;
}

/** A far tree: a trunk and a dome of crossed crown cards (leaves only on the cards' faces). */
function farMapleGeometry() {
  const trunk = new CylinderGeometry(0.1, 0.18, 2.6, 5, 1, true).translate(0, 1.3, 0);
  const cards: BufferGeometry[] = [];
  const random = createRandom(31);
  for (let i = 0; i < 6; i++) {
    const card = new PlaneGeometry(5.2, 3.6);
    const a = (i / 6) * Math.PI + random() * 0.3;
    card.rotateX(i < 3 ? 0 : -0.5);
    card.rotateY(a);
    card.translate(Math.cos(a) * 0.4, 3.6 + random() * 0.6, Math.sin(a) * 0.4);
    cards.push(card);
  }
  const top = new PlaneGeometry(4.6, 4.6).rotateX(-Math.PI / 2).translate(0, 4.7, 0);
  cards.push(top);
  const leaves = mergeGeometries(cards.map((c) => c.toNonIndexed()))!;
  cards.forEach((c) => c.dispose());
  // Crown shading: the cards' upper edges and the top card catch the light.
  const position = leaves.getAttribute('position');
  const crown = new Float32Array(position.count);
  for (let i = 0; i < position.count; i++) crown[i] = MathUtils.clamp((position.getY(i) - 2.0) / 3.2, 0, 1);
  leaves.setAttribute('aCrown', new Float32BufferAttribute(crown, 1));
  return { trunk, leaves };
}

// ---------------------------------------------------------------- the grove

/** Autumn reds through to yellows, Japanese maples mostly red. */
export const AUTUMN = ['#a51d1a', '#bf2a1b', '#c9391c', '#d4521e', '#de7a1f', '#e3a42b', '#9b1a2a'];

export type GroveOptions = { near: number; far: number; seed: number };

/** Where the camp's views come from (the orbit's start, the approach and the landscape): no trees in the way, close in. */
const VIEW = new Vector3(-0.27, 0, 1).normalize();

export function createMaples(uniforms: WorldUniforms, starLayers: number, spec: TerrainSpec, options: GroveOptions) {
  const group = new Object3D();
  group.name = 'maples';
  const random = createRandom(options.seed);
  const clumps = createSimplex2D(options.seed + 1);
  const slope = (x: number, z: number) =>
    Math.hypot(spec.height(x + 2, z) - spec.height(x - 2, z), spec.height(x, z + 2) - spec.height(x, z - 2)) / 4;
  const inView = (x: number, z: number, within: number) => {
    const d = Math.hypot(x, z);
    if (d > within) return false;
    return (x * VIEW.x + z * VIEW.z) / d > Math.cos(MathUtils.degToRad(35));
  };
  const barkMaterial = createPropMaterial(uniforms, starLayers, { color: '#4b403b', roughness: 0.9 });
  const leafMaterial = createPropMaterial(uniforms, starLayers, { color: '#ffffff', roughness: 0.7, foliage: { map: spray() } });
  const massMaterial = createPropMaterial(uniforms, starLayers, { color: '#ffffff', roughness: 0.8, foliage: { map: mass() } });
  const disposables: { dispose(): void }[] = [barkMaterial, leafMaterial, massMaterial];
  const m = new Matrix4();
  const q = new Quaternion();
  const colour = new Color();
  const tint = (mesh: InstancedMesh, i: number) => {
    colour.set(AUTUMN[Math.floor(random() * AUTUMN.length)]).multiplyScalar(0.85 + random() * 0.3);
    mesh.setColorAt(i, colour);
  };

  // Near the camp: full growths, three seeded variants, ringed around the clearing.
  const variants = [0, 1, 2].map((k) => growMaple(JAPANESE_MAPLE, options.seed * 31 + k * 977));
  const perVariant = Math.ceil(options.near / variants.length);
  const near = variants.map((v) => {
    const barkMesh = new InstancedMesh(v.bark, barkMaterial, Math.max(1, perVariant));
    const leafMesh = new InstancedMesh(v.leaves, leafMaterial, Math.max(1, perVariant));
    barkMesh.name = 'maple-bark';
    leafMesh.name = 'maple-leaves';
    barkMesh.count = leafMesh.count = 0;
    group.add(barkMesh, leafMesh);
    disposables.push(v.bark, v.leaves);
    return { barkMesh, leafMesh };
  });
  let placed = 0;
  for (let tries = 0; tries < options.near * 40 && placed < options.near; tries++) {
    const a = random() * Math.PI * 2;
    const r = 9 + random() ** 1.8 * 70;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (inView(x, z, 32) || slope(x, z) > 0.55) continue;
    const { barkMesh, leafMesh } = near[placed % near.length];
    const i = barkMesh.count;
    if (i >= perVariant) continue;
    const s = 0.8 + random() * 0.45;
    q.setFromAxisAngle(new Vector3(0, 1, 0), random() * Math.PI * 2);
    m.compose(new Vector3(x, spec.height(x, z) - 0.05, z), q, new Vector3(s, s * (0.9 + random() * 0.2), s));
    barkMesh.setMatrixAt(i, m);
    leafMesh.setMatrixAt(i, m);
    tint(leafMesh, i);
    barkMesh.count = leafMesh.count = i + 1;
    placed++;
  }
  near.forEach(({ barkMesh, leafMesh }) => {
    barkMesh.computeBoundingSphere();
    leafMesh.computeBoundingSphere();
  });

  // Further out: the grove thins into the valley in clumps, as trunks and crown cards.
  const far = farMapleGeometry();
  disposables.push(far.trunk, far.leaves);
  const trunks = new InstancedMesh(far.trunk, barkMaterial, Math.max(1, options.far));
  const crowns = new InstancedMesh(far.leaves, massMaterial, Math.max(1, options.far));
  trunks.name = 'maple-far-trunks';
  crowns.name = 'maple-far-crowns';
  let farPlaced = 0;
  for (let tries = 0; tries < options.far * 20 && farPlaced < options.far; tries++) {
    const a = random() * Math.PI * 2;
    const r = 80 + random() ** 1.5 * 640;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const h = spec.height(x, z);
    if (h > spec.camp + 140 || slope(x, z) > 0.6) continue;
    if (clumps(x / 160, z / 160) + random() * 0.5 < 0.05) continue;
    const s = 0.75 + random() * 0.6;
    q.setFromAxisAngle(new Vector3(0, 1, 0), random() * Math.PI * 2);
    m.compose(new Vector3(x, h - 0.1, z), q, new Vector3(s, s * (0.85 + random() * 0.3), s));
    trunks.setMatrixAt(farPlaced, m);
    crowns.setMatrixAt(farPlaced, m);
    tint(crowns, farPlaced);
    farPlaced++;
  }
  trunks.count = crowns.count = farPlaced;
  trunks.computeBoundingSphere();
  crowns.computeBoundingSphere();
  group.add(trunks, crowns);

  return {
    group,
    stats: { near: placed, far: farPlaced, variants: variants.map((v) => ({ ...v.stats, triangles: (v.bark.index!.count + v.leaves.index!.count) / 3 })) },
    dispose() {
      disposables.forEach((d) => d.dispose());
    },
  };
}
