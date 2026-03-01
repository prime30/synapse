'use client';

import { useDesignComponents } from '@/hooks/useDesignComponents';
import { useDesignTokens } from '@/hooks/useDesignTokens';

export interface ButtonSystemSectionProps {
  projectId: string;
  onScan?: () => void;
}

export function ButtonSystemSection({ projectId, onScan }: ButtonSystemSectionProps) {
  const { components, count, isLoading } = useDesignComponents(projectId);
  const { scan, isScanning } = useDesignTokens(projectId);

  const buttons = components.filter(
    (c) =>
      c.name.toLowerCase().includes('button') ||
      c.name.toLowerCase().includes('btn') ||
      c.name.toLowerCase().includes('cta'),
  );

  const handleScan = () => {
    if (onScan) onScan();
    else scan();
  };

  if (isLoading) {
    return (
      <div className="p-4 rounded-lg border border-stone-200 dark:border-white/10 bg-stone-50/50 dark:bg-white/5 animate-pulse">
        <div className="h-4 w-24 rounded bg-stone-200 dark:bg-white/10 mb-3" />
        <div className="h-20 rounded bg-stone-200 dark:bg-white/10" />
      </div>
    );
  }

  if (buttons.length === 0) {
    return (
      <div className="p-4 rounded-lg border border-stone-200 dark:border-white/10 bg-stone-50/50 dark:bg-white/5">
        <h3 className="text-sm font-semibold text-stone-900 dark:text-white mb-1">
          Button System
        </h3>
        <p className="text-xs text-stone-600 dark:text-gray-400 mb-3">
          No button components detected yet.
        </p>
        <button
          type="button"
          onClick={handleScan}
          disabled={isScanning}
          className="text-xs px-3 py-1.5 rounded-md bg-sky-500 hover:bg-sky-600 text-white disabled:opacity-50 transition-colors"
        >
          {isScanning ? 'Scanning…' : 'Scan Theme'}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-stone-900 dark:text-white">
        Button System ({buttons.length})
      </h3>
      <div className="space-y-3">
        {buttons.map((btn) => {
          const tokenSet = btn.buttonTokenSet;
          const variants = btn.variants ?? [];

          return (
            <div
              key={btn.id ?? btn.name}
              className="p-3 rounded-lg border border-stone-200 dark:border-white/10 bg-white dark:bg-white/5"
            >
              <p className="text-xs font-medium text-stone-800 dark:text-gray-200 mb-1">
                {btn.name}
              </p>
              <p className="text-[10px] text-stone-500 dark:text-gray-500 font-mono mb-2">
                {btn.file_path}
              </p>
              {variants.length > 0 && (
                <p className="text-[10px] text-stone-600 dark:text-gray-400 mb-1">
                  Variants: {variants.join(', ')}
                </p>
              )}
              {tokenSet && Object.keys(tokenSet).length > 0 && (
                <div className="mt-2 space-y-1">
                  {Object.entries(tokenSet).map(([variant, tokens]) => (
                    <div key={variant} className="text-[10px]">
                      <span className="font-medium text-stone-600 dark:text-gray-400">
                        {variant}:
                      </span>{' '}
                      {Object.entries(tokens)
                        .filter(([, v]) => v)
                        .map(([k, v]) => `${k}: ${v}`)
                        .join(', ')}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
