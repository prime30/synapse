'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { GlassCard } from '@/components/marketing/glass';
import { Navbar } from '@/components/marketing/nav';
import { Footer } from '@/components/marketing/sections';

const TIERS = [
  {
    name: 'Free',
    price: '$0',
    period: 'forever',
    description: 'Perfect for solo developers exploring Synapse.',
    highlighted: false,
    features: [
      { name: 'Core IDE features', included: true },
      { name: 'Basic AI suggestions', included: true },
      { name: '1 project', included: true },
      { name: 'Community support', included: true },
      { name: 'Liquid syntax validation', included: true },
      { name: 'Unlimited AI agents', included: false },
      { name: 'Shopify sync', included: false },
      { name: 'Priority support', included: false },
      { name: 'Advanced analytics', included: false },
      { name: 'Team collaboration', included: false },
    ],
    cta: 'Start Free',
    ctaHref: '/signup',
  },
  {
    name: 'Pro',
    price: '$29',
    period: '/month',
    description: 'Everything you need to ship Shopify themes faster.',
    highlighted: true,
    badge: 'MOST POPULAR',
    features: [
      { name: 'Core IDE features', included: true },
      { name: 'Basic AI suggestions', included: true },
      { name: 'Unlimited projects', included: true },
      { name: 'Priority support', included: true },
      { name: 'Liquid syntax validation', included: true },
      { name: 'Unlimited AI agents', included: true },
      { name: 'Shopify sync', included: true },
      { name: 'Priority support', included: true },
      { name: 'Advanced analytics', included: true },
      { name: 'Team collaboration', included: true },
    ],
    cta: 'Get Pro',
    ctaHref: '/signup?plan=pro',
  },
];

const FAQS = [
  {
    q: 'Can I try Pro features before committing?',
    a: 'Yes! Start with the Free plan and upgrade anytime. We also offer a 14-day free trial of Pro features.',
  },
  {
    q: 'What happens when I hit the free plan limits?',
    a: 'You can continue using the IDE with basic features. AI agents and Shopify sync require the Pro plan.',
  },
  {
    q: 'Can I cancel my Pro subscription anytime?',
    a: 'Absolutely. Cancel anytime from your account settings. No long-term contracts or hidden fees.',
  },
  {
    q: 'Do you offer team or enterprise pricing?',
    a: "We're working on team plans. Contact us at hello@synapse.dev for enterprise inquiries.",
  },
  {
    q: 'Is my code secure?',
    a: 'Your code never leaves your machine. Synapse processes everything locally with AI API calls for suggestions only.',
  },
];

function FAQItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border-b border-stone-200 last:border-b-0">
      <button
        className="w-full py-5 px-6 flex items-center justify-between text-left cursor-pointer"
        onClick={() => setOpen(!open)}
      >
        <span className="text-stone-900 font-medium pr-8">{q}</span>
        <motion.span
          className="text-accent text-xl flex-shrink-0"
          animate={{ rotate: open ? 45 : 0 }}
          transition={{ duration: 0.2 }}
        >
          +
        </motion.span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] as const }}
            className="overflow-hidden"
          >
            <p className="text-stone-500 text-sm leading-relaxed pb-5 px-6">{a}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function PricingPage() {
  return (
    <div className="relative film-grain bg-stone-50 min-h-screen">
      <Navbar />

      <main className="pt-32 pb-24">
        <div className="max-w-7xl mx-auto px-6 text-center mb-16">
          <span className="inline-block rounded-full border border-stone-200 bg-stone-100 px-3 py-1 text-[11px] font-medium tracking-widest uppercase text-stone-500 mb-4">
            PRICING
          </span>
          <h1 className="text-5xl md:text-6xl lg:text-7xl font-medium text-stone-900 mb-6 leading-[1.1] tracking-[-0.03em]">
            Simple, transparent pricing.
          </h1>
          <p className="text-stone-500 text-lg max-w-xl mx-auto">
            Start free. Upgrade when you&apos;re ready. No surprises.
          </p>
        </div>

        <div className="max-w-4xl mx-auto px-6 grid grid-cols-1 md:grid-cols-2 gap-6 mb-24">
          {TIERS.map((tier) => (
            <GlassCard
              key={tier.name}
              padding="lg"
              theme="light"
              hoverScale
              className={`relative ${tier.highlighted ? 'ring-2 ring-sky-500/50' : ''}`}
              style={tier.highlighted ? { boxShadow: '0 0 40px rgba(14,165,233,0.12)' } : undefined}
            >
              {tier.highlighted && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="font-pixel text-[9px] tracking-[0.2em] gradient-accent text-white px-4 py-1 rounded-full">
                    {tier.badge}
                  </span>
                </div>
              )}

              <h3 className="text-2xl font-semibold text-stone-900 mb-2">{tier.name}</h3>
              <p className="text-stone-500 text-sm mb-6">{tier.description}</p>

              <div className="mb-8">
                <span className="text-5xl font-bold text-stone-900">{tier.price}</span>
                <span className="text-stone-500 text-sm ml-1">{tier.period}</span>
              </div>

              <a
                href={tier.ctaHref}
                className={`block w-full py-3 rounded-full text-center font-semibold transition-shadow mb-8 ${
                  tier.highlighted
                    ? 'gradient-accent text-white hover:shadow-[0_0_30px_rgba(14,165,233,0.4)]'
                    : 'glass-light text-stone-900 hover:border-sky-500/30'
                }`}
              >
                {tier.cta}
              </a>

              <ul className="space-y-3">
                {tier.features.map((feature) => (
                  <li key={feature.name} className="flex items-center gap-3 text-sm">
                    <span className={feature.included ? 'text-accent' : 'text-stone-300'}>
                      {feature.included ? '✓' : '—'}
                    </span>
                    <span className={feature.included ? 'text-stone-800' : 'text-stone-400'}>
                      {feature.name}
                    </span>
                  </li>
                ))}
              </ul>
            </GlassCard>
          ))}
        </div>

        <div className="max-w-3xl mx-auto px-6">
          <div className="text-center mb-12">
            <span className="inline-block rounded-full border border-stone-200 bg-stone-100 px-3 py-1 text-[11px] font-medium tracking-widest uppercase text-stone-500 mb-4">
              FAQ
            </span>
            <h2 className="text-3xl md:text-4xl font-semibold text-stone-900">
              Common questions.
            </h2>
          </div>

          <div className="border border-stone-200 rounded-2xl overflow-hidden bg-white/60 backdrop-blur">
            {FAQS.map((faq) => (
              <FAQItem key={faq.q} q={faq.q} a={faq.a} />
            ))}
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
