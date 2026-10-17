import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { contactSheet, type SheetImage } from './helpers/contact-sheet';
import { openCamp, still, uiReady } from './helpers/page';

// M3 (GEAR-3D-PLAN.md §9): Caleb's maples and Mikey's coast. Budgets on both
// tiers, a screenshot matrix, a seed sweep of what's planted, and the sea's
// diagnostic channels. Captures go to contact sheets in tests/.output/sheets/.

const OUT = 'tests/.output/sheets';
test.describe.configure({ mode: 'default', timeout: 180_000 });
test.beforeAll(() => mkdirSync(OUT, { recursive: true }));

const CAMPS = [
  { person: 'caleb', name: 'Caleb', biome: 'maple-autumn', own: ['maple-leaves', 'maple-far-crowns', 'spruces', 'leaf-carpet', 'falling-leaves', 'dog'] },
  { person: 'mikey', name: 'Mikey', biome: 'coast-sunset', own: ['sea', 'dune-grass', 'car'] },
] as const;

const info = (page: Page) =>
  page.evaluate(() => {
    window.__world!.render();
    return window.__world!.info();
  });

/** Save the canvas alone, without the page on top of it. */
async function capture(page: Page, path: string) {
  const url = await page.evaluate(() => window.__world!.capture());
  writeFileSync(path, Buffer.from(url.split(',')[1], 'base64'));
}

for (const camp of CAMPS) {
  test(`${camp.name}’s camp has its own things, within budget on both tiers`, async ({ page }) => {
    for (const tier of ['high', 'mid'] as const) {
      for (const view of ['landscape', 'camp'] as const) {
        await openCamp(page, camp.person, camp.biome, `t=4&tier=${tier}`, view);
        const i = await info(page);
        expect(i.tier).toBe(tier);
        expect(i.calls, `${tier} ${view}: draw calls`).toBeLessThanOrEqual(60);
        expect(i.triangles, `${tier} ${view}: triangles`).toBeLessThanOrEqual(250_000);
        expect(i.programs, `${tier} ${view}: programs`).toBeLessThanOrEqual(24);
        if (view === 'camp') {
          const shown = await page.evaluate((names) => names.filter((name) => !window.__world!.shows(name)), [...camp.own]);
          expect(shown, `${tier}: missing from the campsite`).toEqual([]);
        }
      }
    }
  });
}

test('a screenshot matrix: Caleb’s and Mikey’s landscape, campsite and tent, on both tiers', async ({ page }, testInfo) => {
  const images: SheetImage[] = [];
  const shot = async (label: string) => {
    const path = `${OUT}/m3-${testInfo.project.name}-${label.replace(/[^a-z0-9]+/gi, '-')}.png`;
    await capture(page, path);
    images.push({ path, label });
  };
  for (const camp of CAMPS) {
    for (const tier of ['high', 'mid'] as const) {
      await openCamp(page, camp.person, camp.biome, `t=4&tier=${tier}`);
      await shot(`${camp.person} ${tier} landscape`);
      await openCamp(page, camp.person, camp.biome, `t=4&tier=${tier}`, 'camp');
      await uiReady(page);
      await still(page);
      await shot(`${camp.person} ${tier} campsite`);
      await page.locator('.wui-hotspot', { hasText: 'Tent' }).locator('.wui-hotspot__dot').click();
      await page.waitForFunction(() => window.__world!.level() === 'tent');
      await still(page);
      await shot(`${camp.person} ${tier} tent`);
    }
  }
  await contactSheet(page.context().browser()!, images, `${OUT}/m3-matrix-${testInfo.project.name}.png`, {
    columns: 3,
    title: `Caleb and Mikey, high and mid tiers (${testInfo.project.name})`,
  });
});

test('Caleb’s maples keep their species from seed to seed', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'biomes-desktop', 'one run is enough');
  const images: SheetImage[] = [];
  const triangles: number[] = [];
  for (const seed of [1, 2, 3]) {
    await openCamp(page, 'caleb', 'maple-autumn', `t=4&seed=${seed}`, 'camp');
    await still(page);
    triangles.push((await info(page)).triangles);
    const path = `${OUT}/m3-maples-seed-${seed}.png`;
    await capture(page, path);
    images.push({ path, label: `seed ${seed}` });
  }
  // Other trees in other places, the same kind of tree: the camp's size barely moves.
  for (const n of triangles) expect(Math.abs(n - triangles[0]) / triangles[0]).toBeLessThan(0.15);
  await contactSheet(page.context().browser()!, images, `${OUT}/m3-maples-seeds.png`, { columns: 3, title: 'Three seeds of the same grove' });
});

test('Mikey’s sea: its crest, true depth and Fresnel come from the same waves', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'biomes-desktop', 'one run is enough');
  await openCamp(page, 'mikey', 'coast-sunset', 't=4');
  // From the beach, 40 m back from the water: close enough that the waves are resolved (from
  // the landscape, at a grazing angle, they're finer than a pixel and filtered away by design).
  await page.evaluate(() => window.__world!.station({ position: [-30, 22, -40], target: [-10, 0, -125], fov: 50 }));
  const images: SheetImage[] = [];
  for (const view of ['off', 'crest', 'depth', 'fresnel'] as const) {
    await page.evaluate((v) => window.__world!.seaView(v), view);
    const path = `${OUT}/m3-sea-${view}.png`;
    await capture(page, path);
    images.push({ path, label: view === 'off' ? 'final' : view });
  }
  // A column down through the sea to the beach. The debug channels skip the grade, so the
  // depth view's sea pixels are exactly blue 0.3 (77): that's how they're told from the beach.
  const column = (view: 'crest' | 'depth' | 'fresnel') =>
    page.evaluate((v) => {
      window.__world!.seaView(v);
      const points: [number, number][] = [];
      for (let y = 0.3; y <= 0.9; y += 0.01) points.push([0.3, y]);
      return window.__world!.pixels(points);
    }, view);
  const depth = await column('depth');
  const wet = depth.map((p, i) => (Math.abs(p[2] - 77) <= 3 ? i : -1)).filter((i) => i >= 0);
  expect(wet.length).toBeGreaterThan(8);
  // Further out (higher up the frame) is deeper than by the shore.
  expect(depth[wet[0]][1]).toBeGreaterThan(depth[wet[wet.length - 1]][1] + 20);
  // Seen at a grazing angle far out, the water reflects more than nearer the beach.
  const fresnel = await column('fresnel');
  expect(fresnel[wet[0]][0]).toBeGreaterThan(fresnel[wet[wet.length - 1]][0]);
  // And somewhere along the column a crest stands up.
  const crest = await column('crest');
  expect(Math.max(...wet.map((i) => crest[i][0]))).toBeGreaterThan(20);
  await page.evaluate(() => window.__world!.seaView('off'));
  await contactSheet(page.context().browser()!, images, `${OUT}/m3-sea.png`, { columns: 2, title: 'Mikey’s sea: final, crest metric, true depth, Fresnel' });
});
