// The night sky: a gradient dome, stars, and a simple aurora of drifting
// curtains. All of it rides along with the camera (call `follow` each
// frame) so it always sits at the same apparent distance, behind the
// mountain and clear of the fog.
//
// It's a painted backdrop, not a true sky: the default views look down
// on the mountain and barely see above the horizon, so the stars and the
// aurora carry on below it, behind the peak and through the mist.
import * as THREE from 'three';
import type { WeatherConfig } from '../../data/weather';
import { rng } from './rocks';

const R = 5200; // inside the camera's far plane at every zoom level

function dome(horizon: string, zenith: string) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { horizon: { value: new THREE.Color(horizon) }, zenith: { value: new THREE.Color(zenith) } },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 horizon;
      uniform vec3 zenith;
      varying vec3 vDir;
      void main() {
        // Horizon colour low down (where the fogged ground meets it),
        // deepening overhead.
        float k = smoothstep(-0.15, 0.55, vDir.y);
        gl_FragColor = vec4(mix(horizon, zenith, pow(k, 0.8)), 1.0);
        #include <colorspace_fragment>
      }`,
    side: THREE.BackSide,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(R, 32, 16), mat);
  mesh.renderOrder = -3;
  return mesh;
}

function stars(count = 1600) {
  const r = rng(91);
  const pos: number[] = [];
  const col: number[] = [];
  for (let i = 0; i < count; i++) {
    // Uniform over the sky, and a little way below the horizon.
    const y = -0.2 + r() * 1.2;
    const a = r() * Math.PI * 2;
    const s = Math.sqrt(1 - y * y);
    pos.push(Math.cos(a) * s * R * 0.97, y * R * 0.97, Math.sin(a) * s * R * 0.97);
    const b = 0.35 + Math.pow(r(), 3) * 0.65;
    col.push(b, b, b * (0.9 + r() * 0.15));
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const pts = new THREE.Points(
    geo,
    new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: false, vertexColors: true, fog: false, depthWrite: false }),
  );
  pts.renderOrder = -2;
  return pts;
}

function aurora() {
  const mat = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float time;
      varying vec2 vUv;
      float hash(float n) { return fract(sin(n) * 43758.5453); }
      // Value noise repeating every p cells, so the sky wraps without a seam.
      float noise(float x, float p) {
        float i = floor(x), f = fract(x);
        return mix(hash(mod(i, p)), hash(mod(i + 1.0, p)), f * f * (3.0 - 2.0 * f));
      }
      float fbm(float x, float p) {
        return noise(x, p) * 0.55 + noise(x * 2.0 + 7.0, p * 2.0) * 0.3 + noise(x * 4.0 + 3.0, p * 4.0) * 0.15;
      }
      void main() {
        // u runs once round the sky, y up the curtain.
        float u = vUv.x;
        float y = vUv.y;
        // Broad curtains that come and go, slowly sliding sideways.
        float band = smoothstep(0.28, 0.68, fbm(u * 22.0 + time * 0.04, 22.0));
        // Fine vertical rays inside them.
        float rays = 0.45 + 0.55 * fbm(u * 560.0 - time * 0.25, 560.0);
        // A wavy lower hem, bright just above it, fading upward.
        float hem = 0.06 + 0.12 * fbm(u * 48.0 + time * 0.06, 48.0);
        float rise = smoothstep(hem, hem + 0.05, y);
        float fall = exp(-(y - hem) * 2.6);
        float i = band * rays * rise * fall;
        vec3 green = vec3(0.25, 1.0, 0.62);
        vec3 violet = vec3(0.55, 0.45, 1.0);
        vec3 col = mix(green, violet, smoothstep(hem + 0.06, hem + 0.38, y));
        gl_FragColor = vec4(col * i * 0.85, 1.0);
      }`,
    side: THREE.BackSide,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  // A tall open cylinder from 22° below eye level to 45° above. The hem
  // lands around 8–18° down, so it shows behind the peak from the views.
  const rc = R * 0.92;
  const geo = new THREE.CylinderGeometry(rc, rc, rc * 1.4, 128, 1, true);
  geo.translate(0, rc * 0.3, 0);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = -1;
  return { mesh, mat };
}

export function makeSky(w: WeatherConfig) {
  const group = new THREE.Group();
  if (w.zenith) group.add(dome(w.horizon, w.zenith));
  if (w.stars) group.add(stars());
  const a = w.aurora ? aurora() : null;
  if (a) group.add(a.mesh);
  return {
    group,
    follow(camera: THREE.Camera) {
      group.position.copy(camera.position);
    },
    update(t: number) {
      if (a) a.mat.uniforms.time.value = t;
    },
  };
}
