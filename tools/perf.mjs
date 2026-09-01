/**
 * Render-cost and resource-retention probe.
 *
 * Headless Chrome falls back to software rasterisation, so wall-clock frame
 * times mean little here. What does transfer is the work submitted per frame —
 * draw calls, triangles, resident geometries and textures — and, more usefully,
 * whether cycling through every project leaks any of it.
 */
import { createServer } from 'vite';
import puppeteer from 'puppeteer-core';

const server = await createServer({ server: { port: 5179, strictPort: false } });
await server.listen();
const base = server.resolvedUrls.local[0].replace(/\/$/, '');

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--hide-scrollbars'],
});

const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
await page.goto(`${base}/#/pal`, { waitUntil: 'networkidle2', timeout: 60000 });
await new Promise((r) => setTimeout(r, 11000));

/** Accumulates a whole frame rather than just the last pass of it. */
const snapshot = () =>
  page.evaluate(
    () =>
      new Promise((resolve) => {
        const exp = window.__experience;
        const info = exp.renderer.info;
        info.autoReset = false;
        info.reset();
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            const result = {
              tier: exp.tier.name,
              dpr: exp.renderer.getPixelRatio(),
              drawCalls: info.render.calls,
              triangles: info.render.triangles,
              geometries: info.memory.geometries,
              textures: info.memory.textures,
              programs: info.programs?.length ?? 0,
              cached: exp.manager.cache.size,
            };
            info.autoReset = true;
            resolve(result);
          }),
        );
      }),
  );

const rows = [];
rows.push({ stage: 'first paint', ...(await snapshot()) });

await new Promise((r) => setTimeout(r, 10000));
rows.push({ stage: 'after preload', ...(await snapshot()) });

for (let round = 1; round <= 3; round++) {
  for (const nth of [2, 3, 1]) {
    await page.click(`.indicators li:nth-child(${nth}) .indicator`);
    await new Promise((r) => setTimeout(r, 3200));
  }
  await new Promise((r) => setTimeout(r, 1500));
  rows.push({ stage: `after cycle ${round}`, ...(await snapshot()) });
}

console.table(rows);

const growth = rows.at(-1).geometries - rows[1].geometries;
const texGrowth = rows.at(-1).textures - rows[1].textures;
console.log(
  growth === 0 && texGrowth === 0
    ? 'No resource growth across repeated project cycles.'
    : `WARNING: geometries +${growth}, textures +${texGrowth} across cycles.`,
);

await browser.close();
await server.close();
process.exit(0);
