'use client';

import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import { Code, Monitor, Bot } from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Data                                                               */
/* ------------------------------------------------------------------ */

const CARDS = [
  {
    icon: Code,
    title: 'Liquid that actually understands Liquid',
    description:
      'Type {{ product. and watch object-aware completions appear — .title, .price, .variants, .available. Go-to-definition works. The IDE flags unused variables. Auto-close tags and formatting handle the busywork. It\u2019s not a generic text editor with syntax highlighting — it\u2019s a Liquid code editor.',
    accent: 'bg-blue-500/10 text-blue-600 dark:bg-blue-400/10 dark:text-blue-400',
  },
  {
    icon: Monitor,
    title: 'Preview that matches reality',
    description:
      'Change a file and the preview updates instantly. Toggle locale. Resize to 375, 768, 1024, or full width. Drop in mock customer data, cart contents, and discount codes — test edge cases without leaving the editor.',
    accent: 'bg-emerald-500/10 text-emerald-600 dark:bg-emerald-400/10 dark:text-emerald-400',
  },
  {
    icon: Bot,
    title: 'Five specialists, one chat',
    description:
      'A PM agent for scope, a Liquid specialist for templates, CSS and JS specialists for styling and behavior, and a Review agent that checks before deploy. Each routes to the right model — Claude, GPT-4o, or Gemini. Ask in plain English, get answers that know Shopify.',
    accent: 'bg-violet-500/10 text-violet-600 dark:bg-violet-400/10 dark:text-violet-400',
  },
] as const;

const ease = [0.22, 1, 0.36, 1] as const;

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function ValuePropsV2() {
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, { once: false, margin: '-80px' });

  return (
    <section
      ref={ref}
      className="relative bg-[#fafaf9] dark:bg-[#0a0a0a] overflow-hidden"
    >
      <div className="max-w-6xl mx-auto px-8 md:px-10 py-16 md:py-24">
        {/* ── Header ───────────────────────────────────────────────── */}
        <motion.div
          className="text-center max-w-2xl mx-auto mb-14"
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
          transition={{ duration: 0.5, ease }}
        >
          <span className="inline-block rounded-full border border-stone-200 dark:border-white/10 bg-stone-100 dark:bg-white/5 px-3 py-1 text-[11px] font-medium tracking-widest uppercase text-stone-500 dark:text-white/50 mb-4">
            Built for the flow
          </span>
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-medium text-stone-900 dark:text-white tracking-[-0.02em]">
            An IDE that meets you where you work
          </h2>
          <p className="mt-4 text-lg text-stone-500 dark:text-white/50 leading-relaxed">
            Every feature is designed for one thing: keep you in the zone. No
            context switches, no hunting for docs, no guessing.
          </p>
        </motion.div>

        {/* ── Cards ────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {CARDS.map((card, index) => {
            const Icon = card.icon;

            return (
              <motion.div
                key={card.title}
                className="rounded-xl border border-stone-200 dark:border-white/10 bg-white dark:bg-white/5 p-8 flex flex-col"
                initial={{ opacity: 0, y: 24 }}
                animate={
                  inView
                    ? { opacity: 1, y: 0 }
                    : { opacity: 0, y: 24 }
                }
                transition={{
                  duration: 0.5,
                  delay: index * 0.12,
                  ease,
                }}
              >
                {/* Icon circle */}
                <div
                  className={`w-11 h-11 rounded-full flex items-center justify-center mb-5 ${card.accent}`}
                >
                  <Icon size={20} />
                </div>

                <h3 className="text-lg font-semibold text-stone-900 dark:text-white leading-snug">
                  {card.title}
                </h3>

                <p className="mt-3 text-sm text-stone-500 dark:text-white/50 leading-relaxed">
                  {card.description}
                </p>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
