'use client';

import { motion } from 'framer-motion';
import { Navbar } from '@/components/marketing/nav';
import { Footer } from '@/components/marketing/sections';

const fadeUp = {
  initial: { opacity: 0, y: 20 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true },
  transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] as const },
};

const SECURITY_CARDS = [
  {
    icon: '\u{1F6E1}\u{FE0F}',
    title: 'Code Privacy',
    description:
      'Your source code never leaves your local machine. AI agents process anonymized context only.',
  },
  {
    icon: '\u{1F512}',
    title: 'Encryption',
    description:
      'All data encrypted in transit (TLS 1.3) and at rest (AES-256).',
  },
  {
    icon: '\u{1F511}',
    title: 'Authentication',
    description:
      'OAuth 2.0 with Supabase Auth. MFA support coming soon.',
  },
  {
    icon: '\u{2601}\u{FE0F}',
    title: 'Infrastructure',
    description:
      'Hosted on Vercel and Supabase with SOC 2 Type II compliance.',
  },
  {
    icon: '\u{1F465}',
    title: 'Access Control',
    description:
      'Role-based permissions. API keys are scoped and rotatable.',
  },
  {
    icon: '\u{1F6A8}',
    title: 'Incident Response',
    description:
      '24-hour response SLA. Security issues: security@synapse.shop',
  },
];

export default function SecurityPage() {
  return (
    <div className="relative film-grain bg-stone-50 dark:bg-[oklch(0.145_0_0)] min-h-screen">
      <Navbar />

      <main className="pt-32 pb-24">
        {/* Hero */}
        <motion.div className="max-w-4xl mx-auto px-6 text-center mb-20" {...fadeUp}>
          <span className="inline-block rounded-full border border-stone-200 dark:border-white/10 bg-stone-100 dark:bg-white/5 px-3 py-1 text-[11px] font-medium tracking-widest uppercase text-stone-500 dark:text-white/50 mb-4">
            SECURITY
          </span>
          <h1 className="text-5xl md:text-6xl lg:text-7xl font-medium text-stone-900 dark:text-white mb-6 leading-[1.1] tracking-[-0.03em]">
            Security at Synapse.
          </h1>
          <p className="text-stone-500 dark:text-white/50 text-lg max-w-2xl mx-auto">
            We take the security of your code and data seriously. Here&apos;s how we protect
            your work at every layer.
          </p>
        </motion.div>

        {/* Security Cards Grid */}
        <div className="max-w-4xl mx-auto px-6 mb-20">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {SECURITY_CARDS.map((card, index) => (
              <motion.div
                key={card.title}
                className="rounded-2xl border border-stone-200 dark:border-white/10 bg-white dark:bg-white/5 p-6 md:p-8"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.08 }}
              >
                <span className="text-3xl mb-4 block">{card.icon}</span>
                <h3 className="text-xl font-semibold text-stone-900 dark:text-white mb-2">
                  {card.title}
                </h3>
                <p className="text-stone-600 dark:text-white/60 text-base leading-relaxed">
                  {card.description}
                </p>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Report Vulnerability */}
        <motion.div className="max-w-4xl mx-auto px-6" {...fadeUp}>
          <div className="rounded-2xl border border-stone-200 dark:border-white/10 bg-white dark:bg-white/5 p-8 md:p-12 text-center">
            <h2 className="text-2xl md:text-3xl font-semibold text-stone-900 dark:text-white mb-4">
              Report a Vulnerability
            </h2>
            <p className="text-stone-600 dark:text-white/60 text-base leading-relaxed max-w-xl mx-auto mb-6">
              Found a security issue? We appreciate responsible disclosure. Please report
              vulnerabilities directly to our security team — we respond within 24 hours.
            </p>
            <a
              href="mailto:security@synapse.shop"
              className="inline-block rounded-full border border-stone-200 dark:border-white/10 bg-stone-100 dark:bg-white/5 px-6 py-3 text-sm font-medium text-stone-900 dark:text-white hover:bg-stone-200 dark:hover:bg-white/10 transition-colors"
            >
              security@synapse.shop
            </a>
          </div>
        </motion.div>
      </main>

      <Footer />
    </div>
  );
}
