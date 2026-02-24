'use client';

import { useRef } from 'react';
import Link from 'next/link';
import { motion, useInView } from 'framer-motion';

/* ------------------------------------------------------------------ */
/*  Footer link data                                                   */
/* ------------------------------------------------------------------ */

const FOOTER_LINKS = {
  Product: [
    { label: 'Features', href: '/features' },
    { label: 'Pricing', href: '/pricing' },
    { label: 'Changelog', href: '/changelog' },
    { label: 'Roadmap', href: '/roadmap' },
  ],
  Resources: [
    { label: 'Documentation', href: '/docs' },
    { label: 'Blog', href: '/blog' },
    { label: 'Examples', href: '/examples' },
  ],
  Company: [
    { label: 'About', href: '/about' },
    { label: 'Careers', href: '/careers' },
    { label: 'Contact', href: '/contact' },
    { label: 'Security', href: '/security' },
  ],
  Legal: [
    { label: 'Privacy Policy', href: '/privacy' },
    { label: 'Terms of Service', href: '/terms' },
  ],
};

/* ------------------------------------------------------------------ */
/*  FooterV2                                                           */
/* ------------------------------------------------------------------ */

export default function FooterV2() {
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, { once: false, margin: '-60px' });

  return (
    <footer
      ref={ref}
      className="relative bg-[oklch(0.985_0.001_106)] dark:bg-[oklch(0.145_0_0)] border-t border-stone-200 dark:border-white/10 overflow-hidden"
      aria-label="Site footer"
    >
      <motion.div
        className="max-w-6xl mx-auto px-8 md:px-10 pt-12 pb-8 md:pt-16 md:pb-10"
        initial={{ opacity: 0, y: 20 }}
        animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      >
        {/* Main grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-10 mb-12">
          {/* Brand column */}
          <div className="sm:col-span-2 lg:col-span-1">
            <Link
              href="/"
              className="text-stone-900 dark:text-white font-semibold text-lg tracking-[0.08em] uppercase block mb-3"
            >
              SYNAPSE
            </Link>
            <p className="text-stone-500 dark:text-white/50 text-sm leading-relaxed max-w-full sm:max-w-xs">
              The Shopify theme IDE that thinks alongside you.
            </p>
          </div>

          {/* Link columns */}
          {Object.entries(FOOTER_LINKS).map(([category, links]) => (
            <div key={category}>
              <h4 className="text-xs tracking-widest uppercase text-stone-400 dark:text-white/40 mb-5 font-medium">
                {category}
              </h4>
              <ul className="space-y-3">
                {links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="text-sm text-stone-600 dark:text-white/60 hover:text-stone-900 dark:hover:text-white transition-colors"
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
        <div className="border-t border-stone-200 dark:border-white/10 pt-8 flex items-center justify-center">
          <p className="text-xs text-stone-400 dark:text-white/30">
            &copy; {new Date().getFullYear()} Synapse. All rights reserved.
          </p>
        </div>
      </motion.div>
    </footer>
  );
}
