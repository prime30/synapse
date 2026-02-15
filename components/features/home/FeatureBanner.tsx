'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { ANNOUNCEMENTS } from '@/lib/constants/announcements';

const STORAGE_KEY = 'home-dismissed-banners';

function getDismissedIds(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function dismissId(id: string) {
  try {
    const current = getDismissedIds();
    if (!current.includes(id)) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...current, id]));
    }
  } catch {
    // Ignore storage errors
  }
}

export function FeatureBanner() {
  const [dismissedIds, setDismissedIds] = useState<string[]>(() => getDismissedIds());

  const announcement = ANNOUNCEMENTS.find(
    (a) => a.dismissible && !dismissedIds.includes(a.id)
  ) ?? ANNOUNCEMENTS.find((a) => !dismissedIds.includes(a.id));

  if (!announcement) return null;

  const handleDismiss = () => {
    dismissId(announcement.id);
    setDismissedIds((prev) => [...prev, announcement.id]);
  };

  return (
    <AnimatePresence>
      {announcement && (
        <motion.div
          key={announcement.id}
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.25, ease: 'easeInOut' }}
          className="overflow-hidden"
        >
          <div className="flex items-center justify-between gap-4 px-4 py-2.5 bg-gradient-to-r from-sky-600/20 to-indigo-600/20 border-b border-gray-700/50">
            <div className="flex items-center gap-3 min-w-0">
              <span className="text-sm font-medium text-gray-200">{announcement.title}</span>
              <span className="text-sm text-gray-400 truncate">{announcement.body}</span>
              {announcement.link && (
                <a
                  href={announcement.link}
                  className="shrink-0 text-xs font-medium text-sky-400 hover:text-sky-300 transition-colors"
                >
                  Learn More →
                </a>
              )}
            </div>
            {announcement.dismissible && (
              <button
                onClick={handleDismiss}
                className="shrink-0 p-1 rounded hover:bg-white/10 text-gray-400 hover:text-gray-200 transition-colors"
                aria-label="Dismiss"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
