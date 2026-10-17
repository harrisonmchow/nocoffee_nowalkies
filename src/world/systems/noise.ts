import { createRandom } from './random';

export type Noise2D = (x: number, y: number) => number;

const F2 = 0.5 * (Math.sqrt(3) - 1);
const G2 = (3 - Math.sqrt(3)) / 6;
const GRADIENTS = [
  [1, 1], [-1, 1], [1, -1], [-1, -1],
  [1, 0], [-1, 0], [0, 1], [0, -1],
] as const;

/** Seeded 2D simplex noise in roughly [-1, 1]. Pure JS, so it runs in the terrain worker too. */
export function createSimplex2D(seed: number): Noise2D {
  const random = createRandom(seed);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) {
    const r = Math.floor(random() * (i + 1));
    const t = p[i];
    p[i] = p[r];
    p[r] = t;
  }
  const perm = new Uint8Array(512);
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];

  return (xin, yin) => {
    const s = (xin + yin) * F2;
    const i = Math.floor(xin + s);
    const j = Math.floor(yin + s);
    const t = (i + j) * G2;
    const x0 = xin - (i - t);
    const y0 = yin - (j - t);
    const i1 = x0 > y0 ? 1 : 0;
    const j1 = x0 > y0 ? 0 : 1;
    const x1 = x0 - i1 + G2;
    const y1 = y0 - j1 + G2;
    const x2 = x0 - 1 + 2 * G2;
    const y2 = y0 - 1 + 2 * G2;
    const ii = i & 255;
    const jj = j & 255;
    let n = 0;
    let t0 = 0.5 - x0 * x0 - y0 * y0;
    if (t0 > 0) {
      const g = GRADIENTS[perm[ii + perm[jj]] & 7];
      t0 *= t0;
      n += t0 * t0 * (g[0] * x0 + g[1] * y0);
    }
    let t1 = 0.5 - x1 * x1 - y1 * y1;
    if (t1 > 0) {
      const g = GRADIENTS[perm[ii + i1 + perm[jj + j1]] & 7];
      t1 *= t1;
      n += t1 * t1 * (g[0] * x1 + g[1] * y1);
    }
    let t2 = 0.5 - x2 * x2 - y2 * y2;
    if (t2 > 0) {
      const g = GRADIENTS[perm[ii + 1 + perm[jj + 1]] & 7];
      t2 *= t2;
      n += t2 * t2 * (g[0] * x2 + g[1] * y2);
    }
    return 70 * n;
  };
}

/** Fractal sum, normalised to roughly [-1, 1]. */
export function fbm(noise: Noise2D, x: number, y: number, octaves: number, lacunarity = 2.03, gain = 0.5) {
  let amp = 1;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += amp * noise(x * freq + o * 17.31, y * freq - o * 9.17);
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return sum / norm;
}

/** Ridged multifractal in [0, 1]: sharp crests where the noise crosses zero. */
export function ridged(noise: Noise2D, x: number, y: number, octaves: number, lacunarity = 2.07, gain = 0.52) {
  let amp = 1;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  let weight = 1;
  for (let o = 0; o < octaves; o++) {
    let n = 1 - Math.abs(noise(x * freq + o * 31.7, y * freq + o * 11.3));
    n *= n;
    n *= weight;
    weight = Math.min(1, Math.max(0, n * 1.6));
    sum += amp * n;
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return sum / norm;
}

export const smoothstep = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * A tileable RGBA8 noise texture for the shaders: R and G are fbm at two
 * scales, B is a ridged channel, A is white noise. Periodic value noise keeps
 * every channel seamless when the texture repeats.
 */
export function noiseTexture(size: number, seed: number): Uint8Array {
  const random = createRandom(seed);
  const lattice = new Float32Array(256 * 256 * 3);
  for (let i = 0; i < lattice.length; i++) lattice[i] = random();
  const periodic = (x: number, y: number, period: number, channel: number) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const fx = x - xi;
    const fy = y - yi;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const at = (i: number, j: number) => {
      const ix = ((i % period) + period) % period;
      const iy = ((j % period) + period) % period;
      return lattice[(iy * 256 + ix) * 3 + channel];
    };
    const a = at(xi, yi);
    const b = at(xi + 1, yi);
    const c = at(xi, yi + 1);
    const d = at(xi + 1, yi + 1);
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  };
  const octaves = (u: number, v: number, base: number, count: number, channel: number) => {
    let amp = 0.5;
    let sum = 0;
    let norm = 0;
    let period = base;
    for (let o = 0; o < count; o++) {
      sum += amp * periodic(u * period, v * period, period, channel);
      norm += amp;
      amp *= 0.5;
      period *= 2;
    }
    return sum / norm;
  };
  const out = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const r = octaves(u, v, 4, 5, 0);
      const g = octaves(u, v, 8, 4, 1);
      const ridge = 1 - Math.abs(octaves(u, v, 6, 4, 2) * 2 - 1);
      const i = (y * size + x) * 4;
      out[i] = Math.round(Math.min(1, Math.max(0, (r - 0.5) * 1.8 + 0.5)) * 255);
      out[i + 1] = Math.round(Math.min(1, Math.max(0, (g - 0.5) * 1.8 + 0.5)) * 255);
      out[i + 2] = Math.round(ridge * ridge * 255);
      out[i + 3] = Math.round(random() * 255);
    }
  }
  return out;
}
