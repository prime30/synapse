'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { Navbar } from '@/components/marketing/nav';
import { Footer } from '@/components/marketing/sections';

const FEATURES = [
  {
    badge: 'ORCHESTRATION',
    title: 'Multi-Agent Orchestration',
    description:
      'A PM agent breaks down your request and delegates to specialized Liquid, JavaScript, and CSS agents — then a review agent validates everything before applying changes.',
    details: [
      'PM agent analyzes intent and creates execution plans',
      'Specialist agents for Liquid, JS, CSS, and accessibility',
      'Review agent validates output before committing',
      'Parallel task execution with dependency resolution',
      'Real-time progress tracking across all agents',
    ],
    icon: (
      <svg className="w-8 h-8" fill="none" viewBox="0 0 32 32" stroke="currentColor" strokeWidth={1.5}>
        <circle cx="16" cy="8" r="4" />
        <circle cx="8" cy="24" r="4" />
        <circle cx="24" cy="24" r="4" />
        <path d="M16 12v4m-4 2.5L10 22m8-3.5L22 22" />
      </svg>
    ),
  },
  {
    badge: 'VALIDATION',
    title: 'Liquid Validation Engine',
    description:
      'Catch errors before they hit production. Our validation engine understands Shopify\'s Liquid dialect deeply — from globals and filters to scope and type inference.',
    details: [
      '40+ Shopify global objects fully supported',
      'Deprecated filter detection with migration hints',
      'Scope tracking across nested blocks and snippets',
      'Type inference for variables and assignments',
      'Real-time diagnostics as you type',
    ],
    icon: (
      <svg className="w-8 h-8" fill="none" viewBox="0 0 32 32" stroke="currentColor" strokeWidth={1.5}>
        <path d="M9 17l3 3 7-7" />
        <rect x="4" y="4" width="24" height="24" rx="4" />
      </svg>
    ),
  },
  {
    badge: 'SYNC',
    title: 'Shopify Sync',
    description:
      'Two-way sync keeps your local workspace and Shopify store perfectly aligned. Push, pull, and manage themes without leaving the IDE.',
    details: [
      'Two-way sync between workspace and Shopify store',
      'Automatic conflict detection and resolution',
      'Manage multiple themes per store',
      'Webhook-driven real-time updates',
      'Secure OAuth token management',
    ],
    icon: (
      <svg className="w-8 h-8" fill="none" viewBox="0 0 32 32" stroke="currentColor" strokeWidth={1.5}>
        <path d="M8 16h16M20 10l6 6-6 6M12 10l-6 6 6 6" />
      </svg>
    ),
  },
  {
    badge: 'TOOLS',
    title: 'MCP Tools',
    description:
      'Six Model Context Protocol tools connect your IDE directly to Synapse, giving AI assistants full context about your Shopify project.',
    details: [
      'Theme file read/write via MCP',
      'Liquid validation tool for inline checks',
      'Asset management and optimization',
      'Store configuration access',
      'Schema editing with validation',
      'Preview URL generation',
    ],
    icon: (
      <svg className="w-8 h-8" fill="none" viewBox="0 0 32 32" stroke="currentColor" strokeWidth={1.5}>
        <path d="M12 4v8l-4 4h16l-4-4V4" />
        <rect x="6" y="16" width="20" height="12" rx="2" />
        <circle cx="12" cy="22" r="1.5" fill="currentColor" />
        <circle cx="20" cy="22" r="1.5" fill="currentColor" />
      </svg>
    ),
  },
  {
    badge: 'HISTORY',
    title: 'Version History',
    description:
      'Full undo/redo with version comparison. See exactly what changed, when, and why — with the ability to restore any previous state instantly.',
    details: [
      'Full undo/redo across all files',
      'Conflict detection on concurrent edits',
      'Side-by-side version comparison',
      'Timestamped change log per file',
      'One-click restore to any version',
    ],
    icon: (
      <svg className="w-8 h-8" fill="none" viewBox="0 0 32 32" stroke="currentColor" strokeWidth={1.5}>
        <path d="M8 6v6H2" />
        <path d="M4.93 20A12 12 0 1 1 2 12" />
        <path d="M16 10v6l4 2" />
      </svg>
    ),
  },
  {
    badge: 'AI',
    title: 'AI Suggestions',
    description:
      'Context-aware code suggestions powered by your project structure, Shopify schema, and Liquid best practices — with inline diff preview before applying.',
    details: [
      'Context-aware completions using project structure',
      'Inline diff preview before applying changes',
      'Shopify schema-aware suggestions',
      'Liquid best-practice recommendations',
      'Natural language to Liquid code generation',
    ],
    icon: (
      <svg className="w-8 h-8" fill="none" viewBox="0 0 32 32" stroke="currentColor" strokeWidth={1.5}>
        <path d="M16 4l3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z" />
      </svg>
    ),
  },
];

const fadeUp = {
  initial: { opacity: 0, y: 20 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true },
  transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] as const },
};

export default function FeaturesPage() {
  return (
    <div className="relative film-grain bg-stone-50 dark:bg-[#0a0a0a] min-h-screen">
      <Navbar />

      <main className="pt-32 pb-24">
        {/* Hero */}
        <motion.div className="max-w-7xl mx-auto px-6 text-center mb-24" {...fadeUp}>
          <span className="inline-block rounded-full border border-stone-200 dark:border-white/10 bg-stone-100 dark:bg-white/5 px-3 py-1 text-[11px] font-medium tracking-widest uppercase text-stone-500 dark:text-white/50 mb-4">
            FEATURES
          </span>
          <h1 className="text-5xl md:text-6xl lg:text-7xl font-medium text-stone-900 dark:text-white tracking-[-0.03em] mb-6 leading-[1.1]">
            Everything you need to
            <br />
            ship Shopify themes.
          </h1>
          <p className="text-stone-500 dark:text-white/50 text-lg max-w-2xl mx-auto leading-relaxed">
            From multi-agent orchestration to real-time Shopify sync, Synapse gives you a
            complete toolkit for building, validating, and deploying themes at speed.
          </p>
        </motion.div>

        {/* Feature Sections */}
        <div className="max-w-7xl mx-auto px-6 space-y-20">
          {FEATURES.map((feature, i) => (
            <motion.div
              key={feature.title}
              {...fadeUp}
              transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] as const, delay: 0.1 }}
              className={`flex flex-col ${
                i % 2 === 0 ? 'lg:flex-row' : 'lg:flex-row-reverse'
              } gap-10 lg:gap-16 items-center`}
            >
              {/* Text */}
              <div className="flex-1 min-w-0">
                <span className="inline-block rounded-full border border-stone-200 dark:border-white/10 bg-stone-100 dark:bg-white/5 px-3 py-1 text-[11px] font-medium tracking-widest uppercase text-stone-500 dark:text-white/50 mb-4">
                  {feature.badge}
                </span>
                <h2 className="text-3xl md:text-4xl font-medium text-stone-900 dark:text-white tracking-[-0.02em] mb-4">
                  {feature.title}
                </h2>
                <p className="text-stone-500 dark:text-white/50 text-base leading-relaxed mb-6">
                  {feature.description}
                </p>
                <ul className="space-y-3">
                  {feature.details.map((detail) => (
                    <li key={detail} className="flex items-start gap-3 text-sm">
                      <span className="text-accent mt-0.5 flex-shrink-0">&#10003;</span>
                      <span className="text-stone-600 dark:text-white/60">{detail}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Card Visual */}
              <div className="flex-1 min-w-0 w-full">
                <div className="rounded-2xl border border-stone-200 dark:border-white/10 bg-white dark:bg-white/5 p-8 md:p-12 flex items-center justify-center aspect-[4/3]">
                  <div className="text-stone-300 dark:text-white/20">
                    {feature.icon}
                    <p className="mt-4 text-xs text-stone-400 dark:text-white/30 tracking-wide uppercase">
                      {feature.title}
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* CTA Section */}
        <motion.div className="max-w-7xl mx-auto px-6 mt-32 text-center" {...fadeUp}>
          <div className="rounded-2xl border border-stone-200 dark:border-white/10 bg-white dark:bg-white/5 p-12 md:p-20">
            <h2 className="text-4xl md:text-5xl font-medium text-stone-900 dark:text-white tracking-[-0.03em] mb-4">
              Ready to ship faster?
            </h2>
            <p className="text-stone-500 dark:text-white/50 text-lg mb-8 max-w-lg mx-auto">
              Join developers who are building Shopify themes with the power of multi-agent AI.
            </p>
            <Link
              href="/signup"
              className="inline-flex items-center gap-2 rounded-full bg-stone-900 dark:bg-white text-white dark:text-stone-900 px-8 py-3.5 text-sm font-semibold tracking-wide hover:bg-stone-800 dark:hover:bg-white/90 transition-colors"
            >
              Get started free
              <span aria-hidden="true">&rarr;</span>
            </Link>
          </div>
        </motion.div>
      </main>

      <Footer />
    </div>
  );
}
