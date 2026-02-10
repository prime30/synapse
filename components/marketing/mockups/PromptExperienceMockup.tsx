'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { LiquidCodeLine } from '@/components/marketing/utils/LiquidCodeLine';

/* ------------------------------------------------------------------ */
/*  Data                                                               */
/* ------------------------------------------------------------------ */

const USER_PROMPT =
  'Add a hero banner with animated headline and shop-now CTA';

const PLAN_STEPS = [
  'Define schema with heading, subheading, and CTA settings',
  'Build section markup with responsive layout',
  'Wire CTA button with dynamic URL binding',
];

const CODE_LINES = [
  '{% schema %}',
  '  { "name": "Hero Banner",',
  '    "tag": "section",',
  '    "settings": [',
  '      { "type": "text", "id": "heading" },',
  '      { "type": "url", "id": "cta_url" }',
  '    ] }',
  '{% endschema %}',
  '',
  '<section class="hero">',
  '  <h1>{{ section.settings.heading }}</h1>',
  '  <div class="hero__cta">',
  '    <a href="{{ cta_url }}"',
  '       class="btn btn--primary">',
  '      {{ section.settings.cta_text }}',
  '    </a>',
  '  </div>',
  '</section>',
];

type Phase =
  | 'prompt'
  | 'thinking'
  | 'planning'
  | 'coding'
  | 'review'
  | 'preview'
  | 'hold'
  | 'reset';

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function ThinkingDots() {
  return (
    <span className="inline-flex items-center gap-0.5 ml-1">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="w-1 h-1 rounded-full bg-stone-400 dark:bg-white/40"
          animate={{ opacity: [0.2, 1, 0.2] }}
          transition={{
            duration: 1.2,
            repeat: Infinity,
            delay: i * 0.2,
            ease: 'easeInOut',
          }}
        />
      ))}
    </span>
  );
}

function AgentBadge({
  name,
  color,
  active,
}: {
  name: string;
  color: string;
  active: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={`w-1.5 h-1.5 rounded-full ${color} transition-transform duration-300 ${active ? 'scale-150' : 'scale-100'}`}
      />
      <span className="text-[11px] font-medium text-stone-500 dark:text-white/60">
        {name}
      </span>
    </span>
  );
}

function CheckIcon({ visible }: { visible: boolean }) {
  return (
    <motion.div
      className="w-4 h-4 rounded border border-green-600/40 dark:border-green-500/50 flex items-center justify-center shrink-0"
      initial={{ scale: 0.5, opacity: 0 }}
      animate={visible ? { scale: 1, opacity: 1 } : {}}
      transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
    >
      <svg
        width="10"
        height="10"
        viewBox="0 0 10 10"
        fill="none"
        className="text-green-600 dark:text-green-400"
      >
        <path
          d="M2 5.5L4 7.5L8 3"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  SVG product illustrations                                          */
/* ------------------------------------------------------------------ */

function BottleSvg() {
  return (
    <svg viewBox="0 0 40 72" fill="none" className="w-full h-full">
      {/* Cap */}
      <rect x="14" y="2" width="12" height="8" rx="2" className="fill-emerald-700/80 dark:fill-emerald-400/70" />
      {/* Neck */}
      <rect x="16" y="10" width="8" height="6" rx="1" className="fill-emerald-600/60 dark:fill-emerald-400/50" />
      {/* Body */}
      <rect x="8" y="16" width="24" height="50" rx="4" className="fill-emerald-600/70 dark:fill-emerald-500/60" />
      {/* Label area */}
      <rect x="11" y="28" width="18" height="18" rx="2" className="fill-white/30 dark:fill-white/15" />
      {/* Label line */}
      <rect x="14" y="34" width="12" height="1.5" rx="0.75" className="fill-white/50 dark:fill-white/25" />
      <rect x="15" y="38" width="10" height="1" rx="0.5" className="fill-white/35 dark:fill-white/15" />
      {/* Highlight */}
      <rect x="10" y="18" width="3" height="30" rx="1.5" className="fill-white/20 dark:fill-white/10" />
    </svg>
  );
}

function DropperSvg() {
  return (
    <svg viewBox="0 0 40 72" fill="none" className="w-full h-full">
      {/* Dropper bulb */}
      <ellipse cx="20" cy="6" rx="6" ry="5" className="fill-emerald-800/70 dark:fill-emerald-300/60" />
      {/* Dropper neck */}
      <rect x="18" y="11" width="4" height="8" rx="1" className="fill-emerald-700/50 dark:fill-emerald-400/40" />
      {/* Body */}
      <path d="M12 19 C12 19 10 22 10 26 L10 64 C10 67 12 69 15 69 L25 69 C28 69 30 67 30 64 L30 26 C30 22 28 19 28 19 Z" className="fill-emerald-500/65 dark:fill-emerald-500/55" />
      {/* Label */}
      <rect x="13" y="34" width="14" height="16" rx="2" className="fill-white/30 dark:fill-white/15" />
      <rect x="15" y="39" width="10" height="1.5" rx="0.75" className="fill-white/50 dark:fill-white/25" />
      <rect x="16" y="43" width="8" height="1" rx="0.5" className="fill-white/35 dark:fill-white/15" />
      {/* Highlight */}
      <rect x="12" y="24" width="2.5" height="24" rx="1.25" className="fill-white/20 dark:fill-white/10" />
    </svg>
  );
}

function JarSvg() {
  return (
    <svg viewBox="0 0 48 56" fill="none" className="w-full h-full">
      {/* Lid */}
      <rect x="6" y="2" width="36" height="10" rx="3" className="fill-emerald-700/75 dark:fill-emerald-400/65" />
      {/* Body */}
      <rect x="4" y="12" width="40" height="38" rx="6" className="fill-emerald-500/60 dark:fill-emerald-500/50" />
      {/* Label */}
      <rect x="10" y="22" width="28" height="16" rx="3" className="fill-white/30 dark:fill-white/15" />
      <rect x="14" y="27" width="20" height="1.5" rx="0.75" className="fill-white/50 dark:fill-white/25" />
      <rect x="16" y="31" width="16" height="1" rx="0.5" className="fill-white/35 dark:fill-white/15" />
      {/* Highlight */}
      <rect x="7" y="14" width="3" height="20" rx="1.5" className="fill-white/20 dark:fill-white/10" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/*  Product data                                                       */
/* ------------------------------------------------------------------ */

const PRODUCTS = [
  { name: 'Hydra Serum', price: '$48', Illustration: BottleSvg },
  { name: 'Glow Oil', price: '$36', Illustration: DropperSvg },
  { name: 'Renewal Cream', price: '$52', Illustration: JarSvg },
];

/* ------------------------------------------------------------------ */
/*  Storefront preview                                                 */
/* ------------------------------------------------------------------ */

function StorefrontPreview() {
  return (
    <div className="bg-stone-50/60 dark:bg-white/[0.03] rounded-b-2xl overflow-hidden">
      {/* LIVE PREVIEW label */}
      <div className="flex items-center gap-2 px-4 pt-3 pb-2">
        <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
        <span className="text-[10px] text-green-600 dark:text-green-400 font-medium tracking-wide">
          LIVE PREVIEW
        </span>
      </div>

      {/* Store chrome */}
      <div className="mx-3 mb-3 rounded-lg border border-stone-200 dark:border-white/10 bg-white dark:bg-white/[0.04] overflow-hidden">
        {/* Nav bar */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-stone-100 dark:border-white/[0.06]">
          <span className="text-[10px] font-bold text-stone-800 dark:text-white/80 tracking-[0.08em]">
            BOTANIQ
          </span>
          <div className="flex items-center gap-3">
            {['Shop', 'Collections', 'About'].map((item) => (
              <span
                key={item}
                className="text-[8px] text-stone-400 dark:text-white/40"
              >
                {item}
              </span>
            ))}
            {/* Cart icon */}
            <svg
              width="12"
              height="12"
              viewBox="0 0 16 16"
              fill="none"
              className="text-stone-400 dark:text-white/40"
            >
              <path
                d="M1 1h2l1.5 8h8L15 3H4.5"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle cx="6" cy="13" r="1" fill="currentColor" />
              <circle cx="12" cy="13" r="1" fill="currentColor" />
            </svg>
          </div>
        </div>

        {/* Hero banner */}
        <div className="bg-gradient-to-br from-emerald-50 via-green-50 to-emerald-100/60 dark:from-emerald-950/40 dark:via-emerald-900/20 dark:to-emerald-950/30 px-4 py-5 text-center">
          <div className="text-[12px] font-semibold text-emerald-900 dark:text-emerald-200 tracking-[-0.01em]">
            Summer Collection 2026
          </div>
          <div className="text-[8px] text-emerald-700/60 dark:text-emerald-400/50 mt-0.5">
            Clean beauty, naturally crafted.
          </div>
          <div className="mt-2.5 inline-block px-3 py-1 rounded-full bg-emerald-700 dark:bg-emerald-600 text-[7px] text-white font-medium">
            Shop Now
          </div>
        </div>

        {/* Product grid */}
        <div className="grid grid-cols-3 divide-x divide-stone-100 dark:divide-white/[0.06] border-t border-stone-100 dark:border-white/[0.06]">
          {PRODUCTS.map((product) => (
            <div key={product.name} className="px-2.5 py-3 text-center">
              {/* Product image area */}
              <div className="mx-auto w-12 h-16 mb-2 flex items-end justify-center">
                <product.Illustration />
              </div>
              {/* Product info */}
              <div className="text-[8px] font-medium text-stone-700 dark:text-white/70 leading-tight">
                {product.name}
              </div>
              <div className="text-[8px] text-stone-400 dark:text-white/35 mt-0.5">
                {product.price}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export function PromptExperienceMockup() {
  const [phase, setPhase] = useState<Phase>('prompt');
  const [promptText, setPromptText] = useState('');
  const [planChecked, setPlanChecked] = useState<number[]>([]);
  const [codeVisible, setCodeVisible] = useState<string[]>([]);
  const [reviewPassed, setReviewPassed] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const cleanup = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (intervalRef.current) clearInterval(intervalRef.current);
  }, []);

  // Auto-scroll response panel
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [codeVisible.length, planChecked.length, reviewPassed]);

  // ── Main animation loop ──────────────────────────────────────────
  useEffect(() => {
    cleanup();

    if (phase === 'prompt') {
      let charIdx = 0;
      setPromptText('');
      setCodeVisible([]);
      setPlanChecked([]);
      setReviewPassed(false);

      intervalRef.current = setInterval(() => {
        charIdx++;
        if (charIdx <= USER_PROMPT.length) {
          setPromptText(USER_PROMPT.slice(0, charIdx));
        } else {
          clearInterval(intervalRef.current!);
          timerRef.current = setTimeout(() => setPhase('thinking'), 400);
        }
      }, 28);
    }

    if (phase === 'thinking') {
      timerRef.current = setTimeout(() => setPhase('planning'), 1200);
    }

    if (phase === 'planning') {
      let step = 0;
      intervalRef.current = setInterval(() => {
        if (step < PLAN_STEPS.length) {
          setPlanChecked((prev) => [...prev, step]);
          step++;
        } else {
          clearInterval(intervalRef.current!);
          timerRef.current = setTimeout(() => setPhase('coding'), 500);
        }
      }, 350);
    }

    if (phase === 'coding') {
      let lineIdx = 0;
      intervalRef.current = setInterval(() => {
        if (lineIdx < CODE_LINES.length) {
          setCodeVisible((prev) => [...prev, CODE_LINES[lineIdx]]);
          lineIdx++;
        } else {
          clearInterval(intervalRef.current!);
          timerRef.current = setTimeout(() => setPhase('review'), 300);
        }
      }, 100);
    }

    if (phase === 'review') {
      setReviewPassed(true);
      timerRef.current = setTimeout(() => setPhase('preview'), 1200);
    }

    if (phase === 'preview') {
      timerRef.current = setTimeout(() => setPhase('hold'), 2500);
    }

    if (phase === 'hold') {
      timerRef.current = setTimeout(() => setPhase('reset'), 1500);
    }

    if (phase === 'reset') {
      timerRef.current = setTimeout(() => setPhase('prompt'), 300);
    }

    return cleanup;
  }, [phase, cleanup]);

  const showPromptCursor = phase === 'prompt';
  const showThinking =
    phase === 'thinking' ||
    phase === 'planning' ||
    phase === 'coding';
  const showPreview =
    phase === 'preview' || phase === 'hold';

  return (
    <div className="rounded-2xl bg-white dark:bg-[#0a0a0a] border border-stone-200 dark:border-white/10 overflow-hidden shadow-xl shadow-black/[0.06] dark:shadow-2xl dark:shadow-black/30">
      {/* ── Prompt input area ──────────────────────────────────────── */}
      <div className="px-5 pt-5 pb-3">
        <div className="flex items-start gap-3">
          {/* User avatar */}
          <div className="w-6 h-6 rounded-full bg-stone-100 dark:bg-white/10 flex items-center justify-center shrink-0 mt-0.5">
            <span className="text-[9px] font-semibold text-stone-400 dark:text-white/50">U</span>
          </div>
          {/* Prompt text */}
          <div className="flex-1 min-w-0">
            <div className="text-[10px] text-stone-400 dark:text-white/30 mb-1 font-medium">
              You
            </div>
            <p className="text-[13px] text-stone-800 dark:text-white/80 leading-relaxed min-h-[20px]">
              {promptText}
              {showPromptCursor && (
                <motion.span
                  className="inline-block w-[2px] h-[14px] bg-stone-500 dark:bg-white/50 ml-0.5 align-middle"
                  animate={{ opacity: [1, 0] }}
                  transition={{ duration: 0.6, repeat: Infinity }}
                />
              )}
            </p>
          </div>
        </div>
      </div>

      {/* Divider */}
      <div className="h-px bg-stone-200 dark:bg-white/[0.06]" />

      {/* ── AI response panel ──────────────────────────────────────── */}
      <div
        ref={scrollRef}
        className="px-5 py-4 space-y-4 max-h-[300px] overflow-y-auto scrollbar-none"
      >
        {/* PM Agent — thinking / planning */}
        <AnimatePresence>
          {(phase !== 'prompt') && (
            <motion.div
              className="space-y-3"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
            >
              {/* Agent header */}
              <div className="flex items-center gap-2">
                <AgentBadge
                  name="PM Agent"
                  color="bg-blue-400"
                  active={phase === 'thinking' || phase === 'planning'}
                />
                {showThinking && phase !== 'coding' && <ThinkingDots />}
              </div>

              {/* Plan steps */}
              {planChecked.length > 0 && (
                <div className="ml-5 space-y-2">
                  {PLAN_STEPS.map((step, i) => (
                    <motion.div
                      key={step}
                      className="flex items-start gap-2"
                      initial={{ opacity: 0, x: -6 }}
                      animate={
                        planChecked.includes(i)
                          ? { opacity: 1, x: 0 }
                          : {}
                      }
                      transition={{ duration: 0.25 }}
                    >
                      <CheckIcon visible={planChecked.includes(i)} />
                      <span className="text-[11px] text-stone-500 dark:text-white/50 leading-relaxed">
                        {step}
                      </span>
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Liquid Agent — coding */}
        <AnimatePresence>
          {(phase === 'coding' ||
            phase === 'review' ||
            phase === 'preview' ||
            phase === 'hold') && (
            <motion.div
              className="space-y-3"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
            >
              {/* Agent header */}
              <div className="flex items-center gap-2">
                <AgentBadge
                  name="Liquid Agent"
                  color="bg-green-500"
                  active={phase === 'coding'}
                />
                {phase === 'coding' && <ThinkingDots />}
              </div>

              {/* Code block */}
              {codeVisible.length > 0 && (
                <div className="ml-5 rounded-lg bg-stone-50 dark:bg-white/[0.03] border border-stone-200 dark:border-white/[0.06] overflow-hidden">
                  <div className="flex items-center gap-2 px-3 py-1.5 border-b border-stone-200 dark:border-white/[0.06]">
                    <span className="text-[9px] text-stone-400 dark:text-white/30 tracking-wide">
                      hero-section.liquid
                    </span>
                  </div>
                  <div className="p-3 font-mono text-[11px] leading-[18px] overflow-x-auto">
                    <div className="flex">
                      {/* Line numbers */}
                      <div className="text-stone-300 dark:text-white/15 select-none mr-3 text-right w-5 shrink-0">
                        {codeVisible.map((_, i) => (
                          <div key={i}>{i + 1}</div>
                        ))}
                      </div>
                      {/* Code */}
                      <div className="flex-1 text-stone-600 dark:text-white/60 overflow-hidden">
                        {codeVisible.map((line, i) => (
                          <motion.div
                            key={i}
                            initial={{ opacity: 0, y: 3 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.06 }}
                          >
                            <LiquidCodeLine line={line} compact />
                            {i === codeVisible.length - 1 &&
                              phase === 'coding' && (
                                <motion.span
                                  className="inline-block w-[2px] h-[12px] bg-green-400 ml-0.5 align-middle"
                                  animate={{
                                    opacity: [1, 1, 0, 0],
                                  }}
                                  transition={{
                                    duration: 0.8,
                                    repeat: Infinity,
                                    times: [0, 0.5, 0.5, 1],
                                  }}
                                />
                              )}
                          </motion.div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Review Agent — validation */}
        <AnimatePresence>
          {reviewPassed && (
            <motion.div
              className="space-y-2"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
            >
              <div className="flex items-center gap-2">
                <AgentBadge
                  name="Review Agent"
                  color="bg-purple-400"
                  active={phase === 'review'}
                />
              </div>
              <motion.div
                className="ml-5 flex items-center gap-2"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{
                  duration: 0.4,
                  delay: 0.15,
                  ease: [0.22, 1, 0.36, 1],
                }}
              >
                <div className="w-4 h-4 rounded-full bg-green-500/20 flex items-center justify-center">
                  <svg
                    width="10"
                    height="10"
                    viewBox="0 0 10 10"
                    fill="none"
                    className="text-green-600 dark:text-green-400"
                  >
                    <path
                      d="M2 5.5L4 7.5L8 3"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
                <span className="text-[11px] text-green-600 dark:text-green-400 font-medium">
                  All checks passed
                </span>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Storefront preview ──────────────────────────────────────── */}
      <AnimatePresence>
        {showPreview && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="h-px bg-stone-200 dark:bg-white/[0.06]" />
            <StorefrontPreview />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
