'use client';

import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import { XCircle, CheckCircle } from 'lucide-react';
import { GridDivider } from '@/components/marketing/grid/GridDivider';

/* ------------------------------------------------------------------ */
/*  Card data                                                          */
/* ------------------------------------------------------------------ */

interface PainPoint {
  title: string;
  before: string;
  after: string;
}

const PAIN_POINTS: PainPoint[] = [
  {
    title: 'Dead completions',
    before:
      'You\u2019re in VS Code, mid-flow. You type {{ product. and\u2026 nothing. You open the Shopify docs in another tab, scroll for the object reference, switch back. The flow is gone.',
    after:
      'Type {{ product. and the IDE completes .title, .price, .variants, .available instantly. Ctrl+Click goes to definition. No tab switching.',
  },
  {
    title: 'Preview chaos',
    before:
      'You tweak a section. Save. Open your store in a new tab. Hard refresh. Wrong locale. Wrong viewport. You forgot to test with a sold-out product. Ten minutes gone.',
    after:
      'Change the file. Preview updates live. Toggle locale. Resize to mobile, tablet, desktop. Swap in mock cart data or a discount code. Never leave the IDE.',
  },
  {
    title: 'Deploy anxiety',
    before:
      'You\u2019re about to deploy. You hope nothing breaks. You push, cross your fingers, and wait for the first bug report.',
    after:
      'Hit deploy. A rule-based scan runs first. Then AI reviews your changes for Liquid issues, performance hits, and accessibility. You get a clear go/no-go before publish.',
  },
];

/* ------------------------------------------------------------------ */
/*  Animation helpers                                                  */
/* ------------------------------------------------------------------ */

const cardVariants = {
  hidden: { opacity: 0, y: 24 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.5,
      delay: i * 0.15,
      ease: [0.22, 1, 0.36, 1],
    },
  }),
};

/* ------------------------------------------------------------------ */
/*  BeforeAfterCard                                                    */
/* ------------------------------------------------------------------ */

function BeforeAfterCard({ point, index }: { point: PainPoint; index: number }) {
  return (
    <motion.div
      className="rounded-2xl border border-stone-200 dark:border-white/10 bg-white dark:bg-white/[0.03] overflow-hidden"
      custom={index}
      variants={cardVariants}
      initial="hidden"
      animate="visible"
    >
      {/* Card title */}
      <div className="px-6 pt-5 pb-3">
        <span className="text-xs font-medium tracking-wide uppercase text-stone-400 dark:text-white/30">
          {point.title}
        </span>
      </div>

      {/* Before / After split */}
      <div className="grid grid-cols-1 md:grid-cols-2">
        {/* Before */}
        <div className="relative px-6 py-5 border-t border-r-0 md:border-r border-red-500/20">
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-red-500/20 via-red-500/10 to-transparent" />
          <div className="flex items-center gap-2 mb-3">
            <XCircle size={16} className="text-red-400 dark:text-red-400/70 shrink-0" />
            <span className="text-xs font-semibold uppercase tracking-wider text-red-500/70 dark:text-red-400/60">
              Before
            </span>
          </div>
          <p className="text-sm leading-relaxed text-stone-500 dark:text-white/40">
            {point.before}
          </p>
        </div>

        {/* After */}
        <div className="relative px-6 py-5 border-t border-green-500/20">
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-green-500/20 via-green-500/10 to-transparent" />
          <div className="flex items-center gap-2 mb-3">
            <CheckCircle size={16} className="text-green-500 dark:text-green-400/80 shrink-0" />
            <span className="text-xs font-semibold uppercase tracking-wider text-green-600/70 dark:text-green-400/60">
              After
            </span>
          </div>
          <p className="text-sm leading-relaxed text-stone-900 dark:text-white/80">
            {point.after}
          </p>
        </div>
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  ProblemSection                                                     */
/* ------------------------------------------------------------------ */

export default function ProblemSection() {
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, { once: false, margin: '-80px' });

  return (
    <section
      ref={ref}
      className="relative bg-[#fafaf9] dark:bg-[#0a0a0a] overflow-hidden"
    >
      <div className="max-w-6xl mx-auto px-8 md:px-10 py-16 md:py-24">
        {/* ── Header ──────────────────────────────────────────────── */}
        <div className="max-w-3xl mx-auto text-center mb-12 md:mb-16">
          <motion.span
            className="inline-flex items-center px-4 py-1.5 rounded-full border border-stone-200 dark:border-white/10 bg-white dark:bg-white/5 text-xs text-stone-500 dark:text-white/50 mb-6"
            animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 24 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          >
            Sound familiar?
          </motion.span>

          <motion.h2
            className="text-3xl md:text-4xl font-medium leading-[1.15] tracking-[-0.02em] text-stone-900 dark:text-white"
            animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 24 }}
            transition={{
              duration: 0.5,
              delay: 0.1,
              ease: [0.22, 1, 0.36, 1],
            }}
          >
            You shouldn&rsquo;t have to context-switch to build a Shopify theme
          </motion.h2>
        </div>

        {/* ── Cards — stacked vertically, staggered entry ─────────── */}
        <div className="grid grid-cols-1 gap-6 max-w-4xl mx-auto">
          {inView &&
            PAIN_POINTS.map((point, i) => (
              <BeforeAfterCard key={point.title} point={point} index={i} />
            ))}
        </div>
      </div>

      {/* ── Bottom divider ──────────────────────────────────────── */}
      <GridDivider />
    </section>
  );
}
