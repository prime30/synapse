'use client';

import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import { MagneticElement } from '@/components/marketing/interactions/MagneticElement';
import { useAuthModal } from '@/components/marketing/AuthModalContext';

const show = { opacity: 1, y: 0 };
const hide = { opacity: 0, y: 16 };

/**
 * Compact features-page hero — no product mockup, no parallax.
 * Just badge + H1 + subtitle + CTA. Designed to get out of the way
 * and let the feature sections do the heavy lifting.
 */
export default function FeaturesHero() {
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, { once: false, margin: '-40px' });
  const { openAuthModal } = useAuthModal();

  return (
    <section
      ref={ref}
      className="relative bg-[oklch(0.985_0.001_106)] dark:bg-[oklch(0.145_0_0)] overflow-hidden"
    >
      {/* Subtle gradient glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        aria-hidden="true"
        style={{
          background:
            'radial-gradient(ellipse 60% 40% at 50% 80%, oklch(0.745 0.189 148 / 0.08) 0%, transparent 70%)',
        }}
      />

      <div className="relative max-w-6xl mx-auto px-4 sm:px-6 md:px-10 pt-32 pb-16 md:pt-40 md:pb-20 text-center z-10">
        {/* Badge */}
        <motion.span
          className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-stone-200 dark:border-white/10 bg-white dark:bg-white/5 text-xs text-stone-500 dark:text-white/50 mb-6"
          initial={hide}
          animate={inView ? show : hide}
          transition={{ duration: 0.5, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
        >
          FEATURES
        </motion.span>

        {/* H1 */}
        <motion.h1
          className="text-4xl md:text-5xl lg:text-6xl font-medium leading-[1.1] tracking-[-0.03em] text-stone-900 dark:text-white"
          initial={hide}
          animate={inView ? show : hide}
          transition={{ duration: 0.5, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
        >
          Features
        </motion.h1>

        {/* Subtitle */}
        <motion.p
          className="text-lg md:text-xl text-stone-500 dark:text-white/50 mt-6 max-w-2xl mx-auto leading-relaxed"
          initial={hide}
          animate={inView ? show : hide}
          transition={{ duration: 0.5, delay: 0.35, ease: [0.22, 1, 0.36, 1] }}
        >
          Fewer context switches. Faster deployments. Production-ready code.
          See what developers actually experience with Synapse.
        </motion.p>

        {/* CTA row */}
        <motion.div
          className="mt-8 flex items-center justify-center gap-4 flex-wrap"
          initial={hide}
          animate={inView ? show : hide}
          transition={{ duration: 0.5, delay: 0.5, ease: [0.22, 1, 0.36, 1] }}
        >
          <MagneticElement strength={6} radius={120}>
            <button
              type="button"
              onClick={() => openAuthModal('signup')}
              className="h-12 px-6 sm:px-8 md:px-10 rounded-full bg-accent text-white font-medium text-[15px] hover:bg-accent-hover transition-colors"
            >
              Start Free — No Credit Card
            </button>
          </MagneticElement>
          <a
            href="#features"
            className="text-sm text-stone-500 dark:text-white/50 hover:text-stone-900 dark:hover:text-white transition-colors underline underline-offset-4 decoration-stone-300 dark:decoration-white/20"
          >
            Jump to features
          </a>
        </motion.div>

        {/* Trust line */}
        <motion.p
          className="text-xs text-stone-400 dark:text-white/30 mt-4"
          initial={hide}
          animate={inView ? show : hide}
          transition={{ duration: 0.5, delay: 0.6, ease: [0.22, 1, 0.36, 1] }}
        >
          Works with your existing Shopify themes. No migration required.
        </motion.p>
      </div>
    </section>
  );
}
