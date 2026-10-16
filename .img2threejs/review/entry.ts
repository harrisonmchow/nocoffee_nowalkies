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
  sun.position.set(30, 38, 24);
  sun.castShadow = true;
  scene.add(sun);
} else {
  // Dusk: blue skydome, no sun, a little ground bounce.
  scene.add(new THREE.HemisphereLight('#8fb0e6', '#3d4a3c', 1.9));
  const glow = new THREE.DirectionalLight('#c9d6f0', 0.35);
  glow.position.set(-2, 6, 3);
  scene.add(glow);
}

const tent = createTentModel();
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
const targets: Record<string, [number, number, number]> = { ref: [-0.1, 0.33, 0] };
const tq = q.get('tgt')?.split(',').map(Number) as [number, number, number] | undefined;
const target = new THREE.Vector3(...(tq ?? targets[view] ?? [0.05, 0.4, 0]));
const views: Record<string, [number, number, number]> = {
  // Matched by eye to IMG_4842: in front of the door, a little to the left, looking down.
  ref: [-0.15, 2.3, 3.4], // fitted to the IMG_4842 silhouette (review/fitted-camera.json)
  ref2: [2.2, 1.5, -3.9], // IMG_4850 side: behind and to the right
  front: [0, 1.0, 4.6], right: [4.6, 1.0, 0], rear: [0, 1.0, -4.6], left: [-4.6, 1.0, 0],
  top: [0.01, 5.2, 0.4],
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
  triangles: tris, size: box.getSize(new THREE.Vector3()).toArray(), min: box.min.toArray(),
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
