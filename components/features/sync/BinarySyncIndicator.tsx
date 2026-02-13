'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { useBinarySync } from '@/hooks/useBinarySync';

interface BinarySyncIndicatorProps {
  projectId: string | null;
}

/**
 * Subtle percentage indicator for background binary asset sync.
 * Renders "Media X%" in muted text that fades out on completion.
 * Zero UI footprint when idle or after sync completes.
 */
export function BinarySyncIndicator({ projectId }: BinarySyncIndicatorProps) {
  const { percent } = useBinarySync(projectId);

  return (
    <AnimatePresence>
      {percent !== null && (
        <motion.span
          key="binary-sync"
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.5 }}
          exit={{ opacity: 0, transition: { duration: 0.6 } }}
          className="text-[11px] ide-text-muted tabular-nums select-none"
        >
          Media {percent}%
        </motion.span>
      )}
    </AnimatePresence>
  );
}
