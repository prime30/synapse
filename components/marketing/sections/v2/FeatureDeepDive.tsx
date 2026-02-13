'use client';

import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import { Layout, Shield, FolderOpen, Sparkles, Check } from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Data                                                               */
/* ------------------------------------------------------------------ */

const PILLARS = [
  {
    icon: Layout,
    title: 'Template Composer',
    tint: 'bg-blue-50 dark:bg-blue-500/5',
    iconAccent: 'text-blue-600 dark:text-blue-400',
    bullets: [
      'Drag and reorder sections and blocks directly from templates/*.json',
      'No more hand-editing JSON to fix section order — it\u2019s a visual map of your template',
      'Add, remove, or reorder blocks without touching raw JSON',
      'See the structure of your theme at a glance, then tweak it in place',
    ],
  },
  {
    icon: Shield,
    title: 'Quality and Deploy',
    tint: 'bg-emerald-50 dark:bg-emerald-500/5',
    iconAccent: 'text-emerald-600 dark:text-emerald-400',
    bullets: [
      'Get a 0-100 performance score before you ship',
      'Run an 8-rule accessibility scanner and fix issues inline',
      'Image optimization detector catches heavy assets before production',
      'Two-tier deploy: rule-based scan then full AI review, plus role-based approval for teams',
    ],
  },
  {
    icon: FolderOpen,
    title: 'Asset Browser and Metafields',
    tint: 'bg-amber-50 dark:bg-amber-500/5',
    iconAccent: 'text-amber-600 dark:text-amber-400',
    bullets: [
      'Upload, delete, and drag-to-insert Liquid asset references',
      'Metafield CRUD with 16 type-aware form inputs — text, number, JSON, date, color, and more',
      'See what\u2019s in your theme, insert it where you need it, and move on',
      'Keep schema and metafield definitions in sync',
    ],
  },
  {
    icon: Sparkles,
    title: 'Ambient Intelligence',
    tint: 'bg-violet-50 dark:bg-violet-500/5',
    iconAccent: 'text-violet-600 dark:text-violet-400',
    bullets: [
      'Proactive nudges before you open chat — the IDE suggests what to fix next',
      'Spatial canvas: dependency graph with AI suggestion nodes',
      'Chromatic IDE: UI tints based on your theme\u2019s color palette',
      'Batch operations: fix all similar across files with batch undo',
    ],
  },
] as const;

const ease = [0.22, 1, 0.36, 1] as const;

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function FeatureDeepDive() {
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, { once: false, margin: '-80px' });

  return (
    <section
      id="features"
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
            Under the hood
          </span>
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-medium text-stone-900 dark:text-white tracking-[-0.02em]">
            Built for the way you actually ship themes
          </h2>
        </motion.div>

        {/* ── 2×2 Grid ─────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {PILLARS.map((pillar, index) => {
            const Icon = pillar.icon;

            return (
              <motion.div
                key={pillar.title}
                className={`rounded-xl border border-stone-200 dark:border-white/10 p-5 md:p-8 ${pillar.tint}`}
                initial={{ opacity: 0, y: 24 }}
                animate={
                  inView
                    ? { opacity: 1, y: 0 }
                    : { opacity: 0, y: 24 }
                }
                transition={{
                  duration: 0.5,
                  delay: index * 0.1,
                  ease,
                }}
              >
                {/* Icon + Title */}
                <div className="flex items-center gap-3 mb-5">
                  <Icon size={22} className={pillar.iconAccent} />
                  <h3 className="text-lg font-semibold text-stone-900 dark:text-white">
                    {pillar.title}
                  </h3>
                </div>

                {/* Bullet list */}
                <ul className="space-y-3">
                  {pillar.bullets.map((bullet) => (
                    <li
                      key={bullet}
                      className="flex items-start gap-2.5 text-sm text-stone-600 dark:text-white/60 leading-relaxed"
                    >
                      <Check
                        size={16}
                        className="mt-0.5 shrink-0 text-emerald-500 dark:text-emerald-400"
                      />
                      <span>{bullet}</span>
                    </li>
                  ))}
                </ul>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
