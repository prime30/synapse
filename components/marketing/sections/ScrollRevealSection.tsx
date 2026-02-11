'use client';

import { useRef, useState, useCallback, useEffect } from 'react';
import { useScroll, useMotionValueEvent } from 'framer-motion';
import { FiberField } from '@/components/marketing/interactions/FiberField';
import { PixelAccent } from '@/components/marketing/interactions/PixelAccent';

const SENTENCE =
  'Five AI agents write, review, and ship production-ready Shopify themes.';
const WORDS = SENTENCE.split(' ');

export function ScrollRevealSection() {
  const sectionRef = useRef<HTMLElement>(null);
  const stickyRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ['start start', 'end end'],
  });

  const [progress, setProgress] = useState(0);
  const [cursor, setCursor] = useState<{ clientX: number; clientY: number } | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);

  useMotionValueEvent(scrollYProgress, 'change', (v) => {
    setProgress(v);
  });

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mq.matches);
    const handler = () => setReducedMotion(mq.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (reducedMotion) return;
      setCursor({ clientX: e.clientX, clientY: e.clientY });
    },
    [reducedMotion]
  );

  const handleMouseLeave = useCallback(() => {
    setCursor(null);
  }, []);

  const handleTouchStart = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      if (reducedMotion) return;
      const t = e.touches[0];
      if (t) setCursor({ clientX: t.clientX, clientY: t.clientY });
    },
    [reducedMotion]
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      if (reducedMotion) return;
      const t = e.touches[0];
      if (t) setCursor({ clientX: t.clientX, clientY: t.clientY });
    },
    [reducedMotion]
  );

  const handleTouchEnd = useCallback(() => {
    setCursor(null);
  }, []);

  const effectiveCursor = reducedMotion ? null : cursor;

  const getWordOpacity = (index: number): number => {
    const wordPos = (index + 1) / WORDS.length;
    if (progress >= wordPos) return 1;
    const transitionStart = wordPos - 0.08;
    if (progress >= transitionStart) {
      return (progress - transitionStart) / 0.08;
    }
    return 0;
  };

  return (
    <section
      ref={sectionRef}
      data-navbar-theme="light"
      className="relative isolate bg-[#fafaf9] dark:bg-[#0a0a0a]"
      style={{ height: '300vh' }}
    >
      {/* Vertical frame lines (max-w-6xl) */}
      <div className="absolute inset-0 max-w-6xl mx-auto pointer-events-none z-[1]" aria-hidden="true">
        <div className="relative h-full">
          <div className="absolute top-0 bottom-0 left-0 w-px bg-stone-200 dark:bg-white/10" />
          <div className="absolute top-0 bottom-0 right-0 w-px bg-stone-200 dark:bg-white/10" />
        </div>
      </div>

      {/* Sticky viewport */}
      <div
        ref={stickyRef}
        data-synaptic-sticky
        className="sticky top-0 z-0 h-screen flex items-center justify-center overflow-hidden relative"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
      >
        {/* Layer 1: soft green-tinted gradient at bottom */}
        <div
          className="absolute bottom-0 left-0 right-0 h-[50%] transition-opacity duration-500 pointer-events-none"
          style={{ opacity: 0.4 + 0.6 * progress }}
          aria-hidden="true"
        >
          <div className="absolute inset-0 bg-gradient-to-t from-emerald-50/60 via-cyan-50/30 to-transparent dark:from-emerald-950/30 dark:via-cyan-950/15 dark:to-transparent" />
        </div>

        {/* Layer 2: Fiber field canvas — extends below viewport so origin is hidden */}
        <div
          className="absolute left-0 right-0 w-full pointer-events-none synaptic-layer-fade synaptic-layer-fade-delay"
          style={{ top: '15%', height: '120%' }}
          aria-hidden="true"
        >
          <FiberField
            intensity={progress}
            cursor={effectiveCursor}
            containerRef={stickyRef}
            textRef={textRef}
            className="absolute inset-0 w-full h-full"
          />
        </div>

        {/* Layer 3: Text content */}
        <div ref={textRef} className="relative max-w-4xl mx-auto px-6 text-center z-[2]">
          <p className="text-4xl md:text-5xl lg:text-6xl font-medium leading-tight tracking-[-0.02em]">
            {WORDS.map((word, i) => (
              <span
                key={i}
                className="inline-block mr-[0.25em] transition-opacity duration-150"
                style={{ opacity: getWordOpacity(i) }}
              >
                {word === 'production-ready' ? (
                  <PixelAccent>{word}</PixelAccent>
                ) : (
                  <span
                    className={
                      getWordOpacity(i) > 0.5
                        ? 'text-stone-900 dark:text-white'
                        : 'text-stone-300 dark:text-white/15'
                    }
                  >
                    {word}
                  </span>
                )}
              </span>
            ))}
          </p>
        </div>
      </div>
    </section>
  );
}
