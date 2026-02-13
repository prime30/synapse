'use client';

import { useState } from 'react';
import { SupportPanel } from './SupportPanel';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * SupportButton — floating "?" help button positioned in the bottom-right corner.
 * Clicking toggles the SupportPanel slide-out.
 *
 * Mount this component at the page level (dashboard or IDE layout).
 */
export function SupportButton() {
  const [panelOpen, setPanelOpen] = useState(false);

  return (
    <>
      {/* Floating button */}
      <button
        type="button"
        onClick={() => setPanelOpen(true)}
        className="
          fixed bottom-5 right-5 z-50
          w-10 h-10 rounded-full
          ide-surface-panel border ide-border
          ide-text-muted hover:ide-text ide-hover
          shadow-lg shadow-black/30
          flex items-center justify-center
          transition-all duration-200
          hover:scale-105
        "
        aria-label="Help & Support"
      >
        <svg
          className="w-5 h-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      </button>

      {/* Support panel */}
      <SupportPanel isOpen={panelOpen} onClose={() => setPanelOpen(false)} />
    </>
  );
}
