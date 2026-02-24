'use client';

import { motion } from 'framer-motion';
import { Navbar } from '@/components/marketing/nav';
import { Footer } from '@/components/marketing/sections';

interface ChangelogEntry {
  version: string;
  date: string;
  title: string;
  changes: string[];
  latest?: boolean;
}

const ENTRIES: ChangelogEntry[] = [
  {
    version: 'v0.4.0',
    date: 'February 2026',
    title: 'Multi-agent orchestration, PM agent delegation',
    latest: true,
    changes: [
      'PM agent that analyzes requests and creates execution plans',
      'Parallel task execution across Liquid, JS, and CSS specialist agents',
      'Dependency resolution ensures agents execute in the right order',
      'Review agent validates all changes before applying',
      'Real-time progress dashboard for multi-agent tasks',
    ],
  },
  {
    version: 'v0.3.0',
    date: 'January 2026',
    title: 'Shopify sync, theme push/pull, OAuth flow',
    changes: [
      'Two-way theme sync between workspace and Shopify store',
      'Webhook-driven updates for real-time change detection',
      'Secure OAuth token management with automatic refresh',
      'Multi-theme support per store connection',
      'Push queue with retry logic and conflict resolution',
    ],
  },
  {
    version: 'v0.2.0',
    date: 'December 2025',
    title: 'Liquid validation engine, 40+ globals',
    changes: [
      '40+ Shopify global objects fully supported in validation',
      'Scope tracking across nested blocks, loops, and snippets',
      'Type inference for variable assignments and filter chains',
      'Deprecated filter detection with automated migration hints',
      'Real-time diagnostics with inline error highlighting',
    ],
  },
  {
    version: 'v0.1.0',
    date: 'November 2025',
    title: 'Initial release, basic IDE, AI suggestions',
    changes: [
      'Core IDE with Shopify-aware file explorer and editor',
      'Basic AI code suggestions for Liquid templates',
      'Project management with create, rename, and delete',
      'Light and dark mode support',
      'Keyboard shortcuts and command palette',
    ],
  },
];

const fadeUp = {
  initial: { opacity: 0, y: 20 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true },
  transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] as const },
};

export default function ChangelogPage() {
  return (
    <div className="relative film-grain bg-stone-50 dark:bg-[oklch(0.145_0_0)] min-h-screen">
      <Navbar />

      <main className="pt-32 pb-24">
        {/* Hero */}
        <motion.div className="max-w-7xl mx-auto px-6 text-center mb-20" {...fadeUp}>
          <span className="inline-block rounded-full border border-stone-200 dark:border-white/10 bg-stone-100 dark:bg-white/5 px-3 py-1 text-[11px] font-medium tracking-widest uppercase text-stone-500 dark:text-white/50 mb-4">
            CHANGELOG
          </span>
          <h1 className="text-5xl md:text-6xl lg:text-7xl font-medium text-stone-900 dark:text-white tracking-[-0.03em] mb-6 leading-[1.1]">
            What&apos;s new in Synapse.
          </h1>
          <p className="text-stone-500 dark:text-white/50 text-lg max-w-xl mx-auto leading-relaxed">
            Every improvement, feature, and fix — documented as we ship.
          </p>
        </motion.div>

        {/* Timeline */}
        <div className="max-w-3xl mx-auto px-6">
          <div className="space-y-12">
            {ENTRIES.map((entry, i) => (
              <motion.div
                key={entry.version}
                {...fadeUp}
                transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] as const, delay: i * 0.1 }}
                className={`relative border-l-2 pl-8 ${
                  entry.latest
                    ? 'border-accent'
                    : 'border-stone-200 dark:border-white/10'
                }`}
              >
                {/* Version badge + date */}
                <div className="flex flex-wrap items-center gap-3 mb-3">
                  <span
                    className={`inline-block rounded-full px-3 py-0.5 text-xs font-semibold tracking-wide ${
                      entry.latest
                        ? 'bg-accent text-white'
                        : 'bg-stone-900 dark:bg-white text-white dark:text-stone-900'
                    }`}
                  >
                    {entry.version}
                  </span>
                  <span className="text-sm text-stone-400 dark:text-white/40">
                    {entry.date}
                  </span>
                </div>

                {/* Content card */}
                <div className="rounded-2xl border border-stone-200 dark:border-white/10 bg-white dark:bg-white/5 p-6 md:p-8">
                  <h3 className="text-xl font-medium text-stone-900 dark:text-white mb-4">
                    {entry.title}
                  </h3>
                  <ul className="space-y-2.5">
                    {entry.changes.map((change) => (
                      <li key={change} className="flex items-start gap-3 text-sm">
                        <span className="text-accent mt-0.5 flex-shrink-0">&#10003;</span>
                        <span className="text-stone-600 dark:text-white/60">{change}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
