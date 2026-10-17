// Art direction for each camp, as numbers the Director can blend. Colours are
// linear HDR, before tone mapping. Camps are imagined moods, not real trips.
import type { DirectionalLight, HemisphereLight, WebGLRenderer } from 'three';
import type { BiomeId } from '../../data/biomes';
import type { WorldUniforms } from '../systems/uniforms';

export type V3 = [number, number, number];

export type BiomeParams = {
  skyZenith: V3; skyHorizon: V3; skyGround: V3; skySharpness: number;
  sunDir: V3; sunColor: V3; sunDisc: number; sunDiscGain: number; sunGlow: number;
  stars: number; milkyWay: number; aurora: number; auroraYaw: number;
  hazeDensity: number; hazeFalloff: number; hazeBase: number; hazeCap: number;
  lightDir: V3; lightColor: V3; lightIntensity: number;
  hemiSky: V3; hemiGround: V3; hemiIntensity: number;
  exposure: number;
  lift: V3; gamma: V3; gain: V3; saturation: number;
  snowline: number; snowFeather: number; snowSlopeMin: number; snowSlopeMax: number;
  snowColor: V3; rockA: V3; rockB: V3; ground: V3; ground2: V3; groundMix: number;
  sand: V3; sandAmount: number; seaLevel: number; strata: number;
  /** How high each wave runs up the beach above sea level, in metres (0: no swash). */
  swash: number;
  /** Forest painted on the ground between a floor and the treeline (absolute metres), seen from afar. */
  forest: number; forestFloor: number; treeline: number; forestColor: V3;
  /** A second canopy colour the first breaks into in patches (autumn's mix), and a clearing of this radius around the camp (0 for none). */
  forestColor2: V3; forestClear: number;
  /** How much of the ground the canopy covers: added to the woodland field before its threshold (0 as before; more fills the ridges in). */
  forestCover: number;
  /** Paint the canopy as separate tree crowns from afar (0 off, 1 on). */
  forestCrowns: number;
  cloudHeight: number; cloudThickness: number; cloudBase: number; cloudCoverage: number; cloudSoftness: number; cloudOpacity: number;
  cloudLit: V3; cloudShadow: V3; cloudRim: number; cloudScale: number;
  /** The drifting puffs, separately from the layer, so a clear sky can still have mist. */
  puffOpacity: number;
  pointerInfluence: number;
  /** Cloud close in front of the landscape view, which the cursor parts (0 for none). */
  foreground: number;
  fire: number; tentGlow: number; snowCover: number;
};

export type PresetId = BiomeId | 'limbo';

const norm = (v: V3): V3 => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};

// Between tabs: the site's paper and charcoal, as in the reference's grey limbo.
const limbo: BiomeParams = {
  skyZenith: [0.78, 0.78, 0.76], skyHorizon: [0.9, 0.89, 0.86], skyGround: [0.86, 0.85, 0.82], skySharpness: 0.7,
  sunDir: norm([0.2, 0.8, -0.4]), sunColor: [1, 1, 1], sunDisc: 0.01, sunDiscGain: 0, sunGlow: 0,
  stars: 0, milkyWay: 0, aurora: 0, auroraYaw: 0,
  hazeDensity: 0.00045, hazeFalloff: 0.0008, hazeBase: 0, hazeCap: 0.95,
  lightDir: norm([0.25, 0.85, 0.35]), lightColor: [1, 0.99, 0.97], lightIntensity: 1.1,
  hemiSky: [1, 1, 0.98], hemiGround: [0.6, 0.6, 0.58], hemiIntensity: 0.9,
  exposure: 1.05,
  lift: [0, 0, 0], gamma: [1, 1, 1], gain: [1, 1, 1], saturation: 0,
  snowline: 1e5, snowFeather: 100, snowSlopeMin: 0.4, snowSlopeMax: 0.7,
  snowColor: [0.8, 0.8, 0.78], rockA: [0.07, 0.075, 0.08], rockB: [0.12, 0.12, 0.125],
  ground: [0.16, 0.16, 0.16], ground2: [0.2, 0.2, 0.2], groundMix: 0,
  sand: [0.5, 0.49, 0.47], sandAmount: 0, seaLevel: -1000, strata: 0, swash: 0,
  forest: 0, forestFloor: 0, treeline: 0, forestColor: [0.1, 0.1, 0.1],
  forestColor2: [0.1, 0.1, 0.1], forestClear: 0, forestCover: 0, forestCrowns: 0,
  cloudHeight: 1700, cloudThickness: 80, cloudBase: 0, cloudCoverage: 1, cloudSoftness: 0.35, cloudOpacity: 1,
  cloudLit: [1.05, 1.04, 1.01], cloudShadow: [0.62, 0.62, 0.6], cloudRim: 0, cloudScale: 1, puffOpacity: 0.85,
  pointerInfluence: 1, foreground: 0,
  fire: 0, tentGlow: 0, snowCover: 0,
};

// Harry: blue hour on a snowy col above a sea of cloud, aurora overhead.
const alpineAurora: BiomeParams = {
  skyZenith: [0.003, 0.007, 0.022], skyHorizon: [0.025, 0.045, 0.085], skyGround: [0.015, 0.025, 0.045], skySharpness: 0.55,
  sunDir: norm([0.3, -0.25, -0.9]), sunColor: [0.3, 0.45, 0.8], sunDisc: 0.01, sunDiscGain: 0, sunGlow: 0.6,
  stars: 0.55, milkyWay: 0.25, aurora: 1.0, auroraYaw: 0,
  hazeDensity: 0.00011, hazeFalloff: 0.0011, hazeBase: 600, hazeCap: 0.85,
  lightDir: norm([-0.2, 0.75, -0.6]), lightColor: [0.45, 0.6, 0.95], lightIntensity: 0.22,
  hemiSky: [0.11, 0.2, 0.24], hemiGround: [0.03, 0.04, 0.07], hemiIntensity: 0.55,
  exposure: 1.9,
  lift: [0, 0.004, 0.012], gamma: [1, 1, 1], gain: [1, 1, 1.04], saturation: 1.15,
  snowline: 300, snowFeather: 120, snowSlopeMin: 0.42, snowSlopeMax: 0.72,
  snowColor: [0.78, 0.82, 0.92], rockA: [0.03, 0.035, 0.045], rockB: [0.08, 0.085, 0.095],
  ground: [0.05, 0.045, 0.04], ground2: [0.07, 0.06, 0.05], groundMix: 0.3,
  sand: [0.3, 0.28, 0.25], sandAmount: 0, seaLevel: -1000, strata: 0.15, swash: 0,
  forest: 0, forestFloor: 0, treeline: 0, forestColor: [0.02, 0.035, 0.03],
  forestColor2: [0.02, 0.035, 0.03], forestClear: 0, forestCover: 0, forestCrowns: 0,
  cloudHeight: 1150, cloudThickness: 400, cloudBase: 0.62, cloudCoverage: 0.5, cloudSoftness: 0.36, cloudOpacity: 0.97,
  cloudLit: [0.22, 0.5, 0.44], cloudShadow: [0.02, 0.04, 0.09], cloudRim: 0.4, cloudScale: 1, puffOpacity: 0.85,
  // The cursor parts the cloud close in front of the view instead; the cloud sea beyond stays put.
  pointerInfluence: 0, foreground: 1,
  fire: 1, tentGlow: 1, snowCover: 1,
};

// Kevin: a clear winter night in a cirque, a frozen lake, the Milky Way and a moon.
const rockiesNight: BiomeParams = {
  skyZenith: [0.0015, 0.003, 0.009], skyHorizon: [0.012, 0.02, 0.04], skyGround: [0.008, 0.012, 0.02], skySharpness: 0.5,
  sunDir: norm([0.498, 0.342, -0.797]), sunColor: [0.7, 0.78, 1.0], sunDisc: 0.0095, sunDiscGain: 2.5, sunGlow: 0.18,
  stars: 1.3, milkyWay: 1.0, aurora: 0, auroraYaw: 0,
  hazeDensity: 0.00005, hazeFalloff: 0.0012, hazeBase: 300, hazeCap: 0.7,
  lightDir: norm([-0.35, 0.6, 0.72]), lightColor: [0.55, 0.65, 0.95], lightIntensity: 0.35,
  hemiSky: [0.05, 0.07, 0.15], hemiGround: [0.02, 0.022, 0.03], hemiIntensity: 0.5,
  exposure: 1.8,
  lift: [0, 0.003, 0.01], gamma: [1, 1, 1], gain: [1, 1, 1.03], saturation: 1.1,
  snowline: 0, snowFeather: 60, snowSlopeMin: 0.34, snowSlopeMax: 0.6,
  snowColor: [0.74, 0.79, 0.9], rockA: [0.05, 0.05, 0.055], rockB: [0.14, 0.13, 0.12],
  ground: [0.06, 0.055, 0.05], ground2: [0.05, 0.06, 0.05], groundMix: 0.2,
  sand: [0.3, 0.28, 0.25], sandAmount: 0, seaLevel: -1000, strata: 0.85, swash: 0,
  forest: 0.9, forestFloor: 414, treeline: 830, forestColor: [0.018, 0.03, 0.026],
  forestColor2: [0.018, 0.03, 0.026], forestClear: 0, forestCover: 0, forestCrowns: 0,
  cloudHeight: 400, cloudThickness: 0, cloudBase: 0, cloudCoverage: 0.5, cloudSoftness: 0.3, cloudOpacity: 0,
  cloudLit: [0.16, 0.2, 0.3], cloudShadow: [0.015, 0.02, 0.04], cloudRim: 0.2, cloudScale: 1.2, puffOpacity: 0.35,
  pointerInfluence: 1, foreground: 0,
  fire: 1, tentGlow: 1, snowCover: 1,
};

// Caleb: late afternoon in a valley of Japanese maples. A low golden sun from
// ahead and to the right (so the leaves glow), warm haze lying in the valley,
// cool blue shade, and the canopy breaking between reds and ambers.
const mapleAutumn: BiomeParams = {
  skyZenith: [0.15, 0.3, 0.66], skyHorizon: [0.92, 0.66, 0.42], skyGround: [0.3, 0.2, 0.13], skySharpness: 0.5,
  sunDir: norm([0.7, 0.13, -0.5]), sunColor: [1.7, 1.1, 0.62], sunDisc: 0.012, sunDiscGain: 9, sunGlow: 1.2,
  stars: 0, milkyWay: 0, aurora: 0, auroraYaw: 0,
  hazeDensity: 0.0001, hazeFalloff: 0.005, hazeBase: 290, hazeCap: 0.7,
  lightDir: norm([0.7, 0.22, -0.5]), lightColor: [1.0, 0.7, 0.42], lightIntensity: 2.5,
  hemiSky: [0.42, 0.56, 0.86], hemiGround: [0.3, 0.15, 0.07], hemiIntensity: 0.55,
  exposure: 1.0,
  lift: [0, 0.005, 0.016], gamma: [1, 1, 1], gain: [1.05, 0.99, 0.93], saturation: 1.22,
  snowline: 1500, snowFeather: 150, snowSlopeMin: 0.4, snowSlopeMax: 0.7,
  snowColor: [0.9, 0.88, 0.86], rockA: [0.06, 0.075, 0.045], rockB: [0.15, 0.165, 0.11],
  ground: [0.06, 0.065, 0.03], ground2: [0.36, 0.09, 0.025], groundMix: 0.9,
  sand: [0.4, 0.35, 0.28], sandAmount: 0, seaLevel: -1000, strata: 0, swash: 0,
  forest: 0.92, forestFloor: 260, treeline: 1150, forestColor: [0.36, 0.05, 0.015],
  forestColor2: [0.5, 0.17, 0.02], forestClear: 130, forestCover: 0.6, forestCrowns: 1,
  cloudHeight: 1350, cloudThickness: 80, cloudBase: 0, cloudCoverage: 0.22, cloudSoftness: 0.3, cloudOpacity: 0.7,
  cloudLit: [1.5, 1.2, 0.95], cloudShadow: [0.5, 0.42, 0.42], cloudRim: 0.7, cloudScale: 1, puffOpacity: 0.32,
  pointerInfluence: 1, foreground: 0,
  fire: 0.7, tentGlow: 0, snowCover: 0,
};

// Mikey: sunset on a beach, the sun low over the sea ahead. Gold and rose
// highlights over teal-blue shade, the sand warm where the light reaches it.
const coastSunset: BiomeParams = {
  skyZenith: [0.06, 0.07, 0.26], skyHorizon: [1.55, 0.66, 0.28], skyGround: [0.3, 0.2, 0.2], skySharpness: 0.5,
  sunDir: norm([0.12, 0.05, -1]), sunColor: [2.4, 1.2, 0.55], sunDisc: 0.014, sunDiscGain: 7, sunGlow: 1.6,
  stars: 0, milkyWay: 0, aurora: 0, auroraYaw: 0,
  hazeDensity: 0.00011, hazeFalloff: 0.003, hazeBase: 0, hazeCap: 0.72,
  lightDir: norm([0.12, 0.16, -1]), lightColor: [1.0, 0.6, 0.32], lightIntensity: 2.6,
  hemiSky: [0.26, 0.32, 0.56], hemiGround: [0.36, 0.23, 0.13], hemiIntensity: 0.8,
  exposure: 1.0,
  lift: [0, 0.01, 0.024], gamma: [1, 1, 1], gain: [1.08, 0.98, 0.9], saturation: 1.25,
  snowline: 1e5, snowFeather: 100, snowSlopeMin: 0.4, snowSlopeMax: 0.7,
  snowColor: [0.9, 0.9, 0.9], rockA: [0.15, 0.12, 0.1], rockB: [0.3, 0.24, 0.18],
  ground: [0.22, 0.25, 0.1], ground2: [0.3, 0.3, 0.12], groundMix: 0.4,
  sand: [0.62, 0.5, 0.35], sandAmount: 1, seaLevel: 0, strata: 0.3, swash: 0.6,
  forest: 0.5, forestFloor: 30, treeline: 400, forestColor: [0.06, 0.08, 0.04],
  forestColor2: [0.06, 0.08, 0.04], forestClear: 0, forestCover: 0, forestCrowns: 0,
  cloudHeight: 1800, cloudThickness: 120, cloudBase: 0, cloudCoverage: 0.24, cloudSoftness: 0.3, cloudOpacity: 0.8,
  cloudLit: [1.8, 0.85, 0.55], cloudShadow: [0.28, 0.2, 0.36], cloudRim: 1.0, cloudScale: 1.7, puffOpacity: 0.55,
  pointerInfluence: 1, foreground: 0,
  fire: 0.6, tentGlow: 0.15, snowCover: 0,
};

export const PRESETS: Record<PresetId, BiomeParams> = {
  limbo,
  'alpine-aurora': alpineAurora,
  'rockies-night': rockiesNight,
  'maple-autumn': mapleAutumn,
  'coast-sunset': coastSunset,
};

const DIRECTIONS = new Set<keyof BiomeParams>(['sunDir', 'lightDir']);

export const cloneParams = (p: BiomeParams): BiomeParams => structuredClone(p);

/** What a camp keeps in limbo: where its clouds stand and how its ground is masked. Only the colour drains. */
const SHAPES = [
  'cloudHeight', 'cloudThickness', 'cloudBase', 'cloudCoverage', 'cloudSoftness', 'cloudScale', 'cloudOpacity', 'puffOpacity',
  'snowline', 'snowFeather', 'snowSlopeMin', 'snowSlopeMax', 'sandAmount', 'seaLevel', 'strata', 'forest', 'forestFloor', 'treeline',
] as const satisfies readonly (keyof BiomeParams)[];

/** The grey limbo palette over a camp's own shapes, written to `out`: a clay model of the camp. */
export function limboOf(p: BiomeParams, out: BiomeParams): BiomeParams {
  lerpParams(limbo, limbo, 1, out);
  for (const key of SHAPES) out[key] = p[key];
  return out;
}

/** Blend two parameter sets into `out`. Directions are renormalised. */
export function lerpParams(a: BiomeParams, b: BiomeParams, t: number, out: BiomeParams): BiomeParams {
  for (const key of Object.keys(a) as (keyof BiomeParams)[]) {
    const va = a[key];
    const vb = b[key];
    if (typeof va === 'number') {
      (out[key] as number) = va + ((vb as number) - va) * t;
    } else {
      const o = out[key] as V3;
      const w = vb as V3;
      for (let i = 0; i < 3; i++) o[i] = va[i] + (w[i] - va[i]) * t;
      if (DIRECTIONS.has(key)) {
        const l = Math.hypot(o[0], o[1], o[2]) || 1;
        o[0] /= l;
        o[1] /= l;
        o[2] /= l;
      }
    }
  }
  return out;
}

/** Write a parameter set to the shared uniforms, the two scene lights and the renderer. */
export function applyParams(
  p: BiomeParams,
  u: WorldUniforms,
  lights: { sun: DirectionalLight; hemi: HemisphereLight },
  renderer: WebGLRenderer,
) {
  u.uSkyZenith.value.setRGB(...p.skyZenith);
  u.uSkyHorizon.value.setRGB(...p.skyHorizon);
  u.uSkyGround.value.setRGB(...p.skyGround);
  u.uSkySharpness.value = p.skySharpness;
  u.uSunDir.value.set(...p.sunDir);
  u.uSunColor.value.setRGB(...p.sunColor);
  u.uSunDisc.value = p.sunDisc;
  u.uSunDiscGain.value = p.sunDiscGain;
  u.uSunGlow.value = p.sunGlow;
  u.uStars.value = p.stars;
  u.uMilkyWay.value = p.milkyWay;
  u.uAurora.value = p.aurora;
  u.uAuroraYaw.value = p.auroraYaw;
  u.uHazeDensity.value = p.hazeDensity;
  u.uHazeFalloff.value = p.hazeFalloff;
  u.uHazeBase.value = p.hazeBase;
  u.uHazeCap.value = p.hazeCap;
  u.uLift.value.set(...p.lift);
  u.uGamma.value.set(...p.gamma);
  u.uGain.value.set(...p.gain);
  u.uSaturation.value = p.saturation;
  u.uSnowline.value = p.snowline;
  u.uSnowFeather.value = p.snowFeather;
  u.uSnowSlope.value.set(p.snowSlopeMin, p.snowSlopeMax);
  u.uSnowColor.value.setRGB(...p.snowColor);
  u.uRockA.value.setRGB(...p.rockA);
  u.uRockB.value.setRGB(...p.rockB);
  u.uGround.value.setRGB(...p.ground);
  u.uGround2.value.setRGB(...p.ground2);
  u.uGroundMix.value = p.groundMix;
  u.uSand.value.setRGB(...p.sand);
  u.uSandAmount.value = p.sandAmount;
  u.uSeaLevel.value = p.seaLevel;
  u.uSwash.value = p.swash;
  u.uStrata.value = p.strata;
  u.uForest.value = p.forest;
  u.uForestFloor.value = p.forestFloor;
  u.uTreeline.value = p.treeline;
  u.uForestColor.value.setRGB(...p.forestColor);
  u.uForestColor2.value.setRGB(...p.forestColor2);
  u.uForestClear.value = p.forestClear;
  u.uForestCover.value = p.forestCover;
  u.uForestCrowns.value = p.forestCrowns;
  u.uCloudHeight.value = p.cloudHeight;
  u.uCloudThickness.value = p.cloudThickness;
  u.uCloudBase.value = p.cloudBase;
  u.uCloudCoverage.value = p.cloudCoverage;
  u.uCloudSoftness.value = p.cloudSoftness;
  u.uCloudOpacity.value = p.cloudOpacity;
  u.uCloudLit.value.setRGB(...p.cloudLit);
  u.uCloudShadow.value.setRGB(...p.cloudShadow);
  u.uCloudRim.value = p.cloudRim;
  u.uCloudScale.value = p.cloudScale;
  u.uPuffOpacity.value = p.puffOpacity;
  u.uPointerInfluence.value = p.pointerInfluence;
  u.uForeground.value = p.foreground;
  u.uFireGain.value = p.fire;
  u.uTentGlow.value = p.tentGlow;
  u.uSnowCover.value = p.snowCover;

  u.uAmbient.value.setRGB(...p.hemiSky).multiplyScalar(p.hemiIntensity);
  u.uKeyColor.value.setRGB(...p.lightColor).multiplyScalar(p.lightIntensity);
  u.uKeyDir.value.set(...p.lightDir);

  lights.sun.position.set(...p.lightDir).multiplyScalar(1000);
  lights.sun.color.setRGB(...p.lightColor);
  lights.sun.intensity = p.lightIntensity;
  lights.hemi.color.setRGB(...p.hemiSky);
  lights.hemi.groundColor.setRGB(...p.hemiGround);
  lights.hemi.intensity = p.hemiIntensity;
  renderer.toneMappingExposure = p.exposure;
}
