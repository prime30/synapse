'use client';

import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import { Layout, Shield, FolderOpen, Check, Brain, Users } from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Data                                                               */
/* ------------------------------------------------------------------ */

const PILLARS = [
  {
    icon: Users,
    title: 'Multi-Agent System',
    tint: 'bg-blue-50 dark:bg-blue-500/5',
    iconAccent: 'text-blue-600 dark:text-blue-400',
    bullets: [
      'A Project Manager agent analyzes your request and coordinates specialized agents',
      'Dedicated specialists for Liquid, JavaScript, and CSS when appropriate',
      'Parallel execution \u2014 multiple agents work simultaneously on different files',
      'Structured handoffs so each agent has the context it needs',
    ],
  },
  {
    icon: Brain,
    title: 'Liquid Intelligence',
    tint: 'bg-emerald-50 dark:bg-emerald-500/5',
    iconAccent: 'text-emerald-600 dark:text-emerald-400',
    bullets: [
      'Understands schema blocks, render/include patterns, and variant logic',
      'Aware of Shopify-specific globals and objects',
      'Rendering chain awareness \u2014 traces layout \u2192 template \u2192 section \u2192 snippet \u2192 asset',
      'Settings and metafield-aware editing',
    ],
  },
  {
    icon: Layout,
    title: 'Structural Editing',
    tint: 'bg-amber-50 dark:bg-amber-500/5',
    iconAccent: 'text-amber-600 dark:text-amber-400',
    bullets: [
      'Uses line-range and structural tools for reliable changes',
      'Works with large, complex files without breaking existing code',
      'Self-correcting \u2014 the agent fixes its own mistakes before asking you to review',
      'Cross-file impact analysis for every change',
    ],
  },
  {
    icon: FolderOpen,
    title: 'Real Shopify Integration',
    tint: 'bg-violet-50 dark:bg-violet-500/5',
    iconAccent: 'text-violet-600 dark:text-violet-400',
    bullets: [
      'Connects directly to your Shopify store',
      'Theme sync, preview, and push from the IDE',
      'Asset management with upload and Liquid reference insertion',
      'Works with your existing themes \u2014 no migration required',
    ],
  },
  {
    icon: Shield,
    title: 'Code Quality Tools',
    tint: 'bg-sky-50 dark:bg-sky-500/5',
    iconAccent: 'text-sky-600 dark:text-sky-400',
    bullets: [
      'Built-in validation for Liquid syntax errors',
      'Performance insights to catch heavy assets and slow patterns',
      'Basic accessibility checks during development',
      'Every change validated before deploy',
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
      className="relative bg-[oklch(0.985_0.001_106)] dark:bg-[oklch(0.145_0_0)] overflow-hidden"
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
            Core Capabilities
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

        {/* ── Current Limitations ─────────────────────────────────── */}
        <motion.div
          className="mt-12 rounded-xl border border-stone-200 dark:border-white/10 bg-stone-50 dark:bg-white/[0.02] p-6 md:p-8 max-w-2xl mx-auto"
          initial={{ opacity: 0, y: 16 }}
          animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 16 }}
          transition={{ duration: 0.5, delay: 0.5, ease }}
        >
          <h3 className="text-base font-semibold text-stone-900 dark:text-white mb-3">
            Current Limitations (we are transparent about these)
          </h3>
          <ul className="space-y-2">
            {[
              'Complex architectural changes still benefit from human review',
              'Performance on very large themes can vary',
              'Some advanced customizations may require manual adjustment',
            ].map((item) => (
              <li key={item} className="flex items-start gap-2.5 text-sm text-stone-500 dark:text-white/50 leading-relaxed">
                <span className="mt-1 w-1.5 h-1.5 rounded-full bg-stone-300 dark:bg-white/20 shrink-0" />
                {item}
              </li>
            ))}
          </ul>
        </motion.div>
      </div>
    </section>
  );
}
