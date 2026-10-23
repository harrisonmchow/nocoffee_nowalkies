// Caleb's tent at camp: the Durston X-Dome 2 (its geometry and how it was
// drawn: xdome-geometry.ts), in the world's own materials. It keeps the
// stand-in tent's contract (camp.ts): a shell to point at, the fly that
// fades to a ghost to look inside, the headtorch's light, and its door
// glowing warm at night.
import { Color, Mesh, Object3D, PointLight, Vector3, type MeshStandardMaterial } from 'three';
import type { WorldUniforms } from '../systems/uniforms';
import { createPropMaterial } from './props-material';
import { XDOME_BROW_Y, XDOME_COLOURS, buildXDome, xdomeInnerZ } from './xdome-geometry';

// Inside, in its own space (floor at y 0, door toward +z). The inner runs on the slant across
// the fly, so the kit lies along it, turned by yaw: one sleeper on the back half, clear of the
// door, head toward -x.
const INNER_YAW = Math.atan(-xdomeInnerZ(1));
const along = (d: number, across: number, y: number) =>
  new Vector3(d * Math.cos(INNER_YAW) - across * Math.sin(INNER_YAW), y, -d * Math.sin(INNER_YAW) - across * Math.cos(INNER_YAW));
const XDOME_INSIDE = {
  pad: along(0, 0.3, 0),
  // On the 7 cm EXPED Ultra 5R.
  bed: along(0.02, 0.3, 0.072),
  pillow: along(-0.72, 0.3, 0.115),
  // Hung under the brow pole's strut.
  headtorch: new Vector3(0, 1.0, 0),
  yaw: INNER_YAW,
};

/** The front door as it's pitched: 1 open, as in Durston's main shot, 0 zipped. */
const PITCHED_DOOR = 1;

export function createXDome(uniforms: WorldUniforms, starLayers: number) {
  const group = new Object3D();
  group.name = 'tent';
  const made: MeshStandardMaterial[] = [];
  const material = (color: string, roughness: number, metalness = 0) => {
    const m = createPropMaterial(uniforms, starLayers, { color, roughness, metalness });
    made.push(m);
    return m;
  };
  // No snow on it: Caleb's camp is autumn, and the fly sheds it anyway.
  const cloth = material(XDOME_COLOURS.fly, 1);
  // Always transparent (at full opacity outside), so ghosting it to look in never recompiles its shader.
  cloth.transparent = true;
  const doorCloth = material(XDOME_COLOURS.fly, 1);
  const inner = material(XDOME_COLOURS.inner, 0.8);
  inner.transparent = true;
  // The inner's no-see-um mesh: see-through, never hiding what's behind it.
  const mesh = material(XDOME_COLOURS.mesh, 0.9);
  mesh.transparent = true;
  mesh.depthWrite = false;
  mesh.opacity = 0.45;
  const built = buildXDome({
    cloth,
    doorCloth,
    // Dull aluminium, kept mostly diffuse so the poles read pale grey rather than near black.
    alu: material(XDOME_COLOURS.pole, 0.45, 0.35),
    hub: material(XDOME_COLOURS.hub, 0.5, 0.1),
    clip: material(XDOME_COLOURS.clip, 0.7),
    webbing: material(XDOME_COLOURS.webbing, 0.85),
    inner,
    mesh,
    zip: material(XDOME_COLOURS.zip, 0.6),
  });
  const [door, backDoor] = built.doors;

  // The shell you point at: the fly with its vents, its doors, and the inner.
  const shell = new Object3D();
  shell.name = 'xdome';
  shell.add(built.fly, door, backDoor, built.inner);
  group.add(shell, built.poles);

  // The headtorch's light inside. Always in the scene, at zero until you look
  // in, so the light count (and every shader keyed on it) never changes.
  const inside = new PointLight(0xffc27a, 0, 3.4, 2);
  inside.position.set(0, 0.95, 0);
  group.add(inside);

  let doorOpen = PITCHED_DOOR;
  built.setDoor(doorOpen);
  const glow = new Color();
  let ghost = 0;
  return {
    group,
    shell,
    /** What lights up when it's pointed at. */
    materials: [cloth, doorCloth],
    inside: XDOME_INSIDE,
    anchor: new Vector3(0, XDOME_BROW_Y + 0.06, 0.15),
    update(tentGlow: number) {
      // Warm light from the headtorch inside: through the door's sage nylon while it's shut,
      // and on the inner's floor and mesh through the doorway while it's open.
      glow.setRGB(1.0, 0.62, 0.3).multiplyScalar(tentGlow);
      doorCloth.emissive.copy(glow).multiplyScalar(0.26 * (1 - doorOpen));
      inner.emissive.copy(glow).multiplyScalar(0.3 * doorOpen);
      mesh.emissive.copy(glow).multiplyScalar(0.12 * doorOpen);
    },
    /** 0 outside, 1 looking in: the fly fades to a ghost, the doors go, and the inside lights up. */
    setInside(k: number) {
      if (k === ghost) return;
      ghost = k;
      cloth.opacity = 1 - 0.86 * k;
      cloth.depthWrite = k < 0.5;
      inner.opacity = 1 - 0.6 * k;
      mesh.opacity = 0.45 - 0.27 * k;
      door.visible = backDoor.visible = k < 0.5;
      inside.intensity = 2.4 * k;
    },
    /** 1 open (gathered back along its seam) .. 0 zipped. */
    setDoor(k: number) {
      doorOpen = k;
      built.setDoor(k);
    },
    dispose() {
      group.traverse((o) => (o as Mesh).geometry?.dispose());
      made.forEach((m) => m.dispose());
      built.textures.forEach((t) => t.dispose());
    },
  };
}
