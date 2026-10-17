// Cloud close in front of a landscape, the way the reference has it: a
// full-screen layer over the scene, thick along the bottom of the frame and
// up its sides, clear around the camp. The cursor parts it (the pointer
// history, threejs-temporal-surfaces): it thins where the cursor has been and
// is pushed along its path, then fills back in as the history fades. Turning
// the camera slides it like anything far off, and flying in swells it from the
// middle until it's gone. A biome opts in with `foreground`; its cloud sea
// beyond can then stay put (`pointerInfluence: 0`).
import { Mesh, PlaneGeometry, ShaderMaterial, Vector2, Vector3 } from 'three';
import { WORLD_ALL } from '../shaders/chunks';
import { SKY_KEYS, pickUniforms, type WorldUniforms } from '../systems/uniforms';

const KEYS = [...SKY_KEYS, 'uForeground', 'uDebugView'] as const;

const FRAGMENT = /* glsl */ `
${WORLD_ALL}
uniform float uForeground;
uniform float uDebugView;
uniform float uShow;
uniform float uGrow;
uniform vec2 uView;
uniform vec3 uClear;
varying vec2 vUv;

// The cursor's trail around this pixel, a little wider than it was drawn, so
// the cloud parts around the cursor and not just under it: velocity in xy,
// intensity in z.
vec3 trail(vec2 uv, float aspect) {
  vec2 o = vec2(0.035 / aspect, 0.035);
  vec4 c = texture(tPointer, uv);
  vec4 a = texture(tPointer, uv + vec2(o.x, 0.0));
  vec4 b = texture(tPointer, uv - vec2(o.x, 0.0));
  vec4 d = texture(tPointer, uv + vec2(0.0, o.y));
  vec4 e = texture(tPointer, uv - vec2(0.0, o.y));
  float z = max(c.b, 0.7 * max(max(a.b, b.b), max(d.b, e.b)));
  vec2 v = (c.rg + a.rg + b.rg + d.rg + e.rg) * 0.4 - 1.0;
  return vec3(v, z);
}

void main() {
  // Debug views show what's underneath, unobscured.
  if (uDebugView > 0.5) discard;
  float aspect = uResolution.x / uResolution.y;
  vec2 uv = vUv;
  vec3 tr = trail(uv, aspect);

  // Screen position in frame heights, from the middle; the camera's turn
  // slides it, flying in swells it, and the cursor pushes it along its path.
  vec2 p = (uv - 0.5) * vec2(aspect, 1.0);
  p /= 1.0 + 1.8 * uGrow;
  p += uView;
  p -= tr.xy * tr.z * 0.07;
  vec2 drift = normalize(uWind + vec2(1e-4, 0.0)) * uTime * 0.006;
  vec2 q = p * 0.7 + drift;

  // Billows: two broad octaves, warped, then eroded by a finer one.
  float a = texture(tNoise, q * 0.5).r;
  float b = texture(tNoise, q * 1.25 + a * 0.35 + 0.37 - drift * 0.6).g;
  float c = texture(tNoise, q * 3.3 - drift * 1.4 + 0.71).b;
  float shape = a * 0.6 + b * 0.4;
  shape -= (1.0 - shape) * (c - 0.4) * 0.35;

  // Where it lies: thick along the bottom and up the sides, thin over the
  // middle, and clear around the camp so it's never hidden.
  float low = 1.0 - smoothstep(0.04, 0.5, uv.y);
  float side = smoothstep(0.2, 0.5, abs(uv.x - 0.5)) * (1.0 - smoothstep(0.25, 0.75, uv.y));
  float bank = max(low, side);
  float clearing = 1.0;
  if (uClear.z > 0.0) {
    vec2 toCamp = (uv - uClear.xy) * vec2(aspect, 1.0);
    clearing = smoothstep(uClear.z * 0.45, uClear.z, length(toCamp * vec2(0.75, 1.0)));
  }
  float d = smoothstep(0.55, 0.9, shape * 0.75 + bank * 0.55) * clearing;
  // Where the cursor has been, it parts.
  d *= 1.0 - smoothstep(0.04, 0.55, tr.z) * 0.94;
  float alpha = d * uForeground * uShow * 0.9;
  if (alpha < 0.003) discard;

  // Lit on top, shadowed beneath and in its creases; thin edges take the sky.
  float lit = smoothstep(0.35, 0.95, shape) * (0.55 + 0.45 * b);
  vec3 col = mix(uCloudShadow, uCloudLit, 0.3 + 0.7 * lit);
  col = mix(col, wSkyBase(normalize(vec3(p.x, 0.08 + p.y * 0.5, -1.0))), 0.3 * (1.0 - d));
  gl_FragColor = vec4(col, alpha);
  #include <tonemapping_fragment>
  gl_FragColor.rgb = wGrade(gl_FragColor.rgb);
  #include <colorspace_fragment>
}
`;

export function createForegroundClouds(uniforms: WorldUniforms, starLayers: number) {
  const show = { value: 0 };
  const grow = { value: 0 };
  const view = { value: new Vector2() };
  const clear = { value: new Vector3() };
  const material = new ShaderMaterial({
    name: 'world-foreground-clouds',
    uniforms: { ...pickUniforms(uniforms, KEYS), uShow: show, uGrow: grow, uView: view, uClear: clear },
    defines: { STAR_LAYERS: starLayers },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: FRAGMENT,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  const mesh = new Mesh(new PlaneGeometry(2, 2), material);
  mesh.name = 'foreground-clouds';
  mesh.frustumCulled = false;
  // Over the scene, under the dive's fly-through.
  mesh.renderOrder = 900;
  mesh.visible = false;

  // The camera's turn, unwrapped so it never jumps a whole turn.
  let yaw = 0;
  let lastHeading: number | null = null;
  return {
    mesh,
    /**
     * How much of it shows (the landscape, before the dive), how far the view
     * has flown in (0 to 1), the camera's forward direction and vertical field
     * of view, and the camp's spot on screen (0 to 1, y up; null if it's off).
     */
    update(amount: number, zoom: number, forward: Vector3, fov: number, camp: { x: number; y: number } | null) {
      const visible = amount * uniforms.uForeground.value > 0.002;
      mesh.visible = visible;
      if (!visible) {
        lastHeading = null;
        return;
      }
      const heading = Math.atan2(forward.x, -forward.z);
      if (lastHeading !== null) yaw += Math.atan2(Math.sin(heading - lastHeading), Math.cos(heading - lastHeading));
      lastHeading = heading;
      // A turn of one radian moves the view this many frame heights.
      const k = 0.5 / Math.tan((fov * Math.PI) / 360);
      view.value.set(yaw * k, Math.asin(Math.max(-1, Math.min(1, forward.y))) * k);
      show.value = amount;
      grow.value = zoom;
      if (camp) clear.value.set(camp.x, camp.y, 0.2);
      else clear.value.set(0, 0, 0);
    },
    dispose() {
      mesh.geometry.dispose();
      material.dispose();
    },
  };
}
