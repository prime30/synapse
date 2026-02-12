'use client';

import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import { MagneticElement } from '@/components/marketing/interactions/MagneticElement';
import { PixelAccent } from '@/components/marketing/interactions/PixelAccent';
import { useAuthModal } from '@/components/marketing/AuthModalContext';

const show = { opacity: 1, y: 0 };
const hide = { opacity: 0, y: 20 };

/**
 * Lightweight CTA banner for the features page.
 * No product mockup, no auth state check — just headline + button.
 */
export function FeaturesCtaBanner() {
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, { once: false, margin: '-80px' });
  const { openAuthModal } = useAuthModal();

  return (
    <section
      ref={ref}
      className="relative bg-gradient-to-br from-[#fafaf9] via-[#f0f7f1] to-[#fafaf9] dark:from-[#0a0a0a] dark:via-[#0d1a0f] dark:to-[#0a0a0a] overflow-hidden"
    >
      <div className="max-w-6xl mx-auto px-8 md:px-10 py-20 md:py-28 text-center">
        <motion.h2
          className="text-3xl md:text-5xl font-medium text-stone-900 dark:text-white tracking-[-0.02em] leading-tight"
          initial={hide}
          animate={inView ? show : hide}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        >
          Stop context-switching.{' '}
          <PixelAccent>Ship themes faster.</PixelAccent>
        </motion.h2>

        <motion.p
          className="text-lg text-stone-500 dark:text-white/50 mt-5 max-w-xl mx-auto leading-relaxed"
          initial={hide}
          animate={inView ? show : hide}
          transition={{
            duration: 0.6,
            delay: 0.1,
            ease: [0.22, 1, 0.36, 1],
          }}
        >
          Free for solo developers. No credit card required. Your first
          project is a click away.
        </motion.p>

        <motion.div
          className="mt-8"
          initial={hide}
          animate={inView ? show : hide}
          transition={{
            duration: 0.6,
            delay: 0.2,
            ease: [0.22, 1, 0.36, 1],
          }}
        >
          <MagneticElement strength={6} radius={120}>
            <button
              type="button"
              onClick={() => openAuthModal('signup')}
              className="h-12 px-10 rounded-full bg-accent text-white font-medium text-[15px] hover:bg-accent-hover transition-colors"
            >
              Start Building Free
            </button>
          </MagneticElement>
        </motion.div>

        <motion.p
          className="text-xs text-stone-400 dark:text-white/30 mt-4"
          initial={hide}
          animate={inView ? show : hide}
          transition={{
            duration: 0.6,
            delay: 0.3,
            ease: [0.22, 1, 0.36, 1],
          }}
        >
          Runs in the browser. Works with your existing Shopify themes.
        </motion.p>
      </div>
    </section>
  );
}
