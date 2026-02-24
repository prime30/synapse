'use client';

interface ConfidenceChartProps {
  data: Array<{ confidence: number }>;
}

const BRACKETS = [
  { label: '0-0.2', min: 0, max: 0.2 },
  { label: '0.2-0.4', min: 0.2, max: 0.4 },
  { label: '0.4-0.6', min: 0.4, max: 0.6 },
  { label: '0.6-0.8', min: 0.6, max: 0.8 },
  { label: '0.8-1.0', min: 0.8, max: 1.01 },
] as const;

export function ConfidenceChart({ data }: ConfidenceChartProps) {
  const counts = BRACKETS.map(({ min, max }) =>
    data.filter((d) => d.confidence >= min && d.confidence < max).length
  );
  const maxCount = Math.max(1, ...counts);

  return (
    <div>
      <h3 className="text-xs font-medium text-stone-500 dark:text-stone-400 mb-2">
        Confidence distribution
      </h3>
      <div className="flex items-end gap-1 h-16">
        {counts.map((count, i) => {
          const barHeight = Math.max(0, (count / maxCount) * 64);
          return (
            <div key={BRACKETS[i].label} className="flex flex-col items-center flex-1 min-w-[20px] h-16">
              <div className="flex-1 min-h-0 w-full flex flex-col justify-end">
                <div
                  className="w-full bg-sky-400 dark:bg-sky-500 rounded-t-sm min-w-[20px] transition-all"
                  style={{
                    height: `${barHeight}px`,
                    minHeight: count > 0 ? 4 : 0,
                  }}
                />
              </div>
              <span className="text-[9px] text-stone-400 dark:text-stone-500 mt-1">
                {BRACKETS[i].label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
