'use client';

import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';

export function InlineProof() {
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, { once: false, margin: '-80px' });

  return (
    <section
      ref={ref}
      data-navbar-theme="light"
      className="bg-[#fafaf9] dark:bg-[#0a0a0a]"
    >
      <div className="max-w-3xl mx-auto px-6 py-20 md:py-24 text-center">
        <motion.blockquote
          className="text-2xl md:text-3xl font-light text-stone-600 dark:text-white/60 leading-relaxed"
          initial={{ opacity: 0, y: 16 }}
          animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 16 }}
          transition={{ duration: 0.6, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
        >
          {'\u201C'}Synapse transformed how our agency builds Shopify themes. What
          used to take weeks now takes days.{'\u201D'}
        </motion.blockquote>

        <motion.p
          className="mt-8 text-sm text-stone-400 dark:text-white/30"
          initial={{ opacity: 0, y: 16 }}
          animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 16 }}
          transition={{
            duration: 0.6,
            delay: 0.2,
            ease: [0.22, 1, 0.36, 1],
          }}
        >
          Alex Chen, Lead Developer {'\u2014'} Shopify Plus Agency
        </motion.p>
      </div>
    </section>
  );
}
