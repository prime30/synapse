'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { Navbar } from '@/components/marketing/nav';
import { Footer } from '@/components/marketing/sections';

const FEATURED_POST = {
  title: 'Introducing Multi-Agent Orchestration',
  excerpt:
    'How five specialized AI agents collaborate to build production-ready Shopify themes — from planning to review, in a single workflow.',
  date: 'February 2026',
  tag: 'Engineering',
  href: '#',
};

const POSTS = [
  {
    title: 'How Liquid Validation Works Under the Hood',
    excerpt:
      'A deep dive into our real-time Liquid validation engine — from tokenization to scope tracking and type inference.',
    date: 'January 2026',
    tag: 'Engineering',
    href: '#',
  },
  {
    title: 'Ship Themes 10x Faster: A Case Study',
    excerpt:
      'How one agency used Synapse to cut their Shopify theme development cycle from weeks to days.',
    date: 'January 2026',
    tag: 'Product',
    href: '#',
  },
  {
    title: 'Getting Started with MCP Tools',
    excerpt:
      'A step-by-step tutorial for connecting your IDE to Synapse using the Model Context Protocol.',
    date: 'December 2025',
    tag: 'Tutorial',
    href: '#',
  },
  {
    title: 'Synapse Public Beta is Here',
    excerpt:
      'After months of private testing, Synapse is now available to everyone. Here\'s what\'s included and what\'s next.',
    date: 'November 2025',
    tag: 'Announcement',
    href: '#',
  },
];

function TagChip({ tag }: { tag: string }) {
  return (
    <span className="inline-block rounded-full border border-stone-200 dark:border-white/10 bg-stone-100 dark:bg-white/5 px-2.5 py-0.5 text-[10px] font-medium tracking-wider uppercase text-stone-500 dark:text-white/50">
      {tag}
    </span>
  );
}

const fadeUp = {
  initial: { opacity: 0, y: 20 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true },
  transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] as const },
};

export default function BlogPage() {
  return (
    <div className="relative film-grain bg-stone-50 dark:bg-[#0a0a0a] min-h-screen">
      <Navbar />

      <main className="pt-32 pb-24">
        {/* Hero */}
        <motion.div className="max-w-6xl mx-auto px-6 text-center mb-16" {...fadeUp}>
          <span className="inline-block rounded-full border border-stone-200 dark:border-white/10 bg-stone-100 dark:bg-white/5 px-3 py-1 text-[11px] font-medium tracking-widest uppercase text-stone-500 dark:text-white/50 mb-4">
            BLOG
          </span>
          <h1 className="text-5xl md:text-6xl lg:text-7xl font-medium text-stone-900 dark:text-white mb-6 leading-[1.1] tracking-[-0.03em]">
            Insights &amp; updates.
          </h1>
          <p className="text-stone-500 dark:text-white/50 text-lg max-w-xl mx-auto">
            Engineering deep-dives, product updates, and thoughts on the future of
            AI-powered development.
          </p>
        </motion.div>

        {/* Featured Post */}
        <motion.div className="max-w-6xl mx-auto px-6 mb-12" {...fadeUp}>
          <Link href={FEATURED_POST.href} className="block group">
            <div className="rounded-2xl border border-stone-200 dark:border-white/10 bg-white dark:bg-white/5 p-8 md:p-12 transition-shadow hover:shadow-lg">
              <div className="flex items-center gap-3 mb-4">
                <TagChip tag={FEATURED_POST.tag} />
                <span className="text-stone-400 dark:text-white/30 text-xs">
                  {FEATURED_POST.date}
                </span>
              </div>
              <h2 className="text-3xl md:text-4xl font-medium text-stone-900 dark:text-white tracking-[-0.02em] mb-3 group-hover:text-accent transition-colors">
                {FEATURED_POST.title}
              </h2>
              <p className="text-stone-500 dark:text-white/50 text-lg max-w-2xl">
                {FEATURED_POST.excerpt}
              </p>
              <span className="inline-block mt-6 text-accent text-sm font-medium">
                Read more &rarr;
              </span>
            </div>
          </Link>
        </motion.div>

        {/* Post Grid */}
        <div className="max-w-6xl mx-auto px-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {POSTS.map((post) => (
              <motion.div
                key={post.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5 }}
              >
                <Link href={post.href} className="block group h-full">
                  <div className="rounded-2xl border border-stone-200 dark:border-white/10 bg-white dark:bg-white/5 p-6 md:p-8 h-full flex flex-col transition-shadow hover:shadow-lg">
                    <div className="flex items-center gap-3 mb-3">
                      <TagChip tag={post.tag} />
                      <span className="text-stone-400 dark:text-white/30 text-xs">
                        {post.date}
                      </span>
                    </div>
                    <h3 className="text-xl font-medium text-stone-900 dark:text-white mb-2 group-hover:text-accent transition-colors">
                      {post.title}
                    </h3>
                    <p className="text-stone-500 dark:text-white/50 text-sm leading-relaxed line-clamp-2 flex-1">
                      {post.excerpt}
                    </p>
                    <span className="inline-block mt-4 text-accent text-sm font-medium">
                      Read more &rarr;
                    </span>
                  </div>
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
