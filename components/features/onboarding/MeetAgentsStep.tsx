'use client';

import { motion } from 'framer-motion';
import { GlassCard } from '@/components/marketing/glass/GlassCard';

// ── Icons ─────────────────────────────────────────────────────────────────────

function ClipboardIcon({ className }: { className?: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
      <path d="M9 14l2 2 4-4" />
    </svg>
  );
}

function CodeBracketsIcon({ className }: { className?: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <polyline points="16 18 22 12 16 6" />
      <polyline points="8 6 2 12 8 18" />
    </svg>
  );
}

function PaintbrushIcon({ className }: { className?: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M18.37 2.63 14 7l-1.59-1.59a2 2 0 0 0-2.82 0L8 7l9 9 1.59-1.59a2 2 0 0 0 0-2.82L17 10l4.37-4.37a2.12 2.12 0 1 0-3-3Z" />
      <path d="M9 8c-2 3-4 3.5-7 4l8 10c2-1 6-5 6-7" />
      <path d="M14.5 17.5 4.5 15" />
    </svg>
  );
}

function LightningIcon({ className }: { className?: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  );
}

function ShieldCheckIcon({ className }: { className?: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

// ── Agent data ────────────────────────────────────────────────────────────────

const AGENTS = [
  {
    icon: ClipboardIcon,
    iconColor: 'text-purple-400',
    name: 'Project Manager',
    model: 'Claude Opus',
    description: 'Breaks your request into tasks and delegates to specialists',
  },
  {
    icon: CodeBracketsIcon,
    iconColor: 'text-sky-400',
    name: 'Liquid Specialist',
    model: 'Claude Sonnet',
    description: 'Writes Shopify templates, sections, and schema blocks',
  },
  {
    icon: PaintbrushIcon,
    iconColor: 'text-pink-400',
    name: 'CSS Specialist',
    model: 'Claude Sonnet',
    description: 'Creates responsive styles, animations, and custom properties',
  },
  {
    icon: LightningIcon,
    iconColor: 'text-amber-400',
    name: 'JS Specialist',
    model: 'Claude Sonnet',
    description: 'Builds interactive features, scroll effects, and dynamic behavior',
  },
  {
    icon: ShieldCheckIcon,
    iconColor: 'text-green-400',
    name: 'Review Agent',
    model: 'GPT-4o',
    description: 'Validates every line of generated code before it reaches you',
  },
] as const;

const EXAMPLE_PROMPTS = [
  'Add a hero banner with scroll-reveal animations',
  'Create a product recommendations section below the cart',
  'Make the header sticky with a transparent-to-solid scroll effect',
];

const IDE_FEATURES = ['Live Preview', 'Version History', 'Design Tokens', 'Diagnostics'];

// ── Component ─────────────────────────────────────────────────────────────────

interface MeetAgentsStepProps {
  projectId: string | null;
  onComplete: () => void;
}

export function MeetAgentsStep({ projectId, onComplete }: MeetAgentsStepProps) {
  return (
    <div className="flex flex-col items-center text-center max-w-2xl mx-auto">
      {/* Heading */}
      <motion.h2
        className="text-2xl sm:text-3xl font-bold text-stone-900 dark:text-white"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
      >
        Meet your AI agents
      </motion.h2>

      {/* Subtitle */}
      <motion.p
        className="mt-3 text-sm ide-text-muted leading-relaxed max-w-lg"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.05, ease: 'easeOut' }}
      >
        Five specialized agents work together to build your theme. Here&apos;s your team.
      </motion.p>

      {/* Agent cards grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-8 w-full">
        {AGENTS.map((agent, i) => (
          <motion.div
            key={agent.name}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1 + i * 0.07, ease: 'easeOut' }}
          >
            <GlassCard padding="sm" hoverScale theme="light">
              <div className="flex flex-col items-start gap-2 text-left">
                <div className={agent.iconColor}>
                  <agent.icon />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-stone-900 dark:text-white">{agent.name}</h3>
                  <span className="text-[10px] font-medium ide-text-muted">{agent.model}</span>
                </div>
                <p className="text-xs ide-text-muted leading-relaxed">{agent.description}</p>
              </div>
            </GlassCard>
          </motion.div>
        ))}
      </div>

      {/* Quick tips */}
      <motion.div
        className="mt-6 w-full bg-stone-100/50 dark:bg-white/[0.03] border border-stone-200 dark:border-white/10 rounded-xl p-4 text-left"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.5, ease: 'easeOut' }}
      >
        <p className="text-xs font-medium ide-text-2 mb-3">Try asking...</p>
        <div className="space-y-2">
          {EXAMPLE_PROMPTS.map((prompt) => (
            <p
              key={prompt}
              className="text-xs font-mono text-emerald-400/80 bg-stone-100/50 dark:bg-white/[0.03] rounded-lg px-3 py-2"
            >
              &ldquo;{prompt}&rdquo;
            </p>
          ))}
        </div>
      </motion.div>

      {/* IDE feature badges */}
      <motion.div
        className="mt-4 flex flex-wrap items-center justify-center gap-2"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.6 }}
      >
        {IDE_FEATURES.map((feature) => (
          <span
            key={feature}
            className="px-3 py-1.5 rounded-full bg-stone-100 dark:bg-white/5 border border-stone-200 dark:border-white/10 text-[11px] ide-text-muted"
          >
            {feature}
          </span>
        ))}
      </motion.div>

      {/* CTA */}
      <motion.div
        className="mt-8 flex flex-col items-center"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.7, ease: 'easeOut' }}
      >
        <button
          type="button"
          onClick={onComplete}
          className="inline-flex items-center gap-2 px-8 py-3 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-white font-medium text-sm transition-all shadow-[0_0_20px_oklch(0.696_0.17_162_/_0.3)] hover:shadow-[0_0_30px_oklch(0.696_0.17_162_/_0.5)]"
        >
          {projectId ? 'Open IDE' : 'Open IDE'}
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
        <p className="mt-3 text-xs ide-text-quiet">You can always revisit this from Settings</p>
      </motion.div>
    </div>
  );
}
