/**
 * generate-icons.ts — Generates all platform-specific app icons from the SVG source.
 *
 * Usage: npx tsx scripts/generate-icons.ts
 *
 * Outputs:
 *   build/icons/icon.png        — 1024x1024 master PNG
 *   build/icons/icon@512.png    — 512x512
 *   build/icons/icon@256.png    — 256x256
 *   build/icons/icon@128.png    — 128x128
 *   build/icons/icon@64.png     — 64x64
 *   build/icons/icon@32.png     — 32x32
 *   build/icons/icon@16.png     — 16x16
 *   build/icons/icon.ico        — Windows ICO (multi-size)
 *   public/favicon.ico          — Web favicon (32x32)
 *   public/apple-touch-icon.png — iOS home screen (180x180)
 *
 * Requires: sharp (already in dependencies)
 */

import sharp from 'sharp';
import path from 'path';
import fs from 'fs';

const ROOT = path.resolve(__dirname, '..');
const SVG_PATH = path.join(ROOT, 'build', 'icon.svg');
const ICONS_DIR = path.join(ROOT, 'build', 'icons');
const PUBLIC_DIR = path.join(ROOT, 'public');

const SIZES = [1024, 512, 256, 128, 64, 32, 16] as const;

async function main() {
  if (!fs.existsSync(ICONS_DIR)) {
    fs.mkdirSync(ICONS_DIR, { recursive: true });
  }

  const svgBuffer = fs.readFileSync(SVG_PATH);
  console.log('Generating icons from', SVG_PATH);

  // Generate PNGs at all sizes
  for (const size of SIZES) {
    const outputName = size === 1024 ? 'icon.png' : `icon@${size}.png`;
    const outputPath = path.join(ICONS_DIR, outputName);

    await sharp(svgBuffer)
      .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toFile(outputPath);

    console.log(`  ✓ ${outputName} (${size}x${size})`);
  }

  // Generate favicon.ico (32x32 PNG as ICO — browsers handle PNG-in-ICO fine)
  const favicon32 = await sharp(svgBuffer)
    .resize(32, 32)
    .png()
    .toBuffer();

  fs.copyFileSync(
    path.join(ICONS_DIR, 'icon@32.png'),
    path.join(PUBLIC_DIR, 'favicon.png'),
  );
  console.log('  ✓ public/favicon.png (32x32)');

  // Generate apple-touch-icon (180x180)
  await sharp(svgBuffer)
    .resize(180, 180, { fit: 'contain', background: { r: 15, g: 15, b: 15, alpha: 1 } })
    .png()
    .toFile(path.join(PUBLIC_DIR, 'apple-touch-icon.png'));

  console.log('  ✓ public/apple-touch-icon.png (180x180)');

  // Generate Windows ICO (contains 16, 32, 48, 64, 128, 256)
  // electron-builder handles ICO conversion from PNG, so we just need the PNGs
  // But for the web favicon, we'll use the 32px PNG
  const icoSizes = [16, 32, 48, 64, 128, 256];
  for (const size of icoSizes) {
    if (!SIZES.includes(size as (typeof SIZES)[number])) {
      await sharp(svgBuffer)
        .resize(size, size)
        .png()
        .toFile(path.join(ICONS_DIR, `icon@${size}.png`));

      console.log(`  ✓ icon@${size}.png (${size}x${size}) [for ICO]`);
    }
  }

  console.log('\nDone! Icons generated in build/icons/');
  console.log('electron-builder will automatically create .ico and .icns from the PNGs.');
}

main().catch((err) => {
  console.error('Icon generation failed:', err);
  process.exit(1);
});
