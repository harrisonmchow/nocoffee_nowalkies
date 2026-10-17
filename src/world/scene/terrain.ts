// The terrain surface: three's standard PBR material with the biome's field
// masks injected (threejs-procedural-fields: one field bundle drives albedo,
// roughness and normals). Height, slope and the tile's cavity/ridge fields
// decide snow, rock, ground and sand.
import { BufferAttribute, BufferGeometry, Mesh, MeshStandardMaterial, Sphere, Vector3 } from 'three';
import { WORLD_ALL } from '../shaders/chunks';
import { SKY_KEYS, pickUniforms, type WorldUniforms } from '../systems/uniforms';
import type { TileData } from './terrain-tile';

const TERRAIN_KEYS = [
  ...SKY_KEYS,
  'uSnowline', 'uSnowFeather', 'uSnowSlope', 'uSnowColor', 'uRockA', 'uRockB',
  'uGround', 'uGround2', 'uGroundMix', 'uSand', 'uSandAmount', 'uSeaLevel', 'uSwash', 'uStrata', 'uDebugView',
  'uForest', 'uForestFloor', 'uTreeline', 'uForestColor', 'uForestColor2', 'uForestClear', 'uForestCover', 'uForestCrowns',
] as const;

/** Debug views for ?view= and the debug panel. */
export const TERRAIN_VIEWS = ['final', 'height', 'slope', 'snow', 'rock', 'cavity', 'ridge', 'albedo'] as const;
export type TerrainView = (typeof TERRAIN_VIEWS)[number];

const FRAGMENT_HEAD = /* glsl */ `
uniform float uSnowline;
uniform float uSnowFeather;
uniform vec2 uSnowSlope;
uniform vec3 uSnowColor;
uniform vec3 uRockA;
uniform vec3 uRockB;
uniform vec3 uGround;
uniform vec3 uGround2;
uniform float uGroundMix;
uniform vec3 uSand;
uniform float uSandAmount;
uniform float uSeaLevel;
uniform float uSwash;
uniform float uStrata;
uniform float uForest;
uniform float uForestFloor;
uniform float uTreeline;
uniform vec3 uForestColor;
uniform vec3 uForestColor2;
uniform float uForestClear;
uniform float uForestCover;
uniform float uForestCrowns;
uniform float uDebugView;
varying vec3 vField;
varying vec3 vWorldPos;
varying vec3 vWorldNormal;
`;

// Replaces map_fragment: works out the masks once, for albedo, roughness and normal.
const SURFACE = /* glsl */ `
vec3 tN = normalize(vWorldNormal);
float tSlope = 1.0 - tN.y;
float tHeight = vWorldPos.y;
vec2 tXZ = vWorldPos.xz;
float tDist = distance(vWorldPos, cameraPosition);
float tNear = 1.0 - smoothstep(90.0, 700.0, tDist);

// The noise texture tiles, and from a landscape's distance its 190 m and 41 m
// repeats would show as a pattern. So each of those octaves sums two lookups
// at unrelated scales and angles, which never line up again, stretched back
// to the contrast of one.
const mat2 tTurn = mat2(0.799, 0.602, -0.602, 0.799);
vec4 tN0 = texture(tNoise, tXZ / 1700.0 + 0.61);
vec4 tN1 = (texture(tNoise, tXZ / 190.0) + texture(tNoise, tTurn * tXZ / 263.0 + 0.31) - 1.0) * 0.71 + 0.5;
vec4 tN2 = (texture(tNoise, tXZ / 41.0) + texture(tNoise, tTurn * tXZ / 57.0 + 0.47) - 1.0) * 0.71 + 0.5;
vec4 tN3 = texture(tNoise, tXZ / 7.7);
float tBreak = (tN1.r - 0.5) * 0.6 + (tN2.g - 0.5) * 0.3 + (tN3.r - 0.5) * 0.12 * tNear;

float tStrata = sin(tHeight * 0.085 + tBreak * 7.0) * 0.5 + 0.5;
vec3 tRock = mix(uRockA, uRockB, clamp(tN2.r * 0.85 + (tStrata - 0.5) * uStrata, 0.0, 1.0));
vec3 tGround = mix(uGround, uGround2, clamp(vField.x * 1.5 + tN2.b * 0.9 - 0.25, 0.0, 1.0) * uGroundMix);

float tRockMask = smoothstep(0.34, 0.62, tSlope + vField.z * 0.35 + tBreak * 0.3);
float tSnowAlt = smoothstep(uSnowline - uSnowFeather, uSnowline + uSnowFeather, tHeight + tBreak * uSnowFeather * 2.0);
float tSnowSlope = 1.0 - smoothstep(uSnowSlope.x, uSnowSlope.y, tSlope - vField.x * 0.25 - vField.y * 0.15 + tBreak * 0.18);
float tSnow = tSnowAlt * tSnowSlope;
float tSandMask = (1.0 - smoothstep(uSeaLevel + 1.5, uSeaLevel + 8.0, tHeight + tBreak * 4.0)) * uSandAmount;

// Forest seen from afar: canopy, mostly unbroken, on the gentler slopes
// between the floor and the treeline. Its edges follow the ground: it holds
// to the hollows and gives out on the ridges, with clearings only in broad
// patches. Finer noise varies its tone, not its outline. Where the biome has
// snow, the canopy is frosted from afar and clumped with it up close. The
// instanced trees carry the silhouettes near the camp.
float tWood = 0.55 + uForestCover + vField.x * 0.5 - vField.z * 0.6 + (tN0.b - 0.5) * 0.6 + (tN1.g - 0.5) * 0.35;
float tForestMask = uForest
  * smoothstep(uForestFloor, uForestFloor + 25.0, tHeight)
  * smoothstep(uTreeline, uTreeline - 120.0, tHeight + tBreak * 60.0)
  * smoothstep(0.62, 0.35, tSlope)
  * smoothstep(0.36, 0.5, tWood);
// The camp's own clearing, where a biome asks for one.
if (uForestClear > 0.0) tForestMask *= smoothstep(uForestClear * 0.6, uForestClear, length(tXZ));
// The canopy breaks between two colours in broad patches (one tree's worth and up).
// (the second colour takes the smaller share)
float tHue = smoothstep(0.48, 0.7, tN1.b * 0.65 + tN2.g * 0.45 + (tN0.r - 0.5) * 0.4);
vec3 tForest = mix(uForestColor, uForestColor2, tHue) * (0.75 + 0.5 * tN2.r) * (0.8 + 0.4 * tN3.r);

// Crowns, where a biome asks for them: a cell per tree (a jittered grid, the
// nearest of nine), shaded as a dome, lit on top and dark in the gaps, each
// tree its own colour from the pair with the broad patches as a bias. They
// fade out before a crown is down to a couple of pixels, so they never shimmer.
float tCrownDome = 0.0;
vec2 tCrownTilt = vec2(0.0);
float tCrownShow = 0.0;
if (uForestCrowns > 0.0) {
  vec2 cell = tXZ / 6.5;
  vec2 cellBase = floor(cell);
  float best = 9.0;
  vec2 toCrown = vec2(0.0);
  float crownId = 0.0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 c = cellBase + vec2(float(i), float(j));
      vec2 h = fract(sin(vec2(dot(c, vec2(127.1, 311.7)), dot(c, vec2(269.5, 183.3)))) * 43758.5453);
      vec2 d = c + 0.15 + 0.7 * h - cell;
      float dd = dot(d, d);
      if (dd < best) { best = dd; toCrown = d; crownId = fract(h.x * 7.3 + h.y); }
    }
  }
  tCrownShow = uForestCrowns * (1.0 - smoothstep(1.0, 2.6, tDist * uPixelAngle));
  tCrownDome = sqrt(max(0.0, 1.0 - best * 1.8));
  tCrownTilt = -toCrown * (1.0 - tCrownDome) * 1.2;
  vec3 own = mix(uForestColor, uForestColor2, step(0.72 - 0.45 * tHue, crownId)) * (0.8 + 0.4 * fract(crownId * 13.7));
  tForest = mix(tForest, own * (0.66 + 0.45 * tCrownDome), tCrownShow);
}
float tFrost = tSnow * (0.12 + 0.2 * step(0.72, tN3.g) * tNear);

vec3 tAlbedo = mix(tGround, tRock, tRockMask);
tAlbedo = mix(tAlbedo, uSand, tSandMask * (1.0 - tRockMask));
tAlbedo = mix(tAlbedo, uSnowColor, tSnow);
tAlbedo = mix(tAlbedo, mix(tForest, uSnowColor, tFrost), tForestMask);
tAlbedo *= 0.86 + 0.28 * mix(0.5, tN3.g, tNear);

float tRough = mix(mix(mix(0.92, 0.8, tRockMask), 0.62, tSnow), 0.95, tForestMask);

// The swash, where a biome has a beach: each wave runs up the sand as a thin
// sheet and slides back, out of step along the shore, leaving the sand it
// reached dark and glossy, with a line of foam at its leading edge.
if (uSwash > 0.0) {
  float above = tHeight - uSeaLevel;
  float cycle = uTime * 0.42 + tN0.g * 6.2831 + tXZ.x * 0.012;
  float reach = uSwash * (0.3 + 0.7 * pow(0.5 + 0.5 * sin(cycle), 1.6));
  float film = 1.0 - smoothstep(reach - 0.04, reach + 0.01, above);
  float wet = (1.0 - smoothstep(uSwash * 0.85, uSwash * 1.3, above + tBreak * 0.2)) * (1.0 - tRockMask);
  float edge = smoothstep(reach - 0.09, reach - 0.015, above) * film;
  tAlbedo *= mix(1.0, 0.58, wet * (1.0 - film));
  tAlbedo = mix(tAlbedo, uSand * 0.32 + vec3(0.015, 0.04, 0.05), film * 0.7);
  tAlbedo = mix(tAlbedo, vec3(0.85), edge * smoothstep(0.3, 0.7, tN3.b));
  tRough = mix(tRough, 0.2, max(wet * 0.6, film));
}
diffuseColor.rgb = tAlbedo;

// Detail normal from the noise texture's slope, faded out before it aliases.
vec2 tUv = tXZ / 11.0;
float tE = 1.0 / 256.0;
float tH0 = texture(tNoise, tUv).r;
float tHx = texture(tNoise, tUv + vec2(tE, 0.0)).r;
float tHz = texture(tNoise, tUv + vec2(0.0, tE)).r;
vec3 tDetail = vec3(tH0 - tHx, 0.0, tH0 - tHz) * mix(2.2, 0.9, tSnow) * tNear;
// Wind-packed snow close to the camera: sastrugi, low ridges running with the wind.
float tClose = (1.0 - smoothstep(20.0, 110.0, tDist)) * tSnow * smoothstep(0.25, 0.05, tSlope);
vec2 tWindDir = normalize(uWind);
vec2 tAcrossDir = vec2(-tWindDir.y, tWindDir.x);
float tAcross = dot(tXZ, tAcrossDir) + texture(tNoise, tXZ / 61.0).g * 3.0;
vec3 tSastrugi = vec3(tAcrossDir.x, 0.0, tAcrossDir.y) * cos(tAcross * 2.3) * (0.5 + 0.5 * tN3.b) * 0.1 * tClose;
vec3 tNormalW = normalize(tN + tDetail + tSastrugi);
// Each crown a dome to the light.
tNormalW = normalize(tNormalW + vec3(tCrownTilt.x, 0.0, tCrownTilt.y) * tCrownShow * tForestMask);
`;

const DEBUG = /* glsl */ `
if (uDebugView > 0.5 && uDebugView < 7.5) {
  vec3 dbg = vec3(0.0);
  if (uDebugView < 1.5) dbg = vec3(fract(tHeight / 500.0), clamp(tHeight / 2500.0, 0.0, 1.0), 0.2);
  else if (uDebugView < 2.5) dbg = vec3(tSlope);
  else if (uDebugView < 3.5) dbg = vec3(tSnow);
  else if (uDebugView < 4.5) dbg = vec3(tRockMask);
  else if (uDebugView < 5.5) dbg = vec3(vField.x * 0.5 + 0.5, vField.y * 0.5 + 0.5, 0.5);
  else if (uDebugView < 6.5) dbg = vec3(vField.z * 0.5 + 0.5);
  else dbg = tAlbedo;
  gl_FragColor = vec4(dbg, 1.0);
}
if (uDebugView > 7.5) gl_FragColor = vec4(wCloudDebug(normalize(vWorldPos - cameraPosition), uDebugView), 1.0);
`;

export function createTerrainMaterial(uniforms: WorldUniforms, starLayers: number) {
  const material = new MeshStandardMaterial({ roughness: 0.9, metalness: 0 });
  material.defines = { STAR_LAYERS: starLayers };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, pickUniforms(uniforms, TERRAIN_KEYS));
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
attribute vec3 aField;
varying vec3 vField;
varying vec3 vWorldPos;
varying vec3 vWorldNormal;`,
      )
      .replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
vWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
vWorldNormal = normalize(mat3(modelMatrix) * objectNormal);
vField = aField;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${WORLD_ALL}\n${FRAGMENT_HEAD}`)
      .replace('#include <map_fragment>', SURFACE)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = tRough;')
      .replace('#include <normal_fragment_maps>', 'normal = normalize((viewMatrix * vec4(tNormalW, 0.0)).xyz);')
      .replace('#include <opaque_fragment>', '#include <opaque_fragment>\ngl_FragColor.rgb = wCloudFog(wHaze(gl_FragColor.rgb, vWorldPos), vWorldPos);')
      .replace('#include <tonemapping_fragment>', '#include <tonemapping_fragment>\ngl_FragColor.rgb = wGrade(gl_FragColor.rgb);')
      .replace('#include <colorspace_fragment>', `#include <colorspace_fragment>\n${DEBUG}`);
  };
  material.customProgramCacheKey = () => `world-terrain-${starLayers}`;
  return material;
}

export function createTerrainMesh(tile: TileData, material: MeshStandardMaterial) {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(tile.positions, 3));
  geometry.setAttribute('normal', new BufferAttribute(tile.normals, 3));
  geometry.setAttribute('aField', new BufferAttribute(tile.fields, 3));
  geometry.setIndex(new BufferAttribute(tile.indices, 1));
  geometry.boundingSphere = new Sphere(new Vector3(0, (tile.minHeight + tile.maxHeight) / 2, 0), tile.radius * 1.5);
  const mesh = new Mesh(geometry, material);
  mesh.name = 'terrain';
  mesh.matrixAutoUpdate = false;
  mesh.updateMatrix();
  return mesh;
}
