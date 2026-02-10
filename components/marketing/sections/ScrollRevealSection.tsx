'use client';

import { useRef, useState } from 'react';
import { useScroll, useMotionValueEvent } from 'framer-motion';
import { SynapticTexture } from '@/components/marketing/interactions/SynapticTexture';
import { PixelAccent } from '@/components/marketing/interactions/PixelAccent';

const SENTENCE = 'Five AI agents write, review, and ship production-ready Shopify themes while you sleep.';
const WORDS = SENTENCE.split(' ');

export function ScrollRevealSection() {
  const sectionRef = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ['start start', 'end end'],
  });

  const [progress, setProgress] = useState(0);

  useMotionValueEvent(scrollYProgress, 'change', (v) => {
    setProgress(v);
  });

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
      className="relative bg-[#fafaf9] dark:bg-[#0a0a0a]"
      style={{ height: '300vh' }}
    >
      <div className="absolute inset-0 max-w-6xl mx-auto pointer-events-none z-[1]" aria-hidden="true">
        <div className="relative h-full">
          <div className="absolute top-0 bottom-0 left-0 w-px bg-stone-200 dark:bg-white/10" />
          <div className="absolute top-0 bottom-0 right-0 w-px bg-stone-200 dark:bg-white/10" />
        </div>
      </div>

      <div className="sticky top-0 h-screen flex items-center justify-center overflow-hidden max-w-6xl mx-auto">
        {/* Synaptic texture — fill entire section */}
        <div className="absolute inset-0 w-full h-full pointer-events-none">
          <SynapticTexture
            intensity={progress}
            className="absolute inset-0 w-full h-full opacity-60"
          />
        </div>

        {/* Word-by-word reveal */}
        <div className="relative max-w-4xl mx-auto px-6 text-center">
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
                  <span className={
                    getWordOpacity(i) > 0.5
                      ? 'text-stone-900 dark:text-white'
                      : 'text-stone-300 dark:text-white/15'
                  }>
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
