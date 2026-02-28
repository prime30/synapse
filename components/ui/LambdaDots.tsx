'use client';

import { useState, useEffect } from 'react';

const CARET_ORDER = [3, 1, 0, 2, 4];

/**
 * Lambda-shaped 5-dot loading indicator.
 * Dots are arranged in an equilateral triangle (Λ shape) and a single dot
 * sweeps bottom-left → apex → bottom-right in a loop.
 *
 * @param size  Bounding box in px (default 14, fits where a 14×14 icon would)
 * @param className  Extra classes forwarded to the outer <span>
 */
export function LambdaDots({ size = 14, className = '' }: { size?: number; className?: string }) {
  const [step, setStep] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setStep((p) => (p + 1) % CARET_ORDER.length), 320);
    return () => clearInterval(id);
  }, []);

  const active = CARET_ORDER[step];

  const dotR = Math.max(1, size * 0.09);
  const positions = [
    { x: size * 0.375, y: 0 },
    { x: size * 0.1875, y: size * 0.357 },
    { x: size * 0.5625, y: size * 0.357 },
    { x: 0, y: size * 0.714 },
    { x: size * 0.75, y: size * 0.714 },
  ];

  return (
    <span
      className={`relative inline-flex shrink-0 ${className}`}
      style={{ width: size, height: size * 0.78 }}
      aria-hidden="true"
    >
      {positions.map((pos, i) => (
        <span
          key={i}
          className={`absolute rounded-full transition-colors duration-150 ${
            i === active
              ? 'bg-stone-600 dark:bg-white/80'
              : 'bg-stone-300 dark:bg-white/20'
          }`}
          style={{ left: pos.x, top: pos.y, width: dotR * 2, height: dotR * 2 }}
        />
      ))}
    </span>
  );
}
