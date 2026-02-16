'use client';

import { useRef, useState, useCallback, useEffect } from 'react';
import {
  motion,
  useScroll,
  useTransform,
  useMotionValueEvent,
  useSpring,
  useInView,
  AnimatePresence,
  type MotionValue,
} from 'framer-motion';
import { PixelAccent } from '@/components/marketing/interactions/PixelAccent';

/* ------------------------------------------------------------------ */
/*  Reduced motion + desktop detection                                 */
/* ------------------------------------------------------------------ */

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const handler = () => setReduced(mq.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return reduced;
}

function useIsDesktop(): boolean {
  const [desktop, setDesktop] = useState(true);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    setDesktop(mq.matches);
    const handler = () => setDesktop(mq.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return desktop;
}

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
  glowColor: string;     // rgba for text-shadow glow when active
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
    glowColor: 'rgba(120,113,108,0.4)',
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
    glowColor: 'rgba(59,130,246,0.4)',
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
    glowColor: 'rgba(34,197,94,0.4)',
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
    glowColor: 'rgba(168,85,247,0.4)',
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
/*  Travel path tier configs                                           */
/* ------------------------------------------------------------------ */

interface TierConfig {
  dotSize: number;
  tailHeight: number;
  tailOpacity: number;
  haloSize: number;
  haloBlur: number;
  haloOpacity: number;
  strokeWidth: number;
  dotOpacity: number;
  hasRing: boolean;
  hasPlasma: boolean;
}

const TIER_CONFIGS: TierConfig[] = [
  /* Tier 0 — small muted spark */
  { dotSize: 6, tailHeight: 12, tailOpacity: 0.15, haloSize: 0, haloBlur: 0, haloOpacity: 0, strokeWidth: 1, dotOpacity: 0.7, hasRing: false, hasPlasma: false },
  /* Tier 1 — bright signal with comet streak */
  { dotSize: 8, tailHeight: 28, tailOpacity: 0.3, haloSize: 16, haloBlur: 4, haloOpacity: 0.2, strokeWidth: 1.5, dotOpacity: 1, hasRing: false, hasPlasma: false },
  /* Tier 2 — blazing beam with plasma halo */
  { dotSize: 12, tailHeight: 48, tailOpacity: 0.5, haloSize: 24, haloBlur: 8, haloOpacity: 0.4, strokeWidth: 2, dotOpacity: 1, hasRing: true, hasPlasma: true },
];

const CONNECTOR_PATH = 'M20 0 Q18 24, 20 48 T20 96';
const CONNECTOR_HEIGHT = 96;

/* ------------------------------------------------------------------ */
/*  Hidden SVG filter for plasma distortion (tier 2)                   */
/* ------------------------------------------------------------------ */

function PlasmaFilterSVG({ reducedMotion }: { reducedMotion: boolean }) {
  return (
    <svg
      width="0"
      height="0"
      className="absolute"
      aria-hidden="true"
    >
      <defs>
        <filter id="plasma" x="-50%" y="-50%" width="200%" height="200%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.03"
            numOctaves={3}
            seed={0}
          >
            {!reducedMotion && (
              <animate
                attributeName="seed"
                from="0"
                to="1000"
                dur="10s"
                repeatCount="indefinite"
              />
            )}
          </feTurbulence>
          <feDisplacementMap in="SourceGraphic" scale={6} />
          <feGaussianBlur stdDeviation={2} />
          <feComposite in="SourceGraphic" operator="over" />
        </filter>
      </defs>
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/*  Background: dot grid + gradient mesh                               */
/* ------------------------------------------------------------------ */

function BackgroundEffects({
  scrollYProgress,
  reducedMotion,
}: {
  scrollYProgress: MotionValue<number>;
  reducedMotion: boolean;
}) {
  const dotOpacity = useTransform(scrollYProgress, [0, 0.08], [0, 1]);

  /* Gradient mesh layer positions — scroll-driven drift */
  const layer1Y = useTransform(scrollYProgress, [0, 1], [0, 120]);
  const layer2X = useTransform(scrollYProgress, [0, 1], [0, 80]);
  const layer2Y = useTransform(scrollYProgress, [0, 1], [0, -60]);
  const layer3Y = useTransform(scrollYProgress, [0, 1], [0, -100]);

  /* Dot-grid mask: larger dots intersected with vignette ellipse */
  const dotMask = [
    'radial-gradient(circle 1.5px at center, black 1.5px, transparent 1.5px)',
    'radial-gradient(ellipse 100% 80% at center, black 60%, transparent 100%)',
  ].join(', ');

  return (
    <div
      className="absolute inset-0 pointer-events-none overflow-hidden z-0"
      aria-hidden="true"
    >
      {/* Base dot grid — subtle fallback layer */}
      <motion.div
        className="absolute inset-0 dot-grid"
        style={{
          opacity: reducedMotion ? 0.5 : dotOpacity,
          maskImage:
            'radial-gradient(ellipse 100% 80% at center, black 60%, transparent 100%)',
          WebkitMaskImage:
            'radial-gradient(ellipse 100% 80% at center, black 60%, transparent 100%)',
        }}
      />

      {/* Gradient mesh — masked by dot grid pattern so gradients show through dots */}
      <motion.div
        className="absolute inset-0"
        style={{
          opacity: reducedMotion ? 0.6 : dotOpacity,
          maskImage: dotMask,
          WebkitMaskImage: dotMask,
          maskSize: '24px 24px, 100% 100%',
          WebkitMaskSize: '24px 24px, 100% 100%',
          maskComposite: 'intersect',
          WebkitMaskComposite: 'source-in' as string,
        }}
      >
        {/* Layer 1: warm stone (always rendered) */}
        <motion.div
          className="absolute inset-0 opacity-[0.8] dark:opacity-[0.9]"
          style={{
            y: reducedMotion ? 0 : layer1Y,
            background:
              'radial-gradient(circle 600px at 50% 20%, rgb(168,162,158), transparent)',
            willChange: 'transform',
          }}
        />

        {/* Layer 2: blue (desktop only) */}
        <motion.div
          className="absolute inset-0 opacity-[0.7] dark:opacity-[0.85] hidden md:block"
          style={{
            x: reducedMotion ? 0 : layer2X,
            y: reducedMotion ? 0 : layer2Y,
            background:
              'radial-gradient(circle 500px at 30% 50%, rgb(59,130,246), transparent)',
            willChange: 'transform',
          }}
        />

        {/* Layer 3: purple (desktop only) */}
        <motion.div
          className="absolute inset-0 opacity-[0.7] dark:opacity-[0.85] hidden md:block"
          style={{
            y: reducedMotion ? 0 : layer3Y,
            background:
              'radial-gradient(circle 500px at 70% 80%, rgb(168,85,247), transparent)',
            willChange: 'transform',
          }}
        />
      </motion.div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  SVG Travel Path — power-up progression                             */
/* ------------------------------------------------------------------ */

function SVGTravelPath({
  progress,
  tier,
  reducedMotion,
}: {
  progress: number;
  tier: number;
  reducedMotion: boolean;
}) {
  const config = TIER_CONFIGS[tier];
  const connectorRef = useRef<HTMLDivElement>(null);
  const inView = useInView(connectorRef, { margin: '100px' });

  const visible = !reducedMotion && progress > 0.05 && progress < 0.95;
  const dotTop = Math.min(90, Math.max(0, progress * 100));

  return (
    <div
      ref={connectorRef}
      className="flex justify-center py-8 lg:py-12 relative z-[2]"
    >
      <div
        className="relative"
        style={{ width: 40, height: CONNECTOR_HEIGHT }}
      >
        {/* SVG track + draw-on stroke */}
        <svg
          viewBox="0 0 40 96"
          className="absolute inset-0 w-full h-full"
          fill="none"
          aria-hidden="true"
        >
          {/* Background track */}
          <path
            d={CONNECTOR_PATH}
            stroke="currentColor"
            className="text-stone-200 dark:text-white/10"
            strokeWidth="1"
          />
          {/* Draw-on path */}
          <path
            d={CONNECTOR_PATH}
            stroke="#28CD56"
            strokeWidth={config.strokeWidth}
            pathLength={1}
            strokeDasharray="1"
            strokeDashoffset={reducedMotion ? 0 : 1 - progress}
            strokeLinecap="round"
          />
        </svg>

        {/* ── Traveling dot assembly ────────────────────────── */}
        {(visible || reducedMotion) && (
          <>
            {/* Glow halo (furthest back) */}
            {config.haloSize > 0 && (
              <div
                className="absolute left-1/2 pointer-events-none"
                style={{
                  width: config.haloSize,
                  height: config.haloSize,
                  top: reducedMotion ? '90%' : `${dotTop}%`,
                  transform: 'translate(-50%, -50%)',
                  background: `rgba(40, 205, 86, ${config.haloOpacity})`,
                  borderRadius: '50%',
                  filter:
                    config.hasPlasma && inView && !reducedMotion
                      ? 'url(#plasma)'
                      : `blur(${config.haloBlur}px)`,
                  opacity: visible ? 1 : reducedMotion ? 0.6 : 0,
                  transition: 'opacity 0.3s',
                }}
              />
            )}

            {/* Comet tail (gradient pill trailing behind dot — above it) */}
            {!reducedMotion && config.tailHeight > 0 && (
              <div
                className="absolute left-1/2 pointer-events-none"
                style={{
                  width: config.dotSize,
                  height: config.tailHeight,
                  top: `${dotTop}%`,
                  transform: 'translate(-50%, -100%)',
                  background: `radial-gradient(ellipse 100% 200% at 50% 100%, rgba(40,205,86,${config.tailOpacity}), transparent 70%)`,
                  borderRadius: '50%',
                  filter: tier === 2 ? 'blur(2px)' : undefined,
                  opacity: visible ? 1 : 0,
                  transition: 'opacity 0.3s',
                }}
              />
            )}

            {/* Main dot */}
            <div
              className="absolute left-1/2 pointer-events-none"
              style={{
                width: config.dotSize,
                height: config.dotSize,
                top: reducedMotion ? '90%' : `${dotTop}%`,
                transform: 'translate(-50%, -50%)',
                background: '#28CD56',
                borderRadius: '50%',
                opacity: config.dotOpacity,
                boxShadow: config.hasRing
                  ? '0 0 0 3px rgba(40,205,86,0.3)'
                  : undefined,
              }}
            />
          </>
        )}
      </div>
    </div>
  );
}

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
/*  Glass card wrapper — clips shimmer + all internal animations       */
/* ------------------------------------------------------------------ */

function GlassCard({
  children,
  isActive,
  className = '',
}: {
  children: React.ReactNode;
  isActive: boolean;
  className?: string;
}) {
  return (
    <div
      className={`relative rounded-xl border overflow-hidden transition-all duration-500
        bg-[#f5f5f4] dark:bg-[#1a1a1a]
        ${isActive
          ? 'border-stone-300 dark:border-white/15 shadow-lg shadow-stone-300/30 dark:shadow-green-900/20'
          : 'border-stone-200/60 dark:border-white/10 shadow-sm'}
        ${className}`}
      style={{ transform: 'translateZ(0)' }}
    >
      {children}

      {/* Shimmer sweep + outer glow pulse on active */}
      {isActive && (
        <div className="absolute inset-0 pointer-events-none rounded-xl overflow-hidden">
          <div
            className="absolute inset-y-0"
            style={{
              width: 120,
              background:
                'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.06) 50%, transparent 100%)',
              animation: 'card-shimmer 3s ease-in-out infinite',
            }}
          />
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Typewriter hook for prompt animation                               */
/* ------------------------------------------------------------------ */

const PROMPT_TEXT = 'Add an animated hero section with a countdown timer';

function useTypewriter(text: string, isActive: boolean, speed = 35) {
  const [displayed, setDisplayed] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!isActive) {
      setDisplayed('');
      setDone(false);
      return;
    }
    let i = 0;
    const interval = setInterval(() => {
      i++;
      setDisplayed(text.slice(0, i));
      if (i >= text.length) {
        clearInterval(interval);
        setDone(true);
      }
    }, speed);
    return () => clearInterval(interval);
  }, [isActive, text, speed]);

  return { displayed, done };
}

/* ------------------------------------------------------------------ */
/*  Animated illustration per step — advanced animations               */
/* ------------------------------------------------------------------ */

const PM_PLANNING_LINES = [
  'Understanding task...',
  'Grepping needed context...',
  'Building plan & blockers...',
  'Assigning parallel work...',
];

const TASK_FILES = [
  { name: 'hero-section.liquid', color: 'bg-green-500' },
  { name: 'hero-animations.js', color: 'bg-amber-500' },
  { name: 'hero-styles.css', color: 'bg-pink-500' },
];

const AGENTS = [
  { name: 'Liquid Agent', color: 'bg-green-500', borderColor: 'border-green-400/30', widths: [85, 70, 55] },
  { name: 'JS Agent', color: 'bg-amber-500', borderColor: 'border-amber-400/30', widths: [75, 90, 60] },
  { name: 'CSS Agent', color: 'bg-pink-500', borderColor: 'border-pink-400/30', widths: [80, 65, 95] },
];

const REVIEW_CHECKS = ['Syntax validation', 'Design token compliance', 'Performance check'];

function StepIllustration({
  step,
  isActive,
  isCompact = false,
}: {
  step: WorkflowStep;
  isActive: boolean;
  isCompact?: boolean;
}) {
  const pad = isCompact ? 'p-3' : 'p-5';
  const labelSize = isCompact ? 'text-[9px]' : 'text-[11px]';
  const contentSize = isCompact ? 'text-[10px]' : 'text-[12px]';
  const dotSize = isCompact ? 'w-1.5 h-1.5' : 'w-2 h-2';

  /* ---- Step 01: Prompt with typewriter ---- */
  if (step.number === '01') {
    return <PromptCard isActive={isActive} pad={pad} labelSize={labelSize} contentSize={contentSize} dotSize={dotSize} />;
  }

  /* ---- Step 02: PM Agent with sequential planning ---- */
  if (step.number === '02') {
    return <PMAgentCard isActive={isActive} pad={pad} labelSize={labelSize} contentSize={contentSize} dotSize={dotSize} isCompact={isCompact} />;
  }

  /* ---- Step 03: Parallel build agents ---- */
  if (step.number === '03') {
    return <BuildAgentsCard isActive={isActive} isCompact={isCompact} labelSize={labelSize} />;
  }

  /* ---- Step 04: Review & deploy ---- */
  return <ReviewCard isActive={isActive} pad={pad} labelSize={labelSize} contentSize={contentSize} dotSize={dotSize} />;
}

/* ---- Prompt card (Step 01) ---- */
function PromptCard({
  isActive,
  pad,
  labelSize,
  contentSize,
  dotSize,
}: {
  isActive: boolean;
  pad: string;
  labelSize: string;
  contentSize: string;
  dotSize: string;
}) {
  const { displayed, done } = useTypewriter(PROMPT_TEXT, isActive);

  return (
    <GlassCard isActive={isActive} className={pad}>
      <div className="flex items-center gap-2 mb-3">
        <div className={`${dotSize} rounded-full bg-stone-300 dark:bg-white/20`} />
        <div className={`${labelSize} font-mono text-stone-400 dark:text-white/30 tracking-wider uppercase`}>
          Prompt
        </div>
      </div>

      <div className={`${contentSize} font-mono text-stone-600 dark:text-white/50 leading-relaxed min-h-[2.5em]`}>
        {isActive ? (
          <>
            {displayed}
            {!done && (
              <span className="inline-block w-[2px] h-[13px] bg-accent animate-pulse ml-0.5 align-text-bottom" />
            )}
          </>
        ) : (
          <span className="text-stone-300 dark:text-white/15">Waiting for input...</span>
        )}
      </div>

      <motion.div
        className="mt-3 flex items-center gap-2"
        animate={{ opacity: done ? 1 : 0, y: done ? 0 : 5 }}
        transition={{ duration: 0.4 }}
      >
        <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
        <span className={`${labelSize} text-accent font-medium`}>Analyzing context...</span>
      </motion.div>
    </GlassCard>
  );
}

/* ---- PM Agent card (Step 02) ---- */
function PMAgentCard({
  isActive,
  pad,
  labelSize,
  contentSize,
  dotSize,
  isCompact,
}: {
  isActive: boolean;
  pad: string;
  labelSize: string;
  contentSize: string;
  dotSize: string;
  isCompact: boolean;
}) {
  const [planStep, setPlanStep] = useState(-1);

  useEffect(() => {
    if (!isActive) { setPlanStep(-1); return; }
    const timers = PM_PLANNING_LINES.map((_, i) =>
      setTimeout(() => setPlanStep(i), 400 + i * 500)
    );
    return () => timers.forEach(clearTimeout);
  }, [isActive]);

  return (
    <GlassCard isActive={isActive} className={pad}>
      <div className="flex items-center gap-2 mb-3">
        <motion.div
          className={`${dotSize} rounded-full bg-blue-500`}
          animate={isActive && planStep < PM_PLANNING_LINES.length - 1 ? { scale: [1, 1.3, 1] } : {}}
          transition={{ duration: 0.8, repeat: Infinity }}
        />
        <div className={`${labelSize} font-mono text-stone-400 dark:text-white/30 tracking-wider uppercase`}>
          PM Agent
        </div>
      </div>

      {/* Planning lines */}
      <div className={`space-y-1 mb-3 ${isCompact ? 'max-h-[3.5rem]' : ''} overflow-hidden`}>
        {PM_PLANNING_LINES.map((line, i) => (
          <motion.div
            key={line}
            className={`${contentSize} font-mono ${i <= planStep ? 'text-blue-500 dark:text-blue-400' : 'text-stone-300 dark:text-white/10'}`}
            animate={{ opacity: i <= planStep ? 1 : 0.3, x: i <= planStep ? 0 : -8 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
          >
            {i <= planStep ? '▸ ' : '  '}{line}
          </motion.div>
        ))}
      </div>

      {/* Task file assignments */}
      {TASK_FILES.map((file, i) => (
        <motion.div
          key={file.name}
          className={`flex items-center gap-2 py-1.5 border-b border-stone-100/60 dark:border-white/5 last:border-b-0`}
          animate={{
            opacity: planStep >= PM_PLANNING_LINES.length - 1 ? 1 : 0,
            x: planStep >= PM_PLANNING_LINES.length - 1 ? 0 : -12,
          }}
          transition={{ duration: 0.35, delay: i * 0.12 }}
        >
          <div className={`w-1 h-1 rounded-full ${file.color}`} />
          <span className={`${contentSize} font-mono text-stone-600 dark:text-white/50`}>
            {file.name}
          </span>
          <motion.span
            className={`ml-auto ${labelSize} font-medium text-blue-500 bg-blue-50 dark:bg-blue-500/10 rounded px-1.5 py-0.5`}
            animate={{ scale: planStep >= PM_PLANNING_LINES.length - 1 ? 1 : 0 }}
            transition={{ duration: 0.25, delay: 0.2 + i * 0.12, type: 'spring', stiffness: 300, damping: 25 }}
          >
            Task {i + 1}
          </motion.span>
        </motion.div>
      ))}
    </GlassCard>
  );
}

/* ---- Build agents card (Step 03) ---- */
function BuildAgentsCard({
  isActive,
  isCompact,
  labelSize,
}: {
  isActive: boolean;
  isCompact: boolean;
  labelSize: string;
}) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!isActive) { setProgress(0); return; }
    const start = Date.now();
    const raf = () => {
      const elapsed = Date.now() - start;
      const p = Math.min(1, elapsed / 2500);
      setProgress(p);
      if (p < 1) requestAnimationFrame(raf);
    };
    const id = requestAnimationFrame(raf);
    return () => cancelAnimationFrame(id);
  }, [isActive]);

  return (
    <div className={`grid grid-cols-3 ${isCompact ? 'gap-1.5' : 'gap-3'} rounded-xl ${isCompact ? 'p-1.5' : 'p-2'} bg-[#f5f5f4] dark:bg-[#1a1a1a]`}>
      {AGENTS.map((agent, i) => (
        <GlassCard
          key={agent.name}
          isActive={isActive}
          className={`${agent.borderColor} ${isCompact ? 'p-2' : 'p-3'}`}
        >
          <div className="flex items-center gap-1.5 mb-2">
            <motion.div
              className={`w-1.5 h-1.5 rounded-full ${agent.color}`}
              animate={isActive ? { scale: [1, 1.2, 1] } : {}}
              transition={{ duration: 0.6, delay: i * 0.15 }}
            />
            <span className={`${labelSize} font-semibold text-stone-700 dark:text-white/70`}>
              {agent.name}
            </span>
          </div>

          {/* Code lines with staggered scaleX */}
          <div className="space-y-1">
            {agent.widths.map((w, li) => (
              <motion.div
                key={li}
                className="h-1.5 bg-stone-100 dark:bg-white/5 rounded origin-left"
                style={{ width: `${w}%` }}
                animate={{ scaleX: isActive ? 1 : 0 }}
                transition={{
                  duration: 0.5,
                  delay: isActive ? 0.3 + i * 0.1 + li * 0.08 : 0,
                  ease: [0.4, 0, 0.2, 1],
                }}
              />
            ))}
          </div>

          {/* Progress bar */}
          <div className={`${isCompact ? 'mt-1.5' : 'mt-2'} h-1 rounded-full bg-stone-100 dark:bg-white/5 overflow-hidden`}>
            <motion.div
              className={`h-full rounded-full ${agent.color}`}
              style={{ width: isActive ? `${progress * 100}%` : '0%' }}
            />
          </div>
        </GlassCard>
      ))}
    </div>
  );
}

/* ---- Review card (Step 04) ---- */
function ReviewCard({
  isActive,
  pad,
  labelSize,
  contentSize,
  dotSize,
}: {
  isActive: boolean;
  pad: string;
  labelSize: string;
  contentSize: string;
  dotSize: string;
}) {
  const [checksComplete, setChecksComplete] = useState(0);

  useEffect(() => {
    if (!isActive) { setChecksComplete(0); return; }
    const timers = REVIEW_CHECKS.map((_, i) =>
      setTimeout(() => setChecksComplete(i + 1), 600 + i * 600)
    );
    return () => timers.forEach(clearTimeout);
  }, [isActive]);

  return (
    <GlassCard isActive={isActive} className={pad}>
      <div className="flex items-center gap-2 mb-3">
        <div className={`${dotSize} rounded-full bg-purple-500`} />
        <div className={`${labelSize} font-mono text-stone-400 dark:text-white/30 tracking-wider uppercase`}>
          Review Agent
        </div>
      </div>

      {REVIEW_CHECKS.map((check, i) => (
        <div key={check} className={`flex items-center gap-2 py-1.5`}>
          <motion.span
            className="text-green-500 shrink-0"
            style={{ fontSize: isActive && i < checksComplete ? 13 : 11 }}
            animate={{
              scale: i < checksComplete ? 1 : 0,
              opacity: i < checksComplete ? 1 : 0.3,
            }}
            transition={{ duration: 0.3, type: 'spring', stiffness: 300, damping: 25 }}
          >
            {i < checksComplete ? '✓' : '○'}
          </motion.span>
          <span className={`${contentSize} ${i < checksComplete ? 'text-stone-700 dark:text-white/70' : 'text-stone-400 dark:text-white/25'} transition-colors duration-300`}>
            {i < checksComplete ? check : (isActive && i === checksComplete ? 'Scanning...' : check)}
          </span>
        </div>
      ))}

      <motion.div
        className="mt-3 pt-2 border-t border-stone-100 dark:border-white/5 flex items-center justify-center gap-2"
        animate={{
          opacity: checksComplete >= REVIEW_CHECKS.length ? 1 : 0,
          y: checksComplete >= REVIEW_CHECKS.length ? 0 : 8,
        }}
        transition={{ duration: 0.4 }}
      >
        <motion.div
          className="w-2 h-2 rounded-full bg-green-500"
          animate={checksComplete >= REVIEW_CHECKS.length ? { scale: [1, 1.15, 1] } : {}}
          transition={{ duration: 1.5, repeat: Infinity }}
        />
        <span className={`${contentSize} font-medium text-green-600 dark:text-green-400`}>
          Ready to deploy
        </span>
      </motion.div>
    </GlassCard>
  );
}

/* ------------------------------------------------------------------ */
/*  Architecture flow — right column (desktop)                         */
/* ------------------------------------------------------------------ */

function ArchitectureFlow({
  activeStep,
  scrollProgress,
  reducedMotion,
}: {
  activeStep: number;
  scrollProgress: number;
  reducedMotion: boolean;
}) {
  const tier = Math.min(activeStep, 2);
  const config = TIER_CONFIGS[tier];
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerH, setContainerH] = useState(600);
  const cardContentRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [cardHeights, setCardHeights] = useState<number[]>(STEPS.map(() => 150));

  useEffect(() => {
    const measure = () => {
      if (containerRef.current) setContainerH(containerRef.current.offsetHeight);
      const heights = cardContentRefs.current.map((el) => el?.offsetHeight ?? 150);
      if (heights.some((h) => h > 0)) setCardHeights(heights);
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  const activeIndex = scrollProgress * (STEPS.length - 1);
  const translateY = reducedMotion ? 0 : -(activeIndex * containerH);
  const dotY = containerH * 0.5;

  // dotY in card-stack coordinates (so connectors know where to end)
  const dotYInStack = containerH / 2 + activeIndex * containerH;

  return (
    <div ref={containerRef} className="relative h-full overflow-hidden">
      {/* ── Gray track line (dot to bottom) ── */}
      <div
        className="absolute left-1/2 -translate-x-1/2 w-px bg-stone-200/50 dark:bg-white/[0.06] z-[1]"
        style={{ top: dotY, bottom: 0 }}
      />

      {/* ── Progress dot / comet (fixed at center, z-[2]) ── */}
      <div
        className="absolute left-1/2 pointer-events-none z-[2]"
        style={{ top: dotY, transform: 'translate(-50%, -50%)' }}
      >
        {config.haloSize > 0 && !reducedMotion && (
          <div
            className="absolute left-1/2 top-1/2 rounded-full"
            style={{
              width: config.haloSize,
              height: config.haloSize,
              transform: 'translate(-50%, -50%)',
              background: `rgba(40, 205, 86, ${config.haloOpacity})`,
              filter: config.hasPlasma
                ? `url(#plasma) blur(${config.haloBlur}px)`
                : `blur(${config.haloBlur}px)`,
              animation: 'glow-breathe 3s ease-in-out infinite',
            }}
          />
        )}
        {config.hasRing && !reducedMotion && (
          <div
            className="absolute left-1/2 top-1/2 rounded-full border border-green-500/30"
            style={{
              width: config.dotSize + 8,
              height: config.dotSize + 8,
              transform: 'translate(-50%, -50%)',
              animation: 'glow-breathe 3s ease-in-out infinite',
            }}
          />
        )}
        {!reducedMotion && config.tailHeight > 0 && (
          <div
            className="absolute left-1/2 pointer-events-none"
            style={{
              width: config.dotSize,
              height: config.tailHeight,
              top: '50%',
              transform: 'translate(-50%, -100%)',
              background: `radial-gradient(ellipse 100% 200% at 50% 100%, rgba(40,205,86,${config.tailOpacity}), transparent 70%)`,
              borderRadius: '50%',
            }}
          />
        )}
        <div
          className="rounded-full"
          style={{
            width: config.dotSize,
            height: config.dotSize,
            background: '#28CD56',
            opacity: config.dotOpacity,
            boxShadow: config.hasRing ? '0 0 0 2px rgba(40,205,86,0.3)' : undefined,
            transition: 'width 0.4s, height 0.4s',
          }}
        />
      </div>

      {/* ── Scrolling card stack + green connectors ── */}
      <motion.div
        className="absolute left-0 right-0 z-[3]"
        style={{ top: 0, y: translateY }}
      >
        {STEPS.map((step, i) => {
          const isActive = activeStep === i;
          const cardH = cardHeights[i];

          // Green connector: from this card's bottom edge to the dot (in stack coords)
          const cardBottomInStack = i * containerH + containerH / 2 + cardH / 2;
          const connectorHeight = dotYInStack - cardBottomInStack;
          const showConnector = connectorHeight > 2;

          return (
            <div
              key={step.number}
              className="relative flex items-center justify-center px-4"
              style={{ height: containerH }}
            >
              {/* Green connector from card bottom to dot */}
              {showConnector && (
                <div
                  className="absolute left-1/2 -translate-x-1/2 w-px"
                  style={{
                    top: containerH / 2 + cardH / 2,
                    height: connectorHeight,
                    background: '#28CD56',
                  }}
                />
              )}

              {/* Card content */}
              <motion.div
                ref={(el) => { cardContentRefs.current[i] = el; }}
                animate={{
                  opacity: isActive ? 1 : 0,
                  scale: isActive ? 1 : 0.95,
                }}
                transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                className="origin-center w-full"
              >
                <StepIllustration step={step} isActive={isActive} isCompact />
              </motion.div>
            </div>
          );
        })}
      </motion.div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Step text panel — left column (desktop)                            */
/* ------------------------------------------------------------------ */

function StepTextPanel({
  step,
  reducedMotion,
}: {
  step: WorkflowStep;
  reducedMotion: boolean;
}) {
  const [openFeature, setOpenFeature] = useState<number>(0);

  const handleToggle = useCallback(
    (featureIndex: number) => {
      setOpenFeature((prev) => (prev === featureIndex ? -1 : featureIndex));
    },
    []
  );

  /* Reset accordion when step changes */
  useEffect(() => {
    setOpenFeature(0);
  }, [step.number]);

  return (
    <div className="space-y-6">
      {/* Step dot with ping ring */}
      <div className="flex items-center gap-3">
        <span className="relative flex items-center justify-center">
          {!reducedMotion && (
            <span
              className={`absolute w-3 h-3 rounded-full ${step.dotClass} opacity-30 animate-ping`}
            />
          )}
          <span className={`w-1.5 h-1.5 rounded-full ${step.dotClass} relative z-10`} />
        </span>
        <span
          className={`text-[13px] font-mono font-medium tracking-wider ${step.color}`}
          style={{ textShadow: `0 0 12px ${step.glowColor}` }}
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

      {/* Accordion features */}
      <div className="pt-2">
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
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Mobile step card — stacked fallback                                */
/* ------------------------------------------------------------------ */

function MobileStepCard({
  step,
  index,
  progress,
}: {
  step: WorkflowStep;
  index: number;
  progress: number;
}) {
  const [openFeature, setOpenFeature] = useState<number>(0);
  const isActive = progress > 0.1 && progress < 0.9;

  return (
    <div className="relative z-[3]">
      <motion.div
        className="space-y-6"
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-60px' }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="flex items-center gap-3">
          <span className="relative flex items-center justify-center">
            {isActive && (
              <span className={`absolute w-3 h-3 rounded-full ${step.dotClass} opacity-30 animate-ping`} />
            )}
            <span className={`w-1.5 h-1.5 rounded-full ${step.dotClass} relative z-10`} />
          </span>
          <span className={`text-[13px] font-mono font-medium tracking-wider ${step.color}`}>
            {step.number}
          </span>
        </div>

        <h3 className="text-3xl md:text-4xl font-medium text-stone-900 dark:text-white tracking-[-0.02em] leading-[1.1]">
          {step.title}
        </h3>

        <p className="text-base md:text-lg text-stone-500 dark:text-white/50 leading-relaxed">
          {step.description}
        </p>

        <div className="pt-2">
          {step.features.map((feature, i) => (
            <FeatureItem
              key={feature.title}
              feature={feature}
              isOpen={openFeature === i}
              onToggle={() => setOpenFeature((prev) => (prev === i ? -1 : i))}
              index={i}
            />
          ))}
        </div>
      </motion.div>

      <motion.div
        className="mt-8 mb-4"
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-40px' }}
        transition={{ duration: 0.5, delay: 0.15 }}
      >
        <StepIllustration step={step} isActive={isActive} />
      </motion.div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main scroll story component                                        */
/* ------------------------------------------------------------------ */

export function AgentScrollStory() {
  const sectionRef = useRef<HTMLElement>(null);
  const reducedMotion = useReducedMotion();
  const isDesktop = useIsDesktop();

  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ['start start', 'end end'],
  });

  const dampedProgress = useSpring(scrollYProgress, {
    stiffness: 100,
    damping: 30,
    mass: 0.5,
  });

  const [scrollProgress, setScrollProgress] = useState(0);
  useMotionValueEvent(dampedProgress, 'change', (v) => {
    setScrollProgress(v);
  });

  const [rawProgress, setRawProgress] = useState(0);
  useMotionValueEvent(scrollYProgress, 'change', (v) => {
    setRawProgress(v);
  });

  const getStepProgress = (index: number): number => {
    const stepStart = index * 0.25;
    const stepEnd = stepStart + 0.25;
    if (scrollProgress < stepStart) return 0;
    if (scrollProgress > stepEnd) return 1;
    return (scrollProgress - stepStart) / 0.25;
  };

  const activeStep = Math.min(3, Math.max(0, Math.floor(scrollProgress * 4)));
  const currentStep = STEPS[activeStep];

  return (
    <section
      ref={sectionRef}
      data-navbar-theme="light"
      className={`relative bg-[#fafaf9] dark:bg-[#0a0a0a] ${
        isDesktop ? 'min-h-[400vh] overflow-x-clip' : 'py-20 md:py-32 overflow-hidden'
      }`}
      aria-label="Agent workflow: four-step scroll story"
    >
      <PlasmaFilterSVG reducedMotion={reducedMotion} />

      <BackgroundEffects
        scrollYProgress={scrollYProgress}
        reducedMotion={reducedMotion}
      />

      {/* Content frame lines (z-[1]) */}
      <div
        className={`${isDesktop ? 'fixed inset-0' : 'absolute inset-0'} max-w-6xl mx-auto pointer-events-none z-[1]`}
        aria-hidden="true"
      >
        <div className="relative h-full">
          <div className="absolute top-0 bottom-0 left-0 w-px bg-stone-200 dark:bg-white/10" />
          <div className="absolute top-0 bottom-0 right-0 w-px bg-stone-200 dark:bg-white/10" />
        </div>
      </div>

      {/* ─── Desktop: sticky two-column layout ─── */}
      {isDesktop ? (
        <div className="sticky top-0 h-screen flex flex-col justify-center relative z-[3]">
          {/* Left column gradient mask — fades dot grid behind text */}
          <div
            className="absolute inset-y-0 left-0 w-[55%] pointer-events-none z-[2]
              bg-gradient-to-r from-[#fafaf9] via-[#fafaf9]/80 to-transparent
              dark:from-[#0a0a0a] dark:via-[#0a0a0a]/80 dark:to-transparent"
            aria-hidden="true"
          />

          <div className="max-w-6xl mx-auto px-8 md:px-10 w-full relative z-[3]">
            {/* Section header — fades out and collapses as user scrolls */}
            <motion.div
              className="overflow-hidden"
              animate={{
                opacity: scrollProgress < 0.05 ? 1 : 0,
                height: scrollProgress > 0.1 ? 0 : 'auto',
                marginBottom: scrollProgress > 0.1 ? 0 : 32,
              }}
              transition={{ duration: 0.3 }}
            >
              <span className="inline-block rounded-full border border-stone-200 dark:border-white/10 bg-stone-100 dark:bg-white/5 px-3 py-1 text-[11px] font-medium tracking-widest uppercase text-stone-500 dark:text-white/50 mb-4">
                ARCHITECTURE
              </span>
              <h2 className="text-4xl md:text-5xl lg:text-6xl font-medium text-stone-900 dark:text-white tracking-[-0.02em]">
                From prompt to{' '}
                <PixelAccent>production</PixelAccent>
              </h2>
              <p className="text-lg text-stone-500 dark:text-white/50 mt-4 max-w-xl">
                Four phases. Five AI agents. Every change validated before it
                reaches your store.
              </p>
            </motion.div>

            {/* Two-column grid */}
            <div
              className="grid lg:grid-cols-2 gap-12 items-center"
              style={{ opacity: Math.min(1, scrollProgress * 15) }}
            >
              {/* Left column — crossfading text + accordion */}
              <div className="min-h-[420px] flex items-center">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={activeStep}
                    initial={{ opacity: 0, y: 24 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -24 }}
                    transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                    className="w-full"
                  >
                    <StepTextPanel step={currentStep} reducedMotion={reducedMotion} />
                  </motion.div>
                </AnimatePresence>
              </div>

              {/* Right column — architecture flow diagram */}
              <div className="h-[calc(100vh-12rem)]">
                <ArchitectureFlow
                  activeStep={activeStep}
                  scrollProgress={rawProgress}
                  reducedMotion={reducedMotion}
                />
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* ─── Mobile: stacked fallback ─── */
        <div className="relative max-w-6xl mx-auto px-8 md:px-10">
          <motion.div
            className="mb-16 relative z-[3]"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          >
            <span className="inline-block rounded-full border border-stone-200 dark:border-white/10 bg-stone-100 dark:bg-white/5 px-3 py-1 text-[11px] font-medium tracking-widest uppercase text-stone-500 dark:text-white/50 mb-4">
              ARCHITECTURE
            </span>
            <h2 className="text-4xl md:text-5xl font-medium text-stone-900 dark:text-white tracking-[-0.02em]">
              From prompt to{' '}
              <PixelAccent>production</PixelAccent>
            </h2>
            <p className="text-lg text-stone-500 dark:text-white/50 mt-6 max-w-xl">
              Four phases. Five AI agents. Every change validated before it
              reaches your store.
            </p>
          </motion.div>

          <div className="space-y-12">
            {STEPS.map((step, index) => (
              <div key={step.number}>
                <MobileStepCard
                  step={step}
                  index={index}
                  progress={getStepProgress(index)}
                />
                {index < STEPS.length - 1 && (
                  <SVGTravelPath
                    progress={getStepProgress(index)}
                    tier={index}
                    reducedMotion={reducedMotion}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
