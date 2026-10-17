import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import type { Browser } from '@playwright/test';

export type SheetImage = { path: string; label?: string };

const escape = (text: string) =>
  text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/**
 * Tile PNGs into one image for review: baseline sets now, transition frames
 * and field mosaics from M1. Labels default to the file names.
 */
export async function contactSheet(
  browser: Browser,
  images: SheetImage[],
  outPath: string,
  { columns = 4, width = 1600, title = '' } = {},
) {
  const cells = images
    .map(({ path, label }) => {
      const data = readFileSync(path).toString('base64');
      return `<figure><img src="data:image/png;base64,${data}"><figcaption>${escape(label ?? basename(path))}</figcaption></figure>`;
    })
    .join('');
  const page = await browser.newPage({ viewport: { width, height: 800 } });
  await page.setContent(`<!doctype html><meta charset="utf-8"><style>
    body { margin: 0; padding: 12px; background: #111; color: #ddd; font: 12px ui-monospace, monospace; }
    h1 { margin: 0 0 12px; font-size: 14px; font-weight: 500; }
    main { display: grid; grid-template-columns: repeat(${columns}, minmax(0, 1fr)); gap: 12px; align-items: start; }
    figure { margin: 0; }
    img { display: block; width: 100%; background: #222; }
    figcaption { padding-top: 4px; }
  </style>${title ? `<h1>${escape(title)}</h1>` : ''}<main>${cells}</main>`);
  await page.waitForFunction(() => [...document.images].every((img) => img.complete));
  await page.screenshot({ path: outPath, fullPage: true });
  await page.close();
}
