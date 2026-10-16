// Review harness: renders createTentModel() at fixed views for the img2threejs gates.
import * as THREE from 'three';
import { createTentModel } from '../../src/scripts/camp/tent';

const q = new URLSearchParams(location.search);
const view = q.get('view') ?? 'ref';
const light = q.get('light') ?? 'dusk';
const w = Number(q.get('w') ?? 1260), h = Number(q.get('h') ?? 896); // same aspect as the camera fit
const hide = (q.get('hide') ?? '').split(',').filter(Boolean);

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(w, h);
renderer.setPixelRatio(1);
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(q.get('bg') ?? '#808080');
if (light === 'unlit') {
  // Unlit evidence: ambient only, so shading carries no form cues.
  scene.add(new THREE.AmbientLight('#ffffff', Math.PI));
} else if (light === 'neutral') {
  scene.add(new THREE.HemisphereLight('#eeebe4', '#6f6a62', 1.5));
  const sun = new THREE.DirectionalLight('#ffeedd', 1.8);
  // Same sun and shadow settings as the camp scene (scene.ts), scaled to this framing.
  sun.position.set(30, 38, 24).normalize().multiplyScalar(20);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = sun.shadow.camera.bottom = -3;
  sun.shadow.camera.right = sun.shadow.camera.top = 3;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 40;
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.04;
  scene.add(sun);
} else {
  // Dusk: blue skydome, no sun, a little ground bounce. Fitted so the de-lit
  // albedo reproduces IMG_4842's door and roof tones (review/palette.py).
  scene.add(new THREE.HemisphereLight(q.get('sky') ?? '#9cc0ff', q.get('gnd') ?? '#2a3a40', Number(q.get('hi') ?? 2.4)));
  const zenith = new THREE.DirectionalLight(q.get('zc') ?? '#a8c6ff', Number(q.get('zi') ?? 1.2));
  zenith.position.set(0, 10, 1.5);
  scene.add(zenith);
}

const t0 = performance.now();
const tent = createTentModel();
const buildMs = performance.now() - t0;
tent.traverse((o) => {
  if ((o as THREE.Mesh).isMesh) o.castShadow = o.receiveShadow = true;
  if (hide.includes(o.name)) o.visible = false;
  // flat=1: material maps stripped (Tier 1 map-stripped evidence).
  if (q.get('flat') && (o as THREE.Mesh).isMesh) {
    for (const m of [(o as THREE.Mesh).material].flat() as THREE.MeshStandardMaterial[]) {
      m.normalMap = m.roughnessMap = null;
      m.roughness = 0.66;
      m.needsUpdate = true;
    }
  }
});
scene.add(tent);

const cam = new THREE.PerspectiveCamera(Number(q.get('fov') ?? 30), w / h, 0.05, 50);
const targets: Record<string, [number, number, number]> = { ref: [-0.1, 0.33, 0], close: [0.1, 0.45, 0.5] };
const tq = q.get('tgt')?.split(',').map(Number) as [number, number, number] | undefined;
const target = new THREE.Vector3(...(tq ?? targets[view] ?? [0.05, 0.4, 0]));
const views: Record<string, [number, number, number]> = {
  // Matched by eye to IMG_4842: in front of the door, a little to the left, looking down.
  ref: [-0.15, 2.3, 3.4], // fitted to the IMG_4842 silhouette (review/fitted-camera.json)
  ref2: [2.2, 1.5, -3.9], // IMG_4850 side: behind and to the right
  front: [0, 1.0, 4.6], right: [4.6, 1.0, 0], rear: [0, 1.0, -4.6], left: [-4.6, 1.0, 0],
  top: [0.01, 5.2, 0.4],
  close: [0.35, 0.75, 1.55], // door-face close-up for the cloth surface
};
const p = q.get('pos')?.split(',').map(Number) as [number, number, number] | undefined;
cam.position.set(...(p ?? views[view]));
cam.lookAt(target);
renderer.render(scene, cam);

let tris = 0;
tent.traverse((o) => {
  const m = o as THREE.Mesh;
  if (!m.isMesh || !m.visible) return;
  const g = m.geometry;
  const n = g.index ? g.index.count / 3 : g.attributes.position.count / 3;
  tris += n * ((m as THREE.InstancedMesh).isInstancedMesh ? (m as THREE.InstancedMesh).count : 1);
});
const box = new THREE.Box3().setFromObject(tent);
const mats = new Set<string>();
tent.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) [m.material].flat().forEach((x) => mats.add(x.type)); });
(window as any).__report = {
  buildMs: Math.round(buildMs), drawCalls: renderer.info.render.calls, triangles: tris, size: box.getSize(new THREE.Vector3()).toArray(), min: box.min.toArray(),
  materialTypes: [...mats], names: tent.children.map((c) => c.name),
  runtime: Object.keys(tent.userData.sculptRuntime ?? {}), doorIsPivot: tent.userData.sculptRuntime?.door?.isGroup === true,
};
(window as any).__ready = true;

// Geometry export for the self-intersection and attachment gates.
if (q.get('export')) {
  tent.updateMatrixWorld(true);
  const meshes: unknown[] = [];
  const parts: Record<string, { position: number[]; min: number[]; max: number[] }> = {};
  tent.traverse((o) => {
    const m = o as THREE.Mesh;
    if (o.name) {
      const b = new THREE.Box3().setFromObject(o);
      if (!b.isEmpty()) parts[o.name] = { position: b.getCenter(new THREE.Vector3()).toArray(), min: b.min.toArray(), max: b.max.toArray() };
    }
    if (!m.isMesh || (m as THREE.InstancedMesh).isInstancedMesh) return;
    const g = m.geometry.index ? m.geometry : m.geometry.toNonIndexed();
    const p = g.attributes.position, v: number[][] = [], t = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) v.push(t.fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld).toArray());
    const idx = g.index ? Array.from(g.index.array) : v.map((_, i) => i);
    meshes.push({ name: m.name, vertices: v, indices: idx });
  });
  (window as any).__export = { meshes, parts };
}

// Part manifest for check_part_coverage.py, using the assembly contract's rules:
// detail (explodeWithParent) is integral; a named group of anonymous meshes is one part;
// a named group of named parts is an assembly (listed so components map to it).
{
  const parts: { name: string; kind: string; module: string; triangles: number }[] = [];
  let unnamed = 0, integral = 0;
  const tris = (o: THREE.Object3D) => {
    let n = 0;
    o.traverse((c) => {
      const m = c as THREE.Mesh;
      if (!m.isMesh) return;
      const g = m.geometry;
      n += (g.index ? g.index.count : g.attributes.position.count) / 3 * ((m as THREE.InstancedMesh).isInstancedMesh ? (m as THREE.InstancedMesh).count : 1);
    });
    return n;
  };
  const groups = tent.userData.sculptRuntime.destructionGroups as Record<string, THREE.Object3D[]>;
  const moduleOf = (o: THREE.Object3D) => {
    for (const [k, list] of Object.entries(groups)) for (const g of list) { let p: THREE.Object3D | null = o; while (p) { if (p === g) return k; p = p.parent; } }
    return 'tent';
  };
  const walk = (o: THREE.Object3D) => {
    for (const c of o.children) {
      if (c.userData.explodeWithParent) { c.traverse((x) => { if ((x as THREE.Mesh).isMesh) integral++; }); continue; }
      const isMesh = (c as THREE.Mesh).isMesh;
      const named = c.children.filter((x) => x.name && !x.userData.explodeWithParent);
      if (isMesh) {
        if (!c.name) { unnamed++; continue; }
        parts.push({ name: c.name, kind: 'part', module: moduleOf(c), triangles: tris(c) });
      } else if (c.name && named.length === 0) {
        parts.push({ name: c.name, kind: 'part', module: moduleOf(c), triangles: tris(c) });
        continue;
      } else if (c.name) {
        parts.push({ name: c.name, kind: 'assembly', module: moduleOf(c), triangles: tris(c) });
      }
      walk(c);
    }
  };
  walk(tent);
  (window as any).__manifest = { model: 'tent', parts, unnamedMeshes: unnamed, integralMeshes: integral };
}

// interact=1: replay scene.ts — register() clones materials, hover drives emissive,
// setTentFade(k) fades opacity, and the door pivot swings open.
if (q.get('interact')) {
  const list: THREE.MeshStandardMaterial[] = [];
  tent.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    m.material = Array.isArray(m.material) ? m.material.map((x) => x.clone()) : m.material.clone();
    for (const x of [m.material].flat()) if ('emissive' in x) list.push(x as THREE.MeshStandardMaterial);
  });
  const k = Number(q.get('fade') ?? 0), hover = Number(q.get('hover') ?? 0);
  for (const m of list) {
    m.emissive.setRGB(hover, hover * 0.95, hover * 0.85);
    m.transparent = k > 0;
    m.opacity = 1 - k * 0.92;
    m.depthWrite = k < 0.5;
  }
  const rt = tent.userData.sculptRuntime;
  if (q.get('door')) rt.door.rotateOnAxis(rt.doorHinge.axis, rt.doorHinge.openAngle * Number(q.get('door')));
  renderer.render(scene, cam);
  (window as any).__interact = { materials: list.length, allStandard: list.every((m) => m.type === 'MeshStandardMaterial'), doorRotationY: rt.door.rotation.y };
}
