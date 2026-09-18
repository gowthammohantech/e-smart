/**
 * Regenerate the placeholder illustrations in assets/illustrations/.
 *
 *   node tools/illustrations/generate.mjs
 *
 * These are stand-ins so the app looks finished before the real Storyset
 * "Rafiki" downloads land. Replacing a file keeps its name, so no code
 * changes are needed — see assets/illustrations/README.md.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pw from '/opt/node22/lib/node_modules/playwright/index.js';

import { SCENES, VIEWBOX } from './art.mjs';
import { GIF_PALETTE } from './palette.mjs';
import { encodeGif, quantize } from './gif.mjs';

const { chromium } = pw;
const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, '../../assets/illustrations');

/** Names rendered as looping GIFs; everything else is a PNG. */
const ANIMATED = new Set(['welcome', 'setup-complete', 'scanning', 'empty-dashboard']);
const FRAMES = 12;
const PNG_SCALE = 2; // 800x600 — plenty for a 220pt hero on a 3x screen
const GIF_SCALE = 1; // GIFs stay small; 400x300 is ample at display size

const VB_W = VIEWBOX.W;
const VB_H = VIEWBOX.H;

const svg = (body, scale, viewBox) => `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
  html,body{margin:0;padding:0;background:transparent}
  svg{display:block}
</style></head><body>
<svg xmlns="http://www.w3.org/2000/svg" width="${VB_W * scale}" height="${VB_H * scale}"
     viewBox="${viewBox ?? `0 0 ${VB_W} ${VB_H}`}">${body}</svg>
</body></html>`;

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage({ viewport: { width: 900, height: 700 } });

/**
 * Render the scene twice: once to measure what was actually drawn, then again
 * with the viewBox tightened around it and padded back out to 4:3. Cropping in
 * vector space keeps the art crisp and the files small — re-sampling a raster
 * blurs the edges and triples the size.
 */
const shoot = async (body, scale) => {
  await page.setContent(svg(body, scale, null));
  const box = await page.evaluate(() => {
    const { x, y, width, height } = document.querySelector('svg').getBBox();
    return { x, y, width, height };
  });

  const inset = 0.04;
  const ratio = VB_W / VB_H;
  // Grow the tight box out to 4:3 so every file shares one aspect ratio and
  // the app can size illustrations by height alone.
  let w = Math.max(box.width, box.height * ratio) * (1 + inset * 2);
  let h = w / ratio;
  const vb = [box.x + box.width / 2 - w / 2, box.y + box.height / 2 - h / 2, w, h]
    .map((n) => n.toFixed(2))
    .join(' ');

  await page.setContent(svg(body, scale, vb));
  return page.locator('svg').screenshot({ omitBackground: true, type: 'png' });
};

const written = [];

for (const [name, scene] of Object.entries(SCENES)) {
  if (ANIMATED.has(name)) {
    const frames = [];
    for (let i = 0; i < FRAMES; i += 1) {
      const png = await shoot(scene(i / FRAMES), GIF_SCALE);
      // Decode the PNG back to RGBA through the browser so we can quantise it.
      const rgba = await page.evaluate(
        async (b64) => {
          const img = new Image();
          img.src = `data:image/png;base64,${b64}`;
          await img.decode();
          const c = document.createElement('canvas');
          c.width = img.width;
          c.height = img.height;
          const ctx = c.getContext('2d');
          ctx.clearRect(0, 0, c.width, c.height);
          ctx.drawImage(img, 0, 0);
          const d = ctx.getImageData(0, 0, c.width, c.height);
          return { w: c.width, h: c.height, data: Array.from(d.data) };
        },
        png.toString('base64'),
      );
      frames.push({ ...rgba, indices: quantize(Uint8Array.from(rgba.data), GIF_PALETTE) });
    }
    const { w, h } = frames[0];
    const gif = encodeGif(
      frames.map((f) => f.indices),
      { width: w, height: h, palette: GIF_PALETTE, delayMs: 90, transparentIndex: 0 },
    );
    writeFileSync(`${OUT}/${name}.gif`, gif);
    written.push([`${name}.gif`, gif.length]);
  } else {
    const png = await shoot(scene(0), PNG_SCALE);
    writeFileSync(`${OUT}/${name}.png`, png);
    written.push([`${name}.png`, png.length]);
  }
}

await browser.close();

const total = written.reduce((a, [, n]) => a + n, 0);
written.forEach(([f, n]) => console.log(`  ${f.padEnd(26)} ${(n / 1024).toFixed(1)} KB`));
console.log(`\n${written.length} files, ${(total / 1024).toFixed(0)} KB total`);
