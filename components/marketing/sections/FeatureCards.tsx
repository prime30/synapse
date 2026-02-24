'use client';

import { useRef, useState, useEffect, startTransition } from 'react';
import { motion, useInView, AnimatePresence } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { PixelAccent } from '@/components/marketing/interactions/PixelAccent';
import { MagneticElement } from '@/components/marketing/interactions/MagneticElement';
import { LiquidCodeLine } from '@/components/marketing/utils/LiquidCodeLine';

/* ------------------------------------------------------------------ */
/*  Animated mockups — light/dark themed with narrative animations     */
/* ------------------------------------------------------------------ */

const CODE_CARD_LINES = [
  '{% schema %}',
  '  { "name": "Hero Banner",',
  '    "tag": "section",',
  '    "settings": [',
  '      { "type": "text", "id": "heading" },',
  '      { "type": "richtext", "id": "sub" },',
  '      { "type": "url", "id": "cta_url" }',
  '    ] }',
  '{% endschema %}',
  '',
  '<section class="hero">',
  '  <div class="hero__container">',
  '    <h1>{{ section.settings.heading }}</h1>',
  '    <div class="hero__sub">',
  '      {{ section.settings.sub }}',
  '    </div>',
  '    <div class="hero__cta">',
  '      <a href="{{ section.settings.cta_url }}"',
  '         class="btn btn--primary">',
  '        Shop Now',
  '      </a>',
  '    </div>',
  '  </div>',
  '</section>',
];

const CARD_AGENTS = [
  { name: 'Code', color: 'bg-green-500' },
  { name: 'Design', color: 'bg-blue-400' },
  { name: 'QA', color: 'bg-purple-400' },
];

function CodeMockup({ inView }: { inView: boolean }) {
  const [visibleLines, setVisibleLines] = useState(0);
  const [activeAgent, setActiveAgent] = useState(-1);
  const [checksPassed, setChecksPassed] = useState(false);
  const codeScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!inView) return;
    setVisibleLines(0);
    setActiveAgent(0);
    setChecksPassed(false);

    let line = 0;
    const id = setInterval(() => {
      line++;
      if (line <= CODE_CARD_LINES.length) {
        setVisibleLines(line);
        if (line === Math.floor(CODE_CARD_LINES.length * 0.6)) setActiveAgent(1);
      } else {
        clearInterval(id);
        setActiveAgent(2);
        setTimeout(() => setChecksPassed(true), 400);
      }
    }, 120);
    return () => clearInterval(id);
  }, [inView]);

  // Auto-scroll code area to bottom as new lines appear
  useEffect(() => {
    if (codeScrollRef.current) {
      codeScrollRef.current.scrollTop = codeScrollRef.current.scrollHeight;
    }
  }, [visibleLines]);

  return (
    <div className="rounded-xl bg-stone-50 dark:bg-[oklch(0.178_0_0)] border border-stone-200 dark:border-white/5 overflow-hidden h-[220px] sm:h-[280px] md:h-[400px] flex flex-col">
      <div className="h-7 bg-stone-100 dark:bg-[oklch(0.145_0_0)] border-b border-stone-200 dark:border-white/5 flex items-center px-3 gap-1.5 shrink-0">
        <div className="w-2 h-2 rounded-full bg-[oklch(0.63_0.22_20)]" />
        <div className="w-2 h-2 rounded-full bg-[oklch(0.84_0.16_80)]" />
        <div className="w-2 h-2 rounded-full bg-[oklch(0.72_0.19_145)]" />
        <span className="ml-3 text-[10px] text-stone-400 dark:text-white/40">hero-section.liquid</span>
      </div>
      <div ref={codeScrollRef} className="flex-1 min-h-0 p-3 font-mono text-[11px] sm:text-[10px] leading-5 overflow-y-auto">
        {CODE_CARD_LINES.slice(0, visibleLines).map((lineContent, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.08 }}
          >
            <LiquidCodeLine line={lineContent} compact />
            {i === visibleLines - 1 && !checksPassed && (
              <motion.span
                className="inline-block w-[2px] h-[12px] bg-blue-500 dark:bg-accent ml-0.5 align-middle"
                animate={{ opacity: [1, 1, 0, 0] }}
                transition={{ duration: 0.8, repeat: Infinity, times: [0, 0.5, 0.5, 1] }}
              />
            )}
          </motion.div>
        ))}
      </div>
      <div className="h-7 bg-stone-100 dark:bg-[oklch(0.145_0_0)] border-t border-stone-200 dark:border-white/5 flex items-center px-3 gap-3">
        {CARD_AGENTS.map((a, idx) => (
          <div key={a.name} className="flex items-center gap-1">
            <div className={`w-1.5 h-1.5 rounded-full ${a.color} transition-transform duration-300 ${idx === activeAgent ? 'scale-150' : 'scale-100'}`} />
            <span className="text-[9px] text-stone-400 dark:text-white/40">{a.name}</span>
          </div>
        ))}
        <AnimatePresence>
          {checksPassed && (
            <motion.div
              className="flex items-center gap-1 ml-auto"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3 }}
            >
              <span className="text-[8px] text-green-500">&#10003;</span>
              <span className="text-[9px] text-green-600 dark:text-green-400">Passed</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function ContextMockup({ inView }: { inView: boolean }) {
  const deps = [
    { from: 'header.liquid', to: 'theme.css', type: 'css_class' },
    { from: 'header.liquid', to: 'nav.js', type: 'js_function' },
    { from: 'product.liquid', to: 'price.liquid', type: 'render' },
  ];
  return (
    <div className="rounded-xl bg-stone-50 dark:bg-[oklch(0.178_0_0)] border border-stone-200 dark:border-white/5 p-4 space-y-2">
      <div className="text-[9px] text-stone-400 dark:text-white/30 uppercase tracking-widest mb-2">Dependencies</div>
      {deps.map((dep, i) => (
        <motion.div
          key={dep.from + dep.to}
          className="flex items-center gap-2 text-[10px]"
          initial={{ opacity: 0, x: -8 }}
          animate={inView ? { opacity: 1, x: 0 } : { opacity: 0, x: -8 }}
          transition={{ duration: 0.3, delay: 0.2 + i * 0.15, ease: 'easeOut' }}
        >
          <span className="text-purple-600 dark:text-cyan-400">{dep.from}</span>
          <span className="text-stone-300 dark:text-white/20">&rarr;</span>
          <span className="text-accent dark:text-accent">{dep.to}</span>
          <span className="ml-auto text-stone-300 dark:text-white/20 text-[8px]">{dep.type}</span>
        </motion.div>
      ))}
    </div>
  );
}

function SyncStatusMockup({ inView }: { inView: boolean }) {
  const [connected, setConnected] = useState(false);
  const [deployed, setDeployed] = useState(false);

  useEffect(() => {
    if (!inView) return;
    startTransition(() => {
      setConnected(false);
      setDeployed(false);
    });
    const t1 = setTimeout(() => startTransition(() => setConnected(true)), 800);
    const t2 = setTimeout(() => startTransition(() => setDeployed(true)), 2800);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [inView]);

  return (
    <div className="rounded-xl bg-stone-50 dark:bg-[oklch(0.178_0_0)] border border-stone-200 dark:border-white/5 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <div className={`w-2 h-2 rounded-full transition-colors duration-500 ${connected ? 'bg-green-500' : 'bg-stone-300 dark:bg-white/20'}`} />
        <span className="text-[11px] text-stone-600 dark:text-white/60">
          {connected ? 'Connected' : 'Connecting...'}
        </span>
      </div>
      <AnimatePresence>
        {connected && (
          <motion.div
            className="rounded-lg bg-white dark:bg-white/5 border border-stone-200 dark:border-white/5 p-3"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            transition={{ duration: 0.3 }}
          >
            <p className="text-[11px] text-stone-700 dark:text-white/70 font-medium">my-store.myshopify.com</p>
            <p className="text-[9px] text-stone-400 dark:text-white/30 mt-1">Last synced 2 min ago</p>
          </motion.div>
        )}
      </AnimatePresence>
      <div className="flex gap-2">
        <div className="relative flex-1 h-7 rounded-lg bg-accent flex items-center justify-center overflow-hidden">
          <span className="relative z-10 text-[10px] text-white font-medium">Deploy</span>
          {connected && !deployed && (
            <motion.div
              className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"
              initial={{ x: '-100%' }}
              animate={{ x: '200%' }}
              transition={{ duration: 1.2, ease: 'easeInOut', repeat: 1 }}
            />
          )}
        </div>
        <div className="h-7 px-3 rounded-lg border border-stone-200 dark:border-white/10 flex items-center justify-center">
          <span className="text-[10px] text-stone-500 dark:text-white/50">Preview</span>
        </div>
      </div>
      <AnimatePresence>
        {deployed && (
          <motion.div
            className="flex items-center gap-1.5 pt-1"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
            <span className="text-[10px] text-green-600 dark:text-green-400 font-medium">Deployed to store</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const TIMELINE_ENTRIES = [
  { label: 'Updated hero section', time: '2 min ago' },
  { label: 'Added product grid', time: '15 min ago' },
  { label: 'Initial commit', time: '1 hour ago' },
];

function VersionTimelineMockup({ inView }: { inView: boolean }) {
  const [visibleCount, setVisibleCount] = useState(0);
  const [showNew, setShowNew] = useState(false);

  useEffect(() => {
    if (!inView) return;
    setVisibleCount(0);
    setShowNew(false);

    let count = 0;
    const id = setInterval(() => {
      count++;
      if (count <= TIMELINE_ENTRIES.length) {
        setVisibleCount(count);
      } else {
        clearInterval(id);
        setTimeout(() => setShowNew(true), 600);
      }
    }, 400);
    return () => clearInterval(id);
  }, [inView]);

  const entries = showNew
    ? [{ label: 'Deployed to production', time: 'Just now' }, ...TIMELINE_ENTRIES]
    : TIMELINE_ENTRIES;

  return (
    <div className="rounded-xl bg-stone-50 dark:bg-[oklch(0.178_0_0)] border border-stone-200 dark:border-white/5 p-4">
      <div className="flex items-start gap-3">
        <div className="flex flex-col items-center gap-0 pt-1">
          {entries.slice(0, showNew ? visibleCount + 1 : visibleCount).map((_, i) => (
            <div key={i}>
              {i === 0 ? (
                <motion.div
                  className="w-2 h-2 rounded-full bg-accent"
                  animate={{ scale: [1, 1.3, 1] }}
                  transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                />
              ) : (
                <div className="w-2 h-2 rounded-full bg-stone-300 dark:bg-white/20" />
              )}
              {i < (showNew ? visibleCount : visibleCount - 1) && (
                <div className="w-px h-8 bg-stone-200 dark:bg-white/10" />
              )}
            </div>
          ))}
        </div>
        <div className="flex-1 space-y-4">
          <AnimatePresence>
            {showNew && (
              <motion.div
                key="new-entry"
                initial={{ opacity: 0, x: -12, height: 0 }}
                animate={{ opacity: 1, x: 0, height: 'auto' }}
                transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              >
                <p className="text-[11px] text-green-600 dark:text-green-400 font-medium">Deployed to production</p>
                <p className="text-[9px] text-stone-400 dark:text-white/25">Just now</p>
              </motion.div>
            )}
          </AnimatePresence>
          {TIMELINE_ENTRIES.slice(0, visibleCount).map((e, i) => (
            <motion.div
              key={e.label}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
            >
              <p className={`text-[11px] ${i === 0 && !showNew ? 'text-stone-700 dark:text-white/80' : 'text-stone-400 dark:text-white/40'}`}>{e.label}</p>
              <p className="text-[9px] text-stone-400 dark:text-white/25">{e.time}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}

function LiquidValidationMockup({ inView }: { inView: boolean }) {
  const checks = [
    { label: 'Syntax' },
    { label: 'Type safety' },
    { label: 'Schema' },
    { label: 'Performance' },
  ];

  return (
    <div className="rounded-xl bg-stone-50 dark:bg-[oklch(0.178_0_0)] border border-stone-200 dark:border-white/5 p-4 space-y-2">
      {checks.map((check, i) => (
        <motion.div
          key={check.label}
          className="flex items-center gap-2"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={inView ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.3, delay: 0.15 * i, ease: 'easeOut' }}
        >
          <motion.div
            className="w-3.5 h-3.5 rounded border border-green-500/50 flex items-center justify-center"
            initial={{ scale: 0.8 }}
            animate={inView ? { scale: 1 } : { scale: 0.8 }}
            transition={{ duration: 0.3, delay: 0.15 * i + 0.1, ease: [0.22, 1, 0.36, 1] }}
          >
            <span className="text-[8px] text-green-500">&#10003;</span>
          </motion.div>
          <span className="text-[11px] text-stone-600 dark:text-white/50">{check.label}</span>
        </motion.div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Card definitions                                                   */
/* ------------------------------------------------------------------ */

interface FeatureCardDef {
  label: string;
  title: string;
  description: string;
  Mockup: React.ComponentType<{ inView: boolean }>;
}

const FEATURE_CARDS: FeatureCardDef[] = [
  {
    label: 'AI ENGINE',
    title: 'AI Code Generation',
    description:
      'Watch five specialized agents write, validate, and review Liquid, JavaScript, and CSS. Context-aware, type-safe, with automated code review.',
    Mockup: CodeMockup,
  },
  {
    label: 'CONTEXT',
    title: 'Context Intelligence',
    description:
      'Automatic dependency detection across Liquid, CSS, and JavaScript. Every change is analyzed for cross-file impact.',
    Mockup: ContextMockup,
  },
  {
    label: 'INTEGRATION',
    title: 'Shopify Sync',
    description:
      'One-click sync, preview, and deploy to your store.',
    Mockup: SyncStatusMockup,
  },
  {
    label: 'HISTORY',
    title: 'Version Control',
    description:
      'Full history with undo/redo. Track every change across your entire theme.',
    Mockup: VersionTimelineMockup,
  },
  {
    label: 'INTELLIGENCE',
    title: 'Liquid Intelligence',
    description:
      'Real-time syntax validation and type checking for every template.',
    Mockup: LiquidValidationMockup,
  },
];

/* ------------------------------------------------------------------ */
/*  Clean row divider (no + marks)                                     */
/* ------------------------------------------------------------------ */

function RowDivider() {
  return (
    <div className="relative left-1/2 -translate-x-1/2 w-screen">
      <div className="h-px bg-stone-200 dark:bg-white/10" />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Secondary feature: label + title + one line (no mockup)             */
/* ------------------------------------------------------------------ */

const CARD_GLOW_COLORS = [
  '0.745 0.189 148',   // green — Context Intelligence
  '0.623 0.214 259',   // blue — Shopify Sync
  '0.586 0.262 293',   // purple — Version Control
  '0.715 0.143 215',   // cyan — Liquid Intelligence
];

function SecondaryFeatureCard({
  card,
  inView,
  index,
}: {
  card: FeatureCardDef;
  inView: boolean;
  index: number;
}) {
  const [tick, setTick] = useState(0);
  const started = useRef(false);

  useEffect(() => {
    if (!inView || started.current) return;
    const staggerDelay = index * 400;
    const timeout = setTimeout(() => {
      started.current = true;
      const id = setInterval(() => {
        setTick((t) => { if (t > 50) { clearInterval(id); return t; } return t + 1; });
      }, 30);
    }, staggerDelay);
    return () => clearTimeout(timeout);
  }, [inView, index]);

  const rgb = CARD_GLOW_COLORS[index % CARD_GLOW_COLORS.length];
  const powerPct = Math.min(1, Math.max(0, (tick - 5) / 20));
  const showGlow = tick > 5;

  return (
    <motion.div
      className="relative rounded-xl"
      initial={{ opacity: 0, y: 12 }}
      animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 12 }}
      transition={{ duration: 0.4, delay: 0.2 + index * 0.05, ease: [0.22, 1, 0.36, 1] }}
      style={{
        boxShadow: showGlow
          ? `0 0 ${12 + powerPct * 20}px oklch(${rgb} / ${0.08 + powerPct * 0.15}), 0 0 ${40 + powerPct * 25}px oklch(${rgb} / ${powerPct * 0.06})`
          : undefined,
        transition: 'box-shadow 0.5s ease-out',
      }}
    >
      {showGlow && (
        <div className="absolute -inset-px rounded-xl overflow-hidden pointer-events-none" aria-hidden="true">
          <div
            className="absolute"
            style={{
              width: '200%',
              height: '200%',
              top: '-50%',
              left: '-50%',
              background: `conic-gradient(from 0deg at 50% 50%, transparent 0deg, oklch(${rgb} / 0.5) 60deg, oklch(${rgb} / 0.7) 90deg, transparent 150deg, transparent 360deg)`,
              animation: powerPct >= 1 ? 'prompt-border-spin 3s linear infinite' : undefined,
              transform: `rotate(${powerPct * 360}deg)`,
            }}
          />
          <div className="absolute inset-[1.5px] rounded-[10px] bg-[oklch(0.985_0.001_106)] dark:bg-[oklch(0.178_0_0)]" />
        </div>
      )}
      <div
        className={`relative p-5 md:p-6 rounded-xl bg-[oklch(0.985_0.001_106)] dark:bg-[oklch(0.178_0_0)] transition-colors duration-500 ${showGlow ? '' : 'border border-stone-200 dark:border-white/10'}`}
      >
        <span className="text-[10px] font-medium tracking-widest uppercase text-stone-400 dark:text-white/40">
          {card.label}
        </span>
        <h3 className="text-base font-medium text-stone-900 dark:text-white mt-1.5">
          {card.title}
        </h3>
        <p className="text-sm text-stone-500 dark:text-white/50 mt-1 leading-snug">
          {card.description}
        </p>
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Cell: a single card cell within the grid                           */
/* ------------------------------------------------------------------ */

function CardCell({
  card,
  inView,
  index,
  large,
}: {
  card: FeatureCardDef;
  inView: boolean;
  index: number;
  large?: boolean;
}) {
  return (
    <motion.div
      className="group/card relative p-6 md:p-8 overflow-hidden"
      initial={{ opacity: 0, y: 20 }}
      animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
      transition={{ duration: 0.5, delay: 0.1 + index * 0.1, ease: [0.22, 1, 0.36, 1] as const }}
    >
      {/* Hover gradient overlay */}
      <div
        className="absolute inset-0 opacity-0 group-hover/card:opacity-100 transition-opacity duration-300 pointer-events-none bg-gradient-to-br from-accent/[0.04] via-transparent to-sky-500/[0.04]"
        aria-hidden="true"
      />
      {large && (
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-accent/20 to-transparent" aria-hidden="true" />
      )}

      <div className="relative">
        <span className="section-badge">{card.label}</span>
        <h3 className={`font-medium text-stone-900 dark:text-white ${large ? 'text-xl md:text-2xl' : 'text-lg'}`}>
          {card.title}
        </h3>
        <p className="text-sm text-stone-500 dark:text-white/50 mt-2 max-w-md">
          {card.description}
        </p>
        {large && (
          <MagneticElement strength={4} radius={80}>
            <a
              href="#"
              className="inline-flex items-center gap-1 text-sm text-accent hover:text-accent-hover mt-4 transition-colors"
            >
              Learn more <ArrowRight size={14} />
            </a>
          </MagneticElement>
        )}
      </div>

      {/* Mockup — no background fill, inherits parent */}
      <div className={`relative ${large ? 'mt-6' : 'mt-4'} -mx-6 md:-mx-8 px-6 md:px-8 py-4 ${large ? 'md:py-5' : ''}`}>
        <card.Mockup inView={inView} />
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Section header — typewriter with cursor                            */
/* ------------------------------------------------------------------ */

const TYPEWRITER_TEXT = 'Built for speed. Designed for craft.';
const TYPEWRITER_SPEED = 40; // ms per character

function FeatureSectionHeader({ inView }: { inView: boolean }) {
  const [charCount, setCharCount] = useState(0);
  const [started, setStarted] = useState(false);
  const [showSubtext, setShowSubtext] = useState(false);

  // Start typing when section comes into view
  useEffect(() => {
    if (inView && !started) {
      setStarted(true);
      setCharCount(0);
      setShowSubtext(false);
    }
    if (!inView) {
      setStarted(false);
      setCharCount(0);
      setShowSubtext(false);
    }
  }, [inView, started]);

  // Type characters one by one
  useEffect(() => {
    if (!started) return;
    if (charCount >= TYPEWRITER_TEXT.length) {
      const t = setTimeout(() => setShowSubtext(true), 300);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setCharCount((c) => c + 1), TYPEWRITER_SPEED);
    return () => clearTimeout(t);
  }, [started, charCount]);

  const visible = TYPEWRITER_TEXT.slice(0, charCount);
  const done = charCount >= TYPEWRITER_TEXT.length;

  // Split visible text to inject PixelAccent on "speed" and "craft"
  function renderTyped() {
    const speedStart = TYPEWRITER_TEXT.indexOf('speed');
    const speedEnd = speedStart + 5;
    const craftStart = TYPEWRITER_TEXT.indexOf('craft');
    const craftEnd = craftStart + 5;

    const parts: React.ReactNode[] = [];
    let i = 0;

    // Helper to push a plain text segment
    const pushPlain = (end: number) => {
      if (i < end && i < charCount) {
        parts.push(<span key={`t-${i}`}>{visible.slice(i, Math.min(end, charCount))}</span>);
        i = Math.min(end, charCount);
      }
    };

    // Helper to push an accented segment
    const pushAccent = (start: number, end: number) => {
      if (charCount > start) {
        const accentText = visible.slice(start, Math.min(end, charCount));
        parts.push(<PixelAccent key={`a-${start}`}>{accentText}</PixelAccent>);
        i = Math.min(end, charCount);
      }
    };

    pushPlain(speedStart);
    pushAccent(speedStart, speedEnd);
    pushPlain(craftStart);
    pushAccent(craftStart, craftEnd);
    pushPlain(TYPEWRITER_TEXT.length);

    return parts;
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 md:px-10 py-16 md:py-24 pb-16">
      {/* Badge */}
      <motion.span
        className="section-badge inline-block"
        initial={{ opacity: 0, y: 8 }}
        animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 8 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      >
        PLATFORM
      </motion.span>

      {/* Headline with typewriter */}
      <h2 className="text-left max-w-xl text-4xl md:text-5xl font-medium text-stone-900 dark:text-white tracking-[-0.02em] mt-0">
        {started && renderTyped()}
        {/* Blinking cursor */}
        {started && !done && (
          <motion.span
            className="inline-block w-[3px] h-[0.85em] bg-accent align-baseline ml-0.5 -mb-0.5"
            animate={{ opacity: [1, 1, 0, 0] }}
            transition={{ duration: 0.8, repeat: Infinity, times: [0, 0.5, 0.5, 1] }}
          />
        )}
        {/* Cursor fades out when done */}
        {started && done && (
          <motion.span
            className="inline-block w-[3px] h-[0.85em] bg-accent align-baseline ml-0.5 -mb-0.5"
            initial={{ opacity: 1 }}
            animate={{ opacity: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
          />
        )}
      </h2>

      {/* Subtext fades in after typing completes */}
      <motion.p
        className="text-left max-w-lg text-lg text-stone-500 dark:text-white/50 mt-6"
        initial={{ opacity: 0, y: 10 }}
        animate={showSubtext ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      >
        Production-ready tools that understand Shopify at the code level.
      </motion.p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function FeatureCards() {
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, { once: false, margin: '-80px' });

  return (
    <section
      ref={ref}
      data-navbar-theme="light"
      className="relative bg-white dark:bg-[oklch(0.145_0_0)]"
    >
      <div className="absolute inset-0 max-w-6xl mx-auto pointer-events-none" aria-hidden="true">
        <div className="relative h-full">
          <div className="absolute top-0 bottom-0 left-0 w-px bg-stone-200 dark:bg-white/10" />
          <div className="absolute top-0 bottom-0 right-0 w-px bg-stone-200 dark:bg-white/10" />
        </div>
      </div>

      {/* Section header — typewriter entrance */}
      <FeatureSectionHeader inView={inView} />

      {/* Divider */}
      <RowDivider />

      {/* Primary feature: AI Code Generation — full width, clear focus */}
      <div className="max-w-6xl mx-auto">
        <CardCell card={FEATURE_CARDS[0]} inView={inView} index={0} large />
      </div>

      {/* Divider */}
      <RowDivider />

      {/* Secondary features: compact list, no mockups */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 md:px-10 py-12 md:py-16">
        <p className="text-sm font-medium text-stone-400 dark:text-white/40 uppercase tracking-wider mb-6">
          More from the platform
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {FEATURE_CARDS.slice(1).map((card, i) => (
            <SecondaryFeatureCard
              key={card.title}
              card={card}
              inView={inView}
              index={i}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

