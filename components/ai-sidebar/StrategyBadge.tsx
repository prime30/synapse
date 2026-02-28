'use client';

const STRATEGY_CONFIG: Record<string, { label: string; description: string }> = {
  SIMPLE: { label: 'Simple', description: 'Direct editing, no delegation' },
  HYBRID: { label: 'Hybrid', description: 'PM + specialist agents' },
  GOD_MODE: { label: 'God Mode', description: 'Full-context single agent' },
};

interface StrategyBadgeProps {
  strategy: string;
  tier?: string;
}

export function StrategyBadge({ strategy, tier }: StrategyBadgeProps) {
  const config = STRATEGY_CONFIG[strategy];
  if (!config) return null;

  const isGodMode = strategy === 'GOD_MODE';

  return (
    <div className="inline-flex items-center gap-1.5">
      <span
        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium border bg-stone-500/10 dark:bg-white/5 ide-text-2 ide-border-subtle"
        title={`${config.description}${tier ? ` (${tier} tier)` : ''}`}
      >
        {isGodMode && (
          <span className="w-1.5 h-1.5 rounded-full bg-stone-400 dark:bg-[#4a4a4a] animate-pulse" />
        )}
        {config.label}
      </span>
      {tier && (
        <span className="text-[9px] text-stone-400 dark:text-gray-500">
          {tier}
        </span>
      )}
    </div>
  );
}
