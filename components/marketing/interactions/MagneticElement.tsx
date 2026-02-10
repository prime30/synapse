'use client';

import { useRef, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface MagneticElementProps {
  children: React.ReactNode;
  strength?: number;
  radius?: number;
  className?: string;
}

export function MagneticElement({
  children,
  strength = 6,
  radius = 120,
  className,
}: MagneticElementProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!ref.current) return;
      const rect = ref.current.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const dx = e.clientX - centerX;
      const dy = e.clientY - centerY;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance < radius) {
        const pull = (radius - distance) / radius;
        setOffset({
          x: dx * pull * (strength / radius),
          y: dy * pull * (strength / radius),
        });
      }
    },
    [radius, strength]
  );

  const handleMouseLeave = useCallback(() => {
    setOffset({ x: 0, y: 0 });
  }, []);

  return (
    <div
      ref={ref}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className={cn('inline-flex', className)}
    >
      <motion.div
        animate={{ x: offset.x, y: offset.y }}
        transition={{ type: 'spring', stiffness: 300, damping: 20, mass: 0.5 }}
      >
        {children}
      </motion.div>
    </div>
  );
}
