// Mist for the mountain: a height fog patched into every material (so
// the bottom of the mountain, and its cut edges, fade into the sky) and
// slow drifting cloud sprites for movement.
import * as THREE from 'three';
import { rng } from './rocks';

export type MistOptions = {
  /** Fully fogged at or below this height. */
  bottom: number;
  /** Clear at or above this height. */
  top: number;
  /** A dense floor of mist: solid at the ground, gone by this height. 0 for none. */
  floor: number;
  /** How quickly the mist thickens with distance, per metre. */
  density: number;
  /** Fade the ground out with distance from `centre` on x/z: [start, end]. */
  radial?: { centre: [number, number]; fade: [number, number] };
  /**
   * For open terrain tiles: fade toward the side edges (|x|) and the
   * front edge (+z). The back edge is left alone; it's the skyline.
   */
  tile?: { x: [number, number]; front: [number, number] };
};

/**
 * Swap three's fog chunks for one that also thickens with altitude.
 * Must run before the first material compiles. Scene.fog still supplies
 * the colour and a plain distance fade (near/far).
 */
export function installHeightFog(o: MistOptions) {
  const c = THREE.ShaderChunk;
  c.fog_pars_vertex = /* glsl */ `
#ifdef USE_FOG
  varying float vFogDepth;
  varying vec3 vFogWorld;
#endif`;
  c.fog_vertex = /* glsl */ `
#ifdef USE_FOG
  vFogDepth = - mvPosition.z;
  vec4 fogWorld = vec4( transformed, 1.0 );
  #ifdef USE_BATCHING
    fogWorld = batchingMatrix * fogWorld;
  #endif
  #ifdef USE_INSTANCING
    fogWorld = instanceMatrix * fogWorld;
  #endif
  vFogWorld = ( modelMatrix * fogWorld ).xyz;
#endif`;
  c.fog_pars_fragment = /* glsl */ `
#ifdef USE_FOG
  uniform vec3 fogColor;
  varying float vFogDepth;
  varying vec3 vFogWorld;
  uniform float fogNear;
  uniform float fogFar;
#endif`;
  const f = (n: number) => n.toFixed(2);
  const floor = o.floor > 0
    ? `heightFog = max( heightFog, 1.0 - smoothstep( ${f(o.floor * 0.25)}, ${f(o.floor)}, vFogWorld.y ) );`
    : '';
  const radial = o.radial
    ? `edgeFog = max( edgeFog, smoothstep( ${f(o.radial.fade[0])}, ${f(o.radial.fade[1])},
        length( vFogWorld.xz - vec2( ${f(o.radial.centre[0])}, ${f(o.radial.centre[1])} ) ) ) );`
    : '';
  const tile = o.tile
    ? `edgeFog = max( edgeFog, max(
        smoothstep( ${f(o.tile.x[0])}, ${f(o.tile.x[1])}, abs( vFogWorld.x ) ),
        smoothstep( ${f(o.tile.front[0])}, ${f(o.tile.front[1])}, vFogWorld.z ) ) );`
    : '';
  c.fog_fragment = /* glsl */ `
#ifdef USE_FOG
  float distFog = smoothstep( fogNear, fogFar, vFogDepth );
  // A long, soft gradient: thickest at the foot, thinning with height,
  // and denser the more of it you look through.
  float h = clamp( ( ${f(o.top)} - vFogWorld.y ) / ${f(o.top - o.bottom)}, 0.0, 1.0 );
  float heightFog = pow( h, 1.5 ) * ( 1.0 - exp( - vFogDepth * ${o.density.toFixed(5)} ) );
  heightFog = max( heightFog, pow( h, 2.2 ) );
  ${floor}
  float edgeFog = 0.0;
  ${radial}
  ${tile}
  gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, max( max( distFog, heightFog ), edgeFog ) );
#endif`;
}

/** A soft, lumpy puff drawn on a canvas. */
function puffTexture(seed: number) {
  const r = rng(seed);
  const size = 256;
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const g = cv.getContext('2d')!;
  for (let i = 0; i < 14; i++) {
    const x = size * (0.25 + r() * 0.5);
    const y = size * (0.35 + r() * 0.3);
    const rad = size * (0.12 + r() * 0.2);
    const grad = g.createRadialGradient(x, y, 0, x, y, rad);
    grad.addColorStop(0, 'rgba(255,255,255,0.35)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

type Band = {
  count: number;
  y: [number, number];
  x: [number, number];
  z: [number, number];
  size: [number, number];
  opacity: [number, number];
};

/** Drifting cloud sprites in horizontal bands. Call `update(dt)` each frame. */
export function makeMist(color: THREE.ColorRepresentation, bands: Band[], seed = 5) {
  const r = rng(seed);
  const textures = [0, 1, 2].map((i) => puffTexture(seed * 10 + i));
  const group = new THREE.Group();
  const drift: { s: THREE.Sprite; speed: number; x0: number; x1: number; alpha: number }[] = [];
  const pick = ([a, b]: [number, number]) => a + r() * (b - a);
  for (const band of bands) {
    for (let i = 0; i < band.count; i++) {
      const m = new THREE.SpriteMaterial({
        map: textures[i % textures.length],
        color,
        transparent: true,
        opacity: pick(band.opacity),
        depthWrite: false,
        fog: false,
      });
      const s = new THREE.Sprite(m);
      const w = pick(band.size);
      s.scale.set(w, w * 0.45, 1);
      s.position.set(pick(band.x), pick(band.y), pick(band.z));
      s.material.rotation = (r() - 0.5) * 0.2;
      s.renderOrder = 1;
      group.add(s);
      drift.push({ s, speed: 1.5 + r() * 3, x0: band.x[0], x1: band.x[1], alpha: m.opacity });
    }
  }
  return {
    group,
    update(dt: number) {
      for (const d of drift) {
        d.s.position.x += d.speed * dt;
        if (d.s.position.x > d.x1) d.s.position.x = d.x0;
        // Fade in and out at the ends of the band so wrapping never pops.
        const t = (d.s.position.x - d.x0) / (d.x1 - d.x0);
        const edge = THREE.MathUtils.smoothstep(t, 0, 0.15) * (1 - THREE.MathUtils.smoothstep(t, 0.85, 1));
        d.s.material.opacity = d.alpha * edge;
      }
    },
  };
}
