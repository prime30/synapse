'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowRight, Github, Twitter, MessageCircle } from 'lucide-react';
import { SynapseLogo } from '@/components/marketing/nav/SynapseLogo';

const FOOTER_LINKS = {
  Product: [
    { label: 'Features', href: '#features' },
    { label: 'Pricing', href: '/pricing' },
    { label: 'Changelog', href: '/blog' },
    { label: 'Roadmap', href: '#' },
  ],
  Resources: [
    { label: 'Documentation', href: '/docs' },
    { label: 'Getting Started', href: '/docs' },
    { label: 'API Reference', href: '/docs' },
    { label: 'Examples', href: '#' },
  ],
  Company: [
    { label: 'About', href: '#' },
    { label: 'Blog', href: '/blog' },
    { label: 'Careers', href: '#' },
    { label: 'Contact', href: '#' },
  ],
  Legal: [
    { label: 'Privacy', href: '#' },
    { label: 'Terms', href: '#' },
    { label: 'Security', href: '#' },
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
        className="font-pixel-circle text-[120px] sm:text-[180px] md:text-[240px] lg:text-[320px] tracking-[0.15em] uppercase text-stone-900 dark:text-white whitespace-nowrap"
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
  return (
    <footer
      className="relative bg-white dark:bg-[#0a0a0a] border-t border-stone-200 dark:border-white/5 overflow-hidden"
      aria-label="Site footer"
    >
      {/* Green gradient ellipse — bottom-left */}
      <div
        className="absolute -bottom-32 -left-32 w-[500px] h-[400px] pointer-events-none"
        style={{ background: 'radial-gradient(ellipse, rgba(40,205,86,0.15) 0%, transparent 70%)' }}
        aria-hidden="true"
      />

      {/* SYNAPSE wordmark — half-hidden off bottom, animated dot density */}
      <FooterWatermark />

      <div className="relative max-w-6xl mx-auto px-8 md:px-10 pt-24 pb-12">
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

            {/* Newsletter */}
            <div className="space-y-3">
              <label className="text-xs tracking-widest uppercase text-stone-400 block">
                Stay Updated
              </label>
              <div className="flex">
                <input
                  type="email"
                  placeholder="you@email.com"
                  className="flex-1 bg-white dark:bg-white/5 border border-stone-200 dark:border-white/10 rounded-l-lg px-4 py-2.5 text-[15px] text-stone-900 dark:text-white placeholder:text-stone-400 dark:placeholder:text-white/30 focus:outline-none focus:border-accent/50 transition-colors"
                />
                <button
                  className="px-4 py-2.5 bg-accent text-white text-sm rounded-r-lg hover:bg-accent-hover transition-colors flex items-center justify-center"
                  aria-label="Subscribe"
                >
                  <ArrowRight size={16} strokeWidth={2} />
                </button>
              </div>
            </div>
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
        <div className="border-t border-stone-200 dark:border-white/5 pt-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-xs tracking-widest uppercase text-stone-400 dark:text-white/30">
            Synapse Inc. &copy; {new Date().getFullYear()}
          </p>
          <div className="flex gap-4">
            <a
              href="#"
              className="w-9 h-9 rounded-full bg-stone-100 dark:bg-white/5 flex items-center justify-center text-stone-400 dark:text-white/40 hover:text-stone-900 dark:hover:text-white hover:bg-stone-200 dark:hover:bg-white/10 transition-colors"
              aria-label="GitHub"
            >
              <Github size={18} strokeWidth={1.5} />
            </a>
            <a
              href="#"
              className="w-9 h-9 rounded-full bg-stone-100 dark:bg-white/5 flex items-center justify-center text-stone-400 dark:text-white/40 hover:text-stone-900 dark:hover:text-white hover:bg-stone-200 dark:hover:bg-white/10 transition-colors"
              aria-label="Twitter"
            >
              <Twitter size={18} strokeWidth={1.5} />
            </a>
            <a
              href="#"
              className="w-9 h-9 rounded-full bg-stone-100 dark:bg-white/5 flex items-center justify-center text-stone-400 dark:text-white/40 hover:text-stone-900 dark:hover:text-white hover:bg-stone-200 dark:hover:bg-white/10 transition-colors"
              aria-label="Discord"
            >
              <MessageCircle size={18} strokeWidth={1.5} />
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
