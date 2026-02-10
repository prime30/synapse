'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { LiquidCodeLine } from '@/components/marketing/utils/LiquidCodeLine';

/* ------------------------------------------------------------------ */
/*  Data                                                               */
/* ------------------------------------------------------------------ */

const FILES = [
  { name: 'theme.liquid', active: false },
  { name: 'hero.liquid', active: true },
  { name: 'product.liquid', active: false },
  { name: 'theme.css', active: false },
  { name: 'price.liquid', active: false },
];

const AGENTS = [
  { name: 'PM', color: 'bg-blue-400' },
  { name: 'Liquid', color: 'bg-green-500' },
  { name: 'CSS', color: 'bg-pink-400' },
  { name: 'JS', color: 'bg-amber-400' },
  { name: 'Review', color: 'bg-purple-400' },
];

const USER_PROMPT = 'Build a hero section with headline, subheading, and CTA button';

const PLAN_STEPS = [
  'Delegate hero.liquid to Liquid Agent',
  'Delegate hero.css to CSS Agent',
  'Delegate hero.js to JS Agent',
];

const CODE_LINES = [
  '{% schema %}',
  '  { "name": "Hero Banner",',
  '    "tag": "section",',
  '    "settings": [',
  '      { "type": "text", "id": "heading" },',
  '      { "type": "text", "id": "subheading" },',
  '      { "type": "url", "id": "cta_url" }',
  '    ] }',
  '{% endschema %}',
  '',
  '<!-- AI-generated hero section -->',
  '<section class="hero">',
  '  <div class="hero__container">',
  '    <h1>{{ section.settings.heading }}</h1>',
  '    <p class="hero__sub">',
  '      {{ section.settings.subheading }}',
  '    </p>',
  '    <div class="hero__cta">',
  '      <a href="{{ section.settings.cta_url }}"',
  '         class="btn btn--primary">',
  '        {{ section.settings.cta_text }}',
  '      </a>',
  '    </div>',
  '  </div>',
  '</section>',
];

const CSS_LINES = [
  '.hero {',
  '  display: flex;',
  '  flex-direction: column;',
  '  align-items: center;',
  '  padding: 4rem 2rem;',
  '  text-align: center;',
  '}',
  '',
  '.hero h1 {',
  '  font-size: clamp(2rem, 5vw, 3.5rem);',
  '  line-height: 1.1;',
  '  letter-spacing: -0.02em;',
  '}',
  '',
  '.btn--primary {',
  '  background: var(--color-primary);',
  '  padding: 0.75rem 2rem;',
  '  border-radius: 9999px;',
  '}',
];

const JS_LINES = [
  'class HeroSection extends HTMLElement {',
  '  connectedCallback() {',
  '    this.observer = new',
  '      IntersectionObserver(',
  '        this.onIntersect.bind(this)',
  '      );',
  '    this.observer.observe(this);',
  '  }',
  '',
  '  onIntersect(entries) {',
  '    entries.forEach(entry => {',
  '      if (entry.isIntersecting) {',
  '        this.classList.add(',
  "          'hero--visible'",
  '        );',
  '      }',
  '    });',
  '  }',
  '}',
];

type Phase = 'prompt' | 'thinking' | 'planning' | 'coding' | 'complete' | 'preview' | 'pause';

/* ------------------------------------------------------------------ */
/*  Storefront Preview — rendered output of the hero section           */
/* ------------------------------------------------------------------ */

function PerfumeBottleSvg() {
  return (
    <svg viewBox="0 0 80 180" fill="none" className="w-full h-full drop-shadow-2xl">
      {/* Spray nozzle */}
      <rect x="35" y="0" width="10" height="6" rx="1.5" fill="#b8c4b0" />
      <rect x="33" y="6" width="14" height="4" rx="1" fill="#94a88a" />
      {/* Cap band */}
      <rect x="28" y="10" width="24" height="14" rx="2" fill="#5a6b50" />
      <rect x="30" y="12" width="20" height="2" rx="1" fill="rgba(255,255,255,0.15)" />
      {/* Neck */}
      <rect x="32" y="24" width="16" height="12" rx="2" fill="#6b7f60" />
      <rect x="34" y="26" width="3" height="8" rx="1.5" fill="rgba(255,255,255,0.1)" />
      {/* Shoulder taper */}
      <path d="M32 36 L20 52 L20 52 L60 52 L48 36 Z" fill="#4a6340" />
      <path d="M32 36 L24 48 L24 48 L34 48 L34 36 Z" fill="rgba(255,255,255,0.07)" />
      {/* Main body */}
      <rect x="18" y="50" width="44" height="110" rx="6" fill="url(#bottleGrad)" />
      {/* Body highlight — left edge */}
      <rect x="20" y="54" width="6" height="90" rx="3" fill="rgba(255,255,255,0.1)" />
      {/* Body shadow — right edge */}
      <rect x="54" y="54" width="5" height="90" rx="2.5" fill="rgba(0,0,0,0.12)" />
      {/* Label area */}
      <rect x="24" y="80" width="32" height="46" rx="3" fill="rgba(255,255,255,0.12)" stroke="rgba(255,255,255,0.08)" strokeWidth="0.5" />
      {/* Label text lines */}
      <rect x="30" y="88" width="20" height="2" rx="1" fill="rgba(255,255,255,0.35)" />
      <rect x="32" y="94" width="16" height="1.5" rx="0.75" fill="rgba(255,255,255,0.2)" />
      <rect x="34" y="99" width="12" height="1" rx="0.5" fill="rgba(255,255,255,0.12)" />
      {/* Decorative line on label */}
      <rect x="30" y="108" width="20" height="0.5" rx="0.25" fill="rgba(255,255,255,0.15)" />
      <rect x="33" y="112" width="14" height="1" rx="0.5" fill="rgba(255,255,255,0.1)" />
      {/* Bottom edge */}
      <rect x="18" y="154" width="44" height="6" rx="3" fill="#3a5230" />
      {/* Gradient defs */}
      <defs>
        <linearGradient id="bottleGrad" x1="18" y1="50" x2="62" y2="160" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#5a7a4c" />
          <stop offset="0.4" stopColor="#4a6340" />
          <stop offset="1" stopColor="#3a5230" />
        </linearGradient>
      </defs>
    </svg>
  );
}

function StorefrontPreview() {
  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Store nav — over dark bg */}
      <div className="flex items-center justify-between px-6 py-2.5 bg-[#1a1a1a] border-b border-white/[0.06]">
        <span className="text-[11px] font-bold text-white/90 tracking-[0.12em]">BOTANIQ</span>
        <div className="flex items-center gap-4">
          {['Shop', 'Collections', 'About'].map((item) => (
            <span key={item} className="text-[10px] text-white/50">{item}</span>
          ))}
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" className="text-white/40">
            <path d="M1 1h2l1.5 8h8L15 3H4.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="6" cy="13" r="1" fill="currentColor" />
            <circle cx="12" cy="13" r="1" fill="currentColor" />
          </svg>
        </div>
      </div>

      {/* Hero section — dark gradient with perfume bottle */}
      <div className="flex-1 relative bg-gradient-to-br from-[#1c2a18] via-[#243320] to-[#0f1a0d] overflow-hidden">
        {/* Subtle radial glow behind bottle */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_65%_55%,rgba(90,122,76,0.25),transparent)]" />

        {/* Content grid: text left, bottle right */}
        <div className="relative h-full flex items-center px-6 gap-2">
          {/* Left — text */}
          <motion.div
            className="flex-1 min-w-0"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="text-[8px] text-emerald-400/70 tracking-[0.2em] uppercase font-medium mb-2">
              Summer 2026
            </div>
            <h2 className="text-[18px] md:text-[20px] font-semibold text-white leading-[1.15] tracking-[-0.02em]">
              The Art of
              <br />
              Natural Beauty
            </h2>
            <p className="text-[9px] text-white/40 mt-2 leading-relaxed max-w-[140px]">
              Botanical extracts blended with modern science for radiant, healthy skin.
            </p>
            <motion.div
              className="mt-4"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.4, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
            >
              <span className="inline-block px-4 py-1.5 bg-white/10 backdrop-blur-sm border border-white/20 text-white text-[8px] font-medium rounded-full hover:bg-white/15 transition-colors">
                Shop Now
              </span>
            </motion.div>
          </motion.div>

          {/* Right — perfume bottle */}
          <motion.div
            className="w-[80px] h-[160px] shrink-0"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
          >
            <PerfumeBottleSvg />
          </motion.div>
        </div>

        {/* Bottom fade */}
        <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-[#0f1a0d] to-transparent" />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/*  Agent code pane (used during coding/complete)                      */
/* ------------------------------------------------------------------ */

function AgentCodePane({
  file,
  agent,
  color,
  lines,
  isWriting,
  isDone,
}: {
  file: string;
  agent: string;
  color: string;
  lines: string[];
  isWriting: boolean;
  isDone: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [lines.length]);

  return (
    <div className="flex-1 min-w-0 flex flex-col border-r border-stone-200 dark:border-white/5 last:border-r-0">
      <div className="flex items-center justify-between px-3 py-2 border-b border-stone-100 dark:border-white/5 bg-stone-50/50 dark:bg-white/[0.02]">
        <span className="text-[10px] text-stone-500 dark:text-white/50 truncate">{file}</span>
        <div className="flex items-center gap-1 shrink-0 ml-2">
          <div className={`w-1.5 h-1.5 rounded-full ${color} ${isWriting ? 'animate-pulse' : ''}`} />
          {isDone && (
            <div className="w-3 h-3 rounded border border-green-500/50 flex items-center justify-center">
              <span className="text-[8px] text-green-500">&#10003;</span>
            </div>
          )}
        </div>
      </div>
      <div
        ref={scrollRef}
        className="flex-1 overflow-hidden p-2 sm:p-3 font-mono text-[9px] sm:text-[10px] leading-[1.6] overflow-y-auto"
      >
        {lines.map((line, i) => (
          <motion.div
            key={i}
            className="text-stone-600 dark:text-white/50 whitespace-pre"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.08 }}
          >
            {line || '\u00A0'}
          </motion.div>
        ))}
        {isWriting && lines.length > 0 && (
          <motion.span
            className="inline-block w-[2px] h-[11px] bg-accent align-middle"
            animate={{ opacity: [1, 1, 0, 0] }}
            transition={{ duration: 0.8, repeat: Infinity, times: [0, 0.5, 0.5, 1] }}
          />
        )}
        {lines.length === 0 && (
          <span className="text-stone-300 dark:text-white/15 italic text-[9px]">Waiting...</span>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export function CodeEditorMockup() {
  const [phase, setPhase] = useState<Phase>('prompt');
  const [promptText, setPromptText] = useState('');
  const [thinkingLabel, setThinkingLabel] = useState('');
  const [planVisible, setPlanVisible] = useState<number[]>([]);
  const [liquidLines, setLiquidLines] = useState<string[]>([]);
  const [cssLines, setCssLines] = useState<string[]>([]);
  const [jsLines, setJsLines] = useState<string[]>([]);
  const [complete, setComplete] = useState(false);
  const [activeAgent, setActiveAgent] = useState(-1);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const liquidIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cssTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cssIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const jsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const jsIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const editorRef = useRef<HTMLDivElement>(null);

  const cleanup = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (liquidIntervalRef.current) clearInterval(liquidIntervalRef.current);
    if (cssTimerRef.current) clearTimeout(cssTimerRef.current);
    if (cssIntervalRef.current) clearInterval(cssIntervalRef.current);
    if (jsTimerRef.current) clearTimeout(jsTimerRef.current);
    if (jsIntervalRef.current) clearInterval(jsIntervalRef.current);
  }, []);

  // Auto-scroll single editor to bottom when in prompt/thinking/planning (single-pane uses liquidLines for "waiting")
  useEffect(() => {
    if (editorRef.current && phase !== 'coding' && phase !== 'complete') {
      editorRef.current.scrollTop = editorRef.current.scrollHeight;
    }
  }, [liquidLines.length, phase]);

  // When all three panes finish during coding, transition to complete
  useEffect(() => {
    if (
      phase !== 'coding' ||
      liquidLines.length < CODE_LINES.length ||
      cssLines.length < CSS_LINES.length ||
      jsLines.length < JS_LINES.length
    ) {
      return;
    }
    const t = setTimeout(() => setPhase('complete'), 200);
    return () => clearTimeout(t);
  }, [phase, liquidLines.length, cssLines.length, jsLines.length]);

  // ── Main animation loop ─────────────────────────────────────────
  useEffect(() => {
    cleanup();

    if (phase === 'prompt') {
      let charIdx = 0;
      setPromptText('');
      setLiquidLines([]);
      setCssLines([]);
      setJsLines([]);
      setPlanVisible([]);
      setComplete(false);
      setActiveAgent(-1);
      setThinkingLabel('');

      intervalRef.current = setInterval(() => {
        charIdx++;
        if (charIdx <= USER_PROMPT.length) {
          setPromptText(USER_PROMPT.slice(0, charIdx));
        } else {
          clearInterval(intervalRef.current!);
          timerRef.current = setTimeout(() => setPhase('thinking'), 300);
        }
      }, 20);
    }

    if (phase === 'thinking') {
      setThinkingLabel('Analyzing requirements');
      setActiveAgent(0);
      timerRef.current = setTimeout(() => setPhase('planning'), 1000);
    }

    if (phase === 'planning') {
      setThinkingLabel('Building implementation plan');
      let step = 0;
      intervalRef.current = setInterval(() => {
        if (step < PLAN_STEPS.length) {
          setPlanVisible((prev) => [...prev, step]);
          step++;
        } else {
          clearInterval(intervalRef.current!);
          timerRef.current = setTimeout(() => {
            setPlanVisible([]);
            setPhase('coding');
          }, 400);
        }
      }, 250);
    }

    if (phase === 'coding') {
      setThinkingLabel('Writing code');
      // Liquid starts immediately
      let liquidIdx = 0;
      liquidIntervalRef.current = setInterval(() => {
        if (liquidIdx < CODE_LINES.length) {
          setLiquidLines((prev) => [...prev, CODE_LINES[liquidIdx]]);
          liquidIdx++;
        } else {
          if (liquidIntervalRef.current) clearInterval(liquidIntervalRef.current);
        }
      }, 85 + Math.random() * 30);

      // CSS starts after ~0.4s
      cssTimerRef.current = setTimeout(() => {
        let cssIdx = 0;
        cssIntervalRef.current = setInterval(() => {
          if (cssIdx < CSS_LINES.length) {
            setCssLines((prev) => [...prev, CSS_LINES[cssIdx]]);
            cssIdx++;
          } else {
            if (cssIntervalRef.current) clearInterval(cssIntervalRef.current);
          }
        }, 90 + Math.random() * 30);
      }, 400);

      // JS starts after ~0.8s
      jsTimerRef.current = setTimeout(() => {
        let jsIdx = 0;
        jsIntervalRef.current = setInterval(() => {
          if (jsIdx < JS_LINES.length) {
            setJsLines((prev) => [...prev, JS_LINES[jsIdx]]);
            jsIdx++;
          } else {
            if (jsIntervalRef.current) clearInterval(jsIntervalRef.current);
          }
        }, 95 + Math.random() * 30);
      }, 800);

      return cleanup;
    }

    if (phase === 'complete') {
      setThinkingLabel('');
      setActiveAgent(4); // Review
      setComplete(true);
      timerRef.current = setTimeout(() => setPhase('preview'), 1000);
    }

    if (phase === 'preview') {
      timerRef.current = setTimeout(() => setPhase('pause'), 2500);
    }

    if (phase === 'pause') {
      timerRef.current = setTimeout(() => setPhase('prompt'), 1500);
    }

    return cleanup;
  }, [phase, cleanup]);

  const showThinking = phase === 'thinking' || phase === 'planning' || phase === 'coding';
  const isPreview = phase === 'preview';
  const isCodingOrComplete = phase === 'coding' || phase === 'complete';
  const lineCount = liquidLines.length;

  // Active tab during coding: which pane is currently writing (or last written)
  const writingLiquid = liquidLines.length < CODE_LINES.length;
  const writingCss = cssLines.length < CSS_LINES.length;
  const writingJs = jsLines.length < JS_LINES.length;
  const activeTabIndex = writingLiquid ? 0 : writingCss ? 1 : 2;

  // Tab bar: during preview single "Preview" tab; during coding/complete show 3 tabs
  const codingTabs = [
    { file: 'hero.liquid', index: 0 },
    { file: 'hero.css', index: 1 },
    { file: 'hero.js', index: 2 },
  ];

  return (
    <div className="rounded-2xl bg-white dark:bg-[#111] border border-stone-200 dark:border-white/10 overflow-hidden min-h-[400px]">
      {/* Title bar */}
      <div className="h-10 bg-stone-50 dark:bg-[#0a0a0a] border-b border-stone-200 dark:border-white/5 flex items-center px-4 gap-2">
        <div className="w-2.5 h-2.5 rounded-full bg-[#ff5f57]" />
        <div className="w-2.5 h-2.5 rounded-full bg-[#febc2e]" />
        <div className="w-2.5 h-2.5 rounded-full bg-[#28c840]" />
        {isPreview ? (
          <div className="ml-4 px-3 py-1 text-[11px] text-stone-500 dark:text-white/60 bg-white dark:bg-white/5 border border-stone-200 dark:border-white/10 rounded-t transition-all duration-300">
            Preview
          </div>
        ) : isCodingOrComplete ? (
          <div className="ml-4 flex gap-0.5">
            {codingTabs.map((tab) => (
              <div
                key={tab.file}
                className={`px-3 py-1 text-[11px] border border-stone-200 dark:border-white/10 rounded-t transition-all duration-300 ${
                  tab.index === activeTabIndex
                    ? 'bg-white dark:bg-white/5 text-stone-700 dark:text-white/80 border-b-transparent dark:border-b-transparent -mb-px'
                    : 'text-stone-500 dark:text-white/50 bg-transparent'
                }`}
              >
                {tab.file}
              </div>
            ))}
          </div>
        ) : (
          <div className="ml-4 px-3 py-1 text-[11px] text-stone-500 dark:text-white/60 bg-white dark:bg-white/5 border border-stone-200 dark:border-white/10 rounded-t transition-all duration-300">
            hero-section.liquid
          </div>
        )}
      </div>

      {/* Body — cross-fade between editor and preview (fixed height) */}
      <div className="h-[320px] relative overflow-hidden">
        <AnimatePresence>
          {isPreview ? (
            <motion.div
              key="preview"
              className="absolute inset-0"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.5 }}
            >
              <StorefrontPreview />
            </motion.div>
          ) : (
            <motion.div
              key="editor"
              className="absolute inset-0 flex"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4 }}
            >
              {isCodingOrComplete ? (
                /* ── 3-pane layout during coding/complete ── */
                <div className="flex-1 flex flex-col overflow-hidden w-full">
                  {/* AI thinking bar (only during coding) */}
                  <AnimatePresence>
                    {phase === 'coding' && (
                      <motion.div
                        className="flex items-center gap-2 px-4 py-2 border-b border-stone-100 dark:border-white/5 shrink-0"
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.2 }}
                      >
                        <ThinkingCaretIcon />
                        <span className="text-[11px] text-stone-400 dark:text-white/40">
                          {thinkingLabel}
                        </span>
                        <ThinkingDots />
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <div className="flex flex-1 min-h-0">
                    <AgentCodePane
                      file="hero.liquid"
                      agent="Liquid"
                      color="bg-green-500"
                      lines={liquidLines}
                      isWriting={liquidLines.length < CODE_LINES.length}
                      isDone={liquidLines.length >= CODE_LINES.length && CODE_LINES.length > 0}
                    />
                    <AgentCodePane
                      file="hero.css"
                      agent="CSS"
                      color="bg-pink-400"
                      lines={cssLines}
                      isWriting={cssLines.length < CSS_LINES.length}
                      isDone={cssLines.length >= CSS_LINES.length && CSS_LINES.length > 0}
                    />
                    <AgentCodePane
                      file="hero.js"
                      agent="JS"
                      color="bg-amber-400"
                      lines={jsLines}
                      isWriting={jsLines.length < JS_LINES.length}
                      isDone={jsLines.length >= JS_LINES.length && JS_LINES.length > 0}
                    />
                  </div>
                </div>
              ) : (
                /* ── Sidebar + single editor (prompt / thinking / planning) ── */
                <>
                  <div className="w-40 border-r border-stone-200 dark:border-white/5 bg-stone-50/50 dark:bg-transparent p-3 hidden sm:block">
                    <div className="text-[9px] text-stone-400 dark:text-white/30 tracking-widest uppercase mb-3">Files</div>
                    {FILES.map((f) => (
                      <div
                        key={f.name}
                        className={`py-1.5 px-2 rounded text-[11px] ${
                          f.active
                            ? 'bg-blue-50 dark:bg-sky-500/10 text-blue-600 dark:text-sky-400 font-medium'
                            : 'text-stone-400 dark:text-white/40'
                        }`}
                      >
                        {f.name}
                      </div>
                    ))}
                  </div>

                  <div className="flex-1 flex flex-col overflow-hidden">
                    <AnimatePresence>
                      {promptText && (
                        <motion.div
                          className="flex items-start gap-2 px-4 py-3 border-b border-stone-100 dark:border-white/5 bg-stone-50/50 dark:bg-white/[0.02] shrink-0"
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.2 }}
                        >
                          <div className="w-5 h-5 rounded-full bg-stone-200 dark:bg-white/10 flex items-center justify-center shrink-0 mt-0.5">
                            <span className="text-[9px] font-medium text-stone-500 dark:text-white/50">U</span>
                          </div>
                          <p className="text-[12px] text-stone-600 dark:text-white/60 leading-relaxed">
                            {promptText}
                            {phase === 'prompt' && (
                              <motion.span
                                className="inline-block w-[2px] h-[13px] bg-stone-400 dark:bg-white/40 ml-0.5 align-middle"
                                animate={{ opacity: [1, 0] }}
                                transition={{ duration: 0.6, repeat: Infinity }}
                              />
                            )}
                          </p>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    <AnimatePresence>
                      {showThinking && (
                        <motion.div
                          className="flex items-center gap-2 px-4 py-2 border-b border-stone-100 dark:border-white/5 shrink-0"
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.2 }}
                        >
                          <ThinkingCaretIcon />
                          <span className="text-[11px] text-stone-400 dark:text-white/40">
                            {thinkingLabel}
                          </span>
                          <ThinkingDots />
                        </motion.div>
                      )}
                    </AnimatePresence>

                    <AnimatePresence>
                      {planVisible.length > 0 && (
                        <motion.div
                          className="px-4 py-2 space-y-1 border-b border-stone-100 dark:border-white/5 shrink-0"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.15 }}
                        >
                          {PLAN_STEPS.map((step, i) => (
                            <motion.div
                              key={step}
                              className="flex items-center gap-2 text-[11px] text-stone-500 dark:text-white/40"
                              initial={{ opacity: 0, x: -8 }}
                              animate={planVisible.includes(i) ? { opacity: 1, x: 0 } : {}}
                              transition={{ duration: 0.2 }}
                            >
                              <span className="w-1 h-1 rounded-full bg-stone-300 dark:bg-white/20" />
                              {step}
                            </motion.div>
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>

                    <div
                      ref={editorRef}
                      className="flex-1 p-4 font-mono text-[12px] leading-6 overflow-y-auto overflow-x-hidden"
                    >
                      <div className="flex">
                        <div className="text-stone-300 dark:text-white/20 select-none mr-4 text-right w-6 shrink-0">
                          {liquidLines.map((_, i) => (
                            <div key={i}>{i + 1}</div>
                          ))}
                        </div>
                        <div className="flex-1 overflow-hidden text-stone-700 dark:text-white/60">
                          {liquidLines.map((line, i) => (
                            <motion.div
                              key={i}
                              initial={{ opacity: 0, y: 4 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ duration: 0.08 }}
                            >
                              <LiquidCodeLine line={line} compact={false} />
                            </motion.div>
                          ))}
                          {lineCount === 0 && (phase === 'prompt' || phase === 'thinking' || phase === 'planning') && (
                            <div className="text-stone-300 dark:text-white/15 italic text-[11px]">
                              Waiting for instructions...
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Status bar */}
      <div className="h-8 bg-stone-50 dark:bg-[#0a0a0a] border-t border-stone-200 dark:border-white/5 flex items-center px-4 gap-4">
        {AGENTS.map((agent, idx) => {
          const isActive =
            (phase === 'thinking' || phase === 'planning') ? idx === 0 :
            phase === 'coding' ? (idx === 1 || idx === 2 || idx === 3) :
            phase === 'complete' ? idx === 4 : false;
          return (
            <div key={agent.name} className="flex items-center gap-1.5">
              <div
                className={`w-1.5 h-1.5 rounded-full ${agent.color} transition-transform duration-300 ${
                  isActive ? 'scale-150' : 'scale-100'
                }`}
              />
              <span className="text-[10px] text-stone-400 dark:text-white/40">{agent.name}</span>
            </div>
          );
        })}

        {/* QA check / Deployed badge */}
        <AnimatePresence mode="wait">
          {isPreview ? (
            <motion.div
              key="deployed"
              className="flex items-center gap-1.5 ml-auto"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
            >
              <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
              <span className="text-[10px] text-green-600 dark:text-green-400 font-medium">Deployed to store</span>
            </motion.div>
          ) : complete ? (
            <motion.div
              key="checks"
              className="flex items-center gap-1 ml-auto"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
            >
              <div className="w-3.5 h-3.5 rounded border border-green-500/50 flex items-center justify-center">
                <span className="text-[8px] text-green-500">&#10003;</span>
              </div>
              <span className="text-[10px] text-green-600 dark:text-green-400">All checks passed</span>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

/** 7-dot up-caret: one lit dot travels through positions; others dim. */
function ThinkingCaretIcon() {
  const [activeIndex, setActiveIndex] = useState(0);
  useEffect(() => {
    const id = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % 7);
    }, 140);
    return () => clearInterval(id);
  }, []);
  const dotClass = (i: number) =>
    i === activeIndex
      ? 'bg-stone-600 dark:bg-white/80'
      : 'bg-stone-300 dark:bg-white/25';
  return (
    <span className="inline-flex flex-col items-center gap-0.5" aria-hidden>
      <span className="flex justify-center">
        <span className={`w-1 h-1 rounded-full transition-colors duration-150 ${dotClass(0)}`} />
      </span>
      <span className="flex gap-1">
        <span className={`w-1 h-1 rounded-full transition-colors duration-150 ${dotClass(1)}`} />
        <span className={`w-1 h-1 rounded-full transition-colors duration-150 ${dotClass(2)}`} />
      </span>
      <span className="flex gap-1">
        <span className={`w-1 h-1 rounded-full transition-colors duration-150 ${dotClass(3)}`} />
        <span className={`w-1 h-1 rounded-full transition-colors duration-150 ${dotClass(4)}`} />
      </span>
      <span className="flex gap-1">
        <span className={`w-1 h-1 rounded-full transition-colors duration-150 ${dotClass(5)}`} />
        <span className={`w-1 h-1 rounded-full transition-colors duration-150 ${dotClass(6)}`} />
      </span>
    </span>
  );
}

function ThinkingDots() {
  return (
    <span className="inline-flex items-center gap-0.5">
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
