'use client';

import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import { PixelAccent } from '@/components/marketing/interactions/PixelAccent';

/* ------------------------------------------------------------------ */
/*  Data                                                               */
/* ------------------------------------------------------------------ */

const STEPS = [
  {
    number: '1',
    title: 'Connect or start fresh',
    description:
      'Open Synapse in your browser. Connect your Shopify store or start from a blank theme. No local environment, no CLI, no config files. You\u2019re in the IDE in seconds.',
  },
  {
    number: '2',
    title: 'Build with intelligence',
    description:
      'Edit Liquid, CSS, and JavaScript with completions that know Shopify objects. Use the template composer to reorder sections visually. Preview changes live. Ask the AI specialists when you need help.',
  },
  {
    number: '3',
    title: 'Deploy with confidence',
    description:
      'Run the pre-flight: quick rule-based scan, then full AI review. If you\u2019re on a team, request deploy and an admin approves. Push to your Shopify theme. Done.',
  },
] as const;

const ease = [0.22, 1, 0.36, 1] as const;

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function HowItWorksV2() {
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, { once: false, margin: '-80px' });

  return (
    <section
      ref={ref}
      id="how-it-works"
      className="relative bg-[#fafaf9] dark:bg-[#0a0a0a] overflow-hidden"
    >
      <div className="max-w-6xl mx-auto px-8 md:px-10 py-16 md:py-24">
        {/* ── Header ───────────────────────────────────────────────── */}
        <motion.div
          className="text-center max-w-2xl mx-auto mb-16"
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
          transition={{ duration: 0.5, ease }}
        >
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-medium text-stone-900 dark:text-white tracking-[-0.02em]">
            From zero to shipped in three steps
          </h2>
        </motion.div>

        {/* ── Steps ────────────────────────────────────────────────── */}
        <div className="relative">
          {/* Connecting line (desktop only) */}
          <div
            className="hidden md:block absolute top-10 left-[calc(16.667%+1rem)] right-[calc(16.667%+1rem)] h-px bg-stone-200 dark:bg-white/10"
            aria-hidden="true"
          />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-12 md:gap-8">
            {STEPS.map((step, index) => (
              <motion.div
                key={step.number}
                className="relative flex flex-col items-center text-center"
                initial={{ opacity: 0, y: 24 }}
                animate={
                  inView
                    ? { opacity: 1, y: 0 }
                    : { opacity: 0, y: 24 }
                }
                transition={{
                  duration: 0.5,
                  delay: index * 0.15,
                  ease,
                }}
              >
                {/* Step number */}
                <div className="relative z-10 mb-5">
                  <div className="w-14 h-14 md:w-20 md:h-20 rounded-full bg-white dark:bg-white/5 border border-stone-200 dark:border-white/10 flex items-center justify-center shadow-sm">
                    <PixelAccent className="!text-2xl md:!text-3xl">{step.number}</PixelAccent>
                  </div>

                  {/* Dot connectors on the line (desktop only) */}
                  {index < STEPS.length - 1 && (
                    <div
                      className="hidden md:block absolute top-1/2 -translate-y-1/2 -right-4 w-2 h-2 rounded-full bg-stone-300 dark:bg-white/20"
                      aria-hidden="true"
                    />
                  )}
                </div>

                <h3 className="text-lg font-semibold text-stone-900 dark:text-white mb-3">
                  {step.title}
                </h3>

                <p className="text-sm text-stone-500 dark:text-white/50 leading-relaxed max-w-xs">
                  {step.description}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
