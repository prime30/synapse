'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { motion, useInView } from 'framer-motion';
import { SynapseLogo } from '@/components/marketing/nav/SynapseLogo';

const FOOTER_LINKS = {
  Product: [
    { label: 'Features', href: '/features' },
    { label: 'Pricing', href: '/pricing' },
    { label: 'Changelog', href: '/changelog' },
    { label: 'Roadmap', href: '/roadmap' },
  ],
  Resources: [
    { label: 'Documentation', href: '/docs' },
    { label: 'Getting Started', href: '/docs/getting-started' },
    { label: 'API Reference', href: '/docs/api-reference' },
    { label: 'Examples', href: '/examples' },
  ],
  Company: [
    { label: 'About', href: '/about' },
    { label: 'Blog', href: '/blog' },
    { label: 'Careers', href: '/careers' },
    { label: 'Contact', href: '/contact' },
  ],
  Legal: [
    { label: 'Privacy', href: '/privacy' },
    { label: 'Terms', href: '/terms' },
    { label: 'Security', href: '/security' },
  ],
};

/**
 * FooterWatermark — SYNAPSE in Geist Pixel Circle (already renders as dots).
 * Slowly pulses opacity to feel alive.
 */
function FooterWatermark() {
  const [opacity, setOpacity] = useState(0.04);

  useEffect(() => {
    const id = setInterval(() => {
      setOpacity(0.03 + Math.random() * 0.03); // range 0.03–0.06
    }, 3000);
    return () => clearInterval(id);
  }, []);

  return (
    <div
      className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-[45%] pointer-events-none select-none"
      aria-hidden="true"
    >
      <span
        className="font-pixel-circle text-[80px] sm:text-[120px] md:text-[240px] lg:text-[320px] tracking-[0.15em] uppercase text-stone-900 dark:text-white whitespace-nowrap"
        style={{
          opacity,
          transition: 'opacity 2.5s ease-in-out',
        }}
      >
        SYNAPSE
      </span>
    </div>
  );
}

export function Footer() {
  const footerRef = useRef<HTMLElement>(null);
  const inView = useInView(footerRef, { once: false, margin: '-60px' });

  return (
    <footer
      ref={footerRef}
      className="relative bg-white dark:bg-[#0a0a0a] border-t border-stone-200 dark:border-white/5 overflow-hidden"
      aria-label="Site footer"
    >
      {/* Green gradient ellipse — bottom-left */}
      <div
        className="absolute w-[500px] h-[400px] pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse, rgba(40, 205, 86, 0.15) -1%, transparent 60%)',
          left: '-241px',
          bottom: '-236px',
        }}
        aria-hidden="true"
      />

      {/* SYNAPSE wordmark — half-hidden off bottom, animated dot density */}
      <FooterWatermark />

      <motion.div
        className="relative max-w-6xl mx-auto px-8 md:px-10 pt-24 pb-12"
        initial={{ opacity: 0, y: 20 }}
        animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      >
        {/* Main footer content */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-10 mb-16">
          {/* Brand column */}
          <div className="col-span-2 md:col-span-1">
            <Link
              href="/"
              className="text-stone-900 dark:text-white block mb-4"
            >
              <SynapseLogo />
            </Link>
            <p className="text-stone-500 dark:text-white/50 text-[15px] leading-relaxed mb-8">
              AI-powered Shopify theme development. Ship faster, ship better.
            </p>
          </div>

          {/* Link columns */}
          {Object.entries(FOOTER_LINKS).map(([category, links]) => (
            <div key={category}>
              <h4 className="text-xs tracking-widest uppercase text-stone-400 dark:text-white/40 mb-5">
                {category}
              </h4>
              <ul className="space-y-3">
                {links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="text-[15px] text-stone-600 dark:text-white/50 hover:text-stone-900 dark:hover:text-white transition-colors"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom bar */}
        <div className="border-t border-stone-200 dark:border-white/5 pt-8 flex items-center justify-center">
          <p className="text-xs tracking-widest uppercase text-stone-400 dark:text-white/30">
            Synapse Inc. &copy; {new Date().getFullYear()}
          </p>
        </div>
      </motion.div>
    </footer>
  );
}
