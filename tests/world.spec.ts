import { expect, test } from '@playwright/test';
import { still, trackScripts, worldReady } from './helpers/page';

// Bone, the site background (#f7f6f3). Until M1 the world draws nothing else.
const BONE = [247, 246, 243];

test.describe('starting', () => {
  test('starts on /gear/, reports three r186 and clears to bone', async ({ page }) => {
    await page.goto('/gear/?world=force');
    await worldReady(page);
    const { revision, route, info } = await page.evaluate(() => ({
      revision: window.__world!.revision,
      route: window.__world!.route(),
      info: window.__world!.info(),
    }));
    expect(revision).toBe('186');
    expect(route).toEqual({ level: 'hub' });
    expect(info.calls).toBe(0);

    const [r, g, b, a] = await page.evaluate(() => window.__world!.pixel(0.5, 0.5));
    [r, g, b].forEach((channel, i) => expect(Math.abs(channel - BONE[i])).toBeLessThanOrEqual(1));
    expect(a).toBe(255);

    // It fills the viewport, behind the page.
    const world = page.locator('#world');
    expect((await world.boundingBox())?.width).toBe(page.viewportSize()!.width);
    expect(await world.evaluate((el) => getComputedStyle(el).zIndex)).toBe('-1');
  });

  test('is on by default', async ({ page }) => {
    await page.goto('/gear/harry/');
    // Running, or 'weak' on a machine with only a software GPU (headless Chromium); either way it isn't off.
    await page.waitForFunction(() => /^(on|weak)$/.test(document.documentElement.dataset.world ?? ''));
  });

  test('?world=off turns it off, and three.js never loads', async ({ page }) => {
    const scripts = trackScripts(page);
    await page.goto('/gear/?world=off');
    await page.waitForLoadState('networkidle');
    expect(await page.evaluate(() => document.documentElement.dataset.world)).toBe('off');
    expect(await page.locator('#world canvas').count()).toBe(0);
    expect(await page.evaluate(() => '__THREE__' in window)).toBe(false);
    expect(scripts.filter((path) => /World|three/i.test(path))).toEqual([]);
  });

  test('stays off for reduced motion unless forced', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/gear/?world=on');
    expect(await page.evaluate(() => document.documentElement.dataset.world)).toBe('reduced');
    await page.goto('/gear/?world=force');
    await worldReady(page);
  });

  test('?world=off is remembered in this browser until ?world=auto', async ({ page }) => {
    await page.goto('/gear/?world=off');
    await page.goto('/gear/harry/');
    expect(await page.evaluate(() => document.documentElement.dataset.world)).toBe('off');
    await page.goto('/gear/harry/?world=auto');
    await page.waitForFunction(() => /^(on|weak)$/.test(document.documentElement.dataset.world ?? ''));
  });
});

test('the canvas survives client navigation and follows the route', async ({ page }) => {
  // Two real travels, each a few seconds of scene time, and software WebGL
  // draws a frame every few hundred ms. This checks behaviour, not looks, so the low tier.
  test.slow();
  await page.goto('/gear/?world=force&tier=low');
  await worldReady(page);
  const instance = await page.evaluate(() => {
    (window as Window & { persistProbe?: Element | null }).persistProbe = document.querySelector('#world canvas');
    return window.__world!.instance;
  });
  const route = () => page.evaluate(() => window.__world!.route());

  // 1. Lineup to Harry, by clicking his figure.
  await page.locator('a.lineup__person[href="/gear/harry/"]').click();
  await page.waitForURL('**/gear/harry/');
  await expect.poll(route).toMatchObject({ level: 'biome', person: 'harry', camp: { biome: 'alpine-aurora' } });
  await still(page);

  // 2. Harry to Caleb, with the person page's arrow key.
  await page.keyboard.press('ArrowRight');
  await page.waitForURL('**/gear/caleb/');
  await expect.poll(route).toMatchObject({ level: 'biome', person: 'caleb', camp: { biome: 'maple-autumn' } });
  // The page is under paper until the travel ends.
  await still(page);

  // 3. Caleb to his clothing flat-lay, from his setup details (folded away over a
  // camp, as are the 2D figure and its hotspots).
  await page.getByRole('button', { name: 'Setup details' }).click();
  await page.locator('a[href="/gear/caleb/clothing/"]:visible').first().click();
  await page.waitForURL('**/gear/caleb/clothing/');
  await expect.poll(route).toEqual({ level: 'detail', person: 'caleb' });

  // Same document, same canvas element, same world, and the mode survived each swap.
  const after = await page.evaluate(() => ({
    sameCanvas:
      document.querySelector('#world canvas') ===
      (window as Window & { persistProbe?: Element | null }).persistProbe,
    instance: window.__world!.instance,
    mode: document.documentElement.dataset.world,
  }));
  expect(after).toEqual({ sameCanvas: true, instance, mode: 'on' });
});

test('the everyone page is hidden: Gear opens Harry’s camp, and nothing links to /gear/', async ({ page }) => {
  for (const path of ['/', '/photos', '/gear/harry/', '/gear/harry/camp/', '/gear/harry/clothing/', '/gear/harry/gear/tent/', '/gear/reviews/', '/gear/reviews/sample-pack/']) {
    await page.goto(`${path}?world=off`);
    await expect(page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Gear', exact: true }), path).toHaveAttribute('href', '/gear/harry/');
    await expect(page.locator('a[href="/gear/"]'), path).toHaveCount(0);
  }
  // Still there for anyone with the address, but kept out of search results.
  await page.goto('/gear/?world=off');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
});

test.describe('scope', () => {
  for (const path of ['/', '/photos']) {
    test(`no three.js on ${path}, even when forced`, async ({ page }) => {
      const scripts = trackScripts(page);
      await page.goto(`${path}?world=force`);
      await page.waitForLoadState('networkidle');
      expect(await page.locator('#world').count()).toBe(0);
      expect(await page.evaluate(() => '__THREE__' in window)).toBe(false);
      expect(scripts.filter((s) => /World|three/i.test(s))).toEqual([]);
    });
  }

  test('three.js downloads only once the world starts', async ({ page }) => {
    const scripts = trackScripts(page);
    await page.goto('/gear/?world=force');
    await worldReady(page);
    expect(scripts.some((s) => /World/.test(s))).toBe(true);
  });
});
