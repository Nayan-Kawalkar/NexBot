/**
 * Visual verification harness.
 *
 * Boots the Vite dev server in-process, drives a real Chrome over it and writes
 * screenshots for each shot in `shots.json`. Keeping the server inside the same
 * process means the run is self-contained and repeatable.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'vite';
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const OUT = process.env.SHOT_DIR || './shots';
const shots = JSON.parse(await fs.readFile(process.argv[2] ?? 'tools/shots.json', 'utf8'));

await fs.mkdir(OUT, { recursive: true });

const PORT = Number(process.env.SHOT_PORT ?? 5178);
const server = await createServer({ server: { port: PORT, strictPort: false } });
await server.listen();
const base = server.resolvedUrls.local[0].replace(/\/$/, '');

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: [
    '--no-sandbox',
    '--enable-unsafe-swiftshader',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--ignore-gpu-blocklist',
    '--hide-scrollbars',
    '--force-device-scale-factor=1',
  ],
});

const issues = [];

for (const shot of shots) {
  const page = await browser.newPage();
  await page.setViewport({
    width: shot.width,
    height: shot.height,
    deviceScaleFactor: shot.dpr ?? 1,
    isMobile: !!shot.mobile,
    hasTouch: !!shot.mobile,
  });
  if (shot.reducedMotion) {
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  }

  page.on('pageerror', (e) => issues.push(`${shot.name}: pageerror ${e.message}`));
  page.on('response', (r) => {
    if (r.status() >= 400) issues.push(`${shot.name}: HTTP ${r.status()} ${r.url()}`);
  });
  page.on('console', (m) => {
    const text = m.text();
    if (m.type() === 'error' && !text.includes('Failed to load resource')) {
      issues.push(`${shot.name}: console ${text}`);
    }
  });

  if (shot.throttleKbps) {
    // Lets slow-path states — the loader in particular — be captured at all.
    const session = await page.createCDPSession();
    await session.send('Network.enable');
    await session.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: shot.latencyMs ?? 40,
      downloadThroughput: (shot.throttleKbps * 1024) / 8,
      uploadThroughput: (shot.throttleKbps * 1024) / 8,
    });
  }

  await page.goto(base + (shot.path ?? '/'), {
    waitUntil: shot.until ?? 'networkidle2',
    timeout: 60000,
  });
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r())));
  await new Promise((r) => setTimeout(r, shot.wait ?? 9000));

  if (shot.actions) {
    for (const action of shot.actions) {
      if (action.click) await page.click(action.click).catch((e) => issues.push(`${shot.name}: click ${action.click} — ${e.message}`));
      if (action.drag) {
        const [x, y, dx, dy] = action.drag;
        await page.mouse.move(x, y);
        await page.mouse.down();
        for (let i = 1; i <= 12; i++) {
          await page.mouse.move(x + (dx * i) / 12, y + (dy * i) / 12);
          await new Promise((r) => setTimeout(r, 16));
        }
        await page.mouse.up();
      }
      if (action.eval) await page.evaluate(action.eval);
      if (action.wait) await new Promise((r) => setTimeout(r, action.wait));
    }
  }

  // Overflow is a silent killer in a fixed-viewport layout — assert it directly.
  const overflow = await page.evaluate(() => ({
    x: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    y: document.documentElement.scrollHeight - document.documentElement.clientHeight,
  }));
  if (overflow.x > 0) issues.push(`${shot.name}: horizontal overflow ${overflow.x}px`);

  await page.screenshot({ path: path.join(OUT, `${shot.name}.png`) });
  console.log(`✓ ${shot.name} (${shot.width}x${shot.height})`);
  await page.close();
}

await browser.close();
await server.close();

if (issues.length) {
  console.log('\nISSUES:');
  for (const issue of [...new Set(issues)]) console.log('  -', issue);
} else {
  console.log('\nNo issues.');
}
process.exit(0);
