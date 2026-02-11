'use client';

import { motion } from 'framer-motion';
import { Navbar } from '@/components/marketing/nav';
import { Footer } from '@/components/marketing/sections';

const PERKS = [
  {
    title: 'Remote-first',
    description: 'Work from anywhere in the world. We believe great work happens where you\'re most comfortable.',
    icon: (
      <svg className="w-6 h-6 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5a17.92 17.92 0 01-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />
      </svg>
    ),
  },
  {
    title: 'Competitive equity',
    description: 'Meaningful ownership in what we\'re building. Everyone shares in our success.',
    icon: (
      <svg className="w-6 h-6 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
      </svg>
    ),
  },
  {
    title: 'Learning budget',
    description: 'Annual stipend for conferences, courses, books, and tools to keep growing.',
    icon: (
      <svg className="w-6 h-6 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.57 50.57 0 00-2.658-.813A59.905 59.905 0 0112 3.493a59.902 59.902 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.697 50.697 0 0112 13.489a50.702 50.702 0 017.74-3.342M6.75 15a.75.75 0 100-1.5.75.75 0 000 1.5zm0 0v-3.675A55.378 55.378 0 0112 8.443m-7.007 11.55A5.981 5.981 0 006.75 15.75v-1.5" />
      </svg>
    ),
  },
  {
    title: 'Flexible hours',
    description: 'We care about output, not hours logged. Structure your day however works best for you.',
    icon: (
      <svg className="w-6 h-6 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
];

const POSITIONS = [
  {
    title: 'Senior Frontend Engineer',
    department: 'Engineering',
    location: 'Remote',
    type: 'Full-time',
  },
  {
    title: 'AI/ML Engineer',
    department: 'Engineering',
    location: 'Remote',
    type: 'Full-time',
  },
  {
    title: 'Developer Advocate',
    department: 'Marketing',
    location: 'Remote',
    type: 'Full-time',
  },
  {
    title: 'Product Designer',
    department: 'Design',
    location: 'Remote',
    type: 'Full-time',
  },
];

const fadeUp = {
  initial: { opacity: 0, y: 20 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true },
  transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] as const },
};

export default function CareersPage() {
  return (
    <div className="relative film-grain bg-stone-50 dark:bg-[#0a0a0a] min-h-screen">
      <Navbar />

      <main className="pt-32 pb-24">
        {/* Hero */}
        <motion.div className="max-w-6xl mx-auto px-6 text-center mb-24" {...fadeUp}>
          <span className="inline-block rounded-full border border-stone-200 dark:border-white/10 bg-stone-100 dark:bg-white/5 px-3 py-1 text-[11px] font-medium tracking-widest uppercase text-stone-500 dark:text-white/50 mb-4">
            CAREERS
          </span>
          <h1 className="text-5xl md:text-6xl lg:text-7xl font-medium text-stone-900 dark:text-white mb-6 leading-[1.1] tracking-[-0.03em]">
            Help us reshape
            <br />
            Shopify development.
          </h1>
          <p className="text-stone-500 dark:text-white/50 text-lg max-w-2xl mx-auto">
            We&apos;re a small, ambitious team building the future of AI-powered theme
            development. We move fast, ship often, and believe the best ideas win — regardless
            of where they come from.
          </p>
        </motion.div>

        {/* Perks */}
        <motion.div className="max-w-6xl mx-auto px-6 mb-24" {...fadeUp}>
          <div className="text-center mb-12">
            <span className="inline-block rounded-full border border-stone-200 dark:border-white/10 bg-stone-100 dark:bg-white/5 px-3 py-1 text-[11px] font-medium tracking-widest uppercase text-stone-500 dark:text-white/50 mb-4">
              PERKS
            </span>
            <h2 className="text-3xl md:text-4xl font-semibold text-stone-900 dark:text-white tracking-[-0.02em]">
              Why you&apos;ll love it here
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {PERKS.map((perk) => (
              <motion.div
                key={perk.title}
                className="rounded-2xl border border-stone-200 dark:border-white/10 bg-white dark:bg-white/5 p-8"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5 }}
              >
                <div className="mb-4">{perk.icon}</div>
                <h3 className="text-lg font-medium text-stone-900 dark:text-white mb-2">
                  {perk.title}
                </h3>
                <p className="text-stone-500 dark:text-white/50 text-sm leading-relaxed">
                  {perk.description}
                </p>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Open Positions */}
        <motion.div className="max-w-6xl mx-auto px-6 mb-24" {...fadeUp}>
          <div className="text-center mb-12">
            <span className="inline-block rounded-full border border-stone-200 dark:border-white/10 bg-stone-100 dark:bg-white/5 px-3 py-1 text-[11px] font-medium tracking-widest uppercase text-stone-500 dark:text-white/50 mb-4">
              OPEN ROLES
            </span>
            <h2 className="text-3xl md:text-4xl font-semibold text-stone-900 dark:text-white tracking-[-0.02em]">
              Open positions
            </h2>
          </div>

          <div className="space-y-4">
            {POSITIONS.map((position) => (
              <motion.a
                key={position.title}
                href="#"
                className="block rounded-2xl border border-stone-200 dark:border-white/10 bg-white dark:bg-white/5 p-6 md:p-8 group hover:shadow-lg transition-shadow"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5 }}
              >
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                  <div>
                    <h3 className="text-xl font-medium text-stone-900 dark:text-white mb-2 group-hover:text-accent transition-colors">
                      {position.title}
                    </h3>
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="inline-block rounded-full border border-stone-200 dark:border-white/10 bg-stone-100 dark:bg-white/5 px-2.5 py-0.5 text-[10px] font-medium tracking-wider uppercase text-stone-500 dark:text-white/50">
                        {position.department}
                      </span>
                      <span className="text-stone-400 dark:text-white/30 text-sm">
                        {position.location}
                      </span>
                      <span className="text-stone-400 dark:text-white/30 text-sm">
                        {position.type}
                      </span>
                    </div>
                  </div>
                  <span className="text-accent text-sm font-medium whitespace-nowrap">
                    Apply &rarr;
                  </span>
                </div>
              </motion.a>
            ))}
          </div>
        </motion.div>

        {/* Bottom CTA */}
        <motion.div className="max-w-6xl mx-auto px-6 text-center" {...fadeUp}>
          <div className="rounded-2xl border border-stone-200 dark:border-white/10 bg-white dark:bg-white/5 p-12 md:p-16">
            <h2 className="text-3xl md:text-4xl font-semibold text-stone-900 dark:text-white tracking-[-0.02em] mb-4">
              Don&apos;t see your role?
            </h2>
            <p className="text-stone-500 dark:text-white/50 text-lg mb-6 max-w-xl mx-auto">
              We&apos;re always interested in hearing from talented people. Send us a note and
              tell us what you&apos;d bring to the team.
            </p>
            <a
              href="mailto:careers@synapse.dev"
              className="inline-block text-accent text-lg font-medium hover:underline"
            >
              careers@synapse.dev
            </a>
          </div>
        </motion.div>
      </main>

      <Footer />
    </div>
  );
}
