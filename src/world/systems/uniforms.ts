import { Color, Vector2, Vector3, Vector4, type Texture } from 'three';

/**
 * One set of uniform objects shared by reference across every world material,
 * so writing a value once updates them all. The names match
 * shaders/chunks.ts and the material-specific declarations.
 */
export function createWorldUniforms() {
  const texture = (): { value: Texture | null } => ({ value: null });
  return {
    uTime: { value: 0 },
    uResolution: { value: new Vector2(1, 1) },
    uPixelAngle: { value: 0.0008 },

    uSkyZenith: { value: new Color() },
    uSkyHorizon: { value: new Color() },
    uSkyGround: { value: new Color() },
    uSkySharpness: { value: 0.5 },
    uSunDir: { value: new Vector3(0, 1, 0) },
    uSunColor: { value: new Color() },
    uSunDisc: { value: 0.01 },
    uSunDiscGain: { value: 0 },
    uSunGlow: { value: 0 },
    uStars: { value: 0 },
    uMilkyWay: { value: 0 },
    // The Milky Way crosses the northern sky, where the camps look, rising
    // from its core low in the north-west up toward the north-east.
    uGalPole: { value: new Vector3(0.3417, -0.8657, -0.3658).normalize() },
    uGalCore: { value: new Vector3(-0.6412, 0.0698, -0.7642).normalize() },
    uAurora: { value: 0 },
    uAuroraYaw: { value: 0 },
    tAurora: texture(),
    tNoise: texture(),

    uHazeDensity: { value: 0.0001 },
    uHazeFalloff: { value: 0.001 },
    uHazeBase: { value: 0 },
    uHazeCap: { value: 0.9 },

    uLift: { value: new Vector3(0, 0, 0) },
    uGamma: { value: new Vector3(1, 1, 1) },
    uGain: { value: new Vector3(1, 1, 1) },
    uSaturation: { value: 1 },
    uLimbo: { value: 0 },
    uPaper: { value: 1 },
    uPaperColor: { value: new Color('#f7f6f3') },

    uSnowline: { value: 0 },
    uSnowFeather: { value: 100 },
    uSnowSlope: { value: new Vector2(0.4, 0.7) },
    uSnowColor: { value: new Color() },
    uRockA: { value: new Color() },
    uRockB: { value: new Color() },
    uGround: { value: new Color() },
    uGround2: { value: new Color() },
    uGroundMix: { value: 0 },
    uSand: { value: new Color() },
    uSandAmount: { value: 0 },
    uSeaLevel: { value: -1000 },
    uStrata: { value: 0 },
    uForest: { value: 0 },
    uForestFloor: { value: 0 },
    uTreeline: { value: 0 },
    uForestColor: { value: new Color() },
    uForestColor2: { value: new Color() },
    uForestClear: { value: 0 },
    uForestCover: { value: 0 },
    uForestCrowns: { value: 0 },
    uSwash: { value: 0 },
    uDebugView: { value: 0 },

    uCloudHeight: { value: 1000 },
    uCloudThickness: { value: 80 },
    uCloudBase: { value: 0 },
    uCloudCoverage: { value: 0.5 },
    uCloudSoftness: { value: 0.25 },
    uCloudOpacity: { value: 1 },
    uCloudLit: { value: new Color() },
    uCloudShadow: { value: new Color() },
    uCloudRim: { value: 0 },
    uCloudScale: { value: 1 },
    uPuffOpacity: { value: 0.85 },
    uWind: { value: new Vector2(1.5, 0.6) },
    uPointerInfluence: { value: 1 },
    /** The landscape's foreground cloud (scene/foreground-clouds.ts), 0 to 1, from the biome. */
    uForeground: { value: 0 },
    /** The camera's right and forward directions on the ground, for the cursor's push. */
    uCamRight: { value: new Vector2(1, 0) },
    uCamForward: { value: new Vector2(0, -1) },
    tPointer: texture(),
    tHeight: texture(),
    /** Heightmap bounds: min x, min z, size, unused. */
    uHeightBounds: { value: new Vector4(-5000, -5000, 10000, 0) },

    uSnowCover: { value: 0 },
    uFireGain: { value: 1 },
    uTentGlow: { value: 0 },

    // The scene's two lights as uniforms, for unlit shaders (ice, sea).
    uAmbient: { value: new Color() },
    uKeyColor: { value: new Color() },
    uKeyDir: { value: new Vector3(0, 1, 0) },
  };
}

export type WorldUniforms = ReturnType<typeof createWorldUniforms>;

/** The subset of the bag a material needs, by name, still shared by reference. */
export function pickUniforms<K extends keyof WorldUniforms>(uniforms: WorldUniforms, keys: readonly K[]) {
  const out = {} as Pick<WorldUniforms, K>;
  keys.forEach((key) => (out[key] = uniforms[key]));
  return out;
}

export const SKY_KEYS = [
  'uTime', 'uResolution', 'uPixelAngle',
  'uSkyZenith', 'uSkyHorizon', 'uSkyGround', 'uSkySharpness',
  'uSunDir', 'uSunColor', 'uSunDisc', 'uSunDiscGain', 'uSunGlow',
  'uStars', 'uMilkyWay', 'uGalPole', 'uGalCore', 'uAurora', 'uAuroraYaw', 'tAurora', 'tNoise',
  'uHazeDensity', 'uHazeFalloff', 'uHazeBase', 'uHazeCap',
  'uLift', 'uGamma', 'uGain', 'uSaturation', 'uLimbo', 'uPaper', 'uPaperColor',
  // The cloud layer (WORLD_CLOUD): its field, light and the cursor's push.
  'uCloudHeight', 'uCloudThickness', 'uCloudBase', 'uCloudCoverage', 'uCloudSoftness', 'uCloudOpacity',
  'uCloudLit', 'uCloudShadow', 'uCloudRim', 'uCloudScale', 'uWind', 'uKeyDir',
  'tPointer', 'uPointerInfluence', 'uCamRight', 'uCamForward',
] as const satisfies readonly (keyof WorldUniforms)[];
