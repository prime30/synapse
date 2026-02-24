'use client';

import { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  STORE_PRODUCT_IMAGES,
  STORE_HERO_IMAGES,
  STORE_HERO_VIDEO,
  STORE_HERO_FALLBACKS,
} from '@/lib/marketing/store-assets';

/** Gray 1x1 data URL so we never show broken-image icon when assets/fallbacks fail. */
const PLACEHOLDER_IMAGE =
  'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1" viewBox="0 0 1 1"><rect width="1" height="1" fill="%23e5e5e5"/></svg>');

/**
 * High-fidelity storefront mock for marketing.
 * Uses generated assets (Nano Banana Pro / Veo 3.1) when present;
 * falls back to Unsplash or hero fallbacks for development.
 */
export function StorefrontMockup() {
  const [heroVideoError, setHeroVideoError] = useState(false);
  const [heroIndex, setHeroIndex] = useState(0);
  /** Per-product image URL override so fallback survives re-renders. */
  const [productSrcs, setProductSrcs] = useState<(string | undefined)[]>([]);

  const useVideo = !heroVideoError;
  const heroImages = STORE_HERO_IMAGES.map((src, i) => ({
    src,
    fallback: STORE_HERO_FALLBACKS[i],
  }));

  const handleVideoError = useCallback(() => {
    setHeroVideoError(true);
  }, []);

  return (
    <motion.div
      className="relative w-full max-w-4xl mx-auto rounded-2xl border border-stone-200 dark:border-white/10 bg-white dark:bg-[oklch(0.185_0_0)] overflow-hidden shadow-2xl shadow-stone-300/20 dark:shadow-black/40"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
    >
      {/* Browser chrome */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-stone-100 dark:border-white/5 bg-stone-50 dark:bg-white/5">
        <div className="flex gap-1.5">
          {[1, 2, 3].map((i) => (
            <span
              key={i}
              className="w-2.5 h-2.5 rounded-full bg-stone-300 dark:bg-white/20"
              aria-hidden
            />
          ))}
        </div>
        <div className="flex-1 flex justify-center">
          <span className="text-[11px] text-stone-400 dark:text-white/40 font-medium">
            your-store.myshopify.com
          </span>
        </div>
        <div className="w-14" />
      </div>

      {/* Hero: video or image carousel */}
      <div className="relative aspect-[16/9] bg-stone-100 dark:bg-stone-900/50">
        {useVideo ? (
          <video
            src={STORE_HERO_VIDEO}
            autoPlay
            loop
            muted
            playsInline
            onError={handleVideoError}
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : (
          <>
            {heroImages.map((item, i) => (
              <div
                key={i}
                className="absolute inset-0 w-full h-full"
                style={{ opacity: heroIndex === i ? 1 : 0, zIndex: heroIndex === i ? 1 : 0 }}
              >
                <img
                  src={item.src}
                  alt=""
                  className="absolute inset-0 w-full h-full object-cover"
                  onError={(e) => {
                    const target = e.currentTarget;
                    const url = target.src;
                    if (url.endsWith('.png')) {
                      target.src = url.replace(/\.png$/, '.jpg');
                      return;
                    }
                    if (item.fallback && !url.startsWith(item.fallback)) {
                      target.src = item.fallback;
                    }
                  }}
                />
              </div>
            ))}
            {/* Carousel dots */}
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5 z-10">
              {heroImages.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setHeroIndex(i)}
                  className={`w-1.5 h-1.5 rounded-full transition-colors ${
                    heroIndex === i
                      ? 'bg-white'
                      : 'bg-white/40 hover:bg-white/60'
                  }`}
                  aria-label={`Slide ${i + 1}`}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {/* Store nav strip */}
      <div className="px-6 py-3 border-b border-stone-100 dark:border-white/5 flex items-center gap-6 text-xs font-medium text-stone-500 dark:text-white/50">
        <span className="text-stone-900 dark:text-white">Home</span>
        <span>Shop</span>
        <span>Skincare</span>
        <span>About</span>
        <span>Contact</span>
      </div>

      {/* Product grid */}
      <div className="p-6">
        <h2 className="text-sm font-semibold text-stone-900 dark:text-white mb-4">
          Best Sellers
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {STORE_PRODUCT_IMAGES.map((product, i) => {
            const src = productSrcs[i] ?? product.img;
            return (
              <div
                key={i}
                className="group rounded-xl border border-stone-100 dark:border-white/5 overflow-hidden bg-stone-50 dark:bg-white/5 hover:border-stone-200 dark:hover:border-white/10 transition-colors"
              >
                <div className="relative aspect-square bg-white dark:bg-stone-900/50">
                  <img
                    src={src}
                    alt={product.name}
                    className="absolute inset-0 w-full h-full object-cover"
                    onError={() => {
                      setProductSrcs((prev) => {
                        const arr = prev.length ? [...prev] : Array(STORE_PRODUCT_IMAGES.length).fill(undefined);
                        const current = arr[i] ?? product.img;
                        let next: string;
                        if (current.endsWith('.png')) {
                          next = current.replace(/\.png$/, '.jpg');
                        } else if (product.fallback && !current.startsWith(product.fallback)) {
                          next = product.fallback;
                        } else {
                          next = PLACEHOLDER_IMAGE;
                        }
                        arr[i] = next;
                        return arr;
                      });
                    }}
                  />
                </div>
                <div className="p-3">
                  <p className="text-xs font-medium text-stone-900 dark:text-white truncate">
                    {product.name}
                  </p>
                  <p className="text-xs font-semibold text-stone-600 dark:text-white/70 mt-0.5">
                    {product.price}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
}
