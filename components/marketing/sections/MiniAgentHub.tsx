'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

/* ------------------------------------------------------------------ */
/*  Typewriter hook                                                    */
/* ------------------------------------------------------------------ */

function useTypewriter(text: string, active: boolean, speed = 30) {
  const [displayed, setDisplayed] = useState('');

  useEffect(() => {
    if (!active) {
      setDisplayed('');
      return;
    }
    let i = 0;
    setDisplayed('');
    const id = setInterval(() => {
      i++;
      if (i > text.length) {
        clearInterval(id);
        return;
      }
      setDisplayed(text.slice(0, i));
    }, speed);
    return () => clearInterval(id);
  }, [text, active, speed]);

  return displayed;
}

/* ------------------------------------------------------------------ */
/*  Sequential phase timer                                             */
/* ------------------------------------------------------------------ */

type Phase = 'typing' | 'tasks' | 'building' | 'reviewing' | 'deployed';

/** Returns current phase based on a simple sequential timer. */
function usePhaseSequence(startPhase: Phase, inView: boolean) {
  const [phase, setPhase] = useState<Phase>(startPhase);

  useEffect(() => {
    if (!inView) {
      setPhase('typing');
      return;
    }
  }, [inView]);

  return { phase, setPhase };
}

/* ------------------------------------------------------------------ */
/*  Static data                                                        */
/* ------------------------------------------------------------------ */

const PROMPT_TEXT = 'Add a hero banner with animated headline and shop-now CTA';

const PM_STEPS = [
  'Understanding task',
  'Grepping needed context',
  'Building plan & blockers',
  'Assigning parallel work',
];

const SPECIALIST_AGENTS = [
  { dot: 'bg-green-500', name: 'Liquid Agent', file: 'hero-banner.liquid' },
  { dot: 'bg-amber-500', name: 'JS Agent', file: 'hero-animations.js' },
  { dot: 'bg-pink-500', name: 'CSS Agent', file: 'hero-banner.css' },
];

const REVIEW_CHECKS = ['Syntax', 'Tokens', 'A11y'];

/* ------------------------------------------------------------------ */
/*  Connector line (static, no animation)                              */
/* ------------------------------------------------------------------ */

function Connector() {
  return (
    <div className="flex justify-center py-px">
      <div className="w-px h-2.5 bg-stone-200/60 dark:bg-white/8" />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export function MiniAgentHub({ inView }: { inView: boolean }) {
  const { phase, setPhase } = usePhaseSequence('typing', inView);
  const typed = useTypewriter(PROMPT_TEXT, inView, 28);
  const doneTyping = typed.length === PROMPT_TEXT.length;

  // Phase progression: typing → tasks → building → reviewing → deployed
  useEffect(() => {
    if (!inView) return;
    if (!doneTyping) return;
    if (phase !== 'typing') return;
    const t = setTimeout(() => setPhase('tasks'), 350);
    return () => clearTimeout(t);
  }, [doneTyping, inView, phase, setPhase]);

  useEffect(() => {
    if (phase !== 'tasks') return;
    const t = setTimeout(() => setPhase('building'), 1200);
    return () => clearTimeout(t);
  }, [phase, setPhase]);

  useEffect(() => {
    if (phase !== 'building') return;
    const t = setTimeout(() => setPhase('reviewing'), 1400);
    return () => clearTimeout(t);
  }, [phase, setPhase]);

  useEffect(() => {
    if (phase !== 'reviewing') return;
    const t = setTimeout(() => setPhase('deployed'), 1000);
    return () => clearTimeout(t);
  }, [phase, setPhase]);

  const showTasks = phase !== 'typing';
  const showBuilding = ['building', 'reviewing', 'deployed'].includes(phase);
  const showReview = ['reviewing', 'deployed'].includes(phase);
  const showDeployed = phase === 'deployed';

  return (
    <motion.div
      className="w-full max-w-[260px] mx-auto space-y-0"
      initial={{ opacity: 0 }}
      animate={inView ? { opacity: 1 } : { opacity: 0 }}
      transition={{ duration: 0.5, delay: 0.3 }}
    >
      {/* ── Prompt card ──────────────────────────────────────────── */}
      <div className="rounded-lg border border-stone-200/60 dark:border-white/10 bg-white dark:bg-white/5 px-3 py-2">
        <div className="flex items-center gap-1.5 mb-1">
          <div className="w-1 h-1 rounded-full bg-stone-400" />
          <span className="text-[10px] font-semibold text-stone-700 dark:text-white/80 leading-none">
            You
          </span>
        </div>
        <p className="text-[10px] text-stone-500 dark:text-white/45 leading-relaxed min-h-[2.4em]">
          {typed}
          {!doneTyping && inView && (
            <span className="inline-block w-[1.5px] h-[10px] bg-stone-400 dark:bg-white/40 ml-px align-middle animate-pulse" />
          )}
        </p>
      </div>

      <Connector />

      {/* ── PM Agent card ────────────────────────────────────────── */}
      <div className="rounded-lg border border-stone-200/60 dark:border-white/10 bg-white dark:bg-white/5 px-3 py-2">
        <div className="flex items-center gap-1.5 mb-1.5">
          <div className="w-1 h-1 rounded-full bg-blue-500" />
          <span className="text-[10px] font-semibold text-stone-700 dark:text-white/80 leading-none">
            PM Agent
          </span>
        </div>
        <div className="space-y-1 min-h-[4.4em]">
          {PM_STEPS.map((step, i) => (
            <div
              key={step}
              className="flex items-center gap-1.5 transition-opacity duration-300"
              style={{
                opacity: showTasks ? 1 : 0,
                transitionDelay: `${i * 140}ms`,
              }}
            >
              <span
                className="text-green-500 text-[7px] shrink-0 leading-none transition-opacity duration-300"
                style={{
                  opacity: showTasks ? 1 : 0,
                  transitionDelay: `${i * 140 + 100}ms`,
                }}
              >
                ✓
              </span>
              <span className="text-[9px] text-stone-500 dark:text-white/40 leading-none">
                {step}
              </span>
            </div>
          ))}
        </div>
      </div>

      <Connector />

      {/* ── Specialist agents row ────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-1">
        {SPECIALIST_AGENTS.map((agent, i) => (
          <div
            key={agent.name}
            className="rounded-lg border border-stone-200/60 dark:border-white/10 bg-white dark:bg-white/5 px-2 py-1.5"
          >
            <div className="flex items-center gap-1 mb-0.5">
              <div className={`w-1 h-1 rounded-full ${agent.dot} shrink-0`} />
              <span className="text-[8px] font-semibold text-stone-700 dark:text-white/80 leading-none truncate">
                {agent.name}
              </span>
            </div>
            <div
              className="text-[7px] font-mono text-stone-400 dark:text-white/30 leading-none truncate transition-opacity duration-400 min-h-[10px]"
              style={{
                opacity: showBuilding ? 1 : 0,
                transitionDelay: `${i * 120}ms`,
              }}
            >
              {agent.file}
            </div>
            {/* Code line placeholders */}
            <div className="space-y-[3px] mt-1 min-h-[10px]">
              {[0, 1].map((line) => (
                <div
                  key={line}
                  className="h-[3px] rounded-sm bg-stone-100 dark:bg-white/5 transition-opacity duration-400"
                  style={{
                    width: line === 0 ? '85%' : '60%',
                    opacity: showBuilding ? 1 : 0,
                    transitionDelay: `${i * 120 + 80 + line * 80}ms`,
                  }}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      <Connector />

      {/* ── Review Agent card ────────────────────────────────────── */}
      <div className="rounded-lg border border-stone-200/60 dark:border-white/10 bg-white dark:bg-white/5 px-3 py-2">
        <div className="flex items-center gap-1.5 mb-1.5">
          <div className="w-1 h-1 rounded-full bg-purple-500" />
          <span className="text-[10px] font-semibold text-stone-700 dark:text-white/80 leading-none">
            Review Agent
          </span>
        </div>
        <div className="flex items-center gap-2 min-h-[1em]">
          {REVIEW_CHECKS.map((check, i) => (
            <span
              key={check}
              className="text-[8px] text-stone-400 dark:text-white/35 leading-none flex items-center gap-0.5 transition-opacity duration-300"
              style={{
                opacity: showReview ? 1 : 0,
                transitionDelay: `${i * 150}ms`,
              }}
            >
              <span className="text-green-500 text-[7px]">✓</span>
              {check}
            </span>
          ))}
        </div>
      </div>

      <Connector />

      {/* ── Deploy status ────────────────────────────────────────── */}
      <div className="rounded-lg border border-stone-200/60 dark:border-white/10 bg-white dark:bg-white/5 px-3 py-1.5">
        <div className="flex items-center justify-center gap-1.5">
          <div
            className="w-1.5 h-1.5 rounded-full transition-colors duration-400"
            style={{ backgroundColor: showDeployed ? 'oklch(0.723 0.191 149)' : 'oklch(0.869 0.005 56)' }}
          />
          <span
            className="text-[9px] font-medium leading-none transition-colors duration-400"
            style={{ color: showDeployed ? 'oklch(0.448 0.119 151)' : 'oklch(0.709 0.01 56)' }}
          >
            {showDeployed ? 'Deployed to store' : 'Awaiting output'}
          </span>
        </div>
      </div>
    </motion.div>
  );
}
