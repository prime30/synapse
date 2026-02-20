/**
 * Shared agent color map - single source of truth for agent colors across UI.
 * Used by ThinkingBlock, ContextMeter, AgentLiveBreakout, and editor decorations.
 */

export interface AgentColorSet {
  /** Tailwind border classes (light + dark) */
  border: string;
  /** Tailwind background classes (light + dark) */
  bg: string;
  /** Tailwind text classes (light + dark) */
  text: string;
  /** CSS color value for Monaco decorations / dynamic styles (light mode) */
  cssColor: string;
  /** CSS color value for Monaco decorations / dynamic styles (dark mode) */
  cssDarkColor: string;
}

export const AGENT_COLORS: Record<string, AgentColorSet> = {
  project_manager: {
    border: 'border-sky-300 dark:border-sky-700',
    bg: 'bg-sky-50 dark:bg-sky-950',
    text: 'text-sky-600 dark:text-sky-400',
    cssColor: '#0284c7',
    cssDarkColor: '#38bdf8',
  },
  liquid: {
    border: 'border-amber-300 dark:border-amber-700',
    bg: 'bg-amber-50 dark:bg-amber-950',
    text: 'text-amber-600 dark:text-amber-400',
    cssColor: '#d97706',
    cssDarkColor: '#fbbf24',
  },
  javascript: {
    border: 'border-yellow-300 dark:border-yellow-700',
    bg: 'bg-yellow-50 dark:bg-yellow-950',
    text: 'text-yellow-600 dark:text-yellow-400',
    cssColor: '#ca8a04',
    cssDarkColor: '#facc15',
  },
  css: {
    border: 'border-emerald-300 dark:border-emerald-700',
    bg: 'bg-emerald-50 dark:bg-emerald-950',
    text: 'text-emerald-600 dark:text-emerald-400',
    cssColor: '#059669',
    cssDarkColor: '#34d399',
  },
  json: {
    border: 'border-purple-300 dark:border-purple-700',
    bg: 'bg-purple-50 dark:bg-purple-950',
    text: 'text-purple-600 dark:text-purple-400',
    cssColor: '#9333ea',
    cssDarkColor: '#c084fc',
  },
  review: {
    border: 'border-green-300 dark:border-green-700',
    bg: 'bg-green-50 dark:bg-green-950',
    text: 'text-green-600 dark:text-green-400',
    cssColor: '#16a34a',
    cssDarkColor: '#4ade80',
  },
};

/** Default fallback color set for unknown agent types. */
export const DEFAULT_AGENT_COLOR: AgentColorSet = {
  border: 'border-stone-300 dark:border-stone-700',
  bg: 'bg-stone-50 dark:bg-stone-950',
  text: 'text-stone-600 dark:text-stone-400',
  cssColor: '#57534e',
  cssDarkColor: '#a8a29e',
};

/** General subagent color (shared by general_1 through general_4). */
const GENERAL_AGENT_COLOR: AgentColorSet = {
  border: 'border-indigo-300 dark:border-indigo-700',
  bg: 'bg-indigo-50 dark:bg-indigo-950',
  text: 'text-indigo-600 dark:text-indigo-400',
  cssColor: '#4f46e5',
  cssDarkColor: '#818cf8',
};

/** Get the color set for a given agent type, with a safe fallback. */
export function getAgentColor(agentType: string | undefined | null): AgentColorSet {
  if (!agentType) return DEFAULT_AGENT_COLOR;
  if (agentType.startsWith('general')) return GENERAL_AGENT_COLOR;
  return AGENT_COLORS[agentType] ?? DEFAULT_AGENT_COLOR;
}

/** ContextMeter-style badge classes (bg + text for inline badges). */
export const AGENT_BADGE_COLORS: Record<string, string> = {
  project_manager: 'bg-purple-500/20 text-purple-400',
  liquid: 'bg-amber-500/20 text-amber-400',
  css: 'bg-sky-500/20 text-sky-400',
  javascript: 'bg-yellow-500/20 text-yellow-400',
  json: 'bg-emerald-500/20 text-emerald-400',
  review: 'bg-rose-500/20 text-rose-400',
  general: 'bg-indigo-500/20 text-indigo-400',
  general_1: 'bg-indigo-500/20 text-indigo-400',
  general_2: 'bg-indigo-500/20 text-indigo-400',
  general_3: 'bg-indigo-500/20 text-indigo-400',
  general_4: 'bg-indigo-500/20 text-indigo-400',
};

/** Format agent type for user-friendly display. */
export function formatAgentLabel(agentType: string): string {
  if (agentType.startsWith('general_')) {
    const n = agentType.split('_')[1];
    return `Subagent ${n}`;
  }
  return agentType.replace('_', ' ');
}
