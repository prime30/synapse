'use client';

import { useRef } from 'react';
import { motion, useScroll, useTransform } from 'framer-motion';
import { MagneticElement } from '@/components/marketing/interactions/MagneticElement';
import { usePageReady } from '@/components/marketing/PreloaderContext';
import { useAuthModal } from '@/components/marketing/AuthModalContext';
import { CodeEditorMockup } from '@/components/marketing/mockups/CodeEditorMockup';
import { GridDivider } from '@/components/marketing/grid/GridDivider';

/* ------------------------------------------------------------------ */
/*  Animation helpers                                                  */
/* ------------------------------------------------------------------ */

const entryTransition = (delay: number) => ({
  duration: 0.6,
  delay,
  ease: [0.22, 1, 0.36, 1] as const,
});

const show = { opacity: 1, y: 0 };
const hide = { opacity: 0 };

/* ------------------------------------------------------------------ */
/*  HeroSectionV2                                                      */
/* ------------------------------------------------------------------ */

export default function HeroSectionV2() {
  const ready = usePageReady();
  const { openAuthModal } = useAuthModal();
  const sectionRef = useRef<HTMLElement>(null);

  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ['start start', 'end start'],
  });

  // Parallax: mockup drifts up slightly as user scrolls
  const mockupY = useTransform(scrollYProgress, [0, 1], [0, 120]);

  const handleSmoothScroll = () => {
    const target = document.getElementById('how-it-works');
    if (target) {
      target.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <section
      ref={sectionRef}
      data-navbar-theme="light"
      className="relative bg-[#fafaf9] dark:bg-[#0a0a0a] overflow-hidden"
    >
      {/* ── Gradient blobs ──────────────────────────────────────────── */}
      <div
        className="absolute inset-0 pointer-events-none overflow-hidden"
        aria-hidden="true"
      >
        <div
          className="absolute w-[600px] h-[600px] rounded-full opacity-[0.15] dark:opacity-[0.08]"
          style={{
            background: 'radial-gradient(circle, #28CD56 0%, transparent 70%)',
            filter: 'blur(120px)',
            top: '10%',
            left: '15%',
            animation: 'hero-blob-1 20s ease-in-out infinite',
          }}
        />
        <div
          className="absolute w-[500px] h-[500px] rounded-full opacity-[0.12] dark:opacity-[0.06]"
          style={{
            background: 'radial-gradient(circle, #615AF2 0%, transparent 70%)',
            filter: 'blur(120px)',
            top: '20%',
            right: '10%',
            animation: 'hero-blob-2 25s ease-in-out infinite',
          }}
        />
        <div
          className="absolute w-[450px] h-[450px] rounded-full opacity-[0.1] dark:opacity-[0.05]"
          style={{
            background: 'radial-gradient(circle, #F5A623 0%, transparent 70%)',
            filter: 'blur(120px)',
            bottom: '15%',
            left: '40%',
            animation: 'hero-blob-3 22s ease-in-out infinite',
          }}
        />
        <div
          className="absolute w-[400px] h-[400px] rounded-full opacity-[0.08] dark:opacity-[0.04]"
          style={{
            background: 'radial-gradient(circle, #00D1C1 0%, transparent 70%)',
            filter: 'blur(120px)',
            top: '50%',
            left: '5%',
            animation: 'hero-blob-2 18s ease-in-out infinite reverse',
          }}
        />
      </div>

      {/* ── Centered glow behind mockup area ────────────────────────── */}
      <div
        className="absolute left-0 right-0 bottom-0 h-[70%] pointer-events-none z-0"
        style={{
          background:
            'radial-gradient(ellipse 80% 60% at 50% 60%, rgba(40,205,86,0.14) 0%, rgba(40,205,86,0.05) 35%, transparent 70%)',
        }}
        aria-hidden="true"
      />

      {/* ── Grid edge lines ─────────────────────────────────────────── */}
      <div
        className="absolute inset-0 max-w-6xl mx-auto pointer-events-none z-[1]"
        aria-hidden="true"
      >
        <div className="relative h-full">
          <div className="absolute top-0 bottom-0 left-0 w-px bg-stone-200 dark:bg-white/10" />
          <div className="absolute top-0 bottom-0 right-0 w-px bg-stone-200 dark:bg-white/10" />
        </div>
      </div>

      {/* ── Content ─────────────────────────────────────────────────── */}
      <div className="relative max-w-6xl mx-auto px-8 md:px-10 z-10">
        <div className="max-w-4xl mx-auto text-center pt-28 md:pt-36">
          {/* Badge */}
          <motion.span
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-stone-200 dark:border-white/10 bg-white dark:bg-white/5 text-xs text-stone-500 dark:text-white/50 mb-8"
            initial={{ opacity: 0, y: 12 }}
            animate={ready ? show : hide}
            transition={entryTransition(0.3)}
          >
            Built for Shopify theme developers who ship
          </motion.span>

          {/* H1 — static, fully indexable, NO rotating words */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={ready ? show : hide}
            transition={entryTransition(0.45)}
          >
            <h1 className="font-medium leading-[1.08] tracking-[-0.03em] text-[clamp(1.75rem,5.5vw,4.25rem)] text-stone-900 dark:text-white">
              AI-Powered Shopify Theme IDE
              <br className="hidden sm:block" />
              {' '}for Liquid Developers
            </h1>
          </motion.div>

          {/* Subtitle */}
          <motion.p
            className="text-lg md:text-xl text-stone-500 dark:text-white/50 mt-6 max-w-2xl mx-auto leading-relaxed"
            initial={{ opacity: 0, y: 12 }}
            animate={ready ? show : hide}
            transition={entryTransition(0.7)}
          >
            Type{' '}
            <code className="px-1.5 py-0.5 rounded bg-stone-100 dark:bg-white/5 text-stone-700 dark:text-white/70 text-base font-mono">
              {'{{ product.'}
            </code>{' '}
            and watch{' '}
            <code className="px-1.5 py-0.5 rounded bg-stone-100 dark:bg-white/5 text-stone-700 dark:text-white/70 text-base font-mono">
              .title
            </code>
            ,{' '}
            <code className="px-1.5 py-0.5 rounded bg-stone-100 dark:bg-white/5 text-stone-700 dark:text-white/70 text-base font-mono">
              .price
            </code>
            ,{' '}
            <code className="px-1.5 py-0.5 rounded bg-stone-100 dark:bg-white/5 text-stone-700 dark:text-white/70 text-base font-mono">
              .variants
            </code>{' '}
            appear before you finish the thought. Five AI specialists write and
            review your Liquid, CSS, and JavaScript — all in the browser, no
            setup.
          </motion.p>

          {/* CTA buttons */}
          <motion.div
            className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4"
            initial={{ opacity: 0, y: 12 }}
            animate={ready ? show : hide}
            transition={entryTransition(0.95)}
          >
            <MagneticElement strength={6} radius={120}>
              <button
                type="button"
                onClick={() => openAuthModal('signup')}
                className="h-12 px-6 sm:px-10 rounded-full bg-accent text-white font-medium text-[15px] hover:bg-accent-hover transition-colors w-full sm:w-auto"
              >
                Start Free — No Credit Card
              </button>
            </MagneticElement>

            <button
              type="button"
              onClick={handleSmoothScroll}
              className="text-sm text-stone-500 dark:text-white/50 hover:text-stone-900 dark:hover:text-white transition-colors underline underline-offset-4 decoration-stone-300 dark:decoration-white/20 hover:decoration-stone-500 dark:hover:decoration-white/50"
            >
              See how it works
            </button>
          </motion.div>

          {/* Trust line */}
          <motion.p
            className="mt-6 text-sm text-stone-400 dark:text-white/30"
            initial={{ opacity: 0 }}
            animate={ready ? { opacity: 1 } : hide}
            transition={entryTransition(1.15)}
          >
            Runs in the browser. No local install. Works with your existing
            Shopify themes.
          </motion.p>
        </div>

        {/* ── Product mockup — full width, parallax ────────────────── */}
        <motion.div
          className="relative mt-10 md:mt-14"
          initial={{ opacity: 0, y: 40, scale: 0.97 }}
          animate={ready ? { opacity: 1, y: 0, scale: 1 } : hide}
          transition={{
            duration: 0.8,
            delay: 1.3,
            ease: [0.22, 1, 0.36, 1],
          }}
          style={{ y: mockupY }}
        >
          <div className="relative rounded-2xl overflow-hidden shadow-xl shadow-stone-300/30 dark:shadow-black/30">
            <CodeEditorMockup />
          </div>
        </motion.div>
      </div>

      {/* ── Bottom divider ──────────────────────────────────────────── */}
      <div className="relative z-10 mt-16 md:mt-24">
        <GridDivider />
      </div>
    </section>
  );
}
