'use client';

import { useRef, useEffect } from 'react';

interface FileContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
  items: Array<{
    label: string;
    onClick: () => void;
    dangerous?: boolean;
  }>;
}

export function FileContextMenu({
  x,
  y,
  onClose,
  items,
}: FileContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="fixed z-[100] py-1 ide-surface-pop border ide-border rounded shadow-xl min-w-[160px]"
      style={{ left: x, top: y }}
    >
      {items.map((item) => (
        <button
          key={item.label}
          type="button"
          onClick={() => {
            item.onClick();
            onClose();
          }}
          className={`w-full px-3 py-2 text-left text-sm ide-hover transition-colors ${
            item.dangerous ? 'text-red-400' : 'ide-text'
          }`}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
