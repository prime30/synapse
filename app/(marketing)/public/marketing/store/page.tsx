import Link from 'next/link';
import { STORE_PRODUCT_IMAGES } from '@/lib/marketing/store-assets';

export const metadata = {
  title: 'Store assets | Synapse',
  description: 'Generated product images for the store mock',
};

/**
 * Lists product images in public/marketing/store/.
 * URL: /public/marketing/store
 * Actual image URLs: /marketing/store/product-1.png (or .jpg)
 */
export default function PublicMarketingStorePage() {
  return (
    <main className="min-h-screen bg-[#fafaf9] dark:bg-[#0a0a0a] pt-24 pb-16">
      <div className="max-w-4xl mx-auto px-6">
        <Link
          href="/public/marketing"
          className="text-sm text-stone-500 dark:text-white/50 hover:text-stone-900 dark:hover:text-white mb-6 inline-block"
        >
          ← Back to store mock
        </Link>
        <h1 className="text-2xl font-medium text-stone-900 dark:text-white mb-2">
          Store product images
        </h1>
        <p className="text-stone-500 dark:text-white/50 text-sm mb-10">
          Generated files in <code className="text-stone-600 dark:text-white/60">public/marketing/store/</code>.
          Try both .png and .jpg if one 404s.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-6">
          {STORE_PRODUCT_IMAGES.map((product, i) => (
            <div key={i} className="rounded-xl border border-stone-200 dark:border-white/10 overflow-hidden bg-white dark:bg-[#141414]">
              <div className="aspect-square bg-stone-100 dark:bg-stone-900/50 relative">
                <img
                  src={product.img}
                  alt={product.name}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    const target = e.currentTarget;
                    if (target.src.endsWith('.png'))
                      target.src = target.src.replace(/\.png$/, '.jpg');
                    else if (product.fallback)
                      target.src = product.fallback;
                  }}
                />
              </div>
              <div className="p-3">
                <p className="font-medium text-stone-900 dark:text-white">{product.name}</p>
                <p className="text-sm text-stone-500 dark:text-white/50">{product.price}</p>
                <p className="text-xs text-stone-400 dark:text-white/40 mt-1">
                  {product.img}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
