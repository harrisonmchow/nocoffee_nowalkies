// Decides whether this visit gets the 3D world, starts it, and connects it to
// the ClientRouter. Astro runs this once per full page load. The world then
// lives in #world, which the router carries across gear pages
// (transition:persist), so moving between gear pages never restarts it.
// three.js only downloads when the world starts.
import type { TransitionBeforePreparationEvent } from 'astro:transitions/client';
import { devSwitches, devTools, worldSwitch } from './flags';
import { readCamps, readRoute, type WorldRoute } from './route';
import { guessTier, qualityFor } from './systems/quality';
import type { WorldMode } from './types';
import type { World } from './World';

let mode: WorldMode = 'off';

// The ClientRouter replaces <html>'s attributes on every navigation, so the
// mode is written again after each swap.
function setMode(next: WorldMode) {
  mode = next;
  document.documentElement.dataset.world = next;
}
document.addEventListener('astro:after-swap', () => setMode(mode));

function decide(params: URLSearchParams): { mode: WorldMode; force: boolean; preview: boolean } {
  const { choice, asked } = worldSwitch(params);
  if (choice === 'off') return { mode: 'off', force: false, preview: false };
  const force = choice === 'force';
  if (!force && matchMedia('(prefers-reduced-motion: reduce)').matches) return { mode: 'reduced', force, preview: asked };
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  if (!force && connection?.saveData) return { mode: 'save-data', force, preview: asked };
  return { mode: 'on', force, preview: asked };
}

/** A WebGL2 context, or why there isn't one: only a software GPU ('weak'), or none at all. */
function createContext(
  canvas: HTMLCanvasElement,
  antialias: boolean,
  force: boolean,
): WebGL2RenderingContext | 'weak' | 'unsupported' {
  const gl = canvas.getContext('webgl2', {
    alpha: false,
    antialias,
    depth: true,
    stencil: false,
    powerPreference: 'high-performance',
    failIfMajorPerformanceCaveat: !force,
  });
  if (gl) return gl;
  if (force) return 'unsupported';
  // Ask again without the performance check, only to tell the two cases apart.
  const probe = document.createElement('canvas').getContext('webgl2');
  probe?.getExtension('WEBGL_lose_context')?.loseContext();
  return probe ? 'weak' : 'unsupported';
}

/** Mark the current person's tab. The bar is persisted, so it doesn't re-render. */
function markTab(person: string | undefined) {
  document.querySelectorAll<HTMLElement>('[data-crew-tabs] [data-tab]').forEach((tab) => {
    const current = tab.dataset.tab === person;
    tab.classList.toggle('is-active', current);
    if (current) {
      tab.setAttribute('aria-current', 'page');
      reveal(tab);
    } else tab.removeAttribute('aria-current');
  });
}

/** On a phone the tabs scroll sideways (world.css): keep the current one in view. */
function reveal(tab: HTMLElement) {
  const bar = tab.closest<HTMLElement>('[data-crew-tabs]');
  if (!bar || bar.scrollWidth <= bar.clientWidth) return;
  const t = tab.getBoundingClientRect();
  const b = bar.getBoundingClientRect();
  if (t.left < b.left) bar.scrollLeft -= b.left - t.left + 16;
  else if (t.right > b.right) bar.scrollLeft += t.right - b.right + 16;
}

const personOf = (route: WorldRoute) => ('person' in route ? route.person : undefined);

function connect(world: World) {
  world.camps = readCamps();
  const route = readRoute();
  world.setRoute(route);
  markTab(personOf(route));

  // Start leaving as soon as a link is followed, and hold the page swap until
  // the screen is in limbo, so the old page never changes in plain sight.
  document.addEventListener('astro:before-preparation', (event) => {
    const e = event as TransitionBeforePreparationEvent;
    const target = world.targetForPath(e.to.pathname);
    world.director.go(target, world.motion);
    world.wake();
    if (target.kind === 'biome') {
      const person = /^\/gear\/([a-z0-9-]+)\/(camp\/)?$/.exec(e.to.pathname)?.[1];
      markTab(person);
      const load = e.loader;
      e.loader = async () => {
        await Promise.all([load(), world.director.whenInLimbo()]);
      };
    }
  });
  document.addEventListener('astro:after-swap', () => {
    const next = readRoute();
    world.setRoute(next);
    markTab(personOf(next));
  });

  // Build a camp as soon as its tab is pointed at.
  const prefetch = (event: Event) => {
    const person = (event.target as HTMLElement).closest<HTMLElement>('[data-tab]')?.dataset.tab;
    const biome = world.campFor(person);
    if (biome) world.prefetch(biome);
  };
  const tabs = document.querySelector('[data-crew-tabs]');
  tabs?.addEventListener('pointerenter', prefetch, true);
  tabs?.addEventListener('focusin', prefetch);
  tabs?.addEventListener('touchstart', prefetch, { passive: true });
}

async function start() {
  const container = document.getElementById('world');
  if (!container || container.querySelector('canvas')) return;

  const params = new URLSearchParams(location.search);
  const decision = decide(params);
  if (decision.mode !== 'on') return setMode(decision.mode);

  const dev = devSwitches(params);
  const quality = qualityFor(dev.tier ?? guessTier());
  const canvas = document.createElement('canvas');
  const gl = createContext(canvas, quality.antialias, decision.force);
  if (typeof gl === 'string') return setMode(gl);

  setMode('loading');
  container.append(canvas);
  try {
    const { World } = await import('./World');
    const motion = matchMedia('(prefers-reduced-motion: reduce)').matches ? 'reduced' : 'full';
    const world = new World({ container, canvas, gl, quality, dev, motion, preview: decision.preview });
    if (devTools) {
      const { exposeWorld } = await import('./testing');
      exposeWorld(world);
      if (dev.debug) void import('./debug').then(({ mountDebug }) => mountDebug(world));
    }
    setMode('on');
    connect(world);
    // What you can point at and how you move, once the world is up.
    const root = document.getElementById('world-ui');
    if (root) {
      const [{ connectUi }, { connectControls }] = await Promise.all([import('./ui'), import('./controls')]);
      connectControls(world, connectUi(world, root));
    }
  } catch (error) {
    canvas.remove();
    setMode('error');
    console.error('[world] could not start', error);
  }
}

void start();
