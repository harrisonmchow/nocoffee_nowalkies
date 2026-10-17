import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { settle, still, uiReady, worldReady } from './helpers/page';

// Each page's axe results are kept as a text snapshot, "<rule> <selector>" per
// line, including issues that existed before the 3D work. A new issue fails the
// test; after fixing one (or an intended change), `npm run test:update` records
// the new list.
const tags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const routes = [
  '/gear/',
  '/gear/harry/',
  '/gear/harry/camp/',
  '/gear/harry/clothing/',
  '/gear/harry/gear/tent/',
  '/gear/reviews/',
  '/gear/reviews/sample-pack/',
];

test.skip(({ browserName }) => browserName === 'webkit', 'desktop and phone cover the layouts');

async function issues(page: Page) {
  const { violations } = await new AxeBuilder({ page }).withTags(tags).analyze();
  const lines = violations.flatMap((v) => v.nodes.map((node) => `${v.id} ${node.target.join(' ')}`));
  return [...new Set(lines)].sort().join('\n') + '\n';
}

const slug = (path: string) => path.replace(/^\/|\/$/g, '').replace(/\//g, '-') || 'home';

for (const path of routes) {
  test(`axe: ${path}`, async ({ page }) => {
    await page.goto(`${path}?world=off`);
    await settle(page);
    expect(await issues(page)).toMatchSnapshot(`axe-${slug(path)}.txt`);
  });
}

// With the canvas behind the page, axe can't tell what colour is behind the
// text, so it moves those contrast checks to "needs review". That's why this
// asks only that nothing new appears; contrast over the scene is checked from
// screenshots instead (M4).
// The landscape has the camp's marker over it, and the campsite its hotspots.
// Scene time is frozen so the world stops drawing once the camera is at rest:
// axe yields often, and software WebGL would otherwise draw a frame each time.
for (const path of ['/gear/harry/', '/gear/harry/camp/']) {
  test(`axe: the running world adds no issues on ${path}`, async ({ page }) => {
    await page.goto(`${path}?world=off`);
    await settle(page);
    const without = new Set((await issues(page)).split('\n'));
    await page.goto(`${path}?world=force&t=4`);
    await worldReady(page);
    await uiReady(page);
    await still(page);
    await settle(page);
    const added = (await issues(page)).split('\n').filter((line) => !without.has(line));
    expect(added).toEqual([]);
  });
}
