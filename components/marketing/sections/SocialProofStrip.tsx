'use client';

import { useRef, useState, useEffect } from 'react';
import { motion, useInView } from 'framer-motion';
import { CounterStat } from '@/components/marketing/interactions/CounterStat';

const STATS: { value: number; suffix: string; prefix?: string; label: string }[] = [
  { value: 5, suffix: '', label: 'Specialized agents' },
  { value: 3, suffix: '', label: 'Languages supported' },
  { value: 100, suffix: '%', label: 'Liquid + CSS + JS' },
  { value: 0, suffix: '', label: 'Manual deploys needed' },
];

export function SocialProofStrip() {
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, { once: true, margin: '-80px' });
  const [showShimmer, setShowShimmer] = useState(false);

  // Trigger shimmer after counters finish (~1.8s: 1.5s duration + 0.3s last stat delay)
  useEffect(() => {
    if (!inView) return;
    const t = setTimeout(() => setShowShimmer(true), 1800);
    return () => clearTimeout(t);
  }, [inView]);

  return (
    <section
      ref={ref}
      data-navbar-theme="light"
      className="bg-[oklch(0.985_0.001_106)] dark:bg-[oklch(0.145_0_0)] group relative overflow-hidden"
    >
      {/* Hover ghost code overlay */}
      <div
        className="absolute inset-0 opacity-0 group-hover:opacity-[0.03] transition-opacity duration-700 pointer-events-none font-mono text-[9px] leading-[13px] text-stone-900 dark:text-white whitespace-pre overflow-hidden select-none"
        aria-hidden="true"
      >
        {`{% schema %}\n  { "name": "stats" }\n{% endschema %}\n{{ section.settings.heading }}\n`.repeat(10)}
      </div>

      <div className="absolute inset-0 max-w-6xl mx-auto pointer-events-none" aria-hidden="true">
        <div className="relative h-full">
          <div className="absolute top-0 bottom-0 left-0 w-px bg-stone-200 dark:bg-white/10" />
          <div className="absolute top-0 bottom-0 right-0 w-px bg-stone-200 dark:bg-white/10" />
        </div>
      </div>

      {/* Stats content */}
      <div className="relative max-w-6xl mx-auto px-4 sm:px-8 md:px-10 py-16 md:py-20">
        <div className="relative grid grid-cols-2 gap-4 sm:gap-6 md:gap-8 md:grid-cols-4">
          {STATS.map((stat, index) => (
            <motion.div
              key={stat.label}
              className="text-center"
              initial={{ opacity: 0, y: 16 }}
              animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 16 }}
              transition={{
                duration: 0.5,
                delay: index * 0.1,
                ease: [0.22, 1, 0.36, 1],
              }}
            >
              <CounterStat
                value={stat.value}
                suffix={stat.suffix}
                prefix={stat.prefix}
                label={stat.label}
              />
            </motion.div>
          ))}

          {/* Green shimmer sweep — triggers once after counters finish */}
          {showShimmer && (
            <div
              className="absolute left-0 right-0 top-0 h-[60%] pointer-events-none overflow-hidden"
              aria-hidden="true"
              style={{ mixBlendMode: 'overlay' }}
            >
              <div
                className="absolute inset-0"
                style={{
                  width: '400%',
                  background: 'linear-gradient(105deg, transparent 0%, transparent 30%, oklch(0.745 0.189 148) 42%, oklch(0.745 0.189 148) 58%, transparent 70%, transparent 100%)',
                  animation: 'stats-shimmer 3s ease-in-out forwards',
                }}
              />
            </div>
          )}
        </div>
      </div>

    </section>
  );
}
