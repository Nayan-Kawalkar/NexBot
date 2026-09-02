/**
 * Turns the supplied cut-out stills into the preview art the card shows.
 *
 * The sources arrive already keyed to transparency, so there is no backdrop to
 * remove: the work here is fitting each subject into the card's own frame. Each
 * still is trimmed to its true silhouette, then padded onto a transparent 29:18
 * canvas — the frame's aspect ratio — so every project sits at the same scale
 * and on the same baseline rather than at whatever crop it was exported with.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = path.resolve(import.meta.dirname, '..');
const MEDIA = path.join(ROOT, 'public/media');

const SOURCES = ['kodo', 'vero', 'nia', 'lumi'];

/** The card frame's aspect, and the width of the 1x render. */
const RATIO = 29 / 18;
const WIDTH = 720;
/** Share of the canvas height the subject fills, leaving air above and below. */
const FILL = 0.9;

for (const id of SOURCES) {
  const source = sharp(path.join(MEDIA, `${id}.png`)).ensureAlpha();
  // Trim on alpha so a subject exported with generous margins is measured by
  // its silhouette, not by its canvas.
  const trimmed = await source.trim({ threshold: 1 }).toBuffer();

  for (const scale of [1, 2]) {
    const width = WIDTH * scale;
    const height = Math.round(width / RATIO);

    await sharp(trimmed)
      .resize({
        width,
        height: Math.round(height * FILL),
        fit: 'inside',
        withoutEnlargement: false,
      })
      .extend({ background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .resize({
        width,
        height,
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .webp({ quality: 90, alphaQuality: 90, effort: 6 })
      .toFile(path.join(MEDIA, scale === 1 ? `${id}.webp` : `${id}@2x.webp`));
  }

  console.log(`media: ${id}`);
}

await fs.access(MEDIA);
