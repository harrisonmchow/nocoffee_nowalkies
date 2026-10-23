// Harry's own sleeping kit, chair and pack at camp, each rebuilt from its
// product photos through the img2threejs pipeline: the NEMO Tensor All-Season
// pad (tensor-geometry.ts), the NEMO Fillo pillow (fillo-geometry.ts), the
// Alton Lightweight Camp Chair (alton-chair-geometry.ts) and the Osprey Aether
// 65 (aether-geometry.ts). Each keeps the
// stand-ins' contract (gear-models.ts): its own materials, so pointing at it
// lights only it, and an anchor for its hotspot. Their parts are merged into
// one mesh per material, in the world's own prop material, coloured per vertex.
import { Color, DoubleSide, Mesh, Object3D, Vector3, type BufferGeometry, type MeshStandardMaterial } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { WorldUniforms } from '../systems/uniforms';
import { AETHER, AETHER_COLOURS, buildAether } from './aether-geometry';
import { ALTON, ALTON_COLOURS, buildAlton } from './alton-chair-geometry';
import { FILLO, FILLO_COLOURS, buildFillo } from './fillo-geometry';
import type { GearModel } from './gear-models';
import { createPropMaterial } from './props-material';
import { TENSOR, TENSOR_COLOURS, buildTensor } from './tensor-geometry';

type Kit = { uniforms: WorldUniforms; starLayers: number };

/** A real kit model: a stand-in's GearModel, and for a pad, the height in its own frame that what lies on it rests at, and how wide it is (a quilt drapes clear of it). */
export type KitModel = GearModel & { top?: number; width?: number };

/** Its vertex colours as multiples of the material's own colour, so the two don't multiply into a darker one, and pointing at it lifts that colour. */
function relativeTo(geometry: BufferGeometry, colour: string) {
  const c = new Color(colour);
  const attribute = geometry.getAttribute('color');
  for (let i = 0; i < attribute.count; i++) attribute.setXYZ(i, attribute.getX(i) / c.r, attribute.getY(i) / c.g, attribute.getZ(i) / c.b);
  return geometry;
}

/** The given meshes' geometries as one mesh in one material, the material's colour the dominant one. */
function mesh(kit: Kit, geometries: BufferGeometry[], colour: string, options: { roughness: number; metalness?: number }) {
  const geometry = geometries.length === 1 ? geometries[0] : mergeGeometries(geometries, false);
  if (!geometry) throw new Error('kit-models: could not merge');
  if (geometry !== geometries[0]) geometries.forEach((g) => g.dispose());
  const material = createPropMaterial(kit.uniforms, kit.starLayers, { color: colour, roughness: options.roughness, metalness: options.metalness });
  material.vertexColors = true;
  material.side = DoubleSide;
  return { mesh: new Mesh(relativeTo(geometry, colour), material), material };
}

function model(name: string, parts: { mesh: Mesh; material: MeshStandardMaterial }[], anchor: Vector3, extra: Partial<KitModel> = {}): KitModel {
  const object = new Object3D();
  object.name = name;
  parts.forEach((p) => object.add(p.mesh));
  return { object, materials: parts.map((p) => p.material), anchor, ...extra };
}

/** The NEMO Tensor All-Season, Regular Wide: lying along x, its head at -x. One mesh: the quilted grey top, the red-orange base, the valve and the marks. */
export function createTensorPad(kit: Kit): KitModel {
  const g = buildTensor();
  const pad = mesh(kit, [g.top, g.base, g.valve, g.marks], TENSOR_COLOURS.top, { roughness: 0.55 });
  // The bag lies on it, so its dot hangs below its front edge rather than above; what lies on it presses into the cells a little.
  return model('tensor-pad', [pad], new Vector3(0.62, TENSOR.height, 0.2), { pin: 'below', top: TENSOR.height - 0.005, width: TENSOR.width });
}

/** The NEMO Fillo in Silt Stripe: lying flat, its long side along x, its valve, loop and label on the +x edge. One mesh. */
export function createFilloPillow(kit: Kit): KitModel {
  const g = buildFillo();
  const pillow = mesh(kit, [g.cover, g.trim], FILLO_COLOURS.sage, { roughness: 0.85 });
  return model('fillo-pillow', [pillow], new Vector3(0, FILLO.seam + FILLO.top, 0));
}

/** The Alton Lightweight Camp Chair: facing +z. Two meshes: the sling and its trim, and the anodised frame. */
export function createAltonChair(kit: Kit): KitModel {
  const g = buildAlton();
  const fabric = mesh(kit, [g.sling, g.trim], ALTON_COLOURS.sling, { roughness: 0.8 });
  const frame = mesh(kit, [g.frame], ALTON_COLOURS.frame, { roughness: 0.42, metalness: 0.3 });
  return model('alton-chair', [fabric, frame], new Vector3(0, ALTON.corners.front.y, 0));
}

/** The Osprey Aether 65 in Deep Water Blue, standing: its front pocket toward +z, its harness toward -z. Three meshes: the nylon body and lid, the harness, and the trim (webbing, buckles, cords, tape, prints). */
export function createOspreyAether(kit: Kit): KitModel {
  const g = buildAether();
  const body = mesh(kit, [g.fabric], AETHER_COLOURS.body, { roughness: 0.75 });
  const harness = mesh(kit, [g.harness], AETHER_COLOURS.pad, { roughness: 0.85 });
  const trim = mesh(kit, [g.trim], AETHER_COLOURS.webbing, { roughness: 0.6 });
  return model('osprey-aether', [body, harness, trim], new Vector3(0, AETHER.height, 0));
}
