'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { safeTransition } from '@/lib/accessibility';

interface ComposingIndicatorProps {
  fileName?: string;
  visible?: boolean;
  intent?: string;
}

export function ComposingIndicator({ fileName, visible = true, intent }: ComposingIndicatorProps) {
  const label = fileName
    ? `Composing edit to ${fileName}...`
    : intent === 'ask' ? 'Thinking...'
    : intent === 'debug' ? 'Investigating...'
    : intent === 'plan' ? 'Planning...'
    : 'Working...';

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          transition={safeTransition(0.15)}
          className="flex items-center gap-2 px-3 py-1.5 text-xs text-stone-500 dark:text-stone-400 overflow-hidden"
        >
          <span>{label}</span>
          <span className="inline-flex gap-0.5" aria-hidden>
            <span className="w-1 h-1 rounded-full bg-stone-400 dark:bg-stone-500 animate-pulse" style={{ animationDelay: '0ms' }} />
            <span className="w-1 h-1 rounded-full bg-stone-400 dark:bg-stone-500 animate-pulse" style={{ animationDelay: '150ms' }} />
            <span className="w-1 h-1 rounded-full bg-stone-400 dark:bg-stone-500 animate-pulse" style={{ animationDelay: '300ms' }} />
          </span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
