'use client';

import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';

export function TestimonialSection() {
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, { once: true, margin: '-80px' });

  return (
    <motion.section
      ref={ref}
      data-navbar-theme="dark"
      className="relative bg-[#0a0a0a] py-32 md:py-40"
      initial={{ opacity: 0, y: 30 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
    >
      {/* Manual crosshair marks (light on dark bg) */}
      <span
        className="absolute top-[-10px] left-[40px] text-white/10 text-base font-light select-none pointer-events-none"
        aria-hidden="true"
      >
        +
      </span>
      <span
        className="absolute top-[-10px] right-[40px] text-white/10 text-base font-light select-none pointer-events-none"
        aria-hidden="true"
      >
        +
      </span>

      <div className="max-w-3xl mx-auto px-6 text-center">
        <blockquote>
          <p className="text-2xl md:text-3xl font-light text-white/90 leading-relaxed">
            &ldquo;Synapse transformed how our agency builds Shopify themes. What
            used to take weeks now takes days. The AI agents understand Liquid
            better than most developers.&rdquo;
          </p>
        </blockquote>

        <div className="mt-10">
          <div className="w-12 h-12 rounded-full bg-sky-500/20 mx-auto flex items-center justify-center text-sky-400 font-medium">
            A
          </div>
          <p className="text-base font-medium text-white mt-4">Alex Chen</p>
          <p className="text-sm text-white/40 mt-1">
            Lead Developer, Shopify Plus Agency
          </p>
        </div>
      </div>
    </motion.section>
  );
}
