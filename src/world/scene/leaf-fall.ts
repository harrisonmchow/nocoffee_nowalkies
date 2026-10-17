// Caleb's clearing, floor and air: a carpet of fallen maple leaves around the
// camp, and leaves drifting down through it. The carpet is leaf sprays lying
// flat on the ground (the trees' own material, without the flutter). The fall
// is one draw: each leaf loops down from the canopy on its own phase and rate
// (threejs-procedural-animation), swaying, tumbling about its own axis and
// carried a little downwind, grown in at the top and shrunk away at the
// ground so the loop never jumps. With scene time frozen they hang still.
import {
  Color,
  Float32BufferAttribute,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  InstancedMesh,
  Matrix4,
  Mesh,
  PlaneGeometry,
  Quaternion,
  ShaderMaterial,
  Vector3,
  DoubleSide,
} from 'three';
import { WORLD_ALL } from '../shaders/chunks';
import { createRandom } from '../systems/random';
import { SKY_KEYS, pickUniforms, type WorldUniforms } from '../systems/uniforms';
import { AUTUMN, leafTextures } from './maples';
import { createPropMaterial } from './props-material';
import type { HeightField } from './terrain-fields';

/** Where nothing lies: the fire ring and under the tent. */
export type Keepout = { x: number; z: number; r: number };

const BROWN = new Color('#6b4426');

/** Fallen leaves on the ground around the camp, thickest close in. */
export function createLeafCarpet(uniforms: WorldUniforms, starLayers: number, groundAt: HeightField, count: number, seed: number, keepout: Keepout[]) {
  const geometry = new PlaneGeometry(0.34, 0.34).rotateX(-Math.PI / 2);
  geometry.setAttribute('aCrown', new Float32BufferAttribute(new Float32Array(geometry.getAttribute('position').count).fill(0.7), 1));
  const material = createPropMaterial(uniforms, starLayers, { color: '#ffffff', roughness: 0.92, foliage: { map: leafTextures().spray, still: true } });
  const mesh = new InstancedMesh(geometry, material, Math.max(1, count));
  mesh.name = 'leaf-carpet';
  const random = createRandom(seed);
  const m = new Matrix4();
  const q = new Quaternion();
  const tilt = new Quaternion();
  const colour = new Color();
  let placed = 0;
  for (let tries = 0; tries < count * 6 && placed < count; tries++) {
    const a = random() * Math.PI * 2;
    const r = 0.8 + random() ** 1.4 * 22;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (keepout.some((k) => Math.hypot(x - k.x, z - k.z) < k.r)) continue;
    q.setFromAxisAngle(new Vector3(0, 1, 0), random() * Math.PI * 2);
    tilt.setFromAxisAngle(new Vector3(1, 0, 0).applyAxisAngle(new Vector3(0, 1, 0), random() * Math.PI * 2), (random() - 0.5) * 0.3);
    q.premultiply(tilt);
    const s = 0.7 + random() * 0.7;
    // Each a hair above the last, so overlapping leaves never fight for the same depth.
    m.compose(new Vector3(x, groundAt(x, z) + 0.01 + random() * 0.02, z), q, new Vector3(s, 1, s));
    mesh.setMatrixAt(placed, m);
    // Fallen leaves have lost a little colour.
    colour.set(AUTUMN[Math.floor(random() * AUTUMN.length)]).lerp(BROWN, 0.15 + random() * 0.3).multiplyScalar(0.7 + random() * 0.3);
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

const FALL_KEYS = [...SKY_KEYS, 'uAmbient', 'uKeyColor'] as const;

const FALL_VERTEX = /* glsl */ `
uniform float uTime;
uniform vec2 uWind;
/** The ground at the camp, how far the leaves fall, and over what radius. */
uniform vec3 uFall;
attribute vec4 aFall;
attribute vec3 aTint;
varying vec2 vUv;
varying vec3 vTint;
varying vec3 vWorldPos;
varying vec3 vFacing;

mat3 turn(vec3 axis, float a) {
  float s = sin(a);
  float c = cos(a);
  float k = 1.0 - c;
  return mat3(
    c + axis.x * axis.x * k, axis.y * axis.x * k + axis.z * s, axis.z * axis.x * k - axis.y * s,
    axis.x * axis.y * k - axis.z * s, c + axis.y * axis.y * k, axis.z * axis.y * k + axis.x * s,
    axis.x * axis.z * k + axis.y * s, axis.y * axis.z * k - axis.x * s, c + axis.z * axis.z * k
  );
}

void main() {
  vUv = uv;
  vTint = aTint;
  // aFall: where it falls (x, z), its phase, and its rate.
  float t = fract(aFall.z + uTime * 0.045 * aFall.w);
  float y = uFall.x + 0.12 + uFall.y * (1.0 - t);
  vec2 sway = vec2(sin(uTime * 1.1 * aFall.w + aFall.z * 31.0), cos(uTime * 0.83 * aFall.w + aFall.z * 17.0)) * 0.45;
  vec2 drift = normalize(uWind + vec2(1e-4, 0.0)) * t * 2.5;
  vec3 centre = vec3(aFall.x + sway.x + drift.x, y, aFall.y + sway.y + drift.y);
  mat3 r = turn(normalize(vec3(sin(aFall.z * 9.0), 0.6, cos(aFall.z * 7.0))), uTime * (1.3 + aFall.w * 1.5) + aFall.z * 50.0);
  float size = smoothstep(0.0, 0.06, t) * (1.0 - smoothstep(0.94, 1.0, t));
  vec3 world = centre + r * (position * size);
  vFacing = r * vec3(0.0, 0.0, 1.0);
  vWorldPos = world;
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}
`;

const FALL_FRAGMENT = /* glsl */ `
${WORLD_ALL}
uniform sampler2D tLeaf;
uniform vec3 uAmbient;
uniform vec3 uKeyColor;
varying vec2 vUv;
varying vec3 vTint;
varying vec3 vWorldPos;
varying vec3 vFacing;
void main() {
  vec4 leaf = texture(tLeaf, vUv);
  if (leaf.a < 0.5) discard;
  vec3 L = normalize(uKeyDir);
  // Two-sided, and lit through when it's between you and the sun.
  float lit = abs(dot(normalize(vFacing), L));
  float back = pow(max(dot(normalize(vWorldPos - cameraPosition), L), 0.0), 3.0);
  vec3 col = vTint * leaf.rgb * (uAmbient + uKeyColor * (lit * 0.8 + back * 0.6));
  col = wCloudFog(wHaze(col, vWorldPos), vWorldPos);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  gl_FragColor.rgb = wGrade(gl_FragColor.rgb);
  #include <colorspace_fragment>
}
`;

/** Leaves drifting down through the clearing from the canopy, `height` metres, within `radius` of the camp. */
export function createFallingLeaves(uniforms: WorldUniforms, starLayers: number, ground: number, count: number, seed: number, height = 9, radius = 20) {
  const base = new PlaneGeometry(0.16, 0.16);
  const geometry = new InstancedBufferGeometry();
  geometry.index = base.index;
  geometry.setAttribute('position', base.getAttribute('position'));
  geometry.setAttribute('uv', base.getAttribute('uv'));
  const random = createRandom(seed);
  const fall = new Float32Array(count * 4);
  const tint = new Float32Array(count * 3);
  const colour = new Color();
  for (let i = 0; i < count; i++) {
    const a = random() * Math.PI * 2;
    const r = 2 + Math.sqrt(random()) * radius;
    fall.set([Math.cos(a) * r, Math.sin(a) * r, random(), 0.7 + random() * 0.6], i * 4);
    colour.set(AUTUMN[Math.floor(random() * AUTUMN.length)]).multiplyScalar(0.85 + random() * 0.3);
    tint.set([colour.r, colour.g, colour.b], i * 3);
  }
  geometry.setAttribute('aFall', new InstancedBufferAttribute(fall, 4));
  geometry.setAttribute('aTint', new InstancedBufferAttribute(tint, 3));
  geometry.instanceCount = count;
  const material = new ShaderMaterial({
    name: 'world-falling-leaves',
    uniforms: { ...pickUniforms(uniforms, FALL_KEYS), tLeaf: { value: leafTextures().single }, uFall: { value: new Vector3(ground, height, radius) } },
    defines: { STAR_LAYERS: starLayers },
    vertexShader: FALL_VERTEX,
    fragmentShader: FALL_FRAGMENT,
    side: DoubleSide,
  });
  const mesh = new Mesh(geometry, material);
  mesh.name = 'falling-leaves';
  mesh.frustumCulled = false;
  return {
    mesh,
    dispose() {
      base.dispose();
      geometry.dispose();
      material.dispose();
    },
  };
}
