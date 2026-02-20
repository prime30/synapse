'use client';

import { motion, AnimatePresence } from 'framer-motion';

const FOLD_LABELS = ['THE PROBLEM', 'ENTER SYNAPSE', 'THE POWER', 'THE RESULT', 'START BUILDING'];

interface ProgressIndicatorProps {
  activeFold: number;
  onFoldClick?: (index: number) => void;
}

export function ProgressIndicator({ activeFold, onFoldClick }: ProgressIndicatorProps) {
  return (
    <div className="fixed right-6 top-1/2 -translate-y-1/2 z-50 hidden lg:flex flex-col items-end gap-4">
      {FOLD_LABELS.map((label, index) => (
        <button
          key={label}
          onClick={() => onFoldClick?.(index)}
          className="flex items-center gap-3 group cursor-pointer"
          aria-label={`Go to section: ${label}`}
        >
          {/* Label - shows on active/hover */}
          <AnimatePresence>
            {activeFold === index && (
              <motion.span
                className="font-pixel text-[9px] tracking-[0.2em] text-accent whitespace-nowrap"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                transition={{ duration: 0.3 }}
              >
                {label}
              </motion.span>
            )}
          </AnimatePresence>

          {/* Dot */}
          <div className="relative w-2.5 h-2.5 flex items-center justify-center">
            <motion.div
              className="absolute rounded-full"
              animate={{
                width: activeFold === index ? 10 : 6,
                height: activeFold === index ? 10 : 6,
                backgroundColor: activeFold === index ? '#0ea5e9' : 'rgba(168,162,158,0.3)',
                boxShadow: activeFold === index ? '0 0 12px rgba(14,165,233,0.5)' : 'none',
              }}
              transition={{ type: 'spring', stiffness: 300, damping: 20 }}
            />
          </div>
        </button>
      ))}
    </div>
  );
}


