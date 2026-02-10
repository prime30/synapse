'use client';

import { useState, useRef } from 'react';
import { motion, AnimatePresence, useInView } from 'framer-motion';
import { Link, Code, Rocket } from 'lucide-react';
import { PixelAccent } from '@/components/marketing/interactions/PixelAccent';
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

export function HowItWorksSection() {
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, { once: true, margin: '-80px' });
  const { openAuthModal } = useAuthModal();
  const [activeStep, setActiveStep] = useState(0);
  const step = STEPS[activeStep];

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
        <div className="mb-12">
          <span className="inline-block rounded-full border border-stone-200 dark:border-white/10 bg-stone-100 dark:bg-white/5 px-3 py-1 text-[11px] font-medium tracking-widest uppercase text-stone-500 dark:text-white/50 mb-4">
            HOW IT WORKS
          </span>
          <h2 className="text-4xl md:text-5xl lg:text-6xl font-medium text-stone-900 dark:text-white tracking-[-0.02em]">
            Connect. <PixelAccent>Build</PixelAccent>. Ship.
          </h2>
        </div>

        {/* Glass tab bar */}
        <div
          role="tablist"
          aria-label="How it works steps"
          className="inline-flex rounded-full glass-light dark:glass-dark p-1 mb-10"
        >
          {STEPS.map((s, index) => {
            const isActive = activeStep === index;
            const TabIcon = s.icon;
            return (
              <button
                key={s.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-controls={TAB_PANEL_ID}
                id={`how-it-works-tab-${s.id}`}
                onClick={() => setActiveStep(index)}
                className={`relative rounded-full px-5 py-2 text-sm inline-flex items-center gap-2 transition-all duration-300 ${
                  isActive
                    ? 'bg-white dark:bg-white/10 text-stone-900 dark:text-white font-medium shadow-sm'
                    : 'text-stone-500 dark:text-white/50 hover:text-stone-700 dark:hover:text-white/70'
                }`}
              >
                <TabIcon size={15} className="shrink-0" />
                {s.title}
              </button>
            );
          })}
        </div>

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
                  <button
                    type="button"
                    onClick={() => openAuthModal('signup')}
                    className="h-12 px-8 rounded-full bg-accent text-white font-medium text-[15px] hover:bg-accent-hover transition-colors"
                  >
                    {step.cta}
                  </button>
                </div>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}
