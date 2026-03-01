'use client';

/**
 * Horizontal color ramp visualization for design system tokens.
 * Shows steps as colored blocks with WCAG contrast badges.
 */

export interface ColorRampEntry {
  step: number;
  hex: string;
  contrastOnWhite?: number;
  contrastOnBlack?: number;
}

export interface ColorRampStripProps {
  /** Brand color name (e.g. "primary", "accent") */
  brandName: string;
  /** Ramp entries ordered by step */
  entries: ColorRampEntry[];
  /** Step number to highlight as base (e.g. 500) */
  baseStep?: number;
}

function formatContrast(ratio: number): string {
  if (ratio >= 7) return 'AAA';
  if (ratio >= 4.5) return 'AA';
  if (ratio >= 3) return 'A';
  return '';
}

export function ColorRampStrip({ brandName, entries, baseStep = 500 }: ColorRampStripProps) {
  if (entries.length === 0) return null;

  const sorted = [...entries].sort((a, b) => a.step - b.step);

  return (
    <div className="space-y-1.5">
      <p className="text-[10px] font-medium text-stone-700 dark:text-gray-300 uppercase tracking-wider">
        {brandName}
      </p>
      <div className="flex flex-wrap gap-0.5">
        {sorted.map((entry) => {
          const isBase = entry.step === baseStep;
          const contrastWhite = entry.contrastOnWhite ?? 0;
          const contrastBlack = entry.contrastOnBlack ?? 0;
          const badgeWhite = formatContrast(contrastWhite);
          const badgeBlack = formatContrast(contrastBlack);

          return (
            <div
              key={entry.step}
              className={[
                'relative flex flex-col items-center group',
                isBase && 'ring-2 ring-sky-500 dark:ring-sky-400 ring-offset-2 dark:ring-offset-[#0a0a0a] rounded-sm',
              ].filter(Boolean).join(' ')}
            >
              <div
                className="w-6 h-6 rounded-sm border border-stone-200/60 dark:border-white/10 shrink-0"
                style={{ backgroundColor: entry.hex }}
                title={`${brandName}-${entry.step}: ${entry.hex}`}
              />
              <span className="text-[9px] text-stone-600 dark:text-gray-400 font-mono mt-0.5">
                {entry.step}
              </span>
              {(badgeWhite || badgeBlack) && (
                <div className="absolute -top-1 -right-1 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  {badgeWhite && (
                    <span
                      className="px-1 py-0.5 rounded text-[8px] font-medium bg-white text-stone-800 border border-stone-200"
                      title={`Contrast on white: ${contrastWhite.toFixed(1)}:1`}
                    >
                      {badgeWhite}
                    </span>
                  )}
                  {badgeBlack && (
                    <span
                      className="px-1 py-0.5 rounded text-[8px] font-medium bg-stone-900 text-white border border-stone-700"
                      title={`Contrast on black: ${contrastBlack.toFixed(1)}:1`}
                    >
                      {badgeBlack}
                    </span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
