'use client';

import React, { useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';

export interface InlineCorrectionProps {
  messageId: string;
  onSubmit: (correction: string) => void;
  onDismiss: () => void;
}

export function InlineCorrection({
  messageId,
  onSubmit,
  onDismiss,
}: InlineCorrectionProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const value = textareaRef.current?.value?.trim() ?? '';
    if (value) {
      onSubmit(value);
    }
  };

  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: 'auto', opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
      className="mt-2 border border-stone-200 dark:border-[#2a2a2a] rounded-lg overflow-hidden"
    >
      <form onSubmit={handleSubmit}>
        <label
          htmlFor={`inline-correction-${messageId}`}
          className="block text-xs font-medium text-stone-500 dark:text-stone-400 px-3 pt-2"
        >
          What should it do instead?
        </label>
        <textarea
          ref={textareaRef}
          id={`inline-correction-${messageId}`}
          name="correction"
          placeholder="What should it do instead?"
          className="w-full min-h-[60px] bg-transparent text-sm text-stone-900 dark:text-white px-3 py-2 resize-none outline-none placeholder:text-stone-400 dark:placeholder:text-stone-500"
          disabled={false}
        />
        <div className="flex items-center justify-end gap-2 px-3 pb-2">
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss"
            className="text-stone-400 hover:text-stone-600 dark:hover:text-stone-300 p-1 rounded transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
          <button
            type="submit"
            className="bg-[oklch(0.745_0.189_148)] hover:bg-[oklch(0.684_0.178_149)] text-white px-3 py-1 rounded-md text-xs font-medium"
          >
            Submit
          </button>
        </div>
      </form>
    </motion.div>
  );
}
