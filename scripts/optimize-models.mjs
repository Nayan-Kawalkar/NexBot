/**
 * Model optimisation pipeline.
 *
 * Source assets are Tripo exports: single-mesh, single-material, 8K texture
 * atlases and (for the car) a ~1.9M triangle mesh. They render beautifully but
 * are far too heavy for the web, so this pass trims them down without touching
 * the authored look:
 *
 *   - resize texture atlases (they are low-frequency upscales, so 2K keeps
 *     every visible detail) and re-encode as WebP
 *   - decimate only where the triangle budget is genuinely absurd (the car)
 *   - weld / dedup / prune to drop redundant data
 *   - EXT_meshopt_compression for the geometry payload
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, weld, simplify, resample } from '@gltf-transform/functions';
import { EXTMeshoptCompression } from '@gltf-transform/extensions';
import { MeshoptSimplifier, MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'public/models');

/** Per-slot texture ceilings. Base colour and normal carry the readable detail. */
const TEXTURE_LIMITS = {
  baseColorTexture: 2048,
  normalTexture: 2048,
  metallicRoughnessTexture: 1024,
  occlusionTexture: 1024,
  emissiveTexture: 1024,
};

// 1.92M triangles is far past a web budget. Rendered side by side against the
// untouched geometry, ~250k is indistinguishable — the creasing on the canopy
// turned out to be in the bake, not in the decimation.
const HALO_RATIO = Number(process.env.HALO_RATIO ?? 0.13);

const TARGETS = [
  // The two scooter exports are not in the order their filenames suggest:
  // "(1)" is the standing four-wheel platform, the other is the seated trike.
  { src: 'futuristic scooter 3d model (1).glb', out: 'pal.glb',  simplifyRatio: null },
  { src: 'futuristic scooter 3d model.glb',     out: 'sola.glb', simplifyRatio: null },
  {
    src: 'futuristic car 3d model.glb',
    out: 'halo.glb',
    simplifyRatio: HALO_RATIO,
    // This bake packs its UV islands tightly and has generator creasing painted
    // into the albedo; at 2048 the mip chain smears island edges into each
    // other and the creasing reads as crumpled foil. 4K is the point where the
    // bodywork settles. The other two are clean at 2048 and stay there.
    textureLimits: { baseColorTexture: 4096 },
  },
];

const mb = (n) => (n / 1048576).toFixed(2) + ' MB';

/** Which material slot references a given texture, so we can pick a sane size. */
function slotFor(document, texture) {
  const slots = new Set();
  for (const material of document.getRoot().listMaterials()) {
    for (const [slot, getter] of Object.entries({
      baseColorTexture: 'getBaseColorTexture',
      normalTexture: 'getNormalTexture',
      metallicRoughnessTexture: 'getMetallicRoughnessTexture',
      occlusionTexture: 'getOcclusionTexture',
      emissiveTexture: 'getEmissiveTexture',
    })) {
      if (material[getter]() === texture) slots.add(slot);
    }
  }
  return slots;
}

async function resizeTextures(document, overrides = {}) {
  const limits = { ...TEXTURE_LIMITS, ...overrides };
  for (const texture of document.getRoot().listTextures()) {
    const image = texture.getImage();
    if (!image) continue;

    const slots = slotFor(document, texture);
    const limit = Math.min(...[...slots].map((s) => limits[s] ?? 2048));

    const pipeline = sharp(Buffer.from(image));
    const meta = await pipeline.metadata();
    const isData = slots.has('normalTexture') || slots.has('metallicRoughnessTexture');

    const target = Math.min(limit, meta.width);
    const encoded = await pipeline
      .resize(target, target, { fit: 'fill', kernel: 'lanczos3' })
      // Data maps must not pick up chroma artefacts, so they get a higher quality
      // floor and lossless-ish settings; base colour can afford a normal WebP q.
      .webp(isData ? { quality: 95, effort: 5, smartSubsample: false } : { quality: 86, effort: 5 })
      .toBuffer();

    console.log(
      `    tex "${texture.getName() || 'unnamed'}" [${[...slots].join(',') || '?'}] ` +
      `${meta.width}x${meta.height} ${mb(image.byteLength)} -> ${target}x${target} ${mb(encoded.byteLength)}`,
    );

    texture.setImage(new Uint8Array(encoded)).setMimeType('image/webp');
  }
}

function stats(document) {
  let tris = 0;
  let verts = 0;
  for (const mesh of document.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const indices = prim.getIndices();
      const position = prim.getAttribute('POSITION');
      verts += position ? position.getCount() : 0;
      tris += indices ? indices.getCount() / 3 : (position ? position.getCount() / 3 : 0);
    }
  }
  return { tris: Math.round(tris), verts };
}

await MeshoptSimplifier.ready;
await MeshoptEncoder.ready;
await fs.mkdir(OUT, { recursive: true });

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
const manifest = [];

for (const target of TARGETS) {
  const srcPath = path.join(ROOT, target.src);
  const srcSize = (await fs.stat(srcPath)).size;
  console.log(`\n${target.src}  (${mb(srcSize)})`);

  const document = await io.read(srcPath);
  const before = stats(document);

  const transforms = [
    dedup(),
    resample(),
    // Welding is a prerequisite for meaningful decimation and it also collapses
    // the duplicate corner vertices that the exporter leaves behind.
    weld(),
  ];

  if (target.simplifyRatio) {
    transforms.push(
      simplify({ simplifier: MeshoptSimplifier, ratio: target.simplifyRatio, error: 0.0015, lockBorder: true }),
    );
  }

  transforms.push(prune({ keepAttributes: false, keepLeaves: false }));

  await document.transform(...transforms);
  await resizeTextures(document, target.textureLimits);

  const after = stats(document);
  console.log(`    geometry ${before.tris.toLocaleString()} tris -> ${after.tris.toLocaleString()} tris`);

  // Meshopt is the best geometry codec here: three ships the decoder, it keeps
  // every attribute, and it decodes far faster than Draco on mobile.
  document
    .createExtension(EXTMeshoptCompression)
    .setRequired(true)
    .setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });

  const outPath = path.join(OUT, target.out);
  await io.write(outPath, document);
  const outSize = (await fs.stat(outPath)).size;
  console.log(`    ${target.out}: ${mb(srcSize)} -> ${mb(outSize)}  (${((1 - outSize / srcSize) * 100).toFixed(1)}% smaller)`);

  manifest.push({ file: target.out, bytes: outSize, tris: after.tris });
}

console.log('\nDone.');
console.table(manifest.map((m) => ({ file: m.file, size: mb(m.bytes), tris: m.tris.toLocaleString() })));
