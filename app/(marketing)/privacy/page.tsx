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

const SECTIONS = [
  {
    title: '1. Information We Collect',
    paragraphs: [
      'We collect information you provide directly when you create an account, including your name, email address, and authentication credentials.',
      'We automatically collect usage data such as pages visited, features used, and interaction patterns to improve our product experience.',
      'Device information including browser type, operating system, and IP address may be collected for security and analytics purposes.',
    ],
  },
  {
    title: '2. How We Use Your Information',
    paragraphs: [
      'To provide, maintain, and improve the Synapse platform and its AI-powered development features.',
      'To communicate with you about updates, security alerts, and support messages related to your account.',
      'To analyze usage patterns and improve our multi-agent AI capabilities, always in aggregate and anonymized form.',
    ],
  },
  {
    title: '3. Data Storage & Security',
    paragraphs: [
      'All data is encrypted at rest using AES-256 encryption and in transit using TLS 1.3. We follow industry best practices for data protection.',
      'Our infrastructure providers maintain SOC 2 Type II compliance. We conduct regular security audits and vulnerability assessments.',
      'Database backups are encrypted and stored in geographically distributed locations to ensure data durability and availability.',
    ],
  },
  {
    title: '4. Code Privacy',
    paragraphs: [
      'Your code never leaves your machine. AI processing uses only anonymized snippets and contextual metadata — never your full source code.',
      'Synapse agents operate locally within your development environment. Any data sent to AI models is stripped of identifying information and is not used to train third-party models.',
      'You retain full ownership and control over all code and theme files at all times.',
    ],
  },
  {
    title: '5. Third-Party Services',
    paragraphs: [
      'Supabase — Used for authentication, database storage, and real-time features. Subject to Supabase\'s privacy policy.',
      'Shopify API — Used to connect your Shopify stores, manage themes, and sync changes. Subject to Shopify\'s API terms and privacy policy.',
      'OpenAI API — Powers our AI agents for code analysis and generation. Anonymized context only; no full source code is transmitted.',
    ],
  },
  {
    title: '6. Cookies',
    paragraphs: [
      'We use essential cookies only — those required for authentication, session management, and security. We do not use tracking or advertising cookies.',
      'You can configure your browser to reject cookies, but some features of the platform may not function properly without essential cookies.',
    ],
  },
  {
    title: '7. Your Rights',
    paragraphs: [
      'Access — You can request a copy of all personal data we hold about you at any time.',
      'Deletion — You can request permanent deletion of your account and all associated data.',
      'Portability — You can export your data in standard machine-readable formats.',
      'Correction — You can update or correct your personal information through your account settings or by contacting us directly.',
    ],
  },
  {
    title: '8. Changes to This Policy',
    paragraphs: [
      'We may update this Privacy Policy from time to time. When we make material changes, we will notify you via email and/or a prominent notice on the platform at least 30 days before the changes take effect.',
      'Your continued use of Synapse after changes become effective constitutes acceptance of the revised policy.',
    ],
  },
  {
    title: '9. Contact',
    paragraphs: [
      'If you have any questions about this Privacy Policy or our data practices, please contact us at privacy@synapse.shop.',
    ],
  },
];

export default function PrivacyPage() {
  return (
    <div className="relative film-grain bg-stone-50 dark:bg-[oklch(0.145_0_0)] min-h-screen">
      <Navbar />

      <main className="pt-32 pb-24">
        {/* Hero */}
        <motion.div className="max-w-4xl mx-auto px-6 text-center mb-16" {...fadeUp}>
          <span className="inline-block rounded-full border border-stone-200 dark:border-white/10 bg-stone-100 dark:bg-white/5 px-3 py-1 text-[11px] font-medium tracking-widest uppercase text-stone-500 dark:text-white/50 mb-4">
            LEGAL
          </span>
          <h1 className="text-5xl md:text-6xl lg:text-7xl font-medium text-stone-900 dark:text-white mb-6 leading-[1.1] tracking-[-0.03em]">
            Privacy Policy
          </h1>
          <p className="text-stone-500 dark:text-white/50 text-base">
            Last updated: February 1, 2026
          </p>
        </motion.div>

        {/* Content */}
        <motion.div className="max-w-4xl mx-auto px-6" {...fadeUp}>
          <div className="rounded-2xl border border-stone-200 dark:border-white/10 bg-white dark:bg-white/5 p-6 md:p-10">
            <p className="text-stone-600 dark:text-white/60 text-base leading-relaxed mb-10">
              At Synapse, we take your privacy seriously. This Privacy Policy explains how we
              collect, use, store, and protect your information when you use our AI-powered
              Shopify development platform.
            </p>

            <div className="space-y-10">
              {SECTIONS.map((section) => (
                <div key={section.title}>
                  <h2 className="text-2xl font-semibold text-stone-900 dark:text-white mb-4">
                    {section.title}
                  </h2>
                  <div className="space-y-3">
                    {section.paragraphs.map((paragraph, idx) => (
                      <p
                        key={idx}
                        className="text-stone-600 dark:text-white/60 text-base leading-relaxed"
                      >
                        {paragraph}
                      </p>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      </main>

      <Footer />
    </div>
  );
}
