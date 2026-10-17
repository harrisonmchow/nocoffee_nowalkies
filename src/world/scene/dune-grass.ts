// Mikey's dune grass (threejs-procedural-vegetation): clumps of marram, each
// two crossed cards of drawn blades, rooted at the sand and swaying from the
// root up (the foliage material's flutter, by uv.y). Thick on the dunes, in
// clumps, sparse on the flat around the camp, never on the swash or the rock.
import { CanvasTexture, Color, Float32BufferAttribute, InstancedMesh, Matrix4, PlaneGeometry, Quaternion, SRGBColorSpace, Vector3 } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createSimplex2D } from '../systems/noise';
import { createRandom } from '../systems/random';
import type { WorldUniforms } from '../systems/uniforms';
import { createPropMaterial } from './props-material';
import type { TerrainSpec } from './terrain-fields';

let bladeTexture: CanvasTexture | null = null;
/** Tapering blades from the bottom middle, leaning out and bending over. White: the clump's colour tints them. */
function blades() {
  if (bladeTexture) return bladeTexture;
  const w = 64;
  const h = 128;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext('2d')!;
  const random = createRandom(5);
  for (let i = 0; i < 11; i++) {
    const lean = (i / 10 - 0.5) * 1.6 + (random() - 0.5) * 0.3;
    const tall = h * (0.55 + random() * 0.42);
    const base = w / 2 + (random() - 0.5) * 10;
    const tipX = base + lean * w * 0.42;
    const grey = Math.round(200 + random() * 55);
    g.fillStyle = `rgb(${grey},${grey},${grey})`;
    g.beginPath();
    g.moveTo(base - 2.2, h);
    g.quadraticCurveTo(base - 1 + lean * 6, h - tall * 0.6, tipX, h - tall);
    g.quadraticCurveTo(base + 1 + lean * 6, h - tall * 0.6, base + 2.2, h);
    g.fill();
  }
  bladeTexture = new CanvasTexture(canvas);
  bladeTexture.colorSpace = SRGBColorSpace;
  return bladeTexture;
}

/** A clump: two crossed cards, roots at y = 0. */
function clumpGeometry() {
  const cards = [0, Math.PI / 2].map((turn) => new PlaneGeometry(0.85, 0.75).translate(0, 0.375, 0).rotateY(turn));
  const geometry = mergeGeometries(cards.map((c) => c.toNonIndexed()))!;
  cards.forEach((c) => c.dispose());
  // Darker low in the clump, lit at the tips.
  const uv = geometry.getAttribute('uv');
  const crown = new Float32Array(uv.count);
  for (let i = 0; i < uv.count; i++) crown[i] = 0.25 + 0.75 * uv.getY(i);
  geometry.setAttribute('aCrown', new Float32BufferAttribute(crown, 1));
  return geometry;
}

const MARRAM = ['#b4ad6e', '#c4b97c', '#9aa261', '#a99d5c', '#c9c08a'];

export function createDuneGrass(uniforms: WorldUniforms, starLayers: number, spec: TerrainSpec, count: number, seed: number) {
  const geometry = clumpGeometry();
  const material = createPropMaterial(uniforms, starLayers, { color: '#ffffff', roughness: 0.8, foliage: { map: blades() } });
  const mesh = new InstancedMesh(geometry, material, Math.max(1, count));
  mesh.name = 'dune-grass';
  const random = createRandom(seed);
  const clumps = createSimplex2D(seed + 1);
  const sea = spec.water ?? 0;
  const m = new Matrix4();
  const q = new Quaternion();
  const colour = new Color();
  let placed = 0;
  for (let tries = 0; tries < count * 12 && placed < count; tries++) {
    const a = random() * Math.PI * 2;
    const r = 6 + random() ** 1.3 * 420;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const h = spec.height(x, z);
    // Above the swash and the wet sand, below the headland's rock.
    if (h < sea + 1.3 || h > sea + 24) continue;
    const slope = Math.hypot(spec.height(x + 1.5, z) - spec.height(x - 1.5, z), spec.height(x, z + 1.5) - spec.height(x, z - 1.5)) / 3;
    if (slope > 0.45) continue;
    // In clumps, thicker up on the dunes than on the flat.
    const dune = Math.min(1, Math.max(0, (h - sea - 3) / 6));
    if (clumps(x / 18, z / 18) * 0.6 + dune * 0.7 + random() * 0.4 < 0.55) continue;
    q.setFromAxisAngle(new Vector3(0, 1, 0), random() * Math.PI * 2);
    const s = 0.7 + random() * 0.8;
    m.compose(new Vector3(x, h - 0.03, z), q, new Vector3(s, s * (0.8 + random() * 0.5), s));
    mesh.setMatrixAt(placed, m);
    colour.set(MARRAM[Math.floor(random() * MARRAM.length)]).multiplyScalar(0.8 + random() * 0.35);
    mesh.setColorAt(placed, colour);
    placed++;
  }
  mesh.count = placed;
  mesh.computeBoundingSphere();
  return {
    mesh,
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
