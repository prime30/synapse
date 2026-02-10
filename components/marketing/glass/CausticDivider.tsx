'use client';

import { motion } from 'framer-motion';

interface CausticDividerProps {
  className?: string;
}

export function CausticDivider({ className = '' }: CausticDividerProps) {
  return (
    <div className={`relative h-px w-full overflow-hidden ${className}`} aria-hidden="true">
      {/* Base line */}
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-sky-500/20 to-transparent" />
      {/* Animated shimmer */}
      <motion.div
        className="absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-cyan-500/60 to-transparent"
        animate={{
          x: ['-100%', '400%'],
        }}
        transition={{
          duration: 4,
          repeat: Infinity,
          ease: 'easeInOut',
          repeatDelay: 2,
        }}
      />
    </div>
  );
}
