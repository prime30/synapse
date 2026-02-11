'use client';

import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';

const TICKER_ITEMS = [
  'MULTI-AGENT AI',
  'LIQUID INTELLIGENCE',
  'SHOPIFY NATIVE',
  'REAL-TIME SYNC',
  'ONE-CLICK DEPLOY',
  'AI CODE GENERATION',
  'VISUAL VALIDATION',
  'CONTEXT AWARENESS',
];

interface MarqueeTickerProps {
  className?: string;
}

export function MarqueeTicker({ className = '' }: MarqueeTickerProps) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: false, margin: '-80px' });
  const items = [...TICKER_ITEMS, ...TICKER_ITEMS];

  return (
    <motion.div
      ref={ref}
      className={`relative overflow-hidden py-5 gradient-accent ${className}`}
      initial={{ opacity: 0 }}
      animate={inView ? { opacity: 1 } : { opacity: 0 }}
      transition={{ duration: 0.5, delay: 0.15 }}
    >
      {/* Code grid texture */}
      <div
        className="absolute inset-0 opacity-[0.08] pointer-events-none font-mono text-[6px] leading-[8px] text-white whitespace-pre select-none"
        aria-hidden="true"
      >
        {'01{}[]<>=/ '.repeat(500)}
      </div>

      <div className="flex animate-marquee whitespace-nowrap">
        {items.map((item, i) => (
          <span key={`${item}-${i}`} className="flex items-center">
            <span className="font-pixel text-xs md:text-sm text-white tracking-[0.3em] mx-6 md:mx-10">
              {item}
            </span>
            <span className="text-white text-lg" aria-hidden="true">
              ◆
            </span>
          </span>
        ))}
      </div>

      <style jsx>{`
        @keyframes marquee {
          from { transform: translateX(0); }
          to { transform: translateX(-50%); }
        }
        .animate-marquee {
          animation: marquee 40s linear infinite;
        }
        .animate-marquee:hover {
          animation-play-state: paused;
        }
      `}      </style>
    </motion.div>
  );
}
