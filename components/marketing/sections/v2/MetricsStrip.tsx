'use client';

import { useRef, useState, useEffect } from 'react';
import { motion, useInView } from 'framer-motion';

/* ------------------------------------------------------------------ */
/*  Metrics data                                                       */
/* ------------------------------------------------------------------ */

interface Metric {
  /** Display value when animation completes */
  display: string;
  /** Numeric target for count-up (null = fade-in only) */
  target: number | null;
  label: string;
}

const METRICS: Metric[] = [
  { display: '5', target: 5, label: 'AI specialist agents — PM, Liquid, CSS, JS, Review' },
  { display: '40+', target: null, label: 'Shopify object completions — products, collections, customers, and more' },
  { display: '16', target: 16, label: 'Metafield input types — type-aware forms for every definition' },
  { display: '8', target: 8, label: 'Accessibility rules scanned before deploy' },
  { display: '0-100', target: null, label: 'Performance score per theme' },
];

/* ------------------------------------------------------------------ */
/*  Count-up hook                                                      */
/* ------------------------------------------------------------------ */

function useCountUp(target: number, active: boolean, duration = 1200) {
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (!active) return;

    const startTime = performance.now();
    let raf: number;

    const tick = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(eased * target));

      if (progress < 1) {
        raf = requestAnimationFrame(tick);
      }
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, active, duration]);

  return value;
}

/* ------------------------------------------------------------------ */
/*  Individual metric card                                             */
/* ------------------------------------------------------------------ */

function MetricCard({ metric, index, inView }: { metric: Metric; index: number; inView: boolean }) {
  const countValue = useCountUp(metric.target ?? 0, inView && metric.target !== null);

  const displayValue = metric.target !== null ? String(countValue) : metric.display;

  return (
    <motion.div
      className="flex flex-col items-center text-center px-4 py-6"
      initial={{ opacity: 0, y: 16 }}
      animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 16 }}
      transition={{ duration: 0.5, delay: index * 0.08, ease: [0.22, 1, 0.36, 1] }}
    >
      <span className="text-3xl font-semibold text-accent tabular-nums">
        {displayValue}
      </span>
      <span className="text-sm text-stone-500 dark:text-white/50 mt-2 max-w-[160px] sm:max-w-[200px] leading-snug">
        {metric.label}
      </span>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  MetricsStrip                                                       */
/* ------------------------------------------------------------------ */

export default function MetricsStrip() {
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, { once: false, margin: '-80px' });

  return (
    <section
      ref={ref}
      className="relative bg-stone-50 dark:bg-white/[0.02] overflow-hidden"
    >
      <div className="max-w-6xl mx-auto px-8 md:px-10 py-12 md:py-16">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
          {METRICS.map((metric, i) => (
            <MetricCard key={metric.display} metric={metric} index={i} inView={inView} />
          ))}
        </div>
      </div>
    </section>
  );
}
