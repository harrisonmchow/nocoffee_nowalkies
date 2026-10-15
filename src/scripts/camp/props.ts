// Things drawn in code: the clothes, the sleeping gear inside the tent,
// and simple stand-ins for any .glb model that hasn't been added yet.
// Every prop sits on y = 0 and faces +z.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { GearItem } from '../../data/camp';
import { makeRock } from './rocks';

const mat = (color: string, extra: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.9, ...extra });

function shadows<T extends THREE.Object3D>(o: T) {
  o.traverse((c) => {
    if ((c as THREE.Mesh).isMesh) c.castShadow = c.receiveShadow = true;
  });
  return o;
}

/** Soft stripes for quilting and mat ribs. */
function stripes(base: string, line: string, count: number) {
  const cv = document.createElement('canvas');
  cv.width = 16;
  cv.height = 256;
  const g = cv.getContext('2d')!;
  g.fillStyle = base;
  g.fillRect(0, 0, 16, 256);
  g.fillStyle = line;
  const step = 256 / count;
  for (let i = 0; i < count; i++) g.fillRect(0, i * step, 16, Math.max(2, step * 0.14));
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Stand-ins -----------------------------------------------------------

function standInTent() {
  const g = new THREE.Group();
  const fly = mat('#7f8a6a', { flatShading: true, side: THREE.DoubleSide });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2), fly);
  dome.scale.set(0.85, 1.15, 1.2);
  g.add(dome);
  const door = new THREE.Mesh(new THREE.CircleGeometry(0.42, 20, 0, Math.PI), mat('#4f5745'));
  door.position.set(0, 0.01, 1.19);
  door.scale.y = 1.6;
  g.add(door);
  return shadows(g);
}

function standInChair() {
  const g = new THREE.Group();
  const cloth = mat('#5f6f78');
  const frame = mat('#3a3d40', { metalness: 0.4, roughness: 0.5 });
  const seat = new THREE.Mesh(new RoundedBoxGeometry(0.55, 0.06, 0.5, 2, 0.03), cloth);
  seat.position.y = 0.45;
  const back = new THREE.Mesh(new RoundedBoxGeometry(0.55, 0.5, 0.05, 2, 0.025), cloth);
  back.position.set(0, 0.72, -0.26);
  back.rotation.x = -0.18;
  g.add(seat, back);
  for (const [x, z] of [[-0.25, -0.22], [0.25, -0.22], [-0.25, 0.22], [0.25, 0.22]]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.5, 6), frame);
    leg.position.set(x, 0.23, z);
    leg.rotation.x = z > 0 ? 0.15 : -0.15;
    g.add(leg);
  }
  return shadows(g);
}

export function makeFlame() {
  const flame = new THREE.Mesh(
    new THREE.ConeGeometry(0.16, 0.5, 7),
    new THREE.MeshBasicMaterial({ color: '#e8a25c', transparent: true, opacity: 0.85 }),
  );
  flame.position.y = 0.3;
  flame.name = 'flame';
  return flame;
}

function standInFire() {
  const g = new THREE.Group();
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const r = makeRock(0.11, 40 + i);
    r.position.set(Math.cos(a) * 0.42, 0.04, Math.sin(a) * 0.42);
    g.add(r);
  }
  const wood = mat('#6b5240', { flatShading: true });
  for (let i = 0; i < 4; i++) {
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.6, 6), wood);
    log.rotation.set(Math.PI / 2 - 0.5, (i / 4) * Math.PI * 2, 0, 'YXZ');
    log.position.y = 0.14;
    g.add(log);
  }
  g.add(makeFlame());
  return shadows(g);
}

function standInPerson() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.9, 6, 12), mat('#6f8796'));
  body.position.y = 0.75;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 12), mat('#c8a68a'));
  head.position.y = 1.55;
  const beanie = new THREE.Mesh(new THREE.SphereGeometry(0.135, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat('#a8674a'));
  beanie.position.y = 1.58;
  g.add(body, head, beanie);
  return shadows(g);
}

// Clothes laid out flat ----------------------------------------------

function flat(shape: THREE.Shape, color: string) {
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: 0.015,
    bevelEnabled: true,
    bevelThickness: 0.01,
    bevelSize: 0.012,
    bevelSegments: 2,
    curveSegments: 8,
  });
  geo.rotateX(-Math.PI / 2);
  return new THREE.Mesh(geo, mat(color, { roughness: 1 }));
}

function jacketShape(w: number, h: number) {
  const s = new THREE.Shape();
  const sl = w * 0.75; // sleeve reach
  s.moveTo(-w / 2, 0);
  s.lineTo(w / 2, 0);
  s.lineTo(w / 2, h * 0.68);
  s.lineTo(w / 2 + sl, h * 0.32);
  s.lineTo(w / 2 + sl + 0.06, h * 0.42);
  s.lineTo(w / 2 + 0.03, h);
  s.quadraticCurveTo(0, h * 0.86, -w / 2 - 0.03, h);
  s.lineTo(-w / 2 - sl - 0.06, h * 0.42);
  s.lineTo(-w / 2 - sl, h * 0.32);
  s.lineTo(-w / 2, h * 0.68);
  s.closePath();
  return s;
}

function pantsShape() {
  const s = new THREE.Shape();
  s.moveTo(-0.17, 0.85);
  s.lineTo(0.17, 0.85);
  s.lineTo(0.21, 0);
  s.lineTo(0.05, 0);
  s.lineTo(0, 0.55);
  s.lineTo(-0.05, 0);
  s.lineTo(-0.21, 0);
  s.closePath();
  return s;
}

function sockShape() {
  const s = new THREE.Shape();
  s.moveTo(-0.045, 0.3);
  s.lineTo(0.045, 0.3);
  s.lineTo(0.045, 0.08);
  s.quadraticCurveTo(0.05, 0, 0.13, -0.01);
  s.quadraticCurveTo(0.17, -0.04, 0.13, -0.07);
  s.lineTo(0, -0.07);
  s.quadraticCurveTo(-0.05, -0.06, -0.045, 0.02);
  s.closePath();
  return s;
}

function makeClothes() {
  const g = new THREE.Group();
  const shell = flat(jacketShape(0.42, 0.62), '#6f8796');
  shell.position.set(-0.75, 0.02, 0.3);
  shell.rotation.y = 0.12;
  const fleece = flat(jacketShape(0.38, 0.56), '#a8674a');
  fleece.position.set(0.2, 0.02, 0.32);
  fleece.rotation.y = -0.1;
  const base = flat(jacketShape(0.32, 0.55), '#cfc6b4');
  base.position.set(-0.3, 0.02, -0.55);
  base.rotation.y = 0.05;
  const pants = flat(pantsShape(), '#4a4d50');
  pants.position.set(0.85, 0.02, 0.35);
  pants.rotation.y = -0.08;
  g.add(shell, fleece, base, pants);
  for (const x of [0.38, 0.56]) {
    const sock = flat(sockShape(), '#d9d1c1');
    sock.position.set(x, 0.02, -0.5);
    g.add(sock);
  }
  // A groundsheet so the layout reads as deliberate.
  const sheet = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.7), mat('#d8cfbd', { roughness: 1 }));
  sheet.rotation.x = -Math.PI / 2;
  sheet.position.set(0.05, 0.005, -0.1);
  g.add(sheet);
  g.traverse((c) => {
    if ((c as THREE.Mesh).isMesh) c.receiveShadow = true;
  });
  return g;
}

// Sleeping gear, shown once the tent opens ---------------------------

export function makeSleepGear(id: string) {
  if (id === 'mat') {
    const m = new THREE.Mesh(
      new RoundedBoxGeometry(0.56, 0.07, 1.85, 3, 0.03),
      new THREE.MeshStandardMaterial({ map: stripes('#b98a60', '#a77a52', 14), roughness: 0.6 }),
    );
    m.position.y = 0.035;
    return shadows(new THREE.Group().add(m));
  }
  if (id === 'bag') {
    // Mummy bag: a rounded box that narrows toward the feet.
    const geo = new RoundedBoxGeometry(0.66, 0.18, 1.95, 4, 0.08);
    const p = geo.getAttribute('position');
    for (let i = 0; i < p.count; i++) {
      const t = (p.getZ(i) + 0.975) / 1.95; // 0 at head, 1 at feet
      p.setX(i, p.getX(i) * (1 - t * 0.38));
      p.setY(i, p.getY(i) * (1 - t * 0.25));
    }
    geo.computeVertexNormals();
    const tex = stripes('#4e6577', '#435869', 9);
    const bag = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55 }));
    bag.position.y = 0.09;
    return shadows(new THREE.Group().add(bag));
  }
  // pillow
  const p = new THREE.Mesh(new RoundedBoxGeometry(0.44, 0.12, 0.3, 4, 0.055), mat('#e6dfd2', { roughness: 0.7 }));
  p.position.y = 0.06;
  return shadows(new THREE.Group().add(p));
}

export function makeStandIn(item: GearItem): THREE.Object3D {
  switch (item.kind) {
    case 'shelter': return standInTent();
    case 'sit': return standInChair();
    case 'fire': return standInFire();
    case 'person': return standInPerson();
    case 'clothes': return makeClothes();
    case 'sleep': return makeSleepGear(item.id);
  }
}
