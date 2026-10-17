import type { Page } from '@playwright/test';

/**
 * Make a page ready for a full-page capture: show every scroll-reveal block,
 * load lazy images and wait for fonts.
 */
export async function settle(page: Page) {
  await page.evaluate(async () => {
    document.querySelectorAll('[data-reveal]').forEach((el) => el.classList.add('is-in'));
    const images = [...document.images];
    images.forEach((img) => (img.loading = 'eager'));
    await Promise.all(images.map((img) => (img.complete ? null : img.decode().catch(() => null))));
    await document.fonts.ready;
  });
}

/** Wait until the world has started and drawn its first frame. */
export async function worldReady(page: Page) {
  await page.waitForFunction(() => document.documentElement.dataset.world === 'on' && !!window.__world);
  await page.evaluate(() => window.__world!.ready);
}

/** Collect the path of every script the page requests from now on. */
export function trackScripts(page: Page): string[] {
  const scripts: string[] = [];
  page.on('request', (request) => {
    if (request.resourceType() === 'script') scripts.push(new URL(request.url()).pathname);
  });
  return scripts;
}

/**
 * Open a camp with scene time frozen, its landscape (the person's page) or its
 * campsite, and wait until it's shown at rest.
 */
export async function openCamp(page: Page, person: string, biome: string, query = 't=4', view: 'landscape' | 'camp' = 'landscape') {
  await page.goto(`/gear/${person}/${view === 'camp' ? 'camp/' : ''}?world=force&${query}`);
  await worldReady(page);
  await page.waitForFunction((b) => {
    const i = window.__world!.info();
    return i.shown === b && i.paper === 0 && i.phase === 'idle';
  }, biome);
}

/**
 * Wait until the camera has come to rest. Software WebGL draws a frame every
 * few hundred ms, and each frame moves the camera at most 0.1 s, so moves take
 * far longer here than their own duration.
 */
export const still = (page: Page) => page.waitForFunction(() => !window.__world!.moving(), null, { timeout: 30_000 });

/** Wait until what sits over the world (marker, hotspots, cards) is up and showing this level. */
export const uiReady = (page: Page) =>
  page.waitForFunction(() => {
    const root = document.getElementById('world-ui');
    return !!root?.querySelector('.wui-foot') && !!root.dataset.level && root.dataset.level === window.__world!.level();
  });

/** Wait until the camp is shown, at rest and in full view. */
export const settledOn = (page: Page, biome: string) =>
  page.waitForFunction((b) => {
    const i = window.__world!.info();
    return i.shown === b && i.phase === 'idle' && i.paper === 0;
  }, biome);
