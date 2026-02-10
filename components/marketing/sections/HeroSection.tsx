'use client';

import { useRef, useState, useEffect } from 'react';
import { motion, useScroll, useTransform, AnimatePresence } from 'framer-motion';
import { Check } from 'lucide-react';
import Link from 'next/link';
import { MagneticElement } from '@/components/marketing/interactions/MagneticElement';
import { PixelAccent } from '@/components/marketing/interactions/PixelAccent';
import { CodeEditorMockup } from '@/components/marketing/mockups/CodeEditorMockup';
import { usePageReady } from '@/components/marketing/PreloaderContext';
import { useAuthModal } from '@/components/marketing/AuthModalContext';

const ROTATING_WORDS = ['themes', 'stores', 'clients', 'sections', 'features', 'fixes'];

const entryTransition = (delay: number) => ({
  duration: 0.5,
  delay,
  ease: [0.22, 1, 0.36, 1] as const,
});

const show = { opacity: 1, y: 0 };
const hide = { opacity: 0 };

export default function HeroSection() {
  const ready = usePageReady();
  const { openAuthModal } = useAuthModal();
  const sectionRef = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ['start start', 'end start'],
  });

  // Parallax: mockup stays in place while page scrolls over it
  const mockupY = useTransform(scrollYProgress, [0, 1], [0, 120]);

  // Rotating accent word
  const [wordIndex, setWordIndex] = useState(0);
  useEffect(() => {
    const id = setInterval(() => {
      setWordIndex((prev) => (prev + 1) % ROTATING_WORDS.length);
    }, 2500);
    return () => clearInterval(id);
  }, []);

  return (
    <section
      ref={sectionRef}
      data-navbar-theme="light"
      className="relative bg-[#fafaf9] dark:bg-[#0a0a0a] overflow-hidden"
    >
      {/* ── CSS animated gradient blobs ─────────────────────────────── */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
        <div
          className="absolute w-[600px] h-[600px] rounded-full opacity-[0.15] dark:opacity-[0.08]"
          style={{
            background: 'radial-gradient(circle, #28CD56 0%, transparent 70%)',
            filter: 'blur(120px)',
            top: '10%',
            left: '15%',
            animation: 'hero-blob-1 20s ease-in-out infinite',
          }}
        />
        <div
          className="absolute w-[500px] h-[500px] rounded-full opacity-[0.12] dark:opacity-[0.06]"
          style={{
            background: 'radial-gradient(circle, #615AF2 0%, transparent 70%)',
            filter: 'blur(120px)',
            top: '20%',
            right: '10%',
            animation: 'hero-blob-2 25s ease-in-out infinite',
          }}
        />
        <div
          className="absolute w-[450px] h-[450px] rounded-full opacity-[0.1] dark:opacity-[0.05]"
          style={{
            background: 'radial-gradient(circle, #F5A623 0%, transparent 70%)',
            filter: 'blur(120px)',
            bottom: '15%',
            left: '40%',
            animation: 'hero-blob-3 22s ease-in-out infinite',
          }}
        />
        <div
          className="absolute w-[400px] h-[400px] rounded-full opacity-[0.08] dark:opacity-[0.04]"
          style={{
            background: 'radial-gradient(circle, #00D1C1 0%, transparent 70%)',
            filter: 'blur(120px)',
            top: '50%',
            left: '5%',
            animation: 'hero-blob-2 18s ease-in-out infinite reverse',
          }}
        />
      </div>

      {/* Centered gradient glow — full-bleed behind mockup area */}
      <div
        className="absolute left-0 right-0 bottom-0 h-[70%] pointer-events-none z-0"
        style={{
          background: 'radial-gradient(ellipse 80% 60% at 50% 60%, rgba(40,205,86,0.14) 0%, rgba(40,205,86,0.05) 35%, transparent 70%)',
        }}
        aria-hidden="true"
      />

      {/* ── Content ─────────────────────────────────────────────────── */}
      <div className="absolute inset-0 max-w-6xl mx-auto pointer-events-none z-[1]" aria-hidden="true">
        <div className="relative h-full">
          <div className="absolute top-0 bottom-0 left-0 w-px bg-stone-200 dark:bg-white/10" />
          <div className="absolute top-0 bottom-0 right-0 w-px bg-stone-200 dark:bg-white/10" />
        </div>
      </div>

      <div className="relative max-w-6xl mx-auto px-8 md:px-10 z-10">
        <div className="max-w-4xl mx-auto text-center pt-28 md:pt-36">
          {/* Credibility Badge */}
          <motion.span
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-stone-200 dark:border-white/10 bg-white dark:bg-white/5 text-xs text-stone-500 dark:text-white/50 mb-8"
            initial={{ opacity: 0, y: 12 }}
            animate={ready ? show : hide}
            transition={entryTransition(0.3)}
          >
            <Check size={14} />
            Five AI agents. One workflow.
          </motion.span>

          {/* Headline — single line, never wraps, scales down on small screens */}
          <motion.h1
            className="relative whitespace-nowrap font-medium leading-[1.05] tracking-[-0.03em] text-[clamp(1.75rem,5.5vw,4.5rem)] h-[1.05em] overflow-hidden"
          >
            {['Ship', 'Shopify'].map((word, i) => (
              <span key={word} className="inline-block overflow-hidden">
                <motion.span
                  className="inline-block text-stone-900 dark:text-white"
                  initial={{ opacity: 0, y: '100%' }}
                  animate={ready ? show : hide}
                  transition={{
                    duration: 0.5,
                    delay: 0.4 + i * 0.08,
                    ease: [0.22, 1, 0.36, 1],
                  }}
                >
                  {word}
                </motion.span>
                {'\u00A0'}
              </span>
            ))}
            {/* Rotating accent word — width follows current word naturally */}
            <span
              className="inline-block overflow-hidden align-baseline relative"
              style={{ verticalAlign: 'baseline' }}
            >
              <AnimatePresence mode="popLayout">
                <motion.span
                  key={ROTATING_WORDS[wordIndex]}
                  className="inline-block whitespace-nowrap"
                  initial={{ opacity: 0, y: '110%' }}
                  animate={ready ? show : hide}
                  exit={{ opacity: 0, y: '-110%' }}
                  transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                >
                  <PixelAccent>{ROTATING_WORDS[wordIndex]}</PixelAccent>
                </motion.span>
              </AnimatePresence>
            </span>
            {'\u00A0'}
            <span className="inline-block overflow-hidden">
              <motion.span
                className="inline-block text-stone-900 dark:text-white"
                initial={{ opacity: 0, y: '100%' }}
                animate={ready ? show : hide}
                transition={{
                  duration: 0.5,
                  delay: 0.56,
                  ease: [0.22, 1, 0.36, 1],
                }}
              >
                faster.
              </motion.span>
            </span>
          </motion.h1>

          {/* Subtitle */}
          <motion.p
            className="text-lg md:text-xl text-stone-500 dark:text-white/50 mt-6 max-w-2xl mx-auto leading-relaxed"
            initial={{ opacity: 0, y: 12 }}
            animate={ready ? show : hide}
            transition={entryTransition(0.8)}
          >
            Five specialized AI agents write Liquid, JavaScript, and CSS — then
            review every change before it ships.
          </motion.p>

          {/* CTA */}
          <motion.div
            className="mt-10"
            initial={{ opacity: 0, y: 12 }}
            animate={ready ? show : hide}
            transition={entryTransition(1.0)}
          >
            <MagneticElement strength={6} radius={120}>
              <button
                type="button"
                onClick={() => openAuthModal('signup')}
                className="h-12 px-10 rounded-full bg-accent text-white font-medium text-[15px] hover:bg-accent-hover transition-colors"
              >
                Start Free
              </button>
            </MagneticElement>
          </motion.div>

          {/* Secondary Link */}
          <motion.div
            className="mt-4"
            initial={{ opacity: 0, y: 12 }}
            animate={ready ? show : hide}
            transition={entryTransition(1.0)}
          >
            <Link
              href="#demo"
              className="text-sm text-stone-500 dark:text-white/40 hover:text-accent transition-colors"
            >
              See it work &rarr;
            </Link>
          </motion.div>
        </div>

        {/* ── Product mockup — full width, parallax, scroll-animated ── */}
        <motion.div
          className="relative mt-10 md:mt-14"
          initial={{ opacity: 0, y: 40, scale: 0.97 }}
          animate={ready ? { opacity: 1, y: 0, scale: 1 } : hide}
          transition={{
            duration: 0.8,
            delay: 1.2,
            ease: [0.22, 1, 0.36, 1],
          }}
          style={{ y: mockupY }}
        >
          <div className="relative rounded-2xl overflow-hidden shadow-xl shadow-stone-300/30 dark:shadow-black/30">
            <CodeEditorMockup />
          </div>
        </motion.div>
      </div>

    </section>
  );
}
