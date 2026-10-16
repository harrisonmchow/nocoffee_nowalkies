import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { BokehPass } from 'three/examples/jsm/postprocessing/BokehPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export type ProceduralModelOptions = {
  wireframe?: boolean;
  castShadow?: boolean;
  receiveShadow?: boolean;
  textureSize?: number;
  textureAnisotropy?: number;
  qualityPriority?: 'reference-fidelity' | 'balanced';
};

export type ProceduralModelRuntime = {
  nodes: Record<string, THREE.Object3D>;
  meshes: Record<string, THREE.Mesh>;
  sockets: Record<string, THREE.Object3D>;
  colliders: Record<string, unknown>;
  destructionGroups: Record<string, THREE.Object3D[]>;
};

type SculptMaterialSpec = Record<string, any>;

// bevelEnabled defaults to true on THREE.ExtrudeGeometry and rounds every
// corner — sharp/pointed profiles (blades, fork tines, spikes) need
// bevelEnabled: false plus lineTo()-only path segments near the tip, since a
// curve command cannot produce a true converging point.
function buildExtrudeShape(points: [number, number][], holes?: [number, number][][]): THREE.Shape {
  const shape = new THREE.Shape();
  if (points.length > 0) {
    shape.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i += 1) {
      shape.lineTo(points[i][0], points[i][1]);
    }
  }
  // Cutouts (e.g. an oval wire-cutter hole) as THREE.Path added to shape.holes —
  // dep-free boolean subtraction via the tessellator, no CSG library needed.
  for (const loop of holes ?? []) {
    if (loop.length < 3) continue;
    const path = new THREE.Path();
    path.moveTo(loop[0][0], loop[0][1]);
    for (let i = 1; i < loop.length; i += 1) path.lineTo(loop[i][0], loop[i][1]);
    path.closePath();
    shape.holes.push(path);
  }
  return shape;
}

// Build an N-gon oval loop (for hole authoring from a compact {cx,cy,rx,ry} descriptor).
function ovalLoop(cx: number, cy: number, rx: number, ry: number, seg = 24): [number, number][] {
  const loop: [number, number][] = [];
  for (let i = 0; i < seg; i += 1) {
    const a = (i / seg) * Math.PI * 2;
    loop.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
  }
  return loop;
}

function buildExtrudeGeometry(profile: { points: [number, number][]; depth: number; holes?: [number, number][][]; ovalHoles?: { cx: number; cy: number; rx: number; ry: number }[] }): THREE.ExtrudeGeometry {
  const holes = [...(profile.holes ?? []), ...((profile.ovalHoles ?? []).map((o) => ovalLoop(o.cx, o.cy, o.rx, o.ry)))];
  const shape = buildExtrudeShape(profile.points, holes);
  return new THREE.ExtrudeGeometry(shape, {
    depth: profile.depth,
    bevelEnabled: false,
    steps: 1,
  });
}

function buildTubeGeometry(
  path: { points: [number, number, number][]; radius?: number; radialSegments?: number; closed?: boolean },
): THREE.TubeGeometry {
  const vectors = path.points.map(([x, y, z]) => new THREE.Vector3(x, y, z));
  const curve = new THREE.CatmullRomCurve3(vectors, path.closed ?? false);
  const tubularSegments = Math.max(8, path.points.length * 6);
  return new THREE.TubeGeometry(curve, tubularSegments, path.radius ?? 0.05, path.radialSegments ?? 8, path.closed ?? false);
}

// Plan 1.3 F.6 — sweep a thin 2D cross-section along a 3D spine so a curved
// form (hooked blade, handle) reads correctly from EVERY camera angle, not just
// the reference angle a flat extrude happens to match. Uses ExtrudeGeometry's
// native extrudePath; bevelEnabled: false keeps sharp tips (same rule as F.5).
function buildCurveSweepGeometry(
  sweep: { spine: [number, number, number][]; crossSection: { points: [number, number][] }; closed?: boolean },
): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape();
  const cs = sweep.crossSection.points;
  if (cs.length > 0) {
    shape.moveTo(cs[0][0], cs[0][1]);
    for (let i = 1; i < cs.length; i += 1) shape.lineTo(cs[i][0], cs[i][1]);
    shape.closePath();
  }
  const spine = sweep.spine.map(([x, y, z]) => new THREE.Vector3(x, y, z));
  const path = new THREE.CatmullRomCurve3(spine, sweep.closed ?? false);
  return new THREE.ExtrudeGeometry(shape, {
    extrudePath: path,
    steps: Math.max(24, spine.length * 8),
    bevelEnabled: false,
  });
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function readLayerNumber(value: unknown, keys: string[], fallback: number): number {
  if (typeof value === 'number') return value;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    for (const key of keys) {
      if (typeof record[key] === 'number') return record[key] as number;
    }
  }
  return fallback;
}

function hexToRgb(hex: string): [number, number, number] {
  const normalized = /^#[0-9a-f]{3}$/i.test(hex)
    ? '#' + hex.slice(1).split('').map((part) => part + part).join('')
    : hex;
  const value = /^#[0-9a-f]{6}$/i.test(normalized) ? Number.parseInt(normalized.slice(1), 16) : 0x8a7a5f;
  return [clampAlbedoChannel((value >> 16) & 255), clampAlbedoChannel((value >> 8) & 255), clampAlbedoChannel(value & 255)];
}

function materialPalette(spec: SculptMaterialSpec): string[] {
  const palette = spec.colorVariation?.palette;
  if (Array.isArray(palette) && palette.length > 0) return palette.filter((value) => typeof value === 'string');
  const secondary = spec.albedo?.secondary;
  const colors = [spec.baseColor ?? spec.color ?? spec.albedo?.dominant, ...(Array.isArray(secondary) ? secondary : [])];
  return colors.filter((value): value is string => typeof value === 'string' && value.startsWith('#'));
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function clampAlbedoChannel(value: number): number {
  return Math.max(30, Math.min(240, Math.round(value)));
}

function clampPbrF0(value: number): number {
  return Math.max(0.02, Math.min(1, value));
}

function clampPbrIor(value: number): number {
  return Math.max(1, Math.min(2.5, value));
}

function clampPbrMetalness(value: number): number {
  return value >= 0.5 ? 1 : 0;
}

function clampedAlbedoColor(spec: SculptMaterialSpec): THREE.Color {
  const source = typeof spec.baseColor === 'string' ? spec.baseColor : '#8A7A5F';
  // setStyle with an explicit SRGBColorSpace, NOT the numeric constructor.
  //
  // `new THREE.Color(r, g, b)` treats its arguments as LINEAR working-space components,
  // while an authored `baseColor` hex is sRGB. Feeding one to the other skipped the
  // transfer function and lifted every dark albedo: #2e2a28, authored as a near-black
  // vinyl, rendered at roughly sRGB 0.46 — a mid grey. The error is largest exactly where
  // it matters most, because the transfer curve is steepest near black.
  return new THREE.Color().setStyle(source, THREE.SRGBColorSpace);
}

function smoothCurve(value: number): number {
  return value * value * (3 - 2 * value);
}

function periodicHash(x: number, y: number, seed: number, periodX: number, periodY: number): number {
  const wrappedX = ((x % periodX) + periodX) % periodX;
  const wrappedY = ((y % periodY) + periodY) % periodY;
  let value = Math.imul(wrappedX + seed * 17, 374761393) ^ Math.imul(wrappedY + seed * 31, 668265263);
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
}

function periodicValueNoise(u: number, v: number, seed: number, periodX: number, periodY: number): number {
  const x = u * periodX;
  const y = v * periodY;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = smoothCurve(x - x0);
  const ty = smoothCurve(y - y0);
  const a = periodicHash(x0, y0, seed, periodX, periodY);
  const b = periodicHash(x0 + 1, y0, seed, periodX, periodY);
  const c = periodicHash(x0, y0 + 1, seed, periodX, periodY);
  const d = periodicHash(x0 + 1, y0 + 1, seed, periodX, periodY);
  return THREE.MathUtils.lerp(THREE.MathUtils.lerp(a, b, tx), THREE.MathUtils.lerp(c, d, tx), ty);
}

type SurfaceBand = {
  frequency: number;
  amplitude: number;
  stretchX: number;
  stretchY: number;
  ridge: boolean;
};

function surfaceBands(spec: SculptMaterialSpec): SurfaceBand[] {
  const source = Array.isArray(spec.surfaceFrequencyBands) ? spec.surfaceFrequencyBands : [];
  const parsed = source.flatMap((item: unknown) => {
    if (!item || typeof item !== 'object') return [];
    const band = item as Record<string, unknown>;
    const frequency = typeof band.frequency === 'number' ? band.frequency : 0;
    const amplitude = typeof band.amplitude === 'number' ? band.amplitude : 0;
    if (frequency <= 0 || amplitude <= 0) return [];
    const stretch = Array.isArray(band.stretch) ? band.stretch : [1, 1];
    const description = `${String(band.pattern ?? '')} ${String(band.role ?? '')}`.toLowerCase();
    return [{
      frequency,
      amplitude,
      stretchX: typeof stretch[0] === 'number' ? Math.max(0.1, stretch[0]) : 1,
      stretchY: typeof stretch[1] === 'number' ? Math.max(0.1, stretch[1]) : 1,
      ridge: /(ridge|groove|grain|fiber|striated|crack)/.test(description),
    }];
  });
  return parsed.length > 0 ? parsed : [
    { frequency: 2, amplitude: 0.42, stretchX: 1, stretchY: 1, ridge: false },
    { frequency: 12, amplitude: 0.22, stretchX: 1, stretchY: 1, ridge: false },
    { frequency: 56, amplitude: 0.08, stretchX: 1, stretchY: 1, ridge: false },
  ];
}

function sampleSurface(u: number, v: number, bands: SurfaceBand[], seed: number): number {
  let value = 0;
  let weight = 0;
  for (let index = 0; index < bands.length; index += 1) {
    const band = bands[index];
    const periodX = Math.max(1, Math.round(band.frequency * band.stretchX));
    const periodY = Math.max(1, Math.round(band.frequency * band.stretchY));
    let sample = periodicValueNoise(u, v, seed + index * 1013, periodX, periodY);
    if (band.ridge) sample = 1 - Math.abs(sample * 2 - 1);
    value += sample * band.amplitude;
    weight += band.amplitude;
  }
  return weight > 0 ? clamp01(value / weight) : 0.5;
}

function mixPalette(colors: [number, number, number][], value: number): [number, number, number] {
  if (colors.length === 1) return colors[0];
  const scaled = clamp01(value) * (colors.length - 1);
  const index = Math.min(colors.length - 2, Math.floor(scaled));
  const mix = scaled - index;
  const a = colors[index];
  const b = colors[index + 1];
  return [
    Math.round(THREE.MathUtils.lerp(a[0], b[0], mix)),
    Math.round(THREE.MathUtils.lerp(a[1], b[1], mix)),
    Math.round(THREE.MathUtils.lerp(a[2], b[2], mix)),
  ];
}

type ColorGradientStop = { offset: number; color: string };
type ColorGradientSpec = {
  type: 'linear' | 'radial';
  axis: [number, number];
  stops: ColorGradientStop[];
};

function parseRgba(value: string): [number, number, number] {
  const match = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(value);
  if (!match) return [138, 122, 95];
  return [clampAlbedoChannel(Number(match[1])), clampAlbedoChannel(Number(match[2])), clampAlbedoChannel(Number(match[3]))];
}

// Analytical per-pixel gradient sample. The extraction schema's colorGradient carries
// exact rgba(...) stop colors (see extract_part_color_recipe.py), so this samples the
// same trend directly in JS math rather than round-tripping through a Canvas 2D
// createLinearGradient/createRadialGradient object — same visual result, and it composes
// directly with the existing noise/height-correlated colorVariation blend below.
function sampleColorGradient(gradient: ColorGradientSpec, u: number, v: number): [number, number, number] {
  const stops = gradient.stops.length >= 2 ? gradient.stops : [{ offset: 0, color: 'rgba(138,122,95,1)' }, { offset: 1, color: 'rgba(138,122,95,1)' }];
  let t: number;
  if (gradient.type === 'radial') {
    const [cx, cy] = gradient.axis;
    const dx = u - cx;
    const dy = v - cy;
    const maxRadius = Math.max(0.001, Math.hypot(Math.max(cx, 1 - cx), Math.max(cy, 1 - cy)));
    t = clamp01(Math.hypot(dx, dy) / maxRadius);
  } else {
    const [ax, ay] = gradient.axis;
    const projection = (u - 0.5) * ax + (v - 0.5) * ay;
    const maxProjection = 0.5 * (Math.abs(ax) + Math.abs(ay)) || 0.5;
    t = clamp01(projection / maxProjection + 0.5);
  }
  const scaled = t * (stops.length - 1);
  const index = Math.min(stops.length - 2, Math.max(0, Math.floor(scaled)));
  const mix = scaled - index;
  const a = parseRgba(stops[index].color);
  const b = parseRgba(stops[index + 1].color);
  return [
    THREE.MathUtils.lerp(a[0], b[0], mix),
    THREE.MathUtils.lerp(a[1], b[1], mix),
    THREE.MathUtils.lerp(a[2], b[2], mix),
  ];
}

function writePixel(data: Uint8ClampedArray, offset: number, red: number, green: number, blue: number): void {
  data[offset] = Math.max(0, Math.min(255, Math.round(red)));
  data[offset + 1] = Math.max(0, Math.min(255, Math.round(green)));
  data[offset + 2] = Math.max(0, Math.min(255, Math.round(blue)));
  data[offset + 3] = 255;
}

function makeCanvas(size: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  return canvas;
}

function createMapTexture(
  canvas: HTMLCanvasElement,
  colorSpace: THREE.ColorSpace,
  spec: SculptMaterialSpec,
  options: ProceduralModelOptions,
): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas);
  const projection = spec.textureProjection && typeof spec.textureProjection === 'object' ? spec.textureProjection : {};
  const repeat = Array.isArray(projection.repeat) ? projection.repeat : [2, 2];
  texture.colorSpace = colorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(
    typeof repeat[0] === 'number' ? repeat[0] : 2,
    typeof repeat[1] === 'number' ? repeat[1] : 2,
  );
  texture.anisotropy = Math.max(1, Math.round(options.textureAnisotropy ?? projection.anisotropy ?? 8));
  texture.needsUpdate = true;
  return texture;
}

type ProceduralTextureSet = {
  albedo: THREE.Texture;
  roughness: THREE.Texture;
  height: THREE.Texture;
  normal: THREE.Texture;
  ao: THREE.Texture;
  source: 'reference-pixel-extraction' | 'procedural';
};

function referenceMapUrl(spec: SculptMaterialSpec, channel: string): string | null {
  const reference = spec.referencePbr;
  if (!reference || typeof reference !== 'object') return null;
  if (reference.usable === false) return null;
  const confidence = typeof reference.confidence === 'number'
    ? reference.confidence
    : (typeof reference.estimatedFidelity === 'number' ? reference.estimatedFidelity : 0);
  const threshold = typeof reference.targetThreshold === 'number' ? reference.targetThreshold : 0.7;
  if (confidence < threshold) return null;
  const maps = reference.maps;
  if (!maps || typeof maps !== 'object') return null;
  const map = (maps as Record<string, unknown>)[channel];
  if (!map || typeof map !== 'object') return null;
  const record = map as Record<string, unknown>;
  const url = typeof record.url === 'string' && record.url.trim() ? record.url : record.path;
  return typeof url === 'string' && url.trim() ? url : null;
}

function createLoadedMapTexture(
  url: string,
  colorSpace: THREE.ColorSpace,
  spec: SculptMaterialSpec,
  options: ProceduralModelOptions,
): THREE.Texture {
  const texture = new THREE.TextureLoader().load(url);
  const projection = spec.textureProjection && typeof spec.textureProjection === 'object' ? spec.textureProjection : {};
  const repeat = Array.isArray(projection.repeat) ? projection.repeat : [1, 1];
  texture.colorSpace = colorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(
    typeof repeat[0] === 'number' ? repeat[0] : 1,
    typeof repeat[1] === 'number' ? repeat[1] : 1,
  );
  texture.anisotropy = Math.max(1, Math.round(options.textureAnisotropy ?? projection.anisotropy ?? 8));
  texture.needsUpdate = true;
  return texture;
}

function makeReferenceTextureSet(spec: SculptMaterialSpec, options: ProceduralModelOptions): ProceduralTextureSet | null {
  const albedo = referenceMapUrl(spec, 'albedo');
  const roughness = referenceMapUrl(spec, 'roughness');
  const height = referenceMapUrl(spec, 'height');
  const normal = referenceMapUrl(spec, 'normal');
  const ao = referenceMapUrl(spec, 'ao');
  if (!albedo || !roughness || !height || !normal || !ao) return null;
  return {
    albedo: createLoadedMapTexture(albedo, THREE.SRGBColorSpace, spec, options),
    roughness: createLoadedMapTexture(roughness, THREE.NoColorSpace, spec, options),
    height: createLoadedMapTexture(height, THREE.NoColorSpace, spec, options),
    normal: createLoadedMapTexture(normal, THREE.NoColorSpace, spec, options),
    ao: createLoadedMapTexture(ao, THREE.NoColorSpace, spec, options),
    source: 'reference-pixel-extraction',
  };
}

function makeProceduralTextureSet(
  id: string,
  spec: SculptMaterialSpec,
  options: ProceduralModelOptions,
): ProceduralTextureSet | null {
  if (typeof document === 'undefined') return null;
  const qualityFirst = (options.qualityPriority ?? 'reference-fidelity') === 'reference-fidelity';
  const requested = options.textureSize ?? spec.textureResolution;
  const requestedSize = typeof requested === 'number' && Number.isFinite(requested)
    ? requested
    : (qualityFirst ? 1024 : 512);
  const size = Math.max(256, Math.min(2048, 2 ** Math.round(Math.log2(requestedSize))));
  const canvases = {
    albedo: makeCanvas(size),
    roughness: makeCanvas(size),
    height: makeCanvas(size),
    normal: makeCanvas(size),
    ao: makeCanvas(size),
  };
  const contexts = {
    albedo: canvases.albedo.getContext('2d'),
    roughness: canvases.roughness.getContext('2d'),
    height: canvases.height.getContext('2d'),
    normal: canvases.normal.getContext('2d'),
    ao: canvases.ao.getContext('2d'),
  };
  if (!contexts.albedo || !contexts.roughness || !contexts.height || !contexts.normal || !contexts.ao) return null;
  const images = {
    albedo: contexts.albedo.createImageData(size, size),
    roughness: contexts.roughness.createImageData(size, size),
    height: contexts.height.createImageData(size, size),
    normal: contexts.normal.createImageData(size, size),
    ao: contexts.ao.createImageData(size, size),
  };
  const seed = hashString(id);
  const bands = surfaceBands(spec);
  const heightField = new Float32Array(size * size);
  const roughnessField = new Float32Array(size * size);
  const palette = materialPalette(spec);
  const fallback = typeof spec.baseColor === 'string' ? spec.baseColor : '#8A7A5F';
  const colors = (palette.length >= 2 ? palette : [fallback, '#6E614B', '#A08F70']).map(hexToRgb);
  const baseRoughness = clamp01(readLayerNumber(spec.roughness, ['base'], 0.76));
  const roughnessVariation = clamp01(readLayerNumber(spec.roughness, ['variation'], 0.18));
  const colorAmplitude = clamp01(readLayerNumber(spec.colorVariation, ['amplitude', 'variation'], 0.18));
  const heightCorrelation = clamp01(readLayerNumber(spec.colorVariation, ['heightCorrelation'], 0.3));
  const colorGradient: ColorGradientSpec | undefined = spec.colorGradient;
  for (let y = 0; y < size; y += 1) {
    const v = y / size;
    for (let x = 0; x < size; x += 1) {
      const u = x / size;
      const index = y * size + x;
      const height = sampleSurface(u, v, bands, seed + 101);
      const roughNoise = sampleSurface(u, v, bands, seed + 7001);
      const colorNoise = sampleSurface(u, v, bands, seed + 15013);
      heightField[index] = height;
      roughnessField[index] = clamp01(baseRoughness + (roughNoise - 0.5) * roughnessVariation * 2);
      let color: [number, number, number];
      if (colorGradient) {
        // Evidence-derived spatial gradient (Plan 1.3 Workstream C) takes priority
        // over the noise-based palette blend below — it is a measured trend, not a guess.
        color = sampleColorGradient(colorGradient, u, v);
      } else {
        const paletteValue = clamp01(
          0.5 + (colorNoise - 0.5) * colorAmplitude * 2 + (height - 0.5) * heightCorrelation
        );
        color = mixPalette(colors, paletteValue);
      }
      writePixel(images.albedo.data, index * 4, color[0], color[1], color[2]);
    }
  }
  const normalStrength = Math.max(0.05, readLayerNumber(spec.normal, ['strength', 'amplitude'], 0.35));
  const aoStrength = clamp01(readLayerNumber(spec.ambientOcclusion, ['cavityStrength', 'strength'], 0.35));
  for (let y = 0; y < size; y += 1) {
    const up = ((y - 1 + size) % size) * size;
    const down = ((y + 1) % size) * size;
    for (let x = 0; x < size; x += 1) {
      const left = (x - 1 + size) % size;
      const right = (x + 1) % size;
      const index = y * size + x;
      const center = heightField[index];
      const dx = (heightField[y * size + right] - heightField[y * size + left]) * normalStrength * 6;
      const dy = (heightField[down + x] - heightField[up + x]) * normalStrength * 6;
      const inverseLength = 1 / Math.sqrt(dx * dx + dy * dy + 1);
      const normalX = -dx * inverseLength;
      const normalY = -dy * inverseLength;
      const normalZ = inverseLength;
      const neighborAverage = (
        heightField[y * size + left] + heightField[y * size + right]
        + heightField[up + x] + heightField[down + x]
      ) * 0.25;
      const cavity = Math.max(0, neighborAverage - center);
      const ao = clamp01(1 - aoStrength * (cavity * 12 + (1 - center) * 0.16));
      const offset = index * 4;
      const heightByte = center * 255;
      const roughnessByte = roughnessField[index] * 255;
      writePixel(images.height.data, offset, heightByte, heightByte, heightByte);
      writePixel(images.roughness.data, offset, roughnessByte, roughnessByte, roughnessByte);
      writePixel(
        images.normal.data, offset,
        (normalX * 0.5 + 0.5) * 255,
        (normalY * 0.5 + 0.5) * 255,
        (normalZ * 0.5 + 0.5) * 255,
      );
      writePixel(images.ao.data, offset, ao * 255, ao * 255, ao * 255);
    }
  }
  contexts.albedo.putImageData(images.albedo, 0, 0);
  contexts.roughness.putImageData(images.roughness, 0, 0);
  contexts.height.putImageData(images.height, 0, 0);
  contexts.normal.putImageData(images.normal, 0, 0);
  contexts.ao.putImageData(images.ao, 0, 0);
  return {
    albedo: createMapTexture(canvases.albedo, THREE.SRGBColorSpace, spec, options),
    roughness: createMapTexture(canvases.roughness, THREE.NoColorSpace, spec, options),
    height: createMapTexture(canvases.height, THREE.NoColorSpace, spec, options),
    normal: createMapTexture(canvases.normal, THREE.NoColorSpace, spec, options),
    ao: createMapTexture(canvases.ao, THREE.NoColorSpace, spec, options),
    source: 'procedural',
  };
}

function createSculptMaterial(id: string, spec: SculptMaterialSpec, options: ProceduralModelOptions, denseComponent = false): THREE.MeshPhysicalMaterial {
  // A material that declares -- with evidence -- that its subject carries no texture
  // detail gets NO texture set. Synthesising one anyway is not a harmless default: the
  // branch below then forces color to white and roughness to 1 and reads both from the
  // generated maps, so the authored albedo and the reference-derived roughness are both
  // discarded, and the model gains mottling the reference does not have. Measured on the
  // tuxedo cat, whose black fur rendered as speckled grey-and-white from a palette that
  // only ever described two flat regions.
  const textureless = (spec.textureless as { declared?: boolean } | undefined)?.declared === true;
  const textures = textureless
    ? null
    : makeReferenceTextureSet(spec, options) ?? makeProceduralTextureSet(id, spec, options);
  const material = new THREE.MeshPhysicalMaterial({
    color: textures ? 0xffffff : clampedAlbedoColor(spec),
    roughness: textures ? 1 : clamp01(readLayerNumber(spec.roughness, ['base'], 0.76)),
    metalness: clampPbrMetalness(readLayerNumber(spec.metalness, ['base'], 0.0)),
    clearcoat: clamp01(readLayerNumber(spec.clearcoat, ['base', 'amount'], 0)),
    clearcoatRoughness: clamp01(readLayerNumber(spec.clearcoatRoughness, ['base'], 0.25)),
    transmission: clamp01(readLayerNumber(spec.transmission, ['base', 'amount'], 0)),
    ior: clampPbrIor(readLayerNumber(spec.ior, ['base', 'value'], 1.5)),
    thickness: Math.max(0, readLayerNumber(spec.thickness, ['base', 'amount'], 0)),
    attenuationDistance: Math.max(0.001, readLayerNumber(spec.attenuationDistance, ['base', 'value'], Infinity)),
    attenuationColor: new THREE.Color(typeof spec.attenuationColor === 'string' ? spec.attenuationColor : '#ffffff'),
    sheen: clamp01(readLayerNumber(spec.sheen, ['base', 'amount'], 0)),
    sheenColor: new THREE.Color(typeof spec.sheenColor === 'string' ? spec.sheenColor : '#ffffff'),
    sheenRoughness: clamp01(readLayerNumber(spec.sheenRoughness, ['base'], 1.0)),
    iridescence: clamp01(readLayerNumber(spec.iridescence, ['base', 'amount'], 0)),
    iridescenceIOR: clampPbrIor(readLayerNumber(spec.iridescenceIOR, ['base', 'value'], 1.3)),
    anisotropy: clamp01(readLayerNumber(spec.anisotropy, ['base', 'amount'], 0)),
    anisotropyRotation: readLayerNumber(spec.anisotropy, ['rotation'], 0),
    specularIntensity: clampPbrF0(readLayerNumber(spec.specularF0 ?? spec.f0 ?? spec.specularIntensity, ['base', 'value'], 1.0)),
    specularColor: new THREE.Color(typeof spec.specularColor === 'string' ? spec.specularColor : '#ffffff'),
    emissive: new THREE.Color(typeof spec.emissive === 'string' ? spec.emissive : '#000000'),
    emissiveIntensity: Math.max(0, readLayerNumber(spec.emissiveIntensity, ['base'], 1.0)),
    opacity: clamp01(readLayerNumber(spec.opacity, ['base'], 1)),
    transparent: readLayerNumber(spec.transmission, ['base', 'amount'], 0) > 0 || readLayerNumber(spec.opacity, ['base'], 1) < 1,
    alphaTest: Math.max(0, readLayerNumber(spec.alpha, ['cutoff', 'alphaTest'], 0)),
    wireframe: options.wireframe ?? false,
    side: spec.doubleSided === true ? THREE.DoubleSide : THREE.FrontSide,
    flatShading: spec.flatShading === true,
  });
  if (textures) {
    material.map = textures.albedo;
    material.roughnessMap = textures.roughness;
    material.normalMap = textures.normal;
    material.normalScale.setScalar(Math.max(0.05, readLayerNumber(spec.normal, ['strength', 'amplitude'], 0.35)));
    material.aoMap = textures.ao;
    material.aoMap.channel = 0;
    material.aoMapIntensity = readLayerNumber(spec.ambientOcclusion, ['cavityStrength', 'strength'], 0.35);
    const denseMesh = denseComponent || spec.denseMesh === true || spec.geometryDensity === 'dense' || spec.topologyClass === 'dense';
    const bumpScale = Math.max(0, readLayerNumber(spec.bump, ['amplitude', 'strength'], 0));
    const effectiveBumpScale = denseMesh ? Math.max(0.05, bumpScale) : bumpScale;
    if (effectiveBumpScale > 0) {
      material.bumpMap = textures.height;
      material.bumpScale = effectiveBumpScale;
    }
    const displacementScale = Math.max(0, readLayerNumber(spec.displacement, ['amplitude', 'strength'], 0));
    const effectiveDisplacementScale = denseMesh ? Math.max(0.005, displacementScale) : displacementScale;
    if (effectiveDisplacementScale > 0) {
      material.displacementMap = textures.height;
      material.displacementScale = effectiveDisplacementScale;
      material.displacementBias = -effectiveDisplacementScale * 0.5;
    }
  }
  material.envMapIntensity = readLayerNumber(spec, ['envMapIntensity'], 0.8);
  material.userData.sculptMaterial = spec;
  material.userData.proceduralMapsIndependent = true;
  material.userData.pbrConstraints = { albedoRange: [30, 240], binaryMetalness: true, f0Range: [0.02, 1], iorRange: [1, 2.5] };
  material.userData.pbrTextureSource = textures?.source ?? 'flat-fallback';
  material.userData.referencePbr = spec.referencePbr ?? null;
  material.userData.referenceMaterialId = spec.referenceMaterialId ?? spec.materialReference?.profileId ?? null;
  material.userData.materialEvidence = spec.materialEvidence ?? null;
  material.userData.validationViews = spec.materialReference?.validationViews ?? [];
  material.needsUpdate = true;
  return material;
}

type AttachmentEndpoint = {
  start: THREE.Vector3;
  midpoint: THREE.Vector3;
  quaternion: THREE.Quaternion;
  length: number;
  baseRadius: number;
  endRadius: number;
};

function readVector3(value: unknown, fallback: [number, number, number]): THREE.Vector3 {
  if (Array.isArray(value) && value.length === 3 && value.every((item) => typeof item === 'number')) {
    return new THREE.Vector3(value[0], value[1], value[2]);
  }
  return new THREE.Vector3(fallback[0], fallback[1], fallback[2]);
}

function readNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function makeAttachmentEndpoint(attachment: unknown): AttachmentEndpoint | null {
  if (!attachment || typeof attachment !== 'object') return null;
  const record = attachment as Record<string, unknown>;
  const start = readVector3(record.localStart, [0, 0, 0]);
  const end = readVector3(record.localEnd, [0, 1, 0]);
  const delta = end.clone().sub(start);
  const length = delta.length();
  if (length <= 0.0001) return null;
  const direction = delta.clone().normalize();
  const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
  const baseRadius = Math.max(0.005, readNumber(record.baseRadius, 0.06));
  const endRadius = Math.max(0.003, readNumber(record.endRadius, baseRadius * 0.55));
  return {
    start,
    midpoint: delta.multiplyScalar(0.5),
    quaternion,
    length,
    baseRadius,
    endRadius,
  };
}

// Generated from ObjectSculptSpec target: Tent
// Sculpt build pass: form-refinement
// This factory is intentionally pass-gated. Finish browser screenshot review before unlocking deeper passes.
export function createTentModel(options: ProceduralModelOptions = {}): THREE.Group {
  const root = new THREE.Group();
  root.name = "Tent";
  root.userData.reconstructionEvidence = {"itemFamily": null, "subtype": null, "componentAdapter": null, "route": null, "exactnessTier": null, "referenceCamera": {"solved": false, "fovDegrees": 45.0, "aspect": 1.0, "orientation": {"yaw": 0.0, "pitch": 0.0, "roll": 0.0}, "positionHint": [-1.3, 1.6, 4.3], "note": "Approximate: camera ~4.5 m from the door face, ~1.6 m eye height, yawed ~18 deg toward -X, FOV ~45 (phone main lens). Not solved; review render matches it by hand."}, "approximationNotes": []};
  root.userData.materialPipeline = {};
  root.userData.materialReferenceRegistry = null;

  const materialMap: Record<string, THREE.Material> = {};
  materialMap["fly-nylon"] = createSculptMaterial(
    "fly-nylon",
    {"id": "fly-nylon", "name": "fly ripstop nylon", "type": "standard", "shaderModel": "MeshStandardMaterial (runtime contract: scene drives emissive + opacity)", "baseColor": "#97a698", "color": "#97a698", "albedo": {"dominant": "#97a698", "secondary": ["#8d9c8f", "#a3b1a3"], "samplingNotes": "de-lit (see material evidence)"}, "colorVariation": {"palette": ["#97a698", "#8d9c8f", "#a3b1a3"], "pattern": "mottled", "amplitude": 0.04, "heightCorrelation": 0.3}, "textureResolution": 1024, "textureProjection": {"mode": "uv", "repeat": [2.0, 2.0], "anisotropy": 8, "texelDensityIntent": "Preserve stable world/object-scale detail; do not stretch micro detail with component scale."}, "surfaceFrequencyBands": [{"id": "macro", "frequency": 1.5, "amplitude": 0.03, "role": "membrane sag between pinned pole lines (geometry)"}, {"id": "meso", "frequency": 14.0, "amplitude": 0.004, "role": "soft wrinkles, horizontal bias (geometry noise + normal map)"}, {"id": "micro", "frequency": 180.0, "amplitude": 0.002, "role": "ripstop grid ~5 mm (normal map only)"}], "roughness": {"base": 0.66, "variation": 0.12, "map": "independent-procedural-field", "localResponse": "higher roughness in cavities, lower roughness on worn edges"}, "metalness": {"base": 0.0, "variation": 0.0}, "normal": {"pattern": "generated canvas: ripstop grid + soft wrinkles (independent of albedo)", "strength": 0.25, "scale": 24.0, "space": "tangent"}, "bump": {"pattern": "none", "amplitude": 0.0, "scale": 1.0}, "displacement": {"pattern": "none", "amplitude": 0.0, "scale": 1.0, "silhouetteAffects": false}, "ambientOcclusion": {"cavityStrength": 0.25, "contactShadowBias": 0.35, "notes": "Darken creases, seams, intersections, and recessed local features."}, "wear": {"edgeWear": 0.0, "scratches": [], "chips": []}, "dirt": {"amount": 0.0, "cavityBias": 0.0, "color": "#2F2A22"}, "localOverrides": [{"id": "crease-sheen", "detailRef": "crease-sheen", "channel": "roughness", "value": 0.5, "region": "upper taut panels", "implementation": "roughnessMap from the same canvas as the normal map (independent channel)", "roughness": 0.28}], "shaderNotes": ["Prefer MeshPhysicalMaterial when clearcoat, sheen, transmission, or thin-surface response is observed; otherwise use MeshStandardMaterial-compatible PBR channels.", "Generate albedo, roughness, height/normal, and AO independently; never alias albedo into roughness.", "Use normal/bump/displacement only when they map to observed surface relief.", "Use displacement geometry when the observed relief changes the close-up silhouette; texture-only relief is insufficient there."], "notes": "Semi-matte silicone/PU-coated ripstop. Colour de-lit from dusk reference; sheen from roughness 0.62 + normal map.", "doubleSided": true, "referencePbr": {"usable": true, "confidence": 0.751, "source": "material-evidence/fly-pbr.json", "whiteBalance": "material-evidence/summary.json#whiteBalance", "maps": {"albedo": {"path": "material-evidence/fly/fly-nylon_albedo.png"}, "roughness": {"path": "material-evidence/fly/fly-nylon_roughness.png"}, "height": {"path": "material-evidence/fly/fly-nylon_height.png"}, "normal": {"path": "material-evidence/fly/fly-nylon_normal.png"}, "ao": {"path": "material-evidence/fly/fly-nylon_ao.png"}}, "use": "statistics only (roughness/normal strength); albedo palette rejected as blue-cast; runtime maps are generated in code"}},
    options
  );
  materialMap["aluminium"] = createSculptMaterial(
    "aluminium",
    {"id": "aluminium", "name": "pole aluminium", "type": "standard", "shaderModel": "MeshStandardMaterial (runtime contract: scene drives emissive + opacity)", "baseColor": "#b4b8ba", "color": "#b4b8ba", "albedo": {"dominant": "#b4b8ba", "secondary": [], "samplingNotes": "de-lit (see material evidence)"}, "colorVariation": {"palette": ["#b9bcbd"], "pattern": "mottled", "amplitude": 0.04, "heightCorrelation": 0.3}, "textureResolution": 1024, "textureProjection": {"mode": "uv", "repeat": [2.0, 2.0], "anisotropy": 8, "texelDensityIntent": "Preserve stable world/object-scale detail; do not stretch micro detail with component scale."}, "surfaceFrequencyBands": [{"id": "macro", "frequency": 2.0, "amplitude": 0.42, "role": "broad color and height breakup"}, {"id": "meso", "frequency": 12.0, "amplitude": 0.22, "role": "ridges, pores, grain, dents, or equivalent visible relief"}, {"id": "micro", "frequency": 56.0, "amplitude": 0.08, "role": "highlight breakup visible under grazing light"}], "roughness": {"base": 0.45, "variation": 0.08, "map": "independent-procedural-field", "localResponse": "higher roughness in cavities, lower roughness on worn edges"}, "metalness": {"base": 0.8, "variation": 0.0}, "normal": {"pattern": "derived-from-independent-height-field", "strength": 0.35, "scale": 24.0, "space": "tangent"}, "bump": {"pattern": "none", "amplitude": 0.0, "scale": 1.0}, "displacement": {"pattern": "none", "amplitude": 0.0, "scale": 1.0, "silhouetteAffects": false}, "ambientOcclusion": {"cavityStrength": 0.25, "contactShadowBias": 0.35, "notes": "Darken creases, seams, intersections, and recessed local features."}, "wear": {"edgeWear": 0.0, "scratches": [], "chips": []}, "dirt": {"amount": 0.0, "cavityBias": 0.0, "color": "#2F2A22"}, "localOverrides": [], "shaderNotes": ["Prefer MeshPhysicalMaterial when clearcoat, sheen, transmission, or thin-surface response is observed; otherwise use MeshStandardMaterial-compatible PBR channels.", "Generate albedo, roughness, height/normal, and AO independently; never alias albedo into roughness.", "Use normal/bump/displacement only when they map to observed surface relief.", "Use displacement geometry when the observed relief changes the close-up silhouette; texture-only relief is insufficient there."], "notes": "Dull anodised aluminium tube, 9 mm.", "doubleSided": false, "qualityTier": "utility", "qualityTierRationale": "thin or tiny part (< 2 cm across in the reference); no croppable texture evidence"},
    options
  );
  materialMap["hub-alloy"] = createSculptMaterial(
    "hub-alloy",
    {"id": "hub-alloy", "name": "hub", "type": "standard", "shaderModel": "MeshStandardMaterial (runtime contract: scene drives emissive + opacity)", "baseColor": "#d4d6d4", "color": "#d4d6d4", "albedo": {"dominant": "#d4d6d4", "secondary": [], "samplingNotes": "de-lit (see material evidence)"}, "colorVariation": {"palette": ["#d6d8d6"], "pattern": "mottled", "amplitude": 0.04, "heightCorrelation": 0.3}, "textureResolution": 1024, "textureProjection": {"mode": "uv", "repeat": [2.0, 2.0], "anisotropy": 8, "texelDensityIntent": "Preserve stable world/object-scale detail; do not stretch micro detail with component scale."}, "surfaceFrequencyBands": [{"id": "macro", "frequency": 2.0, "amplitude": 0.42, "role": "broad color and height breakup"}, {"id": "meso", "frequency": 12.0, "amplitude": 0.22, "role": "ridges, pores, grain, dents, or equivalent visible relief"}, {"id": "micro", "frequency": 56.0, "amplitude": 0.08, "role": "highlight breakup visible under grazing light"}], "roughness": {"base": 0.5, "variation": 0.08, "map": "independent-procedural-field", "localResponse": "higher roughness in cavities, lower roughness on worn edges"}, "metalness": {"base": 0.3, "variation": 0.0}, "normal": {"pattern": "derived-from-independent-height-field", "strength": 0.35, "scale": 24.0, "space": "tangent"}, "bump": {"pattern": "none", "amplitude": 0.0, "scale": 1.0}, "displacement": {"pattern": "none", "amplitude": 0.0, "scale": 1.0, "silhouetteAffects": false}, "ambientOcclusion": {"cavityStrength": 0.25, "contactShadowBias": 0.35, "notes": "Darken creases, seams, intersections, and recessed local features."}, "wear": {"edgeWear": 0.0, "scratches": [], "chips": []}, "dirt": {"amount": 0.0, "cavityBias": 0.0, "color": "#2F2A22"}, "localOverrides": [], "shaderNotes": ["Prefer MeshPhysicalMaterial when clearcoat, sheen, transmission, or thin-surface response is observed; otherwise use MeshStandardMaterial-compatible PBR channels.", "Generate albedo, roughness, height/normal, and AO independently; never alias albedo into roughness.", "Use normal/bump/displacement only when they map to observed surface relief.", "Use displacement geometry when the observed relief changes the close-up silhouette; texture-only relief is insufficient there."], "notes": "Pale grey hub/fitting.", "doubleSided": false, "qualityTier": "utility", "qualityTierRationale": "thin or tiny part (< 2 cm across in the reference); no croppable texture evidence"},
    options
  );
  materialMap["clip-black"] = createSculptMaterial(
    "clip-black",
    {"id": "clip-black", "name": "pole clips", "type": "standard", "shaderModel": "MeshStandardMaterial (runtime contract: scene drives emissive + opacity)", "baseColor": "#1d1f20", "color": "#1d1f20", "albedo": {"dominant": "#1d1f20", "secondary": [], "samplingNotes": "de-lit (see material evidence)"}, "colorVariation": {"palette": ["#1d1f20"], "pattern": "mottled", "amplitude": 0.04, "heightCorrelation": 0.3}, "textureResolution": 1024, "textureProjection": {"mode": "uv", "repeat": [2.0, 2.0], "anisotropy": 8, "texelDensityIntent": "Preserve stable world/object-scale detail; do not stretch micro detail with component scale."}, "surfaceFrequencyBands": [{"id": "macro", "frequency": 2.0, "amplitude": 0.42, "role": "broad color and height breakup"}, {"id": "meso", "frequency": 12.0, "amplitude": 0.22, "role": "ridges, pores, grain, dents, or equivalent visible relief"}, {"id": "micro", "frequency": 56.0, "amplitude": 0.08, "role": "highlight breakup visible under grazing light"}], "roughness": {"base": 0.7, "variation": 0.08, "map": "independent-procedural-field", "localResponse": "higher roughness in cavities, lower roughness on worn edges"}, "metalness": {"base": 0.0, "variation": 0.0}, "normal": {"pattern": "derived-from-independent-height-field", "strength": 0.35, "scale": 24.0, "space": "tangent"}, "bump": {"pattern": "none", "amplitude": 0.0, "scale": 1.0}, "displacement": {"pattern": "none", "amplitude": 0.0, "scale": 1.0, "silhouetteAffects": false}, "ambientOcclusion": {"cavityStrength": 0.25, "contactShadowBias": 0.35, "notes": "Darken creases, seams, intersections, and recessed local features."}, "wear": {"edgeWear": 0.0, "scratches": [], "chips": []}, "dirt": {"amount": 0.0, "cavityBias": 0.0, "color": "#2F2A22"}, "localOverrides": [], "shaderNotes": ["Prefer MeshPhysicalMaterial when clearcoat, sheen, transmission, or thin-surface response is observed; otherwise use MeshStandardMaterial-compatible PBR channels.", "Generate albedo, roughness, height/normal, and AO independently; never alias albedo into roughness.", "Use normal/bump/displacement only when they map to observed surface relief.", "Use displacement geometry when the observed relief changes the close-up silhouette; texture-only relief is insufficient there."], "notes": "Black moulded plastic clips.", "doubleSided": false, "qualityTier": "utility", "qualityTierRationale": "thin or tiny part (< 2 cm across in the reference); no croppable texture evidence"},
    options
  );
  materialMap["webbing"] = createSculptMaterial(
    "webbing",
    {"id": "webbing", "name": "green webbing loops", "type": "standard", "shaderModel": "MeshStandardMaterial (runtime contract: scene drives emissive + opacity)", "baseColor": "#b3c2a8", "color": "#b3c2a8", "albedo": {"dominant": "#b3c2a8", "secondary": [], "samplingNotes": "de-lit (see material evidence)"}, "colorVariation": {"palette": ["#b8c7a8"], "pattern": "mottled", "amplitude": 0.04, "heightCorrelation": 0.3}, "textureResolution": 1024, "textureProjection": {"mode": "uv", "repeat": [2.0, 2.0], "anisotropy": 8, "texelDensityIntent": "Preserve stable world/object-scale detail; do not stretch micro detail with component scale."}, "surfaceFrequencyBands": [{"id": "macro", "frequency": 2.0, "amplitude": 0.42, "role": "broad color and height breakup"}, {"id": "meso", "frequency": 12.0, "amplitude": 0.22, "role": "ridges, pores, grain, dents, or equivalent visible relief"}, {"id": "micro", "frequency": 56.0, "amplitude": 0.08, "role": "highlight breakup visible under grazing light"}], "roughness": {"base": 0.85, "variation": 0.08, "map": "independent-procedural-field", "localResponse": "higher roughness in cavities, lower roughness on worn edges"}, "metalness": {"base": 0.0, "variation": 0.0}, "normal": {"pattern": "derived-from-independent-height-field", "strength": 0.35, "scale": 24.0, "space": "tangent"}, "bump": {"pattern": "none", "amplitude": 0.0, "scale": 1.0}, "displacement": {"pattern": "none", "amplitude": 0.0, "scale": 1.0, "silhouetteAffects": false}, "ambientOcclusion": {"cavityStrength": 0.25, "contactShadowBias": 0.35, "notes": "Darken creases, seams, intersections, and recessed local features."}, "wear": {"edgeWear": 0.0, "scratches": [], "chips": []}, "dirt": {"amount": 0.0, "cavityBias": 0.0, "color": "#2F2A22"}, "localOverrides": [], "shaderNotes": ["Prefer MeshPhysicalMaterial when clearcoat, sheen, transmission, or thin-surface response is observed; otherwise use MeshStandardMaterial-compatible PBR channels.", "Generate albedo, roughness, height/normal, and AO independently; never alias albedo into roughness.", "Use normal/bump/displacement only when they map to observed surface relief.", "Use displacement geometry when the observed relief changes the close-up silhouette; texture-only relief is insufficient there."], "notes": "Pale sage webbing/velcro.", "doubleSided": false, "qualityTier": "utility", "qualityTierRationale": "thin or tiny part (< 2 cm across in the reference); no croppable texture evidence"},
    options
  );
  materialMap["inner-floor"] = createSculptMaterial(
    "inner-floor",
    {"id": "inner-floor", "name": "inner bathtub floor", "type": "standard", "shaderModel": "MeshStandardMaterial (runtime contract: scene drives emissive + opacity)", "baseColor": "#2a3032", "color": "#2a3032", "albedo": {"dominant": "#2a3032", "secondary": [], "samplingNotes": "de-lit (see material evidence)"}, "colorVariation": {"palette": ["#2a3032"], "pattern": "mottled", "amplitude": 0.04, "heightCorrelation": 0.3}, "textureResolution": 1024, "textureProjection": {"mode": "uv", "repeat": [2.0, 2.0], "anisotropy": 8, "texelDensityIntent": "Preserve stable world/object-scale detail; do not stretch micro detail with component scale."}, "surfaceFrequencyBands": [{"id": "macro", "frequency": 2.0, "amplitude": 0.42, "role": "broad color and height breakup"}, {"id": "meso", "frequency": 12.0, "amplitude": 0.22, "role": "ridges, pores, grain, dents, or equivalent visible relief"}, {"id": "micro", "frequency": 56.0, "amplitude": 0.08, "role": "highlight breakup visible under grazing light"}], "roughness": {"base": 0.8, "variation": 0.08, "map": "independent-procedural-field", "localResponse": "higher roughness in cavities, lower roughness on worn edges"}, "metalness": {"base": 0.0, "variation": 0.0}, "normal": {"pattern": "derived-from-independent-height-field", "strength": 0.35, "scale": 24.0, "space": "tangent"}, "bump": {"pattern": "none", "amplitude": 0.0, "scale": 1.0}, "displacement": {"pattern": "none", "amplitude": 0.0, "scale": 1.0, "silhouetteAffects": false}, "ambientOcclusion": {"cavityStrength": 0.25, "contactShadowBias": 0.35, "notes": "Darken creases, seams, intersections, and recessed local features."}, "wear": {"edgeWear": 0.0, "scratches": [], "chips": []}, "dirt": {"amount": 0.0, "cavityBias": 0.0, "color": "#2F2A22"}, "localOverrides": [], "shaderNotes": ["Prefer MeshPhysicalMaterial when clearcoat, sheen, transmission, or thin-surface response is observed; otherwise use MeshStandardMaterial-compatible PBR channels.", "Generate albedo, roughness, height/normal, and AO independently; never alias albedo into roughness.", "Use normal/bump/displacement only when they map to observed surface relief.", "Use displacement geometry when the observed relief changes the close-up silhouette; texture-only relief is insufficient there."], "notes": "Dark inner floor visible beneath hem (inferred colour).", "doubleSided": true, "qualityTier": "utility", "qualityTierRationale": "thin or tiny part (< 2 cm across in the reference); no croppable texture evidence"},
    options
  );
  materialMap["zip"] = createSculptMaterial(
    "zip",
    {"id": "zip", "name": "door zip coil", "type": "standard", "shaderModel": "MeshStandardMaterial (runtime contract: scene drives emissive + opacity)", "baseColor": "#3a403c", "color": "#3a403c", "albedo": {"dominant": "#3a403c", "secondary": [], "samplingNotes": "de-lit (see material evidence)"}, "colorVariation": {"palette": ["#3a403c"], "pattern": "mottled", "amplitude": 0.04, "heightCorrelation": 0.3}, "textureResolution": 1024, "textureProjection": {"mode": "uv", "repeat": [2.0, 2.0], "anisotropy": 8, "texelDensityIntent": "Preserve stable world/object-scale detail; do not stretch micro detail with component scale."}, "surfaceFrequencyBands": [{"id": "macro", "frequency": 2.0, "amplitude": 0.42, "role": "broad color and height breakup"}, {"id": "meso", "frequency": 12.0, "amplitude": 0.22, "role": "ridges, pores, grain, dents, or equivalent visible relief"}, {"id": "micro", "frequency": 56.0, "amplitude": 0.08, "role": "highlight breakup visible under grazing light"}], "roughness": {"base": 0.6, "variation": 0.08, "map": "independent-procedural-field", "localResponse": "higher roughness in cavities, lower roughness on worn edges"}, "metalness": {"base": 0.0, "variation": 0.0}, "normal": {"pattern": "derived-from-independent-height-field", "strength": 0.35, "scale": 24.0, "space": "tangent"}, "bump": {"pattern": "none", "amplitude": 0.0, "scale": 1.0}, "displacement": {"pattern": "none", "amplitude": 0.0, "scale": 1.0, "silhouetteAffects": false}, "ambientOcclusion": {"cavityStrength": 0.25, "contactShadowBias": 0.35, "notes": "Darken creases, seams, intersections, and recessed local features."}, "wear": {"edgeWear": 0.0, "scratches": [], "chips": []}, "dirt": {"amount": 0.0, "cavityBias": 0.0, "color": "#2F2A22"}, "localOverrides": [], "shaderNotes": ["Prefer MeshPhysicalMaterial when clearcoat, sheen, transmission, or thin-surface response is observed; otherwise use MeshStandardMaterial-compatible PBR channels.", "Generate albedo, roughness, height/normal, and AO independently; never alias albedo into roughness.", "Use normal/bump/displacement only when they map to observed surface relief.", "Use displacement geometry when the observed relief changes the close-up silhouette; texture-only relief is insufficient there."], "notes": "Coil zip, slightly darker than fly.", "doubleSided": false, "qualityTier": "utility", "qualityTierRationale": "thin or tiny part (< 2 cm across in the reference); no croppable texture evidence"},
    options
  );

  const nodes: Record<string, THREE.Object3D> = { root };
  const meshes: Record<string, THREE.Mesh> = {};
  const sockets: Record<string, THREE.Object3D> = {};
  const colliders: Record<string, unknown> = {};
  const destructionGroups: Record<string, THREE.Object3D[]> = {};

  const endpoint_root_0 = makeAttachmentEndpoint(null);
  const node_root_0 = new THREE.Group();
  node_root_0.name = "tent__pivot";
  node_root_0.scale.set(1, 1, 1);
  if (endpoint_root_0) {
    node_root_0.position.copy(endpoint_root_0.start);
    node_root_0.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_root_0.position.set(0.0, 0.0, 0.0);
    node_root_0.rotation.set(0.0, 0.0, 0.0);
  }
  node_root_0.userData.sculptComponent = {"id": "root", "name": "tent", "level": "macro", "role": "body", "importance": 1.0, "confidence": 0.85, "primitive": "box", "topologyClass": "assembled-solid", "topologyRationale": "Assembly root only; carries no geometry.", "geometryDescriptor": {"topologyIntent": "empty group, base centred at y=0, door +Z", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": null, "attachment": null, "dimensions": {"width": 2.1, "height": 1.0, "depth": 1.3, "units": "m", "confidence": 0.85}, "transform": {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "root", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "fly-nylon"}}, "material": "fly-nylon", "materialLayers": ["fly-nylon"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "form", "colorMaterialRecipe": {"dominantAlbedo": "rgba(151, 166, 152, 1.0)", "secondaryAlbedo": "rgba(129, 142, 130, 1.0)", "materialClass": "fabric", "materialClassConfidence": 0.8, "evidenceRef": "material-evidence/summary.json"}};
  node_root_0.userData.actionProfile = {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "root", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "fly-nylon"}};
  (nodes["root"] ?? root).add(node_root_0);
  nodes["root"] = node_root_0;
  const mesh_root_0Geometry = endpoint_root_0
    ? new THREE.CylinderGeometry(endpoint_root_0.endRadius, endpoint_root_0.baseRadius, endpoint_root_0.length, 16, 6)
    : new THREE.BoxGeometry(1, 1, 1, 4, 4, 4);
  if (!endpoint_root_0) {
    mesh_root_0Geometry.scale(1.0, 1.0, 1.0);
  }
  const mesh_root_0 = new THREE.Mesh(
    mesh_root_0Geometry,
    materialMap["fly-nylon"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_root_0.name = "tent";
  if (endpoint_root_0) {
    mesh_root_0.position.copy(endpoint_root_0.midpoint);
    mesh_root_0.quaternion.copy(endpoint_root_0.quaternion);
  }
  mesh_root_0.castShadow = options.castShadow ?? true;
  mesh_root_0.receiveShadow = options.receiveShadow ?? true;
  mesh_root_0.userData.sculptComponent = {"id": "root", "name": "tent", "level": "macro", "role": "body", "importance": 1.0, "confidence": 0.85, "primitive": "box", "topologyClass": "assembled-solid", "topologyRationale": "Assembly root only; carries no geometry.", "geometryDescriptor": {"topologyIntent": "empty group, base centred at y=0, door +Z", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": null, "attachment": null, "dimensions": {"width": 2.1, "height": 1.0, "depth": 1.3, "units": "m", "confidence": 0.85}, "transform": {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "root", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "root", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "fly-nylon"}}, "material": "fly-nylon", "materialLayers": ["fly-nylon"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "form", "colorMaterialRecipe": {"dominantAlbedo": "rgba(151, 166, 152, 1.0)", "secondaryAlbedo": "rgba(129, 142, 130, 1.0)", "materialClass": "fabric", "materialClassConfidence": 0.8, "evidenceRef": "material-evidence/summary.json"}};
  node_root_0.add(mesh_root_0);
  meshes["root"] = mesh_root_0;
  colliders["root"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."};
  destructionGroups["root"] ??= [];
  destructionGroups["root"].push(node_root_0);

  const endpoint_fly_1 = makeAttachmentEndpoint(null);
  const node_fly_1 = new THREE.Group();
  node_fly_1.name = "fly__pivot";
  node_fly_1.scale.set(1, 1, 1);
  if (endpoint_fly_1) {
    node_fly_1.position.copy(endpoint_fly_1.start);
    node_fly_1.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_fly_1.position.set(0.0, 0.0, 0.0);
    node_fly_1.rotation.set(0.0, 0.0, 0.0);
  }
  node_fly_1.userData.sculptComponent = {"id": "fly", "name": "fly", "level": "macro", "role": "shell", "importance": 1.0, "confidence": 0.8, "primitive": "extrude", "topologyClass": "open-shell", "topologyRationale": "Coated-nylon fly is a zero-thickness tensioned membrane seen from outside and (when faded) from inside.", "geometryDescriptor": {"topologyIntent": "single heightfield membrane over the footprint, solved as a pinned Laplace membrane with a small sag load", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "accumulated surface arc length along grid rows/cols (cloth-style unwrap)", "normalStrategy": "computeVertexNormals + generated canvas normal map (ripstop + soft wrinkles)", "membraneSolve": {"footprintHalfExtents": [1.05, 0.65], "hemHeight": 0.04, "grid": [56, 36], "gridWarp": "x = L*sin(a*pi/2), z = D*sin(b*pi/2) (dense at walls)", "pins": ["hem perimeter at hemHeight", "4 leg arches minus pole clearance 0.012", "roof plateau |x|<=RIDGE_END, |z|<=HUB_Z at 0.86..0.89 (hung from both hubs, ridge-pole ears at the ends)"], "heightRemap": "solve u, y = HEM + (1-HEM)*u^0.55 so walls leave the hem steeply", "sagLoad": -0.9, "iterations": 500, "wrinkles": "seeded value noise, amplitude 3 mm, horizontal bias on lower faces"}}, "parent": "root", "attachment": null, "dimensions": {"width": 2.1, "height": 0.92, "depth": 1.3, "units": "m", "confidence": 0.8}, "transform": {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "fly", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "fly-nylon"}}, "material": "fly-nylon", "materialLayers": ["fly-nylon"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "fabric-sag", "kind": "seam", "description": "membrane sag load between pinned pole lines + wrinkle noise", "detailRef": "fabric-sag", "evidenceRef": "full-object", "geometryEffect": "displacement"}, {"id": "panel-seams", "kind": "seam", "description": "faint seam tubes along end-wall/face boundaries (hub->ridge-end, ridge-end->corner)", "detailRef": "panel-seams", "evidenceRef": "full-object", "geometryEffect": "ridge"}, {"id": "velcro-wraps", "kind": "fastener", "description": "pale green webbing loops on the fly next to each leg at ~45% height", "detailRef": "velcro-wraps", "evidenceRef": "full-object", "geometryEffect": "small box"}, {"id": "hem-gap", "kind": "stain", "description": "hem 4 cm above ground; dark inner floor band below", "detailRef": "hem-gap", "evidenceRef": "full-object", "geometryEffect": "separate inner skirt"}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "form", "colorMaterialRecipe": {"dominantAlbedo": "rgba(151, 166, 152, 1.0)", "secondaryAlbedo": "rgba(129, 142, 130, 1.0)", "materialClass": "fabric", "materialClassConfidence": 0.8, "evidenceRef": "material-evidence/summary.json"}};
  node_fly_1.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "fly", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "fly-nylon"}};
  (nodes["root"] ?? root).add(node_fly_1);
  nodes["fly"] = node_fly_1;
  const mesh_fly_1Geometry = endpoint_fly_1
    ? new THREE.CylinderGeometry(endpoint_fly_1.endRadius, endpoint_fly_1.baseRadius, endpoint_fly_1.length, 16, 6)
    : buildExtrudeGeometry({"points": [[-0.3, -0.3], [0.3, -0.3], [0.3, 0.3], [-0.3, 0.3]], "depth": 0.1});
  if (!endpoint_fly_1) {
    mesh_fly_1Geometry.scale(1.0, 1.0, 1.0);
  }
  const mesh_fly_1 = new THREE.Mesh(
    mesh_fly_1Geometry,
    materialMap["fly-nylon"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_fly_1.name = "fly";
  if (endpoint_fly_1) {
    mesh_fly_1.position.copy(endpoint_fly_1.midpoint);
    mesh_fly_1.quaternion.copy(endpoint_fly_1.quaternion);
  }
  mesh_fly_1.castShadow = options.castShadow ?? true;
  mesh_fly_1.receiveShadow = options.receiveShadow ?? true;
  mesh_fly_1.userData.sculptComponent = {"id": "fly", "name": "fly", "level": "macro", "role": "shell", "importance": 1.0, "confidence": 0.8, "primitive": "extrude", "topologyClass": "open-shell", "topologyRationale": "Coated-nylon fly is a zero-thickness tensioned membrane seen from outside and (when faded) from inside.", "geometryDescriptor": {"topologyIntent": "single heightfield membrane over the footprint, solved as a pinned Laplace membrane with a small sag load", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "accumulated surface arc length along grid rows/cols (cloth-style unwrap)", "normalStrategy": "computeVertexNormals + generated canvas normal map (ripstop + soft wrinkles)", "membraneSolve": {"footprintHalfExtents": [1.05, 0.65], "hemHeight": 0.04, "grid": [56, 36], "gridWarp": "x = L*sin(a*pi/2), z = D*sin(b*pi/2) (dense at walls)", "pins": ["hem perimeter at hemHeight", "4 leg arches minus pole clearance 0.012", "roof plateau |x|<=RIDGE_END, |z|<=HUB_Z at 0.86..0.89 (hung from both hubs, ridge-pole ears at the ends)"], "heightRemap": "solve u, y = HEM + (1-HEM)*u^0.55 so walls leave the hem steeply", "sagLoad": -0.9, "iterations": 500, "wrinkles": "seeded value noise, amplitude 3 mm, horizontal bias on lower faces"}}, "parent": "root", "attachment": null, "dimensions": {"width": 2.1, "height": 0.92, "depth": 1.3, "units": "m", "confidence": 0.8}, "transform": {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "fly", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "fly-nylon"}}, "material": "fly-nylon", "materialLayers": ["fly-nylon"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "fabric-sag", "kind": "seam", "description": "membrane sag load between pinned pole lines + wrinkle noise", "detailRef": "fabric-sag", "evidenceRef": "full-object", "geometryEffect": "displacement"}, {"id": "panel-seams", "kind": "seam", "description": "faint seam tubes along end-wall/face boundaries (hub->ridge-end, ridge-end->corner)", "detailRef": "panel-seams", "evidenceRef": "full-object", "geometryEffect": "ridge"}, {"id": "velcro-wraps", "kind": "fastener", "description": "pale green webbing loops on the fly next to each leg at ~45% height", "detailRef": "velcro-wraps", "evidenceRef": "full-object", "geometryEffect": "small box"}, {"id": "hem-gap", "kind": "stain", "description": "hem 4 cm above ground; dark inner floor band below", "detailRef": "hem-gap", "evidenceRef": "full-object", "geometryEffect": "separate inner skirt"}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "form", "colorMaterialRecipe": {"dominantAlbedo": "rgba(151, 166, 152, 1.0)", "secondaryAlbedo": "rgba(129, 142, 130, 1.0)", "materialClass": "fabric", "materialClassConfidence": 0.8, "evidenceRef": "material-evidence/summary.json"}};
  node_fly_1.add(mesh_fly_1);
  meshes["fly"] = mesh_fly_1;
  colliders["fly"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."};
  destructionGroups["fly"] ??= [];
  destructionGroups["fly"].push(node_fly_1);

  const endpoint_inner_floor_2 = makeAttachmentEndpoint(null);
  const node_inner_floor_2 = new THREE.Group();
  node_inner_floor_2.name = "inner-floor__pivot";
  node_inner_floor_2.scale.set(1, 1, 1);
  if (endpoint_inner_floor_2) {
    node_inner_floor_2.position.copy(endpoint_inner_floor_2.start);
    node_inner_floor_2.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_inner_floor_2.position.set(0.0, 0.0, 0.0);
    node_inner_floor_2.rotation.set(0.0, 0.0, 0.0);
  }
  node_inner_floor_2.userData.sculptComponent = {"id": "inner-floor", "name": "inner-floor", "level": "meso", "role": "base", "importance": 0.6, "confidence": 0.5, "primitive": "extrude", "topologyClass": "open-shell", "topologyRationale": "Visible only as a dark band under the hem; a thin skirt inset 2 cm inside the hem.", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry", "inferred": true}, "parent": "fly", "attachment": {"parentSocket": "fly.hem", "localStart": [0, 0, 0], "localEnd": [0, 0.06, 0], "contactType": "overlap", "embedDepth": 0.02, "overlap": 0.02, "gapTolerance": 0.005}, "dimensions": {"width": 2.04, "height": 0.06, "depth": 1.26, "units": "m", "confidence": 0.5}, "transform": {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "inner-floor", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "inner-floor"}}, "material": "inner-floor", "materialLayers": ["inner-floor"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "form", "colorMaterialRecipe": {"dominantAlbedo": "rgba(42, 48, 50, 1.0)", "secondaryAlbedo": "rgba(36, 41, 43, 1.0)", "materialClass": "fabric", "materialClassConfidence": 0.8, "evidenceRef": "material-evidence/summary.json"}};
  node_inner_floor_2.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "inner-floor", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "inner-floor"}};
  (nodes["fly"] ?? root).add(node_inner_floor_2);
  nodes["inner-floor"] = node_inner_floor_2;
  const mesh_inner_floor_2Geometry = endpoint_inner_floor_2
    ? new THREE.CylinderGeometry(endpoint_inner_floor_2.endRadius, endpoint_inner_floor_2.baseRadius, endpoint_inner_floor_2.length, 16, 6)
    : buildExtrudeGeometry({"points": [[-0.3, -0.3], [0.3, -0.3], [0.3, 0.3], [-0.3, 0.3]], "depth": 0.1});
  if (!endpoint_inner_floor_2) {
    mesh_inner_floor_2Geometry.scale(1.0, 1.0, 1.0);
  }
  const mesh_inner_floor_2 = new THREE.Mesh(
    mesh_inner_floor_2Geometry,
    materialMap["inner-floor"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_inner_floor_2.name = "inner-floor";
  if (endpoint_inner_floor_2) {
    mesh_inner_floor_2.position.copy(endpoint_inner_floor_2.midpoint);
    mesh_inner_floor_2.quaternion.copy(endpoint_inner_floor_2.quaternion);
  }
  mesh_inner_floor_2.castShadow = options.castShadow ?? true;
  mesh_inner_floor_2.receiveShadow = options.receiveShadow ?? true;
  mesh_inner_floor_2.userData.sculptComponent = {"id": "inner-floor", "name": "inner-floor", "level": "meso", "role": "base", "importance": 0.6, "confidence": 0.5, "primitive": "extrude", "topologyClass": "open-shell", "topologyRationale": "Visible only as a dark band under the hem; a thin skirt inset 2 cm inside the hem.", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry", "inferred": true}, "parent": "fly", "attachment": {"parentSocket": "fly.hem", "localStart": [0, 0, 0], "localEnd": [0, 0.06, 0], "contactType": "overlap", "embedDepth": 0.02, "overlap": 0.02, "gapTolerance": 0.005}, "dimensions": {"width": 2.04, "height": 0.06, "depth": 1.26, "units": "m", "confidence": 0.5}, "transform": {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "inner-floor", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "inner-floor"}}, "material": "inner-floor", "materialLayers": ["inner-floor"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "form", "colorMaterialRecipe": {"dominantAlbedo": "rgba(42, 48, 50, 1.0)", "secondaryAlbedo": "rgba(36, 41, 43, 1.0)", "materialClass": "fabric", "materialClassConfidence": 0.8, "evidenceRef": "material-evidence/summary.json"}};
  node_inner_floor_2.add(mesh_inner_floor_2);
  meshes["inner-floor"] = mesh_inner_floor_2;
  colliders["inner-floor"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."};
  destructionGroups["inner-floor"] ??= [];
  destructionGroups["inner-floor"].push(node_inner_floor_2);

  const attachment_poles_3 = {"parentSocket": "root.frame", "localStart": [0.0, 0.9, 0.2], "localEnd": [1.05, 0.0, 0.65], "contactType": "socket", "embedDepth": 0.01, "overlap": 0.01, "gapTolerance": 0.005};
  const endpoint_poles_3 = makeAttachmentEndpoint(attachment_poles_3);
  const node_poles_3 = new THREE.Group();
  node_poles_3.name = "poles__pivot";
  node_poles_3.scale.set(1, 1, 1);
  if (endpoint_poles_3) {
    node_poles_3.position.copy(endpoint_poles_3.start);
    node_poles_3.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_poles_3.position.set(0.0, 0.0, 0.0);
    node_poles_3.rotation.set(0.0, 0.0, 0.0);
  }
  node_poles_3.userData.sculptComponent = {"id": "poles", "name": "poles", "level": "macro", "role": "frame", "importance": 1.0, "confidence": 0.8, "primitive": "tube", "topologyClass": "fiber-strand", "topologyRationale": "Frame group: hub, strut, four legs and the ridge pole; aluminium tube 9 mm.", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry", "tubeRadius": 0.0045}, "parent": "root", "attachment": {"parentSocket": "root.frame", "localStart": [0.0, 0.9, 0.2], "localEnd": [1.05, 0.0, 0.65], "contactType": "socket", "embedDepth": 0.01, "overlap": 0.01, "gapTolerance": 0.005}, "dimensions": {"width": 2.1, "height": 1.0, "depth": 1.3, "units": "m", "confidence": 0.8}, "transform": {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "poles", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "aluminium"}}, "material": "aluminium", "materialLayers": ["aluminium"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "form", "colorMaterialRecipe": {"dominantAlbedo": "rgba(180, 184, 186, 1.0)", "secondaryAlbedo": "rgba(154, 158, 159, 1.0)", "materialClass": "metal", "materialClassConfidence": 0.8, "evidenceRef": "material-evidence/summary.json"}};
  node_poles_3.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "poles", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "aluminium"}};
  (nodes["root"] ?? root).add(node_poles_3);
  nodes["poles"] = node_poles_3;
  const mesh_poles_3Geometry = endpoint_poles_3
    ? new THREE.CylinderGeometry(endpoint_poles_3.endRadius, endpoint_poles_3.baseRadius, endpoint_poles_3.length, 16, 6)
    : buildTubeGeometry({"points": [[0.0, -0.5, 0.0], [0.0, 0.5, 0.0]], "radius": 0.05, "closed": false});
  if (!endpoint_poles_3) {
    mesh_poles_3Geometry.scale(1.0, 1.0, 1.0);
  }
  const mesh_poles_3 = new THREE.Mesh(
    mesh_poles_3Geometry,
    materialMap["aluminium"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_poles_3.name = "poles";
  if (endpoint_poles_3) {
    mesh_poles_3.position.copy(endpoint_poles_3.midpoint);
    mesh_poles_3.quaternion.copy(endpoint_poles_3.quaternion);
  }
  mesh_poles_3.castShadow = options.castShadow ?? true;
  mesh_poles_3.receiveShadow = options.receiveShadow ?? true;
  mesh_poles_3.userData.sculptComponent = {"id": "poles", "name": "poles", "level": "macro", "role": "frame", "importance": 1.0, "confidence": 0.8, "primitive": "tube", "topologyClass": "fiber-strand", "topologyRationale": "Frame group: hub, strut, four legs and the ridge pole; aluminium tube 9 mm.", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry", "tubeRadius": 0.0045}, "parent": "root", "attachment": {"parentSocket": "root.frame", "localStart": [0.0, 0.9, 0.2], "localEnd": [1.05, 0.0, 0.65], "contactType": "socket", "embedDepth": 0.01, "overlap": 0.01, "gapTolerance": 0.005}, "dimensions": {"width": 2.1, "height": 1.0, "depth": 1.3, "units": "m", "confidence": 0.8}, "transform": {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "poles", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "aluminium"}}, "material": "aluminium", "materialLayers": ["aluminium"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "form", "colorMaterialRecipe": {"dominantAlbedo": "rgba(180, 184, 186, 1.0)", "secondaryAlbedo": "rgba(154, 158, 159, 1.0)", "materialClass": "metal", "materialClassConfidence": 0.8, "evidenceRef": "material-evidence/summary.json"}};
  node_poles_3.add(mesh_poles_3);
  meshes["poles"] = mesh_poles_3;
  colliders["poles"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."};
  destructionGroups["poles"] ??= [];
  destructionGroups["poles"].push(node_poles_3);

  const attachment_frame_hub_4 = {"parentSocket": "poles.hub", "localStart": [0.0, 0.9, 0.2], "localEnd": [0.0, 0.9, 0.2], "contactType": "socket", "embedDepth": 0.01, "overlap": 0.01, "gapTolerance": 0.005};
  const endpoint_frame_hub_4 = makeAttachmentEndpoint(attachment_frame_hub_4);
  const node_frame_hub_4 = new THREE.Group();
  node_frame_hub_4.name = "hub-front__pivot";
  node_frame_hub_4.scale.set(1, 1, 1);
  if (endpoint_frame_hub_4) {
    node_frame_hub_4.position.copy(endpoint_frame_hub_4.start);
    node_frame_hub_4.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_frame_hub_4.position.set(0.0, 0.9, 0.2);
    node_frame_hub_4.rotation.set(0.0, 0.0, 0.0);
  }
  node_frame_hub_4.userData.sculptComponent = {"id": "frame-hub", "name": "hub-front", "level": "meso", "role": "connector", "importance": 0.6, "confidence": 0.75, "primitive": "cylinder", "topologyClass": "assembled-solid", "topologyRationale": "Front moulded hub at the top of the door face; two front legs and a strut socket in.", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "poles", "attachment": {"parentSocket": "poles.hub", "localStart": [0.0, 0.9, 0.2], "localEnd": [0.0, 0.9, 0.2], "contactType": "socket", "embedDepth": 0.01, "overlap": 0.01, "gapTolerance": 0.005}, "dimensions": {"width": 0.05, "height": 0.03, "depth": 0.05, "units": "m", "confidence": 0.75}, "transform": {"position": [0.0, 0.9, 0.2], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0.0, 0.9, 0.2], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "frame-hub", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "hub-alloy"}}, "material": "hub-alloy", "materialLayers": ["hub-alloy"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "hub-strut-junction", "kind": "fastener", "description": "hub body + strut leaning back up to the ridge fitting", "detailRef": "hub-strut-junction", "evidenceRef": "full-object"}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "form", "colorMaterialRecipe": {"dominantAlbedo": "rgba(212, 214, 212, 1.0)", "secondaryAlbedo": "rgba(182, 184, 182, 1.0)", "materialClass": "plastic", "materialClassConfidence": 0.8, "evidenceRef": "material-evidence/summary.json"}};
  node_frame_hub_4.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0.0, 0.9, 0.2], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "frame-hub", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "hub-alloy"}};
  (nodes["poles"] ?? root).add(node_frame_hub_4);
  nodes["frame-hub"] = node_frame_hub_4;
  const mesh_frame_hub_4Geometry = endpoint_frame_hub_4
    ? new THREE.CylinderGeometry(endpoint_frame_hub_4.endRadius, endpoint_frame_hub_4.baseRadius, endpoint_frame_hub_4.length, 16, 6)
    : new THREE.CylinderGeometry(0.5, 0.5, 1, 24, 8);
  if (!endpoint_frame_hub_4) {
    mesh_frame_hub_4Geometry.scale(1.0, 1.0, 1.0);
  }
  const mesh_frame_hub_4 = new THREE.Mesh(
    mesh_frame_hub_4Geometry,
    materialMap["hub-alloy"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_frame_hub_4.name = "hub-front";
  if (endpoint_frame_hub_4) {
    mesh_frame_hub_4.position.copy(endpoint_frame_hub_4.midpoint);
    mesh_frame_hub_4.quaternion.copy(endpoint_frame_hub_4.quaternion);
  }
  mesh_frame_hub_4.castShadow = options.castShadow ?? true;
  mesh_frame_hub_4.receiveShadow = options.receiveShadow ?? true;
  mesh_frame_hub_4.userData.sculptComponent = {"id": "frame-hub", "name": "hub-front", "level": "meso", "role": "connector", "importance": 0.6, "confidence": 0.75, "primitive": "cylinder", "topologyClass": "assembled-solid", "topologyRationale": "Front moulded hub at the top of the door face; two front legs and a strut socket in.", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "poles", "attachment": {"parentSocket": "poles.hub", "localStart": [0.0, 0.9, 0.2], "localEnd": [0.0, 0.9, 0.2], "contactType": "socket", "embedDepth": 0.01, "overlap": 0.01, "gapTolerance": 0.005}, "dimensions": {"width": 0.05, "height": 0.03, "depth": 0.05, "units": "m", "confidence": 0.75}, "transform": {"position": [0.0, 0.9, 0.2], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0.0, 0.9, 0.2], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "frame-hub", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "hub-alloy"}}, "material": "hub-alloy", "materialLayers": ["hub-alloy"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "hub-strut-junction", "kind": "fastener", "description": "hub body + strut leaning back up to the ridge fitting", "detailRef": "hub-strut-junction", "evidenceRef": "full-object"}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "form", "colorMaterialRecipe": {"dominantAlbedo": "rgba(212, 214, 212, 1.0)", "secondaryAlbedo": "rgba(182, 184, 182, 1.0)", "materialClass": "plastic", "materialClassConfidence": 0.8, "evidenceRef": "material-evidence/summary.json"}};
  node_frame_hub_4.add(mesh_frame_hub_4);
  meshes["frame-hub"] = mesh_frame_hub_4;
  colliders["frame-hub"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."};
  destructionGroups["frame-hub"] ??= [];
  destructionGroups["frame-hub"].push(node_frame_hub_4);

  const attachment_frame_hub_back_5 = {"parentSocket": "poles.hubBack", "localStart": [0.0, 0.9, -0.2], "localEnd": [0.0, 0.9, -0.2], "contactType": "socket", "embedDepth": 0.01, "overlap": 0.01, "gapTolerance": 0.005};
  const endpoint_frame_hub_back_5 = makeAttachmentEndpoint(attachment_frame_hub_back_5);
  const node_frame_hub_back_5 = new THREE.Group();
  node_frame_hub_back_5.name = "hub-back__pivot";
  node_frame_hub_back_5.scale.set(1, 1, 1);
  if (endpoint_frame_hub_back_5) {
    node_frame_hub_back_5.position.copy(endpoint_frame_hub_back_5.start);
    node_frame_hub_back_5.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_frame_hub_back_5.position.set(0.0, 0.9, -0.2);
    node_frame_hub_back_5.rotation.set(0.0, 0.0, 0.0);
  }
  node_frame_hub_back_5.userData.sculptComponent = {"id": "frame-hub-back", "name": "hub-back", "level": "meso", "role": "connector", "importance": 0.6, "confidence": 0.6, "primitive": "cylinder", "topologyClass": "assembled-solid", "topologyRationale": "Back hub, mirror of the front one (IMG_4850 shows it with its own legs).", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "poles", "attachment": {"parentSocket": "poles.hubBack", "localStart": [0.0, 0.9, -0.2], "localEnd": [0.0, 0.9, -0.2], "contactType": "socket", "embedDepth": 0.01, "overlap": 0.01, "gapTolerance": 0.005}, "dimensions": {"width": 0.05, "height": 0.03, "depth": 0.05, "units": "m", "confidence": 0.6}, "transform": {"position": [0.0, 0.9, -0.2], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0.0, 0.9, -0.2], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "frame-hub-back", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "hub-alloy"}}, "material": "hub-alloy", "materialLayers": ["hub-alloy"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object", "secondary-view"], "details": [], "fidelityTier": "form", "colorMaterialRecipe": {"dominantAlbedo": "rgba(212, 214, 212, 1.0)", "secondaryAlbedo": "rgba(182, 184, 182, 1.0)", "materialClass": "plastic", "materialClassConfidence": 0.8, "evidenceRef": "material-evidence/summary.json"}};
  node_frame_hub_back_5.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0.0, 0.9, -0.2], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "frame-hub-back", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "hub-alloy"}};
  (nodes["poles"] ?? root).add(node_frame_hub_back_5);
  nodes["frame-hub-back"] = node_frame_hub_back_5;
  const mesh_frame_hub_back_5Geometry = endpoint_frame_hub_back_5
    ? new THREE.CylinderGeometry(endpoint_frame_hub_back_5.endRadius, endpoint_frame_hub_back_5.baseRadius, endpoint_frame_hub_back_5.length, 16, 6)
    : new THREE.CylinderGeometry(0.5, 0.5, 1, 24, 8);
  if (!endpoint_frame_hub_back_5) {
    mesh_frame_hub_back_5Geometry.scale(1.0, 1.0, 1.0);
  }
  const mesh_frame_hub_back_5 = new THREE.Mesh(
    mesh_frame_hub_back_5Geometry,
    materialMap["hub-alloy"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_frame_hub_back_5.name = "hub-back";
  if (endpoint_frame_hub_back_5) {
    mesh_frame_hub_back_5.position.copy(endpoint_frame_hub_back_5.midpoint);
    mesh_frame_hub_back_5.quaternion.copy(endpoint_frame_hub_back_5.quaternion);
  }
  mesh_frame_hub_back_5.castShadow = options.castShadow ?? true;
  mesh_frame_hub_back_5.receiveShadow = options.receiveShadow ?? true;
  mesh_frame_hub_back_5.userData.sculptComponent = {"id": "frame-hub-back", "name": "hub-back", "level": "meso", "role": "connector", "importance": 0.6, "confidence": 0.6, "primitive": "cylinder", "topologyClass": "assembled-solid", "topologyRationale": "Back hub, mirror of the front one (IMG_4850 shows it with its own legs).", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "poles", "attachment": {"parentSocket": "poles.hubBack", "localStart": [0.0, 0.9, -0.2], "localEnd": [0.0, 0.9, -0.2], "contactType": "socket", "embedDepth": 0.01, "overlap": 0.01, "gapTolerance": 0.005}, "dimensions": {"width": 0.05, "height": 0.03, "depth": 0.05, "units": "m", "confidence": 0.6}, "transform": {"position": [0.0, 0.9, -0.2], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0.0, 0.9, -0.2], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "frame-hub-back", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "hub-alloy"}}, "material": "hub-alloy", "materialLayers": ["hub-alloy"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object", "secondary-view"], "details": [], "fidelityTier": "form", "colorMaterialRecipe": {"dominantAlbedo": "rgba(212, 214, 212, 1.0)", "secondaryAlbedo": "rgba(182, 184, 182, 1.0)", "materialClass": "plastic", "materialClassConfidence": 0.8, "evidenceRef": "material-evidence/summary.json"}};
  node_frame_hub_back_5.add(mesh_frame_hub_back_5);
  meshes["frame-hub-back"] = mesh_frame_hub_back_5;
  colliders["frame-hub-back"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."};
  destructionGroups["frame-hub-back"] ??= [];
  destructionGroups["frame-hub-back"].push(node_frame_hub_back_5);

  const attachment_ridge_strut_6 = {"parentSocket": "frame-hub.top", "localStart": [0.0, 0.9, 0.2], "localEnd": [0.0, 1.0, 0.0], "contactType": "socket", "embedDepth": 0.01, "overlap": 0.01, "gapTolerance": 0.005};
  const endpoint_ridge_strut_6 = makeAttachmentEndpoint(attachment_ridge_strut_6);
  const node_ridge_strut_6 = new THREE.Group();
  node_ridge_strut_6.name = "ridge-struts__pivot";
  node_ridge_strut_6.scale.set(1, 1, 1);
  if (endpoint_ridge_strut_6) {
    node_ridge_strut_6.position.copy(endpoint_ridge_strut_6.start);
    node_ridge_strut_6.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_ridge_strut_6.position.set(0.0, 0.0, 0.0);
    node_ridge_strut_6.rotation.set(0.0, 0.0, 0.0);
  }
  node_ridge_strut_6.userData.sculptComponent = {"id": "ridge-strut", "name": "ridge-struts", "level": "micro", "role": "connector", "importance": 0.6, "confidence": 0.7, "primitive": "tube", "topologyClass": "fiber-strand", "topologyRationale": "Two short struts, one from each hub, leaning in to the ridge-pole centre fitting.", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "poles", "attachment": {"parentSocket": "frame-hub.top", "localStart": [0.0, 0.9, 0.2], "localEnd": [0.0, 1.0, 0.0], "contactType": "socket", "embedDepth": 0.01, "overlap": 0.01, "gapTolerance": 0.005}, "dimensions": {"width": 0.01, "height": 0.1, "depth": 0.4, "units": "m", "confidence": 0.7}, "transform": {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "ridge-strut", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "aluminium"}}, "material": "aluminium", "materialLayers": ["aluminium"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "form", "colorMaterialRecipe": {"dominantAlbedo": "rgba(180, 184, 186, 1.0)", "secondaryAlbedo": "rgba(154, 158, 159, 1.0)", "materialClass": "metal", "materialClassConfidence": 0.8, "evidenceRef": "material-evidence/summary.json"}};
  node_ridge_strut_6.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "ridge-strut", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "aluminium"}};
  (nodes["poles"] ?? root).add(node_ridge_strut_6);
  nodes["ridge-strut"] = node_ridge_strut_6;
  const mesh_ridge_strut_6Geometry = endpoint_ridge_strut_6
    ? new THREE.CylinderGeometry(endpoint_ridge_strut_6.endRadius, endpoint_ridge_strut_6.baseRadius, endpoint_ridge_strut_6.length, 16, 6)
    : buildTubeGeometry({"points": [[0.0, -0.5, 0.0], [0.0, 0.5, 0.0]], "radius": 0.05, "closed": false});
  if (!endpoint_ridge_strut_6) {
    mesh_ridge_strut_6Geometry.scale(1.0, 1.0, 1.0);
  }
  const mesh_ridge_strut_6 = new THREE.Mesh(
    mesh_ridge_strut_6Geometry,
    materialMap["aluminium"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_ridge_strut_6.name = "ridge-struts";
  if (endpoint_ridge_strut_6) {
    mesh_ridge_strut_6.position.copy(endpoint_ridge_strut_6.midpoint);
    mesh_ridge_strut_6.quaternion.copy(endpoint_ridge_strut_6.quaternion);
  }
  mesh_ridge_strut_6.castShadow = options.castShadow ?? true;
  mesh_ridge_strut_6.receiveShadow = options.receiveShadow ?? true;
  mesh_ridge_strut_6.userData.sculptComponent = {"id": "ridge-strut", "name": "ridge-struts", "level": "micro", "role": "connector", "importance": 0.6, "confidence": 0.7, "primitive": "tube", "topologyClass": "fiber-strand", "topologyRationale": "Two short struts, one from each hub, leaning in to the ridge-pole centre fitting.", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "poles", "attachment": {"parentSocket": "frame-hub.top", "localStart": [0.0, 0.9, 0.2], "localEnd": [0.0, 1.0, 0.0], "contactType": "socket", "embedDepth": 0.01, "overlap": 0.01, "gapTolerance": 0.005}, "dimensions": {"width": 0.01, "height": 0.1, "depth": 0.4, "units": "m", "confidence": 0.7}, "transform": {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "ridge-strut", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "aluminium"}}, "material": "aluminium", "materialLayers": ["aluminium"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "form", "colorMaterialRecipe": {"dominantAlbedo": "rgba(180, 184, 186, 1.0)", "secondaryAlbedo": "rgba(154, 158, 159, 1.0)", "materialClass": "metal", "materialClassConfidence": 0.8, "evidenceRef": "material-evidence/summary.json"}};
  node_ridge_strut_6.add(mesh_ridge_strut_6);
  meshes["ridge-strut"] = mesh_ridge_strut_6;
  colliders["ridge-strut"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."};
  destructionGroups["ridge-strut"] ??= [];
  destructionGroups["ridge-strut"].push(node_ridge_strut_6);

  const attachment_ridge_pole_7 = {"parentSocket": "ridge-strut.top", "localStart": [0.0, 1.0, 0.0], "localEnd": [0.0, 1.0, 0.0], "contactType": "socket", "embedDepth": 0.01, "overlap": 0.01, "gapTolerance": 0.005};
  const endpoint_ridge_pole_7 = makeAttachmentEndpoint(attachment_ridge_pole_7);
  const node_ridge_pole_7 = new THREE.Group();
  node_ridge_pole_7.name = "ridge-pole__pivot";
  node_ridge_pole_7.scale.set(1, 1, 1);
  if (endpoint_ridge_pole_7) {
    node_ridge_pole_7.position.copy(endpoint_ridge_pole_7.start);
    node_ridge_pole_7.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_ridge_pole_7.position.set(0.0, 0.0, 0.0);
    node_ridge_pole_7.rotation.set(0.0, 0.0, 0.0);
  }
  node_ridge_pole_7.userData.sculptComponent = {"id": "ridge-pole", "name": "ridge-pole", "level": "meso", "role": "connector", "importance": 0.6, "confidence": 0.8, "primitive": "curve-sweep", "topologyClass": "fiber-strand", "topologyRationale": "Lengthwise ridge pole, arched, proud of the fly; ends hook down to the fly ridge corners.", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry", "curve": "catmull-rom", "points": [[-0.6, 0.86, 0], [-0.3, 0.97, 0], [0, 1.0, 0], [0.3, 0.97, 0], [0.6, 0.86, 0]]}, "parent": "poles", "attachment": {"parentSocket": "ridge-strut.top", "localStart": [0.0, 1.0, 0.0], "localEnd": [0.0, 1.0, 0.0], "contactType": "socket", "embedDepth": 0.01, "overlap": 0.01, "gapTolerance": 0.005}, "dimensions": {"width": 1.06, "height": 0.14, "depth": 0.01, "units": "m", "confidence": 0.8}, "transform": {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "ridge-pole", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "aluminium"}}, "material": "aluminium", "materialLayers": ["aluminium"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "ridge-arch", "kind": "contour", "description": "arch 1.0 m at mid, 0.86 at ends, ~8 cm above fly at mid", "detailRef": "ridge-pole-proud", "evidenceRef": "full-object"}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "form", "colorMaterialRecipe": {"dominantAlbedo": "rgba(180, 184, 186, 1.0)", "secondaryAlbedo": "rgba(154, 158, 159, 1.0)", "materialClass": "metal", "materialClassConfidence": 0.8, "evidenceRef": "material-evidence/summary.json"}};
  node_ridge_pole_7.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "ridge-pole", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "aluminium"}};
  (nodes["poles"] ?? root).add(node_ridge_pole_7);
  nodes["ridge-pole"] = node_ridge_pole_7;
  const mesh_ridge_pole_7Geometry = endpoint_ridge_pole_7
    ? new THREE.CylinderGeometry(endpoint_ridge_pole_7.endRadius, endpoint_ridge_pole_7.baseRadius, endpoint_ridge_pole_7.length, 16, 6)
    : buildCurveSweepGeometry({"spine": [[-0.5, -0.4, 0.0], [-0.1, 0.1, 0.0], [0.3, 0.2, 0.0], [0.6, -0.1, 0.0]], "crossSection": {"points": [[-0.04, -0.02], [0.04, -0.02], [0.04, 0.02], [-0.04, 0.02]]}, "closed": false});
  if (!endpoint_ridge_pole_7) {
    mesh_ridge_pole_7Geometry.scale(1.0, 1.0, 1.0);
  }
  const mesh_ridge_pole_7 = new THREE.Mesh(
    mesh_ridge_pole_7Geometry,
    materialMap["aluminium"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_ridge_pole_7.name = "ridge-pole";
  if (endpoint_ridge_pole_7) {
    mesh_ridge_pole_7.position.copy(endpoint_ridge_pole_7.midpoint);
    mesh_ridge_pole_7.quaternion.copy(endpoint_ridge_pole_7.quaternion);
  }
  mesh_ridge_pole_7.castShadow = options.castShadow ?? true;
  mesh_ridge_pole_7.receiveShadow = options.receiveShadow ?? true;
  mesh_ridge_pole_7.userData.sculptComponent = {"id": "ridge-pole", "name": "ridge-pole", "level": "meso", "role": "connector", "importance": 0.6, "confidence": 0.8, "primitive": "curve-sweep", "topologyClass": "fiber-strand", "topologyRationale": "Lengthwise ridge pole, arched, proud of the fly; ends hook down to the fly ridge corners.", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry", "curve": "catmull-rom", "points": [[-0.6, 0.86, 0], [-0.3, 0.97, 0], [0, 1.0, 0], [0.3, 0.97, 0], [0.6, 0.86, 0]]}, "parent": "poles", "attachment": {"parentSocket": "ridge-strut.top", "localStart": [0.0, 1.0, 0.0], "localEnd": [0.0, 1.0, 0.0], "contactType": "socket", "embedDepth": 0.01, "overlap": 0.01, "gapTolerance": 0.005}, "dimensions": {"width": 1.06, "height": 0.14, "depth": 0.01, "units": "m", "confidence": 0.8}, "transform": {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "ridge-pole", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "aluminium"}}, "material": "aluminium", "materialLayers": ["aluminium"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "ridge-arch", "kind": "contour", "description": "arch 1.0 m at mid, 0.86 at ends, ~8 cm above fly at mid", "detailRef": "ridge-pole-proud", "evidenceRef": "full-object"}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "form", "colorMaterialRecipe": {"dominantAlbedo": "rgba(180, 184, 186, 1.0)", "secondaryAlbedo": "rgba(154, 158, 159, 1.0)", "materialClass": "metal", "materialClassConfidence": 0.8, "evidenceRef": "material-evidence/summary.json"}};
  node_ridge_pole_7.add(mesh_ridge_pole_7);
  meshes["ridge-pole"] = mesh_ridge_pole_7;
  colliders["ridge-pole"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."};
  destructionGroups["ridge-pole"] ??= [];
  destructionGroups["ridge-pole"].push(node_ridge_pole_7);

  const attachment_pole_legs_8 = {"parentSocket": "frame-hub.legSockets", "localStart": [0.0, 0.9, 0.2], "localEnd": [1.05, 0.0, 0.65], "contactType": "socket", "embedDepth": 0.01, "overlap": 0.01, "gapTolerance": 0.005};
  const endpoint_pole_legs_8 = makeAttachmentEndpoint(attachment_pole_legs_8);
  const node_pole_legs_8 = new THREE.Group();
  node_pole_legs_8.name = "legs__pivot";
  node_pole_legs_8.scale.set(1, 1, 1);
  if (endpoint_pole_legs_8) {
    node_pole_legs_8.position.copy(endpoint_pole_legs_8.start);
    node_pole_legs_8.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_pole_legs_8.position.set(0.0, 0.0, 0.0);
    node_pole_legs_8.rotation.set(0.0, 0.0, 0.0);
  }
  node_pole_legs_8.userData.sculptComponent = {"id": "pole-legs", "name": "legs", "level": "meso", "role": "connector", "importance": 0.6, "confidence": 0.75, "primitive": "curve-sweep", "topologyClass": "fiber-strand", "topologyRationale": "Four legs, each from its own side's hub to a corner, in vertical planes; profile h(s)=H*(1-s)+0.2*sin(pi*s)*sqrt(s).", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry", "curve": "catmull-rom per leg", "profile": "h(s) = 0.9*(1 - s) + 0.2*sin(pi*s)*sqrt(s), s = 0..1 hub->corner", "corners": [[-1.05, 0, -0.65], [-1.05, 0, 0.65], [1.05, 0, -0.65], [1.05, 0, 0.65]]}, "parent": "frame-hub", "attachment": {"parentSocket": "frame-hub.legSockets", "localStart": [0.0, 0.9, 0.2], "localEnd": [1.05, 0.0, 0.65], "contactType": "socket", "embedDepth": 0.01, "overlap": 0.01, "gapTolerance": 0.005}, "dimensions": {"width": 2.06, "height": 0.92, "depth": 1.26, "units": "m", "confidence": 0.75}, "transform": {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "pole-legs", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "aluminium"}}, "material": "aluminium", "materialLayers": ["aluminium"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "leg-clips", "kind": "fastener", "description": "4 black clips per leg at s = 0.2,0.4,0.6,0.8", "detailRef": "leg-clips", "evidenceRef": "full-object", "repetitionSystem": "leg-clips"}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "form", "colorMaterialRecipe": {"dominantAlbedo": "rgba(180, 184, 186, 1.0)", "secondaryAlbedo": "rgba(154, 158, 159, 1.0)", "materialClass": "metal", "materialClassConfidence": 0.8, "evidenceRef": "material-evidence/summary.json"}};
  node_pole_legs_8.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "pole-legs", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "aluminium"}};
  (nodes["frame-hub"] ?? root).add(node_pole_legs_8);
  nodes["pole-legs"] = node_pole_legs_8;
  const mesh_pole_legs_8Geometry = endpoint_pole_legs_8
    ? new THREE.CylinderGeometry(endpoint_pole_legs_8.endRadius, endpoint_pole_legs_8.baseRadius, endpoint_pole_legs_8.length, 16, 6)
    : buildCurveSweepGeometry({"spine": [[-0.5, -0.4, 0.0], [-0.1, 0.1, 0.0], [0.3, 0.2, 0.0], [0.6, -0.1, 0.0]], "crossSection": {"points": [[-0.04, -0.02], [0.04, -0.02], [0.04, 0.02], [-0.04, 0.02]]}, "closed": false});
  if (!endpoint_pole_legs_8) {
    mesh_pole_legs_8Geometry.scale(1.0, 1.0, 1.0);
  }
  const mesh_pole_legs_8 = new THREE.Mesh(
    mesh_pole_legs_8Geometry,
    materialMap["aluminium"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_pole_legs_8.name = "legs";
  if (endpoint_pole_legs_8) {
    mesh_pole_legs_8.position.copy(endpoint_pole_legs_8.midpoint);
    mesh_pole_legs_8.quaternion.copy(endpoint_pole_legs_8.quaternion);
  }
  mesh_pole_legs_8.castShadow = options.castShadow ?? true;
  mesh_pole_legs_8.receiveShadow = options.receiveShadow ?? true;
  mesh_pole_legs_8.userData.sculptComponent = {"id": "pole-legs", "name": "legs", "level": "meso", "role": "connector", "importance": 0.6, "confidence": 0.75, "primitive": "curve-sweep", "topologyClass": "fiber-strand", "topologyRationale": "Four legs, each from its own side's hub to a corner, in vertical planes; profile h(s)=H*(1-s)+0.2*sin(pi*s)*sqrt(s).", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry", "curve": "catmull-rom per leg", "profile": "h(s) = 0.9*(1 - s) + 0.2*sin(pi*s)*sqrt(s), s = 0..1 hub->corner", "corners": [[-1.05, 0, -0.65], [-1.05, 0, 0.65], [1.05, 0, -0.65], [1.05, 0, 0.65]]}, "parent": "frame-hub", "attachment": {"parentSocket": "frame-hub.legSockets", "localStart": [0.0, 0.9, 0.2], "localEnd": [1.05, 0.0, 0.65], "contactType": "socket", "embedDepth": 0.01, "overlap": 0.01, "gapTolerance": 0.005}, "dimensions": {"width": 2.06, "height": 0.92, "depth": 1.26, "units": "m", "confidence": 0.75}, "transform": {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "pole-legs", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "aluminium"}}, "material": "aluminium", "materialLayers": ["aluminium"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "leg-clips", "kind": "fastener", "description": "4 black clips per leg at s = 0.2,0.4,0.6,0.8", "detailRef": "leg-clips", "evidenceRef": "full-object", "repetitionSystem": "leg-clips"}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "form", "colorMaterialRecipe": {"dominantAlbedo": "rgba(180, 184, 186, 1.0)", "secondaryAlbedo": "rgba(154, 158, 159, 1.0)", "materialClass": "metal", "materialClassConfidence": 0.8, "evidenceRef": "material-evidence/summary.json"}};
  node_pole_legs_8.add(mesh_pole_legs_8);
  meshes["pole-legs"] = mesh_pole_legs_8;
  colliders["pole-legs"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."};
  destructionGroups["pole-legs"] ??= [];
  destructionGroups["pole-legs"].push(node_pole_legs_8);

  const endpoint_door_9 = makeAttachmentEndpoint(null);
  const node_door_9 = new THREE.Group();
  node_door_9.name = "door__pivot";
  node_door_9.scale.set(1, 1, 1);
  if (endpoint_door_9) {
    node_door_9.position.copy(endpoint_door_9.start);
    node_door_9.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_door_9.position.set(-0.42, 0.05, 0.6);
    node_door_9.rotation.set(0.0, 0.0, 0.0);
  }
  node_door_9.userData.sculptComponent = {"id": "door", "name": "door", "level": "meso", "role": "panel", "importance": 0.6, "confidence": 0.35, "primitive": "extrude", "topologyClass": "open-shell", "topologyRationale": "Door panel conforms to the +Z face of the membrane, 3 mm proud, D-shaped (inferred outline).", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry", "outline": "D: base |x|<=0.42 at y=0.05, top at y=0.68 under the vent", "inferred": true}, "parent": "fly", "attachment": {"parentSocket": "fly.doorHinge", "localStart": [-0.42, 0.05, 0.6], "localEnd": [-0.42, 0.6, 0.35], "contactType": "overlap", "embedDepth": 0.003, "overlap": 0.003, "gapTolerance": 0.005}, "dimensions": {"width": 0.84, "height": 0.66, "depth": 0.02, "units": "m", "confidence": 0.35}, "transform": {"position": [-0.42, 0.05, 0.6], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "hinge", "pivot": {"mode": "edge", "localPosition": [-0.42, 0.05, 0.6], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "door", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "fly-nylon"}}, "material": "fly-nylon", "materialLayers": ["fly-nylon", "zip"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "door-zip", "kind": "linework", "description": "dark coil-zip tube along the D outline", "detailRef": "door-zip", "evidenceRef": "full-object"}, {"id": "door-toggle", "kind": "fastener", "description": "small pale tab at door centre", "detailRef": "door-toggle", "evidenceRef": "full-object"}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "form", "colorMaterialRecipe": {"dominantAlbedo": "rgba(151, 166, 152, 1.0)", "secondaryAlbedo": "rgba(129, 142, 130, 1.0)", "materialClass": "fabric", "materialClassConfidence": 0.8, "evidenceRef": "material-evidence/summary.json"}};
  node_door_9.userData.actionProfile = {"animationRole": "hinge", "pivot": {"mode": "edge", "localPosition": [-0.42, 0.05, 0.6], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "door", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "fly-nylon"}};
  (nodes["fly"] ?? root).add(node_door_9);
  nodes["door"] = node_door_9;
  const mesh_door_9Geometry = endpoint_door_9
    ? new THREE.CylinderGeometry(endpoint_door_9.endRadius, endpoint_door_9.baseRadius, endpoint_door_9.length, 16, 6)
    : buildExtrudeGeometry({"points": [[-0.3, -0.3], [0.3, -0.3], [0.3, 0.3], [-0.3, 0.3]], "depth": 0.1});
  if (!endpoint_door_9) {
    mesh_door_9Geometry.scale(1.0, 1.0, 1.0);
  }
  const mesh_door_9 = new THREE.Mesh(
    mesh_door_9Geometry,
    materialMap["fly-nylon"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_door_9.name = "door";
  if (endpoint_door_9) {
    mesh_door_9.position.copy(endpoint_door_9.midpoint);
    mesh_door_9.quaternion.copy(endpoint_door_9.quaternion);
  }
  mesh_door_9.castShadow = options.castShadow ?? true;
  mesh_door_9.receiveShadow = options.receiveShadow ?? true;
  mesh_door_9.userData.sculptComponent = {"id": "door", "name": "door", "level": "meso", "role": "panel", "importance": 0.6, "confidence": 0.35, "primitive": "extrude", "topologyClass": "open-shell", "topologyRationale": "Door panel conforms to the +Z face of the membrane, 3 mm proud, D-shaped (inferred outline).", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry", "outline": "D: base |x|<=0.42 at y=0.05, top at y=0.68 under the vent", "inferred": true}, "parent": "fly", "attachment": {"parentSocket": "fly.doorHinge", "localStart": [-0.42, 0.05, 0.6], "localEnd": [-0.42, 0.6, 0.35], "contactType": "overlap", "embedDepth": 0.003, "overlap": 0.003, "gapTolerance": 0.005}, "dimensions": {"width": 0.84, "height": 0.66, "depth": 0.02, "units": "m", "confidence": 0.35}, "transform": {"position": [-0.42, 0.05, 0.6], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "hinge", "pivot": {"mode": "edge", "localPosition": [-0.42, 0.05, 0.6], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "door", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "fly-nylon"}}, "material": "fly-nylon", "materialLayers": ["fly-nylon", "zip"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "door-zip", "kind": "linework", "description": "dark coil-zip tube along the D outline", "detailRef": "door-zip", "evidenceRef": "full-object"}, {"id": "door-toggle", "kind": "fastener", "description": "small pale tab at door centre", "detailRef": "door-toggle", "evidenceRef": "full-object"}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "form", "colorMaterialRecipe": {"dominantAlbedo": "rgba(151, 166, 152, 1.0)", "secondaryAlbedo": "rgba(129, 142, 130, 1.0)", "materialClass": "fabric", "materialClassConfidence": 0.8, "evidenceRef": "material-evidence/summary.json"}};
  node_door_9.add(mesh_door_9);
  meshes["door"] = mesh_door_9;
  colliders["door"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."};
  destructionGroups["door"] ??= [];
  destructionGroups["door"].push(node_door_9);

  const endpoint_awning_10 = makeAttachmentEndpoint(null);
  const node_awning_10 = new THREE.Group();
  node_awning_10.name = "awning__pivot";
  node_awning_10.scale.set(1, 1, 1);
  if (endpoint_awning_10) {
    node_awning_10.position.copy(endpoint_awning_10.start);
    node_awning_10.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_awning_10.position.set(0.0, 0.8, 0.14);
    node_awning_10.rotation.set(0.0, 0.0, 0.0);
  }
  node_awning_10.userData.sculptComponent = {"id": "awning", "name": "awning", "level": "meso", "role": "panel", "importance": 0.6, "confidence": 0.8, "primitive": "extrude", "topologyClass": "open-shell", "topologyRationale": "Peaked vent hood under the hub on the door face: two triangular flaps meeting at a ridge, propped by a kickstand.", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "fly", "attachment": {"parentSocket": "fly.ventFront", "localStart": [0, 0.9, 0.05], "localEnd": [0, 0.72, 0.2], "contactType": "overlap", "embedDepth": 0.003, "overlap": 0.003, "gapTolerance": 0.005}, "dimensions": {"width": 0.38, "height": 0.18, "depth": 0.12, "units": "m", "confidence": 0.8}, "transform": {"position": [0, 0.8, 0.14], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0.8, 0.14], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "awning", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "fly-nylon"}}, "material": "fly-nylon", "materialLayers": ["fly-nylon"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "peaked-vent-hood", "kind": "seam", "description": "hood apex at hub, opening at y~0.72, projects 10 cm", "detailRef": "door-vent-awning", "evidenceRef": "full-object"}, {"id": "kickstand", "kind": "fastener", "description": "short strut + dark webbing tab in the opening", "detailRef": "door-vent-awning", "evidenceRef": "full-object"}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "form", "colorMaterialRecipe": {"dominantAlbedo": "rgba(151, 166, 152, 1.0)", "secondaryAlbedo": "rgba(129, 142, 130, 1.0)", "materialClass": "fabric", "materialClassConfidence": 0.8, "evidenceRef": "material-evidence/summary.json"}};
  node_awning_10.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0.8, 0.14], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "awning", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "fly-nylon"}};
  (nodes["fly"] ?? root).add(node_awning_10);
  nodes["awning"] = node_awning_10;
  const mesh_awning_10Geometry = endpoint_awning_10
    ? new THREE.CylinderGeometry(endpoint_awning_10.endRadius, endpoint_awning_10.baseRadius, endpoint_awning_10.length, 16, 6)
    : buildExtrudeGeometry({"points": [[-0.3, -0.3], [0.3, -0.3], [0.3, 0.3], [-0.3, 0.3]], "depth": 0.1});
  if (!endpoint_awning_10) {
    mesh_awning_10Geometry.scale(1.0, 1.0, 1.0);
  }
  const mesh_awning_10 = new THREE.Mesh(
    mesh_awning_10Geometry,
    materialMap["fly-nylon"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_awning_10.name = "awning";
  if (endpoint_awning_10) {
    mesh_awning_10.position.copy(endpoint_awning_10.midpoint);
    mesh_awning_10.quaternion.copy(endpoint_awning_10.quaternion);
  }
  mesh_awning_10.castShadow = options.castShadow ?? true;
  mesh_awning_10.receiveShadow = options.receiveShadow ?? true;
  mesh_awning_10.userData.sculptComponent = {"id": "awning", "name": "awning", "level": "meso", "role": "panel", "importance": 0.6, "confidence": 0.8, "primitive": "extrude", "topologyClass": "open-shell", "topologyRationale": "Peaked vent hood under the hub on the door face: two triangular flaps meeting at a ridge, propped by a kickstand.", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "fly", "attachment": {"parentSocket": "fly.ventFront", "localStart": [0, 0.9, 0.05], "localEnd": [0, 0.72, 0.2], "contactType": "overlap", "embedDepth": 0.003, "overlap": 0.003, "gapTolerance": 0.005}, "dimensions": {"width": 0.38, "height": 0.18, "depth": 0.12, "units": "m", "confidence": 0.8}, "transform": {"position": [0, 0.8, 0.14], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0.8, 0.14], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "awning", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "fly-nylon"}}, "material": "fly-nylon", "materialLayers": ["fly-nylon"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "peaked-vent-hood", "kind": "seam", "description": "hood apex at hub, opening at y~0.72, projects 10 cm", "detailRef": "door-vent-awning", "evidenceRef": "full-object"}, {"id": "kickstand", "kind": "fastener", "description": "short strut + dark webbing tab in the opening", "detailRef": "door-vent-awning", "evidenceRef": "full-object"}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "form", "colorMaterialRecipe": {"dominantAlbedo": "rgba(151, 166, 152, 1.0)", "secondaryAlbedo": "rgba(129, 142, 130, 1.0)", "materialClass": "fabric", "materialClassConfidence": 0.8, "evidenceRef": "material-evidence/summary.json"}};
  node_awning_10.add(mesh_awning_10);
  meshes["awning"] = mesh_awning_10;
  colliders["awning"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."};
  destructionGroups["awning"] ??= [];
  destructionGroups["awning"].push(node_awning_10);

  const endpoint_vent_back_11 = makeAttachmentEndpoint(null);
  const node_vent_back_11 = new THREE.Group();
  node_vent_back_11.name = "vent-back__pivot";
  node_vent_back_11.scale.set(1, 1, 1);
  if (endpoint_vent_back_11) {
    node_vent_back_11.position.copy(endpoint_vent_back_11.start);
    node_vent_back_11.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_vent_back_11.position.set(0.0, 0.8, -0.14);
    node_vent_back_11.rotation.set(0.0, 0.0, 0.0);
  }
  node_vent_back_11.userData.sculptComponent = {"id": "vent-back", "name": "vent-back", "level": "meso", "role": "panel", "importance": 0.6, "confidence": 0.6, "primitive": "extrude", "topologyClass": "open-shell", "topologyRationale": "Mirror of the door vent hood on the -Z face (seen in IMG_4850).", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "fly", "attachment": {"parentSocket": "fly.ventBack", "localStart": [0, 0.9, -0.05], "localEnd": [0, 0.72, -0.2], "contactType": "overlap", "embedDepth": 0.003, "overlap": 0.003, "gapTolerance": 0.005}, "dimensions": {"width": 0.38, "height": 0.18, "depth": 0.12, "units": "m", "confidence": 0.6}, "transform": {"position": [0, 0.8, -0.14], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0.8, -0.14], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "vent-back", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "fly-nylon"}}, "material": "fly-nylon", "materialLayers": ["fly-nylon"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "peaked-vent-hood", "kind": "seam", "description": "mirror of awning", "detailRef": "back-vent", "evidenceRef": "full-object"}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object", "secondary-view"], "details": [], "fidelityTier": "form", "colorMaterialRecipe": {"dominantAlbedo": "rgba(151, 166, 152, 1.0)", "secondaryAlbedo": "rgba(129, 142, 130, 1.0)", "materialClass": "fabric", "materialClassConfidence": 0.8, "evidenceRef": "material-evidence/summary.json"}};
  node_vent_back_11.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0.8, -0.14], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "vent-back", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "fly-nylon"}};
  (nodes["fly"] ?? root).add(node_vent_back_11);
  nodes["vent-back"] = node_vent_back_11;
  const mesh_vent_back_11Geometry = endpoint_vent_back_11
    ? new THREE.CylinderGeometry(endpoint_vent_back_11.endRadius, endpoint_vent_back_11.baseRadius, endpoint_vent_back_11.length, 16, 6)
    : buildExtrudeGeometry({"points": [[-0.3, -0.3], [0.3, -0.3], [0.3, 0.3], [-0.3, 0.3]], "depth": 0.1});
  if (!endpoint_vent_back_11) {
    mesh_vent_back_11Geometry.scale(1.0, 1.0, 1.0);
  }
  const mesh_vent_back_11 = new THREE.Mesh(
    mesh_vent_back_11Geometry,
    materialMap["fly-nylon"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_vent_back_11.name = "vent-back";
  if (endpoint_vent_back_11) {
    mesh_vent_back_11.position.copy(endpoint_vent_back_11.midpoint);
    mesh_vent_back_11.quaternion.copy(endpoint_vent_back_11.quaternion);
  }
  mesh_vent_back_11.castShadow = options.castShadow ?? true;
  mesh_vent_back_11.receiveShadow = options.receiveShadow ?? true;
  mesh_vent_back_11.userData.sculptComponent = {"id": "vent-back", "name": "vent-back", "level": "meso", "role": "panel", "importance": 0.6, "confidence": 0.6, "primitive": "extrude", "topologyClass": "open-shell", "topologyRationale": "Mirror of the door vent hood on the -Z face (seen in IMG_4850).", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "fly", "attachment": {"parentSocket": "fly.ventBack", "localStart": [0, 0.9, -0.05], "localEnd": [0, 0.72, -0.2], "contactType": "overlap", "embedDepth": 0.003, "overlap": 0.003, "gapTolerance": 0.005}, "dimensions": {"width": 0.38, "height": 0.18, "depth": 0.12, "units": "m", "confidence": 0.6}, "transform": {"position": [0, 0.8, -0.14], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0.8, -0.14], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "vent-back", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "fly-nylon"}}, "material": "fly-nylon", "materialLayers": ["fly-nylon"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "peaked-vent-hood", "kind": "seam", "description": "mirror of awning", "detailRef": "back-vent", "evidenceRef": "full-object"}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object", "secondary-view"], "details": [], "fidelityTier": "form", "colorMaterialRecipe": {"dominantAlbedo": "rgba(151, 166, 152, 1.0)", "secondaryAlbedo": "rgba(129, 142, 130, 1.0)", "materialClass": "fabric", "materialClassConfidence": 0.8, "evidenceRef": "material-evidence/summary.json"}};
  node_vent_back_11.add(mesh_vent_back_11);
  meshes["vent-back"] = mesh_vent_back_11;
  colliders["vent-back"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."};
  destructionGroups["vent-back"] ??= [];
  destructionGroups["vent-back"].push(node_vent_back_11);

  // repetition system: leg-clips (InstancedMesh, radial, count=16, level=meso)
  {
    const parent = nodes["root"] ?? root;
    const geo = new THREE.BoxGeometry(1, 1, 1, 4, 4, 4);
    const mat = materialMap["clip-black"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 });
    // Contract (PLAN_1.5 WS-E): instanceScale is ABSOLUTE, in the parent pivot's
    // local units -- it is never multiplied by the parent component's own declared
    // dimensional scale. This falls out of the same fix as componentTree: the pivot
    // Group this cluster is parented to always carries identity scale (dimensions are
    // baked into that component's OWN geometry, not exposed on the Group), so an
    // instanced fastener/tooth/spoke sized [0.05, 0.05, 0.05] renders at exactly that
    // size regardless of how non-uniformly its host component is shaped, and a
    // `radial` ring's placement stays circular instead of being squashed into an
    // ellipse by a non-uniform host.
    const scl = [0.1, 0.1, 0.1];
    const axis = new THREE.Vector3(0.0, 0.0, 1.0).normalize();
    const radius = 0.0;
    const seed = Math.abs(axis.z) < 0.9 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0);
    const perp = new THREE.Vector3().crossVectors(axis, seed).normalize();
    // One InstancedMesh = one draw call for all repeated parts (teeth/fasteners/spokes),
    // replacing the former per-instance Mesh clone loop (real-time perf principle).
    const cluster = new THREE.InstancedMesh(geo, mat, 16);
    const _m = new THREE.Matrix4();
    const _p = new THREE.Vector3();
    const _q = new THREE.Quaternion();
    const _s = new THREE.Vector3(scl[0], scl[1], scl[2]);
    for (let i = 0; i < 16; i++) {
      const ang = ((0.0) + (i * 360) / 16) * Math.PI / 180;
      const dir = perp.clone().applyQuaternion(new THREE.Quaternion().setFromAxisAngle(axis, ang));
      _p.copy(radius > 0 ? dir.clone().multiplyScalar(radius * 0.5) : new THREE.Vector3());
      _q.setFromUnitVectors(new THREE.Vector3(1, 0, 0), dir);
      _m.compose(_p, _q, _s);
      cluster.setMatrixAt(i, _m);
    }
    cluster.instanceMatrix.needsUpdate = true;
    cluster.castShadow = options.castShadow ?? true;
    cluster.receiveShadow = options.receiveShadow ?? true;
    cluster.name = "leg-clips";
    parent.add(cluster);
  }

  // repetition system: velcro-loops (InstancedMesh, radial, count=4, level=meso)
  {
    const parent = nodes["root"] ?? root;
    const geo = new THREE.BoxGeometry(1, 1, 1, 4, 4, 4);
    const mat = materialMap["webbing"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 });
    // Contract (PLAN_1.5 WS-E): instanceScale is ABSOLUTE, in the parent pivot's
    // local units -- it is never multiplied by the parent component's own declared
    // dimensional scale. This falls out of the same fix as componentTree: the pivot
    // Group this cluster is parented to always carries identity scale (dimensions are
    // baked into that component's OWN geometry, not exposed on the Group), so an
    // instanced fastener/tooth/spoke sized [0.05, 0.05, 0.05] renders at exactly that
    // size regardless of how non-uniformly its host component is shaped, and a
    // `radial` ring's placement stays circular instead of being squashed into an
    // ellipse by a non-uniform host.
    const scl = [0.1, 0.1, 0.1];
    const axis = new THREE.Vector3(0.0, 0.0, 1.0).normalize();
    const radius = 0.0;
    const seed = Math.abs(axis.z) < 0.9 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0);
    const perp = new THREE.Vector3().crossVectors(axis, seed).normalize();
    // One InstancedMesh = one draw call for all repeated parts (teeth/fasteners/spokes),
    // replacing the former per-instance Mesh clone loop (real-time perf principle).
    const cluster = new THREE.InstancedMesh(geo, mat, 4);
    const _m = new THREE.Matrix4();
    const _p = new THREE.Vector3();
    const _q = new THREE.Quaternion();
    const _s = new THREE.Vector3(scl[0], scl[1], scl[2]);
    for (let i = 0; i < 4; i++) {
      const ang = ((0.0) + (i * 360) / 4) * Math.PI / 180;
      const dir = perp.clone().applyQuaternion(new THREE.Quaternion().setFromAxisAngle(axis, ang));
      _p.copy(radius > 0 ? dir.clone().multiplyScalar(radius * 0.5) : new THREE.Vector3());
      _q.setFromUnitVectors(new THREE.Vector3(1, 0, 0), dir);
      _m.compose(_p, _q, _s);
      cluster.setMatrixAt(i, _m);
    }
    cluster.instanceMatrix.needsUpdate = true;
    cluster.castShadow = options.castShadow ?? true;
    cluster.receiveShadow = options.receiveShadow ?? true;
    cluster.name = "velcro-loops";
    parent.add(cluster);
  }

  root.userData.sculptRuntime = { nodes, meshes, sockets, colliders, destructionGroups } satisfies ProceduralModelRuntime;
  root.userData.lookDevTargets = {"qualityPriority": "reference-fidelity", "materialPass": {"albedoPaletteRequired": true, "roughnessVariationRequired": true, "normalOrBumpRequired": true, "localOverridesRequired": true, "minimumTextureResolution": 1024, "preferredTextureResolution": 2048, "independentMapChannels": ["albedo", "roughness", "height", "normal", "ambient-occlusion"], "requiredSurfaceFrequencyBands": ["macro", "meso", "micro"], "geometryReliefRequiredWhenSilhouetteAffected": true, "referencePbrExtraction": {"requiredWhenSourceImagePresent": true, "targetThreshold": 0.7, "stopOnLowConfidence": true, "script": "forge/stage1_intake/extract_pbr_evidence.py", "acceptedLimitation": "single-image extraction is reference-derived inference, not exact photogrammetry"}, "mustAvoid": ["single flat albedo per material", "uniform roughness", "albedo texture reused as roughness/height/normal/AO", "single-frequency random noise", "plastic-looking smooth bark, stone, cloth, foliage, or aged material", "local color/detail described only in prose without material masks", "claiming exact PBR recovery when confidence is below the target threshold"]}, "lightingPass": {"requiredTerms": ["key light", "fill light", "rim or environment light", "exposure", "tone mapping", "background", "contact shadow"], "mustAvoid": ["ambient-only lighting", "flat value range", "missing contact shadow", "reference lighting copied without separating material readability"]}, "screenshotReview": ["Compare albedo palette and local color zones.", "Compare roughness/normal/bump response under light.", "Compare cavity dirt, edge wear, stains, moss, scratches, or other local masks.", "Compare key/fill/rim structure, exposure, tone mapping, background, and contact shadows.", "Capture a neutral-light render to verify material readability without reference lighting.", "Capture a grazing-light close-up to expose flat normals, uniform roughness, tiling, and plastic highlights.", "Capture a reference-matched render from the same camera framing as the source."]};
  root.userData.actionReadiness = {
    note: 'Use root.userData.sculptRuntime.nodes for transforms, sockets for attachments, colliders for physics proxies, and destructionGroups for breakable sets.',
  };
  return root;
}

export function createTentLookDevLights(
  mode: 'neutral' | 'grazing' | 'reference' = 'neutral',
): THREE.Group {
  const lights = new THREE.Group();
  lights.name = "Tent look-dev lights";
  const hemi = new THREE.HemisphereLight(
    mode === 'reference' ? 0xfff0d6 : 0xf2f4ff,
    0x363b42,
    mode === 'grazing' ? 0.28 : mode === 'reference' ? 0.72 : 0.85,
  );
  lights.add(hemi);
  const key = new THREE.DirectionalLight(
    mode === 'reference' ? 0xffcf8a : 0xfff4e8,
    mode === 'grazing' ? 4.2 : mode === 'reference' ? 2.6 : 2.15,
  );
  if (mode === 'grazing') key.position.set(7.5, 1.1, 4.0);
  else if (mode === 'reference') key.position.set(-4.5, 7.5, 5.0);
  else key.position.set(-4.0, 6.0, 5.5);
  key.castShadow = true;
  key.shadow.mapSize.set(4096, 4096);
  key.shadow.bias = -0.00025;
  key.shadow.normalBias = 0.018;
  key.shadow.radius = 7;
  key.shadow.blurSamples = 24;
  key.shadow.camera.near = 0.5;
  key.shadow.camera.far = 30;
  key.shadow.camera.left = -2.6;
  key.shadow.camera.right = 2.6;
  key.shadow.camera.top = 2.6;
  key.shadow.camera.bottom = -2.6;
  key.shadow.camera.updateProjectionMatrix();
  lights.add(key);
  const fill = new THREE.DirectionalLight(0xa8c4ff, mode === 'grazing' ? 0.12 : 0.42);
  fill.position.set(4.0, 3.0, 3.5);
  lights.add(fill);
  const rim = new THREE.DirectionalLight(0xfff1c4, mode === 'grazing' ? 0.28 : 0.85);
  rim.position.set(0.5, 4.5, -6.0);
  lights.add(rim);
  lights.userData.reviewMode = mode;
  lights.userData.lightingFromPhoto = [{"type": "environment", "description": "dusk skydome, strong blue zenith, no direct sun (sun below horizon); exposure low; ACES-style tone in phone pipeline"}, {"type": "fill", "description": "soft ground bounce from pale quartz sand and green heath on lower faces"}, {"type": "key", "description": "none direct; brightest irradiance on up-facing roof from zenith; door face mid value"}, {"type": "rim", "description": "faint warm western sky glow on pole tops"}, {"type": "contact shadow", "description": "dark ambient occlusion band under the hem where the inner floor meets ground"}, {"type": "runtime", "description": "the model adds NO lights: the camp scene's hemisphere/sun rig lights it; tone mapping and exposure come from the scene renderer"}];
  lights.userData.lookDevTargets = {"qualityPriority": "reference-fidelity", "materialPass": {"albedoPaletteRequired": true, "roughnessVariationRequired": true, "normalOrBumpRequired": true, "localOverridesRequired": true, "minimumTextureResolution": 1024, "preferredTextureResolution": 2048, "independentMapChannels": ["albedo", "roughness", "height", "normal", "ambient-occlusion"], "requiredSurfaceFrequencyBands": ["macro", "meso", "micro"], "geometryReliefRequiredWhenSilhouetteAffected": true, "referencePbrExtraction": {"requiredWhenSourceImagePresent": true, "targetThreshold": 0.7, "stopOnLowConfidence": true, "script": "forge/stage1_intake/extract_pbr_evidence.py", "acceptedLimitation": "single-image extraction is reference-derived inference, not exact photogrammetry"}, "mustAvoid": ["single flat albedo per material", "uniform roughness", "albedo texture reused as roughness/height/normal/AO", "single-frequency random noise", "plastic-looking smooth bark, stone, cloth, foliage, or aged material", "local color/detail described only in prose without material masks", "claiming exact PBR recovery when confidence is below the target threshold"]}, "lightingPass": {"requiredTerms": ["key light", "fill light", "rim or environment light", "exposure", "tone mapping", "background", "contact shadow"], "mustAvoid": ["ambient-only lighting", "flat value range", "missing contact shadow", "reference lighting copied without separating material readability"]}, "screenshotReview": ["Compare albedo palette and local color zones.", "Compare roughness/normal/bump response under light.", "Compare cavity dirt, edge wear, stains, moss, scratches, or other local masks.", "Compare key/fill/rim structure, exposure, tone mapping, background, and contact shadows.", "Capture a neutral-light render to verify material readability without reference lighting.", "Capture a grazing-light close-up to expose flat normals, uniform roughness, tiling, and plastic highlights.", "Capture a reference-matched render from the same camera framing as the source."]};
  return lights;
}

// PBR materials (clearcoat/iridescence/transmission/anisotropy) need an environment
// map to visually behave as intended — call this once per renderer and assign the
// result to scene.environment before rendering. No external HDR asset required.
export function createTentEnvironment(renderer: THREE.WebGLRenderer): THREE.Texture {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const texture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  return texture;
}

// Plan 1.3 §3.2 — auto-framing by bounding box. The Divine Eye can only compare a
// render to the reference if the object is FRAMED consistently (an object framed
// differently scores as wrong even when its shape is right). This positions the camera
// deterministically from the object's bounding box so it fills the frame at a stable
// margin, and sets near/far to the object scale. Call after adding the model to the
// scene, and again on resize (after updating camera.aspect).
export function frameTentCamera(
  camera: THREE.PerspectiveCamera,
  object: THREE.Object3D,
  options: { margin?: number; azimuthDeg?: number; elevationDeg?: number } = {},
): void {
  const box = new THREE.Box3().setFromObject(object);
  if (box.isEmpty()) return;
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const margin = options.margin ?? 1.15;
  const maxDim = Math.max(size.x, size.y, size.z) * margin;
  const fov = (camera.fov * Math.PI) / 180;
  // distance so the largest object dimension fits vertically in the frame
  const distance = (maxDim / 2) / Math.tan(fov / 2);
  const az = ((options.azimuthDeg ?? 0) * Math.PI) / 180;
  const el = ((options.elevationDeg ?? 0) * Math.PI) / 180;
  const dir = new THREE.Vector3(
    Math.sin(az) * Math.cos(el),
    Math.sin(el),
    Math.cos(az) * Math.cos(el),
  );
  camera.position.copy(center).addScaledVector(dir, distance);
  camera.near = Math.max(0.01, distance - maxDim);
  camera.far = distance + maxDim * 2;
  camera.lookAt(center);
  camera.updateProjectionMatrix();
}

// Plan 1.3 §3.2c — PRESENTATION composer (DOF + bloom). CRITICAL (R-POSTFX): this is
// for the showcase/hero render ONLY. The Divine Eye's EVALUATION render MUST use a
// plain renderer with NO composer — bloom blows highlights and DOF blurs edges, which
// would corrupt the deterministic IoU/DCD/edge/blowout signals. Enable dof/bloom ONLY
// when the reference photo actually exhibits them (detect_reference_effects.py authorizes).
export function createTentPresentationComposer(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  options: { dof?: boolean; bloom?: boolean; bloomStrength?: number; dofFocus?: number; dofAperture?: number } = {},
): EffectComposer {
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  if (options.dof) {
    composer.addPass(new BokehPass(scene, camera, {
      focus: options.dofFocus ?? 10.0,
      aperture: options.dofAperture ?? 0.0002,
      maxblur: 0.01,
    }));
  }
  if (options.bloom) {
    const size = new THREE.Vector2();
    renderer.getSize(size);
    composer.addPass(new UnrealBloomPass(size, options.bloomStrength ?? 0.4, 0.4, 0.85));
  }
  return composer;
}

export function configureTentRenderer(renderer: THREE.WebGLRenderer): void {
  // Load-bearing for view-dependent finishes (anodized / Doppler): without ACES + sRGB
  // the environment reflection reads flat/washed instead of a believable metal response.
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
}

export function createTentInspectControls(
  camera: THREE.Camera,
  domElement: HTMLElement,
): OrbitControls {
  // View-dependent finishes only read correctly once the user orbits — their color
  // comes from the environment reflection, not albedo, so free rotation matters here.
  const controls = new OrbitControls(camera, domElement);
  controls.enableDamping = true;
  controls.minDistance = 1.0;
  controls.maxDistance = 8.0;
  controls.autoRotate = false;
  return controls;
}
