'use client';

import { useRef, useState, useEffect } from 'react';
import { motion, useInView } from 'framer-motion';
import { PixelAccent } from '@/components/marketing/interactions/PixelAccent';

export function CaseStudySection() {
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, { once: true, margin: '-80px' });
  const [hourCount, setHourCount] = useState(24);

  useEffect(() => {
    if (!inView) return;
    let current = 24;
    let timeoutId: ReturnType<typeof setTimeout>;
    const run = () => {
      if (current <= 1) {
        setHourCount(1);
        return;
      }
      current -= 1;
      setHourCount(current);
      const delay = Math.max(40, 200 - (24 - current) * 7);
      timeoutId = setTimeout(run, delay);
    };
    timeoutId = setTimeout(run, 400);
    return () => clearTimeout(timeoutId);
  }, [inView]);

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

      <div className="max-w-6xl mx-auto px-8 md:px-10 py-16 md:py-24">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          {/* Left column — story */}
          <motion.div
            initial={{ opacity: 0, x: -24 }}
            animate={inView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          >
            <span className="section-badge">
              CASE STUDY
            </span>

            <h2 className="text-3xl md:text-4xl lg:text-5xl font-medium text-stone-900 dark:text-white tracking-[-0.02em] leading-tight">
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
            animate={inView ? { opacity: 1, x: 0 } : {}}
            transition={{
              duration: 0.6,
              delay: 0.15,
              ease: [0.22, 1, 0.36, 1],
            }}
          >
            {/* Old estimate — animated strikethrough */}
            <p className="relative inline-block text-5xl md:text-6xl font-medium text-stone-300 dark:text-white/15">
              <span>3 years</span>
              <motion.span
                className="absolute left-0 top-1/2 w-full h-[2px] -translate-y-1/2 bg-stone-400/50 dark:bg-white/20 origin-left"
                initial={{ scaleX: 0 }}
                animate={inView ? { scaleX: 1 } : {}}
                transition={{
                  duration: 0.8,
                  delay: 0.6,
                  ease: [0.22, 1, 0.36, 1],
                }}
              />
            </p>

            {/* Actual time — countdown from 24 to 1 */}
            <p className="text-7xl md:text-8xl lg:text-9xl font-bold text-stone-900 dark:text-white tracking-[-0.03em] mt-2 leading-none">
              {hourCount} hour{hourCount !== 1 ? 's' : ''}
            </p>

            <p className="text-sm text-stone-500 dark:text-white/40 mt-4 tracking-wide uppercase">
              Actual implementation time
            </p>
          </motion.div>
        </div>

        {/* Marquee of milestone badges */}
        <motion.div
          className="mt-16 md:mt-20 pt-8 md:pt-10 border-t border-stone-200 dark:border-white/10 overflow-hidden"
          initial={{ opacity: 0, y: 12 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{
            duration: 0.5,
            delay: 0.3,
            ease: [0.22, 1, 0.36, 1],
          }}
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
