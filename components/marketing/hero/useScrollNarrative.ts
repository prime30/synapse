'use client';

import { useRef, useState } from 'react';
import { useScroll, useTransform, useMotionValueEvent, MotionValue } from 'framer-motion';

export interface ScrollNarrativeReturn {
  containerRef: React.RefObject<HTMLDivElement | null>;
  scrollYProgress: MotionValue<number>;
  foldIndex: number;
  foldProgress: MotionValue<number>;
  totalProgress: MotionValue<number>;
}

const FOLD_COUNT = 5;

export function useScrollNarrative(): ScrollNarrativeReturn {
  const containerRef = useRef<HTMLDivElement>(null);
  const [foldIndex, setFoldIndex] = useState(0);

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start start', 'end end'],
  });

  // Track which fold we're in
  useMotionValueEvent(scrollYProgress, 'change', (latest) => {
    const newIndex = Math.min(Math.floor(latest * FOLD_COUNT), FOLD_COUNT - 1);
    if (newIndex !== foldIndex) {
      setFoldIndex(Math.max(0, newIndex));
    }
  });

  // Progress within the current fold (0-1)
  const foldProgress = useTransform(scrollYProgress, (v) => {
    const foldSize = 1 / FOLD_COUNT;
    const currentFold = Math.min(Math.floor(v * FOLD_COUNT), FOLD_COUNT - 1);
    return (v - currentFold * foldSize) / foldSize;
  });

  return {
    containerRef,
    scrollYProgress,
    foldIndex,
    foldProgress,
    totalProgress: scrollYProgress,
  };
}
