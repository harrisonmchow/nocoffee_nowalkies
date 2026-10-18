// The NEMO Moonlite reclining camp chair, drawn in code from NEMO's product
// photos (the four colourways from one studio angle, a side view with a
// sitter, and close-ups of the hub, a corner pocket and the recline
// hardware) and its listed size, 50 x 51 x 64 cm.
//
// How it's built: two forged hubs low down, one each side, joined by a
// crossbar. From each hub four straight struts make an X: two legs to rubber
// feet, an upright to the seat's front corner and a longer one to the top of
// the back. The mesh sling hangs from the four ball tips in black corner
// pockets, a bucket whose free sides sweep down and in between its corners.
// An armrest strap runs from each top pocket to the front pocket on that
// side, with the recline webbing, its buckle and pull tab near the front.
//
// Y up, metres, standing on y 0, centred, facing +z. Upright, as in the
// product shots (the recline only tilts the sling back).
//
// Inferred (no photo shows it): the back of the sling and the far strap are
// mirrored from the near ones. The knit, the MOONLITE print and the logos are
// flat colour: all below a pixel at any distance the camp shows them.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const HUB = new THREE.Vector3(0.165, 0.15, 0); // +x hub; the other mirrors it
const FOOT_FRONT = new THREE.Vector3(0.2, 0, 0.07);
const FOOT_BACK = new THREE.Vector3(0.225, 0, -0.22);
// The ball tips, where the sling's corners hang.
const TIP_FRONT = new THREE.Vector3(0.235, 0.34, 0.17);
const TIP_BACK = new THREE.Vector3(0.215, 0.635, -0.255);
const TUBE_R = 0.0078; // the "oversized" tubes, about 16 mm
const HUB_R = 0.016;
const FOOT_H = 0.032;
const STRAP_W = 0.036;

// The sling: a centre line from the top of the back down through the seat's
// low point and up to the front edge, and a free edge each side between the
// corners, sweeping down and well in (the photo shows open air between it and
// the strap). Across, the cloth cups between them. The back stays in front of
// the rear uprights, which show through the mesh behind it.
const CENTRE = [new THREE.Vector3(0, 0.625, -0.25), new THREE.Vector3(0, 0.15, -0.06), new THREE.Vector3(0, 0.325, 0.17)];
const EDGE = [TIP_BACK.clone(), new THREE.Vector3(0.16, 0.18, -0.11), TIP_FRONT.clone()];
const CUP = 2.2; // how the cloth rises toward the free edges: higher is a flatter middle

export const MOONLITE_HEIGHT = 0.64;

/** The four colourways, sampled from the product photos. A hub the frame's colour shares its material. */
export const MOONLITE_COLOURWAYS = {
  'smokey-olive': { mesh: '#8e887c', frame: '#232228', hub: '#232228', trim: '#36343e', webbing: '#c2c0ae', print: '#bdb89e', toggle: '#8b8f93' },
  'black-pearl': { mesh: '#45464f', frame: '#202226', hub: '#c6c43a', trim: '#2c2e35', webbing: '#c8c4ae', print: '#c4d23c', toggle: '#c6c43a' },
  quicksilver: { mesh: '#b6b0c0', frame: '#7a66a0', hub: '#36353b', trim: '#38363e', webbing: '#d4d4d2', print: '#d8d8de', toggle: '#8a8f94' },
  'brilliant-blue': { mesh: '#2a74cf', frame: '#4c5662', hub: '#4c5662', trim: '#30333f', webbing: '#a9bcb4', print: '#b2bbc0', toggle: '#2f86c8' },
} as const;
export type MoonliteColourway = keyof typeof MOONLITE_COLOURWAYS;

export type MoonliteMaterials = Record<'frame' | 'hub' | 'rubber' | 'mesh' | 'trim' | 'webbing' | 'metal' | 'print' | 'toggle', THREE.Material>;

const bezier = (p: THREE.Vector3[], t: number, out = new THREE.Vector3()) => {
  const a = (1 - t) * (1 - t), b = 2 * t * (1 - t), c = t * t;
  return out.set(a * p[0].x + b * p[1].x + c * p[2].x, a * p[0].y + b * p[1].y + c * p[2].y, a * p[0].z + b * p[1].z + c * p[2].z);
};

/** The sling's surface: u -1 (the chair's right) .. 1 (left), v 0 (top of the back) .. 1 (front edge). */
function sling(u: number, v: number, out = new THREE.Vector3()) {
  const c = bezier(CENTRE, v);
  const e = bezier(EDGE, v);
  const k = Math.pow(Math.abs(u), CUP);
  return out.set(u * e.x, c.y + (e.y - c.y) * k, c.z + (e.z - c.z) * k);
}

/** The sling's normal on its sitting side. */
function slingNormal(u: number, v: number) {
  const h = 1e-3;
  const du = sling(Math.min(1, u + h), v).sub(sling(Math.max(-1, u - h), v));
  const dv = sling(u, Math.min(1, v + h)).sub(sling(u, Math.max(0, v - h)));
  const n = du.cross(dv).normalize();
  return n.y + n.z < 0 ? n.negate() : n;
}

/**
 * A grid over part of the sling, lifted `offset` along its normal (+ the
 * sitting side). Each row v runs across [uFrom(v), uTo(v)].
 */
function slingPatch(uFrom: (v: number) => number, uTo: (v: number) => number, v0: number, v1: number, offset: number, nu: number, nv: number) {
  const position: number[] = [];
  const index: number[] = [];
  const p = new THREE.Vector3();
  for (let j = 0; j <= nv; j++) {
    const v = v0 + (v1 - v0) * (j / nv);
    const a = uFrom(v), b = uTo(v);
    for (let i = 0; i <= nu; i++) {
      const u = a + (b - a) * (i / nu);
      sling(u, v, p);
      if (offset) p.addScaledVector(slingNormal(u, v), offset);
      position.push(p.x, p.y, p.z);
    }
  }
  for (let j = 0; j < nv; j++) {
    for (let i = 0; i < nu; i++) {
      const k = j * (nu + 1) + i;
      index.push(k, k + 1, k + nu + 1, k + 1, k + nu + 2, k + nu + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

/** A round tube from a to b. */
function rod(a: THREE.Vector3, b: THREE.Vector3, r0: number, r1 = r0, segments = 8) {
  const dir = b.clone().sub(a);
  const g = new THREE.CylinderGeometry(r1, r0, dir.length(), segments, 1);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize()));
  return g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
}

/** A flat strip along points, `width` wide across `across(t)`. */
function ribbon(points: THREE.Vector3[], across: THREE.Vector3, width: number) {
  const position: number[] = [];
  const index: number[] = [];
  points.forEach((p, i) => {
    position.push(p.x - across.x * width / 2, p.y - across.y * width / 2, p.z - across.z * width / 2);
    position.push(p.x + across.x * width / 2, p.y + across.y * width / 2, p.z + across.z * width / 2);
    if (i) index.push(2 * i - 2, 2 * i - 1, 2 * i, 2 * i - 1, 2 * i + 1, 2 * i);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

/** A small box at p, its x along `along`, y along `up`. */
function block(p: THREE.Vector3, along: THREE.Vector3, up: THREE.Vector3, size: [number, number, number]) {
  const x = along.clone().normalize();
  const z = x.clone().cross(up).normalize();
  const y = z.clone().cross(x);
  return new THREE.BoxGeometry(...size).applyMatrix4(new THREE.Matrix4().makeBasis(x, y, z).setPosition(p));
}

const mirror = (v: THREE.Vector3, side: 1 | -1) => new THREE.Vector3(v.x * side, v.y, v.z);
const flipX = new THREE.Matrix4().makeScale(-1, 1, 1);

/** One side's frame, hardware and strap (+x); the other side is its reflection. */
function side(parts: Record<keyof MoonliteMaterials, THREE.BufferGeometry[]>) {
  const { frame, hub, rubber, trim, webbing, metal, print, toggle } = parts;
  // The X: two legs and two uprights out of the hub, each in a forged socket.
  for (const end of [FOOT_FRONT, FOOT_BACK, TIP_FRONT, TIP_BACK]) {
    const dir = end.clone().sub(HUB).normalize();
    const stop = end.y === 0 ? end.clone().addScaledVector(dir, -FOOT_H * 0.6) : end;
    frame.push(rod(HUB, stop, TUBE_R));
    hub.push(rod(HUB, HUB.clone().addScaledVector(dir, 0.034), TUBE_R * 1.38, TUBE_R * 1.3));
  }
  hub.push(new THREE.SphereGeometry(HUB_R, 12, 8).scale(1, 1.15, 1).translate(HUB.x, HUB.y, HUB.z));
  hub.push(rod(HUB, HUB.clone().add(new THREE.Vector3(-0.034, 0, 0)), TUBE_R * 1.38, TUBE_R * 1.3));
  // Rubber feet, flaring to the ground.
  for (const foot of [FOOT_FRONT, FOOT_BACK]) {
    const dir = foot.clone().sub(HUB).normalize();
    rubber.push(rod(foot.clone().addScaledVector(dir, -FOOT_H), foot.clone().add(new THREE.Vector3(0, 0.004, 0)), TUBE_R * 1.3, TUBE_R * 1.85));
  }
  // Ball tips, hidden in the pockets.
  for (const tip of [TIP_FRONT, TIP_BACK]) frame.push(new THREE.SphereGeometry(0.0095, 8, 6).translate(tip.x, tip.y, tip.z));

  // Corner pockets: each a thin shell over both faces of the sling's corner,
  // with a rounded cap over the ball. The top one wraps the back's corner and
  // tapers down the free edge; the front one is a cup over the seat's corner.
  for (const offset of [0.004, -0.004]) {
    trim.push(slingPatch((v) => 0.66 + 0.24 * Math.pow(v / 0.12, 0.9), () => 1, 0, 0.12, offset, 4, 5));
    trim.push(slingPatch((v) => 1 - 0.34 * Math.pow((v - 0.8) / 0.2, 0.7), () => 1, 0.8, 1, offset, 4, 5));
  }
  // Rounded ends over the balls, tucked into the corners.
  trim.push(new THREE.SphereGeometry(0.011, 10, 8).scale(1, 0.8, 1).translate(TIP_BACK.x - 0.008, TIP_BACK.y - 0.006, TIP_BACK.z + 0.004));
  trim.push(new THREE.SphereGeometry(0.013, 10, 8).scale(1, 0.75, 1).translate(TIP_FRONT.x - 0.005, TIP_FRONT.y, TIP_FRONT.z - 0.002));

  // The armrest strap: out of the top pocket, straight to the front pocket
  // outside the free edge, sagging a little. Black webbing for most of its
  // length, then the light recline webbing from the buckle to the front.
  const from = TIP_BACK.clone().add(new THREE.Vector3(0.012, -0.03, 0.012));
  const to = TIP_FRONT.clone().add(new THREE.Vector3(0.01, 0.006, -0.012));
  const strapAt = (t: number) => from.clone().lerp(to, t).add(new THREE.Vector3(0, -0.018 * 4 * t * (1 - t), 0));
  const along = to.clone().sub(from).normalize();
  const across = along.clone().cross(new THREE.Vector3(1, 0, 0)).normalize(); // in the strap's plane, which faces sideways
  const span = (t0: number, t1: number, n: number) => Array.from({ length: n + 1 }, (_, i) => strapAt(t0 + (t1 - t0) * (i / n)));
  const BUCKLE = 0.66, PULLEY = 0.8;
  trim.push(ribbon(span(0, BUCKLE, 8), across, STRAP_W));
  webbing.push(ribbon(span(BUCKLE, 1, 5), across, STRAP_W * 0.72));
  // The MOONLITE print, on the face toward the seat.
  print.push(ribbon(span(0.36, 0.56, 2).map((p) => p.add(new THREE.Vector3(-0.0012, 0, 0))), across, STRAP_W * 0.36));
  // The ladder-lock where the webbing changes, and the recline pulley with its pull tab and toggle hanging under it.
  metal.push(block(strapAt(BUCKLE), along, across, [0.012, STRAP_W * 1.05, 0.006]));
  metal.push(block(strapAt(PULLEY), along, across, [0.016, STRAP_W * 0.8, 0.008]));
  const tabTop = strapAt(PULLEY).add(new THREE.Vector3(0.004, -0.004, 0));
  const tabEnd = tabTop.clone().add(new THREE.Vector3(0.006, -0.05, 0.01));
  webbing.push(ribbon([tabTop, tabEnd], new THREE.Vector3(0, 1, 0).cross(tabEnd.clone().sub(tabTop)).normalize(), 0.016));
  toggle.push(rod(tabEnd.clone().add(new THREE.Vector3(0, 0, -0.013)), tabEnd.clone().add(new THREE.Vector3(0, 0, 0.013)), 0.006, 0.006, 8));
}

/** The chair, one merged mesh per material (parts can share one: see buildMoonlite's callers). */
export function buildMoonlite(materials: MoonliteMaterials) {
  const keys = Object.keys(materials) as (keyof MoonliteMaterials)[];
  const parts = Object.fromEntries(keys.map((k) => [k, [] as THREE.BufferGeometry[]])) as Record<keyof MoonliteMaterials, THREE.BufferGeometry[]>;
  const one = Object.fromEntries(keys.map((k) => [k, [] as THREE.BufferGeometry[]])) as Record<keyof MoonliteMaterials, THREE.BufferGeometry[]>;
  side(one);
  // The chair's right side is the left side reflected (and its triangles turned back the right way round).
  for (const k of keys) {
    for (const g of one[k]) {
      const flat = g.index ? g.toNonIndexed() : g;
      parts[k].push(flat);
      const m = flat.clone().applyMatrix4(flipX);
      for (const name of ['position', 'normal']) {
        const a = m.getAttribute(name) as THREE.BufferAttribute;
        for (let i = 0; i < a.count; i += 3) {
          for (let c = 0; c < 3; c++) {
            const t = a.getComponent(i + 1, c);
            a.setComponent(i + 1, c, a.getComponent(i + 2, c));
            a.setComponent(i + 2, c, t);
          }
        }
      }
      parts[k].push(m);
    }
  }
  // The crossbar between the hubs.
  parts.frame.push(rod(mirror(HUB, -1), HUB, TUBE_R).toNonIndexed());
  // The sling, with bindings along the top and down the free sides.
  parts.mesh.push(slingPatch(() => -1, () => 1, 0, 1, 0, 28, 32).toNonIndexed());
  const top = Array.from({ length: 13 }, (_, i) => sling(-0.7 + 1.4 * (i / 12), 0));
  parts.trim.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(top), 12, 0.0035, 5).toNonIndexed());
  for (const s of [1, -1]) {
    const edge = Array.from({ length: 17 }, (_, i) => sling(s, 0.12 + 0.72 * (i / 16)));
    parts.mesh.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(edge), 24, 0.004, 5).toNonIndexed());
  }
  // The NEMO patch at the top of the back, a shield on both faces, with its mark on the front.
  for (const offset of [0.0045, -0.0045]) parts.trim.push(slingPatch((v) => -0.2 + v, (v) => 0.2 - v, 0, 0.11, offset, 3, 3).toNonIndexed());
  parts.print.push(slingPatch((v) => -0.09 + 0.6 * (v - 0.025), (v) => 0.09 - 0.6 * (v - 0.025), 0.025, 0.08, 0.0055, 1, 2).toNonIndexed());

  // Parts given the same material merge into one mesh: one draw call each.
  const meshes: THREE.Mesh[] = [];
  for (const k of keys) {
    const first = keys.find((j) => materials[j] === materials[k]);
    if (first !== k) {
      parts[first!].push(...parts[k]);
      parts[k] = [];
    }
  }
  for (const k of keys) {
    if (!parts[k].length) continue;
    const g = mergeGeometries(parts[k].map((p) => (p.index ? p.toNonIndexed() : p)).map((p) => {
      // Keep only what every part shares, so they merge.
      for (const name of Object.keys(p.attributes)) if (name !== 'position' && name !== 'normal') p.deleteAttribute(name);
      return p;
    }));
    if (!g) continue;
    const mesh = new THREE.Mesh(g, materials[k]);
    mesh.name = `moonlite-${k}`;
    meshes.push(mesh);
  }
  return meshes;
}
