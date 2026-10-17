import { defineConfig, envField } from 'astro/config';

// Static output: deploys as-is to Netlify, Vercel, Cloudflare Pages or GitHub Pages.
// Set `site` to the real domain once one is chosen.
export default defineConfig({
  output: 'static',
  env: {
    schema: {
      // The 3D world under the gear pages (GEAR-3D-PLAN.md). On for everyone whose
      // device can run it; `?world=off` turns it off in one browser (remembered
      // there until `?world=auto`).
      PUBLIC_GEAR_WORLD: envField.enum({ context: 'client', access: 'public', values: ['on', 'off'], default: 'on' }),
      // Test builds expose window.__world and honour ?debug, ?freeze, ?t, ?seed and ?tier.
      PUBLIC_WORLD_TEST: envField.boolean({ context: 'client', access: 'public', default: false }),
    },
  },
});
