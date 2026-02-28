'use client';

import { useTheme } from '@/hooks/useTheme';

export type ActivityPanel =
  | 'files'
  | 'search'
  | 'store'
  | 'design'
  | 'quality'
  | 'history'
  | null;

interface ActivityBarProps {
  activePanel: ActivityPanel;
  onPanelChange: (panel: ActivityPanel) => void;
  onSettingsClick?: () => void;
  /** Project Manager / Home — opens project list; shown at top of icon bar */
  onHomeClick?: () => void;
}

interface ActivityItem {
  id: ActivityPanel & string;
  label: string;
  icon: React.ReactNode;
}

/* ------------------------------------------------------------------ */
/*  Icons (inline SVG, 20x20)                                          */
/* ------------------------------------------------------------------ */

const iconProps = {
  width: 20,
  height: 20,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

const FilesIcon = (
  <svg {...iconProps}>
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
  </svg>
);

const ShopifyBagIcon = (
  <svg width={20} height={20} viewBox="0 0 109.5 124.5" fill="currentColor" aria-hidden="true">
    <path d="M74.8,14.8c0,0-1.4,0.4-3.7,1.1c-0.4-1.3-1-2.8-1.8-4.4c-2.6-5-6.5-7.7-11.1-7.7c0,0,0,0,0,0 c-0.3,0-0.6,0-1,0.1c-0.1-0.2-0.3-0.3-0.4-0.5c-2-2.2-4.6-3.2-7.7-3.1c-6,0.2-12,4.5-16.8,12.2c-3.4,5.4-6,12.2-6.7,17.5 c-6.9,2.1-11.7,3.6-11.8,3.7c-3.5,1.1-3.6,1.2-4,4.5c-0.3,2.5-9.5,72.9-9.5,72.9l75.6,13.1V14.7C75.3,14.7,75,14.8,74.8,14.8z M57.3,20.2c-4,1.2-8.4,2.6-12.7,3.9c1.2-4.7,3.6-9.4,6.4-12.5c1.1-1.1,2.6-2.4,4.3-3.2C57,12,57.4,16.9,57.3,20.2z M49.1,4.4 c1.4,0,2.6,0.3,3.6,0.9c-1.6,0.8-3.2,2.1-4.7,3.6c-3.8,4.1-6.7,10.5-7.9,16.6c-3.6,1.1-7.2,2.2-10.5,3.2 C31.8,19.1,39.9,4.6,49.1,4.4z M37.5,59.4c0.4,6.4,17.3,7.8,18.3,22.9c0.7,11.9-6.3,20-16.4,20.6c-12.2,0.8-18.9-6.4-18.9-6.4 l2.6-11c0,0,6.7,5.1,12.1,4.7c3.5-0.2,4.8-3.1,4.7-5.1c-0.5-8.4-14.3-7.9-15.2-21.7C23.9,51.8,31.5,40.1,48.3,39 c6.5-0.4,9.8,1.2,9.8,1.2l-3.8,14.4c0,0-4.3-2-9.4-1.6C37.5,53.5,37.4,58.2,37.5,59.4z M61.3,19c0-3-0.4-7.3-1.8-10.9 c4.6,0.9,6.8,6,7.8,9.1C65.5,17.7,63.5,18.3,61.3,19z" />
    <path d="M78.2,124l31.4-7.8c0,0-13.5-91.3-13.6-91.9c-0.1-0.6-0.6-1-1.1-1c-0.5,0-9.3-0.2-9.3-0.2s-5.4-5.2-7.4-7.2 V124z" />
  </svg>
);

const DesignIcon = (
  <svg {...iconProps}>
    <circle cx="13.5" cy="6.5" r=".5" />
    <circle cx="17.5" cy="10.5" r=".5" />
    <circle cx="8.5" cy="7.5" r=".5" />
    <circle cx="6.5" cy="12.5" r=".5" />
    <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z" />
  </svg>
);

const QualityIcon = (
  <svg {...iconProps}>
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    <path d="m9 12 2 2 4-4" />
  </svg>
);

const HistoryIcon = (
  <svg {...iconProps}>
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
);

const SearchIcon = (
  <svg {...iconProps}>
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);

const SettingsIcon = (
  <svg {...iconProps}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);

const SunIcon = (
  <svg {...iconProps}>
    <circle cx="12" cy="12" r="5" />
    <line x1="12" y1="1" x2="12" y2="3" />
    <line x1="12" y1="21" x2="12" y2="23" />
    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
    <line x1="1" y1="12" x2="3" y2="12" />
    <line x1="21" y1="12" x2="23" y2="12" />
    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
  </svg>
);

const MoonIcon = (
  <svg {...iconProps}>
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
  </svg>
);

const KeyboardIcon = (
  <svg {...iconProps}>
    <rect x="2" y="4" width="20" height="16" rx="2" ry="2" />
    <line x1="6" y1="8" x2="6.01" y2="8" />
    <line x1="10" y1="8" x2="10.01" y2="8" />
    <line x1="14" y1="8" x2="14.01" y2="8" />
    <line x1="18" y1="8" x2="18.01" y2="8" />
    <line x1="8" y1="12" x2="8.01" y2="12" />
    <line x1="12" y1="12" x2="12.01" y2="12" />
    <line x1="16" y1="12" x2="16.01" y2="12" />
    <line x1="7" y1="16" x2="17" y2="16" />
  </svg>
);

const HomeGridIcon = (
  <svg {...iconProps}>
    <rect x="3" y="3" width="8" height="8" rx="1" />
    <rect x="13" y="3" width="8" height="8" rx="1" />
    <rect x="3" y="13" width="8" height="8" rx="1" />
    <rect x="13" y="13" width="8" height="8" rx="1" />
  </svg>
);

/* ------------------------------------------------------------------ */
/*  Activity items                                                     */
/* ------------------------------------------------------------------ */

const MAIN_ITEMS: ActivityItem[] = [
  { id: 'files', label: 'Files', icon: FilesIcon },
  { id: 'search', label: 'Search', icon: SearchIcon },
  { id: 'store', label: 'Shopify', icon: ShopifyBagIcon },
  { id: 'design', label: 'Design', icon: DesignIcon },
  { id: 'quality', label: 'Quality', icon: QualityIcon },
  { id: 'history', label: 'History', icon: HistoryIcon },
];

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function ActivityBar({
  activePanel,
  onPanelChange,
  onSettingsClick,
  onHomeClick,
}: ActivityBarProps) {
  const { isDark, toggle: toggleTheme } = useTheme();

  const handleClick = (id: ActivityPanel & string) => {
    onPanelChange(activePanel === id ? null : id);
  };

  return (
    <div className="w-12 ide-surface border-r ide-border-subtle flex flex-col items-center shrink-0 select-none">
      {/* ── Project Manager / Home (top of icon bar) ────────────────── */}
      {onHomeClick && (
        <div className="flex flex-col items-center pt-2 pb-1">
          <button
            type="button"
            onClick={onHomeClick}
            className="w-10 h-10 flex items-center justify-center rounded-md ide-text-muted hover:ide-text-2 ide-hover transition-colors"
            title="Project Manager"
            aria-label="Project Manager"
          >
            {HomeGridIcon}
          </button>
        </div>
      )}

      {/* ── Main navigation icons ──────────────────────────────────── */}
      <div className="flex flex-col items-center gap-0.5 py-2">
        {MAIN_ITEMS.map((item) => {
          const isActive = activePanel === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => handleClick(item.id)}
              className={`relative w-10 h-10 flex items-center justify-center rounded-md transition-colors ${
                isActive
                  ? 'ide-text ide-surface-inset'
                  : 'ide-text-muted hover:ide-text-2 ide-hover'
              }`}
              title={item.label}
              aria-label={item.label}
            >
              {/* Active indicator — emerald bar on left edge */}
              {isActive && (
                <span className="absolute left-0 top-2 bottom-2 w-0.5 rounded-r bg-emerald-500" />
              )}
              {item.icon}
            </button>
          );
        })}
      </div>

      {/* ── Spacer ─────────────────────────────────────────────────── */}
      <div className="flex-1" />

      {/* ── Divider ────────────────────────────────────────────────── */}
      <div className="w-6 h-px bg-stone-200 dark:bg-[#141414] mb-1" />

      {/* ── Utility icons ──────────────────────────────────────────── */}
      <div className="flex flex-col items-center gap-0.5 pb-2">
        <button
          type="button"
          onClick={toggleTheme}
          className="w-10 h-10 flex items-center justify-center rounded-md ide-text-muted hover:ide-text-2 ide-hover transition-colors"
          title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {isDark ? SunIcon : MoonIcon}
        </button>
        <button
          type="button"
          className="w-10 h-10 flex items-center justify-center rounded-md ide-text-muted hover:ide-text-2 ide-hover transition-colors"
          title="Keyboard Shortcuts"
          aria-label="Keyboard Shortcuts"
        >
          {KeyboardIcon}
        </button>
        <button
          type="button"
          onClick={onSettingsClick}
          className="w-10 h-10 flex items-center justify-center rounded-md ide-text-muted hover:ide-text-2 ide-hover transition-colors"
          title="Settings"
          aria-label="Settings"
        >
          {SettingsIcon}
        </button>
      </div>
    </div>
  );
}
