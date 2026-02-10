'use client';

/**
 * Infinite marquee logo slider — trusted-by social proof strip.
 * Uses text-based brand names (no external images) in a muted grayscale style.
 */

const LOGOS = [
  'Shopify',
  'Vercel',
  'Stripe',
  'Linear',
  'Notion',
  'Figma',
  'Supabase',
  'Tailwind',
  'Prisma',
  'Framer',
];

export function LogoSlider() {
  const items = [...LOGOS, ...LOGOS];

  return (
    <section
      data-navbar-theme="light"
      className="relative bg-[#fafaf9] dark:bg-[#0a0a0a] overflow-hidden py-6"
    >
      {/* Fade edges */}
      <div className="absolute inset-y-0 left-0 w-24 z-10 bg-gradient-to-r from-[#fafaf9] dark:from-[#0a0a0a] to-transparent pointer-events-none" />
      <div className="absolute inset-y-0 right-0 w-24 z-10 bg-gradient-to-l from-[#fafaf9] dark:from-[#0a0a0a] to-transparent pointer-events-none" />

      <div className="logo-marquee-track flex whitespace-nowrap">
        {items.map((name, i) => (
          <span
            key={`${name}-${i}`}
            className="inline-flex items-center mx-8 md:mx-12 text-sm md:text-base font-semibold tracking-wide text-stone-400/50 dark:text-white/20 select-none"
          >
            {name}
          </span>
        ))}
      </div>

    </section>
  );
}
