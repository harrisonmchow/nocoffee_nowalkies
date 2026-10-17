// The cloud the camera flies through on a dive to the campsite (and back up):
// a full-screen layer drawn over the scene, in the camp's own cloud colours.
// Rings of cloud rush outward from the centre as if passing the camera, and
// for the fastest part of the move they fill the frame (GEAR-3D-PLAN.md §5.3).
import { Mesh, PlaneGeometry, ShaderMaterial } from 'three';
import { WORLD_ALL } from '../shaders/chunks';
import { SKY_KEYS, pickUniforms, type WorldUniforms } from '../systems/uniforms';

const FRAGMENT = /* glsl */ `
${WORLD_ALL}
uniform float uFly;
uniform float uFlyTime;
varying vec2 vUv;
void main() {
  vec2 p = (vUv - 0.5) * vec2(uResolution.x / uResolution.y, 1.0);
  float r = length(p);
  // Four layers, each growing from the centre and fading as it passes the camera.
  float density = 0.0;
  float lit = 0.0;
  for (int i = 0; i < 4; i++) {
    float phase = fract(uFlyTime * 0.85 + float(i) * 0.25);
    float scale = mix(2.6, 0.35, phase);
    float fade = smoothstep(0.0, 0.35, phase) * (1.0 - smoothstep(0.72, 1.0, phase));
    vec2 q = p * scale + vec2(float(i) * 3.7, float(i) * 1.9);
    float n = textureLod(tNoise, q * 0.3, 1.0).r * 0.6 + textureLod(tNoise, q * 0.8 + 1.3, 0.0).g * 0.4;
    float d = smoothstep(0.36, 0.72, n) * fade;
    lit = max(lit, d * (0.6 + 0.4 * textureLod(tNoise, q * 0.5 + 4.1, 0.0).b));
    density = max(density, d);
  }
  // Thin at the edges of the move, whole at its peak; a touch denser toward the rim.
  float alpha = clamp(uFly * (0.62 + 0.5 * density + 0.15 * r) + max(uFly - 0.82, 0.0) * 4.0, 0.0, 1.0);
  vec3 col = mix(uCloudShadow, uCloudLit, 0.45 + 0.55 * lit);
  col = mix(col, wSkyBase(normalize(vec3(p, -1.0))), 0.18);
  gl_FragColor = vec4(col * 1.1, alpha);
  #include <tonemapping_fragment>
  gl_FragColor.rgb = wGrade(gl_FragColor.rgb);
  #include <colorspace_fragment>
}
`;

export function createFlyThrough(uniforms: WorldUniforms, starLayers: number) {
  const fly = { value: 0 };
  const flyTime = { value: 0 };
  const material = new ShaderMaterial({
    name: 'world-fly-through',
    uniforms: { ...pickUniforms(uniforms, SKY_KEYS), uFly: fly, uFlyTime: flyTime },
    defines: { STAR_LAYERS: starLayers },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: FRAGMENT,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  const mesh = new Mesh(new PlaneGeometry(2, 2), material);
  mesh.name = 'fly-through';
  mesh.frustumCulled = false;
  mesh.renderOrder = 1000;
  mesh.visible = false;
  return {
    mesh,
    /** How much of the frame it fills (0 hides it), and seconds into the move, for the rush. */
    set(amount: number, seconds: number) {
      fly.value = amount;
      flyTime.value = seconds;
      mesh.visible = amount > 0.002;
    },
    dispose() {
      mesh.geometry.dispose();
      material.dispose();
    },
  };
}
