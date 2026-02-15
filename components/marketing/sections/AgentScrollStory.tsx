'use client';

import { useRef, useState, useCallback } from 'react';
import {
  motion,
  useScroll,
  useTransform,
  useMotionValueEvent,
  AnimatePresence,
} from 'framer-motion';
import { PixelAccent } from '@/components/marketing/interactions/PixelAccent';

/* ------------------------------------------------------------------ */
/*  Types & data                                                       */
/* ------------------------------------------------------------------ */

interface Feature {
  title: string;
  description: string;
}

interface WorkflowStep {
  number: string;
  title: string;
  description: string;
  cta: string;
  color: string;         // accent color for the step number
  dotClass: string;       // Tailwind bg class for the dot
  features: Feature[];
}

const STEPS: WorkflowStep[] = [
  {
    number: '01',
    title: 'Understand',
    description:
      'Describe what you need in plain language. Synapse reads your prompt, scans your existing theme files, and maps the full dependency graph — so every edit is context-aware from the start.',
    cta: 'Try a prompt',
    color: 'text-stone-500',
    dotClass: 'bg-stone-400',
    features: [
      {
        title: 'Natural Language Input',
        description:
          'Write in plain English. "Add an animated hero section with a countdown timer" is all it takes.',
      },
      {
        title: 'Context-Aware Scanning',
        description:
          'Synapse indexes every template, stylesheet, and script to understand file relationships before making a single change.',
      },
      {
        title: 'Design System Alignment',
        description:
          'Your design tokens, brand colors, and typography rules are baked into every decision the agents make.',
      },
    ],
  },
  {
    number: '02',
    title: 'Orchestrate',
    description:
      'A PM agent decomposes your request into scoped tasks, detects dependencies between files, and assigns the right specialist agent to each job — all before a single line of code is written.',
    cta: 'See it plan',
    color: 'text-blue-500',
    dotClass: 'bg-blue-500',
    features: [
      {
        title: 'Task Decomposition',
        description:
          'Complex requests get broken into atomic tasks: template edits, script additions, and style changes — each scoped to a single file.',
      },
      {
        title: 'Dependency Mapping',
        description:
          'The PM detects which files reference each other and sequences tasks so nothing builds on stale context.',
      },
      {
        title: 'Smart File Selection',
        description:
          'Only the files relevant to your request are loaded into context — keeping agents fast and focused.',
      },
    ],
  },
  {
    number: '03',
    title: 'Build',
    description:
      'Three language specialists — Liquid, JavaScript, and CSS — write production-ready code in parallel. Each agent understands its domain deeply and respects the boundaries of the others.',
    cta: 'Watch them work',
    color: 'text-green-500',
    dotClass: 'bg-green-500',
    features: [
      {
        title: 'Liquid Agent',
        description:
          'Templates, sections, snippets, and schema. Handles Shopify\'s templating language with deep knowledge of objects, filters, and tags.',
      },
      {
        title: 'JavaScript Agent',
        description:
          'Interactive behaviors, DOM manipulation, and event handling. Writes clean, performant scripts that work across browsers.',
      },
      {
        title: 'CSS Agent',
        description:
          'Styles, responsive breakpoints, and animations. Generates maintainable CSS that follows your design system\'s token conventions.',
      },
    ],
  },
  {
    number: '04',
    title: 'Validate & Ship',
    description:
      'A dedicated review agent inspects every change for quality, consistency, and correctness. When everything passes, deploy to your store with a single click.',
    cta: 'Ship your theme',
    color: 'text-purple-500',
    dotClass: 'bg-purple-500',
    features: [
      {
        title: 'Quality Checks',
        description:
          'Syntax validation, Liquid compliance, and performance heuristics catch issues before they reach your store.',
      },
      {
        title: 'Consistency Validation',
        description:
          'Cross-file checks ensure naming conventions, design tokens, and code patterns stay uniform across your entire theme.',
      },
      {
        title: 'One-Click Deploy',
        description:
          'Preview on a live rendering of your store, then push to production. Version control and instant rollback are built in.',
      },
    ],
  },
];

/* ------------------------------------------------------------------ */
/*  Accordion Feature Item                                             */
/* ------------------------------------------------------------------ */

function FeatureItem({
  feature,
  isOpen,
  onToggle,
  index,
}: {
  feature: Feature;
  isOpen: boolean;
  onToggle: () => void;
  index: number;
}) {
  return (
    <motion.div
      className="border-b border-stone-200/60 dark:border-white/10 last:border-b-0"
      initial={{ opacity: 0, y: 10 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-20px' }}
      transition={{ duration: 0.4, delay: index * 0.08 }}
    >
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between py-4 text-left group"
        aria-expanded={isOpen}
      >
        <div className="flex items-center gap-3">
          <span
            className={`w-1.5 h-1.5 rounded-full shrink-0 transition-transform duration-300 ${
              isOpen ? 'scale-125 bg-accent' : 'bg-stone-300 dark:bg-white/20'
            }`}
          />
          <span
            className={`text-[15px] font-medium transition-colors duration-200 ${
              isOpen
                ? 'text-stone-900 dark:text-white'
                : 'text-stone-600 dark:text-white/60 group-hover:text-stone-900 dark:group-hover:text-white'
            }`}
          >
            {feature.title}
          </span>
        </div>
        <motion.span
          className="text-stone-400 dark:text-white/30 text-sm shrink-0 ml-4"
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.2 }}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path
              d="M2.5 4.5L6 8L9.5 4.5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
            className="overflow-hidden"
          >
            <p className="pb-4 pl-[21px] text-[13px] leading-relaxed text-stone-500 dark:text-white/45 max-w-sm">
              {feature.description}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Animated illustration per step                                     */
/* ------------------------------------------------------------------ */

function StepIllustration({ step, progress }: { step: WorkflowStep; progress: number }) {
  const opacity = Math.min(1, Math.max(0, progress * 3));

  if (step.number === '01') {
    // Prompt input illustration
    return (
      <motion.div
        className="relative w-full max-w-md mx-auto"
        style={{ opacity }}
      >
        <div className="rounded-xl border border-stone-200/60 dark:border-white/10 bg-white dark:bg-white/[0.03] p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-2 h-2 rounded-full bg-stone-300 dark:bg-white/20" />
            <div className="text-[11px] font-mono text-stone-400 dark:text-white/30 tracking-wider uppercase">
              Prompt
            </div>
          </div>
          <motion.div
            className="space-y-2"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.3 }}
          >
            <div className="h-3 bg-stone-100 dark:bg-white/5 rounded w-full" />
            <div className="h-3 bg-stone-100 dark:bg-white/5 rounded w-4/5" />
            <div className="h-3 bg-accent/20 rounded w-3/5" />
          </motion.div>
          <motion.div
            className="mt-4 flex items-center gap-2"
            initial={{ opacity: 0, y: 5 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, delay: 0.5 }}
          >
            <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
            <span className="text-[11px] text-accent font-medium">Analyzing context...</span>
          </motion.div>
        </div>
      </motion.div>
    );
  }

  if (step.number === '02') {
    // Task breakdown illustration
    return (
      <motion.div
        className="relative w-full max-w-md mx-auto"
        style={{ opacity }}
      >
        <div className="rounded-xl border border-stone-200/60 dark:border-white/10 bg-white dark:bg-white/[0.03] p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-2 h-2 rounded-full bg-blue-500" />
            <div className="text-[11px] font-mono text-stone-400 dark:text-white/30 tracking-wider uppercase">
              PM Agent
            </div>
          </div>
          {['hero-section.liquid', 'hero-animations.js', 'hero-styles.css'].map(
            (file, i) => (
              <motion.div
                key={file}
                className="flex items-center gap-3 py-2 border-b border-stone-100/60 dark:border-white/5 last:border-b-0"
                initial={{ opacity: 0, x: -10 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.35, delay: 0.2 + i * 0.12 }}
              >
                <div
                  className={`w-1 h-1 rounded-full ${
                    i === 0
                      ? 'bg-green-500'
                      : i === 1
                        ? 'bg-amber-500'
                        : 'bg-pink-500'
                  }`}
                />
                <span className="text-[12px] font-mono text-stone-600 dark:text-white/50">
                  {file}
                </span>
                <motion.span
                  className="ml-auto text-[10px] font-medium text-blue-500 bg-blue-50 dark:bg-blue-500/10 rounded px-1.5 py-0.5"
                  initial={{ scale: 0 }}
                  whileInView={{ scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.25, delay: 0.4 + i * 0.12 }}
                >
                  Task {i + 1}
                </motion.span>
              </motion.div>
            )
          )}
        </div>
      </motion.div>
    );
  }

  if (step.number === '03') {
    // Parallel agents illustration
    const agents = [
      { name: 'Liquid', color: 'bg-green-500', borderColor: 'border-green-400/30' },
      { name: 'JS', color: 'bg-amber-500', borderColor: 'border-amber-400/30' },
      { name: 'CSS', color: 'bg-pink-500', borderColor: 'border-pink-400/30' },
    ];
    return (
      <motion.div
        className="relative w-full max-w-md mx-auto"
        style={{ opacity }}
      >
        <div className="grid grid-cols-3 gap-3">
          {agents.map((agent, i) => (
            <motion.div
              key={agent.name}
              className={`rounded-xl border ${agent.borderColor} bg-white dark:bg-white/[0.03] p-4 shadow-sm`}
              initial={{ opacity: 0, y: 15 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.1 }}
            >
              <div className="flex items-center gap-1.5 mb-3">
                <div className={`w-1.5 h-1.5 rounded-full ${agent.color}`} />
                <span className="text-[11px] font-semibold text-stone-700 dark:text-white/70">
                  {agent.name}
                </span>
              </div>
              {/* Fake code lines */}
              <div className="space-y-1.5">
                {[1, 2, 3].map((line) => (
                  <motion.div
                    key={line}
                    className="h-1.5 bg-stone-100 dark:bg-white/5 rounded"
                    style={{ width: `${60 + Math.random() * 35}%` }}
                    initial={{ scaleX: 0 }}
                    whileInView={{ scaleX: 1 }}
                    viewport={{ once: true }}
                    transition={{
                      duration: 0.5,
                      delay: 0.3 + i * 0.1 + line * 0.08,
                      ease: [0.4, 0, 0.2, 1],
                    }}
                  />
                ))}
              </div>
            </motion.div>
          ))}
        </div>
      </motion.div>
    );
  }

  // Step 04 — review & deploy
  return (
    <motion.div
      className="relative w-full max-w-md mx-auto"
      style={{ opacity }}
    >
      <div className="rounded-xl border border-stone-200/60 dark:border-white/10 bg-white dark:bg-white/[0.03] p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-2 h-2 rounded-full bg-purple-500" />
          <div className="text-[11px] font-mono text-stone-400 dark:text-white/30 tracking-wider uppercase">
            Review Agent
          </div>
        </div>
        {['Syntax validation', 'Design token compliance', 'Performance check'].map(
          (check, i) => (
            <motion.div
              key={check}
              className="flex items-center gap-3 py-2"
              initial={{ opacity: 0, x: -10 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.35, delay: 0.2 + i * 0.15 }}
            >
              <motion.span
                className="text-green-500 text-[13px] shrink-0"
                initial={{ scale: 0 }}
                whileInView={{ scale: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.3, delay: 0.4 + i * 0.15 }}
              >
                ✓
              </motion.span>
              <span className="text-[13px] text-stone-600 dark:text-white/50">
                {check}
              </span>
            </motion.div>
          )
        )}
        <motion.div
          className="mt-4 pt-3 border-t border-stone-100 dark:border-white/5 flex items-center justify-center gap-2"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.4, delay: 0.7 }}
        >
          <div className="w-2 h-2 rounded-full bg-green-500" />
          <span className="text-[12px] font-medium text-green-600 dark:text-green-400">
            Ready to deploy
          </span>
        </motion.div>
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Workflow step card                                                  */
/* ------------------------------------------------------------------ */

function WorkflowStepCard({
  step,
  index,
  progress,
}: {
  step: WorkflowStep;
  index: number;
  progress: number;
}) {
  const [openFeature, setOpenFeature] = useState<number>(0);

  const handleToggle = useCallback(
    (featureIndex: number) => {
      setOpenFeature((prev) => (prev === featureIndex ? -1 : featureIndex));
    },
    []
  );

  return (
    <div className="relative">
      {/* Step content — two column layout */}
      <motion.div
        className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-16 items-start"
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-60px' }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      >
        {/* Left: Number, title, description, CTA */}
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <span className={`w-1.5 h-1.5 rounded-full ${step.dotClass}`} />
            <span
              className={`text-[13px] font-mono font-medium tracking-wider ${step.color}`}
            >
              {step.number}
            </span>
          </div>

          <h3 className="text-3xl md:text-4xl lg:text-[2.75rem] font-medium text-stone-900 dark:text-white tracking-[-0.02em] leading-[1.1]">
            {step.title}
          </h3>

          <p className="text-base md:text-lg text-stone-500 dark:text-white/50 leading-relaxed max-w-lg">
            {step.description}
          </p>
        </div>

        {/* Right: Accordion features */}
        <div className="lg:pt-12">
          {step.features.map((feature, i) => (
            <FeatureItem
              key={feature.title}
              feature={feature}
              isOpen={openFeature === i}
              onToggle={() => handleToggle(i)}
              index={i}
            />
          ))}
        </div>
      </motion.div>

      {/* Illustration below the text */}
      <motion.div
        className="mt-10 mb-4"
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-40px' }}
        transition={{ duration: 0.5, delay: 0.15 }}
      >
        <StepIllustration step={step} progress={progress} />
      </motion.div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Timeline connector                                                 */
/* ------------------------------------------------------------------ */

function TimelineConnector({ progress }: { progress: number }) {
  return (
    <div className="flex justify-center py-8 lg:py-12">
      <div className="relative w-px h-16 lg:h-24 bg-stone-200 dark:bg-white/10 overflow-hidden">
        {/* Animated fill based on scroll progress */}
        <motion.div
          className="absolute inset-x-0 top-0 bg-accent/40"
          style={{ height: `${Math.min(100, progress * 100)}%` }}
        />
        {/* Traveling dot */}
        <motion.div
          className="absolute left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-accent"
          style={{
            top: `${Math.min(90, progress * 100)}%`,
            opacity: progress > 0.05 ? 1 : 0,
          }}
        />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main scroll story component                                        */
/* ------------------------------------------------------------------ */

export function AgentScrollStory() {
  const sectionRef = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ['start end', 'end start'],
  });

  const [scrollProgress, setScrollProgress] = useState(0);

  useMotionValueEvent(scrollYProgress, 'change', (v) => {
    setScrollProgress(v);
  });

  // Derive per-step progress (each step occupies ~25% of the scroll)
  const getStepProgress = (index: number): number => {
    const stepStart = index * 0.25;
    const stepEnd = stepStart + 0.25;
    if (scrollProgress < stepStart) return 0;
    if (scrollProgress > stepEnd) return 1;
    return (scrollProgress - stepStart) / 0.25;
  };

  // Overall progress line for the vertical timeline
  const lineProgress = useTransform(scrollYProgress, [0.05, 0.9], [0, 1]);
  const [lineValue, setLineValue] = useState(0);
  useMotionValueEvent(lineProgress, 'change', (v) => setLineValue(v));

  return (
    <section
      ref={sectionRef}
      data-navbar-theme="light"
      className="relative bg-[#fafaf9] dark:bg-[#0a0a0a] py-20 md:py-32 overflow-hidden"
      aria-label="Agent workflow: four-step scroll story"
    >
      {/* Content frame lines */}
      <div
        className="absolute inset-0 max-w-6xl mx-auto pointer-events-none"
        aria-hidden="true"
      >
        <div className="relative h-full">
          <div className="absolute top-0 bottom-0 left-0 w-px bg-stone-200 dark:bg-white/10" />
          <div className="absolute top-0 bottom-0 right-0 w-px bg-stone-200 dark:bg-white/10" />
        </div>
      </div>

      <div className="relative max-w-6xl mx-auto px-8 md:px-10">
        {/* Section header */}
        <motion.div
          className="mb-16 lg:mb-24"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        >
          <span className="inline-block rounded-full border border-stone-200 dark:border-white/10 bg-stone-100 dark:bg-white/5 px-3 py-1 text-[11px] font-medium tracking-widest uppercase text-stone-500 dark:text-white/50 mb-4">
            ARCHITECTURE
          </span>
          <h2 className="text-4xl md:text-5xl lg:text-6xl font-medium text-stone-900 dark:text-white tracking-[-0.02em]">
            From prompt to{' '}
            <PixelAccent>production</PixelAccent>
          </h2>
          <p className="text-lg text-stone-500 dark:text-white/50 mt-6 max-w-xl">
            Four phases. Five AI agents. Every change validated before it
            reaches your store.
          </p>
        </motion.div>

        {/* Steps */}
        <div className="space-y-0">
          {STEPS.map((step, index) => (
            <div key={step.number}>
              <WorkflowStepCard
                step={step}
                index={index}
                progress={getStepProgress(index)}
              />
              {index < STEPS.length - 1 && (
                <TimelineConnector
                  progress={getStepProgress(index)}
                />
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
