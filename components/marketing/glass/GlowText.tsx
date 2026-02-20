'use client';

import { motion } from 'framer-motion';
import { ReactNode } from 'react';

interface GlowTextProps {
  children: ReactNode;
  as?: 'h1' | 'h2' | 'h3' | 'h4' | 'p' | 'span';
  className?: string;
  animate?: boolean;
  /** Accent = green + Geist circle pixel font (default). Use 'white' or 'warm-gray' for non-accent. */
  color?: 'accent' | 'white' | 'warm-gray';
}

// Pre-build motion components outside render to avoid React Compiler static-component error
const MOTION_TAGS = {
  h1: motion.create('h1'),
  h2: motion.create('h2'),
  h3: motion.create('h3'),
  h4: motion.create('h4'),
  p: motion.create('p'),
  span: motion.create('span'),
};

const colorMap = {
  accent: 'text-accent font-pixel-circle',
  white: 'text-white',
  'warm-gray': 'text-stone-500',
};

const glowColorMap = {
  accent: 'drop-shadow-[0_0_20px_rgba(40,205,86,0.35)]',
  white: 'drop-shadow-[0_0_20px_rgba(255,255,255,0.2)]',
  'warm-gray': 'drop-shadow-[0_0_15px_rgba(120,113,108,0.2)]',
};

const accentGlowKeyframes = [
  'drop-shadow(0 0 20px rgba(40,205,86,0.25))',
  'drop-shadow(0 0 36px rgba(40,205,86,0.5))',
  'drop-shadow(0 0 20px rgba(40,205,86,0.25))',
];

export function GlowText({
  children,
  as: Tag = 'span',
  className = '',
  animate = true,
  color = 'accent',
}: GlowTextProps) {
  const MotionTag = MOTION_TAGS[Tag];

  return (
    <MotionTag
      className={`${colorMap[color]} ${glowColorMap[color]} ${className}`}
      animate={
        animate && color === 'accent'
          ? { filter: accentGlowKeyframes }
          : undefined
      }
      transition={
        animate && color === 'accent'
          ? { duration: 3, repeat: Infinity, ease: 'easeInOut' }
          : undefined
      }
    >
      {children}
    </MotionTag>
  );
}


