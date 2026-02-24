'use client';

import { motion } from 'framer-motion';
import { GlassCard } from '@/components/marketing/glass/GlassCard';

// ── Icons ────────────────────────────────────────────────────────────────────

function LinkIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}

function CodeIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="16 18 22 12 16 6" />
      <polyline points="8 6 2 12 8 18" />
    </svg>
  );
}

function RocketIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" />
      <path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" />
      <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" />
      <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />
    </svg>
  );
}

// ── Value Props ──────────────────────────────────────────────────────────────

const VALUE_PROPS = [
  {
    icon: LinkIcon,
    title: 'Connect',
    description:
      'Link your Shopify store in seconds. Your entire theme syncs automatically.',
    stats: 'One-click setup',
  },
  {
    icon: CodeIcon,
    title: 'Build',
    description:
      'Five AI agents write Liquid, CSS, and JavaScript in parallel. Just describe what you want.',
    stats: '5 AI agents',
  },
  {
    icon: RocketIcon,
    title: 'Ship',
    description:
      'Preview changes live, then deploy with one click. Version control and rollback built in.',
    stats: 'One-click deploy',
  },
] as const;

// ── Component ────────────────────────────────────────────────────────────────

interface WelcomeStepProps {
  onNext: () => void;
}

export function WelcomeStep({ onNext }: WelcomeStepProps) {
  return (
    <div className="flex flex-col items-center text-center max-w-2xl mx-auto">
      {/* Heading */}
      <motion.h1
        className="text-3xl sm:text-4xl font-bold text-stone-900 dark:text-white"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
      >
        Welcome to Synapse
      </motion.h1>

      {/* Subtitle */}
      <motion.p
        className="mt-4 text-base ide-text-muted max-w-lg leading-relaxed"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1, ease: 'easeOut' }}
      >
        The AI-powered Shopify theme IDE. Connect your store, and five
        specialized AI agents will help you build, review, and ship themes
        faster than ever.
      </motion.p>

      {/* Value prop cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-8 w-full">
        {VALUE_PROPS.map((prop, i) => (
          <motion.div
            key={prop.title}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.2 + i * 0.1, ease: 'easeOut' }}
          >
            <GlassCard theme="light" hoverScale padding="sm">
              <div className="flex flex-col items-center gap-3 py-2">
                <div className="text-emerald-400">
                  <prop.icon />
                </div>
                <h3 className="text-sm font-semibold text-stone-900 dark:text-white">
                  {prop.title}
                </h3>
                <p className="text-xs ide-text-muted leading-relaxed">
                  {prop.description}
                </p>
                <span className="text-[11px] font-medium text-emerald-400/80">
                  {prop.stats}
                </span>
              </div>
            </GlassCard>
          </motion.div>
        ))}
      </div>

      {/* CTA */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.55, ease: 'easeOut' }}
        className="flex flex-col items-center"
      >
        <button
          type="button"
          onClick={onNext}
          className="mt-10 inline-flex items-center gap-2 px-8 py-3 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-white font-medium text-sm transition-all shadow-[0_0_20px_oklch(0.696_0.17_162_/_0.3)] hover:shadow-[0_0_30px_oklch(0.696_0.17_162_/_0.5)]"
        >
          Get Started
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
        <p className="mt-3 text-xs ide-text-muted">Takes about 2 minutes</p>
      </motion.div>
    </div>
  );
}
