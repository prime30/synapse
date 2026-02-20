'use client';

import { useRef, useState, useEffect } from 'react';
import { motion, useInView, AnimatePresence } from 'framer-motion';
import { PixelAccent } from '@/components/marketing/interactions/PixelAccent';

type Phase = 'initial' | 'push' | 'strike' | 'surprised' | 'blown';

const EASE = [0.22, 1, 0.36, 1] as const;

export function CaseStudySection() {
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, { once: true, margin: '-80px' });

  // Phase state machine
  const [phase, setPhase] = useState<Phase>('initial');
  const [hourCount, setHourCount] = useState(19);

  // Phase timers
  useEffect(() => {
    if (!inView) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    timers.push(setTimeout(() => setPhase('push'), 1000));
    timers.push(setTimeout(() => setPhase('strike'), 1600));
    timers.push(setTimeout(() => setPhase('surprised'), 2200));
    timers.push(setTimeout(() => setPhase('blown'), 3000));
    return () => timers.forEach(clearTimeout);
  }, [inView]);

  // Countdown — starts when strike phase begins
  const strikeReached = phase === 'strike' || phase === 'surprised' || phase === 'blown';
  useEffect(() => {
    if (!strikeReached) return;
    let current = 19;
    let timeoutId: ReturnType<typeof setTimeout>;
    const run = () => {
      if (current <= 1) {
        setHourCount(1);
        return;
      }
      current -= 1;
      setHourCount(current);
      const delay = Math.max(40, 200 - (19 - current) * 7);
      timeoutId = setTimeout(run, delay);
    };
    timeoutId = setTimeout(run, 400);
    return () => clearTimeout(timeoutId);
  }, [strikeReached]);

  const isPushed = phase !== 'initial';
  const isStrike = phase === 'strike' || phase === 'surprised' || phase === 'blown';

  return (
    <section
      ref={ref}
      data-navbar-theme="light"
      className="relative bg-[#fafaf9] dark:bg-[#0a0a0a] overflow-hidden"
    >
      <div className="absolute inset-0 max-w-6xl mx-auto pointer-events-none" aria-hidden="true">
        <div className="relative h-full">
          <div className="absolute top-0 bottom-0 left-0 w-px bg-stone-200 dark:bg-white/10" />
          <div className="absolute top-0 bottom-0 right-0 w-px bg-stone-200 dark:bg-white/10" />
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 md:px-10 py-16 md:py-24">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          {/* Left column — story */}
          <motion.div
            initial={{ opacity: 0, x: -24 }}
            animate={inView ? { opacity: 1, x: 0 } : { opacity: 0, x: -24 }}
            transition={{ duration: 0.6, ease: EASE }}
          >
            <span className="section-badge">
              CASE STUDY
            </span>

            <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-medium text-stone-900 dark:text-white tracking-[-0.02em] leading-tight">
              From 3-year roadmap{' '}
              to live in <PixelAccent>60 minutes</PixelAccent>.
            </h2>

            <blockquote className="mt-8 border-l-2 border-stone-300 dark:border-white/20 pl-6">
              <p className="text-lg text-stone-600 dark:text-white/60 leading-relaxed italic">
                &ldquo;My team was quoted three years and a six-figure budget to
                build out our Shopify theme system. I sat down with Synapse on a
                Friday afternoon and had the entire implementation plan executed
                and deployed before my coffee got cold.&rdquo;
              </p>
            </blockquote>

            <div className="mt-6 flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-stone-200 dark:bg-white/10 flex items-center justify-center">
                <span className="text-sm font-semibold text-stone-600 dark:text-white/60">
                  MR
                </span>
              </div>
              <div>
                <p className="text-sm font-medium text-stone-900 dark:text-white">
                  Marcus Reid
                </p>
                <p className="text-sm text-stone-500 dark:text-white/40">
                  Director of Engineering, Meridian Commerce
                </p>
              </div>
            </div>
          </motion.div>

          {/* Right column — dramatic stat comparison */}
          <motion.div
            className="relative flex flex-col items-center justify-center text-center lg:items-end lg:text-right"
            initial={{ opacity: 0, x: 24 }}
            animate={inView ? { opacity: 1, x: 0 } : { opacity: 0, x: 24 }}
            transition={{ duration: 0.6, delay: 0.15, ease: EASE }}
          >
            {/* "3 years" — starts bold/dark, transitions to small/light with strikethrough */}
            <div className="relative">
              {/* Bold version — visible initially, fades out + pushes up */}
              <motion.p
                className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold tracking-[-0.03em] leading-none text-stone-900 dark:text-white"
                animate={{
                  opacity: isPushed ? 0 : 1,
                  y: isPushed ? -20 : 0,
                  scale: isPushed ? 0.6 : 1,
                }}
                transition={{ duration: 0.6, ease: EASE }}
                style={{ originX: 1 }}
              >
                3 years
              </motion.p>

              {/* Light version — fades in at final position with strikethrough */}
              <motion.p
                className="absolute top-0 right-0 lg:right-0 text-2xl sm:text-3xl md:text-4xl font-medium text-stone-300 dark:text-white/15"
                initial={{ opacity: 0 }}
                animate={{
                  opacity: isPushed ? 1 : 0,
                }}
                transition={{ duration: 0.5, delay: 0.1, ease: EASE }}
              >
                <span>3 years</span>
                <motion.span
                  className="absolute left-0 top-1/2 w-full h-[2px] -translate-y-1/2 bg-stone-400/50 dark:bg-white/20 origin-left"
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: isStrike ? 1 : 0 }}
                  transition={{ duration: 0.8, ease: EASE }}
                />
              </motion.p>
            </div>

            {/* Actual time — countdown from 19 to 1, fades in at strike phase */}
            <motion.p
              className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold text-stone-900 dark:text-white tracking-[-0.03em] mt-1 leading-none"
              initial={{ opacity: 0, y: 12 }}
              animate={{
                opacity: isStrike ? 1 : 0,
                y: isStrike ? 0 : 12,
              }}
              transition={{ duration: 0.5, ease: EASE }}
            >
              {hourCount} hour
              {/* Fixed-width inline slot for "s" or emoji — prevents reflow */}
              <span className="inline-block w-[0.6em] text-left align-baseline">
                <AnimatePresence mode="wait">
                  {hourCount > 1 && (
                    <motion.span
                      key="s"
                      className="inline-block"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      s
                    </motion.span>
                  )}
                  {hourCount === 1 && phase === 'surprised' && (
                    <motion.span
                      key="surprised"
                      className="inline-block text-[0.45em] leading-none align-middle"
                      initial={{ opacity: 0, scale: 0.5 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.5 }}
                      transition={{ duration: 0.3, ease: EASE }}
                    >
                      😮
                    </motion.span>
                  )}
                  {hourCount === 1 && phase === 'blown' && (
                    <motion.span
                      key="blown"
                      className="inline-block text-[0.45em] leading-none align-middle"
                      initial={{ opacity: 0, scale: 0.5, rotate: -10 }}
                      animate={{ opacity: 1, scale: 1, rotate: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.4, ease: EASE }}
                    >
                      🤯
                    </motion.span>
                  )}
                </AnimatePresence>
              </span>
            </motion.p>

            <motion.p
              className="text-sm text-stone-500 dark:text-white/40 mt-4 tracking-wide uppercase"
              initial={{ opacity: 0 }}
              animate={{ opacity: isStrike ? 1 : 0 }}
              transition={{ duration: 0.4, delay: 0.2, ease: EASE }}
            >
              Actual implementation time
            </motion.p>
          </motion.div>
        </div>

        {/* Marquee of milestone badges */}
        <motion.div
          className="mt-16 md:mt-20 pt-8 md:pt-10 border-t border-stone-200 dark:border-white/10 overflow-hidden"
          initial={{ opacity: 0, y: 12 }}
          animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 12 }}
          transition={{ duration: 0.5, delay: 0.3, ease: EASE }}
        >
          <div className="flex w-max animate-case-study-marquee gap-2">
            {[...Array(2)].map((_, copy) =>
              [
                'Discovery',
                'RFP',
                'Vendor review',
                'Contract',
                'Kickoff',
                'Design phase',
                'Sprint 1 of 24',
                'QA cycle',
                'UAT',
                'Launch',
              ].map((label) => (
                <span
                  key={`${copy}-${label}`}
                  className="shrink-0 rounded-full border border-stone-200 dark:border-white/10 bg-stone-50 dark:bg-white/5 px-3 py-1.5 text-[11px] tracking-wide uppercase font-medium text-stone-500 dark:text-white/40"
                >
                  {label}
                </span>
              ))
            )}
          </div>
        </motion.div>
      </div>
    </section>
  );
}
