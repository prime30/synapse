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
    title: '1. Acceptance of Terms',
    paragraphs: [
      'By accessing or using Synapse, you agree to be bound by these Terms of Service and all applicable laws and regulations. If you do not agree with any of these terms, you are prohibited from using the platform.',
      'We reserve the right to update these terms at any time. Continued use of the platform after changes constitutes acceptance of the modified terms.',
    ],
  },
  {
    title: '2. Description of Service',
    paragraphs: [
      'Synapse is an AI-powered Shopify development platform that provides multi-agent AI assistance for theme development, code review, and deployment workflows.',
      'The platform includes features such as AI code generation, theme syncing, preview environments, and collaborative development tools. Features may be added, modified, or removed at our discretion.',
    ],
  },
  {
    title: '3. User Accounts',
    paragraphs: [
      'You must provide accurate and complete information when creating an account. You are responsible for maintaining the security of your account credentials.',
      'You are solely responsible for all activity that occurs under your account. You must notify us immediately of any unauthorized use or security breach.',
      'We reserve the right to suspend or terminate accounts that violate these terms or that have been inactive for an extended period.',
    ],
  },
  {
    title: '4. Acceptable Use',
    paragraphs: [
      'You agree not to use Synapse to generate, distribute, or deploy malicious code, malware, or any software designed to harm users or systems.',
      'Abuse of AI agents — including attempts to extract training data, bypass safety filters, or use agents for purposes unrelated to Shopify development — is strictly prohibited.',
      'You may not use the platform to violate any applicable laws, infringe on intellectual property rights, or engage in any activity that disrupts the service for other users.',
    ],
  },
  {
    title: '5. Intellectual Property',
    paragraphs: [
      'You retain full ownership of all code, themes, and content you create using Synapse. We claim no intellectual property rights over your work product.',
      'The Synapse platform, including its AI models, user interface, branding, and documentation, is the intellectual property of Synapse and is protected by applicable copyright and trademark laws.',
      'Feedback and suggestions you provide about the platform may be used by us without obligation to you.',
    ],
  },
  {
    title: '6. Shopify Integration',
    paragraphs: [
      'Use of Shopify-related features is subject to Shopify\'s API Terms of Service and Partner Program Agreement in addition to these terms.',
      'By connecting your Shopify store, you authorize Synapse to access your store data via OAuth 2.0 with the specific permissions you approve during the connection process.',
      'We are not responsible for any changes, outages, or policy updates made by Shopify that may affect the functionality of our integration.',
    ],
  },
  {
    title: '7. Payment Terms',
    paragraphs: [
      'Paid features are billed on a subscription basis. You authorize us to charge your payment method at the beginning of each billing cycle.',
      'You may cancel your subscription at any time. Cancellation takes effect at the end of the current billing period — no partial refunds are provided for unused time.',
      'We reserve the right to change pricing with 30 days\' advance notice. Continued use after a price change constitutes acceptance of the new pricing.',
    ],
  },
  {
    title: '8. Limitation of Liability',
    paragraphs: [
      'Synapse is provided "as is" without warranties of any kind, express or implied. We do not guarantee that the platform will be error-free, uninterrupted, or free of harmful components.',
      'In no event shall Synapse, its officers, directors, or employees be liable for any indirect, incidental, special, consequential, or punitive damages arising from your use of the platform.',
      'Our total liability to you for any claims arising from these terms or your use of the platform shall not exceed the amount you paid us in the 12 months preceding the claim.',
    ],
  },
  {
    title: '9. Termination',
    paragraphs: [
      'We may terminate or suspend your access to the platform immediately, without prior notice, for conduct that we believe violates these terms or is harmful to other users or the platform.',
      'Upon termination, your right to use the platform ceases immediately. You may request export of your data within 30 days of termination.',
      'Provisions that by their nature should survive termination — including intellectual property, limitation of liability, and governing law — shall survive.',
    ],
  },
  {
    title: '10. Governing Law',
    paragraphs: [
      'These Terms of Service shall be governed by and construed in accordance with the laws of the State of California, without regard to its conflict of law provisions.',
      'Any disputes arising from these terms or your use of the platform shall be resolved exclusively in the state or federal courts located in San Francisco County, California.',
    ],
  },
  {
    title: '11. Contact',
    paragraphs: [
      'If you have any questions about these Terms of Service, please contact us at legal@synapse.shop.',
    ],
  },
];

export default function TermsPage() {
  return (
    <div className="relative film-grain bg-stone-50 dark:bg-[#0a0a0a] min-h-screen">
      <Navbar />

      <main className="pt-32 pb-24">
        {/* Hero */}
        <motion.div className="max-w-4xl mx-auto px-6 text-center mb-16" {...fadeUp}>
          <span className="inline-block rounded-full border border-stone-200 dark:border-white/10 bg-stone-100 dark:bg-white/5 px-3 py-1 text-[11px] font-medium tracking-widest uppercase text-stone-500 dark:text-white/50 mb-4">
            LEGAL
          </span>
          <h1 className="text-5xl md:text-6xl lg:text-7xl font-medium text-stone-900 dark:text-white mb-6 leading-[1.1] tracking-[-0.03em]">
            Terms of Service
          </h1>
          <p className="text-stone-500 dark:text-white/50 text-base">
            Last updated: February 1, 2026
          </p>
        </motion.div>

        {/* Content */}
        <motion.div className="max-w-4xl mx-auto px-6" {...fadeUp}>
          <div className="rounded-2xl border border-stone-200 dark:border-white/10 bg-white dark:bg-white/5 p-6 md:p-10">
            <p className="text-stone-600 dark:text-white/60 text-base leading-relaxed mb-10">
              Please read these Terms of Service carefully before using Synapse. These terms
              govern your access to and use of our AI-powered Shopify development platform.
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
