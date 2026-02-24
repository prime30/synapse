'use client';

import { motion, AnimatePresence } from 'framer-motion';

interface SlashHistoryGhostProps {
  text: string | null;
  visible: boolean;
}

export function SlashHistoryGhost({ text, visible }: SlashHistoryGhostProps) {
  return (
    <AnimatePresence>
      {visible && text && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="pointer-events-none select-none truncate px-3 py-1 font-mono text-sm text-stone-400 dark:text-stone-500"
          aria-hidden="true"
        >
          {text}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
