'use client';

import { motion } from 'framer-motion';
import { Navbar } from '@/components/marketing/nav';
import { Footer } from '@/components/marketing/sections';

interface RoadmapItem {
  title: string;
  description: string;
}

interface RoadmapColumn {
  label: string;
  status: 'shipped' | 'in-progress' | 'planned';
  items: RoadmapItem[];
}

const COLUMNS: RoadmapColumn[] = [
  {
    label: 'Shipped',
    status: 'shipped',
    items: [
      {
        title: 'Multi-Agent System',
        description:
          'PM agent orchestrates Liquid, JS, CSS specialists with parallel execution and dependency resolution.',
      },
      {
        title: 'Liquid Validator',
        description:
          '40+ Shopify globals, scope tracking, type inference, and deprecated filter detection.',
      },
      {
        title: 'Shopify Sync',
        description:
          'Two-way theme sync with webhook-driven updates, conflict resolution, and multi-theme support.',
      },
      {
        title: 'MCP Tools',
        description:
          'Six Model Context Protocol tools connecting your IDE directly to Synapse for full project context.',
      },
    ],
  },
  {
    label: 'In Progress',
    status: 'in-progress',
    items: [
      {
        title: 'Team Collaboration',
        description:
          'Real-time collaborative editing, shared projects, role-based permissions, and team dashboards.',
      },
      {
        title: 'Custom Agent Templates',
        description:
          'Create and share custom AI agent configurations tailored to your store\'s coding standards.',
      },
      {
        title: 'Theme Marketplace',
        description:
          'Publish, discover, and install community themes — with version management and one-click deploy.',
      },
    ],
  },
  {
    label: 'Planned',
    status: 'planned',
    items: [
      {
        title: 'Visual Theme Builder',
        description:
          'Drag-and-drop section editor with live preview, no code required for layout changes.',
      },
      {
        title: 'Performance Analytics',
        description:
          'Theme performance metrics, Lighthouse integration, and Core Web Vitals monitoring.',
      },
      {
        title: 'CI/CD Pipeline',
        description:
          'Automated theme deployment with branch-based workflows, staging environments, and rollback support.',
      },
      {
        title: 'Mobile Preview',
        description:
          'Real-time responsive preview across device sizes with touch interaction simulation.',
      },
    ],
  },
];

const STATUS_STYLES: Record<
  RoadmapColumn['status'],
  { dot: string; badge: string; card: string }
> = {
  shipped: {
    dot: 'bg-emerald-500',
    badge:
      'border-emerald-200 dark:border-emerald-500/20 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
    card: 'border-emerald-200/60 dark:border-emerald-500/10',
  },
  'in-progress': {
    dot: 'bg-amber-500',
    badge:
      'border-amber-200 dark:border-amber-500/20 bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400',
    card: 'border-amber-200/60 dark:border-amber-500/10',
  },
  planned: {
    dot: 'bg-stone-400 dark:bg-white/30',
    badge:
      'border-stone-200 dark:border-white/10 bg-stone-100 dark:bg-white/5 text-stone-500 dark:text-white/50',
    card: 'border-stone-200 dark:border-white/10',
  },
};

const fadeUp = {
  initial: { opacity: 0, y: 20 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true },
  transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] as const },
};

export default function RoadmapPage() {
  return (
    <div className="relative film-grain bg-stone-50 dark:bg-[oklch(0.145_0_0)] min-h-screen">
      <Navbar />

      <main className="pt-32 pb-24">
        {/* Hero */}
        <motion.div className="max-w-7xl mx-auto px-6 text-center mb-20" {...fadeUp}>
          <span className="inline-block rounded-full border border-stone-200 dark:border-white/10 bg-stone-100 dark:bg-white/5 px-3 py-1 text-[11px] font-medium tracking-widest uppercase text-stone-500 dark:text-white/50 mb-4">
            ROADMAP
          </span>
          <h1 className="text-5xl md:text-6xl font-medium text-stone-900 dark:text-white tracking-[-0.03em] mb-6 leading-[1.1]">
            Where we&apos;re headed.
          </h1>
          <p className="text-stone-500 dark:text-white/50 text-lg max-w-xl mx-auto leading-relaxed">
            A transparent look at what we&apos;ve shipped, what we&apos;re building, and what&apos;s coming next.
          </p>
        </motion.div>

        {/* Three-column grid */}
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {COLUMNS.map((column, colIdx) => {
              const styles = STATUS_STYLES[column.status];
              return (
                <motion.div
                  key={column.label}
                  {...fadeUp}
                  transition={{
                    duration: 0.6,
                    ease: [0.22, 1, 0.36, 1] as const,
                    delay: colIdx * 0.15,
                  }}
                >
                  {/* Column header */}
                  <div className="flex items-center gap-2.5 mb-6">
                    <span className={`w-2.5 h-2.5 rounded-full ${styles.dot}`} />
                    <span
                      className={`inline-block rounded-full border px-3 py-0.5 text-xs font-semibold tracking-wide ${styles.badge}`}
                    >
                      {column.label}
                    </span>
                  </div>

                  {/* Cards */}
                  <div className="space-y-4">
                    {column.items.map((item, itemIdx) => (
                      <motion.div
                        key={item.title}
                        initial={{ opacity: 0, y: 12 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{
                          duration: 0.5,
                          ease: [0.22, 1, 0.36, 1] as const,
                          delay: colIdx * 0.15 + itemIdx * 0.08,
                        }}
                        className={`rounded-2xl border bg-white dark:bg-white/5 p-6 ${styles.card}`}
                      >
                        <h3 className="text-base font-medium text-stone-900 dark:text-white mb-2">
                          {item.title}
                        </h3>
                        <p className="text-sm text-stone-500 dark:text-white/50 leading-relaxed">
                          {item.description}
                        </p>
                      </motion.div>
                    ))}
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>

        {/* Bottom note */}
        <motion.div className="max-w-7xl mx-auto px-6 mt-20 text-center" {...fadeUp}>
          <div className="rounded-2xl border border-stone-200 dark:border-white/10 bg-white dark:bg-white/5 p-8 md:p-12">
            <p className="text-stone-500 dark:text-white/50 text-base">
              Have a feature request? Let us know at{' '}
              <a
                href="mailto:hello@synapse.shop"
                className="text-accent underline underline-offset-4 hover:text-accent/80 transition-colors"
              >
                hello@synapse.shop
              </a>
            </p>
          </div>
        </motion.div>
      </main>

      <Footer />
    </div>
  );
}
