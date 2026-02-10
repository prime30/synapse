'use client';

import { motion } from 'framer-motion';
import { ReactNode } from 'react';

interface GlowTextProps {
  children: ReactNode;
  as?: 'h1' | 'h2' | 'h3' | 'h4' | 'p' | 'span';
  className?: string;
  animate?: boolean;
  color?: 'sky' | 'white' | 'warm-gray';
}

const colorMap = {
  sky: 'text-sky-400',
  white: 'text-white',
  'warm-gray': 'text-stone-500',
};

const glowColorMap = {
  sky: 'drop-shadow-[0_0_20px_rgba(14,165,233,0.4)]',
  white: 'drop-shadow-[0_0_20px_rgba(255,255,255,0.2)]',
  'warm-gray': 'drop-shadow-[0_0_15px_rgba(120,113,108,0.2)]',
};

export function GlowText({
  children,
  as: Tag = 'span',
  className = '',
  animate = true,
  color = 'sky',
}: GlowTextProps) {
  const MotionTag = motion.create(Tag);

  return (
    <MotionTag
      className={`${colorMap[color]} ${glowColorMap[color]} ${className}`}
      animate={
        animate
          ? {
              filter: [
                'drop-shadow(0 0 20px rgba(14,165,233,0.2))',
                'drop-shadow(0 0 40px rgba(14,165,233,0.5))',
                'drop-shadow(0 0 20px rgba(14,165,233,0.2))',
              ],
            }
          : undefined
      }
      transition={
        animate
          ? { duration: 3, repeat: Infinity, ease: 'easeInOut' }
          : undefined
      }
    >
      {children}
    </MotionTag>
  );
}
