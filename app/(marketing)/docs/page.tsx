'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { Navbar } from '@/components/marketing/nav';
import { Footer } from '@/components/marketing/sections';
import { useIsAdmin } from '@/hooks/useIsAdmin';

const PUBLIC_CATEGORIES = [
  {
    icon: '🚀',
    title: 'Getting Started',
    description: 'Set up your workspace in minutes',
    href: '/docs/getting-started',
  },
  {
    icon: '⚡',
    title: 'API Reference',
    description: 'MCP tools, endpoints, and schemas',
    href: '/docs/api-reference',
  },
  {
    icon: '📖',
    title: 'Guides',
    description: 'Step-by-step tutorials for common workflows',
    href: '#',
  },
  {
    icon: '🔌',
    title: 'Integrations',
    description: 'Connect Shopify, IDE plugins, and more',
    href: '#',
  },
];

const ADMIN_CATEGORIES = [
  {
    icon: '🧠',
    title: 'Architecture',
    description: 'Deep dive into the multi-agent AI system',
    href: '/architecture',
    adminOnly: true,
  },
];

const fadeUp = {
  initial: { opacity: 0, y: 20 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true },
  transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] as const },
};

export default function DocsPage() {
  const { isAdmin } = useIsAdmin();
  const CATEGORIES = isAdmin
    ? [...PUBLIC_CATEGORIES, ...ADMIN_CATEGORIES]
    : PUBLIC_CATEGORIES;

  return (
    <div className="relative film-grain bg-stone-50 dark:bg-[#0a0a0a] min-h-screen">
      <Navbar />

      <main className="pt-32 pb-24">
        {/* Hero */}
        <motion.div className="max-w-6xl mx-auto px-6 text-center mb-20" {...fadeUp}>
          <span className="inline-block rounded-full border border-stone-200 dark:border-white/10 bg-stone-100 dark:bg-white/5 px-3 py-1 text-[11px] font-medium tracking-widest uppercase text-stone-500 dark:text-white/50 mb-4">
            DOCUMENTATION
          </span>
          <h1 className="text-5xl md:text-6xl lg:text-7xl font-medium text-stone-900 dark:text-white mb-6 leading-[1.1] tracking-[-0.03em]">
            Learn Synapse.
          </h1>
          <p className="text-stone-500 dark:text-white/50 text-lg max-w-2xl mx-auto">
            Comprehensive guides, API references, and tutorials to help you ship
            Shopify themes faster with multi-agent AI.
          </p>
        </motion.div>

        {/* Category Cards */}
        <div className="max-w-6xl mx-auto px-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {CATEGORIES.map((cat, i) => (
              <motion.div
                key={cat.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: 0.08 * i }}
              >
                <Link
                  href={cat.href}
                  className="group flex items-start justify-between rounded-2xl border border-stone-200 dark:border-white/10 bg-white dark:bg-white/5 p-8 hover:border-stone-300 dark:hover:border-white/20 hover:shadow-lg hover:shadow-stone-200/50 dark:hover:shadow-none transition-all"
                >
                  <div className="flex-1 min-w-0">
                    <span className="text-3xl mb-4 block" aria-hidden="true">
                      {cat.icon}
                    </span>
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="text-xl font-medium text-stone-900 dark:text-white">
                        {cat.title}
                      </h3>
                      {'adminOnly' in cat && cat.adminOnly && (
                        <span className="inline-flex items-center rounded-full bg-amber-100 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 px-2 py-0.5 text-[10px] font-semibold tracking-wider uppercase text-amber-700 dark:text-amber-400">
                          Admin
                        </span>
                      )}
                    </div>
                    <p className="text-stone-500 dark:text-white/50 text-sm leading-relaxed">
                      {cat.description}
                    </p>
                  </div>

                  {/* Arrow indicator */}
                  <svg
                    className="w-5 h-5 text-stone-300 dark:text-white/20 group-hover:text-accent group-hover:translate-x-1 transition-all flex-shrink-0 mt-1 ml-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3"
                    />
                  </svg>
                </Link>
              </motion.div>
            ))}
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
