'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { safeTransition } from '@/lib/accessibility';

export type StreamingState = 'idle' | 'waiting' | 'thinking' | 'tooling' | 'streaming' | 'done';

interface StreamingIndicatorProps {
  state: StreamingState;
  label?: string;
}

function PulsingDots() {
  return (
    <span className="inline-flex items-center ml-0.5 gap-[2px]" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="inline-block w-[3px] h-[3px] rounded-full bg-current"
          style={{
            animation: 'thinking-dot 1.4s ease-in-out infinite',
            animationDelay: `${i * 0.2}s`,
          }}
        />
      ))}
    </span>
  );
}

export function StreamingIndicator({ state, label }: StreamingIndicatorProps) {
  if (state === 'idle' || state === 'done' || state === 'streaming') return null;

  const text = label ?? (
    state === 'waiting' ? 'Thinking' :
    state === 'thinking' ? 'Thinking' :
    state === 'tooling' ? 'Working' :
    'Thinking'
  );

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, height: 0 }}
        animate={{ opacity: 1, height: 'auto' }}
        exit={{ opacity: 0, height: 0 }}
        transition={safeTransition(0.15)}
        className="flex items-center gap-2 px-3 py-1.5 text-xs text-stone-500 dark:text-stone-400 overflow-hidden"
      >
        <span className="italic">
          {text}
          <PulsingDots />
        </span>
      </motion.div>
    </AnimatePresence>
  );
}
