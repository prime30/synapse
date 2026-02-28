'use client';

interface TokenBudgetBadgeProps {
  usedTokens: number;
  modelLimit: number;
  className?: string;
}

const AVG_TOKENS_PER_TURN = 4000;

export function TokenBudgetBadge({ usedTokens, modelLimit, className = '' }: TokenBudgetBadgeProps) {
  const remaining = Math.max(0, modelLimit - usedTokens);
  const turnsLeft = Math.floor(remaining / AVG_TOKENS_PER_TURN);
  const usageRatio = modelLimit > 0 ? usedTokens / modelLimit : 0;

  const colorClass =
    usageRatio >= 0.95
      ? 'text-red-500 dark:text-red-400'
      : usageRatio >= 0.8
        ? 'text-amber-500 dark:text-amber-400'
        : 'text-stone-500 dark:text-stone-400';

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium tabular-nums border border-stone-200 dark:border-[#2a2a2a] ${colorClass} ${className}`}
      title={`~${turnsLeft} turns left (${remaining.toLocaleString()} tokens remaining)`}
    >
      ~{turnsLeft} turns left
    </span>
  );
}
