// The NEMO Dagger OSMO 3P at camp (its geometry and how it was drawn:
// dagger-geometry.ts), in the world's own materials. It keeps the stand-in
// tent's contract (camp.ts): a shell to point at, the fly that fades to a
// ghost to look inside, the headtorch's light, and its door glowing warm at
// night.
import { Color, Mesh, Object3D, PointLight, Vector3, type MeshStandardMaterial } from 'three';
import type { WorldUniforms } from '../systems/uniforms';
import { createPropMaterial } from './props-material';
import { DAGGER_COLOURS, DAGGER_INSIDE, DAGGER_TOP, buildDagger } from './dagger-geometry';

export function createDagger(uniforms: WorldUniforms, starLayers: number) {
  const group = new Object3D();
  group.name = 'tent';
  const made: MeshStandardMaterial[] = [];
  const material = (color: string, roughness: number, metalness = 0) => {
    const m = createPropMaterial(uniforms, starLayers, { color, roughness, metalness });
    made.push(m);
    return m;
  };
  const cloth = material(DAGGER_COLOURS.fly, 0.75);
  // Always transparent (at full opacity outside), so ghosting it to look in never recompiles its shader.
  cloth.transparent = true;
  const doorCloth = material(DAGGER_COLOURS.fly, 0.75);
  const inner = material(DAGGER_COLOURS.inner, 0.85);
  inner.transparent = true;
  const built = buildDagger({
    cloth,
    doorCloth,
    seam: material(DAGGER_COLOURS.seam, 0.7),
    // Dull aluminium, kept mostly diffuse so the poles read grey rather than near black.
    pole: material(DAGGER_COLOURS.pole, 0.45, 0.35),
    cross: material(DAGGER_COLOURS.cross, 0.5),
    hub: material(DAGGER_COLOURS.hub, 0.5, 0.2),
    zip: material(DAGGER_COLOURS.zip, 0.8),
    logo: material(DAGGER_COLOURS.logo, 0.8),
    inner,
    tub: material(DAGGER_COLOURS.tub, 0.85),
  });
  const [door, backDoor] = built.doors;

  // The shell you point at: the fly with its inner, and its doors.
  const shell = new Object3D();
  shell.name = 'dagger';
  shell.add(built.fly, door, backDoor);
  group.add(shell, built.poles);

  // The headtorch's light inside. Always in the scene, at zero until you look
  // in, so the light count (and every shader keyed on it) never changes.
  const inside = new PointLight(0xffc27a, 0, 3.6, 2);
  inside.position.set(0.15, 0.9, 0);
  group.add(inside);

  const glow = new Color();
  let ghost = 0;
  return {
    group,
    shell,
    /** What lights up when it's pointed at. */
    materials: [cloth, doorCloth],
    inside: DAGGER_INSIDE,
    anchor: new Vector3(0, DAGGER_TOP + 0.06, 0.15),
    update(tentGlow: number) {
      // Light from the headtorch inside, through lime nylon. Faint: the door here is the whole
      // vestibule panel, and at night anything brighter swamps the cloth into a flat cream sheet.
      doorCloth.emissive.copy(glow.setRGB(0.6, 0.55, 0.14).multiplyScalar(0.04 * tentGlow));
    },
    /** 0 outside, 1 looking in: the fly fades to a ghost, the doors go, and the inside lights up. */
    setInside(k: number) {
      if (k === ghost) return;
      ghost = k;
      cloth.opacity = 1 - 0.86 * k;
      cloth.depthWrite = k < 0.5;
      inner.opacity = 1 - 0.6 * k;
      door.visible = backDoor.visible = k < 0.5;
      inside.intensity = 2.4 * k;
    },
    dispose() {
      group.traverse((o) => (o as Mesh).geometry?.dispose());
      made.forEach((m) => m.dispose());
      built.textures.forEach((t) => t.dispose());
    },
  };
}
