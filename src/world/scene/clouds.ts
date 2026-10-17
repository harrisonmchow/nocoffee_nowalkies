// The puffs that drift around the peaks: billboard cards with noise-distorted
// density, as in the reference. The cloud layer itself isn't geometry. Every
// surface and the sky work it out along their own view rays (WORLD_CLOUD in
// shaders/chunks.ts). This module also keeps the camera directions the
// cursor's push needs up to date.
import {
  InstancedBufferAttribute,
  InstancedMesh,
  Object3D,
  PlaneGeometry,
  ShaderMaterial,
  Vector2,
  Vector3,
  type PerspectiveCamera,
} from 'three';
import { WORLD_ALL } from '../shaders/chunks';
import { SKY_KEYS, pickUniforms, type WorldUniforms } from '../systems/uniforms';

const PUFF_KEYS = [...SKY_KEYS, 'tHeight', 'uHeightBounds', 'uPuffOpacity', 'uDebugView'] as const;

const PUFF_VERTEX = /* glsl */ `
uniform float uCloudHeight;
uniform float uCloudThickness;
uniform vec2 uPuffSize;
attribute vec4 aPuff;
varying vec2 vUv;
varying vec3 vWorldPos;
varying float vSeed;
varying float vSize;
void main() {
  vUv = uv;
  vSeed = aPuff.w;
  vec3 center = vec3(aPuff.x, uCloudHeight + 0.5 * uCloudThickness + aPuff.y, aPuff.z);
  vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  float size = mix(uPuffSize.x, uPuffSize.y, fract(aPuff.w * 7.31));
  vSize = size;
  vec3 world = center + (right * position.x + up * position.y * 0.55) * size;
  vWorldPos = world;
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}
`;

const PUFF_FRAGMENT = /* glsl */ `
${WORLD_ALL}
uniform sampler2D tHeight;
uniform vec4 uHeightBounds;
uniform float uPuffOpacity;
uniform float uDebugView;
varying vec2 vUv;
varying vec3 vWorldPos;
varying float vSeed;
varying float vSize;
void main() {
  // Every debug view (terrain fields 1-7, cloud field and pointer 8-9) shows what's underneath, unobscured.
  if (uDebugView > 0.5) discard;
  vec3 ptr = wPointer();
  vec2 p = vUv - 0.5 - ptr.xy * 0.06;
  float n = texture(tNoise, vUv * 0.8 + vSeed * 3.1 + uTime * 0.0015).r;
  float r = length(p * vec2(1.0, 1.4)) * 2.0 + (n - 0.5) * 0.7;
  float d = smoothstep(1.0, 0.35, r) * smoothstep(0.08, 0.5, uCloudCoverage);
  d *= 1.0 - ptr.z * 0.6;
  // Fade out where the ground comes up through the puff.
  float ground = texture(tHeight, (vWorldPos.xz - uHeightBounds.xy) / uHeightBounds.z).r;
  d *= smoothstep(0.0, vSize * 0.15, vWorldPos.y - ground);
  if (d < 0.003) discard;
  float lift = clamp(0.5 + p.y, 0.0, 1.0);
  vec3 n3 = normalize(vec3(p.x, 0.7, -p.y));
  vec3 col = mix(uCloudShadow, uCloudLit, clamp(dot(n3, uKeyDir) * 0.5 + 0.5, 0.0, 1.0) * (0.25 + 0.75 * lift));
  col += uSunColor * uCloudRim * pow(max(dot(normalize(vWorldPos - cameraPosition), uSunDir), 0.0), 6.0) * (1.0 - d) * 0.6;
  col = wHaze(col, vWorldPos);
  gl_FragColor = vec4(col, d * uPuffOpacity);
  #include <tonemapping_fragment>
  gl_FragColor.rgb = wGrade(gl_FragColor.rgb);
  #include <colorspace_fragment>
}
`;

export type CloudOptions = { puffs: number; starLayers: number };

export function createClouds(uniforms: WorldUniforms, options: CloudOptions) {
  const group = new Object3D();
  group.name = 'clouds';
  const puffSize = { value: new Vector2(260, 640) };
  const puffMaterial = new ShaderMaterial({
    name: 'world-cloud-puffs',
    uniforms: { ...pickUniforms(uniforms, PUFF_KEYS), uPuffSize: puffSize },
    defines: { STAR_LAYERS: options.starLayers },
    vertexShader: PUFF_VERTEX,
    fragmentShader: PUFF_FRAGMENT,
    transparent: true,
    depthWrite: false,
  });
  const puffs = new InstancedMesh(new PlaneGeometry(1, 1), puffMaterial, Math.max(1, options.puffs));
  puffs.count = 0;
  puffs.frustumCulled = false;
  puffs.renderOrder = 10;
  group.add(puffs);

  const right = new Vector3();
  const forward = new Vector3();
  return {
    group,
    /** Scatter puffs for a biome: x/z positions, a height offset and a seed per puff, and their width range in metres. */
    setPuffs(data: Float32Array, size: readonly [number, number]) {
      puffSize.value.set(size[0], size[1]);
      const count = Math.min(options.puffs, data.length / 4);
      puffs.geometry.setAttribute('aPuff', new InstancedBufferAttribute(data.slice(0, count * 4), 4));
      puffs.count = count;
    },
    update(camera: PerspectiveCamera) {
      camera.getWorldDirection(forward);
      right.crossVectors(forward, camera.up).normalize();
      uniforms.uCamRight.value.set(right.x, right.z).normalize();
      uniforms.uCamForward.value.set(forward.x, forward.z).normalize();
    },
    dispose() {
      puffs.geometry.dispose();
      puffMaterial.dispose();
    },
  };
}
