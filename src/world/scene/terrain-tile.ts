// Builds one biome's terrain tile from its height field. Pure JS with no DOM,
// so it runs in the terrain worker (and on the main thread as a fallback).
import type { BiomeId } from '../../data/biomes';
import { terrainFor, type HeightField } from './terrain-fields';

export type TileRequest = {
  biome: BiomeId;
  seed: number;
  /** Quads per side. */
  resolution: number;
  /** Half-width of the tile in metres. */
  radius: number;
  /** Grid warp: 1 is uniform, higher packs vertices toward the camp. */
  power: number;
};

export type TileData = {
  positions: Float32Array;
  normals: Float32Array;
  /** Per vertex: small-scale cavity (+ hollow), large-scale cavity, ridge (+ convex). */
  fields: Float32Array;
  indices: Uint32Array;
  /** A regular grid of heights over the tile, for the clouds' contact fade. */
  heightmap: Float32Array;
  heightmapSize: number;
  radius: number;
  minHeight: number;
  maxHeight: number;
};

// The heightmap's grid. Fine enough (about 39 m on a 5 km tile) that the
// clouds' contact fade doesn't smear mountains out across the valleys.
const COARSE = 257;
const clamp1 = (v: number) => Math.max(-1, Math.min(1, v));

export function buildTile({ biome, seed, resolution, radius, power }: TileRequest): TileData {
  const { height } = terrainFor(biome, seed);

  // A coarse regular grid: the heightmap, and the large-scale cavity field.
  const heightmap = new Float32Array(COARSE * COARSE);
  const step = (2 * radius) / (COARSE - 1);
  for (let j = 0; j < COARSE; j++) {
    for (let i = 0; i < COARSE; i++) heightmap[j * COARSE + i] = height(-radius + i * step, -radius + j * step);
  }
  const coarseAt = (x: number, z: number) => {
    const fx = Math.min(COARSE - 1.001, Math.max(0, (x + radius) / step));
    const fz = Math.min(COARSE - 1.001, Math.max(0, (z + radius) / step));
    const i = Math.floor(fx);
    const j = Math.floor(fz);
    const tx = fx - i;
    const tz = fz - j;
    const a = heightmap[j * COARSE + i];
    const b = heightmap[j * COARSE + i + 1];
    const c = heightmap[(j + 1) * COARSE + i];
    const d = heightmap[(j + 1) * COARSE + i + 1];
    return a + (b - a) * tx + (c - a) * tz + (a - b - c + d) * tx * tz;
  };

  const side = resolution + 1;
  const count = side * side;
  const positions = new Float32Array(count * 3);
  const normals = new Float32Array(count * 3);
  const fields = new Float32Array(count * 3);
  let minHeight = Infinity;
  let maxHeight = -Infinity;

  const warp = (t: number) => Math.sign(t) * radius * Math.abs(t) ** power;
  for (let j = 0; j < side; j++) {
    const z = warp((j / resolution) * 2 - 1);
    for (let i = 0; i < side; i++) {
      const x = warp((i / resolution) * 2 - 1);
      const y = height(x, z);
      const k = (j * side + i) * 3;
      positions[k] = x;
      positions[k + 1] = y;
      positions[k + 2] = z;
      minHeight = Math.min(minHeight, y);
      maxHeight = Math.max(maxHeight, y);

      // Normal from central differences, with a step tied to the local grid spacing.
      const r = Math.max(Math.abs(x), Math.abs(z));
      const spacing = (radius * power * (r / radius) ** ((power - 1) / power) * 2) / resolution;
      const e = Math.max(1.5, spacing * 0.5);
      const nx = (height(x - e, z) - height(x + e, z)) / (2 * e);
      const nz = (height(x, z - e) - height(x, z + e)) / (2 * e);
      const len = Math.hypot(nx, 1, nz);
      normals[k] = nx / len;
      normals[k + 1] = 1 / len;
      normals[k + 2] = nz / len;

      // Cavity at two fixed world scales (16 m near the camp only, and 2 coarse cells).
      let small = 0;
      if (r < 1800) {
        const s = 16;
        small = (height(x + s, z) + height(x - s, z) + height(x, z + s) + height(x, z - s) - 4 * y) / 8;
      }
      // The large-scale cavity keeps its ~156 m reach whatever the grid.
      const s2 = (4 * radius) / 128;
      const large =
        (coarseAt(x + s2, z) + coarseAt(x - s2, z) + coarseAt(x, z + s2) + coarseAt(x, z - s2) - 4 * coarseAt(x, z)) / 100;
      fields[k] = clamp1(small);
      fields[k + 1] = clamp1(large);
      fields[k + 2] = clamp1(-small);
    }
  }

  // Two triangles per quad, wound counter-clockwise seen from above.
  const indices = new Uint32Array(resolution * resolution * 6);
  let n = 0;
  for (let j = 0; j < resolution; j++) {
    for (let i = 0; i < resolution; i++) {
      const a = j * side + i;
      const b = a + 1;
      const c = a + side;
      const d = c + 1;
      indices[n++] = a;
      indices[n++] = c;
      indices[n++] = b;
      indices[n++] = b;
      indices[n++] = c;
      indices[n++] = d;
    }
  }

  return { positions, normals, fields, indices, heightmap, heightmapSize: COARSE, radius, minHeight, maxHeight };
}

/**
 * The height of the tile as drawn: its triangles, not the field they sample.
 * Away from the camp the warped grid's cells are 10–20 m across, and over a
 * rise the drawn ground sits well below the field, so whatever's planted on
 * the field would float. The grid is separable (a column's x and a row's z
 * are fixed), so each cell is an axis-aligned rectangle split like the indices.
 */
export function surfaceOf(tile: TileData, power: number): HeightField {
  const { positions, radius } = tile;
  const side = Math.round(Math.sqrt(positions.length / 3));
  const resolution = side - 1;
  const cell = (v: number) => {
    const t = Math.sign(v) * Math.min(1, Math.abs(v) / radius) ** (1 / power);
    return Math.min(resolution - 1, Math.max(0, Math.floor(((t + 1) / 2) * resolution)));
  };
  return (x, z) => {
    const i = cell(x);
    const j = cell(z);
    const a = j * side + i;
    const b = a + 1;
    const c = a + side;
    const d = c + 1;
    const u = (x - positions[a * 3]) / (positions[b * 3] - positions[a * 3]);
    const v = (z - positions[a * 3 + 2]) / (positions[c * 3 + 2] - positions[a * 3 + 2]);
    const [ha, hb, hc, hd] = [a, b, c, d].map((k) => positions[k * 3 + 1]);
    // Triangles (a, c, b) and (b, c, d): the diagonal runs from b to c.
    return u + v <= 1 ? ha + u * (hb - ha) + v * (hc - ha) : hd + (1 - u) * (hc - hd) + (1 - v) * (hb - hd);
  };
}
