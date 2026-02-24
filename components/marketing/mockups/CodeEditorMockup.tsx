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

const STOREFRONT_PRODUCTS = [
  { name: 'Botanical Serum', price: '$48', img: 'https://images.unsplash.com/photo-1556228578-0d85b1a4d571?w=200&h=200&fit=crop&crop=center&q=80' },
  { name: 'Rose Hip Oil', price: '$36', img: 'https://images.unsplash.com/photo-1571781926291-c477ebfd024b?w=200&h=200&fit=crop&crop=center&q=80' },
  { name: 'Hydra Cream', price: '$52', img: 'https://images.unsplash.com/photo-1612817288484-6f916006741a?w=200&h=200&fit=crop&crop=center&q=80' },
  { name: 'Aloe Mist', price: '$28', img: 'https://images.unsplash.com/photo-1608248543803-ba4f8c70ae0b?w=200&h=200&fit=crop&crop=center&q=80' },
  { name: 'Night Repair', price: '$64', img: 'https://images.unsplash.com/photo-1631729371254-42c2892f0e6e?w=200&h=200&fit=crop&crop=center&q=80' },
  { name: 'Glow Drops', price: '$42', img: 'https://images.unsplash.com/photo-1617897903246-719242758050?w=200&h=200&fit=crop&crop=center&q=80' },
];

const HERO_SLIDES = [
  {
    tag: 'Summer 2026',
    title: ['The Art of', 'Natural Beauty'],
    desc: 'Botanical extracts blended with modern science for radiant, healthy skin.',
    cta: 'Shop Now',
    bgImg: 'https://images.unsplash.com/photo-1556228578-0d85b1a4d571?w=900&h=500&fit=crop&crop=center&q=80',
  },
  {
    tag: 'New Arrivals',
    title: ['Fresh', 'Botanicals'],
    desc: 'Discover our newest formulations crafted from rare plant extracts.',
    cta: 'Explore',
    bgImg: 'https://images.unsplash.com/photo-1571781926291-c477ebfd024b?w=900&h=500&fit=crop&crop=center&q=80',
  },
  {
    tag: 'Limited Edition',
    title: ['Summer', 'Collection'],
    desc: 'Seasonal essentials for sun-kissed, hydrated skin all day long.',
    cta: 'Shop Collection',
    bgImg: 'https://images.unsplash.com/photo-1608248543803-ba4f8c70ae0b?w=900&h=500&fit=crop&crop=center&q=80',
  },
];

function StorefrontPreview() {
  const [heroIndex, setHeroIndex] = useState(0);
  const [cartCount, setCartCount] = useState(0);
  const [pulseIndex, setPulseIndex] = useState(-1);
  const [scrollY, setScrollY] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isDark, setIsDark] = useState(false);

  // Detect theme
  useEffect(() => {
    const check = () => setIsDark(document.documentElement.classList.contains('dark'));
    check();
    const observer = new MutationObserver(check);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const heroTimer = setInterval(() => {
      setHeroIndex((prev) => (prev + 1) % HERO_SLIDES.length);
    }, 2500);

    const scrollDown = setTimeout(() => setScrollY(50), 800);
    const scrollBack = setTimeout(() => setScrollY(0), 1800);

    const pulseTimer = setTimeout(() => {
      setPulseIndex(0);
      setCartCount(1);
      setTimeout(() => setPulseIndex(-1), 400);
    }, 1200);

    const pulse2 = setTimeout(() => {
      setPulseIndex(3);
      setCartCount(2);
      setTimeout(() => setPulseIndex(-1), 400);
    }, 3000);

    return () => {
      clearInterval(heroTimer);
      clearTimeout(scrollDown);
      clearTimeout(scrollBack);
      clearTimeout(pulseTimer);
      clearTimeout(pulse2);
    };
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollY, behavior: 'smooth' });
    }
  }, [scrollY]);

  const slide = HERO_SLIDES[heroIndex];

  // Track scroll for nav glass effect
  const [navScrolled, setNavScrolled] = useState(false);
  const handleContentScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setNavScrolled(e.currentTarget.scrollTop > 20);
  }, []);

  return (
    <div className={`h-full flex flex-col overflow-hidden relative ${isDark ? 'bg-[oklch(0.19_0.03_130)]' : 'bg-[oklch(0.985_0.001_106)]'}`}>
      {/* Everything in one relative container */}
      <div className="flex-1 min-h-0 relative">
        {/* Floating announcement + nav — pinned over content */}
        <div className="absolute top-0 left-0 right-0 z-20">
          {/* Announcement bar — slim */}
          <motion.div
            className={`pt-0 pb-px text-center ${isDark ? 'bg-[oklch(0.31_0.04_135)]/90' : 'bg-[oklch(0.39_0.06_135)]/90'} backdrop-blur-sm`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
          >
            <span className="text-[6px] text-white/70 tracking-wider uppercase">
              Free shipping on orders over $75
            </span>
          </motion.div>
          {/* Nav — transparent, glass on scroll */}
          <div
            className={`flex items-center justify-between px-6 py-2 transition-all duration-300 ${
              navScrolled
                ? isDark
                  ? 'bg-[oklch(0.21_0_0)]/80 backdrop-blur-md border-b border-white/[0.08]'
                  : 'bg-white/80 backdrop-blur-md border-b border-stone-200/60'
                : 'bg-transparent border-b border-transparent'
            }`}
          >
          <span className={`text-[11px] font-bold tracking-[0.12em] transition-colors duration-300 ${
            navScrolled && !isDark ? 'text-stone-900' : 'text-white'
          }`}>
            BOTANIQ
          </span>
          <div className="flex items-center gap-4">
            {['Shop', 'Collections', 'About'].map((item) => (
              <span key={item} className={`text-[10px] transition-colors duration-300 ${
                navScrolled
                  ? isDark ? 'text-white/60' : 'text-stone-600'
                  : 'text-white/70'
              }`}>{item}</span>
            ))}
            <div className="relative">
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" className={`transition-colors duration-300 ${
                navScrolled
                  ? isDark ? 'text-white/50' : 'text-stone-500'
                  : 'text-white/60'
              }`}>
                <path d="M1 1h2l1.5 8h8L15 3H4.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                <circle cx="6" cy="13" r="1" fill="currentColor" />
                <circle cx="12" cy="13" r="1" fill="currentColor" />
              </svg>
              <AnimatePresence>
                {cartCount > 0 && (
                  <motion.span
                    key={cartCount}
                    className="absolute -top-1.5 -right-1.5 w-3 h-3 rounded-full bg-emerald-500 text-white text-[6px] font-bold flex items-center justify-center"
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 15 }}
                  >
                    {cartCount}
                  </motion.span>
                )}
              </AnimatePresence>
            </div>
          </div>
          </div>
        </div>

        {/* Scrollable content — starts behind the nav */}
        <div ref={scrollRef} className="h-full overflow-y-auto overflow-x-hidden" onScroll={handleContentScroll}>
          {/* Hero banner — full-bleed background image */}
          <div className="relative h-[240px] overflow-hidden bg-black">
          {/* Full-bleed background image with cross-fade */}
          <AnimatePresence mode="wait">
            <motion.img
              key={`bg-${heroIndex}`}
              src={slide.bgImg}
              alt=""
              className="absolute inset-0 w-full h-full object-cover"
              initial={{ opacity: 0, scale: 1.05 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
              loading="eager"
            />
          </AnimatePresence>

          {/* Dark overlay for text legibility */}
          <div className="absolute inset-0 bg-black/40" />

          {/* Text overlay */}
          <AnimatePresence mode="wait">
            <motion.div
              key={`text-${heroIndex}`}
              className="absolute inset-0 flex flex-col justify-end px-6 pb-6"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className="text-[8px] text-emerald-300/80 tracking-[0.2em] uppercase font-medium mb-1.5">
                {slide.tag}
              </div>
              <h2 className="text-[22px] md:text-[26px] font-semibold text-white leading-[1.1] tracking-[-0.02em]">
                {slide.title[0]}<br />{slide.title[1]}
              </h2>
              <p className="text-[9px] text-white/60 mt-2 leading-relaxed max-w-[180px]">
                {slide.desc}
              </p>
              <span className="inline-block mt-3 px-4 py-1.5 bg-white text-stone-900 text-[8px] font-semibold rounded-full w-fit">
                {slide.cta}
              </span>
            </motion.div>
          </AnimatePresence>

          {/* Slide dots */}
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1 z-10">
            {HERO_SLIDES.map((_, i) => (
              <div
                key={i}
                className={`h-1 rounded-full transition-all duration-300 ${
                  i === heroIndex ? 'w-3 bg-white/90' : 'w-1 bg-white/30'
                }`}
              />
            ))}
          </div>
        </div>

        {/* Section heading */}
        <div className="px-4 pt-3 pb-2">
          <div className="flex items-center justify-between">
            <span className={`text-[9px] font-medium ${isDark ? 'text-white/70' : 'text-stone-700'}`}>
              Featured Products
            </span>
            <span className={`text-[7px] ${isDark ? 'text-emerald-400/60' : 'text-emerald-600/70'}`}>
              View all
            </span>
          </div>
        </div>

        {/* Product grid */}
        <div className="px-4 pb-4 grid grid-cols-3 gap-2">
          {STOREFRONT_PRODUCTS.map((product, i) => (
            <motion.div
              key={product.name}
              className={`rounded-md overflow-hidden transition-all duration-200 ${
                isDark
                  ? `bg-white/[0.04] border border-white/[0.06] ${pulseIndex === i ? 'ring-1 ring-emerald-400/50 scale-[1.03]' : ''}`
                  : `bg-white border border-stone-200 shadow-sm ${pulseIndex === i ? 'ring-1 ring-emerald-500/50 scale-[1.03]' : ''}`
              }`}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.35,
                delay: 0.3 + i * 0.08,
                ease: [0.22, 1, 0.36, 1],
              }}
            >
              <img
                src={product.img}
                alt={product.name}
                className="h-[42px] w-full object-cover"
                loading="eager"
              />
              <div className="p-1.5">
                <div className={`text-[7px] truncate ${isDark ? 'text-white/60' : 'text-stone-700'}`}>{product.name}</div>
                <div className={`text-[7px] ${isDark ? 'text-white/40' : 'text-stone-500'}`}>{product.price}</div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
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

  // Auto-scroll single editor to bottom as new lines appear
  useEffect(() => {
    if (editorRef.current) {
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
      timerRef.current = setTimeout(() => setPhase('preview'), 1500);
    }

    if (phase === 'preview') {
      timerRef.current = setTimeout(() => setPhase('pause'), 5000);
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
    <div className="rounded-2xl bg-white dark:bg-[oklch(0.178_0_0)] border border-stone-200 dark:border-white/10 overflow-hidden h-[400px] flex flex-col">
      {/* Title bar */}
      <div className="h-10 bg-stone-50 dark:bg-[oklch(0.145_0_0)] border-b border-stone-200 dark:border-white/5 flex items-center px-4 gap-2">
        <div className="w-2.5 h-2.5 rounded-full bg-[oklch(0.63_0.22_20)]" />
        <div className="w-2.5 h-2.5 rounded-full bg-[oklch(0.84_0.16_80)]" />
        <div className="w-2.5 h-2.5 rounded-full bg-[oklch(0.72_0.19_145)]" />
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

      {/* Body — editor base layer + review overlay + slide-up preview */}
      <div className="flex-1 min-h-0 relative overflow-hidden">
        {/* ── Editor (always rendered) ─────────────────────────────────── */}
        <div className="absolute inset-0 flex">
          {isCodingOrComplete ? (
            /* ── 3-pane layout during coding/complete ── */
            <div className="flex-1 min-h-0 flex flex-col overflow-hidden w-full">
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
                        ? 'bg-accent/10 dark:bg-accent/10 text-accent dark:text-accent font-medium'
                        : 'text-stone-400 dark:text-white/40'
                    }`}
                  >
                    {f.name}
                  </div>
                ))}
              </div>

              <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
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
                  className="flex-1 min-h-0 p-4 font-mono text-[12px] leading-6 overflow-y-auto overflow-x-hidden"
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
        </div>

        {/* ── Review overlay (during complete phase) ───────────────────── */}
        <AnimatePresence>
          {complete && !isPreview && (
            <motion.div
              className="absolute inset-0 z-10 flex items-center justify-center bg-white/80 dark:bg-[oklch(0.178_0_0)]/80 backdrop-blur-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            >
              <motion.div
                className="flex flex-col items-center gap-3"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.4, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
              >
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-purple-400" />
                  <span className="text-[13px] font-medium text-stone-600 dark:text-white/70">Review Agent</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded-full bg-green-500/20 flex items-center justify-center">
                    <svg width="12" height="12" viewBox="0 0 10 10" fill="none" className="text-green-600 dark:text-green-400">
                      <path d="M2 5.5L4 7.5L8 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <span className="text-[13px] text-green-600 dark:text-green-400 font-medium">All checks passed</span>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Preview (slides up from bottom) ──────────────────────────── */}
        <AnimatePresence>
          {isPreview && (
            <motion.div
              className="absolute inset-x-0 bottom-0 z-20 h-full bg-white dark:bg-[oklch(0.178_0_0)]"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            >
              <StorefrontPreview />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Status bar */}
      <div className="h-8 bg-stone-50 dark:bg-[oklch(0.145_0_0)] border-t border-stone-200 dark:border-white/5 flex items-center px-4 gap-4">
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

/** Equilateral-triangle caret: 5 dots, animation sweeps bottom-left → apex → bottom-right. */
const CARET_ORDER = [3, 1, 0, 2, 4]; // animation sequence
function ThinkingCaretIcon() {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const id = setInterval(() => {
      setStep((prev) => (prev + 1) % CARET_ORDER.length);
    }, 400);
    return () => clearInterval(id);
  }, []);
  const activeDot = CARET_ORDER[step];
  const dot = (i: number) =>
    `w-1 h-1 rounded-full absolute transition-colors duration-200 ${
      i === activeDot ? 'bg-stone-600 dark:bg-white/80' : 'bg-stone-300 dark:bg-white/20'
    }`;
  /* 16 x 14 px box — equilateral triangle positions (dot = 4px)
   *        [0]          x:6  y:0
   *      [1] [2]        x:3  y:5   x:9  y:5
   *     [3]   [4]       x:0  y:10  x:12 y:10
   */
  return (
    <span className="relative inline-block" style={{ width: 16, height: 14 }} aria-hidden>
      <span className={dot(0)} style={{ left: 6, top: 0 }} />
      <span className={dot(1)} style={{ left: 3, top: 5 }} />
      <span className={dot(2)} style={{ left: 9, top: 5 }} />
      <span className={dot(3)} style={{ left: 0, top: 10 }} />
      <span className={dot(4)} style={{ left: 12, top: 10 }} />
    </span>
  );
}

