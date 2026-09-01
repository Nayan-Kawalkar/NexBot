/**
 * Turns the supplied studio renders (vehicle on a near-white sweep) into
 * preview art that belongs in the dark UI.
 *
 * The white backdrop is flood-filled away from the borders so the vehicle
 * survives untouched, while the soft contact shadow is re-mapped to a black
 * veil — on a light sweep a grey shadow darkens, but composited onto the dark
 * card the same grey would glow, so it has to be re-authored rather than kept.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'public/media');

const SOURCES = [
  { src: '7ca6527d-956f-4ccc-a700-fe68132ded95.png', out: 'pal' },
  { src: 'd91141bb-cde4-40bd-baca-3f297afb5633.png', out: 'sola' },
  { src: '15e29979-1d79-47f3-a110-39611db3a510.png', out: 'halo' },
];

/** Colour distance below which a pixel is indistinguishable from the sweep. */
const T_HARD = 10;
/** Colour distance above which a pixel is definitely not backdrop or shadow. */
const T_SOFT = 78;
/** How dark the re-authored contact shadow is allowed to get. */
const SHADOW_MAX = 0.5;

await fs.mkdir(OUT, { recursive: true });

for (const { src, out } of SOURCES) {
  const { data, info } = await sharp(path.join(ROOT, src))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width: w, height: h, channels } = info;
  const at = (x, y) => (y * w + x) * channels;

  // Average the four corners: the sweep is smooth but not perfectly uniform.
  const corners = [[2, 2], [w - 3, 2], [2, h - 3], [w - 3, h - 3]];
  const bg = corners
    .reduce((acc, [x, y]) => {
      const i = at(x, y);
      return [acc[0] + data[i], acc[1] + data[i + 1], acc[2] + data[i + 2]];
    }, [0, 0, 0])
    .map((v) => v / corners.length);

  const dist = (i) =>
    Math.max(
      Math.abs(data[i] - bg[0]),
      Math.abs(data[i + 1] - bg[1]),
      Math.abs(data[i + 2] - bg[2]),
    );

  // Flood fill inward from the frame. Anything the fill can reach is backdrop
  // or shadow; anything it cannot reach is enclosed by the vehicle silhouette
  // and is kept verbatim, which is what protects the pale deck and seat fabric.
  const outside = new Uint8Array(w * h);
  const stack = [];
  for (let x = 0; x < w; x++) { stack.push(x, 0, x, h - 1); }
  for (let y = 0; y < h; y++) { stack.push(0, y, w - 1, y); }

  while (stack.length) {
    const y = stack.pop();
    const x = stack.pop();
    if (x < 0 || y < 0 || x >= w || y >= h) continue;
    const p = y * w + x;
    if (outside[p]) continue;
    if (dist(at(x, y)) > T_SOFT) continue;
    outside[p] = 1;
    stack.push(x + 1, y, x - 1, y, x, y + 1, x, y - 1);
  }

  const rgba = Buffer.alloc(w * h * 4);
  let minX = w, minY = h, maxX = 0, maxY = 0;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      const i = at(x, y);
      const o = p * 4;

      if (outside[p]) {
        // Ramp from fully transparent sweep to an opaque-ish black shadow.
        const t = Math.min(1, Math.max(0, (dist(i) - T_HARD) / (T_SOFT - T_HARD)));
        const alpha = Math.round(t * SHADOW_MAX * 255);
        rgba[o] = 0; rgba[o + 1] = 0; rgba[o + 2] = 0; rgba[o + 3] = alpha;
        if (alpha > 6) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
      } else {
        rgba[o] = data[i]; rgba[o + 1] = data[i + 1]; rgba[o + 2] = data[i + 2]; rgba[o + 3] = 255;
        if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
  }

  const pad = Math.round(Math.max(maxX - minX, maxY - minY) * 0.04);
  const left = Math.max(0, minX - pad);
  const top = Math.max(0, minY - pad);
  const cropW = Math.min(w - left, maxX - minX + pad * 2);
  const cropH = Math.min(h - top, maxY - minY + pad * 2);

  const base = sharp(rgba, { raw: { width: w, height: h, channels: 4 } })
    .extract({ left, top, width: cropW, height: cropH });

  for (const [suffix, size] of [['', 720], ['@2x', 1440]]) {
    await base
      .clone()
      .resize(size, size, { fit: 'inside', kernel: 'lanczos3', withoutEnlargement: true })
      .webp({ quality: 90, alphaQuality: 92, effort: 6 })
      .toFile(path.join(OUT, `${out}${suffix}.webp`));
  }

  const stat = await fs.stat(path.join(OUT, `${out}.webp`));
  console.log(`${out}: ${w}x${h} -> ${cropW}x${cropH} crop, ${(stat.size / 1024).toFixed(0)} KB`);
}
