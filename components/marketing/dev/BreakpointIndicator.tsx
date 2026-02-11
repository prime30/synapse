'use client';

import { useState, useEffect } from 'react';

/**
 * Dev-only breakpoint inspector — shows current Tailwind breakpoint + viewport width.
 * Renders nothing in production. This file is gitignored.
 */
export function BreakpointIndicator() {
  const [width, setWidth] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return;
    setVisible(true);
    const update = () => setWidth(window.innerWidth);
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  if (!visible) return null;

  const bp =
    width >= 1536
      ? '2xl'
      : width >= 1280
        ? 'xl'
        : width >= 1024
          ? 'lg'
          : width >= 768
            ? 'md'
            : width >= 640
              ? 'sm'
              : 'xs';

  return (
    <div className="fixed bottom-3 left-1/2 -translate-x-1/2 z-[9999] pointer-events-none select-none">
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/80 backdrop-blur-sm text-white text-[11px] font-mono tabular-nums shadow-lg">
        <span className="font-semibold uppercase tracking-wider">{bp}</span>
        <span className="opacity-50">|</span>
        <span className="opacity-70">{width}px</span>
      </div>
    </div>
  );
}
