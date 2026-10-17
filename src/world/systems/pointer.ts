// The cursor's recent path as a screen-space texture (threejs-temporal-surfaces,
// ping-pong accumulation): RG = velocity, stored as 0.5 + 0.5v in float and
// byte targets alike so readers decode it one way, B = intensity. The clouds
// read it to part and drift where the pointer moves; it decays so they settle.
import {
  BufferGeometry,
  Float32BufferAttribute,
  HalfFloatType,
  LinearFilter,
  Mesh,
  OrthographicCamera,
  Scene,
  ShaderMaterial,
  UnsignedByteType,
  Vector2,
  WebGLRenderTarget,
  type WebGLRenderer,
} from 'three';

const SIZE = 128;
/** Seconds for the history to fall to 1/e: long enough to see, short enough to settle. */
const TAU = 0.7;

export function createPointerField(renderer: WebGLRenderer, halfFloat: boolean) {
  const make = () =>
    new WebGLRenderTarget(SIZE, SIZE, {
      type: halfFloat ? HalfFloatType : UnsignedByteType,
      minFilter: LinearFilter,
      magFilter: LinearFilter,
      depthBuffer: false,
      generateMipmaps: false,
    });
  let read = make();
  let write = make();

  const material = new ShaderMaterial({
    name: 'world-pointer',
    uniforms: {
      tPrev: { value: read.texture },
      uPointer: { value: new Vector2(-10, -10) },
      uVelocity: { value: new Vector2() },
      uStrength: { value: 0 },
      uDecay: { value: 1 },
      uAspect: { value: 1 },
      uRadius: { value: 0.07 },
    },
    vertexShader: 'varying vec2 vUv; void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: /* glsl */ `
      uniform sampler2D tPrev;
      uniform vec2 uPointer;
      uniform vec2 uVelocity;
      uniform float uStrength;
      uniform float uDecay;
      uniform float uAspect;
      uniform float uRadius;
      varying vec2 vUv;
      void main() {
        vec4 prev = texture(tPrev, vUv);
        prev.rg = prev.rg * 2.0 - 1.0;
        prev.rg *= uDecay;
        // A little linear decay too, so an 8-bit target can't hold its last few levels forever.
        prev.b = max(prev.b * uDecay - (1.0 - uDecay) * 0.02, 0.0);
        vec2 d = vUv - uPointer;
        d.x *= uAspect;
        float splat = exp(-dot(d, d) / (uRadius * uRadius)) * uStrength;
        vec2 velocity = mix(prev.rg, uVelocity, clamp(splat, 0.0, 1.0));
        gl_FragColor = vec4(velocity * 0.5 + 0.5, clamp(prev.b + splat, 0.0, 1.0), 1.0);
      }
    `,
    depthTest: false,
    depthWrite: false,
  });
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  const quad = new Mesh(geometry, material);
  quad.frustumCulled = false;
  const scene = new Scene();
  scene.add(quad);
  const camera = new OrthographicCamera();

  // Pointer tracking, in 0..1 screen coordinates with y up.
  const position = new Vector2(-10, -10);
  const velocity = new Vector2();
  let lastMove = -Infinity;
  /** Set by a move, cleared by the next update, so every move splats even when frames are slow. */
  let movedSinceUpdate = false;
  let last: { x: number; y: number; t: number } | null = null;
  const onMove = (event: PointerEvent) => {
    const x = event.clientX / window.innerWidth;
    const y = 1 - event.clientY / window.innerHeight;
    const t = event.timeStamp / 1000;
    if (last && t > last.t) {
      const dt = Math.max(t - last.t, 1 / 240);
      // Smoothed so one jumpy event doesn't fling the clouds.
      velocity.lerp(new Vector2((x - last.x) / dt, (y - last.y) / dt), 0.5);
    }
    last = { x, y, t };
    position.set(x, y);
    lastMove = performance.now();
    movedSinceUpdate = true;
  };
  const onLeave = () => {
    last = null;
    velocity.set(0, 0);
  };
  window.addEventListener('pointermove', onMove, { passive: true });
  document.addEventListener('pointerleave', onLeave);

  const swap = () => {
    const t = read;
    read = write;
    write = t;
  };

  const draw = () => {
    material.uniforms.tPrev.value = read.texture;
    const previous = renderer.getRenderTarget();
    renderer.setRenderTarget(write);
    renderer.render(scene, camera);
    renderer.setRenderTarget(previous);
    swap();
  };

  const field = {
    get texture() {
      return read.texture;
    },
    /** Advance the history by dt seconds. */
    update(dt: number, aspect: number, enabled: boolean) {
      const moving = enabled && (movedSinceUpdate || performance.now() - lastMove < 80);
      movedSinceUpdate = false;
      const speed = velocity.length();
      material.uniforms.uDecay.value = Math.exp(-dt / TAU);
      material.uniforms.uAspect.value = aspect;
      material.uniforms.uPointer.value.copy(position);
      material.uniforms.uStrength.value = moving ? Math.min(1, speed * 0.6) * Math.min(1, dt * 30) : 0;
      material.uniforms.uVelocity.value.set(
        Math.max(-1, Math.min(1, velocity.x * 0.25)),
        Math.max(-1, Math.min(1, velocity.y * 0.25)),
      );
      if (!moving) velocity.multiplyScalar(Math.exp(-dt * 8));
      draw();
    },
    /** Forget the history, e.g. after a resize, since it's tied to the old screen. */
    clear() {
      const strength = material.uniforms.uStrength.value;
      material.uniforms.uDecay.value = 0;
      material.uniforms.uStrength.value = 0;
      draw();
      draw();
      material.uniforms.uStrength.value = strength;
    },
    dispose() {
      window.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerleave', onLeave);
      read.dispose();
      write.dispose();
      geometry.dispose();
      material.dispose();
    },
  };
  // A fresh target is all zeros, which would read as velocity -1: start from rest.
  field.clear();
  return field;
}

export type PointerField = ReturnType<typeof createPointerField>;
