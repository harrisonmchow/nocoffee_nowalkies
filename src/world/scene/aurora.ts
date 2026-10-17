// The aurora as a sky texture: the curtain field from threejs-procedural-vfx
// (raymarched-aurora-curtains), traced once per texel of an upper-hemisphere
// map instead of once per screen pixel. The sky samples it by direction.
import {
  BufferGeometry,
  Float32BufferAttribute,
  HalfFloatType,
  LinearFilter,
  Mesh,
  OrthographicCamera,
  RepeatWrapping,
  ClampToEdgeWrapping,
  Scene,
  ShaderMaterial,
  UnsignedByteType,
  Vector3,
  WebGLRenderTarget,
  type WebGLRenderer,
} from 'three';

// The curtain field, copied from the skill's example: a finite emissive slab,
// warped curtain density, uniform ray steps and gentle start jitter.
const AURORA_VOLUME_GLSL = /* glsl */ `
  uniform float iTime;
  uniform float uSpeed;
  uniform float uSeed;
  uniform float uAuroraGain;
  uniform vec3 uColorBase;
  uniform vec3 uColorHigh;
  uniform vec2 uSize;

  const float RAY_ITERATIONS = float(AURORA_STEPS);
  const float LUMINANCE_FACTOR = 0.05;
  const float Y_OFFSET_BOTTOM = 50.0;
  const float VOLUME_DEPTH = 75.0;
  const vec3 BOUND_LOW = vec3(-250.0, Y_OFFSET_BOTTOM, -500.0);
  const vec3 BOUND_HIGH = vec3(250.0, Y_OFFSET_BOTTOM + VOLUME_DEPTH, 500.0);

  float generateRandomFloat(vec2 seedVal) {
    vec3 p3 = fract(vec3(seedVal.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }
  float computeHash1(float v) {
    vec3 hVec = fract(vec3(v) * 0.1031);
    hVec += dot(hVec, hVec.yzx + 19.19);
    return fract((hVec.x + hVec.y) * hVec.z);
  }
  float computeHash3(vec3 v3) {
    v3 = fract(v3 * vec3(0.1031, 0.1030, 0.0973));
    v3 += dot(v3, v3.yxz + 33.33);
    return fract((v3.xxy + v3.yxx) * v3.zyx).x;
  }
  float evaluateVolumeNoise(vec3 coord) {
    vec3 gridP = floor(coord);
    vec3 fractP = fract(coord);
    fractP = fractP * fractP * (3.0 - 2.0 * fractP);
    return mix(
      mix(mix(computeHash3(gridP), computeHash3(gridP + vec3(1.0, 0.0, 0.0)), fractP.x),
          mix(computeHash3(gridP + vec3(0.0, 1.0, 0.0)), computeHash3(gridP + vec3(1.0, 1.0, 0.0)), fractP.x), fractP.y),
      mix(mix(computeHash3(gridP + vec3(0.0, 0.0, 1.0)), computeHash3(gridP + vec3(1.0, 0.0, 1.0)), fractP.x),
          mix(computeHash3(gridP + vec3(0.0, 1.0, 1.0)), computeHash3(gridP + vec3(1.0, 1.0, 1.0)), fractP.x), fractP.y),
      fractP.z);
  }
  float smoothCurve(float t) { return t * t * t * (t * (t * 6.0 - 15.0) + 10.0); }
  float pickGradient(float hVal, float posVal) {
    int idx = int(1e4 * hVal);
    return (idx - (idx / 2) * 2) == 0 ? posVal : -posVal;
  }
  float calculateLineNoise(float pt) {
    float ptInt = floor(pt);
    float ptFract = pt - ptInt;
    return mix(pickGradient(computeHash1(ptInt), ptFract), pickGradient(computeHash1(ptInt + 1.0), ptFract - 1.0), smoothCurve(ptFract)) * 2.0;
  }
  float fractalVolumePattern(vec3 spacePt) {
    float accum = 0.0;
    float weightSum = 0.0;
    float currentWeight = 1.0;
    float currentFrequency = 1.0;
    for (int stepId = 0; stepId < 3; stepId++) {
      accum += (1.0 - evaluateVolumeNoise(spacePt * currentFrequency)) * currentWeight;
      weightSum += currentWeight;
      currentWeight *= 0.5;
      currentFrequency *= 2.0;
    }
    return clamp(accum / weightSum, 0.0, 1.0);
  }
  vec2 computeBoxIntersection(vec3 ro, vec3 rd, vec3 lo, vec3 hi) {
    vec3 a = (lo - ro) / rd;
    vec3 b = (hi - ro) / rd;
    vec3 mn = min(a, b);
    vec3 mx = max(a, b);
    return vec2(max(max(mn.x, mn.y), mn.z), min(min(mx.x, mx.y), mx.z));
  }
  vec3 warpSpatialCoords(vec3 p, float timeFlow) {
    float normalizedHeight = (p.y - Y_OFFSET_BOTTOM) / VOLUME_DEPTH;
    vec3 w = 0.04 * vec3(p.x, 2.0 * timeFlow, 0.225 * p.z + timeFlow * 0.5);
    w.xz += vec2(uSeed * 17.3, uSeed * 29.1);
    w.x += 0.3 * normalizedHeight + 5.5 * cos(0.005 * p.z);
    w.x += 0.02 * calculateLineNoise(0.1 * p.z + timeFlow * 2.0);
    return w;
  }
  float sampleCurtainThickness(vec3 p) {
    float timeFlow = iTime * uSpeed;
    vec3 s = warpSpatialCoords(p, timeFlow);
    float base = fractalVolumePattern(s);
    vec3 shape = vec3(base, p.y - BOUND_LOW.y, base) * vec3(1.0, 0.006, 1.0);
    shape.y += 0.48;
    shape.y += 0.015 * calculateLineNoise(timeFlow + s.z);
    shape.y += 0.015 * calculateLineNoise(-2.0 * timeFlow + s.z);
    float thickness = pow(0.55 / max(length(shape), 1e-7), 12.0);
    thickness *= cos(0.13 * s.x);
    // Soften the slab's footprint edges, so the low curtains fade instead of
    // ending in boxy cut-offs (the finite footprint still owns the silhouette).
    vec2 inside = min(p.xz - BOUND_LOW.xz, BOUND_HIGH.xz - p.xz);
    thickness *= smoothstep(0.0, 70.0, inside.x) * smoothstep(0.0, 120.0, inside.y);
    return max(0.0, thickness);
  }
  vec3 auroraEmission(vec3 dir, float jitter) {
    vec3 ro = vec3(0.0, 10.0, 0.0) + dir * 10.0;
    vec2 hit = computeBoxIntersection(ro, dir, BOUND_LOW, BOUND_HIGH);
    if (!(hit.x > 0.0 && hit.x < hit.y)) return vec3(0.0);
    float stepLength = (hit.y - hit.x) / RAY_ITERATIONS;
    float t = hit.x + stepLength * jitter * 0.25;
    vec3 light = vec3(0.0);
    for (float i = 0.0; i < RAY_ITERATIONS; i++) {
      vec3 p = ro + dir * t;
      light += sampleCurtainThickness(p) * mix(uColorBase, uColorHigh, (p.y - BOUND_LOW.y) / VOLUME_DEPTH) * stepLength;
      t += stepLength;
    }
    return LUMINANCE_FACTOR * light * uAuroraGain;
  }
`;

const FRAGMENT = AURORA_VOLUME_GLSL + /* glsl */ `
  void main() {
    vec2 uv = gl_FragCoord.xy / uSize;
    float azimuth = uv.x * 6.2831853;
    // Rows cover 0-70 degrees, where the curtains are; the sky clamps above.
    float elevation = uv.y * 1.2217;
    vec3 dir = vec3(cos(elevation) * cos(azimuth), sin(elevation), cos(elevation) * sin(azimuth));
    // Jitter fixed per texel, so the map doesn't pulse.
    gl_FragColor = vec4(auroraEmission(dir, generateRandomFloat(gl_FragCoord.xy)), 1.0);
  }
`;

export type AuroraOptions = { width: number; height: number; steps: number; halfFloat: boolean };

export function createAurora(renderer: WebGLRenderer, { width, height, steps, halfFloat }: AuroraOptions) {
  const target = new WebGLRenderTarget(width, height, {
    type: halfFloat ? HalfFloatType : UnsignedByteType,
    minFilter: LinearFilter,
    magFilter: LinearFilter,
    depthBuffer: false,
    generateMipmaps: false,
  });
  target.texture.wrapS = RepeatWrapping;
  target.texture.wrapT = ClampToEdgeWrapping;

  const material = new ShaderMaterial({
    name: 'world-aurora',
    uniforms: {
      iTime: { value: 0 },
      uSpeed: { value: 0.65 },
      uSeed: { value: 19.6 },
      // The skill's preset is calibrated for its own exposure; this scene is darker.
      uAuroraGain: { value: 6 },
      uColorBase: { value: new Vector3(0.1, 1.0, 0.35) },
      uColorHigh: { value: new Vector3(0.25, 0.45, 1.0) },
      uSize: { value: [width, height] },
    },
    defines: { AURORA_STEPS: steps },
    vertexShader: 'void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: FRAGMENT,
    depthTest: false,
    depthWrite: false,
  });
  // One triangle that covers the whole target.
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  const quad = new Mesh(geometry, material);
  quad.frustumCulled = false;
  const scene = new Scene();
  scene.add(quad);
  const camera = new OrthographicCamera();

  return {
    texture: target.texture,
    /** Redraw for the given scene time. Skipped by the caller while the aurora is off. */
    render(time: number) {
      material.uniforms.iTime.value = time;
      const previous = renderer.getRenderTarget();
      renderer.setRenderTarget(target);
      renderer.render(scene, camera);
      renderer.setRenderTarget(previous);
    },
    dispose() {
      target.dispose();
      geometry.dispose();
      material.dispose();
    },
  };
}
