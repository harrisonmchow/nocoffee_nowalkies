import { DoubleSide, MeshStandardMaterial, type ColorRepresentation, type Texture } from 'three';
import { WORLD_ALL } from '../shaders/chunks';
import { SKY_KEYS, pickUniforms, type WorldUniforms } from '../systems/uniforms';

export type PropOptions = {
  color: ColorRepresentation;
  roughness?: number;
  metalness?: number;
  /** Collect snow on upward faces when the biome has snow (threejs-precipitation-surfaces). */
  snow?: boolean;
  emissive?: ColorRepresentation;
  /**
   * Leaf cards (threejs-procedural-vegetation): an alpha-cut leaf texture,
   * two-sided, fluttering from their roots (uv.y = 0 at the stalk), lit
   * through when the sun is behind them, and darker deep in the crown
   * (attribute aCrown, 0 inside and low to 1 at the crown's top and rim).
   */
  foliage?: { map: Texture; /** Lying still (fallen leaves): no flutter. */ still?: boolean };
};

const PROP_KEYS = [...SKY_KEYS, 'uSnowCover', 'uSnowColor', 'uKeyColor'] as const;

/**
 * Three's standard material with the world's haze, cloud and grade, so props
 * sit in the same light and atmosphere as the terrain. Works with InstancedMesh.
 */
export function createPropMaterial(uniforms: WorldUniforms, starLayers: number, options: PropOptions) {
  const material = new MeshStandardMaterial({
    color: options.color,
    roughness: options.roughness ?? 0.85,
    metalness: options.metalness ?? 0,
    emissive: options.emissive ?? 0x000000,
  });
  const snow = options.snow ? 1 : 0;
  const foliage = options.foliage ? (options.foliage.still ? 2 : 1) : 0;
  if (options.foliage) {
    material.map = options.foliage.map;
    material.alphaTest = 0.5;
    material.side = DoubleSide;
  }
  material.defines = { STAR_LAYERS: starLayers, SNOW_COVER: snow, FOLIAGE: foliage };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, pickUniforms(uniforms, PROP_KEYS));
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vWorldPos;
#if FOLIAGE > 0
uniform float uTime;
uniform vec2 uWind;
attribute float aCrown;
varying float vCrown;
#endif`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
#if FOLIAGE > 0
vCrown = aCrown;
#endif
#if FOLIAGE == 1
// Flutter from the root: three rates, out of step leaf to leaf and tree to tree.
vec3 fAt = position;
#ifdef USE_INSTANCING
fAt += instanceMatrix[3].xyz;
#endif
float fPhase = 6.2831 * fract(sin(dot(fAt.xz * 0.37 + fAt.y, vec2(12.9898, 78.233))) * 43758.5453);
float fWave = 0.5 * sin(uTime * 1.7 + fPhase) + 0.3 * sin(uTime * 3.4 + 1.3 * fPhase) + 0.2 * sin(uTime * 7.1 + 1.5 * fPhase);
vec2 fWind = normalize(uWind + vec2(1e-4, 0.0));
transformed += vec3(fWind.x, 0.35, fWind.y) * fWave * uv.y * 0.07;
#endif`,
      )
      .replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
vec4 pWorld = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
pWorld = instanceMatrix * pWorld;
#endif
vWorldPos = (modelMatrix * pWorld).xyz;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
${WORLD_ALL}
uniform float uSnowCover;
uniform vec3 uSnowColor;
uniform vec3 uKeyColor;
varying vec3 vWorldPos;
#if FOLIAGE > 0
varying float vCrown;
#endif`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
#if FOLIAGE > 0
// Deep in the crown and low down, in its own shade; its top and rim catch the light.
diffuseColor.rgb *= mix(0.5, 1.15, vCrown);
#endif`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
#if SNOW_COVER == 1
vec3 pUp = inverseTransformDirection(normal, viewMatrix);
float pSnow = smoothstep(0.45, 0.85, pUp.y) * uSnowCover;
pSnow *= smoothstep(0.3, 0.6, texture(tNoise, vWorldPos.xz * 0.37).r + 0.2);
diffuseColor.rgb = mix(diffuseColor.rgb, uSnowColor, pSnow);
roughnessFactor = mix(roughnessFactor, 0.7, pSnow);
#endif`,
      )
      .replace(
        '#include <opaque_fragment>',
        `#include <opaque_fragment>
#if FOLIAGE > 0
// Looking toward the sun through the leaves, they glow.
float fBack = pow(max(dot(normalize(vWorldPos - cameraPosition), normalize(uKeyDir)), 0.0), 3.0);
gl_FragColor.rgb += diffuseColor.rgb * uKeyColor * 0.55 * fBack * (0.4 + 0.6 * vCrown);
#endif
gl_FragColor.rgb = wCloudFog(wHaze(gl_FragColor.rgb, vWorldPos), vWorldPos);`,
      )
      .replace('#include <tonemapping_fragment>', '#include <tonemapping_fragment>\ngl_FragColor.rgb = wGrade(gl_FragColor.rgb);');
  };
  material.customProgramCacheKey = () => `world-prop-${starLayers}-${snow}-${foliage}`;
  return material;
}
