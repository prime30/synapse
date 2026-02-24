'use client';

import { ReactNode, useRef } from 'react';
import { motion } from 'framer-motion';

interface BentoCarouselProps {
  children: ReactNode;
  className?: string;
}

export function BentoCarousel({ children, className = '' }: BentoCarouselProps) {
  const constraintsRef = useRef<HTMLDivElement>(null);

  return (
    <div className={`relative overflow-hidden ${className}`}>
      <motion.div
        ref={constraintsRef}
        className="overflow-hidden cursor-grab active:cursor-grabbing"
      >
        <motion.div
          className="flex gap-6 px-6 md:px-12"
          drag="x"
          dragConstraints={constraintsRef}
          dragElastic={0.1}
          dragMomentum
          style={{ width: 'max-content' }}
        >
          {children}
        </motion.div>
      </motion.div>

      {/* Fade edges */}
      <div className="absolute inset-y-0 left-0 w-12 bg-gradient-to-r from-[oklch(0.145_0_0)] to-transparent pointer-events-none z-10" />
      <div className="absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-[oklch(0.145_0_0)] to-transparent pointer-events-none z-10" />
    </div>
  );
}
