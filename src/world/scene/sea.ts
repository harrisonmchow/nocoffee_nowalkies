// Mikey's sea (threejs-water-optics, the authored analytic surface). One list
// of directional waves, travelling in to the beach, gives the surface its
// normal and its crest metric in the same evaluation; finer ripple bands add
// to the normal only, each faded out before its wavelength is down to a few
// pixels. The optics, in order:
//  - Fresnel from the air side (water's index 1.333), between the sky's own
//    radiance in the reflected direction and the transmitted body;
//  - the body: the sand bed at its true depth (sea level less the terrain's
//    heightmap) seen through the water along the refracted path, absorbed
//    per channel, plus what the water scatters back;
//  - the sun's glitter path from the same normals, and foam where the crest
//    metric runs high (sharper where waves shoal and break near the beach).
// Decisions and limits: the sea is normal-only (a flat plane that follows the
// camera); the nearest water is about 100 m from the campsite camera, where
// 0.3 m crests wouldn't silhouette, so there's no geometric displacement or
// crest parallax at any tier. The bed is shaded analytically from the
// heightmap, not refracted scene colour. Crest foam is instantaneous, with no
// persistent build-up. The swash on the beach is the terrain's (uSwash).
import { Mesh, PlaneGeometry, ShaderMaterial } from 'three';
import { WORLD_ALL } from '../shaders/chunks';
import { SKY_KEYS, pickUniforms, type WorldUniforms } from '../systems/uniforms';

const SEA_KEYS = [...SKY_KEYS, 'uAmbient', 'uKeyColor', 'uSand', 'uSeaLevel', 'tHeight', 'uHeightBounds', 'uDebugView'] as const;

/** The waves: direction (toward the shore, +z), wavelength and amplitude in metres, and steepness. */
const WAVES = /* glsl */ `
const vec4 SEA_WAVES[4] = vec4[4](
  vec4(0.15, 0.989, 34.0, 0.32),
  vec4(-0.32, 0.947, 21.0, 0.17),
  vec4(0.48, 0.877, 12.5, 0.08),
  vec4(-0.08, 0.997, 7.2, 0.045)
);
const float SEA_STEEP[4] = float[4](0.55, 0.5, 0.45, 0.4);
const vec4 SEA_RIPPLES[3] = vec4[3](
  vec4(0.6, 0.8, 3.1, 0.07),
  vec4(-0.7, 0.71, 1.7, 0.035),
  vec4(0.2, 0.98, 0.9, 0.018)
);
`;

const FRAGMENT = /* glsl */ `
${WORLD_ALL}
${WAVES}
uniform vec3 uAmbient;
uniform vec3 uKeyColor;
uniform vec3 uSand;
uniform float uSeaLevel;
uniform sampler2D tHeight;
uniform vec4 uHeightBounds;
uniform float uDebugView;
varying vec3 vWorldPos;

void main() {
  vec2 xz = vWorldPos.xz;
  vec3 toFrag = vWorldPos - cameraPosition;
  float dist = length(toFrag);
  vec3 V = toFrag / max(dist, 1e-3);
  // The ground a pixel covers here, in metres (stretched where the view grazes the water).
  float footprint = dist * uPixelAngle / max(abs(V.y), 0.05);

  // True depth: sea level less the terrain under this point.
  float ground = texture(tHeight, (xz - uHeightBounds.xy) / uHeightBounds.z).r;
  float depth = max(uSeaLevel - ground, 0.0);
  // Waves shoal toward the beach: a little steeper in the shallows, then gone at the water's edge.
  float shoal = smoothstep(0.08, 2.5, depth) * (1.0 + 0.5 * (1.0 - smoothstep(0.8, 5.0, depth)));

  // The shared evaluation: one pass over the wave list for slope and crest.
  vec3 slope = vec3(0.0);
  float crest = 0.0;
  float swell = 0.0;
  for (int i = 0; i < 4; i++) {
    vec2 d = SEA_WAVES[i].xy;
    float k = 6.2831853 / SEA_WAVES[i].z;
    float a = SEA_WAVES[i].w * shoal;
    float w = sqrt(9.81 * k);
    float phase = k * dot(d, xz) - w * uTime;
    // Faded before the band is unresolved, so it never sparkles into noise.
    float keep = 1.0 - smoothstep(0.2, 1.4, footprint * k);
    float ka = k * a * keep;
    slope.x += d.x * ka * cos(phase);
    slope.z += d.y * ka * cos(phase);
    crest += SEA_STEEP[i] * ka * sin(phase);
    if (i == 0) swell = sin(phase);
  }
  for (int i = 0; i < 3; i++) {
    vec2 d = SEA_RIPPLES[i].xy;
    float k = 6.2831853 / SEA_RIPPLES[i].z;
    float a = SEA_RIPPLES[i].w * (0.3 + 0.7 * shoal);
    float phase = k * dot(d, xz) - sqrt(9.81 * k) * uTime + float(i) * 1.7;
    float keep = 1.0 - smoothstep(0.2, 1.4, footprint * k);
    slope.x += d.x * k * a * keep * cos(phase);
    slope.z += d.y * k * a * keep * cos(phase);
  }
  vec3 N = normalize(vec3(-slope.x, 1.0 - crest, -slope.z));
  vec3 toCamera = -V;
  float facing = abs(dot(N, toCamera));

  // Fresnel from the air side.
  float eta = 1.0 / 1.333;
  float f0 = pow((1.0 - eta) / (1.0 + eta), 2.0);
  float fresnel = f0 + (1.0 - f0) * pow(1.0 - facing, 5.0);

  // Reflection: the sky's own radiance along the reflected ray (kept above the horizon).
  vec3 R = reflect(V, N);
  R.y = max(R.y, 0.01);
  vec3 reflection = wSkyBase(normalize(R));

  // Transmission: the sand bed through the water along the refracted path, absorbed, plus the water's own scatter.
  vec3 T = refract(V, N, eta);
  float path = depth / max(abs(T.y), 0.15);
  vec3 transmit = exp(-vec3(0.42, 0.085, 0.055) * path);
  vec3 light = uAmbient * 1.6 + uKeyColor * max(uKeyDir.y, 0.0) * 0.8;
  vec3 bed = uSand * 0.55 * light;
  vec3 scatter = vec3(0.006, 0.05, 0.055) * (uAmbient * 2.2 + uKeyColor * 0.5);
  vec3 body = bed * transmit + scatter * (1.0 - transmit);

  vec3 col = mix(body, reflection, fresnel);

  // The sun's glitter path.
  vec3 H = normalize(normalize(uSunDir) + toCamera);
  col += uSunColor * pow(max(dot(N, H), 0.0), 600.0) * 14.0 * (1.0 - smoothstep(4.0, 40.0, footprint));

  // Foam: where the crest metric runs high, and along the line where waves break on the shallows.
  float breakers = smoothstep(0.35, 0.95, swell) * (1.0 - smoothstep(0.6, 2.2, depth)) * smoothstep(0.05, 0.25, depth);
  float noise = texture(tNoise, xz / 9.0 + uTime * vec2(0.004, 0.012)).r;
  float foam = smoothstep(0.55, 1.0, (crest * 2.2 + breakers) * (0.55 + 0.7 * noise));
  vec3 foamLit = vec3(0.85) * (uAmbient * 1.5 + uKeyColor * 0.7);
  col = mix(col, foamLit, foam * 0.85);

  // Debug: 10 the crest metric, 11 depth, 12 Fresnel.
  if (uDebugView > 9.5) {
    // (crest gained up: swells this gentle peak around 0.03)
    vec3 dbg = uDebugView < 10.5 ? vec3(clamp(crest * 12.0, 0.0, 1.0), clamp(breakers, 0.0, 1.0), 0.0)
      : uDebugView < 11.5 ? vec3(fract(depth / 5.0), clamp(depth / 30.0, 0.0, 1.0), 0.3)
      : vec3(fresnel);
    gl_FragColor = vec4(dbg, 1.0);
    return;
  }

  col = wCloudFog(wHaze(col, vWorldPos), vWorldPos);
  // The last metre or so of depth fades out, so the beach shows through and the waterline is soft (and clear of the terrain mesh's own steps).
  gl_FragColor = vec4(col, smoothstep(0.0, 1.2, depth));
  #include <tonemapping_fragment>
  gl_FragColor.rgb = wGrade(gl_FragColor.rgb);
  #include <colorspace_fragment>
}
`;

/** The sea: a flat plane at sea level, 30 km across, kept centred under the camera. */
export function createSea(uniforms: WorldUniforms, starLayers: number) {
  const material = new ShaderMaterial({
    name: 'world-sea',
    uniforms: pickUniforms(uniforms, SEA_KEYS),
    defines: { STAR_LAYERS: starLayers },
    vertexShader: 'uniform float uSeaLevel; varying vec3 vWorldPos; void main() { vec4 w = modelMatrix * vec4(position, 1.0); w.y = uSeaLevel; vWorldPos = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: FRAGMENT,
    transparent: true,
  });
  const mesh = new Mesh(new PlaneGeometry(30000, 30000).rotateX(-Math.PI / 2), material);
  mesh.name = 'sea';
  mesh.frustumCulled = false;
  return {
    mesh,
    dispose() {
      mesh.geometry.dispose();
      material.dispose();
    },
  };
}
