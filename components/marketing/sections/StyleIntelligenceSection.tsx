'use client';

import React, { useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import { Palette, Layers, ShieldCheck } from 'lucide-react';

const ease = [0.22, 1, 0.36, 1] as const;

const CARDS = [
  {
    icon: Palette,
    title: 'Design tokens detected',
    body: "Synapse reads your theme's color palette, typography scale, and spacing system. Every AI-generated change uses your exact tokens — not generic defaults.",
    iconBg: 'bg-rose-500/10 dark:bg-rose-400/10',
    iconColor: 'text-rose-600 dark:text-rose-400',
  },
  {
    icon: Layers,
    title: 'Consistent styling',
    body: 'New sections match your existing components. Buttons use your button styles. Cards use your card styles. It feels like you wrote it.',
    iconBg: 'bg-sky-500/10 dark:bg-sky-400/10',
    iconColor: 'text-sky-600 dark:text-sky-400',
  },
  {
    icon: ShieldCheck,
    title: 'No style drift',
    body: 'Your brand stays consistent across every edit. Colors, fonts, and spacing stay aligned — even when multiple agents work in parallel.',
    iconBg: 'bg-violet-500/10 dark:bg-violet-400/10',
    iconColor: 'text-violet-600 dark:text-violet-400',
  },
];

export function StyleIntelligenceSection() {
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, { once: false, margin: '-80px' });
  const reducedMotion = typeof window !== 'undefined'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  return (
    <section
      ref={ref}
      className="bg-[oklch(0.985_0.001_106)] dark:bg-[oklch(0.145_0_0)] py-16 md:py-24"
      aria-label="Style intelligence features"
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6 md:px-10">
        {/* Badge */}
        <motion.div
          className="flex justify-center mb-6"
          initial={{ opacity: 0, y: reducedMotion ? 0 : 12 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5, ease }}
        >
          <span className="inline-block rounded-full border border-stone-200 dark:border-white/10 bg-stone-100 dark:bg-white/5 px-3 py-1 text-[11px] font-medium tracking-widest uppercase text-stone-500 dark:text-white/50">
            Style Intelligence
          </span>
        </motion.div>

        {/* Headline */}
        <motion.h2
          className="text-center text-3xl md:text-4xl lg:text-5xl font-medium tracking-[-0.02em] leading-[1.05] text-stone-900 dark:text-white"
          initial={{ opacity: 0, y: reducedMotion ? 0 : 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5, delay: 0.05, ease }}
        >
          Code that matches your theme. Automatically.
        </motion.h2>

        {/* Subtitle */}
        <motion.p
          className="mt-4 text-center text-lg text-stone-500 dark:text-white/50 leading-relaxed max-w-2xl mx-auto"
          initial={{ opacity: 0, y: reducedMotion ? 0 : 16 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5, delay: 0.1, ease }}
        >
          Most AI tools generate generic code. Synapse studies your theme&apos;s
          design language and writes code that belongs.
        </motion.p>

        {/* Card Grid */}
        <div className="mt-12 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
          {CARDS.map((card, index) => (
            <motion.article
              key={card.title}
              className="rounded-xl border border-stone-200 dark:border-white/10 bg-white dark:bg-white/5 p-5 md:p-8"
              initial={{ opacity: 0, y: reducedMotion ? 0 : 24 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.5, delay: 0.15 + index * 0.12, ease }}
            >
              <div className={`w-11 h-11 rounded-full ${card.iconBg} flex items-center justify-center mb-4`}>
                <card.icon size={20} className={card.iconColor} aria-hidden="true" />
              </div>
              <h3 className="text-lg font-semibold text-stone-900 dark:text-white mb-2">
                {card.title}
              </h3>
              <p className="text-sm text-stone-500 dark:text-white/50 leading-relaxed">
                {card.body}
              </p>
            </motion.article>
          ))}
        </div>
      </div>
    </section>
  );
}
