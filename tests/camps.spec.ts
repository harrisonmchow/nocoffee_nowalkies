import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { contactSheet, type SheetImage } from './helpers/contact-sheet';
import { openCamp, settledOn, still, uiReady } from './helpers/page';

// M1, M2 and M4's gear level (GEAR-3D-PLAN.md §9): Harry's and Kevin's camps,
// the cursor on the clouds, the travel between camps, and each camp's three
// levels: its landscape, the campsite and the tent. Captures go to contact
// sheets in tests/.output/sheets/ for a person to look at; the assertions check
// what can be measured: budgets, colours where they must be, the timeline and
// the URL.

const OUT = 'tests/.output/sheets';
const BONE = [247, 246, 243];

// Software WebGL (SwiftShader) is slow, and parallel workers starve each
// other, so these run one at a time, in order, with room to breathe. The
// real-time tests below check behaviour, not looks, so they use the low tier.
test.describe.configure({ mode: 'default', timeout: 120_000 });
const REALTIME = 'tier=low';

type Stats = { green: number; warm: number; lum: number; maxLum: number; sat: number };

/** Save the canvas alone, without the page on top of it. */
async function capture(page: Page, path: string) {
  const url = await page.evaluate(() => window.__world!.capture());
  writeFileSync(path, Buffer.from(url.split(',')[1], 'base64'));
}

/** Colour statistics over part of the canvas (fractions from its top left). */
function stats(page: Page, region: [number, number, number, number] = [0, 0, 1, 1]) {
  return page.evaluate(async (r): Promise<Stats> => {
    const img = new Image();
    img.src = window.__world!.capture();
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const g = canvas.getContext('2d')!;
    g.drawImage(img, 0, 0);
    const x0 = Math.floor(r[0] * img.width);
    const y0 = Math.floor(r[1] * img.height);
    const data = g.getImageData(x0, y0, Math.ceil(r[2] * img.width) - x0, Math.ceil(r[3] * img.height) - y0).data;
    let green = -255;
    let warm = -255;
    let lum = 0;
    let maxLum = 0;
    let sat = 0;
    let n = 0;
    for (let i = 0; i < data.length; i += 4 * 3) {
      const [R, G, B] = [data[i], data[i + 1], data[i + 2]];
      const l = 0.2126 * R + 0.7152 * G + 0.0722 * B;
      const max = Math.max(R, G, B);
      green = Math.max(green, G - Math.max(R, B));
      warm = Math.max(warm, R - B);
      maxLum = Math.max(maxLum, l);
      lum += l;
      sat += max === 0 ? 0 : (max - Math.min(R, G, B)) / max;
      n++;
    }
    return { green, warm, lum: lum / n, maxLum, sat: sat / n };
  }, region);
}

type TraceFrame = { shown: string | null; phase: string; paper: number; fly: number };

/** Record the world's state on every animation frame until stopped. */
async function startTrace(page: Page) {
  await page.evaluate(() => {
    const w = window as Window & { __trace?: TraceFrame[]; __tracing?: boolean };
    w.__trace = [];
    w.__tracing = true;
    const tick = () => {
      if (!w.__tracing) return;
      const i = window.__world!.info();
      w.__trace!.push({ shown: i.shown, phase: i.phase, paper: i.paper, fly: window.__world!.fly() });
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  return () =>
    page.evaluate(() => {
      const w = window as Window & { __trace?: TraceFrame[]; __tracing?: boolean };
      w.__tracing = false;
      return w.__trace!;
    });
}

const currentTab = (page: Page) => page.locator('[data-crew-tabs] [aria-current="page"]').getAttribute('data-tab');
const level = (page: Page) => page.evaluate(() => window.__world!.level());
const pathname = (page: Page) => new URL(page.url()).pathname;

test.beforeAll(() => mkdirSync(OUT, { recursive: true }));

test.describe('Harry’s camp (M1)', () => {
  test('draws the aurora, the cloud sea and the campfire, within budget', async ({ page }) => {
    // The landscape, then the campsite with its kit and the person in it.
    for (const view of ['landscape', 'camp'] as const) {
      await openCamp(page, 'harry', 'alpine-aurora', 't=4', view);
      const info = await page.evaluate(() => window.__world!.info());
      // Mid tier is binding (§7); every tier has to fit the biome budget.
      expect(info.calls, view).toBeLessThanOrEqual(60);
      expect(info.triangles, view).toBeLessThanOrEqual(250_000);
      expect(info.programs, view).toBeLessThanOrEqual(24);

      const sky = await stats(page, [0, 0, 1, 0.25]);
      expect(sky.green, `the aurora is green in the sky (${view})`).toBeGreaterThan(25);
      const all = await stats(page);
      expect(all.lum, `a night scene, not paper (${view})`).toBeLessThan(170);
      if (view === 'camp') expect(all.warm, 'the campfire glows').toBeGreaterThan(80);
    }
  });

  test('design, near and far views, and the field mosaic', async ({ page }, testInfo) => {
    await openCamp(page, 'harry', 'alpine-aurora');
    const dir = `${OUT}/m1-${testInfo.project.name}`;
    mkdirSync(dir, { recursive: true });
    const images: SheetImage[] = [];
    const shot = async (name: string) => {
      const path = `${dir}/${name}.png`;
      await capture(page, path);
      images.push({ path, label: name });
    };

    await shot('design');
    for (const name of ['height', 'slope', 'snow', 'rock', 'cavity', 'ridge', 'albedo'] as const) {
      await page.evaluate((n) => window.__world!.view(n), name);
      await shot(`field-${name}`);
    }
    await page.evaluate(() => window.__world!.view('final'));
    for (const name of ['density', 'pointer'] as const) {
      await page.evaluate((n) => window.__world!.cloudView(n), name);
      await shot(`cloud-${name}`);
    }
    await page.evaluate(() => window.__world!.cloudView('off'));
    // Near the tent, and far out over the valley looking back.
    await page.evaluate(() => window.__world!.station({ position: [3, 2.2, 9], target: [-2, 0.4, -6], fov: 50 }));
    await shot('near');
    await page.evaluate(() => window.__world!.station({ position: [-300, 420, -900], target: [-200, 150, -3400], fov: 50 }));
    await shot('far');

    await contactSheet(page.context().browser()!, images, `${OUT}/m1-${testInfo.project.name}.png`, {
      title: `Harry, frozen at t=4 (${testInfo.project.name})`,
    });
  });

  test('the cursor parts the cloud in front of the landscape and it fills back in, while the cloud sea stays put', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'phone', 'no hover on a phone');
    await openCamp(page, 'harry', 'alpine-aurora');
    // Hold the camera still, so a sweep changes only what the cursor touches.
    await page.evaluate(() => {
      window.__world!.holdLook(true);
      window.__world!.step(240);
    });
    expect(await page.evaluate(() => window.__world!.shows('foreground-clouds'))).toBe(true);
    const box = page.viewportSize()!;
    // A row of pixels across the frame (fractions, from its top left), and how much a row changed.
    const row = (from: number, to: number, y: number) =>
      page.evaluate(([a, b, at]) => {
        const points: [number, number][] = [];
        for (let x = a; x <= b + 1e-6; x += 0.02) points.push([x, at]);
        return window.__world!.pixels(points).flatMap((p) => p.slice(0, 3));
      }, [from, to, y] as const);
    const change = (a: number[], b: number[]) => a.reduce((sum, v, i) => sum + Math.abs(v - b[i]), 0) / a.length;
    const images: SheetImage[] = [];
    const sweep = async (from: number, to: number, y: number, shots = false) => {
      const steps = 18;
      await page.mouse.move(box.width * from, box.height * y);
      for (let i = 1; i <= steps; i++) {
        await page.mouse.move(box.width * (from + ((to - from) * i) / steps), box.height * y + Math.sin(i / 3) * 18);
        await page.evaluate(() => window.__world!.step(2));
        if (shots && i % 6 === 0) {
          const path = `${OUT}/m1-sweep-${testInfo.project.name}-${i / 6}.png`;
          await capture(page, path);
          images.push({ path, label: `during ${i / 6}` });
        }
      }
    };

    // Along the bottom, where the cloud in front lies thick, a sweep parts it...
    const low = 0.86;
    const before = await row(0.6, 0.92, low);
    await sweep(0.58, 0.94, low, true);
    expect(change(before, await row(0.6, 0.92, low))).toBeGreaterThan(6);
    // (the pointer history, blue for intensity, shows along the path; how strong depends
    // on how fast the cursor moved, in real time, so take the peak)
    const peak = () =>
      page.evaluate((at) => {
        const points: [number, number][] = [];
        for (let x = 0.6; x <= 0.92; x += 0.02) points.push([x, at]);
        return Math.max(...window.__world!.pixels(points).map((p) => p[2]));
      }, low);
    await page.evaluate(() => window.__world!.cloudView('pointer'));
    expect(await peak()).toBeGreaterThan(30);
    await page.evaluate(() => window.__world!.cloudView('off'));
    // ...and a few seconds later it has filled back in.
    await page.evaluate(() => window.__world!.step(300));
    expect(change(before, await row(0.6, 0.92, low))).toBeLessThan(1.5);
    const path = `${OUT}/m1-sweep-${testInfo.project.name}-settled.png`;
    await capture(page, path);
    images.push({ path, label: 'settled' });

    // Over the middle of the frame there's only the cloud sea beyond, and a sweep moves nothing.
    const sea = await row(0.4, 0.6, 0.45);
    await sweep(0.38, 0.62, 0.45);
    expect(change(sea, await row(0.4, 0.6, 0.45))).toBeLessThan(0.5);
    await contactSheet(page.context().browser()!, images, `${OUT}/m1-sweep-${testInfo.project.name}.png`, {
      columns: 2,
      title: 'A cursor sweep through the cloud in front of the landscape',
    });
  });
});

test.describe('a small phone (M1)', () => {
  test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });

  test('frames the camp above the panel', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'one run is enough');
    // On the landscape, the camp's marker and the hint sit in the stage, clear of the panel.
    await openCamp(page, 'harry', 'alpine-aurora', 't=4&tier=mid');
    await uiReady(page);
    // Nothing widens the page (the tabs scroll within it), or the fixed canvas would reach past the screen.
    const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(await overflow()).toBe(0);
    const box = (await page.locator('[data-stage]').boundingBox())!;
    const marker = (await page.evaluate(() => window.__world!.campPoint()))!;
    expect(marker.y).toBeGreaterThan(box.y);
    expect(marker.y).toBeLessThan(box.y + box.height);
    const hint = (await page.locator('.wui-hint').boundingBox())!;
    expect(hint.y + hint.height).toBeLessThanOrEqual(box.y + box.height);
    await expect(page.locator('.wui-hint')).toHaveText('Swipe up to fly closer');
    await page.screenshot({ path: `${OUT}/m4-phone-390-landscape.png` });

    await openCamp(page, 'harry', 'alpine-aurora', 't=4&tier=mid', 'camp');
    await uiReady(page);
    expect(await overflow()).toBe(0);
    const info = await page.evaluate(() => window.__world!.info());
    expect(info.pixelRatio).toBeLessThanOrEqual(1.5);
    expect(info.calls).toBeLessThanOrEqual(60);
    await page.screenshot({ path: `${OUT}/m1-phone-390.png` });
    // The camp sits in the stage: the fire's glow is above the panel.
    const stage = await page.locator('[data-stage]').boundingBox();
    const fireRow = await page.evaluate(async () => {
      const img = new Image();
      img.src = window.__world!.capture();
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const g = c.getContext('2d')!;
      g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, img.width, img.height).data;
      let best = 0;
      let row = 0;
      for (let i = 0; i < d.length; i += 4 * 7) {
        const warm = d[i] - d[i + 2];
        if (warm > best) {
          best = warm;
          row = Math.floor(i / 4 / img.width);
        }
      }
      return row / img.height;
    });
    const viewport = page.viewportSize()!;
    expect(fireRow * viewport.height).toBeGreaterThan(stage!.y);
    expect(fireRow * viewport.height).toBeLessThan(stage!.y + stage!.height);
  });
});

test.describe('Kevin’s camp and the travel between camps (M2)', () => {
  test('Kevin’s camp draws the night sky and the frozen lake, within budget', async ({ page }) => {
    for (const view of ['landscape', 'camp'] as const) {
      await openCamp(page, 'kevin', 'rockies-night', 't=4', view);
      const info = await page.evaluate(() => window.__world!.info());
      expect(info.calls, view).toBeLessThanOrEqual(60);
      expect(info.triangles, view).toBeLessThanOrEqual(250_000);
      expect(info.programs, view).toBeLessThanOrEqual(24);
      const sky = await stats(page, [0, 0, 1, 0.3]);
      expect(sky.lum, `a dark sky (${view})`).toBeLessThan(110);
      expect(sky.maxLum, `stars or the moon (${view})`).toBeGreaterThan(150);
      if (view === 'camp') expect((await stats(page)).warm, 'the campfire glows').toBeGreaterThan(80);
    }
  });

  test('Harry to Kevin: twelve frames, and the swap happens under paper', async ({ page }, testInfo) => {
    await openCamp(page, 'harry', 'alpine-aurora');
    await page.evaluate(() => window.__world!.prepare('rockies-night'));
    await page.evaluate(() => window.__world!.director.manual(true));
    await page.locator('[data-tab="kevin"]').click();

    const images: SheetImage[] = [];
    const seen: { t: number; shown: string | null; sat: number; paper: number; centre: number[] }[] = [];
    for (const t of [0, 0.2, 0.4, 0.6, 0.8, 1.0, 1.2, 1.4, 1.6, 1.8, 2.0, 2.2]) {
      // The page swaps once the camp has drained to grey (whenInLimbo), before the gate at 1.0 s.
      if (t === 0.8) await page.waitForURL('**/gear/kevin/');
      await page.evaluate((s) => window.__world!.director.seek(s), t);
      const path = `${OUT}/m2-travel-${testInfo.project.name}-${t.toFixed(1)}.png`;
      await capture(page, path);
      images.push({ path, label: `${t.toFixed(1)} s` });
      seen.push({ t, ...(await page.evaluate(() => {
        const i = window.__world!.info();
        return { shown: i.shown, paper: i.paper, sat: window.__world!.saturation(), centre: window.__world!.pixel(0.5, 0.5) };
      })) });
    }
    await contactSheet(page.context().browser()!, images, `${OUT}/m2-travel-${testInfo.project.name}.png`, {
      title: `Harry to Kevin, seeked through the Director (${testInfo.project.name})`,
    });

    const at = (t: number) => seen.find((s) => s.t === t)!;
    // Before the gate it's Harry's camp; from the gate on, Kevin's.
    expect(seen.filter((s) => s.t < 1).every((s) => s.shown === 'alpine-aurora')).toBe(true);
    expect(seen.filter((s) => s.t >= 1).every((s) => s.shown === 'rockies-night')).toBe(true);
    // At the swap the screen is the page's paper: no colour, nothing of either camp.
    expect(at(1.0).paper).toBe(1);
    expect(at(1.0).sat).toBeLessThan(0.03);
    at(1.0).centre.slice(0, 3).forEach((channel, i) => expect(Math.abs(channel - BONE[i])).toBeLessThanOrEqual(2));
    // Grey clay in between (the limbo palette is a touch warm), full colour at both ends.
    expect(at(0.6).sat).toBeLessThan(0.05);
    expect(at(1.4).sat).toBeLessThan(0.05);
    expect(at(0).sat).toBeGreaterThan(0.12);
    expect(at(2.2).sat).toBeGreaterThan(0.12);
    expect(await currentTab(page)).toBe('kevin');
  });

  test('an interrupt goes straight to the newest camp', async ({ page }) => {
    await openCamp(page, 'harry', 'alpine-aurora', REALTIME);
    const stop = await startTrace(page);
    // Hold the timeline while draining toward Kevin, then click Caleb and let it run.
    await page.evaluate(() => window.__world!.director.manual(true));
    await page.locator('[data-tab="kevin"]').click();
    await page.evaluate(() => window.__world!.director.seek(0.3));
    await page.locator('[data-tab="caleb"]').click();
    await page.evaluate(() => window.__world!.director.manual(false));
    await settledOn(page, 'maple-autumn');
    const trace = await stop();
    // (Kevin's set may be swapped in under the paper; it must never be seen.)
    expect(trace.some((s) => s.shown === 'rockies-night' && s.paper < 0.999), 'Kevin’s camp never shows').toBe(false);
    expect(new URL(page.url()).pathname).toBe('/gear/caleb/');
    expect(await currentTab(page)).toBe('caleb');
  });

  test('back travels to the camp before', async ({ page }) => {
    await openCamp(page, 'harry', 'alpine-aurora', REALTIME);
    await page.locator('[data-tab="kevin"]').click();
    await settledOn(page, 'rockies-night');
    const stop = await startTrace(page);
    await page.goBack();
    await settledOn(page, 'alpine-aurora');
    const trace = await stop();
    expect(trace.some((s) => s.phase === 'travel'), 'it travels rather than cuts').toBe(true);
    expect(new URL(page.url()).pathname).toBe('/gear/harry/');
    expect(await currentTab(page)).toBe('harry');
  });

  test('builds a camp as soon as its tab is pointed at', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'phone', 'touchstart is the phone’s version, and tapping navigates');
    await openCamp(page, 'harry', 'alpine-aurora');
    expect(await page.evaluate(() => window.__world!.built())).not.toContain('maple-autumn');
    await page.locator('[data-tab="caleb"]').hover();
    await expect.poll(() => page.evaluate(() => window.__world!.built())).toContain('maple-autumn');
  });

  test('a camp that is slow to build waits under paper, with a loading line', async ({ page }) => {
    await openCamp(page, 'harry', 'alpine-aurora', REALTIME);
    await page.evaluate(() => window.__world!.slowPrepare(9000));
    await page.locator('[data-tab="mikey"]').click();
    await page.waitForFunction(() => 'worldWait' in document.documentElement.dataset, null, { timeout: 15_000 });
    const held = await page.evaluate(() => window.__world!.info());
    expect(held.paper).toBe(1);
    expect(held.shown).toBe('alpine-aurora');
    await expect(page.locator('[data-crew-tabs] .crew-tabs__list')).toBeVisible();
    // On paper the tabs turn to ink, or they'd be white on white.
    expect(await page.evaluate(() => 'worldPaper' in document.documentElement.dataset)).toBe(true);
    await expect(page.locator('[data-crew-tabs] [aria-current="page"]')).toHaveCSS('color', 'rgb(17, 17, 17)');
    await settledOn(page, 'coast-sunset');
    expect(await page.evaluate(() => 'worldWait' in document.documentElement.dataset)).toBe(false);
  });

  test('with reduced motion, camps cut through paper and nothing moves', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openCamp(page, 'harry', 'alpine-aurora', REALTIME);
    const time = await page.evaluate(() => window.__world!.time());
    const stop = await startTrace(page);
    await page.locator('[data-tab="kevin"]').click();
    await settledOn(page, 'rockies-night');
    const trace = await stop();
    expect(trace.some((s) => s.phase === 'leaving' || s.phase === 'travel'), 'no flight').toBe(false);
    expect(trace.some((s) => s.paper >= 0.999), 'a cut through paper').toBe(true);
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => window.__world!.time()), 'scene time stands still').toBe(time);
  });

});

test.describe('the landscape, the campsite and the tent (M4)', () => {
  const card = (page: Page) => page.locator('#wui-card');
  const dot = (page: Page, label: string) => page.locator('.wui-hotspot', { hasText: label }).locator('.wui-hotspot__dot');
  const scene = (page: Page) => {
    const box = page.viewportSize()!;
    return { x: box.width * 0.12, y: box.height * 0.85 };
  };

  test('over a camp the panel starts minimized, and Setup details opens it', async ({ page }, testInfo) => {
    await openCamp(page, 'harry', 'alpine-aurora');
    const panel = page.locator('.panel');
    const details = page.locator('.panel__details');
    const toggle = page.getByRole('button', { name: 'Setup details' });
    // Minimized: the name and the button, and nothing else. (The landscape is the top of a
    // person's gear, with the everyone page hidden, so it has no way back; the campsite does.)
    await expect(panel.locator('.panel__head .g-back')).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 1, name: 'Harry' })).toBeVisible();
    await expect(details).toBeHidden();
    await expect(page.locator('.panel__meta')).toBeHidden();
    await expect(page.locator('[data-to-camp]')).toBeHidden();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    // A small card with a small name: on a wide screen, in the right-hand third.
    const size = await page.locator('.panel h1').evaluate((h) => parseFloat(getComputedStyle(h).fontSize));
    expect(size).toBeLessThanOrEqual(48);
    const wide = testInfo.project.name !== 'phone';
    if (wide) {
      const card = (await panel.boundingBox())!;
      expect(card.width).toBeLessThanOrEqual(360);
      expect(card.x).toBeGreaterThan(page.viewportSize()!.width * 0.6);
    }
    const before = (await page.evaluate(() => window.__world!.campPoint()))!;
    await toggle.click();
    await expect(details).toBeVisible();
    await expect(page.locator('.panel__meta')).toBeVisible();
    await expect(page.locator('[data-to-camp]')).toBeVisible();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('.g-spec')).toContainText('Base weight');
    // Open, the panel runs down the right, so the shot moves left of it (on a phone it's below the camp).
    await still(page);
    const after = (await page.evaluate(() => window.__world!.campPoint()))!;
    if (wide) expect(after.x).toBeLessThan(before.x - 50);
    else expect(Math.abs(after.x - before.x)).toBeLessThan(2);
    await toggle.click();
    await expect(details).toBeHidden();
    // In 2D the details are always open, and there's no button.
    await page.goto('/gear/harry/?world=off');
    await expect(details).toBeVisible();
    await expect(toggle).toBeHidden();
  });

  test('Go to campsite dives through a cloud to the campsite, and Esc rises back out', async ({ page }, testInfo) => {
    await openCamp(page, 'harry', 'alpine-aurora');
    await page.evaluate(() => window.__world!.director.manual(true));
    // The marker's link: the panel's own Go to campsite is in the minimized card.
    await page.locator('.wui-marker__go').click();
    await page.waitForURL('**/gear/harry/camp/');
    const images: SheetImage[] = [];
    const seen: { t: number; fly: number; shown: string | null; paper: number }[] = [];
    for (const t of [0, 0.3, 0.6, 0.9, 1.2, 1.5, 1.8]) {
      await page.evaluate((s) => window.__world!.director.seek(s), t);
      const shot = `${OUT}/m4-dive-${testInfo.project.name}-${t.toFixed(1)}.png`;
      await capture(page, shot);
      images.push({ path: shot, label: `${t.toFixed(1)} s` });
      seen.push({ t, ...(await page.evaluate(() => ({ fly: window.__world!.fly(), shown: window.__world!.info().shown, paper: window.__world!.info().paper }))) });
    }
    await contactSheet(page.context().browser()!, images, `${OUT}/m4-dive-${testInfo.project.name}.png`, {
      columns: 4,
      title: `Harry’s landscape to his campsite, seeked through the Director (${testInfo.project.name})`,
    });
    // The same camp throughout and never paper: clear to begin with, then the cloud fills the frame on the way down.
    expect(seen.every((s) => s.shown === 'alpine-aurora' && s.paper === 0)).toBe(true);
    expect(seen[0].fly).toBeLessThan(0.05);
    expect(Math.max(...seen.map((s) => s.fly))).toBeGreaterThan(0.9);
    await page.evaluate(() => window.__world!.director.manual(false));
    await expect.poll(() => level(page)).toBe('camp');
    expect(await page.evaluate(() => window.__world!.route().level)).toBe('camp');
    await expect(page.getByRole('link', { name: 'Landscape' })).toBeVisible();

    // Esc goes up a level: back up through the cloud to the landscape.
    const stop = await startTrace(page);
    await page.keyboard.press('Escape');
    await page.waitForURL('**/gear/harry/');
    await expect.poll(() => level(page), { timeout: 15_000 }).toBe('landscape');
    const trace = await stop();
    expect(trace.some((s) => s.phase === 'rising'), 'it rises rather than cuts').toBe(true);
    expect(trace.every((s) => s.paper < 0.001), 'never through paper').toBe(true);
  });

  test('scrolling flies closer to the camp and dives in; scrolling back up rises out again', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'phone', 'a phone swipes instead');
    await openCamp(page, 'harry', 'alpine-aurora', REALTIME);
    await uiReady(page);
    await page.mouse.move(scene(page).x, scene(page).y);
    await page.mouse.wheel(0, 300);
    await expect.poll(() => page.evaluate(() => window.__world!.zoom())).toBeGreaterThan(0.1);
    expect(pathname(page)).toBe('/gear/harry/');
    expect(await level(page)).toBe('landscape');

    const stop = await startTrace(page);
    for (let i = 0; i < 15 && pathname(page) === '/gear/harry/'; i++) await page.mouse.wheel(0, 200);
    await page.waitForURL('**/gear/harry/camp/');
    await expect.poll(() => level(page), { timeout: 15_000 }).toBe('camp');
    const trace = await stop();
    expect(trace.some((s) => s.phase === 'diving'), 'a dive').toBe(true);
    // Sampled in real time, so maybe not at its very peak.
    expect(Math.max(...trace.map((s) => s.fly)), 'through the cloud').toBeGreaterThan(0.5);

    // At the campsite, down goes closer and up comes back out; well past the far limit, up to the landscape.
    const distance = () => page.evaluate(() => window.__world!.orbit().distance);
    const start = await distance();
    await page.mouse.wheel(0, 200);
    await expect.poll(distance).toBeLessThan(start - 1);
    // Pulling back out has to keep going to count, and real wheel events arrive
    // here a slow software-rendered frame apart, so this one goes as a burst.
    await page.evaluate(({ x, y }) => {
      const target = document.elementFromPoint(x, y)!;
      for (let i = 0; i < 12; i++) target.dispatchEvent(new WheelEvent('wheel', { deltaY: -200, clientX: x, clientY: y, bubbles: true, cancelable: true }));
    }, scene(page));
    await page.waitForURL('**/gear/harry/');
    await expect.poll(() => level(page), { timeout: 15_000 }).toBe('landscape');
  });

  test('at the campsite, the person shows what they wear and the tent shows the tent', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'phone', 'no hover on a phone (it taps, below)');
    await openCamp(page, 'harry', 'alpine-aurora', 't=4', 'camp');
    await uiReady(page);
    await still(page);
    expect(Object.keys(await page.evaluate(() => window.__world!.anchors())).sort()).toEqual(['clothing', 'pack', 'stove', 'tent', 'water']);
    // Each dot sits above its thing, on a stem down to it, so it never covers it (the stove and its water most of all).
    const at = await page.evaluate(() => window.__world!.anchors());
    for (const [id, label] of [['clothing', 'Clothing'], ['pack', 'Pack'], ['tent', 'Tent'], ['stove', 'Stove and pot'], ['water', 'Water bottles']] as const) {
      const box = (await dot(page, label).boundingBox())!;
      expect(box.y + box.height / 2, `${label}'s dot`).toBeLessThan(at[id].y);
    }
    // Pointing at the person themselves (below their hotspot): what they wear, and what's packed.
    const on = await page.evaluate(() => window.__world!.anchors(0.4));
    await page.mouse.move(on.clothing.x, on.clothing.y);
    await expect(card(page)).toBeVisible();
    await expect(card(page)).toContainText('Harry’s clothing');
    for (const name of ['Hat', 'Rain jacket', 'Down jacket', 'Fleece', 'Hiking shirt', 'Hiking pants', 'Hiking socks', 'Trail shoes']) {
      await expect(card(page)).toContainText(name);
    }
    await expect(card(page).locator('.tag', { hasText: 'Packed' })).toHaveCount(3);
    await page.screenshot({ path: `${OUT}/m4-camp-clothing-${testInfo.project.name}.png` });
    // Off the person, the card goes.
    await page.mouse.move(scene(page).x, scene(page).y);
    await expect(card(page)).toBeHidden();
    // The tent itself: what it is, and that a click goes inside.
    await page.mouse.move(on.tent.x, on.tent.y);
    await expect(card(page)).toContainText('Harry’s shelter');
    await expect(card(page)).toContainText('Zorali SummitSeeker 2P');
    await expect(card(page)).toContainText('Click to look inside');
    await page.screenshot({ path: `${OUT}/m4-camp-tent-${testInfo.project.name}.png` });
    // A piece of kit by its hotspot, pinned by a click, with a link to its page; Esc puts it away.
    await dot(page, 'Stove and pot').click();
    await expect(card(page)).toHaveClass(/is-pinned/);
    await expect(card(page).getByRole('link', { name: 'Details' })).toHaveAttribute('href', '/gear/harry/gear/stove/');
    await page.keyboard.press('Escape');
    await expect(card(page)).toBeHidden();
    expect(pathname(page)).toBe('/gear/harry/camp/');
  });

  test('Harry’s camp has a dog, and the cloud in front belongs to the landscape alone', async ({ page }) => {
    await openCamp(page, 'harry', 'alpine-aurora');
    const shown = () => page.evaluate(() => ({ dog: window.__world!.shows('dog'), cloud: window.__world!.shows('foreground-clouds') }));
    expect((await shown()).cloud).toBe(true);
    await openCamp(page, 'harry', 'alpine-aurora', 't=4', 'camp');
    await uiReady(page);
    expect(await shown()).toEqual({ dog: true, cloud: false });
    // In the tent (whose inside view is a fixed station too), still no cloud in front.
    await dot(page, 'Tent').click();
    await page.waitForFunction(() => window.__world!.level() === 'tent');
    expect((await shown()).cloud).toBe(false);
  });

  test('Kevin’s camp has neither a dog nor the cloud in front', async ({ page }) => {
    const shown = () => page.evaluate(() => ({ dog: window.__world!.shows('dog'), cloud: window.__world!.shows('foreground-clouds') }));
    await openCamp(page, 'kevin', 'rockies-night', 't=4', 'camp');
    expect(await shown()).toEqual({ dog: false, cloud: false });
    await openCamp(page, 'kevin', 'rockies-night');
    expect((await shown()).cloud).toBe(false);
  });

  test('Harry’s tent is his Zorali SummitSeeker; a camp without a real tent keeps the stand-in', async ({ page }) => {
    const parts = () => page.evaluate(() => ['summitseeker', 'summitseeker-fly', 'summitseeker-inner', 'summitseeker-canopy', 'summitseeker-frame'].map((name) => window.__world!.shows(name)));
    // Pitched as soon as the camp is built, so it's there from the landscape, before the kit arrives.
    await openCamp(page, 'harry', 'alpine-aurora');
    expect(await parts()).toEqual([true, true, true, true, true]);
    await openCamp(page, 'harry', 'alpine-aurora', 't=4', 'camp');
    expect(await parts()).toEqual([true, true, true, true, true]);
    await openCamp(page, 'kevin', 'rockies-night', 't=4', 'camp');
    expect(await parts()).toEqual([false, false, false, false, false]);
  });

  test('clicking the tent goes inside, to the sleeping bag, the mat and the pillow', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'phone', 'the phone taps its way in, below');
    await openCamp(page, 'harry', 'alpine-aurora', 't=4', 'camp');
    await uiReady(page);
    await still(page);
    const tent = async () => (await page.evaluate(() => window.__world!.anchors(0.4))).tent;
    let at = await tent();
    await page.mouse.click(at.x, at.y);
    await expect.poll(() => level(page)).toBe('tent');
    await uiReady(page);
    expect(Object.keys(await page.evaluate(() => window.__world!.anchors())).sort()).toEqual(['headtorch', 'pillow', 'sleeping-bag', 'sleeping-pad']);
    // Once the camera is in and the fly has faded, each has its hotspot, clear of the panel.
    await still(page);
    for (const name of ['Sleeping pad', 'Sleeping bag', 'Pillow', 'Headtorch']) {
      await expect(page.locator('.wui-hotspot:not(.is-off)', { hasText: name }), name).toHaveCount(1);
    }
    await expect(page.getByRole('button', { name: 'Leave the tent' })).toBeVisible();
    await page.screenshot({ path: `${OUT}/m4-tent-${testInfo.project.name}.png` });

    // The pillow, pinned by its hotspot, with a link to its page.
    await dot(page, 'Pillow').click();
    await expect(card(page)).toContainText('Pillow');
    await expect(card(page).getByRole('link', { name: 'Details' })).toHaveAttribute('href', '/gear/harry/gear/pillow/');
    // Esc closes the card first, then leaves the tent; the page stays where it is.
    await page.keyboard.press('Escape');
    await expect(card(page)).toBeHidden();
    expect(await level(page)).toBe('tent');
    await page.keyboard.press('Escape');
    await expect.poll(() => level(page)).toBe('camp');
    expect(pathname(page)).toBe('/gear/harry/camp/');

    // Back in, and scrolling up leaves too.
    await still(page);
    at = await tent();
    await page.mouse.click(at.x, at.y);
    await expect.poll(() => level(page)).toBe('tent');
    await page.mouse.move(scene(page).x, scene(page).y);
    await page.mouse.wheel(0, -150);
    await expect.poll(() => level(page)).toBe('camp');
  });

  test('on a phone: swipe up to dive, tap for the clothing, tap the tent to go in', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'phone', 'needs a touch screen');
    await openCamp(page, 'harry', 'alpine-aurora', REALTIME);
    await uiReady(page);
    // Swipes up the stage (real touches, so touch-action applies), beside the marker.
    const box = (await page.locator('[data-stage]').boundingBox())!;
    const touch = await page.context().newCDPSession(page);
    const swipe = async () => {
      const x = box.x + box.width * 0.85;
      const from = box.y + box.height * 0.9;
      const to = box.y + box.height * 0.15;
      await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: from }] });
      for (let i = 1; i <= 12; i++) {
        await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: from + ((to - from) * i) / 12 }] });
      }
      await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    };
    await swipe();
    expect(await page.evaluate(() => window.__world!.zoom())).toBeGreaterThan(0.3);
    expect(pathname(page)).toBe('/gear/harry/');
    await swipe();
    await page.waitForURL('**/gear/harry/camp/');
    await expect.poll(() => level(page), { timeout: 15_000 }).toBe('camp');
    await uiReady(page);
    await still(page);
    await expect(page.locator('.wui-hint')).toHaveText('Drag to look around · pinch to zoom');

    // Tapping the person's hotspot pins their clothing, on screen; tapping the ground puts it away.
    await dot(page, 'Clothing').tap();
    await expect(card(page)).toContainText('Harry’s clothing');
    await expect(card(page)).toHaveClass(/is-pinned/);
    const pinned = (await card(page).boundingBox())!;
    expect(pinned.x).toBeGreaterThanOrEqual(0);
    expect(pinned.x + pinned.width).toBeLessThanOrEqual(page.viewportSize()!.width);
    await page.screenshot({ path: `${OUT}/m4-phone-clothing.png` });
    await page.touchscreen.tap(box.x + 12, box.y + box.height - 12);
    await expect(card(page)).toBeHidden();
    // The tent's goes inside, and the button comes back out.
    await dot(page, 'Tent').tap();
    await expect.poll(() => level(page)).toBe('tent');
    await still(page);
    await page.screenshot({ path: `${OUT}/m4-phone-tent.png` });
    await page.getByRole('button', { name: 'Leave the tent' }).tap();
    await expect.poll(() => level(page)).toBe('camp');

    // The tabs scroll sideways on a phone; on Kevin's page, his (the last) is brought into view.
    await openCamp(page, 'kevin', 'rockies-night', REALTIME);
    const tab = (await page.locator('[data-tab="kevin"]').boundingBox())!;
    expect(tab.x + tab.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  });
});
