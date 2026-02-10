'use client';

import { useEffect, useState, useRef } from 'react';
import { motion, useInView } from 'framer-motion';

interface BentoMetricProps {
  value: number;
  suffix?: string;
  prefix?: string;
  label: string;
  duration?: number;
  className?: string;
}

function useCounter(end: number, duration: number, start: boolean) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!start) return;

    let startTimestamp: number | null = null;
    const step = (timestamp: number) => {
      if (!startTimestamp) startTimestamp = timestamp;
      const progress = Math.min((timestamp - startTimestamp) / (duration * 1000), 1);
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(Math.floor(eased * end));
      if (progress < 1) {
        requestAnimationFrame(step);
      }
    };
    requestAnimationFrame(step);
  }, [end, duration, start]);

  return count;
}

export function BentoMetric({
  value,
  suffix = '',
  prefix = '',
  label,
  duration = 2,
  className = '',
}: BentoMetricProps) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-100px' });
  const count = useCounter(value, duration, isInView);

  return (
    <motion.div
      ref={ref}
      className={`flex flex-col items-center justify-center text-center ${className}`}
      initial={{ opacity: 0, scale: 0.8 }}
      whileInView={{ opacity: 1, scale: 1 }}
      viewport={{ once: true }}
      transition={{ type: 'spring', stiffness: 200, damping: 20 }}
    >
      <span className="font-semibold text-5xl md:text-7xl text-stone-900 mb-2">
        {prefix}{count}{suffix}
      </span>
      <span className="font-pixel text-[10px] tracking-[0.3em] text-stone-500">
        {label}
      </span>
    </motion.div>
  );
}
