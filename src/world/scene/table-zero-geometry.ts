// The Helinox Table Zero LT, drawn in code from Helinox's product photos (a
// three-quarter view, the long side from above and level, the top half
// rolled back off the frame, and close-ups of the hubs, a corner pocket and
// the logo) and its listed size, 30 x 49.5 x 31 cm.
//
// How it's built: two black hubs low down, one toward each long side, joined
// by a crossbar. From each hub four straight tubes make an X along the
// length: two legs splayed to the ground, and two uprights to the rail on
// that side. Each upright's tip clips under its rail in a black saddle. The
// rails run under the long edges, their ends in the top's corner pockets,
// and the gridded mesh top is stretched flat between them, bound in black
// with two black seams across it.
//
// Y up, metres, standing on y 0, centred, long side facing +z.
//
// Inferred (no photo shows it end-on): the hubs' spacing across the width,
// so the crossbar's length, and the X's lean toward the rails. The mesh's
// grid and the logo are flat colour: below a pixel at camp distance.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const HUB = new THREE.Vector3(0, 0.155, 0.11); // the front hub; the back one mirrors it
const TIP = new THREE.Vector3(0.135, 0.278, 0.13); // a front upright's tip, under the rail
const FOOT = new THREE.Vector3(0.175, 0, 0.125); // a front leg's foot
const TUBE_R = 0.005;
const RAIL_Y = 0.287; // close under the sheet and in from its edge: from above, the binding hides it
const RAIL_Z = 0.13;
const RAIL_END = 0.236;
const TOP_Y = 0.296;
const TOP_HALF = new THREE.Vector2(0.244, 0.155); // the sheet, to the outside of its binding
const BIND = 0.01;
const SEAM_X = 0.083; // the two seams across, a third of the way in from each end
const SEAM_W = 0.006;

export const TABLE_ZERO_HEIGHT = 0.3;

/** Anodised cyan tubes, black hubs and hardware, light grey mesh: from the photos. */
export const TABLE_ZERO_COLOURS = { frame: '#1f9cc7', hardware: '#1b1c1e', mesh: '#8e9091' } as const;

export type TableZeroMaterials = Record<'frame' | 'hardware' | 'mesh', THREE.Material>;

/** A round tube from a to b. */
function rod(a: THREE.Vector3, b: THREE.Vector3, r0: number, r1 = r0, segments = 8) {
  const dir = b.clone().sub(a);
  const g = new THREE.CylinderGeometry(r1, r0, dir.length(), segments, 1);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize()));
  return g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
}

/** A flat slab on the top, x0..x1 by z0..z1, `t` thick about TOP_Y: binding, seams, the logo patch. */
const slab = (x0: number, x1: number, z0: number, z1: number, t = 0.003, y = TOP_Y) =>
  new THREE.BoxGeometry(x1 - x0, t, z1 - z0).translate((x0 + x1) / 2, y, (z0 + z1) / 2);

/** Every point and its reflections through x and z: the table has both symmetries. */
const corners = (v: THREE.Vector3) =>
  [1, -1].flatMap((sx) => [1, -1].map((sz) => new THREE.Vector3(v.x * sx, v.y, v.z * sz)));

/** The table, one merged mesh per material (parts can share one). */
export function buildTableZero(materials: TableZeroMaterials) {
  const frame: THREE.BufferGeometry[] = [];
  const hardware: THREE.BufferGeometry[] = [];
  const mesh: THREE.BufferGeometry[] = [];

  // The two hubs: a black wedge each, point up, with a socket sleeve on every tube.
  for (const sz of [1, -1]) {
    const hub = new THREE.Vector3(HUB.x, HUB.y, HUB.z * sz);
    hardware.push(new THREE.CylinderGeometry(0.026, 0.026, 0.026, 3).rotateX(-Math.PI / 2).scale(1, 0.8, 1).translate(hub.x, hub.y + 0.002, hub.z));
    hardware.push(new THREE.CylinderGeometry(0.012, 0.012, 0.03, 10).rotateX(Math.PI / 2).translate(hub.x, hub.y - 0.009, hub.z));
    for (const sx of [1, -1]) {
      // An upright to this side's rail, and the leg on the other side of the X.
      const tip = new THREE.Vector3(TIP.x * sx, TIP.y, TIP.z * sz);
      const foot = new THREE.Vector3(-FOOT.x * sx, FOOT.y, FOOT.z * sz);
      for (const end of [tip, foot]) {
        const dir = end.clone().sub(hub).normalize();
        frame.push(rod(hub, end, TUBE_R));
        hardware.push(rod(hub, hub.clone().addScaledVector(dir, 0.034), TUBE_R * 1.5, TUBE_R * 1.4));
      }
      // The saddle clipping the upright's tip under the rail.
      hardware.push(new THREE.BoxGeometry(0.03, 0.016, 0.022).translate(tip.x, RAIL_Y - 0.004, tip.z));
    }
    // A rail under each long edge, capped in the corner pockets.
    frame.push(rod(new THREE.Vector3(-RAIL_END, RAIL_Y, RAIL_Z * sz), new THREE.Vector3(RAIL_END, RAIL_Y, RAIL_Z * sz), TUBE_R));
  }
  frame.push(rod(new THREE.Vector3(HUB.x, HUB.y, -HUB.z), HUB, TUBE_R));
  // The corner pockets' clips: a black cap on each rail end, rising to the sheet's corner.
  for (const c of corners(new THREE.Vector3(RAIL_END, RAIL_Y, RAIL_Z))) {
    hardware.push(new THREE.BoxGeometry(0.018, 0.018, 0.02).translate(c.x, (RAIL_Y + TOP_Y) / 2, c.z + Math.sign(c.z) * 0.004));
  }

  // The top: the mesh sheet inside its binding, the binding round the edge, two seams across and the patch.
  const [hx, hz] = [TOP_HALF.x, TOP_HALF.y];
  mesh.push(new THREE.PlaneGeometry(2 * (hx - BIND), 2 * (hz - BIND)).rotateX(-Math.PI / 2).translate(0, TOP_Y, 0));
  hardware.push(slab(-hx, hx, hz - BIND, hz), slab(-hx, hx, -hz, -hz + BIND));
  hardware.push(slab(hx - BIND, hx, -hz + BIND, hz - BIND), slab(-hx, -hx + BIND, -hz + BIND, hz - BIND));
  for (const sx of [1, -1]) hardware.push(slab(sx * SEAM_X - SEAM_W / 2, sx * SEAM_X + SEAM_W / 2, -hz + BIND, hz - BIND, 0.0025));
  hardware.push(slab(-0.032, 0.032, hz - BIND - 0.014, hz - BIND - 0.002, 0.0035));

  const parts = { frame, hardware, mesh };
  const keys = Object.keys(parts) as (keyof TableZeroMaterials)[];
  // Parts given the same material merge into one mesh: one draw call each.
  for (const k of keys) {
    const first = keys.find((j) => materials[j] === materials[k]);
    if (first !== k) {
      parts[first!].push(...parts[k]);
      parts[k] = [];
    }
  }
  const meshes: THREE.Mesh[] = [];
  for (const k of keys) {
    if (!parts[k].length) continue;
    const g = mergeGeometries(parts[k].map((p) => (p.index ? p.toNonIndexed() : p)).map((p) => {
      // Keep only what every part shares, so they merge.
      for (const name of Object.keys(p.attributes)) if (name !== 'position' && name !== 'normal') p.deleteAttribute(name);
      return p;
    }));
    if (!g) continue;
    const m = new THREE.Mesh(g, materials[k]);
    m.name = `table-zero-${k}`;
    meshes.push(m);
  }
  return meshes;
}
