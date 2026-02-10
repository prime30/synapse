'use client';

import { ReactNode } from 'react';
import { motion } from 'framer-motion';

interface BentoGridProps {
  children: ReactNode;
  className?: string;
  columns?: 3 | 4;
}

const containerVariants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.1,
    },
  },
};

export function BentoGrid({ children, className = '', columns = 4 }: BentoGridProps) {
  const gridCols = columns === 3
    ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'
    : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-4';

  return (
    <motion.div
      className={`grid ${gridCols} gap-4 md:gap-6 ${className}`}
      variants={containerVariants}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: '-100px' }}
    >
      {children}
    </motion.div>
  );
}
