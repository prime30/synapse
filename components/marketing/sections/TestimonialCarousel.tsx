'use client';

import { useRef, useState, useEffect, useCallback } from 'react';
import { motion, useInView } from 'framer-motion';

/* ------------------------------------------------------------------ */
/*  Card data                                                          */
/* ------------------------------------------------------------------ */

interface FeatureCard {
  kicker: string;
  title: string;
  description: string;
  meta?: string;
}

const CARDS: FeatureCard[] = [
  {
    kicker: 'Architecture',
    title: 'Multi-agent orchestration',
    description:
      'A project manager analyzes your request, delegates to Liquid, JavaScript, and CSS specialists, then a dedicated review agent validates every proposed change.',
    meta: 'How it works',
  },
  {
    kicker: 'Validation',
    title: 'Shopify-native intelligence',
    description:
      '40+ built-in Shopify globals, deprecated filter detection, scope tracking, and type inference \u2014 the Liquid validator understands your theme at the schema level.',
    meta: 'Liquid engine',
  },
  {
    kicker: 'Developer tools',
    title: 'Workspace integration',
    description:
      'Six MCP tools connect your IDE directly to Synapse. Sync files, execute agents, and apply changes without leaving your editor.',
    meta: 'MCP server',
  },
];

const AUTOPLAY_MS = 5000;

/* ------------------------------------------------------------------ */
/*  Single card                                                        */
/* ------------------------------------------------------------------ */

function Card({ card }: { card: FeatureCard }) {
  return (
    <div className="rounded-xl border border-stone-200 dark:border-white/10 bg-white dark:bg-white/5 p-6 md:p-8 h-full flex flex-col">
      {/* Kicker */}
      <span className="section-badge mb-4">{card.kicker.toUpperCase()}</span>

      {/* Title */}
      <h3 className="text-lg font-semibold text-stone-900 dark:text-white mb-3 tracking-[-0.01em]">
        {card.title}
      </h3>

      {/* Description */}
      <p className="text-[15px] leading-relaxed text-stone-600 dark:text-white/60 flex-1">
        {card.description}
      </p>

      {/* Meta chip */}
      {card.meta && (
        <div className="mt-5 pt-4 border-t border-stone-100 dark:border-white/5">
          <span className="inline-block rounded-full bg-stone-100 dark:bg-white/5 px-3 py-1 text-[11px] font-medium tracking-wide text-stone-500 dark:text-white/40">
            {card.meta}
          </span>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Carousel component                                                 */
/* ------------------------------------------------------------------ */

export function TestimonialCarousel() {
  const sectionRef = useRef<HTMLElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const inView = useInView(sectionRef, { once: false, margin: '-60px' });

  const [activeIndex, setActiveIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  // Auto-advance
  useEffect(() => {
    if (!inView || paused) return;
    const id = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % CARDS.length);
    }, AUTOPLAY_MS);
    return () => clearInterval(id);
  }, [inView, paused]);

  const handleMouseEnter = useCallback(() => setPaused(true), []);
  const handleMouseLeave = useCallback(() => setPaused(false), []);
  const handleFocus = useCallback(() => setPaused(true), []);
  const handleBlur = useCallback(() => setPaused(false), []);

  return (
    <section
      ref={sectionRef}
      data-navbar-theme="light"
      className="relative bg-[oklch(0.985_0.001_106)] dark:bg-[oklch(0.145_0_0)] py-16 md:py-24"
    >
      {/* Full-bleed top divider */}
      <div
        className="absolute top-0 left-1/2 -translate-x-1/2 w-screen h-px bg-stone-200 dark:bg-white/10 pointer-events-none"
        aria-hidden="true"
      />
      <div className="absolute inset-0 max-w-6xl mx-auto pointer-events-none" aria-hidden="true">
        <div className="relative h-full">
          <div className="absolute top-0 bottom-0 left-0 w-px bg-stone-200 dark:bg-white/10" />
          <div className="absolute top-0 bottom-0 right-0 w-px bg-stone-200 dark:bg-white/10" />
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-8 md:px-10">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 24 }}
          transition={{ duration: 0.6, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
        >
          {/* Card track — responsive grid */}
          <div
            ref={trackRef}
            className="relative overflow-hidden"
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            onFocus={handleFocus}
            onBlur={handleBlur}
          >
            {/* Mobile: single card with slide animation */}
            <div className="md:hidden">
              <div
                className="flex transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
                style={{ transform: `translateX(-${activeIndex * 100}%)` }}
              >
                {CARDS.map((card, i) => (
                  <div key={i} className="w-full flex-shrink-0 px-2 sm:px-1">
                    <Card card={card} />
                  </div>
                ))}
              </div>
            </div>

            {/* Tablet/desktop: all cards visible in a grid */}
            <div className="hidden md:grid md:grid-cols-3 gap-4">
              {CARDS.map((card, i) => (
                <motion.div
                  key={i}
                  className="transition-all duration-500"
                  animate={{
                    scale: activeIndex === i ? 1 : 0.97,
                    opacity: activeIndex === i ? 1 : 0.55,
                  }}
                  transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                >
                  <Card card={card} />
                </motion.div>
              ))}
            </div>
          </div>

          {/* Dot indicators — visual dots inside 44px touch targets */}
          <div className="flex items-center justify-center gap-0 mt-8">
            {CARDS.map((_, i) => (
              <button
                key={i}
                onClick={() => setActiveIndex(i)}
                className="p-3 min-w-[44px] min-h-[44px] flex items-center justify-center"
                aria-label={`Go to card ${i + 1}`}
              >
                <span
                  className={`block h-2 rounded-full transition-all duration-300 ${
                    activeIndex === i
                      ? 'bg-stone-800 dark:bg-white w-5'
                      : 'bg-stone-300 dark:bg-white/20 hover:bg-stone-400 dark:hover:bg-white/30 w-2'
                  }`}
                />
              </button>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
}
