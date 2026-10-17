// Height fields for each camp, in metres, with the camp at (0, 0). Plain JS,
// shared by the terrain worker (geometry) and the main thread (placing props),
// so a tent always sits exactly on the ground the GPU draws. The camera looks
// north (-z) at every camp. Camps are imagined moods, not real places.
import type { BiomeId } from '../../data/biomes';
import { createSimplex2D, fbm, ridged, smoothstep } from '../systems/noise';

export type HeightField = (x: number, z: number) => number;

export type TerrainSpec = {
  height: HeightField;
  /** Ground height at the camp pad. */
  camp: number;
  /** Frozen lake surface (Kevin) or sea level (Mikey), if the biome has one. */
  water?: number;
  /** Where the frozen lake lies, for the ice and to keep trees off it. */
  lake?: { x: number; z: number; radius: number };
};

const gauss = (d: number, width: number) => Math.exp(-((d / width) ** 2));

/** Flatten a pad around the camp so the tent and fire sit level. */
const withPad = (h: number, x: number, z: number, level: number, radius: number) =>
  h + (level - h) * (1 - smoothstep(radius * 0.55, radius, Math.hypot(x, z)));

/** Polynomial smooth max: where two landforms meet, a fillet instead of a crease. */
const smax = (a: number, b: number, k: number) => {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.max(a, b) + h * h * k * 0.25;
};

const peak = (x: number, z: number, cx: number, cz: number, top: number, width: number, base: number) =>
  base + (top - base) * Math.exp(-((Math.hypot(x - cx, z - cz) / width) ** 1.45));

// Harry: a snowy col high above a valley full of cloud. The tent sits on the
// saddle; just beyond it the ground rolls over and falls away north to the
// valley floor, far below the cloud sea. Ridges climb either side, and across
// the valley a horn of a peak stands under the aurora with lower peaks around it.
function alpine(seed: number): TerrainSpec {
  const n1 = createSimplex2D(seed);
  const n2 = createSimplex2D(seed + 1);
  const n3 = createSimplex2D(seed + 2);
  const camp = 1450;
  const floor = 760;
  const height: HeightField = (x, z) => {
    const r = Math.hypot(x, z);
    // Warp the big shapes, but not near the camp, so the brow stays where the station expects it.
    const far = smoothstep(150, 900, r);
    const wx = x + 180 * far * fbm(n3, x / 1300, z / 1300, 3);
    const wz = z + 180 * far * fbm(n3, x / 1300 + 5.2, z / 1300 - 3.1, 3);
    const valley = floor + 60 * fbm(n2, x / 1500, z / 1500, 3);

    // The col: a ridge running east-west through the camp, climbing to shoulders either side.
    const ax = Math.abs(wx);
    const crest = camp + 420 * smoothstep(40, 1100, ax) ** 1.4 + 18 * fbm(n2, wx / 260, 0.7, 3) * smoothstep(25, 160, ax);
    // North of the tent a short level brow, then a rounded fall into the
    // valley; south, behind the camera, a gentle slope away.
    const brow = 15 + 4 * fbm(n2, wx / 60, 3.3, 2);
    const d = Math.max(0, -wz - brow);
    const fall = 1.3 * (Math.sqrt(d * d + 900) - 30);
    const behind = Math.max(0, wz);
    let h = smax(crest - fall - 0.08 * behind - 0.00012 * behind * behind, valley, 120);

    // Across the valley: a ridge of lesser peaks, the horn at its heart, and two
    // side peaks. Each starts well below the floor, so the smooth max only
    // blends where it rises out of it.
    const under = valley - 200;
    const ridgeZ = -3200 + 250 * fbm(n1, x / 1800, 1.9, 2);
    const ridgeTop = 1600 + 300 * ridged(n1, wx / 900, 4.4, 4);
    h = smax(h, under + (ridgeTop - under) * gauss(wz - ridgeZ, 850), 150);
    // A four-faced pyramid with sharp aretes, turned a little off the view.
    const hx = wx + 300;
    const hz = wz + 3500;
    const u = hx * 0.878 - hz * 0.479;
    const v = hx * 0.479 + hz * 0.878;
    const spread = 0.55 * ((Math.abs(u) + Math.abs(v)) / 1250) + 0.45 * (Math.hypot(u, v) / 1100);
    h = smax(h, under + (2025 - under) * Math.max(0, 1 - spread) ** 1.35, 120);
    h = smax(h, peak(wx, wz, 1500, -2500, 1950, 800, under), 100);
    h = smax(h, peak(wx, wz, -1700, -2300, 1850, 700, under), 100);

    // Rock ribs and gullies on the high ground, kept off the col so the brow reads clean.
    const near = smoothstep(60, 400, r);
    h += 120 * (ridged(n1, wx / 520, wz / 520, 5) - 0.45) * smoothstep(1250, 1700, h) * near;
    h += 14 * fbm(n2, x / 140, z / 140, 4) * (0.08 + 0.92 * near);

    // Far ranges close the skyline.
    const ring = 1100 + 1100 * ridged(n2, x / 2600 + 3.7, z / 2600 - 1.3, 4);
    h = smax(h, ring * smoothstep(3600, 4800, r), 200);
    return withPad(h, x, z, camp, 16);
  };
  return { height, camp };
}

// Kevin: a frozen lake in a high basin on a clear winter night. The camp sits
// on the south shore; across the ice, spruce-dark slopes climb to a
// castellated ridge, layered like the Rockies' limestone and low enough to
// leave the sky to the Milky Way.
function cirque(seed: number): TerrainSpec {
  const n1 = createSimplex2D(seed);
  const n2 = createSimplex2D(seed + 1);
  const n3 = createSimplex2D(seed + 2);
  const lake = 400;
  const camp = lake + 2.5;
  const lakeZ = -345;
  const lakeR = 320;
  // Smooth stair-steps: cliff bands between ledges.
  const terrace = (h: number, step: number) => {
    const t = h / step;
    return step * (Math.floor(t) + smoothstep(0.3, 0.7, t - Math.floor(t)));
  };
  const height: HeightField = (x, z) => {
    const r = Math.hypot(x, z);
    const far = smoothstep(200, 900, r);
    const wx = x + 120 * far * fbm(n3, x / 900, z / 900, 3);
    const wz = z + 120 * far * fbm(n3, x / 900 + 4.1, z / 900 - 2.7, 3);
    // The basin: low around the lake, rising through the forest toward the walls.
    const rl = Math.hypot(wx * 0.9, wz - lakeZ);
    let h = lake + 4 + 330 * smoothstep(lakeR, lakeR + 1100, rl) ** 1.3;
    // The ridge across the lake, about 2.3 km north, with peaks along its crest.
    const ridgeZ = -2350 + 200 * fbm(n1, x / 1500, 0.4, 2);
    const crest = 860 + 280 * ridged(n1, wx / 700, 2.2, 4) + 140 * gauss(wx + 400, 500);
    // (Landforms start well below the ground, so the smooth max only blends where they rise.)
    const under = lake - 200;
    h = smax(h, under + (crest - under) * gauss(wz - ridgeZ, 520), 120);
    // Side ridges either side of the basin.
    h = smax(h, under + 580 * smoothstep(700, 1600, Math.abs(wx)) * (0.7 + 0.3 * ridged(n2, wx / 600, wz / 600, 3)), 100);
    // Cliff bands and ribs on the high ground, hummocks low down.
    const upper = smoothstep(lake + 180, lake + 320, h);
    h += (terrace(h, 55) - h) * 0.55 * upper;
    h += 70 * (ridged(n2, wx / 420, wz / 420, 4) - 0.45) * upper;
    h += 6 * fbm(n3, x / 90, z / 90, 3) * (1 - upper);
    // The basin under the ice.
    h += (lake - 4 - h) * (1 - smoothstep(lakeR - 60, lakeR, Math.hypot(x, z - lakeZ)));
    // Far ranges close the skyline.
    const ring = lake + 300 + 700 * ridged(n2, x / 2400 + 1.7, z / 2400 + 0.3, 4);
    h = smax(h, ring * smoothstep(3200, 4600, r), 150);
    return withPad(h, x, z, camp, 18);
  };
  return { height, camp, water: lake, lake: { x: 0, z: lakeZ, radius: lakeR } };
}

// Caleb (placeholder until M3): a forested valley with hills either side.
function valley(seed: number): TerrainSpec {
  const n1 = createSimplex2D(seed);
  const n2 = createSimplex2D(seed + 1);
  const camp = 310;
  const height: HeightField = (x, z) => {
    const across = Math.abs(x + 0.25 * z + 60 * fbm(n2, z / 900, x / 900, 2));
    let h = 295 + 430 * smoothstep(120, 1300, across) + 70 * fbm(n1, x / 600, z / 600, 4);
    h += 22 * fbm(n2, x / 120, z / 120, 3);
    const r = Math.hypot(x, z);
    h = Math.max(h, (700 + 900 * ridged(n1, x / 2400, z / 2400, 4)) * smoothstep(1600, 3200, r));
    return withPad(h, x, z, camp, 20);
  };
  return { height, camp };
}

// Mikey (placeholder until M3): a beach with the sea to the north, dunes
// behind it and a headland to the east.
function coast(seed: number): TerrainSpec {
  const n1 = createSimplex2D(seed);
  const n2 = createSimplex2D(seed + 1);
  const camp = 4;
  const height: HeightField = (x, z) => {
    const shore = -120 + 25 * fbm(n2, x / 400, 0.3, 2);
    // The beach rises from the waterline itself (no step), gently through the swash, then on up to the dunes.
    let h = z > shore ? 1.2 * smoothstep(0, 40, z - shore) + (z - shore) * 0.03 : (z - shore) * 0.045;
    h += 7 * smoothstep(30, 140, z) * (fbm(n1, x / 90, z / 90, 3) * 0.5 + 0.5);
    h += 130 * smoothstep(260, 760, x) * (0.6 + 0.4 * fbm(n1, x / 300, z / 300, 3));
    const r = Math.hypot(x, z);
    // The far range, on the land side only: over the sea the term is 0, and a plain max would lift the whole seabed to sea level.
    const range = (200 + 700 * ridged(n2, x / 2200, z / 2200, 4)) * smoothstep(1500, 3000, r) * smoothstep(-400, 600, z);
    if (range > 0) h = Math.max(h, range);
    return withPad(h, x, z, camp, 18);
  };
  return { height, camp, water: 0 };
}

const builders: Record<BiomeId, (seed: number) => TerrainSpec> = {
  'alpine-aurora': alpine,
  'rockies-night': cirque,
  'maple-autumn': valley,
  'coast-sunset': coast,
};

const cache = new Map<string, TerrainSpec>();

export function terrainFor(biome: BiomeId, seed: number): TerrainSpec {
  const key = `${biome}:${seed}`;
  let spec = cache.get(key);
  if (!spec) {
    spec = builders[biome](seed);
    cache.set(key, spec);
  }
  return spec;
}
