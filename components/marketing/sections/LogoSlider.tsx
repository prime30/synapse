'use client';

import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';

/**
 * Infinite marquee logo slider — trusted-by social proof strip.
 * Uses inline SVG brand logos in a muted grayscale style.
 */

/* ------------------------------------------------------------------ */
/*  SVG Logo components                                                */
/* ------------------------------------------------------------------ */

function ShopifyPlusLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 150 44" fill="currentColor" className={className} aria-label="Shopify Plus">
      {/* Shopify bag icon */}
      <path d="M24.5 5.2c-.2 0-.3.1-.4.2-.1.1-1.7 2-3.8 2.1-.2-1.2-.9-2.3-1.9-2.3h-.1c-.3-.4-.7-.6-1-.6-2.5 0-3.7 3.1-4.1 4.7l-2.9.9c-.9.3-.9.3-1 1.1L7 25.7l13.4 2.3 7.2-1.7c0 0-3-20.4-3.1-21.1zM18.4 8.7v.3l-3.5 1.1c.7-2.6 1.9-3.8 3-4.1.3.6.5 1.5.5 2.7zM17 5.5c.2 0 .4.1.6.3-1.4.7-2.9 2.4-3.5 5.8l-2.8.9C12 9.7 13.5 5.5 17 5.5zm.7 12.8l-1.2-.6c-.5-.2-.7-.5-.7-.8 0-.4.3-.7.8-.7.9 0 1.5.6 1.5.6l.8-1.7s-.8-.7-2.2-.7c-1.7 0-2.9 1-2.9 2.4 0 .8.6 1.4 1.3 1.9l.5.3.5.3c.5.3.6.5.6.8 0 .5-.4.8-1 .8-.9 0-1.8-.7-1.8-.7l-.8 1.7s1 .9 2.7.9c1.8 0 3-1 3-2.5 0-.9-.5-1.5-1.1-1.9z" />
      {/* "Shopify" text */}
      <path d="M37.8 18.1c-1.1 0-2 .5-2.6 1.3l0-1.1h-2.1l.1.6-1.3 8.7h2.2l.5-3.3c.3.4.9.6 1.5.6 2 0 3.4-1.8 3.4-4.2 0-1.6-.7-2.6-1.7-2.6zm-.6 4.8c-.5 0-.9-.2-1.1-.6l.4-2.8c.4-.5.9-.7 1.3-.7.7 0 .9.6.9 1.3 0 1.5-.7 2.8-1.5 2.8z" />
      <path d="M42 14.6l-2.2.5-.9 6c0 0-.6-.3-1.4-.3-1.1 0-1.2.7-1.2.9 0 1 1.5 1.4 1.5 3.1 0 1.6-1 2.6-2.3 2.6-1.6 0-2.4-1-2.4-1l.5-1.4s.8.7 1.5.7c.5 0 .7-.4.7-.7 0-1.3-1.5-1.3-1.5-3 0-1.5 1.1-3 3.2-3 .8 0 1.3.2 1.3.2L42 14.6z" />
      {/* "Plus" text */}
      <text x="100" y="30" fontSize="14" fontWeight="600" fontFamily="system-ui, sans-serif" letterSpacing="0.05em">Plus</text>
    </svg>
  );
}

function ShopifyPartnersLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 180 40" fill="currentColor" className={className} aria-label="Shopify Partners">
      <path d="M24.5 5.2c-.2 0-.3.1-.4.2-.1.1-1.7 2-3.8 2.1-.2-1.2-.9-2.3-1.9-2.3h-.1c-.3-.4-.7-.6-1-.6-2.5 0-3.7 3.1-4.1 4.7l-2.9.9c-.9.3-.9.3-1 1.1L7 25.7l13.4 2.3 7.2-1.7c0 0-3-20.4-3.1-21.1zM18.4 8.7v.3l-3.5 1.1c.7-2.6 1.9-3.8 3-4.1.3.6.5 1.5.5 2.7zM17 5.5c.2 0 .4.1.6.3-1.4.7-2.9 2.4-3.5 5.8l-2.8.9C12 9.7 13.5 5.5 17 5.5z" />
      <text x="32" y="28" fontSize="16" fontWeight="600" fontFamily="system-ui, sans-serif">Partners</text>
    </svg>
  );
}

function LinearLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 40" fill="currentColor" className={className} aria-label="Linear">
      <path d="M4.5 35.5a2 2 0 01-.5-1.3c0-.5.2-1 .6-1.3L18.8 18.7a2 2 0 012.7 0L35.7 33a2 2 0 01-1.4 3.4H6.8a2 2 0 01-1.3-.5l-1-1zM7 3.6a2 2 0 013.4-1.4L24.5 16.3a2 2 0 010 2.7L10.4 33a2 2 0 01-3.4-1.4V3.6z" transform="scale(0.55) translate(2,4)" />
      <text x="28" y="27" fontSize="16" fontWeight="600" fontFamily="system-ui, sans-serif">Linear</text>
    </svg>
  );
}

function FigmaLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 88 40" fill="currentColor" className={className} aria-label="Figma">
      {/* Figma icon - simplified */}
      <g transform="translate(2,4) scale(0.9)">
        <path d="M8 35c2.8 0 5-2.2 5-5v-5H8c-2.8 0-5 2.2-5 5s2.2 5 5 5z" opacity="0.8" />
        <path d="M3 20c0-2.8 2.2-5 5-5h5v10H8c-2.8 0-5-2.2-5-5z" opacity="0.65" />
        <path d="M3 10c0-2.8 2.2-5 5-5h5v10H8c-2.8 0-5-2.2-5-5z" opacity="0.5" />
        <path d="M13 5h5c2.8 0 5 2.2 5 5s-2.2 5-5 5h-5V5z" opacity="0.65" />
        <circle cx="18" cy="20" r="5" opacity="0.8" />
      </g>
      <text x="30" y="27" fontSize="16" fontWeight="600" fontFamily="system-ui, sans-serif">Figma</text>
    </svg>
  );
}

function FramerLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 40" fill="currentColor" className={className} aria-label="Framer">
      <g transform="translate(4,5) scale(0.85)">
        <path d="M3 0h18v12H12l9 12H3V12h9L3 0z" />
        <path d="M3 24h9v12L3 24z" />
      </g>
      <text x="30" y="27" fontSize="16" fontWeight="600" fontFamily="system-ui, sans-serif">Framer</text>
    </svg>
  );
}

function VercelLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 40" fill="currentColor" className={className} aria-label="Vercel">
      <path d="M14 8l12 22H2L14 8z" transform="translate(0,1)" />
      <text x="30" y="27" fontSize="16" fontWeight="600" fontFamily="system-ui, sans-serif">Vercel</text>
    </svg>
  );
}

function StripeLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 90 40" fill="currentColor" className={className} aria-label="Stripe">
      <text x="4" y="28" fontSize="18" fontWeight="700" fontFamily="system-ui, sans-serif" letterSpacing="-0.02em">Stripe</text>
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/*  Logo list                                                          */
/* ------------------------------------------------------------------ */

const LOGOS = [
  { name: 'Shopify Plus', Logo: ShopifyPlusLogo, width: 'w-28' },
  { name: 'Shopify Partners', Logo: ShopifyPartnersLogo, width: 'w-32' },
  { name: 'Linear', Logo: LinearLogo, width: 'w-24' },
  { name: 'Figma', Logo: FigmaLogo, width: 'w-20' },
  { name: 'Framer', Logo: FramerLogo, width: 'w-24' },
  { name: 'Vercel', Logo: VercelLogo, width: 'w-24' },
  { name: 'Stripe', Logo: StripeLogo, width: 'w-20' },
];

export function LogoSlider() {
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, { once: false, margin: '-40px' });
  const items = [...LOGOS, ...LOGOS];

  return (
    <motion.section
      ref={ref}
      data-navbar-theme="light"
      className="relative bg-[#fafaf9] dark:bg-[#0a0a0a] overflow-hidden py-6"
      initial={{ opacity: 0 }}
      animate={inView ? { opacity: 1 } : { opacity: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
    >
      {/* Fade edges */}
      <div className="absolute inset-y-0 left-0 w-24 z-10 bg-gradient-to-r from-[#fafaf9] dark:from-[#0a0a0a] to-transparent pointer-events-none" />
      <div className="absolute inset-y-0 right-0 w-24 z-10 bg-gradient-to-l from-[#fafaf9] dark:from-[#0a0a0a] to-transparent pointer-events-none" />

      <div className="logo-marquee-track flex whitespace-nowrap items-center">
        {items.map((item, i) => (
          <span
            key={`${item.name}-${i}`}
            className="inline-flex items-center mx-8 md:mx-12 select-none shrink-0"
          >
            <item.Logo className={`${item.width} h-8 text-stone-400/60 dark:text-white/25`} />
          </span>
        ))}
      </div>
    </motion.section>
  );
}
