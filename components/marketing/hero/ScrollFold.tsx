'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { ReactNode } from 'react';

interface ScrollFoldProps {
  isActive: boolean;
  label: string;
  headline: string;
  description: string;
  children?: ReactNode;
  alignment?: 'left' | 'center';
  ctaButtons?: ReactNode;
}

const copyVariants = {
  enter: {
    opacity: 1,
    y: 0,
    filter: 'blur(0px)',
    transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] as const },
  },
  exit: {
    opacity: 0,
    y: -30,
    filter: 'blur(4px)',
    transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] as const },
  },
  initial: {
    opacity: 0,
    y: 40,
    filter: 'blur(4px)',
  },
};

export function ScrollFold({
  isActive,
  label,
  headline,
  description,
  children,
  alignment = 'left',
  ctaButtons,
}: ScrollFoldProps) {
  const alignClass = alignment === 'center' ? 'text-center items-center' : 'text-left items-start';

  return (
    <AnimatePresence mode="wait">
      {isActive && (
        <motion.div
          key={label}
          className={`absolute inset-0 flex flex-col justify-center px-8 md:px-16 ${alignClass}`}
          variants={copyVariants}
          initial="initial"
          animate="enter"
          exit="exit"
        >
          {/* Category label */}
          <span className="inline-block rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-medium tracking-widest uppercase text-white/50 mb-4">
            {label}
          </span>

          {/* Headline — Geist Sans bold */}
          <h2 className="text-5xl md:text-7xl font-medium text-white mb-6 max-w-2xl leading-[1.1] tracking-[-0.03em]">
            {headline}
          </h2>

          {/* Description */}
          <p className="text-white/70 text-base md:text-lg max-w-lg leading-relaxed mb-8">
            {description}
          </p>

          {/* Optional CTA buttons */}
          {ctaButtons && (
            <div className="flex flex-wrap gap-4">
              {ctaButtons}
            </div>
          )}

          {/* Optional extra content */}
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
