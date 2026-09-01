/**
 * Dense frame burst around a project switch, so the transition can be inspected
 * frame by frame instead of only at rest.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'vite';
import puppeteer from 'puppeteer-core';

const OUT = process.env.SHOT_DIR || './shots';
const from = process.argv[2] ?? 'pal';
const nth = Number(process.argv[3] ?? 3);
const frames = Number(process.argv[4] ?? 14);
const step = Number(process.argv[5] ?? 170);

await fs.mkdir(OUT, { recursive: true });
const server = await createServer({ server: { port: 5193, strictPort: false } });
await server.listen();
const base = server.resolvedUrls.local[0].replace(/\/$/, '');

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--hide-scrollbars'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1000, height: 680 });

await page.goto(`${base}/#/${from}`, { waitUntil: 'networkidle2', timeout: 60000 });
await new Promise((r) => setTimeout(r, 14000));

// Slow every timeline so headless screenshot latency cannot outrun the
// transition we are trying to inspect.
const scale = Number(process.env.TIME_SCALE ?? 1);
if (scale !== 1) await page.evaluate((s) => window.__gsap.globalTimeline.timeScale(s), scale);

await page.click(`.indicators li:nth-child(${nth}) .indicator`);

for (let i = 0; i < frames; i++) {
  const state = await page.evaluate(() => {
    const exp = window.__experience;
    const m = exp.activeEntry?.materials?.[0];
    return m ? `t=${exp.transitioning} op=${m.opacity.toFixed(2)} tr=${m.transparent} dw=${m.depthWrite}` : 'none';
  });
  await page.screenshot({ path: path.join(OUT, `b-${String(i * step).padStart(5, '0')}.png`) });
  console.log(`${String(i * step).padStart(5)}ms  ${state}`);
  await new Promise((r) => setTimeout(r, step));
}

await browser.close();
await server.close();
process.exit(0);
