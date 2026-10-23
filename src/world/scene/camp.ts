// The camp: a tent and a campfire, the person and their kit. The tent is a
// generic dome stand-in until a camp's gear names a real one (Harry's
// SummitSeeker: summitseeker.ts; Caleb's X-Dome: xdome.ts; Kevin's Dagger:
// dagger.ts; Mikey's X-Mid Pro 2: xmid.ts), and so is each piece of kit
// (Harry's pad, pillow, chair and pack: kit-models.ts; Caleb's mat, quilt,
// chair and table, by variant: gear-models.ts); the fire stays.
import {
  type MeshStandardMaterial,
  AdditiveBlending,
  Box3,
  BufferAttribute,
  BufferGeometry,
  CatmullRomCurve3,
  Color,
  CylinderGeometry,
  DoubleSide,
  IcosahedronGeometry,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Mesh,
  Object3D,
  PlaneGeometry,
  PointLight,
  Quaternion,
  ShaderMaterial,
  TubeGeometry,
  Vector3,
} from 'three';
import { WORLD_ALL } from '../shaders/chunks';
import { createSimplex2D } from '../systems/noise';
import { createRandom } from '../systems/random';
import { SKY_KEYS, pickUniforms, type WorldUniforms } from '../systems/uniforms';
import type { CampItem } from '../route';
import { createPropMaterial } from './props-material';
import {
  createBottle,
  createChair,
  createCar,
  createDog,
  createFigure,
  createHeadtorch,
  createPack,
  createPad,
  createPillow,
  createQuilt,
  createSleepingBag,
  createStove,
  createTable,
  type GearModel,
} from './gear-models';
import { createAltonChair, createFilloPillow, createOspreyAether, createTensorPad, type KitModel } from './kit-models';
import { createSummitSeeker } from './summitseeker';
import { createXDome } from './xdome';
import { createDagger } from './dagger';
import { createXMid } from './xmid';

// ---------------------------------------------------------------- tent

// Inside the tent, in its own space (floor at y 0, long axis x, door toward +z).
const INSIDE = {
  pad: new Vector3(0, 0, -0.06),
  bed: new Vector3(0.02, 0.055, -0.06),
  pillow: new Vector3(-0.74, 0.1, -0.06),
  headtorch: new Vector3(0.1, 0.9, 0),
};

const TENT = { halfLength: 1.05, halfWidth: 0.68, height: 1.0 };

function domeHeight(s: number, t: number) {
  const base = Math.max(0, 1 - s * s) ** 0.55 * Math.max(0, 1 - t * t) ** 0.55;
  // Faint ridges where the two crossing poles run.
  const ridge = Math.exp(-(((s - t) / 0.09) ** 2)) + Math.exp(-(((s + t) / 0.09) ** 2));
  return TENT.height * base * (1 + 0.035 * ridge);
}

/** A patch of the dome surface over s0..s1, t0..t1, pushed out along its normal by `offset`. */
function domePatch(s0: number, s1: number, t0: number, t1: number, segments: number, offset = 0) {
  const positions: number[] = [];
  const index: number[] = [];
  const point = (s: number, t: number) => new Vector3(TENT.halfLength * s, domeHeight(s, t), TENT.halfWidth * t);
  for (let j = 0; j <= segments; j++) {
    for (let i = 0; i <= segments; i++) {
      const s = s0 + ((s1 - s0) * i) / segments;
      const t = t0 + ((t1 - t0) * j) / segments;
      const p = point(s, t);
      if (offset) {
        const e = 0.01;
        const ds = point(Math.min(0.999, s + e), t).sub(point(Math.max(-0.999, s - e), t));
        const dt = point(s, Math.min(0.999, t + e)).sub(point(s, Math.max(-0.999, t - e)));
        p.addScaledVector(dt.cross(ds).normalize(), offset);
      }
      positions.push(p.x, p.y, p.z);
    }
  }
  const row = segments + 1;
  for (let j = 0; j < segments; j++) {
    for (let i = 0; i < segments; i++) {
      const a = j * row + i;
      index.push(a, a + row, a + 1, a + 1, a + row, a + row + 1);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  return geometry;
}

function createTent(uniforms: WorldUniforms, starLayers: number, colour: string) {
  const group = new Object3D();
  group.name = 'tent';
  const fabric = createPropMaterial(uniforms, starLayers, { color: colour, roughness: 0.72, snow: true });
  fabric.side = DoubleSide;
  // Always transparent (at full opacity outside), so ghosting it to look in never recompiles its shader.
  fabric.transparent = true;
  const shell = new Mesh(domePatch(-0.999, 0.999, -0.999, 0.999, 28), fabric);
  group.add(shell);

  // The open door, facing +z (toward the camera). Its interior glows at night.
  const doorMaterial = createPropMaterial(uniforms, starLayers, { color: '#1a1410', roughness: 0.9, emissive: '#000000' });
  const door = new Mesh(domePatch(-0.42, 0.42, 0.5, 0.995, 10, 0.012), doorMaterial);
  group.add(door);

  const poleMaterial = createPropMaterial(uniforms, starLayers, { color: '#2b2b2e', roughness: 0.5, metalness: 0.3 });
  for (const sign of [1, -1]) {
    const points: Vector3[] = [];
    for (let i = 0; i <= 24; i++) {
      const s = -0.995 + (1.99 * i) / 24;
      const t = s * sign;
      points.push(new Vector3(TENT.halfLength * s, domeHeight(s, t) + 0.012, TENT.halfWidth * t));
    }
    group.add(new Mesh(new TubeGeometry(new CatmullRomCurve3(points), 32, 0.011, 5), poleMaterial));
  }

  // The headtorch's light inside. Always in the scene, at zero until you look
  // in, so the light count (and every shader keyed on it) never changes.
  const inside = new PointLight(0xffc27a, 0, 3.4, 2);
  inside.position.set(0.1, 0.86, 0);
  group.add(inside);

  const glow = new Color();
  let ghost = 0;
  return {
    group,
    shell,
    fabric,
    /** What lights up when it's pointed at. */
    materials: [fabric],
    inside: INSIDE,
    anchor: new Vector3(0, 1.05, 0.2),
    update(tentGlow: number) {
      // Warm light from a headtorch inside, seen through the door.
      doorMaterial.emissive.copy(glow.setRGB(1.0, 0.55, 0.22).multiplyScalar(0.32 * tentGlow));
    },
    /** 0 outside, 1 looking in: the fly fades to a ghost and the inside lights up. */
    setInside(k: number) {
      if (k === ghost) return;
      ghost = k;
      fabric.opacity = 1 - 0.86 * k;
      fabric.depthWrite = k < 0.5;
      door.visible = k < 0.5;
      inside.intensity = 2.4 * k;
    },
    dispose() {
      group.traverse((o) => (o as Mesh).geometry?.dispose());
      fabric.dispose();
      doorMaterial.dispose();
      poleMaterial.dispose();
    },
  };
}

// ---------------------------------------------------------------- fire

const FLAME_FRAGMENT = /* glsl */ `
${WORLD_ALL}
uniform float uFireGain;
varying vec2 vUv;
varying float vSeed;
void main() {
  float t = uTime * 1.6;
  vec2 uv = vUv;
  float n = texture(tNoise, vec2(uv.x * 0.6 + vSeed, uv.y * 0.9 - t * 0.9)).g;
  float n2 = texture(tNoise, vec2(uv.x * 1.3 - vSeed, uv.y * 1.7 - t * 1.7)).r;
  float width = mix(0.5, 0.04, pow(uv.y, 1.15));
  float x = (uv.x - 0.5) * 2.0 + (n - 0.5) * 0.55 * uv.y;
  float shape = smoothstep(width, width * 0.35, abs(x))
    * smoothstep(1.0, 0.5, uv.y + (n2 - 0.5) * 0.4)
    * smoothstep(0.0, 0.07, uv.y);
  float heat = shape * (1.0 - uv.y * 0.65);
  vec3 col = mix(vec3(1.0, 0.22, 0.03), vec3(1.0, 0.62, 0.16), smoothstep(0.15, 0.55, heat));
  col = mix(col, vec3(1.0, 0.93, 0.72), smoothstep(0.62, 0.95, heat));
  gl_FragColor = vec4(col * heat * 3.0 * uFireGain, 1.0);
  #include <tonemapping_fragment>
  gl_FragColor.rgb = wGradeAdditive(gl_FragColor.rgb);
  #include <colorspace_fragment>
}
`;

const EMBER_VERTEX = /* glsl */ `
uniform float uTime;
uniform float uFireGain;
attribute float aSeed;
varying float vBright;
varying vec2 vUv;
void main() {
  float life = mix(1.3, 2.8, fract(aSeed * 7.13));
  float age = fract((uTime + aSeed * 13.7) / life);
  vec3 p = vec3(
    (fract(aSeed * 3.1) - 0.5) * 0.45 + sin(aSeed * 40.0 + uTime * 1.3) * 0.32 * age,
    0.15 + age * mix(1.6, 3.6, fract(aSeed * 5.7)),
    (fract(aSeed * 9.3) - 0.5) * 0.45 + cos(aSeed * 33.0 + uTime * 1.1) * 0.32 * age
  );
  vec4 origin = modelMatrix * vec4(p, 1.0);
  float size = mix(0.018, 0.045, fract(aSeed * 2.3)) * (1.0 - age * 0.7);
  vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  vec3 world = origin.xyz + (right * position.x + up * position.y) * size;
  vBright = (1.0 - age) * smoothstep(0.0, 0.08, age) * uFireGain;
  vUv = uv;
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}
`;

const SPRITE_FRAGMENT = (body: string) => /* glsl */ `
${WORLD_ALL}
uniform float uFireGain;
varying vec2 vUv;
varying float vBright;
void main() {
  float r = length(vUv - 0.5) * 2.0;
  ${body}
  #include <tonemapping_fragment>
  gl_FragColor.rgb = wGradeAdditive(gl_FragColor.rgb);
  #include <colorspace_fragment>
}
`;

const GLOW_VERTEX = /* glsl */ `
varying vec2 vUv;
varying float vBright;
void main() {
  vUv = uv;
  vBright = 1.0;
  vec4 center = modelMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  vec3 world = center.xyz + (right * position.x + up * position.y) * 3.2;
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}
`;

/** Smooth 1D noise in [-1, 1] for the light's flicker. */
function flicker(seed: number) {
  const n = createSimplex2D(seed);
  return (t: number) => 0.62 * n(t * 2.1, 0.3) + 0.38 * n(t * 5.3, 7.1);
}

function createFire(uniforms: WorldUniforms, starLayers: number, seed: number) {
  const group = new Object3D();
  group.name = 'campfire';
  const random = createRandom(seed);
  const fireUniforms = pickUniforms(uniforms, [...SKY_KEYS, 'uFireGain'] as const);

  // A ring of stones.
  const stoneGeometry = new IcosahedronGeometry(0.13, 1);
  const stoneMaterial = createPropMaterial(uniforms, starLayers, { color: '#56524d', roughness: 0.92, snow: true });
  const stones = new InstancedMesh(stoneGeometry, stoneMaterial, 11);
  const m = new Matrix4();
  const q = new Quaternion();
  for (let i = 0; i < 11; i++) {
    const a = (i / 11) * Math.PI * 2 + random() * 0.2;
    const s = 0.75 + random() * 0.55;
    q.setFromAxisAngle(new Vector3(random(), random(), random()).normalize(), random() * Math.PI);
    m.compose(new Vector3(Math.cos(a) * 0.48, 0.05, Math.sin(a) * 0.48), q, new Vector3(s, s * 0.7, s));
    stones.setMatrixAt(i, m);
  }
  group.add(stones);

  // Four logs leaning into a tepee, glowing faintly where they burn.
  const logMaterial = createPropMaterial(uniforms, starLayers, { color: '#2a1d14', roughness: 0.95, emissive: '#000000' });
  const logGeometry = new CylinderGeometry(0.045, 0.06, 0.78, 7);
  for (let i = 0; i < 4; i++) {
    const log = new Mesh(logGeometry, logMaterial);
    const a = (i / 4) * Math.PI * 2 + 0.4;
    log.position.set(Math.cos(a) * 0.17, 0.27, Math.sin(a) * 0.17);
    log.rotation.set(0, -a, 0);
    log.rotateZ(Math.PI * 0.3);
    group.add(log);
  }

  // Three crossed flame cards.
  const flameMaterial = new ShaderMaterial({
    name: 'world-flame',
    uniforms: fireUniforms,
    defines: { STAR_LAYERS: starLayers },
    vertexShader: /* glsl */ `
      attribute float aSeed;
      varying vec2 vUv;
      varying float vSeed;
      void main() { vUv = uv; vSeed = aSeed; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
    `,
    fragmentShader: FLAME_FRAGMENT,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    side: DoubleSide,
  });
  for (let i = 0; i < 3; i++) {
    const geometry = new PlaneGeometry(0.62, 1.05).translate(0, 0.6, 0);
    geometry.setAttribute('aSeed', new BufferAttribute(new Float32Array(4).fill(random()), 1));
    const card = new Mesh(geometry, flameMaterial);
    card.rotation.y = (i * Math.PI) / 3;
    card.renderOrder = 20;
    group.add(card);
  }

  // Embers rising on analytic paths: no simulation, nothing to allocate per frame.
  const emberCount = 110;
  const emberGeometry = new PlaneGeometry(1, 1);
  const seeds = new Float32Array(emberCount);
  for (let i = 0; i < emberCount; i++) seeds[i] = random();
  emberGeometry.setAttribute('aSeed', new InstancedBufferAttribute(seeds, 1));
  const emberMaterial = new ShaderMaterial({
    name: 'world-embers',
    uniforms: fireUniforms,
    defines: { STAR_LAYERS: starLayers },
    vertexShader: EMBER_VERTEX,
    fragmentShader: SPRITE_FRAGMENT('gl_FragColor = vec4(vec3(1.0, 0.55, 0.18) * smoothstep(1.0, 0.0, r) * vBright * 3.0, 1.0);'),
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  const embers = new InstancedMesh(emberGeometry, emberMaterial, emberCount);
  embers.frustumCulled = false;
  embers.renderOrder = 21;
  group.add(embers);

  // A soft glow around the fire, standing in for bloom on tiers without post.
  const glowMaterial = new ShaderMaterial({
    name: 'world-fire-glow',
    uniforms: fireUniforms,
    defines: { STAR_LAYERS: starLayers },
    vertexShader: GLOW_VERTEX,
    fragmentShader: SPRITE_FRAGMENT('gl_FragColor = vec4(vec3(1.0, 0.5, 0.2) * pow(max(1.0 - r, 0.0), 2.6) * 0.28 * uFireGain, 1.0);'),
    transparent: true,
    depthWrite: false,
    // The glow is light in the air, not a card: it mustn't be cut off where it meets the ground.
    depthTest: false,
    blending: AdditiveBlending,
  });
  const glow = new Mesh(new PlaneGeometry(1, 1), glowMaterial);
  glow.position.y = 0.5;
  glow.frustumCulled = false;
  glow.renderOrder = 22;
  group.add(glow);

  const light = new PointLight(0xff8a3c, 14, 45, 2);
  light.position.set(0, 0.65, 0);
  group.add(light);

  const wobble = flicker(seed + 5);
  const ember = new Color();
  return {
    group,
    update(time: number, fireGain: number) {
      // Slow and gentle, so it never reads as flashing (WCAG 2.3.1).
      light.intensity = 14 * fireGain * (0.9 + 0.1 * wobble(time));
      logMaterial.emissive.copy(ember.setRGB(1, 0.32, 0.08).multiplyScalar(0.35 * fireGain));
    },
    dispose() {
      group.traverse((o) => (o as Mesh).geometry?.dispose());
      [stoneMaterial, logMaterial, flameMaterial, emberMaterial, glowMaterial].forEach((material) => material.dispose());
    },
  };
}

// ---------------------------------------------------------------- camp

type Tent = {
  group: Object3D;
  /** What you point at to pick the tent. */
  shell: Object3D;
  materials: MeshStandardMaterial[];
  /** Where the sleeping kit and the headtorch go, in the tent's own frame, and how the kit is turned (an inner on the slant). */
  inside: typeof INSIDE & { yaw?: number };
  /** Its hotspot, in its own frame. */
  anchor: Vector3;
  update(tentGlow: number): void;
  setInside(k: number): void;
  dispose(): void;
};

/** Real tents, by the variant in a kit's `proc:tent/<variant>` model. */
const REAL_TENTS: Record<string, (uniforms: WorldUniforms, starLayers: number) => Tent> = {
  'zorali-summitseeker-2p': createSummitSeeker,
  'durston-x-dome-2': createXDome,
  'nemo-dagger-osmo-3p': createDagger,
  'durston-x-mid-pro-2': createXMid,
};

/** Real kit, by the `<type>/<variant>` in an item's `proc:` model; the type alone gets its stand-in (or, for some types, a real one by variant: gear-models.ts). */
const REAL_KIT: Record<string, (kit: { uniforms: WorldUniforms; starLayers: number }) => KitModel> = {
  'sleeping-pad/nemo-tensor-all-season': createTensorPad,
  'pillow/nemo-fillo': createFilloPillow,
  'chair/alton-lightweight': createAltonChair,
  'pack/osprey-aether-65': createOspreyAether,
};
/** The stand-in pad's height: the tent's bed and pillow spots sit on it, and rise with a thicker pad. */
const STAND_IN_PAD_TOP = 0.055;
/** Where a camp table stands, in the chair's own space: off its left armrest (+x), level with the seat. */
const TABLE_BESIDE_CHAIR = { x: 0.5, z: 0.05 };

export type CampLayout = {
  tent: { x: number; z: number; rotation: number; colour: string };
  fire: { x: number; z: number };
  /** Where the person stands, which way they face, and their jacket's colour until their kit says otherwise. */
  person: { x: number; z: number; rotation: number; jacket: string };
  pack: { x: number; z: number; rotation: number };
  stove: { x: number; z: number };
  water: { x: number; z: number };
  /** Where a camp chair sits, if the kit has one: by the fire, facing it. */
  chair: { x: number; z: number; rotation: number };
  /** Where a dog stands, if the person's camp has one: between them and the fire, side-on to the view. */
  dog: { x: number; z: number; rotation: number };
  /** A car parked at the camp, if the setting has one (Mikey's, on the sand). */
  car?: { x: number; z: number; rotation: number; colour?: string };
  boulders: number;
};

/** Something at camp you can point at: the person (their clothing), the tent, or a piece of kit. */
export type Pickable = {
  id: string;
  kind: 'clothing' | 'tent' | 'item';
  /** Inside the tent: only pickable once you've gone in. */
  inside: boolean;
  object: Object3D;
  /** Its hotspot, in world space. */
  anchor: Vector3;
  /** Where its hotspot's stem meets it, in world space: its top, over the anchor (or the anchor itself, for a dot that hangs below). */
  tip: Vector3;
  /** Which side of the thing its hotspot's dot sits. */
  pin: 'above' | 'below';
};

/** What's pointed at glows with a share of its own colour and a little warm light, so dark clothes brighten without washing out. */
const OWN_GLOW = 0.45;
const WARM_LIFT = new Color(0.035, 0.03, 0.022);

/** Lift a pickable's materials while it's pointed at, and put them back after. */
function highlighter(materials: MeshStandardMaterial[]) {
  const originals = materials.map((m) => m.emissive.clone());
  const lit = materials.map((m, i) => originals[i].clone().add(m.color.clone().multiplyScalar(OWN_GLOW)).add(WARM_LIFT));
  return (on: boolean) => materials.forEach((m, i) => m.emissive.copy(on ? lit[i] : originals[i]));
}

/** Build the camp on the ground given by `groundAt`. */
export function createCamp(
  uniforms: WorldUniforms,
  starLayers: number,
  layout: CampLayout,
  groundAt: (x: number, z: number) => number,
  seed: number,
) {
  const group = new Object3D();
  group.name = 'camp';
  // The stand-in until the kit arrives; a real tent in the kit replaces it (setKit).
  let tent: Tent = createTent(uniforms, starLayers, layout.tent.colour);
  const pitch = (next: Tent) => {
    next.group.position.set(layout.tent.x, groundAt(layout.tent.x, layout.tent.z) - 0.02, layout.tent.z);
    next.group.rotation.y = layout.tent.rotation;
    group.add(next.group);
    return next;
  };
  pitch(tent);

  const fire = createFire(uniforms, starLayers, seed);
  fire.group.position.set(layout.fire.x, groundAt(layout.fire.x, layout.fire.z), layout.fire.z);
  group.add(fire.group);

  // A few boulders around the camp, clear of the tent and the fire.
  const random = createRandom(seed + 11);
  const noise = createSimplex2D(seed + 12);
  const boulderGeometry = new IcosahedronGeometry(1, 2);
  const position = boulderGeometry.getAttribute('position');
  const v = new Vector3();
  for (let i = 0; i < position.count; i++) {
    v.fromBufferAttribute(position, i);
    v.multiplyScalar(1 + 0.22 * noise(v.x * 1.7 + v.z, v.y * 1.7));
    position.setXYZ(i, v.x, v.y * 0.72, v.z);
  }
  boulderGeometry.computeVertexNormals();
  const boulderMaterial = createPropMaterial(uniforms, starLayers, { color: '#4b4844', roughness: 0.93, snow: true });
  const boulders = new InstancedMesh(boulderGeometry, boulderMaterial, Math.max(1, layout.boulders));
  boulders.count = 0;
  const m = new Matrix4();
  const q = new Quaternion();
  for (let tries = 0; tries < 60 && boulders.count < layout.boulders; tries++) {
    const a = random() * Math.PI * 2;
    const r = 7 + random() * 22;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (Math.hypot(x - layout.tent.x, z - layout.tent.z) < 4 || Math.hypot(x - layout.fire.x, z - layout.fire.z) < 3) continue;
    // Keep the foreground toward the camera clear.
    if (z > 6 && Math.abs(x) < 10) continue;
    const s = 0.5 + random() ** 2 * 1.6;
    q.setFromAxisAngle(new Vector3(0, 1, 0), random() * Math.PI * 2);
    m.compose(new Vector3(x, groundAt(x, z) - s * 0.25, z), q, new Vector3(s, s, s));
    boulders.setMatrixAt(boulders.count++, m);
  }
  group.add(boulders);

  // The person and their kit arrive with their campsite's page (setKit).
  const kitGroup = new Object3D();
  kitGroup.name = 'kit';
  group.add(kitGroup);
  const models: GearModel[] = [];
  const pickables: Pickable[] = [];
  const highlights = new Map<string, (on: boolean) => void>();
  let kitFor = '';
  let lit: string | null = null;
  let dog: ReturnType<typeof createDog> | null = null;
  const place = (model: GearModel, x: number, z: number, rotation: number, parent: Object3D = kitGroup, y?: number) => {
    model.object.position.set(x, y ?? groundAt(x, z), z);
    model.object.rotation.y = rotation;
    parent.add(model.object);
    models.push(model);
    return model;
  };
  const bounds = new Box3();
  const register = (
    id: string, kind: Pickable['kind'], inside: boolean, object: Object3D, materials: MeshStandardMaterial[], anchor: Vector3,
    pin: Pickable['pin'] = 'above',
  ) => {
    const tip = anchor.clone();
    if (pin === 'above') {
      object.updateWorldMatrix(true, true);
      bounds.setFromObject(object);
      tip.y = Math.max(anchor.y, bounds.max.y);
    }
    pickables.push({ id, kind, inside, object, anchor, tip, pin });
    highlights.set(id, highlighter(materials));
  };
  const kitArgs = { uniforms, starLayers };
  /** Pitch the tent a model names, if it's a real one: the stand-in stays otherwise. Anything already inside moves across. */
  let pitched = '';
  const pitchTent = (model?: string) => {
    const [kind, variant] = model?.replace(/^proc:/, '').split('/') ?? [];
    const real = kind === 'tent' && variant ? REAL_TENTS[variant] : undefined;
    if (!real || pitched === variant) return;
    const next = real(uniforms, starLayers);
    for (const child of [...tent.group.children]) if (models.some((m) => m.object === child)) next.group.add(child);
    group.remove(tent.group);
    tent.dispose();
    tent = pitch(next);
    pitched = variant;
  };
  // The car, for a setting that has one: parked on the sand beside the tent.
  if (layout.car) place(createCar(kitArgs, layout.car.colour), layout.car.x, layout.car.z, layout.car.rotation, group);

  return {
    group,
    fireAt: fire.group.position,
    get tentGroup() {
      return tent.group;
    },
    /** The pickables at camp; the inside ones only count once you've gone into the tent. */
    pickables,
    update(time: number, fireGain: number, tentGlow: number) {
      fire.update(time, fireGain);
      tent.update(tentGlow);
      dog?.update(time);
    },
    /** Dress the camp with a person's kit: their figure in their clothes, every item with a 3D stand-in, and their dog if they have one. */
    setKit(person: string, items: CampItem[], withDog = false) {
      if (kitFor === person) return;
      kitFor = person;
      if (withDog) {
        dog = createDog(kitArgs);
        place(dog, layout.dog.x, layout.dog.z, layout.dog.rotation);
      }
      const colourOf = (...types: string[]) => items.find((i) => types.includes(i.type) && i.colour)?.colour;
      const clothing = items.filter((i) => i.category === 'clothing');
      if (clothing.length) {
        const figure = createFigure(kitArgs, {
          jacket: colourOf('rain-jacket', 'down-jacket', 'fleece') ?? layout.person.jacket,
          pants: colourOf('pants') ?? '#3a3a3e',
          hat: colourOf('hat') ?? '#d6c4a0',
          shoes: colourOf('shoes') ?? '#2a2725',
        });
        place(figure, layout.person.x, layout.person.z, layout.person.rotation);
        register('clothing', 'clothing', false, figure.object, figure.materials, figure.object.localToWorld(figure.anchor.clone()));
      }
      // A real tent in the kit takes the stand-in's place (if the camp's build hasn't pitched it already), before anything goes inside it.
      pitchTent(items.find((i) => i.model?.replace(/^proc:/, '').startsWith('tent/'))?.model);
      tent.group.updateMatrixWorld(true);
      const inTent = (local: Vector3) => local.clone();
      const spots = tent.inside;
      // The pad first: what lies on it (the bag, the pillow) rests on its top, a real pad's or the stand-in's.
      const kindOf = (item: CampItem) => item.model?.replace(/^proc:/, '').split('/') ?? [];
      const pads = items.filter((i) => kindOf(i)[0] === 'sleeping-pad');
      let lift = 0;
      // A real pad's top and width, for a real quilt to drape over.
      let under: { top?: number; width?: number } = {};
      for (const item of [...pads, ...items.filter((i) => !pads.includes(i))]) {
        const [model, variant] = kindOf(item);
        const real = variant ? REAL_KIT[`${model}/${variant}`] : undefined;
        let built: GearModel | null = null;
        if (model === 'tent') {
          register(item.id, 'tent', false, tent.shell, tent.materials, tent.group.localToWorld(tent.anchor.clone()));
          continue;
        }
        if (model === 'pack') built = place(real ? real(kitArgs) : createPack(kitArgs, item.colour), layout.pack.x, layout.pack.z, layout.pack.rotation);
        else if (model === 'stove-pot') built = place(createStove(kitArgs), layout.stove.x, layout.stove.z, 0);
        else if (model === 'bottle') built = place(createBottle(kitArgs, item.colour), layout.water.x, layout.water.z, 0);
        else if (model === 'chair') built = place(real ? real(kitArgs) : createChair(kitArgs, item.model?.split('/').slice(1)), layout.chair.x, layout.chair.z, layout.chair.rotation);
        else if (model === 'table') {
          // Beside the chair, at its left hand, the long side along it.
          const { x, z, rotation } = layout.chair;
          const [side, ahead] = [TABLE_BESIDE_CHAIR.x, TABLE_BESIDE_CHAIR.z];
          const at = { x: x + side * Math.cos(rotation) + ahead * Math.sin(rotation), z: z - side * Math.sin(rotation) + ahead * Math.cos(rotation) };
          built = place(createTable(kitArgs), at.x, at.z, rotation + Math.PI / 2);
        }
        else if (model === 'sleeping-pad') {
          const at = inTent(spots.pad);
          const pad: KitModel = real ? real(kitArgs) : createPad(kitArgs, item.colour, item.model?.split('/').slice(1));
          built = place(pad, at.x, at.z, spots.yaw ?? 0, tent.group, at.y);
          lift = (pad.top ?? STAND_IN_PAD_TOP) - STAND_IN_PAD_TOP;
          under = { top: pad.top, width: pad.width };
        } else if (model === 'sleeping-bag' || model === 'quilt') {
          const at = inTent(spots.bed);
          // A real quilt drapes over the pad to the floor, so it's told how thick and wide a real pad is.
          const made = model === 'quilt' ? createQuilt(kitArgs, item.colour, item.model?.split('/').slice(1), under) : createSleepingBag(kitArgs, item.colour);
          built = place(made, at.x, at.z, spots.yaw ?? 0, tent.group, at.y + lift);
        } else if (model === 'pillow') {
          const at = inTent(spots.pillow);
          // A real pillow lies across the pad's head, pressed into it a little; the stand-in sits where it always has.
          if (real) built = place(real(kitArgs), at.x, at.z, (spots.yaw ?? 0) + Math.PI / 2, tent.group, spots.pad.y + STAND_IN_PAD_TOP + lift - 0.006);
          else built = place(createPillow(kitArgs, item.colour), at.x, at.z, spots.yaw ?? 0, tent.group, at.y + lift);
        } else if (model === 'headtorch') {
          const at = inTent(spots.headtorch);
          built = place(createHeadtorch(kitArgs), at.x, at.z, 0, tent.group, at.y);
        }
        if (!built) continue;
        const inside = built.object.parent === tent.group;
        built.object.updateMatrixWorld(true);
        register(item.id, 'item', inside, built.object, built.materials, built.object.localToWorld(built.anchor.clone()), built.pin);
      }
    },
    /** Light up what's pointed at (by pickable id), or nothing. */
    setHighlight(id: string | null) {
      if (id === lit) return;
      if (lit) highlights.get(lit)?.(false);
      lit = id;
      if (id) highlights.get(id)?.(true);
    },
    pitchTent,
    setInside(k: number) {
      tent.setInside(k);
    },
    /** Looking into the tent through its ghosted fly, from above the door. */
    insidePose() {
      tent.group.updateMatrixWorld(true);
      return {
        position: tent.group.localToWorld(new Vector3(0.1, 1.85, 2.3)),
        target: tent.group.localToWorld(new Vector3(-0.04, 0.1, -0.06)),
        fov: 50,
      };
    },
    dispose() {
      tent.dispose();
      fire.dispose();
      boulderGeometry.dispose();
      boulderMaterial.dispose();
      models.forEach((model) => {
        model.object.traverse((o) => (o as Mesh).geometry?.dispose());
        model.materials.forEach((m) => m.dispose());
      });
    },
  };
}

export type Camp = ReturnType<typeof createCamp>;
