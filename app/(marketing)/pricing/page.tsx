'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Navbar } from '@/components/marketing/nav';
import { Footer } from '@/components/marketing/sections';
import { PixelAccent } from '@/components/marketing/interactions/PixelAccent';

/* ─── Tier Data ────────────────────────────────────────────────────── */

interface Tier {
  name: string;
  monthlyPrice: number;
  byokMonthlyPrice: number | null;
  description: string;
  highlighted: boolean;
  badge?: string;
  requestLimit: string;
  seats: string;
  features: string[];
  cta: string;
  ctaHref: string;
}

const TIERS: Tier[] = [
  {
    name: 'Starter',
    monthlyPrice: 0,
    byokMonthlyPrice: null,
    description: 'Get started for free — perfect for exploring Synapse.',
    highlighted: false,
    requestLimit: '50 requests / mo',
    seats: '1 seat',
    features: [
      '1 project',
      'Basic code editor',
      'Liquid syntax validation',
      'Community support',
    ],
    cta: 'Start Free',
    ctaHref: '/auth/signin',
  },
  {
    name: 'Pro',
    monthlyPrice: 49,
    byokMonthlyPrice: 19,
    description: 'Everything you need to ship Shopify themes faster.',
    highlighted: true,
    badge: 'MOST POPULAR',
    requestLimit: '500 requests / mo',
    seats: '1 seat',
    features: [
      'Unlimited projects',
      'Full IDE experience',
      'Live preview',
      'AI-powered agents',
      'Shopify sync',
      'Advanced analytics',
      'Priority support',
    ],
    cta: 'Get Started',
    ctaHref: '/auth/signin?callbackUrl=/account/billing',
  },
  {
    name: 'Team',
    monthlyPrice: 149,
    byokMonthlyPrice: 59,
    description: 'Collaborate on themes with your team.',
    highlighted: false,
    requestLimit: '2,000 requests / mo',
    seats: '5 seats',
    features: [
      'Everything in Pro',
      'Team collaboration',
      'Publish workflow',
      'Shared design tokens',
      'Role-based access',
      'Audit log',
    ],
    cta: 'Get Started',
    ctaHref: '/auth/signin?callbackUrl=/account/billing',
  },
  {
    name: 'Agency',
    monthlyPrice: 349,
    byokMonthlyPrice: 149,
    description: 'For agencies managing multiple client stores.',
    highlighted: false,
    requestLimit: '6,000 requests / mo',
    seats: 'Unlimited seats',
    features: [
      'Everything in Team',
      'White-label branding',
      'Unlimited seats',
      'Priority support & SLA',
      'Custom integrations',
      'Dedicated account manager',
    ],
    cta: 'Get Started',
    ctaHref: '/auth/signin?callbackUrl=/account/billing',
  },
];

/* ─── Comparison Grid ──────────────────────────────────────────────── */

interface ComparisonRow {
  feature: string;
  starter: string | boolean;
  pro: string | boolean;
  team: string | boolean;
  agency: string | boolean;
}

const COMPARISON: ComparisonRow[] = [
  { feature: 'AI Requests / mo', starter: '50', pro: '500', team: '2,000', agency: '6,000' },
  { feature: 'Projects', starter: '1', pro: 'Unlimited', team: 'Unlimited', agency: 'Unlimited' },
  { feature: 'Seats', starter: '1', pro: '1', team: '5', agency: 'Unlimited' },
  { feature: 'Code Editor', starter: 'Basic', pro: 'Full IDE', team: 'Full IDE', agency: 'Full IDE' },
  { feature: 'Liquid Validation', starter: true, pro: true, team: true, agency: true },
  { feature: 'Live Preview', starter: false, pro: true, team: true, agency: true },
  { feature: 'AI Agents', starter: false, pro: true, team: true, agency: true },
  { feature: 'Shopify Sync', starter: false, pro: true, team: true, agency: true },
  { feature: 'Advanced Analytics', starter: false, pro: true, team: true, agency: true },
  { feature: 'Team Collaboration', starter: false, pro: false, team: true, agency: true },
  { feature: 'Publish Workflow', starter: false, pro: false, team: true, agency: true },
  { feature: 'White-label', starter: false, pro: false, team: false, agency: true },
  { feature: 'Priority Support', starter: false, pro: true, team: true, agency: true },
  { feature: 'Dedicated Account Mgr', starter: false, pro: false, team: false, agency: true },
];

/* ─── FAQ ──────────────────────────────────────────────────────────── */

const FAQS = [
  {
    q: 'Can I try Pro features before committing?',
    a: 'Yes! Start with the Free plan and upgrade anytime. We also offer a 14-day free trial of Pro features.',
  },
  {
    q: 'What happens when I hit my request limit?',
    a: 'You can continue using the editor with basic features. AI agent requests will pause until the next billing cycle or you upgrade.',
  },
  {
    q: 'Can I cancel my subscription anytime?',
    a: 'Absolutely. Cancel anytime from your account settings. No long-term contracts or hidden fees.',
  },
  {
    q: 'What does "Bring Your Own Keys" mean?',
    a: 'If you already have API keys for providers like OpenAI or Anthropic, you can use them directly. You only pay our reduced platform fee — the AI usage goes on your own account.',
  },
  {
    q: 'Is my code secure?',
    a: 'Your code never leaves your machine. Synapse processes everything locally with AI API calls for suggestions only.',
  },
];

/* ─── Helpers ──────────────────────────────────────────────────────── */

function formatPrice(monthly: number, annual: boolean): { display: string; period: string; crossed?: string } {
  if (monthly === 0) return { display: '$0', period: '/mo' };
  if (annual) {
    const annualMonthly = Math.round(monthly * 0.8);
    return { display: `$${annualMonthly}`, period: '/mo', crossed: `$${monthly}` };
  }
  return { display: `$${monthly}`, period: '/mo' };
}

/* ─── Components ───────────────────────────────────────────────────── */

function FAQItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border-b border-stone-200 dark:border-white/10 last:border-b-0">
      <button
        className="w-full py-5 px-4 sm:px-6 flex items-center justify-between text-left cursor-pointer"
        onClick={() => setOpen(!open)}
      >
        <span className="text-stone-900 dark:text-white font-medium pr-8">{q}</span>
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
            <p className="text-stone-500 dark:text-white/50 text-sm leading-relaxed pb-5 px-4 sm:px-6">{a}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ComparisonCell({ value }: { value: string | boolean }) {
  if (typeof value === 'boolean') {
    return value ? (
      <span className="text-accent font-medium">&#10003;</span>
    ) : (
      <span className="text-stone-300 dark:text-white/20">&mdash;</span>
    );
  }
  return <span className="text-stone-700 dark:text-white/70 text-sm">{value}</span>;
}

function TierCard({ tier, annual }: { tier: Tier; annual: boolean }) {
  const price = formatPrice(tier.monthlyPrice, annual);

  return (
    <div className="relative rounded-xl">
      {/* Border tracker for highlighted card */}
      {tier.highlighted && (
        <div className="absolute -inset-px rounded-xl overflow-hidden pointer-events-none" aria-hidden="true">
          <div
            className="absolute"
            style={{
              width: '200%',
              height: '200%',
              top: '-50%',
              left: '-50%',
              background: 'conic-gradient(from 0deg at 50% 50%, transparent 0deg, oklch(0.745 0.189 148 / 0.5) 60deg, oklch(0.745 0.189 148 / 0.7) 90deg, transparent 150deg, transparent 360deg)',
              animation: 'prompt-border-spin 3s linear infinite',
            }}
          />
          <div className="absolute inset-[1.5px] rounded-[10px] bg-[oklch(0.985_0.001_106)] dark:bg-[oklch(0.145_0_0)]" />
        </div>
      )}

      <div
        className={`relative flex flex-col rounded-xl border p-6 md:p-8 transition-shadow ${
          tier.highlighted
            ? 'border-accent/30 dark:border-accent/20 bg-[oklch(0.985_0.001_106)] dark:bg-white/[0.03]'
            : 'border-stone-200 dark:border-white/10 bg-white dark:bg-white/[0.03]'
        }`}
        style={
          tier.highlighted
            ? { boxShadow: '0 0 40px oklch(0.745 0.189 148 / 0.1), 0 0 80px oklch(0.745 0.189 148 / 0.05)' }
            : undefined
        }
      >
        {tier.badge && (
          <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-20">
            <span className="font-pixel text-[9px] tracking-[0.2em] gradient-accent text-white px-4 py-1 rounded-full whitespace-nowrap">
              {tier.badge}
            </span>
          </div>
        )}

        <h3 className="text-2xl font-semibold text-stone-900 dark:text-white mb-1">{tier.name}</h3>
        <p className="text-stone-500 dark:text-white/50 text-sm mb-6">{tier.description}</p>

        <div className="mb-2">
          {price.crossed && (
            <span className="text-stone-400 dark:text-white/30 line-through text-lg mr-2">
              {price.crossed}
            </span>
          )}
          <span className="text-5xl font-bold text-stone-900 dark:text-white">{price.display}</span>
          <span className="text-stone-500 dark:text-white/50 text-sm ml-1">{price.period}</span>
        </div>
        {annual && tier.monthlyPrice > 0 && (
          <p className="text-xs text-stone-400 dark:text-white/30 mb-6">
            Billed ${Math.round(tier.monthlyPrice * 0.8 * 12)}/year
          </p>
        )}
        {!annual && tier.monthlyPrice > 0 && <div className="mb-6" />}
        {tier.monthlyPrice === 0 && <div className="mb-6" />}

        <div className="text-xs text-stone-500 dark:text-white/50 space-y-1 mb-6">
          <p className="font-medium text-stone-700 dark:text-white/70">{tier.requestLimit}</p>
          <p>{tier.seats}</p>
        </div>

        <a
          href={tier.ctaHref}
          className={`block w-full py-3 rounded-full text-center font-semibold transition-shadow mb-8 ${
            tier.highlighted
              ? 'gradient-accent text-white hover:shadow-[0_0_30px_oklch(0.745_0.189_148_/_0.35)]'
              : 'border border-stone-200 dark:border-white/10 text-stone-900 dark:text-white bg-stone-50 dark:bg-white/5 hover:border-accent/30 dark:hover:border-accent/30'
          }`}
        >
          {tier.cta}
        </a>

        <ul className="space-y-2.5 mt-auto">
          {tier.features.map((feature) => (
            <li key={feature} className="flex items-start gap-2.5 text-sm">
              <span className="text-accent mt-0.5 flex-shrink-0">&#10003;</span>
              <span className="text-stone-700 dark:text-white/70">{feature}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/* ─── Page ─────────────────────────────────────────────────────────── */

export default function PricingPage() {
  const [annual, setAnnual] = useState(false);

  return (
    <div className="relative film-grain bg-[oklch(0.985_0.001_106)] dark:bg-[oklch(0.145_0_0)] min-h-screen">
      <Navbar />

      <main className="pt-32 pb-24">
        {/* ── Header ─────────────────────────────────────────────── */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 text-center mb-12">
          <span className="inline-block rounded-full border border-stone-200 dark:border-white/10 bg-stone-100 dark:bg-white/5 px-3 py-1 text-[11px] font-medium tracking-widest uppercase text-stone-500 dark:text-white/50 mb-4">
            PRICING
          </span>
          <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-medium text-stone-900 dark:text-white mb-6 leading-[1.1] tracking-[-0.03em]">
            Simple, <PixelAccent>transparent</PixelAccent> pricing.
          </h1>
          <p className="text-stone-500 dark:text-white/50 text-lg max-w-xl mx-auto mb-8">
            Start free. Upgrade when you&apos;re ready. No surprises.
          </p>

          {/* ── Billing Toggle ────────────────────────────────────── */}
          <div className="flex items-center justify-center gap-3 mb-4">
            <span className={`text-sm font-medium ${!annual ? 'text-stone-900 dark:text-white' : 'text-stone-400 dark:text-white/40'}`}>
              Monthly
            </span>
            <button
              type="button"
              onClick={() => setAnnual(!annual)}
              className={`relative w-12 h-6 rounded-full transition-colors ${
                annual ? 'bg-accent' : 'bg-stone-300 dark:bg-white/20'
              }`}
              aria-label="Toggle annual billing"
            >
              <motion.div
                className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm"
                animate={{ x: annual ? 24 : 0 }}
                transition={{ type: 'spring', stiffness: 500, damping: 30 }}
              />
            </button>
            <span className={`text-sm font-medium ${annual ? 'text-stone-900 dark:text-white' : 'text-stone-400 dark:text-white/40'}`}>
              Annual
            </span>
            {annual && (
              <motion.span
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="ml-1 rounded-full bg-accent/10 text-accent text-xs font-semibold px-2 py-0.5"
              >
                Save 20%
              </motion.span>
            )}
          </div>
        </div>

        {/* ── Pricing Cards ──────────────────────────────────────── */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-16">
          {TIERS.map((tier) => (
            <TierCard key={tier.name} tier={tier} annual={annual} />
          ))}
        </div>

        {/* ── BYOK Callout ───────────────────────────────────────── */}
        <div className="max-w-4xl mx-auto px-4 sm:px-6 mb-24">
          <div className="rounded-2xl border border-stone-200 dark:border-white/10 bg-white dark:bg-white/[0.03] p-8 md:p-10 text-center">
            <div className="inline-flex items-center gap-2 rounded-full bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 px-3 py-1 text-xs font-medium text-amber-700 dark:text-amber-400 mb-4">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
              </svg>
              BRING YOUR OWN KEYS
            </div>
            <h3 className="text-2xl font-semibold text-stone-900 dark:text-white mb-3">
              Already have API keys? Get reduced pricing.
            </h3>
            <p className="text-stone-500 dark:text-white/50 text-sm max-w-2xl mx-auto mb-6">
              Connect your own OpenAI, Anthropic, or Google API keys. You only pay our platform fee — AI usage goes on your own account.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-4 text-sm">
              <span className="rounded-full bg-stone-100 dark:bg-white/5 border border-stone-200 dark:border-white/10 px-4 py-2 text-stone-700 dark:text-white/70">
                Pro <span className="font-semibold">$19</span><span className="text-stone-400 dark:text-white/30">/mo</span>
              </span>
              <span className="rounded-full bg-stone-100 dark:bg-white/5 border border-stone-200 dark:border-white/10 px-4 py-2 text-stone-700 dark:text-white/70">
                Team <span className="font-semibold">$59</span><span className="text-stone-400 dark:text-white/30">/mo</span>
              </span>
              <span className="rounded-full bg-stone-100 dark:bg-white/5 border border-stone-200 dark:border-white/10 px-4 py-2 text-stone-700 dark:text-white/70">
                Agency <span className="font-semibold">$149</span><span className="text-stone-400 dark:text-white/30">/mo</span>
              </span>
            </div>
          </div>
        </div>

        {/* ── Comparison Grid ────────────────────────────────────── */}
        <div className="max-w-6xl mx-auto px-4 sm:px-6 mb-24">
          <div className="text-center mb-12">
            <span className="inline-block rounded-full border border-stone-200 dark:border-white/10 bg-stone-100 dark:bg-white/5 px-3 py-1 text-[11px] font-medium tracking-widest uppercase text-stone-500 dark:text-white/50 mb-4">
              COMPARE
            </span>
            <h2 className="text-3xl md:text-4xl font-semibold text-stone-900 dark:text-white">
              Feature comparison
            </h2>
          </div>

          <div className="border border-stone-200 dark:border-white/10 rounded-2xl overflow-hidden bg-white/60 dark:bg-white/[0.03] backdrop-blur overflow-x-auto">
            <table className="w-full text-left min-w-[640px]">
              <thead>
                <tr className="border-b border-stone-200 dark:border-white/10 bg-stone-50/80 dark:bg-white/[0.02]">
                  <th className="py-4 px-4 sm:px-6 text-sm font-medium text-stone-500 dark:text-white/40 w-[200px]">Feature</th>
                  {TIERS.map((t) => (
                    <th key={t.name} className="py-4 px-3 sm:px-4 text-sm font-semibold text-stone-900 dark:text-white text-center">
                      {t.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {COMPARISON.map((row, i) => (
                  <tr
                    key={row.feature}
                    className={`border-b border-stone-100 dark:border-white/5 last:border-b-0 ${
                      i % 2 === 0 ? 'bg-white/40 dark:bg-transparent' : 'bg-stone-50/40 dark:bg-white/[0.02]'
                    }`}
                  >
                    <td className="py-3.5 px-4 sm:px-6 text-sm text-stone-600 dark:text-white/60 font-medium">{row.feature}</td>
                    <td className="py-3.5 px-3 sm:px-4 text-center"><ComparisonCell value={row.starter} /></td>
                    <td className="py-3.5 px-3 sm:px-4 text-center"><ComparisonCell value={row.pro} /></td>
                    <td className="py-3.5 px-3 sm:px-4 text-center"><ComparisonCell value={row.team} /></td>
                    <td className="py-3.5 px-3 sm:px-4 text-center"><ComparisonCell value={row.agency} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── FAQ ─────────────────────────────────────────────────── */}
        <div className="max-w-3xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-12">
            <span className="inline-block rounded-full border border-stone-200 dark:border-white/10 bg-stone-100 dark:bg-white/5 px-3 py-1 text-[11px] font-medium tracking-widest uppercase text-stone-500 dark:text-white/50 mb-4">
              FAQ
            </span>
            <h2 className="text-3xl md:text-4xl font-semibold text-stone-900 dark:text-white">
              Common questions.
            </h2>
          </div>

          <div className="border border-stone-200 dark:border-white/10 rounded-2xl overflow-hidden bg-white/60 dark:bg-white/[0.03] backdrop-blur">
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
