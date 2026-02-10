'use client';

import { useRef, useEffect, useState } from 'react';
import { useInView } from 'framer-motion';
import { cn } from '@/lib/utils';

interface CounterStatProps {
  value: number;
  suffix?: string;
  prefix?: string;
  label: string;
  duration?: number;
  className?: string;
}

function easeOutExpo(t: number): number {
  return t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
}

function formatValue(n: number, isWholeTarget: boolean): string {
  if (isWholeTarget) {
    return Math.round(n).toString();
  }
  return n.toFixed(1);
}

export function CounterStat({
  value,
  suffix,
  prefix,
  label,
  duration = 1.5,
  className,
}: CounterStatProps) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-50px' });
  const [displayValue, setDisplayValue] = useState('0');

  const isWholeTarget = Number.isInteger(value);

  useEffect(() => {
    if (!inView) return;

    const durationMs = duration * 1000;
    let startTime: number | null = null;
    let rafId: number;

    function tick(timestamp: number) {
      if (startTime === null) startTime = timestamp;
      const elapsed = timestamp - startTime;
      const progress = Math.min(elapsed / durationMs, 1);
      const easedProgress = easeOutExpo(progress);
      const current = easedProgress * value;

      setDisplayValue(formatValue(current, isWholeTarget));

      if (progress < 1) {
        rafId = requestAnimationFrame(tick);
      }
    }

    rafId = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(rafId);
  }, [inView, value, duration, isWholeTarget]);

  return (
    <div ref={ref} className={cn('text-center', className)}>
      <div className="text-4xl md:text-5xl font-light text-stone-900 dark:text-white tabular-nums">
        {prefix}
        {displayValue}
        {suffix}
      </div>
      <div className="text-sm text-stone-400 dark:text-white/40 mt-2">
        {label}
      </div>
    </div>
  );
}
