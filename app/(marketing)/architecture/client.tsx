'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { Navbar } from '@/components/marketing/nav';
import { Footer } from '@/components/marketing/sections';
import { DocRenderer } from '@/components/marketing/docs/DocRenderer';
import { AdminPanel } from '@/components/admin/AdminPanel';

const fadeUp = {
  initial: { opacity: 0, y: 20 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true },
  transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] as const },
};

const RELATED_LINKS = [
  {
    title: 'Getting Started',
    description: 'Set up your workspace in minutes',
    href: '/docs/getting-started',
  },
  {
    title: 'API Reference',
    description: 'MCP tools, endpoints, and schemas',
    href: '/docs/api-reference',
  },
  {
    title: 'All Documentation',
    description: 'Browse guides, tutorials, and more',
    href: '/docs',
  },
];

interface ArchitecturePageClientProps {
  content: string;
}

export function ArchitecturePageClient({ content }: ArchitecturePageClientProps) {
  return (
    <div className="relative film-grain bg-stone-50 dark:bg-[#0a0a0a] min-h-screen">
      <Navbar />

      <main className="pt-32 pb-24">
        {/* Hero header */}
        <motion.div className="max-w-4xl mx-auto px-6 mb-16" {...fadeUp}>
          <div className="flex items-center gap-2 mb-4">
            <span className="inline-block rounded-full border border-stone-200 dark:border-white/10 bg-stone-100 dark:bg-white/5 px-3 py-1 text-[11px] font-medium tracking-widest uppercase text-stone-500 dark:text-white/50">
              DOCUMENTATION
            </span>
            <span className="inline-flex items-center rounded-full bg-amber-100 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 px-2.5 py-1 text-[10px] font-semibold tracking-wider uppercase text-amber-700 dark:text-amber-400">
              Admin Only
            </span>
          </div>
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-medium text-stone-900 dark:text-white mb-6 leading-[1.1] tracking-[-0.03em]">
            AI Architecture
          </h1>
          <p className="text-stone-500 dark:text-white/50 text-lg max-w-2xl">
            How the multi-agent system works end-to-end &mdash; from user input
            to rendered response.
          </p>
        </motion.div>

        {/* Admin management panel */}
        <AdminPanel />

        {/* Markdown content */}
        <motion.div
          className="max-w-4xl mx-auto px-6"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          <DocRenderer content={content} />
        </motion.div>

        {/* Related links footer */}
        <motion.div
          className="max-w-4xl mx-auto px-6 mt-20"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          <h2 className="text-xl font-semibold text-stone-900 dark:text-white mb-6">
            Continue reading
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {RELATED_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="group rounded-xl border border-stone-200 dark:border-white/10 bg-white dark:bg-white/5 p-5 hover:border-stone-300 dark:hover:border-white/20 hover:shadow-lg hover:shadow-stone-200/50 dark:hover:shadow-none transition-all"
              >
                <h3 className="text-sm font-medium text-stone-900 dark:text-white mb-1 group-hover:text-accent transition-colors">
                  {link.title}
                </h3>
                <p className="text-xs text-stone-500 dark:text-white/50">
                  {link.description}
                </p>
              </Link>
            ))}
          </div>
        </motion.div>
      </main>

      <Footer />
    </div>
  );
}
