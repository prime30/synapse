/**
 * Marketing store mock asset URLs.
 * Prefer high-fidelity generated assets (Nano Banana Pro / Veo 3.1) when present;
 * fall back to Unsplash for development or if assets haven't been generated.
 *
 * Generate assets: npx tsx scripts/generate-marketing-assets.ts
 */

const BASE = '/marketing';

/** Product images for the storefront preview mock (6 items). */
export const STORE_PRODUCT_IMAGES = [
  { name: 'Botanical Serum', price: '$48', img: `${BASE}/store/product-1.png`, fallback: 'https://images.unsplash.com/photo-1556228578-0d85b1a4d571?w=200&h=200&fit=crop&crop=center&q=80' },
  { name: 'Rose Hip Oil', price: '$36', img: `${BASE}/store/product-2.png`, fallback: 'https://images.unsplash.com/photo-1571781926291-c477ebfd024b?w=200&h=200&fit=crop&crop=center&q=80' },
  { name: 'Hydra Cream', price: '$52', img: `${BASE}/store/product-3.png`, fallback: 'https://images.unsplash.com/photo-1612817288484-6f916006741a?w=200&h=200&fit=crop&crop=center&q=80' },
  { name: 'Aloe Mist', price: '$28', img: `${BASE}/store/product-4.png`, fallback: 'https://images.unsplash.com/photo-1608248543803-ba4f8c70ae0b?w=200&h=200&fit=crop&crop=center&q=80' },
  { name: 'Night Repair', price: '$64', img: `${BASE}/store/product-5.png`, fallback: 'https://images.unsplash.com/photo-1631729371254-42c2892f0e6e?w=200&h=200&fit=crop&crop=center&q=80' },
  { name: 'Glow Drops', price: '$42', img: `${BASE}/store/product-6.png`, fallback: 'https://images.unsplash.com/photo-1617897903246-719242758050?w=200&h=200&fit=crop&crop=center&q=80' },
] as const;

/** Hero slide background images (3 slides). */
export const STORE_HERO_IMAGES = [
  `${BASE}/hero/hero-1.png`,
  `${BASE}/hero/hero-2.png`,
  `${BASE}/hero/hero-3.png`,
] as const;

/** Hero slide fallback URLs (Unsplash) in same order. */
export const STORE_HERO_FALLBACKS = [
  'https://images.unsplash.com/photo-1556228578-0d85b1a4d571?w=900&h=500&fit=crop&crop=center&q=80',
  'https://images.unsplash.com/photo-1571781926291-c477ebfd024b?w=900&h=500&fit=crop&crop=center&q=80',
  'https://images.unsplash.com/photo-1608248543803-ba4f8c70ae0b?w=900&h=500&fit=crop&crop=center&q=80',
] as const;

/** Optional hero video (Veo 3.1). Use in hero when present. */
export const STORE_HERO_VIDEO = `${BASE}/hero/hero-loop.mp4`;
