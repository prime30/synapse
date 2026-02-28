'use client';

import { useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Tooltip } from '@/components/ui/Tooltip';

export interface NextStepChip {
  id: string;
  label: string;
  category: 'completion' | 'neighbor' | 'cx_insight';
  prompt: string;
  impact?: 'high' | 'medium' | 'low';
  description?: string;
  affectedFiles?: string[];
}

export interface NextStepChipsProps {
  chips: NextStepChip[];
  onSelect: (prompt: string) => void;
  isTyping: boolean;
  projectId: string;
}

const CATEGORY_DOT: Record<NextStepChip['category'], string> = {
  completion: 'bg-sky-400',
  neighbor: 'bg-purple-400',
  cx_insight: 'bg-emerald-400',
};

const IMPACT_LABEL: Record<string, string> = {
  high: 'High impact',
  medium: 'Medium impact',
  low: 'Low impact',
};

function buildTooltipContent(chip: NextStepChip): string {
  const parts: string[] = [];
  if (chip.description) parts.push(chip.description);
  if (chip.impact) parts.push(IMPACT_LABEL[chip.impact] ?? chip.impact);
  if (chip.affectedFiles && chip.affectedFiles.length > 0) {
    parts.push(`Files: ${chip.affectedFiles.slice(0, 3).join(', ')}${chip.affectedFiles.length > 3 ? '...' : ''}`);
  }
  return parts.join(' • ') || chip.label;
}

export function NextStepChips({
  chips,
  onSelect,
  isTyping,
  projectId,
}: NextStepChipsProps) {
  const displayChips = chips.slice(0, 5);

  const handleClick = useCallback(
    (chip: NextStepChip) => {
      fetch(`/api/projects/${projectId}/chips/click`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patternId: chip.id }),
      }).catch(() => {}); // fire-and-forget
      onSelect(chip.prompt);
    },
    [onSelect, projectId]
  );

  return (
    <AnimatePresence mode="wait">
      {!isTyping && displayChips.length > 0 && (
        <motion.div
          className="relative w-full"
          initial={{ opacity: 1 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.1 }}
        >
          <div
            className="flex flex-wrap gap-1.5 py-1.5 px-1"
          >
            {displayChips.map((chip, i) => (
              <Tooltip key={chip.id} content={buildTooltipContent(chip)}>
                <motion.button
                  type="button"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{
                    opacity: { duration: 0.2, delay: i * 0.03 },
                  }}
                  onClick={() => handleClick(chip)}
                  className={`
                    shrink-0 inline-flex items-center gap-1.5
                    text-xs px-2.5 py-1 rounded-full border cursor-pointer transition-colors whitespace-nowrap
                    bg-stone-100 dark:bg-white/5
                    border-stone-200 dark:border-[#2a2a2a]
                    text-stone-500 dark:text-stone-400
                    hover:bg-stone-200 dark:hover:bg-[#1e1e1e] hover:text-stone-700 dark:hover:text-stone-300
                  `}
                >
                  <span
                    className={`w-1 h-1 rounded-full shrink-0 ${CATEGORY_DOT[chip.category]}`}
                    aria-hidden
                  />
                  <span>{chip.label}</span>
                </motion.button>
              </Tooltip>
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
