'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { Navbar } from '@/components/marketing/nav';
import { Footer } from '@/components/marketing/sections';

const VALUES = [
  {
    title: 'Developer-first',
    description: 'Tools that respect your workflow. CLI, MCP, and IDE-native — we meet you where you already work.',
  },
  {
    title: 'Quality obsessed',
    description: 'Every line of generated code is reviewed by a dedicated AI agent before it touches your project.',
  },
  {
    title: 'Open by default',
    description: 'Transparent processes, open standards. Built on MCP with an extensible, inspectable architecture.',
  },
];

const TEAM = [
  { name: 'Alex Chen', role: 'CEO', initials: 'AC', color: 'bg-emerald-500' },
  { name: 'Sarah Kim', role: 'CTO', initials: 'SK', color: 'bg-sky-500' },
  { name: 'Marcus Johnson', role: 'Head of AI', initials: 'MJ', color: 'bg-violet-500' },
  { name: 'Elena Rodriguez', role: 'Head of Design', initials: 'ER', color: 'bg-amber-500' },
];

const fadeUp = {
  initial: { opacity: 0, y: 20 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true },
  transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] as const },
};

export default function AboutPage() {
  return (
    <div className="relative film-grain bg-stone-50 dark:bg-[#0a0a0a] min-h-screen">
      <Navbar />

      <main className="pt-32 pb-24">
        {/* Hero */}
        <motion.div className="max-w-6xl mx-auto px-6 text-center mb-24" {...fadeUp}>
          <span className="inline-block rounded-full border border-stone-200 dark:border-white/10 bg-stone-100 dark:bg-white/5 px-3 py-1 text-[11px] font-medium tracking-widest uppercase text-stone-500 dark:text-white/50 mb-4">
            ABOUT
          </span>
          <h1 className="text-5xl md:text-6xl lg:text-7xl font-medium text-stone-900 dark:text-white mb-6 leading-[1.1] tracking-[-0.03em]">
            Building the future of
            <br />
            Shopify development.
          </h1>
          <p className="text-stone-500 dark:text-white/50 text-lg max-w-2xl mx-auto">
            We&apos;re on a mission to democratize Shopify theme development — making it faster,
            smarter, and more accessible with multi-agent AI that truly understands your code.
          </p>
        </motion.div>

        {/* Mission */}
        <motion.div className="max-w-3xl mx-auto px-6 mb-24" {...fadeUp}>
          <div className="rounded-2xl border border-stone-200 dark:border-white/10 bg-white dark:bg-white/5 p-8 md:p-10">
            <h2 className="text-3xl md:text-4xl font-semibold text-stone-900 dark:text-white tracking-[-0.02em] mb-4">
              Our mission
            </h2>
            <p className="text-stone-500 dark:text-white/50 text-lg leading-relaxed mb-4">
              Shopify powers millions of businesses, but building and maintaining custom themes
              remains slow, error-prone, and inaccessible to most. We believe AI can change that.
            </p>
            <p className="text-stone-500 dark:text-white/50 text-lg leading-relaxed">
              Synapse combines multi-agent orchestration with deep Shopify expertise to
              democratize theme development. Whether you&apos;re an agency shipping dozens of
              stores or a solo developer launching your first project, Synapse gives you a
              world-class development team — powered by AI — at your fingertips.
            </p>
          </div>
        </motion.div>

        {/* Values */}
        <motion.div className="max-w-6xl mx-auto px-6 mb-24" {...fadeUp}>
          <div className="text-center mb-12">
            <span className="inline-block rounded-full border border-stone-200 dark:border-white/10 bg-stone-100 dark:bg-white/5 px-3 py-1 text-[11px] font-medium tracking-widest uppercase text-stone-500 dark:text-white/50 mb-4">
              VALUES
            </span>
            <h2 className="text-3xl md:text-4xl font-semibold text-stone-900 dark:text-white tracking-[-0.02em]">
              What drives us
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {VALUES.map((value) => (
              <motion.div
                key={value.title}
                className="rounded-2xl border border-stone-200 dark:border-white/10 bg-white dark:bg-white/5 p-8"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5 }}
              >
                <h3 className="text-xl font-medium text-stone-900 dark:text-white mb-2">
                  {value.title}
                </h3>
                <p className="text-stone-500 dark:text-white/50 text-sm leading-relaxed">
                  {value.description}
                </p>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Team */}
        <motion.div className="max-w-6xl mx-auto px-6 mb-24" {...fadeUp}>
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-semibold text-stone-900 dark:text-white tracking-[-0.02em]">
              The team
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6">
            {TEAM.map((member) => (
              <motion.div
                key={member.name}
                className="rounded-2xl border border-stone-200 dark:border-white/10 bg-white dark:bg-white/5 p-8 text-center"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5 }}
              >
                <div
                  className={`${member.color} w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4`}
                >
                  <span className="text-white text-lg font-semibold">{member.initials}</span>
                </div>
                <h3 className="text-lg font-medium text-stone-900 dark:text-white">
                  {member.name}
                </h3>
                <p className="text-stone-500 dark:text-white/50 text-sm">{member.role}</p>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* CTA */}
        <motion.div className="max-w-6xl mx-auto px-6 text-center" {...fadeUp}>
          <div className="rounded-2xl border border-stone-200 dark:border-white/10 bg-white dark:bg-white/5 p-12 md:p-16">
            <h2 className="text-3xl md:text-4xl font-semibold text-stone-900 dark:text-white tracking-[-0.02em] mb-4">
              Want to join us?
            </h2>
            <p className="text-stone-500 dark:text-white/50 text-lg mb-8 max-w-xl mx-auto">
              We&apos;re always looking for talented people who are passionate about developer
              tools and AI.
            </p>
            <Link
              href="/careers"
              className="inline-block gradient-accent text-white px-8 py-3 rounded-full font-semibold hover:shadow-[0_0_30px_rgba(40,205,86,0.4)] transition-shadow"
            >
              View open roles &rarr;
            </Link>
          </div>
        </motion.div>
      </main>

      <Footer />
    </div>
  );
}
