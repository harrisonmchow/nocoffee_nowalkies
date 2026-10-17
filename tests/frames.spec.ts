import { expect, test, type Page } from '@playwright/test';
import { openCamp, settledOn } from './helpers/page';

// M2's long-frame check (GEAR-3D-PLAN.md §7): no frame over 50 ms on desktop
// during a travel between camps. It needs a real GPU, so it runs in WebKit, in
// its own project after everything else (playwright.config.ts), and without
// trace recording, whose page snapshots cost frames of their own. The first travel in a fresh browser meets cold shader and
// pipeline caches, so it's held to the phone ceiling (100 ms); the travel
// back, in the same page, to the desktop one.
test.use({ trace: 'off' });

/** Frame intervals through one travel, leaving out the frame that swaps the page's HTML (the ClientRouter's work, not the world's). */
async function travelFrames(page: Page, tab: string, biome: string) {
  await page.evaluate(() => {
    const w = window as Window & { __frames?: number[]; __swapAt?: number; __run?: number };
    const run = (w.__run = (w.__run ?? 0) + 1);
    const frames: number[] = (w.__frames = []);
    w.__swapAt = -1;
    document.addEventListener('astro:after-swap', () => (w.__swapAt = performance.now()), { once: true });
    const tick = (now: number) => {
      if (w.__run !== run) return; // a later measurement has started
      frames.push(now);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await page.locator(`[data-tab="${tab}"]`).click();
  await settledOn(page, biome);
  const { stamps, swapAt } = await page.evaluate(() => {
    const w = window as Window & { __frames?: number[]; __swapAt?: number; __run?: number };
    w.__run = (w.__run ?? 0) + 1; // stop this measurement's loop
    return { stamps: w.__frames!.slice(), swapAt: w.__swapAt! };
  });
  const intervals = stamps.slice(1).map((t, i) => ({ start: stamps[i], ms: t - stamps[i] }));
  const swap = intervals.find((f) => f.start <= swapAt && swapAt <= f.start + f.ms);
  const world = intervals.filter((f) => f !== swap).map((f) => f.ms);
  return { count: intervals.length, worst: Math.max(...world), swap: swap?.ms ?? NaN };
}

test('no long frames while travelling between camps', async ({ page }, testInfo) => {
  await openCamp(page, 'harry', 'alpine-aurora', 'tier=low');
  await page.evaluate(() => window.__world!.prepare('rockies-night'));

  const first = await travelFrames(page, 'kevin', 'rockies-night');
  const back = await travelFrames(page, 'harry', 'alpine-aurora');
  const describe = (f: typeof first) => `${f.count} frames, worst ${f.worst.toFixed(1)} ms, page swap ${f.swap.toFixed(1)} ms`;
  testInfo.annotations.push({ type: 'first travel', description: describe(first) }, { type: 'travel back', description: describe(back) });
  expect(first.worst).toBeLessThan(100);
  expect(back.worst).toBeLessThan(50);
});
