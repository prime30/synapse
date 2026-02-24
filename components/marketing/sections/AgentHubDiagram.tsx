'use client';

import { useRef, useState, useEffect, startTransition } from 'react';
import { motion, useInView, LayoutGroup } from 'framer-motion';
import { PixelAccent } from '@/components/marketing/interactions/PixelAccent';

/* ------------------------------------------------------------------ */
/*  Types & constants                                                  */
/* ------------------------------------------------------------------ */

type Phase = 'stack' | 'spread' | 'loop';
type Step = 'idle' | 'prompt' | 'pm' | 'code' | 'review' | 'deliver';

const STEP_ORDER: Step[] = ['idle', 'prompt', 'pm', 'code', 'review', 'deliver'];
const STEP_MS: Record<Step, number> = {
  idle: 600,
  prompt: 1400,
  pm: 1400,
  code: 2200,
  review: 1400,
  deliver: 2200,
};

const STEP_LABELS: Record<Step, string> = {
  idle: '',
  prompt: 'Your prompt',
  pm: 'Planning tasks',
  code: 'Writing code',
  review: 'Reviewing',
  deliver: 'Deployed',
};

const STACK_DURATION = 1000;
const SPREAD_DURATION = 800;
const DIAGRAM_MIN_HEIGHT = 560;
const FLOW_LINES_DELAY_MS = 350;

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  });
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handler = () => setReduced(mq.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return reduced;
}

/* ------------------------------------------------------------------ */
/*  Agent definitions (static classes for Tailwind purge)              */
/* ------------------------------------------------------------------ */

interface AgentDef {
  name: string;
  role: string;
  dotClass: string;
  activeBorder: string;
  activeBg: string;
  taskBg: string;
  taskText: string;
  glowShadow: string; // e.g. "shadow-[0_0_20px_rgba(34,197,94,0.25)]"
}

const ALL_AGENTS: AgentDef[] = [
  {
    name: 'You',
    role: 'Describe what you need',
    dotClass: 'bg-stone-400',
    activeBorder: 'border-stone-400/40',
    activeBg: 'bg-stone-50 dark:bg-white/5',
    taskBg: 'bg-stone-100 dark:bg-white/10',
    taskText: 'text-stone-600 dark:text-white/60',
    glowShadow: 'shadow-[0_0_20px_oklch(0.709_0.01_56_/_0.2)]',
  },
  {
    name: 'PM Agent',
    role: 'Plans tasks, delegates to specialists',
    dotClass: 'bg-blue-500',
    activeBorder: 'border-blue-400/40',
    activeBg: 'bg-blue-50 dark:bg-blue-500/10',
    taskBg: 'bg-blue-100/60 dark:bg-blue-500/10',
    taskText: 'text-blue-700 dark:text-blue-300',
    glowShadow: 'shadow-[0_0_20px_oklch(0.623_0.214_259_/_0.25)]',
  },
  {
    name: 'Liquid Agent',
    role: 'Templates & schema',
    dotClass: 'bg-green-500',
    activeBorder: 'border-green-400/40',
    activeBg: 'bg-green-50 dark:bg-green-500/10',
    taskBg: 'bg-green-100/60 dark:bg-green-500/10',
    taskText: 'text-green-700 dark:text-green-300',
    glowShadow: 'shadow-[0_0_20px_oklch(0.723_0.191_149_/_0.25)]',
  },
  {
    name: 'JS Agent',
    role: 'Scripts & interactivity',
    dotClass: 'bg-amber-500',
    activeBorder: 'border-amber-400/40',
    activeBg: 'bg-amber-50 dark:bg-amber-500/10',
    taskBg: 'bg-amber-100/60 dark:bg-amber-500/10',
    taskText: 'text-amber-700 dark:text-amber-300',
    glowShadow: 'shadow-[0_0_20px_oklch(0.769_0.188_70_/_0.25)]',
  },
  {
    name: 'CSS Agent',
    role: 'Styles & responsive',
    dotClass: 'bg-pink-500',
    activeBorder: 'border-pink-400/40',
    activeBg: 'bg-pink-50 dark:bg-pink-500/10',
    taskBg: 'bg-pink-100/60 dark:bg-pink-500/10',
    taskText: 'text-pink-700 dark:text-pink-300',
    glowShadow: 'shadow-[0_0_20px_oklch(0.627_0.265_3_/_0.25)]',
  },
  {
    name: 'Review Agent',
    role: 'Validates quality & consistency',
    dotClass: 'bg-purple-500',
    activeBorder: 'border-purple-400/40',
    activeBg: 'bg-purple-50 dark:bg-purple-500/10',
    taskBg: 'bg-purple-100/60 dark:bg-purple-500/10',
    taskText: 'text-purple-700 dark:text-purple-300',
    glowShadow: 'shadow-[0_0_20px_oklch(0.586_0.262_293_/_0.25)]',
  },
];

const TASKS = [
  '"Build a hero with animated headline..."',
  'Breaking down into 3 tasks...',
  'Writing hero.liquid',
  'Adding animations',
  'Styling section',
  'All checks passed',
];

const LAYOUT_TRANSITION = {
  layout: { duration: 0.6, ease: [0.4, 0, 0.2, 1] as const },
};

/* ------------------------------------------------------------------ */
/*  Agent card with thinking indicator                                 */
/* ------------------------------------------------------------------ */

function AgentCard({
  agent,
  active,
  completed,
  task,
}: {
  agent: AgentDef;
  active: boolean;
  completed: boolean;
  task?: string;
}) {
  const showTask = task && (active || completed);
  const isThinking = active && task;

  return (
    <div
      className={`relative rounded-xl p-4 min-h-[88px] transition-all duration-500 ease-out border-2 ${
        active
          ? `${agent.activeBorder} ${agent.activeBg} ${agent.glowShadow}`
          : 'border-stone-200/60 dark:border-white/10 bg-white dark:bg-white/5 shadow-sm'
      }`}
    >
      <div className="relative">
        <div className="flex items-center gap-2 mb-1">
          <div
            className={`w-1.5 h-1.5 rounded-full ${agent.dotClass} transition-transform duration-500 ${
              active ? 'scale-125' : 'scale-100'
            }`}
          />
          <span className="text-[14px] font-semibold text-stone-900 dark:text-white">
            {agent.name}
          </span>
        </div>
        <p
          className={`text-[11px] leading-relaxed ${
            active ? 'text-stone-600 dark:text-white/50' : 'text-stone-500 dark:text-white/40'
          }`}
        >
          {agent.role}
        </p>

        {/* Status row: separator above; shimmer when thinking, solid + check when completed */}
        <div
          className={`mt-2 pt-2 min-h-[28px] flex items-center gap-1.5 border-t ${
            showTask ? 'border-stone-100 dark:border-white/5' : 'border-transparent'
          }`}
        >
          {/* Lambda — only while actively thinking */}
          <span
            className={`font-pixel-circle pixel-stipple text-[11px] leading-none transition-opacity duration-400 ${agent.taskText} ${
              isThinking ? 'opacity-100' : 'opacity-0'
            }`}
          >
            {'\u039B'}
          </span>
          {/* Task text — visible when thinking (shimmer) or completed (solid) */}
          <span
            className={`rounded-md px-2 py-1 text-[10px] transition-opacity duration-400 ${agent.taskBg} ${agent.taskText} ${
              showTask ? 'opacity-100' : 'opacity-0'
            } ${isThinking ? 'task-shimmer' : ''} ${completed ? 'border-l-2 border-l-green-500/50 pl-2' : ''}`}
          >
            {task || '\u00A0'}
          </span>
          {/* Checkmark when completed */}
          {completed && showTask && (
            <span
              className={`text-[12px] leading-none ${agent.taskText}`}
              aria-hidden
            >
              ✓
            </span>
          )}
          {/* Thinking dots — only while actively thinking */}
          <span
            className={`inline-flex items-center gap-0.5 transition-opacity duration-400 ${
              isThinking ? 'opacity-100' : 'opacity-0'
            }`}
          >
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className={`w-0.5 h-0.5 rounded-full ${agent.dotClass}`}
                style={{
                  animation: isThinking ? `thinking-dot 1.2s ease-in-out ${i * 0.2}s infinite` : 'none',
                }}
              />
            ))}
          </span>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Flow line with traveling dot                                       */
/* ------------------------------------------------------------------ */

function FlowLine({
  active,
  visible,
  dotActive,
}: {
  active: boolean;
  visible: boolean;
  dotActive?: boolean;
}) {
  const showDot = dotActive ?? visible;
  return (
    <div
      className={`flex justify-center py-1 transition-opacity duration-500 ${
        visible ? 'opacity-100' : 'opacity-0'
      }`}
    >
      <div className="relative w-px h-8 bg-stone-200 dark:bg-white/10 overflow-hidden">
        {/* Line glow — only when dot is active (loop phase) */}
        <div
          className={`absolute inset-0 bg-accent/60 transition-opacity duration-500 ${
            active && showDot ? 'opacity-100' : 'opacity-0'
          }`}
        />
        {/* Traveling dot — only when dotActive (loop phase) */}
        <div
          className={`absolute left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-accent transition-opacity duration-300 ${
            active && showDot ? 'opacity-100' : 'opacity-0'
          }`}
          style={{
            animation: active && showDot ? 'flow-dot 0.8s ease-in-out infinite' : 'none',
          }}
        />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export function AgentHubDiagram() {
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, { once: false, margin: '-80px' });
  const reducedMotion = useReducedMotion();
  const [phase, setPhase] = useState<Phase>('stack');
  const [step, setStep] = useState<Step>('idle');
  const [showFlowLines, setShowFlowLines] = useState(false);

  // Show connector lines after spread (with delay); hide when stacked
  useEffect(() => {
    const stacked = phase === 'stack' && !reducedMotion;
    if (stacked) {
      startTransition(() => setShowFlowLines(false));
      return;
    }
    const t = setTimeout(() => startTransition(() => setShowFlowLines(true)), FLOW_LINES_DELAY_MS);
    return () => clearTimeout(t);
  }, [phase, reducedMotion]);

  const isStacked = phase === 'stack' && !reducedMotion;

  // Phase progression: stack -> spread -> loop (skip stack when reduced motion)
  useEffect(() => {
    if (!inView) return;
    if (reducedMotion) {
      startTransition(() => setPhase('spread'));
      const t = setTimeout(() => startTransition(() => setPhase('loop')), SPREAD_DURATION);
      return () => clearTimeout(t);
    }
    const t1 = setTimeout(() => startTransition(() => setPhase('spread')), STACK_DURATION);
    const t2 = setTimeout(() => startTransition(() => setPhase('loop')), STACK_DURATION + SPREAD_DURATION);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [inView, reducedMotion]);

  // Workflow step loop (only during loop phase)
  useEffect(() => {
    if (phase !== 'loop') return;

    let idx = 0;
    let id: ReturnType<typeof setTimeout>;

    function tick() {
      idx = (idx + 1) % STEP_ORDER.length;
      const s = STEP_ORDER[idx];
      setStep(s);
      id = setTimeout(tick, STEP_MS[s]);
    }

    id = setTimeout(tick, STEP_MS[STEP_ORDER[0]]);
    return () => clearTimeout(id);
  }, [phase]);

  const showFlow = phase === 'loop';
  const isPrompt = step === 'prompt' || step === 'deliver';
  const isPm = step === 'pm';
  const isCoding = step === 'code';
  const isReview = step === 'review';
  const isDeliver = step === 'deliver';

  // Completed = workflow has moved past this card (task text stays visible, solid)
  const completedPrompt = ['pm', 'code', 'review', 'deliver'].includes(step);
  const completedPm = ['code', 'review', 'deliver'].includes(step);
  const completedCode = ['review', 'deliver'].includes(step);
  const completedReview = step === 'deliver';

  const layoutTransition = reducedMotion
    ? { layout: { duration: 0 } }
    : LAYOUT_TRANSITION;

  return (
    <section
      ref={ref}
      data-navbar-theme="light"
      className="relative bg-[oklch(0.985_0.001_106)] dark:bg-[oklch(0.145_0_0)] py-16 md:py-24 overflow-hidden"
      aria-label="Agent workflow: from your prompt to deployed output"
    >
      {/* Live region: announces current step for screen readers */}
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {STEP_LABELS[step]}
      </div>
      <div className="absolute inset-0 max-w-6xl mx-auto pointer-events-none" aria-hidden="true">
        <div className="relative h-full">
          <div className="absolute top-0 bottom-0 left-0 w-px bg-stone-200 dark:bg-white/10" />
          <div className="absolute top-0 bottom-0 right-0 w-px bg-stone-200 dark:bg-white/10" />
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-8 md:px-10">
        {/* Section header */}
        <div className="text-center mb-12">
          <span className="inline-block rounded-full border border-stone-200 dark:border-white/10 bg-stone-100 dark:bg-white/5 px-3 py-1 text-[11px] font-medium tracking-widest uppercase text-stone-500 dark:text-white/50 mb-4">
            ARCHITECTURE
          </span>
          <h2 className="text-4xl md:text-5xl font-medium text-stone-900 dark:text-white tracking-[-0.02em]">
            One system. <PixelAccent>Five</PixelAccent> specialists.
          </h2>
          <p className="text-lg text-stone-500 dark:text-white/50 mt-6 max-w-lg mx-auto">
            A project manager delegates. Three language specialists write code.
            A reviewer validates every change.
          </p>
        </div>

        {/* Workflow diagram */}
        {inView && (
          <LayoutGroup>
            <div className="max-w-2xl mx-auto min-h-[720px] md:min-h-[780px]">
              {isStacked ? (
                /* ── Stacked phase: cards piled as a deck ─────────── */
                <div className="flex justify-center items-center py-12">
                  <div className="relative w-full max-w-xs">
                    {ALL_AGENTS.map((agent, i) => {
                      const offset = i * 6;
                      const xShift = i * 2;
                      return (
                        <motion.div
                          key={agent.name}
                          layoutId={agent.name}
                          className={i === 0 ? 'relative' : 'absolute left-0 right-0 top-0'}
                          style={{
                            zIndex: ALL_AGENTS.length - i,
                            transform: `translateY(-${offset}px) translateX(${xShift}px)`,
                            filter: `drop-shadow(0 ${4 + i * 3}px ${8 + i * 4}px oklch(0 0 0 / ${0.04 + i * 0.02}))`,
                          }}
                          transition={layoutTransition}
                        >
                          <AgentCard
                            agent={agent}
                            active={false}
                            completed={false}
                          />
                        </motion.div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                /* ── Spread + loop phase: org chart layout ────────── */
                <div>
                  {/* Row 1: User */}
                  <div className="flex justify-center">
                    <motion.div
                      layoutId={ALL_AGENTS[0].name}
                      className="w-full max-w-xs"
                      transition={layoutTransition}
                    >
                      <AgentCard
                        agent={ALL_AGENTS[0]}
                        active={isPrompt}
                        completed={completedPrompt}
                        task={TASKS[0]}
                      />
                    </motion.div>
                  </div>

                  {/* Line 1: You → PM */}
                  <FlowLine active={isPrompt} visible={showFlowLines} dotActive={showFlow} />

                  {/* Row 2: PM Agent */}
                  <div className="flex justify-center">
                    <motion.div
                      layoutId={ALL_AGENTS[1].name}
                      className="w-full max-w-xs"
                      transition={layoutTransition}
                    >
                      <AgentCard
                        agent={ALL_AGENTS[1]}
                        active={isPm}
                        completed={completedPm}
                        task={TASKS[1]}
                      />
                    </motion.div>
                  </div>

                  {/* Line 2: PM → Specialists */}
                  <FlowLine active={isPm} visible={showFlowLines} dotActive={showFlow} />

                  {/* Row 3: Three specialists */}
                  <div className="grid grid-cols-3 gap-3">
                    <motion.div
                      layoutId={ALL_AGENTS[2].name}
                      transition={layoutTransition}
                    >
                      <AgentCard
                        agent={ALL_AGENTS[2]}
                        active={isCoding}
                        completed={completedCode}
                        task={TASKS[2]}
                      />
                    </motion.div>
                    <motion.div
                      layoutId={ALL_AGENTS[3].name}
                      transition={layoutTransition}
                    >
                      <AgentCard
                        agent={ALL_AGENTS[3]}
                        active={isCoding}
                        completed={completedCode}
                        task={TASKS[3]}
                      />
                    </motion.div>
                    <motion.div
                      layoutId={ALL_AGENTS[4].name}
                      transition={layoutTransition}
                    >
                      <AgentCard
                        agent={ALL_AGENTS[4]}
                        active={isCoding}
                        completed={completedCode}
                        task={TASKS[4]}
                      />
                    </motion.div>
                  </div>

                  {/* Line 3: Specialists → Review */}
                  <FlowLine active={isCoding} visible={showFlowLines} dotActive={showFlow} />

                  {/* Row 4: Review Agent */}
                  <div className="flex justify-center">
                    <motion.div
                      layoutId={ALL_AGENTS[5].name}
                      className="w-full max-w-xs"
                      transition={layoutTransition}
                    >
                      <AgentCard
                        agent={ALL_AGENTS[5]}
                        active={isReview}
                        completed={completedReview}
                        task={TASKS[5]}
                      />
                    </motion.div>
                  </div>

                  {/* Line 4: Review → Output */}
                  <FlowLine active={isReview || isDeliver} visible={showFlowLines} dotActive={showFlow} />

                  {/* Row 5: Delivery status */}
                  <motion.div
                    className="flex justify-center"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.4, delay: 0.4 }}
                  >
                    <div
                      className={`rounded-xl border px-6 py-3 min-w-[200px] text-center transition-all duration-500 ${
                        isDeliver
                          ? 'border-green-400/40 bg-green-50 dark:bg-green-500/10'
                          : 'border-stone-200 dark:border-white/10 bg-white dark:bg-white/5'
                      }`}
                    >
                      <div className="flex items-center justify-center gap-2">
                        <div
                          className={`w-2 h-2 rounded-full transition-colors duration-500 ${
                            isDeliver ? 'bg-green-500' : 'bg-stone-300 dark:bg-white/20'
                          }`}
                        />
                        <span
                          className={`text-[12px] font-medium transition-colors duration-500 ${
                            isDeliver
                              ? 'text-green-700 dark:text-green-400'
                              : 'text-stone-400 dark:text-white/30'
                          }`}
                        >
                          {isDeliver ? 'Deployed to store' : 'Awaiting output...'}
                        </span>
                      </div>
                    </div>
                  </motion.div>
                </div>
              )}
            </div>
          </LayoutGroup>
        )}
      </div>

    </section>
  );
}
