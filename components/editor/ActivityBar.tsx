'use client';

import { useTheme } from '@/hooks/useTheme';

export type ActivityPanel =
  | 'files'
  | 'store'
  | 'design'
  | 'quality'
  | 'history'
  | null;

interface ActivityBarProps {
  activePanel: ActivityPanel;
  onPanelChange: (panel: ActivityPanel) => void;
  onSettingsClick?: () => void;
  /** Project name shown in the sidebar header */
  projectName?: string;
  /** Whether a Shopify store is connected */
  storeConnected?: boolean;
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

const StoreIcon = (
  <svg {...iconProps}>
    <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
    <line x1="3" y1="6" x2="21" y2="6" />
    <path d="M16 10a4 4 0 0 1-8 0" />
  </svg>
);

const DesignIcon = (
  <svg {...iconProps}>
    <circle cx="13.5" cy="6.5" r="2.5" />
    <circle cx="6.5" cy="13.5" r="2.5" />
    <circle cx="17.5" cy="17.5" r="2.5" />
    <path d="M13.5 9a8 8 0 0 0-4 6.5" />
    <path d="M9 13.5a8 8 0 0 0 8.5 4" />
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

/* ------------------------------------------------------------------ */
/*  Activity items                                                     */
/* ------------------------------------------------------------------ */

const MAIN_ITEMS: ActivityItem[] = [
  { id: 'files', label: 'Files', icon: FilesIcon },
  { id: 'store', label: 'Store', icon: StoreIcon },
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
  projectName,
  storeConnected,
}: ActivityBarProps) {
  const { isDark, toggle: toggleTheme } = useTheme();

  const handleClick = (id: ActivityPanel & string) => {
    onPanelChange(activePanel === id ? null : id);
  };

  return (
    <div className="w-12 ide-surface border-r ide-border-subtle flex flex-col items-center shrink-0 select-none">
      {/* ── Project header ─────────────────────────────────────────── */}
      <div className="w-full flex flex-col items-center py-3 border-b ide-border-subtle">
        <div
          className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center cursor-default"
          title={projectName ?? 'Project'}
        >
          <span className="text-[11px] font-bold text-white leading-none">
            {projectName ? projectName.charAt(0).toUpperCase() : 'S'}
          </span>
        </div>
        {storeConnected !== undefined && (
          <span
            className={`mt-1.5 w-1.5 h-1.5 rounded-full ${storeConnected ? 'bg-emerald-500' : 'bg-stone-300 dark:bg-white/30'}`}
            title={storeConnected ? 'Store connected' : 'No store connected'}
          />
        )}
      </div>

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
      <div className="w-6 h-px bg-stone-200 dark:bg-white/5 mb-1" />

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
