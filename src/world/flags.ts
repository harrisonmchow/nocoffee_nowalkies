import { PUBLIC_GEAR_WORLD, PUBLIC_WORLD_TEST } from 'astro:env/client';
import type { Tier } from './systems/quality';

/** Dev and test builds get the switches below and the window.__world hook. */
export const devTools = import.meta.env.DEV || PUBLIC_WORLD_TEST;

export type WorldSwitch = 'on' | 'off' | 'force';

const STORAGE_KEY = 'gear-world';

/**
 * Whether this browser wants the world. `?world=on` and `?world=off` are
 * remembered in this browser, and `?world=auto` forgets them. `?world=force`
 * also skips the reduced-motion, Save-Data and slow-GPU checks, for one load.
 * `asked` is true when this browser chose it rather than getting the build
 * default: it then previews camps that aren't ready for visitors yet.
 */
export function worldSwitch(params: URLSearchParams): { choice: WorldSwitch; asked: boolean } {
  const asked = params.get('world');
  if (asked === 'force') return { choice: 'force', asked: true };
  try {
    if (asked === 'on' || asked === 'off') localStorage.setItem(STORAGE_KEY, asked);
    else if (asked === 'auto') localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage can be blocked. The URL still applies to this load.
  }
  if (asked === 'on' || asked === 'off') return { choice: asked, asked: true };
  let saved: string | null = null;
  try {
    saved = localStorage.getItem(STORAGE_KEY);
  } catch {
    // As above: fall back to the build default.
  }
  if (saved === 'on' || saved === 'off') return { choice: saved, asked: true };
  return { choice: PUBLIC_GEAR_WORLD, asked: false };
}

export type DevSwitches = {
  /** ?debug: the lil-gui panel. */
  debug: boolean;
  /** ?freeze, or ?t=<seconds>: scene time stands still, so captures repeat exactly. */
  freeze: boolean;
  time: number;
  /** ?seed=<integer>: the seed for anything procedural. */
  seed: number;
  /** ?tier=high|mid|low: overrides the device guess. */
  tier?: Tier;
};

const DEFAULT_SEED = 1;

export function devSwitches(params: URLSearchParams): DevSwitches {
  if (!devTools) return { debug: false, freeze: false, time: 0, seed: DEFAULT_SEED };
  const time = Number(params.get('t'));
  const seed = Number(params.get('seed'));
  const tier = params.get('tier');
  return {
    debug: params.has('debug'),
    freeze: params.has('freeze') || params.has('t'),
    time: Number.isFinite(time) ? time : 0,
    seed: params.has('seed') && Number.isInteger(seed) ? seed : DEFAULT_SEED,
    tier: tier === 'high' || tier === 'mid' || tier === 'low' ? tier : undefined,
  };
}
