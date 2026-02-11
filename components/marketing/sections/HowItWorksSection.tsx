'use client';

import { useState, useRef, useCallback, useLayoutEffect } from 'react';
import { motion, AnimatePresence, useInView } from 'framer-motion';
import { Link, Code, Rocket } from 'lucide-react';
import { PixelAccent } from '@/components/marketing/interactions/PixelAccent';
import { MagneticElement } from '@/components/marketing/interactions/MagneticElement';
import { useAuthModal } from '@/components/marketing/AuthModalContext';

/* ------------------------------------------------------------------ */
/*  Step data                                                          */
/* ------------------------------------------------------------------ */

const STEPS = [
  {
    id: 'connect',
    icon: Link,
    title: 'Connect',
    headline: 'Link your Shopify store.',
    description:
      'Authenticate with one click and Synapse pulls your entire theme — every template, stylesheet, and asset. No CLI, no git setup, no manual uploads. Your store connects in seconds and stays in sync automatically.',
    stats: ['One-click OAuth', '40+ global regions', 'Auto-sync on save'],
    cta: 'Connect your store',
  },
  {
    id: 'build',
    icon: Code,
    title: 'Build',
    headline: 'Five agents write your theme.',
    description:
      'Describe what you want in plain language. A PM agent breaks it into tasks, three language specialists — Liquid, JavaScript, and CSS — build in parallel, and a review agent validates every line before it reaches you.',
    stats: ['5 AI agents', 'Real-time validation', 'Context-aware edits'],
    cta: 'Start building',
  },
  {
    id: 'ship',
    icon: Rocket,
    title: 'Ship',
    headline: 'Deploy in one click.',
    description:
      'Preview changes on a live rendering of your store, then push to production with a single click. Synapse handles version control, rollback, and performance checks — so every deploy is safe and fast.',
    stats: ['Live preview', 'One-click deploy', 'Instant rollback'],
    cta: 'Ship your first theme',
  },
];

const TAB_PANEL_ID = 'how-it-works-panel';
const transition = { duration: 0.3, ease: [0.22, 1, 0.36, 1] as const };

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

const PILL_PAD = 4; // p-1 = 4px
const BAR_RATIO = 0.35; // accent bar width relative to pill
const pillSpring = { type: 'spring' as const, stiffness: 500, damping: 28, mass: 0.6 };
const barSpring = { type: 'spring' as const, stiffness: 350, damping: 32, mass: 1.0, delay: 0.04 };

export function HowItWorksSection() {
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, { once: false, margin: '-80px' });
  const { openAuthModal } = useAuthModal();
  const [activeStep, setActiveStep] = useState(0);
  const step = STEPS[activeStep];

  // Measure tab positions for the sliding indicator
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [tabRect, setTabRect] = useState({ left: 0, width: 0 });

  const measure = useCallback(() => {
    const el = tabRefs.current[activeStep];
    if (el) {
      setTabRect({ left: el.offsetLeft, width: el.offsetWidth });
    }
  }, [activeStep]);

  // Re-measure on activeStep change and after initial mount
  useLayoutEffect(() => {
    measure();
  }, [measure]);

  const barWidth = tabRect.width * BAR_RATIO;
  const barLeft = tabRect.left + (tabRect.width - barWidth) / 2;

  return (
    <section
      ref={ref}
      data-navbar-theme="light"
      className="bg-[#fafaf9] dark:bg-[#0a0a0a] relative py-20 md:py-28 overflow-hidden"
    >
      {/* Content frame lines */}
      <div className="absolute inset-0 max-w-6xl mx-auto pointer-events-none" aria-hidden="true">
        <div className="relative h-full">
          <div className="absolute top-0 bottom-0 left-0 w-px bg-stone-200 dark:bg-white/10" />
          <div className="absolute top-0 bottom-0 right-0 w-px bg-stone-200 dark:bg-white/10" />
        </div>
      </div>

      <div className="relative max-w-6xl mx-auto px-8 md:px-10">
        {/* Section header — full width */}
        <motion.div
          className="mb-12"
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        >
          <span className="inline-block rounded-full border border-stone-200 dark:border-white/10 bg-stone-100 dark:bg-white/5 px-3 py-1 text-[11px] font-medium tracking-widest uppercase text-stone-500 dark:text-white/50 mb-4">
            HOW IT WORKS
          </span>
          <h2 className="text-4xl md:text-5xl lg:text-6xl font-medium text-stone-900 dark:text-white tracking-[-0.02em]">
            Connect. <PixelAccent>Build</PixelAccent>. Ship.
          </h2>
        </motion.div>

        {/* Inset glass tab bar */}
        <motion.div
          role="tablist"
          aria-label="How it works steps"
          className="relative inline-flex items-center rounded-full overflow-hidden isolate backdrop-blur-xl p-1 mb-10 bg-zinc-100/90 border border-zinc-200/80 shadow-[inset_0_1px_3px_rgba(0,0,0,0.06)] dark:bg-zinc-800/90 dark:border-white/5 dark:shadow-[inset_0_2px_4px_rgba(0,0,0,0.4)]"
          initial={{ opacity: 0, y: 16 }}
          animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 16 }}
          transition={{ duration: 0.5, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
        >
          {/* Sliding glass pill */}
          <motion.div
            className="absolute rounded-full overflow-hidden bg-gradient-to-b from-white/95 to-white/70 border border-white/60 shadow-[0_4px_20px_rgba(0,0,0,0.15),inset_0_2px_0_rgba(255,255,255,0.5)] dark:bg-gradient-to-b dark:from-white/15 dark:to-white/10 dark:border-white/20 dark:shadow-[0_1px_4px_rgba(0,0,0,0.08),0_4px_20px_rgba(255,255,255,0.12)]"
            initial={false}
            animate={{ x: tabRect.left, width: tabRect.width }}
            transition={pillSpring}
            style={{ left: 0, top: PILL_PAD, bottom: PILL_PAD }}
          />

          {/* Accent glow bar */}
          <motion.div
            className="absolute h-[2px] rounded-full bg-accent shadow-[0_0_8px_rgba(40,205,86,0.6)] bottom-[1px]"
            initial={false}
            animate={{ x: barLeft, width: barWidth }}
            transition={barSpring}
            style={{ left: 0 }}
          />

          {/* Ambient glow */}
          <motion.div
            className="absolute rounded-full pointer-events-none z-0"
            initial={false}
            animate={{ x: tabRect.left, width: tabRect.width }}
            transition={barSpring}
            style={{
              left: 0,
              top: PILL_PAD,
              bottom: PILL_PAD,
              background: 'radial-gradient(ellipse at 50% 80%, rgba(40,205,86,0.15) 0%, transparent 60%)',
            }}
          />

          {/* Caustic overlay (dark mode polish) */}
          <motion.div
            className="absolute inset-0 rounded-full pointer-events-none dark:block hidden"
            style={{
              background: `radial-gradient(ellipse at ${activeStep === 0 ? 20 : activeStep === 1 ? 50 : 80}% 20%, rgba(255,255,255,0.06) 0%, transparent 50%)`,
            }}
            animate={{ opacity: [0.5, 0.7, 0.5] }}
            transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
          />

          {/* Tab buttons */}
          {STEPS.map((s, index) => {
            const isActive = activeStep === index;
            const TabIcon = s.icon;
            return (
              <button
                key={s.id}
                ref={(el) => { tabRefs.current[index] = el; }}
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-controls={TAB_PANEL_ID}
                id={`how-it-works-tab-${s.id}`}
                onClick={() => setActiveStep(index)}
                className={`relative z-10 rounded-full px-5 py-2 text-sm inline-flex items-center gap-2 transition-colors duration-200 ${
                  isActive
                    ? 'text-stone-900 dark:text-white font-medium'
                    : 'text-stone-500 dark:text-white/50 hover:text-stone-700 dark:hover:text-white/70'
                }`}
              >
                <TabIcon size={15} className="shrink-0" />
                {s.title}
              </button>
            );
          })}
        </motion.div>

        {/* Two-column grid — filled and balanced */}
        <div
          id={TAB_PANEL_ID}
          role="tabpanel"
          aria-labelledby={`how-it-works-tab-${step.id}`}
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={activeStep}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={transition}
              className="grid grid-cols-1 lg:grid-cols-2 gap-px rounded-2xl overflow-hidden border border-stone-200 dark:border-white/10"
            >
              {/* Left cell — headline + description */}
              <div className="bg-white dark:bg-white/[0.03] p-8 md:p-10 lg:p-12 flex flex-col justify-center">
                <h3 className="text-2xl md:text-3xl font-medium text-stone-900 dark:text-white tracking-[-0.02em] leading-snug">
                  {step.headline}
                </h3>
                <p className="mt-4 text-base md:text-lg text-stone-500 dark:text-white/50 leading-relaxed">
                  {step.description}
                </p>
              </div>

              {/* Right cell — stats + CTA */}
              <div className="bg-stone-50 dark:bg-white/[0.02] p-8 md:p-10 lg:p-12 flex flex-col justify-center">
                {/* Stat pills */}
                <div className="flex flex-wrap gap-2 mb-8">
                  {step.stats.map((stat, i) => (
                    <motion.span
                      key={stat}
                      className="inline-block rounded-full border border-stone-200 dark:border-white/10 bg-white dark:bg-white/5 px-3 py-1 text-[12px] font-medium text-stone-700 dark:text-white/70"
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: 0.25, delay: i * 0.08 }}
                    >
                      {stat}
                    </motion.span>
                  ))}
                </div>

                {/* CTA button */}
                <div>
                  <MagneticElement strength={5} radius={100}>
                    <button
                      type="button"
                      onClick={() => openAuthModal('signup')}
                      className="h-12 px-8 rounded-full bg-accent text-white font-medium text-[15px] hover:bg-accent-hover transition-colors"
                    >
                      {step.cta}
                    </button>
                  </MagneticElement>
                </div>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}
