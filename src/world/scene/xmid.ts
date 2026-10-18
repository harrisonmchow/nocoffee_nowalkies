// A tent at camp: the Durston X-Mid Pro 2 (its geometry and how it was
// drawn: xmid-geometry.ts), in the world's own materials. It keeps the
// stand-in tent's contract (camp.ts): a shell to point at, the fly that
// fades to a ghost to look inside, the headtorch's light, and a warm glow at
// night. Its front door is pitched open, as in Durston's photos, so the
// inner shows through it; setDoor zips it (and the inner's door) shut.
import { Color, Mesh, Object3D, PointLight, Vector3, type MeshStandardMaterial } from 'three';
import type { WorldUniforms } from '../systems/uniforms';
import { createPropMaterial } from './props-material';
import { XMID_COLOURS, XMID_PEAK, XMID_YAW, buildXMid } from './xmid-geometry';

// Inside, in the tent's own space (floor at y 0, the inner's long axis x, door toward +z).
// One sleeper on the back half, clear of the door; the inner's ends are slanted, so the
// pad sits a little toward +x, where that half runs longer.
const XMID_INSIDE = {
  pad: new Vector3(0.07, 0, -0.27),
  bed: new Vector3(0.09, 0.055, -0.27),
  pillow: new Vector3(-0.69, 0.1, -0.27),
  // Hung under the middle of the ridge.
  headtorch: new Vector3(0, 0.95, 0),
};

/** The door as it's pitched: 1 open, 0 zipped. */
const PITCHED_DOOR = 1;

export function createXMid(uniforms: WorldUniforms, starLayers: number) {
  const group = new Object3D();
  group.name = 'tent';
  const made: MeshStandardMaterial[] = [];
  const material = (color: string, roughness: number, metalness = 0) => {
    const m = createPropMaterial(uniforms, starLayers, { color, roughness, metalness });
    made.push(m);
    return m;
  };
  // No snow on it: Dyneema sheds it, and its pale teal is what makes it this tent.
  const cloth = material(XMID_COLOURS.fly, 1);
  // Always transparent (at full opacity outside), so ghosting it to look in never recompiles its shader.
  cloth.transparent = true;
  const doorCloth = material(XMID_COLOURS.fly, 1);
  // The no-see-um mesh: see-through, never hiding what's behind it.
  const mesh = material(XMID_COLOURS.mesh, 0.9);
  mesh.transparent = true;
  mesh.depthWrite = false;
  mesh.opacity = 0.5;
  const floor = material(XMID_COLOURS.floor, 0.8);
  const built = buildXMid({
    cloth,
    doorCloth,
    seam: material(XMID_COLOURS.seam, 0.6),
    dark: material(XMID_COLOURS.dark, 0.6),
    // Carbon trekking poles: dark, a little sheen.
    pole: material(XMID_COLOURS.pole, 0.4, 0.3),
    stake: material(XMID_COLOURS.stake, 0.4, 0.7),
    floor,
    mesh,
  });

  // The shell you point at: the fly, its door, and the inner seen through it.
  const shell = new Object3D();
  shell.name = 'xmid';
  shell.add(built.fly, built.door, built.inner);
  // Turned so the inner (and the kit in it) runs along x.
  const body = new Object3D();
  body.rotation.y = XMID_YAW;
  body.add(shell, built.poles);
  group.add(body);

  // The headtorch's light inside. Always in the scene, at zero until you look
  // in, so the light count (and every shader keyed on it) never changes.
  const inside = new PointLight(0xffc27a, 0, 3.6, 2);
  inside.position.set(0, 0.9, 0);
  group.add(inside);

  let door = PITCHED_DOOR;
  built.setDoor(door);
  const glow = new Color();
  let ghost = 0;
  return {
    group,
    shell,
    /** What lights up when it's pointed at. */
    materials: [cloth, doorCloth],
    inside: XMID_INSIDE,
    anchor: new Vector3(0, XMID_PEAK + 0.06, 0.1),
    update(tentGlow: number) {
      // Warm light from the headtorch inside: through the door's Dyneema while it's shut,
      // and on the inner's floor and mesh through the doorway while it's open.
      glow.setRGB(1.0, 0.64, 0.32).multiplyScalar(tentGlow);
      doorCloth.emissive.copy(glow).multiplyScalar(0.24 * (1 - door));
      floor.emissive.copy(glow).multiplyScalar(0.3 * door);
      mesh.emissive.copy(glow).multiplyScalar(0.12 * door);
    },
    /** 0 outside, 1 looking in: the fly fades to a ghost, its door goes, the mesh thins, and the inside lights up. */
    setInside(k: number) {
      if (k === ghost) return;
      ghost = k;
      cloth.opacity = 1 - 0.86 * k;
      cloth.depthWrite = k < 0.5;
      built.door.visible = k < 0.5;
      mesh.opacity = 0.5 - 0.3 * k;
      inside.intensity = 2.4 * k;
    },
    /** 1 open (as pitched) .. 0 zipped: the fly's door rolls back onto the roof, and the inner's rolls up. */
    setDoor(k: number) {
      door = k;
      built.setDoor(k);
    },
    dispose() {
      group.traverse((o) => (o as Mesh).geometry?.dispose());
      made.forEach((m) => m.dispose());
      built.textures.forEach((t) => t.dispose());
    },
  };
}
