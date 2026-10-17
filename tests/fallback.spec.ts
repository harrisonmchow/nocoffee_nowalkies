import { expect, test } from '@playwright/test';
import { settle } from './helpers/page';

// The 2D gear pages with the world switched off. They're the fallback for
// anyone the 3D world can't serve, so the 3D work must never change them.
// `npm run test:update` records new baselines after an intended change.
const routes = [
  ['lineup', '/gear/'],
  ['person', '/gear/harry/'],
  ['camp', '/gear/harry/camp/'],
  ['clothing', '/gear/harry/clothing/'],
  ['flat-lay', '/gear/harry/gear/'],
  ['item', '/gear/harry/gear/tent/'],
  ['reviews', '/gear/reviews/'],
  ['review', '/gear/reviews/sample-pack/'],
] as const;

// Chromium sometimes fails to capture a full-page screenshot at all while the
// camp specs keep the CPU busy with software WebGL ("Unable to capture
// screenshot"). One retry absorbs that; a real visual change fails both times.
test.describe.configure({ retries: 1 });

for (const [name, path] of routes) {
  test(`fallback: ${name}`, async ({ page }) => {
    await page.goto(`${path}?world=off`);
    await settle(page);
    await expect(page).toHaveScreenshot(`fallback-${name}.png`, { fullPage: true });
  });
}
