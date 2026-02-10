'use client';

import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import { CounterStat } from '@/components/marketing/interactions/CounterStat';

const STATS: { value: number; suffix: string; prefix?: string; label: string }[] = [
  { value: 5, suffix: '', label: 'AI agents' },
  { value: 3, suffix: '', label: 'Languages' },
  { value: 6, suffix: '', label: 'MCP tools' },
  { value: 40, suffix: '+', label: 'Shopify globals' },
];

export function SocialProofStrip() {
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, { once: true, margin: '-80px' });

  return (
    <section
      ref={ref}
      data-navbar-theme="light"
      className="bg-[#fafaf9] dark:bg-[#0a0a0a] group relative overflow-hidden"
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
      <div className="relative max-w-6xl mx-auto px-8 md:px-10 py-16 md:py-20">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
          {STATS.map((stat, index) => (
            <motion.div
              key={stat.label}
              className="text-center"
              initial={{ opacity: 0, y: 16 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
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
        </div>
      </div>
    </section>
  );
}
