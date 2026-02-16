/**
 * Generate high-fidelity marketing assets for the website store mocks.
 * Uses Nano Banana Pro (gemini-3-pro-image-preview) for images and Veo 3.1 for video.
 *
 * Run: npx tsx scripts/generate-marketing-assets.ts
 * Optional: GENERATE_HERO_VIDEO=1 to also generate hero-loop.mp4 (Veo 3.1)
 * Requires: GOOGLE_AI_API_KEY in env
 *
 * Outputs:
 *   public/marketing/store/product-{1..6}.png  — product shots for store mock
 *   public/marketing/hero/hero-{1..3}.png      — hero slide backgrounds
 *   public/marketing/hero/hero-loop.mp4        — optional short hero video (Veo 3.1)
 *
 * Front-end review (where assets appear):
 *   - StorefrontMockup.tsx: hero carousel (hero-1..3 or hero-loop.mp4), product grid (product-1..6)
 *   - StorefrontShowcaseV2 on /v2 (marketing page v2)
 *   - store-assets.ts: STORE_PRODUCT_IMAGES, STORE_HERO_IMAGES, STORE_HERO_VIDEO
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { generateImage } from '../lib/ai/media/image-generator';
import { generateVideo } from '../lib/ai/media/video-generator';

const ROOT = path.resolve(process.cwd());

/** Load .env.local and .env from project root so GOOGLE_AI_API_KEY is available when run via npx tsx. */
function loadEnvFiles() {
  for (const name of ['.env.local', '.env']) {
    const filePath = path.join(ROOT, name);
    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      for (const line of raw.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eq = trimmed.indexOf('=');
        if (eq <= 0) continue;
        const key = trimmed.slice(0, eq).trim();
        let value = trimmed.slice(eq + 1).trim();
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))
          value = value.slice(1, -1);
        if (!(key in process.env)) process.env[key] = value;
      }
    } catch {
      // file missing or unreadable, skip
    }
  }
}

loadEnvFiles();
const OUT = path.join(ROOT, 'public', 'marketing');

/** Shared negative prompt to keep store mocks photorealistic and on-brand. */
const NEGATIVE_PROMPT =
  'blurry, low resolution, cartoon, illustration, 3D render, oversaturated, fake skin, text or labels on product, watermark, logo, stock photo watermark, artificial lighting, plastic look, cheap';

/** Product shots: real DTC/Shopify product page quality, studio photography (Nano Banana Pro). */
const PRODUCT_PROMPTS = [
  'Professional e-commerce product photo: luxury botanical serum in amber glass bottle with dropper, pure white seamless background, soft key light with fill, shallow depth of field, real brand product photography as seen on premium Shopify stores, 8k, photorealistic, no text or labels',
  'Professional e-commerce product photo: rose hip facial oil in amber glass bottle with gold cap, minimalist luxury skincare, pure white backdrop, soft diffused lighting, DTC brand quality product shot, 8k photorealistic, no text',
  'Professional e-commerce product photo: hydrating face cream in frosted glass jar with silver lid, luxury skincare, clean white background, soft shadow, real product photography like high-end Shopify store, 8k photorealistic, no text',
  'Professional e-commerce product photo: aloe vera face mist in green-tinted glass spray bottle, fresh botanical skincare, white seamless background, soft studio lighting, real e-commerce product shot, 8k photorealistic, no text',
  'Professional e-commerce product photo: night repair serum in dark glass bottle with dropper, luxury skincare, pure white background, soft shadows, premium DTC product photography, 8k photorealistic, no text',
  'Professional e-commerce product photo: vitamin C glow drops in amber glass dropper bottle, luxury skincare, clean white backdrop, professional product shot as on real Shopify storefront, 8k photorealistic, no text',
];

/** Hero slides: real Shopify hero / lifestyle campaign look, editorial quality (Nano Banana Pro). */
const HERO_PROMPTS = [
  'Real Shopify-style hero image: luxury skincare brand, natural botanical extracts and serum bottles on marble surface, warm daylight from side, fresh plants, aspirational premium beauty campaign, editorial lifestyle photography, 16:9, photorealistic, no text overlay, looks like live DTC store hero',
  'Real Shopify-style hero: rose petals and cream jars on soft linen, soft natural window light, premium beauty editorial, lifestyle product shot as on high-end store homepage, 16:9 cinematic, photorealistic, no text',
  'Real Shopify-style hero: summer skincare routine with citrus and aloe on marble, bright airy scene, premium DTC campaign style, 16:9 lifestyle photography, photorealistic, no text, real store hero quality',
];

async function ensureDir(dir: string) {
  try {
    await fs.promises.mkdir(dir, { recursive: true });
  } catch (e) {
    console.error('Failed to create directory', dir, e);
    throw e;
  }
}

async function writeBase64ToFile(base64: string, filePath: string, mimeType: string) {
  const ext = mimeType.includes('png') ? 'png' : mimeType.includes('jpeg') ? 'jpg' : 'bin';
  const outPath = filePath.endsWith(ext) ? filePath : `${filePath}.${ext}`;
  const buf = Buffer.from(base64, 'base64');
  await fs.promises.writeFile(outPath, buf);
  console.log('  Wrote', path.relative(ROOT, outPath));
  return outPath;
}

async function main() {
  const key = process.env.GOOGLE_AI_API_KEY;
  if (!key) {
    console.error('GOOGLE_AI_API_KEY is required. Set it in .env.local or the environment.');
    process.exit(1);
  }

  await ensureDir(path.join(OUT, 'store'));
  await ensureDir(path.join(OUT, 'hero'));

  console.log('Output directory:', OUT);
  console.log('(Files will be in public/marketing/store/ and public/marketing/hero/)');
  console.log('');
  console.log('Generating product images (Nano Banana Pro)...');
  for (let i = 0; i < PRODUCT_PROMPTS.length; i++) {
    const prompt = PRODUCT_PROMPTS[i];
    const outPath = path.join(OUT, 'store', `product-${i + 1}`);
    try {
      const result = await generateImage(
        {
          prompt,
          numberOfImages: 1,
          aspectRatio: '1:1',
          negativePrompt: NEGATIVE_PROMPT,
        },
        key,
      );
      const img = result.images[0];
      if (img) await writeBase64ToFile(img.data, outPath, img.mimeType);
    } catch (e) {
      console.error('  Failed product', i + 1, e);
    }
  }

  console.log('Generating hero background images (Nano Banana Pro)...');
  for (let i = 0; i < HERO_PROMPTS.length; i++) {
    const prompt = HERO_PROMPTS[i];
    const outPath = path.join(OUT, 'hero', `hero-${i + 1}`);
    try {
      const result = await generateImage(
        {
          prompt,
          numberOfImages: 1,
          aspectRatio: '16:9',
          negativePrompt: NEGATIVE_PROMPT,
        },
        key,
      );
      const img = result.images[0];
      if (img) await writeBase64ToFile(img.data, outPath, img.mimeType);
    } catch (e) {
      console.error('  Failed hero', i + 1, e);
    }
  }

  const generateHeroVideo = process.env.GENERATE_HERO_VIDEO === '1';
  if (generateHeroVideo) {
    console.log('Generating hero video (Veo 3.1)...');
    try {
      const result = await generateVideo(
        {
          prompt:
            'Real Shopify store hero video: luxury skincare products, serum bottles and cream jars on marble, soft morning window light, very slow smooth camera push-in, photorealistic, premium DTC beauty brand, calm and minimal, 6 seconds, no text, no speech, no people, ambient only, high-fidelity like real store homepage',
          durationSeconds: 6,
          aspectRatio: '16:9',
          generateAudio: false,
        },
        key,
      );
      const outPath = path.join(OUT, 'hero', 'hero-loop.mp4');
      const buf = Buffer.from(result.video.data, 'base64');
      await fs.promises.writeFile(outPath, buf);
      console.log('  Wrote', path.relative(ROOT, outPath));
    } catch (e) {
      console.error('  Hero video failed', e);
    }
  } else {
    console.log('Skipping hero video (set GENERATE_HERO_VIDEO=1 to generate).');
  }

  console.log('Done.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
