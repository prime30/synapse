'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export interface RelatedFileInfo {
  id: string;
  name: string;
  path: string;
}

interface RelatedFilesPromptProps {
  /** The file that was just opened */
  triggerFileName: string;
  /** Related files not yet open */
  relatedFiles: RelatedFileInfo[];
  /** Open a single file */
  onOpenFile: (fileId: string) => void;
  /** Open all related files at once */
  onOpenAll: (fileIds: string[]) => void;
  /** Dismiss (and optionally remember) */
  onDismiss: () => void;
  /** Link these files together for future auto-open */
  onLinkFiles?: () => void;
}

const AUTO_DISMISS_MS = 8000;

export function RelatedFilesPrompt({
  triggerFileName,
  relatedFiles,
  onOpenFile,
  onOpenAll,
  onDismiss,
  onLinkFiles,
}: RelatedFilesPromptProps) {
  const [visible, setVisible] = useState(true);

  // Auto-dismiss
  useEffect(() => {
    const t = setTimeout(() => {
      setVisible(false);
      setTimeout(onDismiss, 300); // wait for exit animation
    }, AUTO_DISMISS_MS);
    return () => clearTimeout(t);
  }, [onDismiss]);

  if (relatedFiles.length === 0) return null;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: -8, height: 0 }}
          animate={{ opacity: 1, y: 0, height: 'auto' }}
          exit={{ opacity: 0, y: -8, height: 0 }}
          transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          className="overflow-hidden"
        >
          <div className="flex items-center gap-2 flex-wrap px-3 py-2 ide-active border border-sky-500/15 rounded-lg text-xs">
            <span className="ide-text-muted shrink-0">
              <span className="ide-text font-medium">{triggerFileName}</span> has related files:
            </span>

            {/* Individual file chips */}
            {relatedFiles.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => onOpenFile(f.id)}
                className="inline-flex items-center gap-1 px-2 py-1 rounded border ide-border ide-surface-panel ide-text ide-hover transition-colors"
                title={f.path}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-sky-400/60 shrink-0" />
                {f.name}
              </button>
            ))}

            <div className="flex items-center gap-1.5 ml-auto shrink-0">
              {/* Open all */}
              <button
                type="button"
                onClick={() => {
                  onOpenAll(relatedFiles.map((f) => f.id));
                  setVisible(false);
                  setTimeout(onDismiss, 300);
                }}
                className="px-2.5 py-1 rounded bg-sky-600/80 text-white text-[11px] font-medium hover:bg-sky-500 transition-colors"
              >
                Open all
              </button>

              {/* Link files */}
              {onLinkFiles && (
                <button
                  type="button"
                  onClick={() => {
                    onLinkFiles();
                    setVisible(false);
                    setTimeout(onDismiss, 300);
                  }}
                  className="px-2.5 py-1 rounded ide-surface-inset ide-text text-[11px] ide-hover transition-colors"
                  title="Link these files so they always open together"
                >
                  Link
                </button>
              )}

              {/* Dismiss */}
              <button
                type="button"
                onClick={() => {
                  setVisible(false);
                  setTimeout(onDismiss, 300);
                }}
                className="px-1.5 py-1 ide-text-muted hover:ide-text transition-colors"
                aria-label="Dismiss"
              >
                &times;
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
