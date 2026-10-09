// A small GPX reader for build time. Handles the track and route points that
// Strava, Garmin and AllTrails exports contain; no dependencies.

export type TrackPoint = { lat: number; lon: number; ele?: number; /** km from start */ d: number };

export type Track = {
  points: TrackPoint[];
  distanceKm: number;
  gainM?: number;
  lossM?: number;
  minEle?: number;
  maxEle?: number;
  loop: boolean;
};

const R = 6371;
const rad = (x: number) => (x * Math.PI) / 180;

export function haversineKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function parseGpx(xml: string): Track {
  const re = /<(trkpt|rtept)\b([^>]*?)(?:\/>|>([\s\S]*?)<\/\1>)/g;
  const attr = (s: string, k: string) => {
    const m = s.match(new RegExp(`\\b${k}\\s*=\\s*["']([^"']+)["']`));
    return m ? Number(m[1]) : NaN;
  };
  const points: TrackPoint[] = [];
  for (const m of xml.matchAll(re)) {
    const lat = attr(m[2], 'lat');
    const lon = attr(m[2], 'lon');
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const eleMatch = m[3]?.match(/<ele>\s*([-\d.]+)\s*<\/ele>/);
    const ele = eleMatch ? Number(eleMatch[1]) : undefined;
    const prev = points.at(-1);
    const d = prev ? prev.d + haversineKm(prev, { lat, lon }) : 0;
    points.push({ lat, lon, ele, d });
  }
  if (points.length < 2) throw new Error('GPX file has fewer than two track points');

  // Elevation gain and loss with a 3 m hysteresis, so GPS noise is not counted as climbing.
  let gain = 0;
  let loss = 0;
  let ref: number | undefined;
  let min = Infinity;
  let max = -Infinity;
  for (const p of points) {
    if (p.ele === undefined) continue;
    min = Math.min(min, p.ele);
    max = Math.max(max, p.ele);
    if (ref === undefined) { ref = p.ele; continue; }
    if (p.ele - ref >= 3) { gain += p.ele - ref; ref = p.ele; }
    else if (ref - p.ele >= 3) { loss += ref - p.ele; ref = p.ele; }
  }
  const hasEle = Number.isFinite(min);
  const first = points[0];
  const last = points.at(-1)!;

  return {
    points,
    distanceKm: last.d,
    gainM: hasEle ? gain : undefined,
    lossM: hasEle ? loss : undefined,
    minEle: hasEle ? min : undefined,
    maxEle: hasEle ? max : undefined,
    loop: haversineKm(first, last) < 0.15,
  };
}

/** Project to a flat plane in km around the track's centre. */
export function project(points: TrackPoint[]) {
  const lat0 = points.reduce((a, p) => a + p.lat, 0) / points.length;
  const lon0 = points.reduce((a, p) => a + p.lon, 0) / points.length;
  const kx = 111.32 * Math.cos(rad(lat0));
  const ky = 110.57;
  return points.map((p) => ({ ...p, x: (p.lon - lon0) * kx, y: -(p.lat - lat0) * ky }));
}

/** Douglas–Peucker on projected km coordinates. */
export function simplify<T extends { x: number; y: number }>(pts: T[], tolKm: number): T[] {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    let best = 0;
    let idx = -1;
    const A = pts[a];
    const B = pts[b];
    const dx = B.x - A.x;
    const dy = B.y - A.y;
    const len = Math.hypot(dx, dy);
    for (let i = a + 1; i < b; i++) {
      // A loop's first and last points coincide: measure to the point instead of the line.
      const dist = len < 1e-6
        ? Math.hypot(pts[i].x - A.x, pts[i].y - A.y)
        : Math.abs(dy * pts[i].x - dx * pts[i].y + B.x * A.y - B.y * A.x) / len;
      if (dist > best) { best = dist; idx = i; }
    }
    if (best > tolKm && idx > 0) {
      keep[idx] = 1;
      stack.push([a, idx], [idx, b]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}
