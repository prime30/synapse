'use client';

import { motion } from 'framer-motion';
import { Navbar } from '@/components/marketing/nav';
import { Footer } from '@/components/marketing/sections';

const EXAMPLES = [
  {
    category: 'Sections',
    title: 'Hero Section Redesign',
    description: 'Rebuild a Shopify hero with animated headlines',
  },
  {
    category: 'Performance',
    title: 'Product Grid Optimization',
    description: 'Improve collection page performance',
  },
  {
    category: 'Liquid',
    title: 'Custom Liquid Filters',
    description: 'Build reusable template utilities',
  },
  {
    category: 'Schema',
    title: 'Theme Settings Schema',
    description: 'Generate type-safe settings',
  },
  {
    category: 'Components',
    title: 'Responsive Navigation',
    description: 'Multi-level mobile menu',
  },
  {
    category: 'Commerce',
    title: 'Cart Drawer',
    description: 'AJAX cart with upsells',
  },
];

const fadeUp = {
  initial: { opacity: 0, y: 20 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true },
  transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] as const },
};

export default function ExamplesPage() {
  return (
    <div className="relative film-grain bg-stone-50 dark:bg-[oklch(0.145_0_0)] min-h-screen">
      <Navbar />

      <main className="pt-32 pb-24">
        {/* Hero */}
        <motion.div className="max-w-6xl mx-auto px-6 text-center mb-20" {...fadeUp}>
          <span className="inline-block rounded-full border border-stone-200 dark:border-white/10 bg-stone-100 dark:bg-white/5 px-3 py-1 text-[11px] font-medium tracking-widest uppercase text-stone-500 dark:text-white/50 mb-4">
            EXAMPLES
          </span>
          <h1 className="text-5xl md:text-6xl lg:text-7xl font-medium text-stone-900 dark:text-white mb-6 leading-[1.1] tracking-[-0.03em]">
            See Synapse in action.
          </h1>
          <p className="text-stone-500 dark:text-white/50 text-lg max-w-2xl mx-auto">
            Real-world examples showing what you can build with multi-agent AI.
            Each example includes the prompt, agent workflow, and final output.
          </p>
        </motion.div>

        {/* Example Cards — 3x2 grid */}
        <div className="max-w-6xl mx-auto px-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {EXAMPLES.map((example, i) => (
              <motion.a
                key={example.title}
                href="#"
                className="group rounded-2xl border border-stone-200 dark:border-white/10 bg-white dark:bg-white/5 p-8 hover:border-stone-300 dark:hover:border-white/20 hover:shadow-lg hover:shadow-stone-200/50 dark:hover:shadow-none hover:-translate-y-1 transition-all duration-300"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: 0.06 * i }}
              >
                {/* Category chip */}
                <span className="inline-block rounded-full border border-stone-200 dark:border-white/10 bg-stone-100 dark:bg-white/5 px-2.5 py-0.5 text-[10px] font-medium tracking-widest uppercase text-stone-500 dark:text-white/50 mb-5">
                  {example.category}
                </span>

                <h3 className="text-lg font-medium text-stone-900 dark:text-white mb-2 group-hover:text-accent transition-colors">
                  {example.title}
                </h3>
                <p className="text-stone-500 dark:text-white/50 text-sm leading-relaxed mb-6">
                  {example.description}
                </p>

                {/* View link */}
                <span className="inline-flex items-center gap-1.5 text-sm font-medium text-stone-400 dark:text-white/30 group-hover:text-accent transition-colors">
                  View example
                  <svg
                    className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform"
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
                </span>
              </motion.a>
            ))}
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
