'use client';

import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import { CodeEditorMockup } from '../mockups/CodeEditorMockup';
import { AgentPanelMockup } from '../mockups/AgentPanelMockup';
import { SyncFlowMockup } from '../mockups/SyncFlowMockup';
import { StaggerText } from '@/components/marketing/interactions/StaggerText';

const rows = [
  {
    label: 'AI ENGINE',
    labelColor: 'text-sky-500',
    headline: 'Watch AI write production-ready code',
    description:
      'Three specialized agents write, validate, and test Liquid templates in real-time. Context-aware, type-safe, and optimized for your theme.',
    Mockup: CodeEditorMockup,
  },
  {
    label: 'ORCHESTRATION',
    labelColor: 'text-violet-400',
    headline: 'Three agents. One vision.',
    description:
      "A code agent writes. A design agent validates. A QA agent tests. All working in parallel, all understanding your theme's full context.",
    Mockup: AgentPanelMockup,
  },
  {
    label: 'INTEGRATION',
    labelColor: 'text-pink-400',
    headline: 'Deploy in one click',
    description:
      'Connect your Shopify store, sync themes, preview changes, and deploy \u2014 all without leaving the editor.',
    Mockup: SyncFlowMockup,
  },
];

function FeatureRow({
  label,
  headline,
  description,
  Mockup,
  index,
}: {
  label: string;
  headline: string;
  description: string;
  Mockup: React.ComponentType;
  index: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-80px' });

  const isReversed = index === 1;

  return (
    <motion.div
      ref={ref}
      className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center"
      initial={{ opacity: 0, y: 30 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.6, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className={isReversed ? 'lg:order-last' : undefined}>
        <span className="inline-block rounded-full border border-stone-200 dark:border-white/10 bg-stone-100 dark:bg-white/5 px-3 py-1 text-[11px] font-medium tracking-widest uppercase text-stone-500 dark:text-white/50 mb-4">
          {label}
        </span>
        <h3 className="text-2xl md:text-3xl font-medium text-stone-900 dark:text-white leading-tight">
          {headline}
        </h3>
        <p className="text-base md:text-lg text-stone-500 dark:text-white/50 mt-4 leading-relaxed">
          {description}
        </p>
      </div>

      <div className="transition-transform duration-300 hover:scale-[1.02]">
        <Mockup />
      </div>
    </motion.div>
  );
}

export function FeatureShowcase() {
  return (
    <section
      className="bg-[#fafaf9] dark:bg-[#111] canvas-grid py-16 md:py-24"
      data-navbar-theme="light"
    >
      <div className="max-w-6xl mx-auto px-6">
        <StaggerText
          as="h2"
          className="text-3xl md:text-4xl lg:text-5xl font-medium text-stone-900 dark:text-white tracking-[-0.02em] text-left mb-20 md:mb-32"
        >
          Built for speed. Designed for craft.
        </StaggerText>

        <div className="space-y-24 md:space-y-32">
          {rows.map((row, i) => (
            <FeatureRow
              key={row.label}
              label={row.label}
              headline={row.headline}
              description={row.description}
              Mockup={row.Mockup}
              index={i}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
