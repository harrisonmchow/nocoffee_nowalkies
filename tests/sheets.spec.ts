import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { test } from '@playwright/test';
import { contactSheet } from './helpers/contact-sheet';

// Runs after the other projects (see playwright.config.ts). One sheet per
// project of the fallback baselines, to review the regression set at a glance.
for (const project of ['desktop', 'phone', 'webkit']) {
  test(`fallback sheet: ${project}`, async ({ browser }) => {
    const dir = join('tests', '__snapshots__', 'fallback.spec.ts', project);
    test.skip(!existsSync(dir), 'no baselines yet: run `npm run test:update` first');
    const images = readdirSync(dir)
      .filter((file) => file.endsWith('.png'))
      .sort()
      .map((file) => ({ path: join(dir, file), label: file.replace(/\.png$/, '') }));
    await contactSheet(browser, images, join('tests', '.output', 'sheets', `fallback-${project}.png`), {
      title: `Fallback baselines: ${project}`,
      columns: project === 'phone' ? 7 : 4,
    });
  });
}
