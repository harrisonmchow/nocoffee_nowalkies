export type Tier = 'high' | 'mid' | 'low';

export type Quality = {
  tier: Tier;
  /** The highest device pixel ratio this tier renders at. */
  dprCap: number;
  /** MSAA, only where the pixel ratio is low enough for it to matter and stay cheap. */
  antialias: boolean;
};

const dprCaps: Record<Tier, number> = { high: 2, mid: 1.5, low: 1 };

/**
 * A first guess from what the browser reports before any GPU work. Only
 * Chromium reports memory, so iPhones start on mid. The runtime governor (M5)
 * corrects the guess from measured frame times.
 */
export function guessTier(): Tier {
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  const phone = matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 820;
  if (phone) return memory !== undefined && memory <= 3 ? 'low' : 'mid';
  return memory !== undefined && memory <= 4 ? 'mid' : 'high';
}

export function qualityFor(tier: Tier): Quality {
  const dprCap = dprCaps[tier];
  const pixelRatio = Math.min(window.devicePixelRatio || 1, dprCap);
  return { tier, dprCap, antialias: tier !== 'low' && pixelRatio <= 1.5 };
}
