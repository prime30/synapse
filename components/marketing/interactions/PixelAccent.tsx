'use client';

import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';

interface PixelAccentProps {
  children: string;
  className?: string;
  /** Delay before fade-in starts (seconds) */
  delay?: number;
}

/**
 * PixelAccent — accent word in Geist Pixel Square font with a smooth fade-in.
 * Stays in the dot pixel font permanently. No flickering or font cycling.
 */
export function PixelAccent({
  children,
  className,
  delay = 0,
}: PixelAccentProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: false, margin: '-40px' });

  return (
    <motion.span
      ref={ref}
      className={`inline-block text-accent font-pixel-circle leading-[1.05] ${className ?? ''}`}
      initial={{ opacity: 0, filter: 'blur(3px)' }}
      animate={inView ? { opacity: 1, filter: 'blur(0px)' } : {}}
      transition={{ duration: 0.6, delay, ease: 'easeOut' }}
    >
      {children}
    </motion.span>
  );
}
