// Stand-ins for a person and their kit at camp: simple stylised shapes from
// the geometry kit, until scans and real models replace them
// (GEAR-3D-PLAN.md §6). Each comes with its own materials, so hovering one
// lights only that thing, and an anchor (local) for its hotspot.
import {
  BoxGeometry,
  DoubleSide,
  CapsuleGeometry,
  CylinderGeometry,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  SphereGeometry,
  TorusGeometry,
  Vector3,
  type BufferGeometry,
} from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createPropMaterial } from './props-material';
import { MOONLITE_COLOURWAYS, MOONLITE_HEIGHT, buildMoonlite, type MoonliteColourway } from './moonlite-geometry';
import { ULTRA_COLOURS, ULTRA_THICKNESS, buildUltraMat } from './ultra-mat-geometry';
import { TABLE_ZERO_COLOURS, TABLE_ZERO_HEIGHT, buildTableZero } from './table-zero-geometry';
import { WARATAH_COLOURS, WARATAH_LOFT, buildWaratah } from './waratah-geometry';
import type { WorldUniforms } from '../systems/uniforms';

export type GearModel = {
  object: Object3D;
  materials: MeshStandardMaterial[];
  /** Where its hotspot sits, in the model's own space. */
  anchor: Vector3;
  /** Which side of it the hotspot's dot sits: above it (the default), or below, for something others lie on. */
  pin?: 'above' | 'below';
};

type Kit = { uniforms: WorldUniforms; starLayers: number };

function build(kit: Kit) {
  const object = new Object3D();
  const materials: MeshStandardMaterial[] = [];
  const material = (color: string, options: { roughness?: number; metalness?: number; emissive?: string } = {}) => {
    const m = createPropMaterial(kit.uniforms, kit.starLayers, { color, roughness: options.roughness ?? 0.85, metalness: options.metalness, emissive: options.emissive });
    materials.push(m);
    return m;
  };
  const add = (geometry: BufferGeometry, m: MeshStandardMaterial, x = 0, y = 0, z = 0) => {
    const mesh = new Mesh(geometry, m);
    mesh.position.set(x, y, z);
    object.add(mesh);
    return mesh;
  };
  /** Bake each part into one mesh per material: a dozen parts, a handful of draw calls. */
  const finish = (anchor: Vector3): GearModel => {
    const parts = object.children.filter((c): c is Mesh => (c as Mesh).isMesh);
    for (const m of materials) {
      const mine = parts.filter((p) => p.material === m);
      if (mine.length < 2) continue;
      // Non-indexed throughout: some primitives come indexed and some don't.
      const merged = mergeGeometries(mine.map((p) => {
        p.updateMatrix();
        const g = p.geometry.index ? p.geometry.toNonIndexed() : p.geometry.clone();
        return g.applyMatrix4(p.matrix);
      }));
      if (!merged) continue;
      mine.forEach((p) => {
        object.remove(p);
        p.geometry.dispose();
      });
      object.add(new Mesh(merged, m));
    }
    return { object, materials, anchor };
  };
  return { object, materials, material, add, finish };
}

/** Clothing colours for the figure, from the items' own colours where they have them. */
export type FigureColours = { jacket: string; pants: string; hat: string; shoes: string };

/**
 * A person standing still, about 1.75 m, facing +z. Stylised on purpose:
 * rounded shapes in their clothes' colours, and a neutral clay where skin
 * would be, until each person is scanned.
 */
export function createFigure(kit: Kit, colours: FigureColours): GearModel {
  const { object, material, add, finish } = build(kit);
  object.name = 'figure';
  const clay = material('#b8ad9e', { roughness: 0.9 });
  const jacket = material(colours.jacket, { roughness: 0.7 });
  const pants = material(colours.pants, { roughness: 0.85 });
  const hat = material(colours.hat, { roughness: 0.95 });
  const shoes = material(colours.shoes, { roughness: 0.8 });
  for (const side of [-1, 1]) {
    add(new RoundedBoxGeometry(0.11, 0.08, 0.27, 2, 0.03), shoes, side * 0.1, 0.04, 0.03);
    add(new CapsuleGeometry(0.075, 0.66, 4, 10), pants, side * 0.1, 0.46, 0);
    const arm = add(new CapsuleGeometry(0.056, 0.5, 4, 10), jacket, side * 0.245, 1.12, 0.01);
    arm.rotation.z = side * 0.09;
    add(new SphereGeometry(0.05, 12, 8), clay, side * 0.27, 0.83, 0.02);
  }
  add(new RoundedBoxGeometry(0.36, 0.2, 0.22, 2, 0.06), pants, 0, 0.88, 0);
  const torso = add(new CapsuleGeometry(0.17, 0.36, 4, 14), jacket, 0, 1.2, 0);
  torso.scale.set(1.12, 1, 0.74);
  add(new CylinderGeometry(0.05, 0.055, 0.08, 10), clay, 0, 1.46, 0);
  add(new SphereGeometry(0.105, 18, 14), clay, 0, 1.6, 0.005);
  // A beanie: a cap and a folded band.
  const cap = add(new SphereGeometry(0.112, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), hat, 0, 1.625, 0.005);
  cap.scale.set(1, 1.08, 1);
  const band = add(new TorusGeometry(0.106, 0.022, 8, 24), hat, 0, 1.63, 0.005);
  band.rotation.x = Math.PI / 2;
  return finish(new Vector3(0, 1.25, 0.12));
}

/** A pack standing on its base, about 60 cm tall, back panel toward -z. */
export function createPack(kit: Kit, color = '#55594d'): GearModel {
  const { object, material, add, finish } = build(kit);
  object.name = 'pack';
  const body = material(color, { roughness: 0.82 });
  const trim = material('#2c2d2b', { roughness: 0.7 });
  add(new RoundedBoxGeometry(0.32, 0.56, 0.22, 3, 0.07), body, 0, 0.28, 0);
  add(new RoundedBoxGeometry(0.3, 0.1, 0.22, 2, 0.04), body, 0, 0.6, 0.005);
  add(new RoundedBoxGeometry(0.2, 0.24, 0.05, 2, 0.02), body, 0, 0.26, 0.125);
  for (const side of [-1, 1]) add(new BoxGeometry(0.03, 0.5, 0.012), trim, side * 0.09, 0.3, -0.115);
  return finish(new Vector3(0, 0.62, 0));
}

/** A canister stove with a pot on it. */
export function createStove(kit: Kit): GearModel {
  const { object, material, add, finish } = build(kit);
  object.name = 'stove';
  const steel = material('#9a9c9e', { roughness: 0.35, metalness: 0.8 });
  const canister = material('#2f5f8f', { roughness: 0.5, metalness: 0.4 });
  const black = material('#1f1f20', { roughness: 0.6 });
  add(new CylinderGeometry(0.05, 0.055, 0.09, 20), canister, 0, 0.045, 0);
  add(new CylinderGeometry(0.018, 0.022, 0.04, 12), black, 0, 0.11, 0);
  add(new CylinderGeometry(0.068, 0.064, 0.1, 24), steel, 0, 0.18, 0);
  add(new CylinderGeometry(0.07, 0.07, 0.01, 24), steel, 0, 0.235, 0);
  add(new RoundedBoxGeometry(0.11, 0.015, 0.02, 1, 0.006), black, 0.12, 0.2, 0);
  return finish(new Vector3(0, 0.3, 0));
}

/** A water bottle with its cap. */
export function createBottle(kit: Kit, color = '#6f9cb8'): GearModel {
  const { object, material, add, finish } = build(kit);
  object.name = 'bottle';
  const plastic = material(color, { roughness: 0.3 });
  const cap = material('#2b2b2e', { roughness: 0.6 });
  add(new CylinderGeometry(0.04, 0.04, 0.22, 18), plastic, 0, 0.11, 0);
  add(new CylinderGeometry(0.018, 0.026, 0.03, 14), plastic, 0, 0.235, 0);
  add(new CylinderGeometry(0.02, 0.02, 0.025, 14), cap, 0, 0.26, 0);
  return finish(new Vector3(0, 0.28, 0));
}

/**
 * An inflatable sleeping mat, 183 × 51 cm, lying along x, with lengthwise
 * baffles; or a real one, by the variant its model names
 * (`proc:sleeping-pad/exped-ultra-5r`).
 */
export function createPad(kit: Kit, color?: string, variant: string[] = []): GearModel {
  if (variant[0] === 'exped-ultra-5r') return createUltraMat(kit, color);
  const { object, material, add, finish } = build(kit);
  object.name = 'pad';
  color ??= '#d38a2e';
  const shell = material(color, { roughness: 0.55 });
  add(new RoundedBoxGeometry(1.83, 0.055, 0.51, 3, 0.025), shell, 0, 0.0275, 0);
  for (let i = -2; i <= 2; i++) {
    const tube = add(new CapsuleGeometry(0.035, 1.7, 3, 8), shell, 0, 0.05, i * 0.095);
    tube.rotation.z = Math.PI / 2;
    tube.scale.set(1, 1, 0.55);
  }
  // The bag lies on it, so its dot hangs below its front edge rather than above.
  return { ...finish(new Vector3(0.62, 0.08, 0.18)), pin: 'below' };
}

/**
 * The EXPED Ultra 5R (ultra-mat-geometry.ts), 183 × 52 × 7 cm, lying along x,
 * head toward -x, valves at the foot: four draw calls, its shell in Lichen
 * unless the kit gives it a colour.
 */
function createUltraMat(kit: Kit, color: string = ULTRA_COLOURS.shell): GearModel {
  const { object, material, finish } = build(kit);
  object.name = 'pad';
  const meshes = buildUltraMat({
    shell: material(color, { roughness: 0.55 }),
    valve: material(ULTRA_COLOURS.valve, { roughness: 0.3 }),
    cord: material(ULTRA_COLOURS.cord, { roughness: 0.85 }),
    print: material(ULTRA_COLOURS.print, { roughness: 0.7 }),
  });
  meshes.forEach((m) => object.add(m));
  // The bag lies on it, so its dot hangs below its front edge rather than above.
  return { ...finish(new Vector3(0.62, ULTRA_THICKNESS + 0.01, 0.2)), pin: 'below' };
}

/** A mummy sleeping bag lying along x, hood toward -x. */
export function createSleepingBag(kit: Kit, color = '#3b4c6e'): GearModel {
  const { object, material, add, finish } = build(kit);
  object.name = 'sleeping-bag';
  const shell = material(color, { roughness: 0.6 });
  const lining = material('#262a33', { roughness: 0.9 });
  const body = add(new CapsuleGeometry(0.21, 1.0, 6, 16), shell, 0.2, 0.11, 0);
  body.rotation.z = Math.PI / 2;
  body.scale.set(0.55, 1, 1);
  const hood = add(new SphereGeometry(0.2, 16, 12), shell, -0.42, 0.12, 0);
  hood.scale.set(1, 0.62, 1.05);
  const opening = add(new SphereGeometry(0.1, 14, 10), lining, -0.5, 0.15, 0);
  opening.scale.set(0.6, 0.45, 0.9);
  return finish(new Vector3(0.35, 0.24, 0.05));
}

/**
 * A quilt laid over the mat: a soft slab with baffle lines, foot box toward +x; or a real one, by
 * the variant its model names (`proc:quilt/neve-gear-waratah`).
 */
export function createQuilt(kit: Kit, color = '#5d4a6e', variant: string[] = []): GearModel {
  if (variant[0] === 'neve-gear-waratah') return createWaratah(kit);
  const { object, material, add, finish } = build(kit);
  object.name = 'quilt';
  const shell = material(color, { roughness: 0.62 });
  add(new RoundedBoxGeometry(1.75, 0.09, 0.62, 3, 0.04), shell, 0.04, 0.1, 0);
  for (let i = -3; i <= 3; i++) add(new BoxGeometry(0.012, 0.012, 0.6), shell, 0.04 + i * 0.22, 0.146, 0);
  return finish(new Vector3(0.25, 0.2, 0.05));
}

/**
 * The Neve Gear Waratah (waratah-geometry.ts), laid over the mat with its opening down, head
 * toward -x, footbox toward +x: five draw calls. Its origin is the mat's top, and its flanks reach
 * the floor, the EXPED's thickness below.
 */
function createWaratah(kit: Kit): GearModel {
  const { object, material, finish } = build(kit);
  object.name = 'quilt';
  const lining = material(WARATAH_COLOURS.lining, { roughness: 0.5 });
  // Only seen from inside, through the head opening.
  lining.side = DoubleSide;
  const meshes = buildWaratah({
    shell: material(WARATAH_COLOURS.shell, { roughness: 0.4 }),
    panel: material(WARATAH_COLOURS.panel, { roughness: 0.38 }),
    lining,
    cord: material(WARATAH_COLOURS.cord, { roughness: 0.85 }),
    hardware: material(WARATAH_COLOURS.hardware, { roughness: 0.4 }),
  }, ULTRA_THICKNESS);
  meshes.forEach((m) => object.add(m));
  return finish(new Vector3(0.1, WARATAH_LOFT + 0.02, 0.05));
}

/** An inflatable camp pillow. */
export function createPillow(kit: Kit, color = '#8b9097'): GearModel {
  const { object, material, add, finish } = build(kit);
  object.name = 'pillow';
  const shell = material(color, { roughness: 0.45 });
  const pillow = add(new SphereGeometry(0.2, 18, 12), shell, 0, 0.06, 0);
  pillow.scale.set(0.8, 0.28, 1.15);
  return finish(new Vector3(0, 0.14, 0));
}

/** A headtorch, hung from the tent's apex: the light inside comes from it. */
export function createHeadtorch(kit: Kit): GearModel {
  const { object, material, add, finish } = build(kit);
  object.name = 'headtorch';
  const strap = material('#3b3d40', { roughness: 0.8 });
  const lamp = material('#202124', { roughness: 0.4, emissive: '#ffcf8a' });
  lamp.emissiveIntensity = 1.4;
  const loop = add(new TorusGeometry(0.06, 0.008, 6, 20), strap, 0, 0, 0);
  loop.rotation.x = Math.PI / 2;
  add(new RoundedBoxGeometry(0.05, 0.03, 0.03, 1, 0.008), lamp, 0, -0.01, 0.06);
  return finish(new Vector3(0, -0.02, 0.06));
}

/**
 * A dog standing side-on, about 55 cm at the shoulder, facing +z: a generic
 * stand-in, in the same rounded style as the person, until a real one
 * replaces it. Its tail is its own part, so it can wag.
 */
export function createDog(kit: Kit, coat = '#b07a45'): GearModel & { update(time: number): void } {
  const { object, material, add, finish } = build(kit);
  object.name = 'dog';
  const fur = material(coat, { roughness: 0.95 });
  const pale = material('#d9b98f', { roughness: 0.95 });
  const ears = material('#865631', { roughness: 0.95 });
  const dark = material('#231e1b', { roughness: 0.5 });
  const body = add(new CapsuleGeometry(0.125, 0.4, 4, 14), fur, 0, 0.46, -0.02);
  body.rotation.x = Math.PI / 2;
  body.scale.set(0.88, 1, 1);
  const chest = add(new SphereGeometry(0.135, 16, 12), pale, 0, 0.45, 0.19);
  chest.scale.set(0.86, 1.05, 0.9);
  const haunch = add(new SphereGeometry(0.13, 16, 12), fur, 0, 0.47, -0.22);
  haunch.scale.set(0.9, 1, 1);
  const neck = add(new CapsuleGeometry(0.07, 0.14, 4, 10), fur, 0, 0.58, 0.27);
  neck.rotation.x = -0.7;
  const head = add(new SphereGeometry(0.1, 16, 12), fur, 0, 0.69, 0.35);
  head.scale.set(0.95, 0.9, 1.05);
  add(new RoundedBoxGeometry(0.085, 0.075, 0.14, 2, 0.03), pale, 0, 0.655, 0.46);
  add(new SphereGeometry(0.022, 10, 8), dark, 0, 0.678, 0.535);
  for (const side of [-1, 1]) {
    add(new SphereGeometry(0.012, 8, 6), dark, side * 0.045, 0.715, 0.43);
    // Floppy ears, hanging off the sides of the head.
    const ear = add(new RoundedBoxGeometry(0.055, 0.11, 0.03, 2, 0.012), ears, side * 0.088, 0.67, 0.335);
    ear.rotation.z = side * 0.35;
    for (const end of [-1, 1]) {
      const z = end * 0.2 + (end > 0 ? 0.01 : -0.01);
      add(new CapsuleGeometry(0.034, 0.3, 4, 8), end > 0 ? pale : fur, side * 0.07, 0.2, z);
      const paw = add(new SphereGeometry(0.04, 10, 8), pale, side * 0.07, 0.035, z + 0.02);
      paw.scale.set(1, 0.6, 1.25);
    }
  }
  const model = finish(new Vector3(0, 0.82, 0.3));
  // The tail on its own pivot at its root, raised and swept back.
  const pivot = new Object3D();
  pivot.position.set(0, 0.53, -0.33);
  const raise = new Object3D();
  raise.rotation.x = -0.85;
  const tail = new Mesh(new CapsuleGeometry(0.027, 0.24, 4, 8), fur);
  tail.position.set(0, 0.14, 0);
  raise.add(tail);
  pivot.add(raise);
  object.add(pivot);
  return {
    ...model,
    update(time: number) {
      pivot.rotation.y = Math.sin(time * 8.5) * 0.45;
    },
  };
}

/**
 * A Suzuki Jimny (the boxy JB74), about 3.5 m long, front toward +z: a
 * stand-in for Mikey's car until a model replaces it. Upright and square,
 * two-tone with a black roof and pillars, round headlights either side of a
 * five-slot grille, black wheel-arch flares, and the spare on the back door.
 */
export function createCar(kit: Kit, paintColour = '#e2c31f'): GearModel {
  const { object, material, add, finish } = build(kit);
  object.name = 'car';
  const paint = material(paintColour, { roughness: 0.28, metalness: 0.15 });
  const roof = material('#18191b', { roughness: 0.35, metalness: 0.2 });
  const glass = material('#141a20', { roughness: 0.06, metalness: 0.7 });
  const trim = material('#1e1f21', { roughness: 0.7 });
  const tyre = material('#151515', { roughness: 0.92 });
  const hub = material('#5d6062', { roughness: 0.35, metalness: 0.75 });
  const lamp = material('#f4e2c0', { roughness: 0.3, emissive: '#ffd9a0' });
  lamp.emissiveIntensity = 0.6;
  const tail = material('#5a0d0d', { roughness: 0.4, emissive: '#c01818' });
  tail.emissiveIntensity = 0.4;
  // The body: a tall, square shell riding high, its flat bonnet, and an upright glasshouse under a black roof.
  add(new RoundedBoxGeometry(1.5, 0.62, 3.25, 3, 0.06), paint, 0, 0.81, 0);
  add(new RoundedBoxGeometry(1.48, 0.06, 0.9, 2, 0.03), paint, 0, 1.13, 1.17);
  add(new RoundedBoxGeometry(1.44, 0.44, 2.2, 2, 0.04), glass, 0, 1.34, -0.47);
  add(new RoundedBoxGeometry(1.5, 0.08, 2.3, 2, 0.03), roof, 0, 1.62, -0.47);
  for (const side of [-1, 1]) {
    // Black A-pillars, body-colour pillars behind them, a drip rail and a mirror.
    add(new BoxGeometry(0.05, 0.44, 0.09), roof, side * 0.725, 1.34, 0.66);
    for (const z of [-0.2, -1.5]) add(new BoxGeometry(0.05, 0.44, z < -1 ? 0.2 : 0.12), paint, side * 0.725, 1.34, z);
    add(new BoxGeometry(0.03, 0.03, 2.3), roof, side * 0.74, 1.6, -0.47);
    add(new RoundedBoxGeometry(0.1, 0.12, 0.06, 1, 0.02), roof, side * 0.82, 1.16, 0.6);
    // A black sill between the arches.
    add(new RoundedBoxGeometry(0.06, 0.12, 1.3, 1, 0.03), trim, side * 0.76, 0.55, 0);
  }
  // The face: a black grille with five slots, round headlights, and a chunky bumper.
  add(new RoundedBoxGeometry(0.86, 0.26, 0.04, 1, 0.015), trim, 0, 0.88, 1.63);
  for (let i = -2; i <= 2; i++) add(new BoxGeometry(0.07, 0.17, 0.02), tyre, i * 0.15, 0.88, 1.65);
  for (const side of [-1, 1]) {
    const bezel = add(new TorusGeometry(0.11, 0.02, 6, 20), trim, side * 0.6, 0.88, 1.635);
    bezel.scale.z = 1.5;
    const light = add(new CylinderGeometry(0.1, 0.1, 0.04, 20), lamp, side * 0.6, 0.88, 1.63);
    light.rotation.x = Math.PI / 2;
  }
  add(new RoundedBoxGeometry(1.6, 0.22, 0.2, 2, 0.05), trim, 0, 0.52, 1.68);
  // The back: a bumper with the tail-lights in it, and the spare wheel on the door.
  add(new RoundedBoxGeometry(1.6, 0.22, 0.2, 2, 0.05), trim, 0, 0.52, -1.67);
  for (const side of [-1, 1]) add(new RoundedBoxGeometry(0.2, 0.08, 0.04, 1, 0.015), tail, side * 0.6, 0.55, -1.78);
  const spare = add(new CylinderGeometry(0.33, 0.33, 0.22, 20), tyre, 0, 0.98, -1.74);
  spare.rotation.x = Math.PI / 2;
  const spareHub = add(new CylinderGeometry(0.17, 0.17, 0.24, 14), hub, 0, 0.98, -1.74);
  spareHub.rotation.x = Math.PI / 2;
  // Wheels under flared arches, set out near the corners.
  for (const side of [-1, 1]) {
    for (const end of [-1, 1]) {
      const z = end * 1.125;
      const wheel = add(new CylinderGeometry(0.35, 0.35, 0.24, 20), tyre, side * 0.7, 0.35, z);
      wheel.rotation.z = Math.PI / 2;
      const cap = add(new CylinderGeometry(0.2, 0.2, 0.26, 14), hub, side * 0.7, 0.35, z);
      cap.rotation.z = Math.PI / 2;
      const flare = add(new TorusGeometry(0.42, 0.06, 6, 16, Math.PI), trim, side * 0.77, 0.4, z);
      flare.rotation.y = Math.PI / 2;
      flare.scale.x = 1.4;
    }
  }
  return finish(new Vector3(0, 2.0, 0));
}

/**
 * A camp chair: the NEMO Moonlite (moonlite-geometry.ts), about 0.64 m tall,
 * facing +z, in the colourway its model names
 * (`proc:chair/nemo-moonlite/<colourway>`, Smokey Olive by default).
 */
export function createChair(kit: Kit, variant: string[] = []): GearModel {
  const { object, material, finish } = build(kit);
  object.name = 'chair';
  const way = variant[1] && variant[1] in MOONLITE_COLOURWAYS ? (variant[1] as MoonliteColourway) : 'smokey-olive';
  const c = MOONLITE_COLOURWAYS[way];
  // The sling, pockets and webbing are single sheets, seen from both sides.
  const cloth = (color: string, roughness: number) => {
    const m = material(color, { roughness });
    m.side = DoubleSide;
    return m;
  };
  // At camp distance the feet read as frame, the print as webbing and the toggle as
  // buckle, so they share those materials: five or six draw calls, not nine. The hubs
  // keep their own only where they're a different colour (Black Pearl's chartreuse).
  const frame = material(c.frame, { roughness: 0.4, metalness: 0.5 });
  const webbing = cloth(c.webbing, 0.85);
  const metal = material(c.toggle, { roughness: 0.35, metalness: 0.75 });
  const meshes = buildMoonlite({
    frame,
    hub: c.hub === c.frame ? frame : material(c.hub, { roughness: 0.45, metalness: 0.5 }),
    rubber: frame,
    mesh: cloth(c.mesh, 1),
    trim: cloth(c.trim, 0.8),
    webbing,
    metal,
    print: webbing,
    toggle: metal,
  });
  meshes.forEach((m) => object.add(m));
  return finish(new Vector3(0, MOONLITE_HEIGHT + 0.06, -0.2));
}

/**
 * A camp table: the Helinox Table Zero LT (table-zero-geometry.ts), 0.3 m
 * tall and 0.495 m long, its long side facing +z.
 */
export function createTable(kit: Kit): GearModel {
  const { object, material, finish } = build(kit);
  object.name = 'table';
  // The GhostGrid top is see-through: the ground and the frame show through it.
  const mesh = material(TABLE_ZERO_COLOURS.mesh, { roughness: 0.85 });
  mesh.side = DoubleSide;
  mesh.transparent = true;
  mesh.opacity = 0.82;
  const meshes = buildTableZero({
    frame: material(TABLE_ZERO_COLOURS.frame, { roughness: 0.35, metalness: 0.5 }),
    hardware: material(TABLE_ZERO_COLOURS.hardware, { roughness: 0.6 }),
    mesh,
  });
  meshes.forEach((m) => object.add(m));
  return finish(new Vector3(0, TABLE_ZERO_HEIGHT + 0.06, 0));
}
