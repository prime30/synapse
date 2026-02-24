'use client';

import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import { Layout, Shield, FolderOpen, Sparkles, Check, Zap, Brain, Users, Eye } from 'lucide-react';

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
      'Every change validated before deploy \u2014 catch issues before they reach your store',
      'Broken Liquid syntax, missing assets, and accessibility issues flagged automatically',
      'Self-correcting edits \u2014 the agent fixes its own mistakes before asking you to review',
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
      'Learns your CSS naming, Liquid whitespace, and schema conventions',
      '\u2018Make it like hero-banner\u2019 \u2014 understands reference intent and matches existing patterns',
      'Preferences persist across sessions and improve with every edit you approve',
      'Design tokens, code style, and learned patterns merged into one system',
    ],
  },
  {
    icon: Zap,
    title: 'Parallel Agent Execution',
    tint: 'bg-sky-50 dark:bg-sky-500/5',
    iconAccent: 'text-sky-600 dark:text-sky-400',
    bullets: [
      'Multiple AI specialists work simultaneously on different files',
      'CSS fixes and Liquid changes run in parallel \u2014 2-4x faster for multi-file tasks',
      'Live progress cards show each specialist\u2019s status in real-time',
      'Automatic conflict detection when specialists touch the same file',
      'Structured handoffs let the PM make informed next-step decisions',
    ],
  },
  {
    icon: Brain,
    title: 'Shopify Intelligence',
    tint: 'bg-rose-50 dark:bg-rose-500/5',
    iconAccent: 'text-rose-600 dark:text-rose-400',
    bullets: [
      'Rendering chain tracer \u2014 instantly maps layout \u2192 template \u2192 section \u2192 snippet \u2192 asset',
      'Settings checker \u2014 diagnoses disabled features in settings_data.json in one call',
      'Visibility diagnoser \u2014 checks CSS, Liquid, JS, and settings simultaneously for "not showing" bugs',
      '55 CX patterns detect missing trust badges, cart optimization, and conversion opportunities',
      'Predictive chips suggest next improvements based on what you just changed',
      'Theme health scan runs on project load \u2014 a11y, performance, and CX gaps surfaced automatically',
    ],
  },
  {
    icon: Eye,
    title: 'Always-Streaming Activity',
    tint: 'bg-orange-50 dark:bg-orange-500/5',
    iconAccent: 'text-orange-600 dark:text-orange-400',
    bullets: [
      'See everything the agent does in real-time \u2014 file reads, searches, edits streaming live',
      'Progress bars on every tool call \u2014 no more blank spinners',
      'Schema-aware context \u2014 section schemas summarized to save 60% of tokens',
      'Token budget badge shows remaining capacity before context limits',
      'Auto-verify after every edit \u2014 preview checked for regressions, console errors caught',
      'Confidence badges on code changes \u2014 green, amber, or red based on agent certainty',
    ],
  },
  {
    icon: Users,
    title: 'Skill Marketplace & Feedback',
    tint: 'bg-teal-50 dark:bg-teal-500/5',
    iconAccent: 'text-teal-600 dark:text-teal-400',
    bullets: [
      'Community skill marketplace \u2014 browse, install, and rate Shopify-specific AI skills',
      'Knowledge modules load on-demand \u2014 only relevant expertise injected per request',
      'Thumbs up/down on every response feeds into agent learning',
      'Inline corrections \u2014 tell the agent what it should have done differently',
      'Conversation search, export, and shareable session summaries',
      'Agent memory dashboard \u2014 see what the agent has learned about your project',
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
