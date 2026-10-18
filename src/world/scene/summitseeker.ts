// Harry's tent at camp: the Zorali SummitSeeker 2P (its geometry and how it
// was rebuilt: summitseeker-geometry.ts). Four meshes in the world's own
// materials: the fly with its trim, the inner's floor and band with its zips
// and seams, the mesh canopy, and the poles with their clips and stakes. It
// keeps the stand-in tent's contract (camp.ts): a shell to point at, the fly
// that fades to a ghost to look inside, the headtorch's light, and its door
// glowing warm at night.
import { Box3, BufferGeometry, CanvasTexture, Color, DoubleSide, Float32BufferAttribute, Mesh, Object3D, PointLight, SRGBColorSpace, Vector3 } from 'three';
import type { WorldUniforms } from '../systems/uniforms';
import { createPropMaterial } from './props-material';
import { SUMMITSEEKER_COLOURS, SUMMITSEEKER_INSIDE, buildSummitSeeker, partGeometry, summitSeekerParts } from './summitseeker-geometry';

/** Its vertex colours as multiples of the material's own colour, so the two don't multiply into a darker one. */
function relativeTo(geometry: BufferGeometry, colour: string) {
  const c = new Color(colour);
  const attribute = geometry.getAttribute('color');
  for (let i = 0; i < attribute.count; i++) attribute.setXYZ(i, attribute.getX(i) / c.r, attribute.getY(i) / c.g, attribute.getZ(i) / c.b);
  return geometry;
}

export function createSummitSeeker(uniforms: WorldUniforms, starLayers: number) {
  const group = new Object3D();
  group.name = 'tent';
  const parts = summitSeekerParts();
  const geometry = buildSummitSeeker(parts);

  // The fly carries its trim in its vertex colours, relative to its teal, so pointing at it lifts the teal.
  // No snow on it: its teal is what makes it this tent, and its steep, slick panels shed snow anyway.
  const fabric = createPropMaterial(uniforms, starLayers, { color: SUMMITSEEKER_COLOURS.fly, roughness: 0.62 });
  fabric.vertexColors = true;
  fabric.side = DoubleSide;
  // Always transparent (at full opacity outside), so ghosting it to look in never recompiles its shader.
  fabric.transparent = true;
  const fly = new Mesh(relativeTo(geometry.fly, SUMMITSEEKER_COLOURS.fly), fabric);
  fly.name = 'summitseeker-fly';

  // The inner's floor, band, zips and seams, and the frame, share one material (and program): colour from their vertices.
  const solid = createPropMaterial(uniforms, starLayers, { color: '#ffffff', roughness: 0.72 });
  solid.vertexColors = true;
  solid.side = DoubleSide;
  const body = new Mesh(geometry.body, solid);
  body.name = 'summitseeker-inner';
  const metal = createPropMaterial(uniforms, starLayers, { color: '#ffffff', roughness: 0.42, metalness: 0.3 });
  metal.vertexColors = true;
  metal.side = DoubleSide;
  const frame = new Mesh(geometry.frame, metal);
  frame.name = 'summitseeker-frame';

  // The no-see-um mesh: see-through grey, never hiding what's behind it.
  geometry.canopy.deleteAttribute('color');
  const mesh = createPropMaterial(uniforms, starLayers, { color: SUMMITSEEKER_COLOURS.mesh, roughness: 0.9 });
  mesh.side = DoubleSide;
  mesh.transparent = true;
  mesh.depthWrite = false;
  mesh.opacity = 0.5;
  const canopy = new Mesh(geometry.canopy, mesh);
  canopy.name = 'summitseeker-canopy';
  canopy.renderOrder = 1;

  // The near door, a hair proud of the fly: glowing faintly at night with the headtorch inside.
  const doorGeometry = partGeometry(parts.find((p) => p.id === 'fly')!);
  // Its colour per vertex; at night the headtorch's light comes through it, brightest at the middle.
  const doorMaterial = createPropMaterial(uniforms, starLayers, { color: '#ffffff', roughness: 0.62, emissive: '#000000' });
  doorMaterial.vertexColors = true;
  doorMaterial.side = DoubleSide;
  doorMaterial.emissiveMap = glowTexture();
  const door = new Mesh(doorPanel(doorGeometry), doorMaterial);
  door.name = 'summitseeker-door-glow';
  doorGeometry.dispose();

  // The shell you point at: the fly, its door, and the inner's floor showing under its hem.
  const shell = new Object3D();
  shell.name = 'summitseeker';
  shell.add(fly, door, body);
  group.add(shell, canopy, frame);

  // The headtorch's light inside. Always in the scene, at zero until you look
  // in, so the light count (and every shader keyed on it) never changes.
  const inside = new PointLight(0xffc27a, 0, 3.6, 2);
  inside.position.copy(SUMMITSEEKER_INSIDE.light);
  group.add(inside);

  const glow = new Color();
  let ghost = 0;
  return {
    group,
    shell,
    /** What lights up when it's pointed at. */
    materials: [fabric],
    inside: SUMMITSEEKER_INSIDE,
    anchor: SUMMITSEEKER_INSIDE.anchor,
    update(tentGlow: number) {
      // Warm light through teal fabric: a soft pool on the door, fading out before its piping.
      doorMaterial.emissive.copy(glow.setRGB(0.95, 0.74, 0.4).multiplyScalar(0.2 * tentGlow));
    },
    /** 0 outside, 1 looking in: the fly fades to a ghost, the mesh thins, and the inside lights up. */
    setInside(k: number) {
      if (k === ghost) return;
      ghost = k;
      fabric.opacity = 1 - 0.86 * k;
      fabric.depthWrite = k < 0.5;
      door.visible = k < 0.5;
      mesh.opacity = 0.5 - 0.3 * k;
      inside.intensity = 2.4 * k;
    },
    dispose() {
      group.traverse((o) => (o as Mesh).geometry?.dispose());
      [fabric, solid, metal, mesh, doorMaterial].forEach((m) => m.dispose());
      doorMaterial.emissiveMap?.dispose();
    },
  };
}

/** A soft round pool of light, white at the middle to black at the edge. */
function glowTexture() {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const g = canvas.getContext('2d')!;
  // A little below the middle, where a torch hanging inside lights the door most.
  const pool = g.createRadialGradient(size * 0.55, size * 0.6, 0, size * 0.55, size * 0.6, size * 0.5);
  pool.addColorStop(0, '#ffffff');
  pool.addColorStop(0.45, '#7a7a7a');
  pool.addColorStop(1, '#000000');
  g.fillStyle = pool;
  g.fillRect(0, 0, size, size);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/** The near vestibule's door (its head-side face) out of the fly's faces, lifted 2.5 mm along each face's normal. */
function doorPanel(fly: BufferGeometry) {
  const position = fly.getAttribute('position');
  const out: number[] = [];
  const a = new Vector3();
  const b = new Vector3();
  const c = new Vector3();
  const n = new Vector3();
  for (let i = 0; i < position.count; i += 3) {
    a.fromBufferAttribute(position, i);
    b.fromBufferAttribute(position, i + 1);
    c.fromBufferAttribute(position, i + 2);
    n.subVectors(b, a).cross(c.clone().sub(a)).normalize();
    const mid = a.clone().add(b).add(c).multiplyScalar(1 / 3);
    // Facing out of the near side, between the head arm and the vestibule's ridge, below the crown.
    if (n.z < 0.35 || mid.z < 0.45 || mid.x > 0.1 || mid.x < -0.75 || mid.y > 0.95) continue;
    for (const p of [a, b, c]) out.push(p.x + n.x * 0.0025, p.y + n.y * 0.0025, p.z + n.z * 0.0025);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(out, 3));
  // Its uvs across the door, for the glow's pool.
  const box = new Box3().setFromBufferAttribute(g.getAttribute('position') as Float32BufferAttribute);
  const uv: number[] = [];
  for (let i = 0; i < out.length; i += 3) uv.push((out[i] - box.min.x) / (box.max.x - box.min.x), (out[i + 1] - box.min.y) / (box.max.y - box.min.y));
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  const teal = new Color(SUMMITSEEKER_COLOURS.fly);
  g.setAttribute('color', new Float32BufferAttribute(Array.from({ length: out.length / 3 }, () => [teal.r, teal.g, teal.b]).flat(), 3));
  g.computeVertexNormals();
  return g;
}
