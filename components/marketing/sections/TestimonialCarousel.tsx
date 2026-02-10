'use client';

import { useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence, useInView } from 'framer-motion';
import { ChevronLeft, ChevronRight } from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Testimonial data                                                   */
/* ------------------------------------------------------------------ */

interface Testimonial {
  quote: string;
  author: string;
  role: string;
  company: string;
  /** Initials fallback for avatar */
  initials: string;
}

const TESTIMONIALS: Testimonial[] = [
  {
    quote:
      'A project manager analyzes your request, delegates to Liquid, JavaScript, and CSS specialists, then a dedicated review agent validates every proposed change.',
    author: 'Multi-agent orchestration',
    role: 'How it works',
    company: 'Architecture',
    initials: 'MA',
  },
  {
    quote:
      '40+ built-in Shopify globals, deprecated filter detection, scope tracking, and type inference \u2014 the Liquid validator understands your theme at the schema level.',
    author: 'Shopify-native intelligence',
    role: 'Liquid engine',
    company: 'Validation',
    initials: 'LQ',
  },
  {
    quote:
      'Six MCP tools connect your IDE directly to Synapse. Sync files, execute agents, and apply changes without leaving your editor.',
    author: 'Workspace integration',
    role: 'MCP server',
    company: 'Developer tools',
    initials: 'MCP',
  },
];

/* ------------------------------------------------------------------ */
/*  Animation variants                                                 */
/* ------------------------------------------------------------------ */

const slideVariants = {
  enter: (direction: number) => ({
    x: direction > 0 ? 80 : -80,
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
  },
  exit: (direction: number) => ({
    x: direction > 0 ? -80 : 80,
    opacity: 0,
  }),
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function TestimonialCarousel() {
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, { once: true, margin: '-80px' });

  const [[current, direction], setCurrent] = useState([0, 0]);

  const paginate = useCallback(
    (dir: number) => {
      setCurrent(([prev]) => {
        const next = (prev + dir + TESTIMONIALS.length) % TESTIMONIALS.length;
        return [next, dir];
      });
    },
    [],
  );

  const testimonial = TESTIMONIALS[current];

  return (
    <section
      ref={ref}
      data-navbar-theme="light"
      className="relative bg-[#fafaf9] dark:bg-[#0a0a0a] py-16 md:py-24"
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
      <div className="max-w-3xl mx-auto">
        <motion.div
          className="rounded-2xl border border-stone-200 dark:border-white/10 bg-white dark:bg-white/5 p-8 md:p-12"
          initial={{ opacity: 0, y: 24 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
        >
          {/* Company label */}
          <span className="section-badge">
            {testimonial.company.toUpperCase()}
          </span>

          {/* Quote with AnimatePresence */}
          <div className="relative min-h-[120px] md:min-h-[100px]">
            <AnimatePresence mode="wait" custom={direction}>
              <motion.blockquote
                key={current}
                custom={direction}
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                className="text-xl md:text-2xl font-light text-stone-700 dark:text-white/70 leading-relaxed"
              >
                &ldquo;{testimonial.quote}&rdquo;
              </motion.blockquote>
            </AnimatePresence>
          </div>

          {/* Author + Navigation */}
          <div className="mt-10 flex items-center justify-between">
            {/* Author info */}
            <div className="flex items-center gap-4">
              {/* Avatar circle */}
              <div className="w-10 h-10 rounded-full bg-stone-100 dark:bg-white/10 flex items-center justify-center">
                <span className="text-xs font-medium text-stone-500 dark:text-white/50">
                  {testimonial.initials}
                </span>
              </div>
              <div>
                <p className="text-sm font-medium text-stone-900 dark:text-white">
                  {testimonial.author}
                </p>
                <p className="text-xs text-stone-400 dark:text-white/40">
                  {testimonial.role}
                </p>
              </div>
            </div>

            {/* Navigation */}
            <div className="flex items-center gap-3">
              <button
                onClick={() => paginate(-1)}
                className="w-8 h-8 rounded-full border border-stone-200 dark:border-white/10 flex items-center justify-center hover:border-stone-400 dark:hover:border-white/30 transition-colors"
                aria-label="Previous testimonial"
              >
                <ChevronLeft size={14} className="text-stone-500 dark:text-white/50" />
              </button>

              <span className="text-xs text-stone-400 dark:text-white/40 tabular-nums min-w-[36px] text-center">
                {String(current + 1).padStart(2, '0')}/{String(TESTIMONIALS.length).padStart(2, '0')}
              </span>

              <button
                onClick={() => paginate(1)}
                className="w-8 h-8 rounded-full border border-stone-200 dark:border-white/10 flex items-center justify-center hover:border-stone-400 dark:hover:border-white/30 transition-colors"
                aria-label="Next testimonial"
              >
                <ChevronRight size={14} className="text-stone-500 dark:text-white/50" />
              </button>
            </div>
          </div>
        </motion.div>
      </div>
      </div>
    </section>
  );
}
