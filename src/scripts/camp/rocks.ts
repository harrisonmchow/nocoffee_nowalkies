// Seeded randomness and low-poly rocks, shared by the props and the summit.
import * as THREE from 'three';

const stone = new THREE.Color('#a19d95');
const stoneDark = new THREE.Color('#7f7b75');

/** Small seeded PRNG (mulberry32). */
export function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeRock(size: number, seed: number) {
  const r = rng(seed);
  const geo = new THREE.IcosahedronGeometry(size, 1);
  const p = geo.getAttribute('position');
  const v = new THREE.Vector3();
  // Jitter shared corners by position so the faces stay closed.
  const jitter = new Map<string, number>();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const key = `${v.x.toFixed(3)},${v.y.toFixed(3)},${v.z.toFixed(3)}`;
    if (!jitter.has(key)) jitter.set(key, 0.75 + r() * 0.4);
    v.multiplyScalar(jitter.get(key)!);
    v.y *= 0.7;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  const shade = stone.clone().lerp(stoneDark, r() * 0.7);
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: shade, flatShading: true, roughness: 1 }));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.rotation.set(r() * 6, r() * 6, r() * 6);
  return mesh;
}
