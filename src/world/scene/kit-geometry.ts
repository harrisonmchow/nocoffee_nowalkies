// What Harry's real kit is made of, shared by its models (the Tensor pad,
// the Fillo pillow, the Alton chair): parts described as data first, then
// built, so the review renders, the img2threejs pipeline's specs and the camp
// all read the same numbers (as summitseeker-geometry.ts does for the tent).
// Each model adds its own surfaces; the small parts are common primitives.
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
  SphereGeometry,
  TorusGeometry,
  TubeGeometry,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export type Vec3 = [number, number, number];
export type Quat = [number, number, number, number];

type Base = { id: string; /** Which of the model's meshes (one per material) it's baked into. */ mesh: string; colour: string };
/** A model's own surface (its builder knows the kind), or one of the common primitives. */
export type KitPart = Base &
  (
    | { kind: 'surface'; surface: string; params: Record<string, unknown> }
    | { kind: 'tube'; points: Vec3[]; radius: number; closed: boolean; radial: number; tubular: number }
    | { kind: 'box'; position: Vec3; quaternion: Quat; size: Vec3 }
    | { kind: 'cylinder'; position: Vec3; quaternion: Quat; radius: number; radiusTop?: number; height: number; radial?: number }
    | { kind: 'capsule'; position: Vec3; quaternion: Quat; radius: number; length: number }
    | { kind: 'sphere'; position: Vec3; radius: number; scale?: Vec3 }
    | { kind: 'torus'; position: Vec3; quaternion: Quat; radius: number; tube: number; arc: number }
  );

export const UP = new Vector3(0, 1, 0);
export const round = (x: number) => Math.round(x * 1e5) / 1e5;
export const v3 = (p: Vector3): Vec3 => [round(p.x), round(p.y), round(p.z)];
export const quat = (q: Quaternion): Quat => [round(q.x), round(q.y), round(q.z), round(q.w)];
/** A rotation taking +y to `dir`. */
export const along = (dir: Vector3) => new Quaternion().setFromUnitVectors(UP, dir.clone().normalize());
export function smoothstep(a: number, b: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** Colour every vertex of a geometry. */
export function coloured(geometry: BufferGeometry, colour: string) {
  const c = new Color(colour);
  const count = geometry.getAttribute('position').count;
  const values = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) values.set([c.r, c.g, c.b], i * 3);
  geometry.setAttribute('color', new Float32BufferAttribute(values, 3));
  return geometry;
}

/**
 * A grid surface from a function of (u, v) in [0, 1]², with a colour per
 * vertex: `columns` × `rows` quads, wound so its normals face along
 * ∂/∂v × ∂/∂u (or the other way, with `flip`).
 */
export function gridSurface(
  columns: number[],
  rows: number[],
  at: (u: number, v: number, out: Vector3) => Vector3,
  colourAt: (u: number, v: number, p: Vector3) => Color,
  flip = false,
) {
  const positions: number[] = [];
  const colours: number[] = [];
  const uvs: number[] = [];
  const index: number[] = [];
  const p = new Vector3();
  for (const v of rows) {
    for (const u of columns) {
      at(u, v, p);
      positions.push(p.x, p.y, p.z);
      const c = colourAt(u, v, p);
      colours.push(c.r, c.g, c.b);
      uvs.push(u, v);
    }
  }
  const w = columns.length;
  for (let j = 0; j < rows.length - 1; j++) {
    for (let i = 0; i < w - 1; i++) {
      const a = j * w + i;
      const b = a + w;
      if (flip) index.push(a, a + 1, b, a + 1, b + 1, b);
      else index.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('color', new Float32BufferAttribute(colours, 3));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  return geometry;
}

/** `count` evenly spaced values from a to b, both ends included. */
export const steps = (a: number, b: number, count: number) => Array.from({ length: count }, (_, i) => a + ((b - a) * i) / (count - 1));

/** One common primitive as geometry, in the model's frame, its colour per vertex. */
export function primitiveGeometry(part: KitPart): BufferGeometry {
  const place = (g: BufferGeometry, position: Vec3, quaternion: Quat) =>
    g.applyMatrix4(new Matrix4().compose(new Vector3(...position), new Quaternion(...quaternion), new Vector3(1, 1, 1)));
  switch (part.kind) {
    case 'tube': {
      const curve = new CatmullRomCurve3(part.points.map((p) => new Vector3(...p)), part.closed, 'centripetal');
      return coloured(new TubeGeometry(curve, part.tubular, part.radius, part.radial, part.closed), part.colour);
    }
    case 'box':
      return coloured(place(new BoxGeometry(...part.size), part.position, part.quaternion), part.colour);
    case 'cylinder':
      return coloured(place(new CylinderGeometry(part.radiusTop ?? part.radius, part.radius, part.height, part.radial ?? 10, 1), part.position, part.quaternion), part.colour);
    case 'capsule':
      return coloured(place(new CapsuleGeometry(part.radius, part.length, 3, 8), part.position, part.quaternion), part.colour);
    case 'sphere': {
      const g = new SphereGeometry(part.radius, 10, 8);
      if (part.scale) g.scale(...part.scale);
      return coloured(g.translate(...part.position), part.colour);
    }
    case 'torus':
      return coloured(place(new TorusGeometry(part.radius, part.tube, 6, 16, part.arc), part.position, part.quaternion), part.colour);
    case 'surface':
      throw new Error(`kit-geometry: ${part.id} is a ${part.surface} surface, built by its own model`);
  }
}

/** The parts merged into one geometry per mesh, each part's colour baked in per vertex. */
export function mergeByMesh(parts: KitPart[], build: (part: KitPart) => BufferGeometry) {
  const groups = new Map<string, BufferGeometry[]>();
  for (const part of parts) {
    const list = groups.get(part.mesh) ?? [];
    list.push(build(part));
    groups.set(part.mesh, list);
  }
  const merged: Record<string, BufferGeometry> = {};
  for (const [mesh, list] of groups) {
    // Every part here is indexed, with position, normal, uv and colour, so they merge as they are.
    const g = list.length === 1 ? list[0] : mergeGeometries(list, false);
    if (!g) throw new Error(`kit-geometry: could not merge the ${mesh} parts`);
    for (const part of list) if (part !== g) part.dispose();
    merged[mesh] = g;
  }
  return merged;
}
