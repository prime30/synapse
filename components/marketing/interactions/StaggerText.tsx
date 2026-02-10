'use client';

import { motion, useInView } from 'framer-motion';
import { useRef } from 'react';

interface StaggerTextProps {
  children: string;
  as?: 'h1' | 'h2' | 'h3' | 'p' | 'span';
  className?: string;
  delay?: number;
  staggerDelay?: number;
}

export function StaggerText({
  children,
  className,
  delay = 0,
  staggerDelay = 0.08,
}: StaggerTextProps) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-80px' });

  const words = children.split(' ');

  return (
    <div ref={ref} className={className}>
      {words.map((word, i) => (
        <span key={i} className="inline-block overflow-hidden">
          <motion.span
            className="inline-block"
            initial={{ opacity: 0, y: '100%' }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{
              duration: 0.5,
              delay: delay + i * staggerDelay,
              ease: [0.22, 1, 0.36, 1],
            }}
          >
            {word}
          </motion.span>
          {i < words.length - 1 && '\u00A0'}
        </span>
      ))}
    </div>
  );
}
