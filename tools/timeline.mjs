/**
 * Time-series capture: screenshots at fixed offsets after load, so the first
 * few seconds — the window a settled screenshot never shows — are visible.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'vite';
import puppeteer from 'puppeteer-core';

const OUT = process.env.SHOT_DIR || './shots';
const target = process.argv[2] ?? 'pal';
const offsets = (process.argv[3] ?? '400,900,1500,2200,3200,5000,9000').split(',').map(Number);

await fs.mkdir(OUT, { recursive: true });
const server = await createServer({ server: { port: 5188, strictPort: false } });
await server.listen();
const base = server.resolvedUrls.local[0].replace(/\/$/, '');

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--hide-scrollbars'],
});

const page = await browser.newPage();
const [vw, vh] = (process.env.SHOT_SIZE ?? '1440x900').split('x').map(Number);
await page.setViewport({ width: vw, height: vh });
page.on('pageerror', (e) => console.log('pageerror:', e.message));

await page.goto(`${base}/#/${target}`, { waitUntil: 'domcontentloaded', timeout: 60000 });

let previous = 0;
for (const offset of offsets) {
  await new Promise((r) => setTimeout(r, offset - previous));
  previous = offset;
  await page.screenshot({ path: path.join(OUT, `t-${target}-${String(offset).padStart(5, '0')}.png`) });
}

// Report the live material state, which is where a fade artefact would show.
const state = await page.evaluate(() => {
  const exp = window.__experience;
  const entry = exp.activeEntry;
  return {
    vehicle: exp.activeVehicle?.id,
    transitioning: exp.transitioning,
    materials: entry.materials.map((m) => ({
      transparent: m.transparent,
      opacity: m.opacity,
      depthWrite: m.depthWrite,
      hasMap: !!m.map,
      mapImage: m.map?.image ? `${m.map.image.width}x${m.map.image.height}` : null,
      envMap: !!m.envMap,
    })),
  };
});
console.log(JSON.stringify(state, null, 2));

await browser.close();
await server.close();
process.exit(0);
