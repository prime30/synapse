import { createClient as createServiceClient } from '@supabase/supabase-js';

/**
 * Generate a screenshot of a Shopify store preview.
 * Returns JPEG buffer or null on any failure (graceful fallback).
 */
export async function generateThumbnail(
  storeDomain: string,
  themeId: string
): Promise<Buffer | null> {
  try {
    const chromium = await import('@sparticuz/chromium-min');
    const puppeteer = await import('puppeteer-core');

    const browser = await puppeteer.default.launch({
      args: chromium.default.args,
      defaultViewport: { width: 1280, height: 800 },
      executablePath: await chromium.default.executablePath(
        'https://github.com/nichochar/chromium/releases/download/v131.0.1/chromium-v131.0.1-pack.tar'
      ),
      headless: true,
    });

    try {
      const page = await browser.newPage();
      await page.goto(
        `https://${storeDomain}/?preview_theme_id=${themeId}`,
        { waitUntil: 'networkidle2', timeout: 30_000 }
      );

      // Extra delay for CSS/fonts
      await new Promise((r) => setTimeout(r, 2000));

      const buffer = await page.screenshot({
        type: 'jpeg',
        quality: 80,
      });

      return Buffer.from(buffer);
    } finally {
      await browser.close();
    }
  } catch (err) {
    console.error('[thumbnail] Generation failed:', err);
    return null;
  }
}

/**
 * Upload a thumbnail buffer to Supabase Storage.
 * Returns the storage path.
 */
export async function uploadThumbnail(
  projectId: string,
  buffer: Buffer
): Promise<string> {
  const supabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const storagePath = `thumbnails/${projectId}.jpg`;

  const { error } = await supabase.storage
    .from('project-files')
    .upload(storagePath, buffer, {
      contentType: 'image/jpeg',
      upsert: true,
    });

  if (error) {
    throw new Error(`Failed to upload thumbnail: ${error.message}`);
  }

  return storagePath;
}
