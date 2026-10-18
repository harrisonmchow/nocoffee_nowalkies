import { defineConfig, devices } from '@playwright/test';

// Tests run against a production build served by `astro preview`. The build
// sets PUBLIC_WORLD_TEST, so window.__world and the ?debug, ?freeze, ?t, ?seed
// and ?tier switches exist. Baselines (screenshots and axe results) live in
// tests/__snapshots__, one set per platform, because font rendering differs
// between machines.
// PLAYWRIGHT_PORT moves it when 4330 is taken (an existing server there is reused, whatever it's serving).
const PORT = Number(process.env.PLAYWRIGHT_PORT ?? 4330);
const sheets = /sheets\.spec\.ts/;
const frames = /frames\.spec\.ts/;
const biomes = /biomes\.spec\.ts/;

export default defineConfig({
  testDir: 'tests',
  outputDir: 'tests/.output/results',
  snapshotPathTemplate: '{testDir}/__snapshots__/{testFileName}/{projectName}/{arg}-{platform}{ext}',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'tests/.output/report' }]],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
  },
  expect: {
    toHaveScreenshot: { maxDiffPixelRatio: 0.001, animations: 'disabled', caret: 'hide' },
  },
  projects: [
    { name: 'desktop', testIgnore: [sheets, frames, biomes], use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'phone', testIgnore: [sheets, frames, biomes], use: { ...devices['Pixel 7'] } },
    { name: 'webkit', testIgnore: [sheets, frames, biomes], use: { ...devices['Desktop Safari'], viewport: { width: 1440, height: 900 } } },
    // Contact sheets of the baselines, once the other projects have finished.
    { name: 'sheets', testMatch: sheets, dependencies: ['desktop', 'phone', 'webkit'] },
    // Caleb's and Mikey's camps at the high and mid tiers (M3): heavy in software WebGL, so they
    // run after the main suite, desktop then phone, rather than starving the other workers.
    {
      name: 'biomes-desktop',
      testMatch: biomes,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
      dependencies: ['desktop', 'phone', 'webkit'],
    },
    { name: 'biomes-phone', testMatch: biomes, use: { ...devices['Pixel 7'] }, dependencies: ['biomes-desktop'] },
    // Frame times need a real GPU (WebKit's) with nothing else competing for it, so they run last, alone.
    {
      name: 'frames',
      testMatch: frames,
      use: { ...devices['Desktop Safari'], viewport: { width: 1440, height: 900 } },
      dependencies: ['sheets', 'biomes-phone'],
    },
  ],
  webServer: {
    // --ignore-lock: Astro allows one preview per project, and a preview left open shouldn't stop the tests.
    command: `npm run build && npx astro preview --ignore-lock --host 127.0.0.1 --port ${PORT}`,
    url: `http://127.0.0.1:${PORT}/`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: { PUBLIC_WORLD_TEST: 'true' },
  },
});
