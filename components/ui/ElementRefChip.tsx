'use client';

import type { SelectedElement } from '@/components/preview/PreviewPanel';

interface ElementRefChipProps {
  element: SelectedElement;
  onDismiss?: () => void;
  className?: string;
}

/**
 * Compact pill/chip displaying a selected DOM element reference.
 * Shows the tag + primary identifier (ID or class) and a few key styles.
 * Clicking the label copies the selector to clipboard.
 */
export function ElementRefChip({
  element,
  onDismiss,
  className = '',
}: ElementRefChipProps) {
  // Build a short human-readable label
  const label = buildLabel(element);

  // Pick 1-2 interesting style properties to show
  const styleHints = buildStyleHints(element.styles);

  const handleCopy = () => {
    navigator.clipboard.writeText(element.selector).catch(() => {});
  };

  return (
    <div
      className={`inline-flex items-center gap-1.5 rounded-md border ide-border ide-surface-panel px-2 py-1 text-xs ${className}`}
    >
      {/* Selector label -- click to copy */}
      <button
        type="button"
        onClick={handleCopy}
        className="flex items-center gap-1 font-mono text-sky-500 dark:text-sky-400 hover:text-sky-400 dark:hover:text-sky-300 transition-colors"
        title={`Click to copy: ${element.selector}`}
      >
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="shrink-0 opacity-60"
        >
          {/* Target/crosshair dot */}
          <circle cx="12" cy="12" r="3" />
          <line x1="12" y1="2" x2="12" y2="6" />
          <line x1="12" y1="18" x2="12" y2="22" />
          <line x1="2" y1="12" x2="6" y2="12" />
          <line x1="18" y1="12" x2="22" y2="12" />
        </svg>
        <span className="truncate max-w-[180px]">{label}</span>
      </button>

      {/* Style hints */}
      {styleHints && (
        <span className="ide-text-muted truncate max-w-[120px]">
          {styleHints}
        </span>
      )}

      {/* Liquid section file badge */}
      {element.liquidSection && (
        <span
          className="font-mono text-[11px] ide-text-muted truncate max-w-[180px]"
          title={element.liquidSection}
        >
          {element.liquidSection}
        </span>
      )}

      {/* App badge */}
      {element.isApp && (
        <span className="rounded bg-amber-900/40 border border-amber-700/30 px-1 text-[10px] text-amber-400">
          app
        </span>
      )}

      {/* Dismiss */}
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="ml-0.5 rounded p-0.5 ide-text-muted hover:ide-text-2 ide-hover transition-colors"
          aria-label="Remove element reference"
        >
          <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <path d="M1 1l6 6M7 1l-6 6" />
          </svg>
        </button>
      )}
    </div>
  );
}

function buildLabel(el: SelectedElement): string {
  const tag = el.tag;
  if (el.id) return `${tag}#${el.id}`;
  const meaningful = el.classes.filter(
    (c) => !/^shopify-|^js-|^no-/.test(c)
  );
  if (meaningful.length > 0) {
    return `${tag}.${meaningful.slice(0, 2).join('.')}`;
  }
  return tag;
}

function buildStyleHints(styles: Record<string, string>): string | null {
  const hints: string[] = [];
  if (styles.zIndex && styles.zIndex !== 'auto') {
    hints.push(`z:${styles.zIndex}`);
  }
  if (styles.position && styles.position !== 'static') {
    hints.push(styles.position);
  }
  if (styles.display && styles.display !== 'block' && styles.display !== 'inline') {
    hints.push(styles.display);
  }
  if (styles.opacity && styles.opacity !== '1') {
    hints.push(`opacity:${styles.opacity}`);
  }
  return hints.length > 0 ? hints.join(' ') : null;
}
