import { defineConfig } from 'astro/config';

// Static output: deploys as-is to Netlify, Vercel, Cloudflare Pages or GitHub Pages.
// Set `site` to the real domain once one is chosen.
export default defineConfig({
  output: 'static',
});
