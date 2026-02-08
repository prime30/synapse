'use client';

interface DiffPreviewProps {
  originalCode: string;
  suggestedCode: string;
}

function diffLines(original: string, suggested: string): Array<{
  line: string;
  type: 'original' | 'suggested' | 'both';
  originalLine?: string;
  suggestedLine?: string;
}> {
  const originalLines = original.split('\n');
  const suggestedLines = suggested.split('\n');
  const maxLines = Math.max(originalLines.length, suggestedLines.length);
  const result: Array<{
    line: string;
    type: 'original' | 'suggested' | 'both';
    originalLine?: string;
    suggestedLine?: string;
  }> = [];

  for (let i = 0; i < maxLines; i++) {
    const orig = originalLines[i];
    const sugg = suggestedLines[i];

    if (orig === undefined && sugg !== undefined) {
      result.push({
        line: sugg,
        type: 'suggested',
        suggestedLine: sugg,
      });
    } else if (orig !== undefined && sugg === undefined) {
      result.push({
        line: orig,
        type: 'original',
        originalLine: orig,
      });
    } else if (orig !== sugg) {
      result.push({
        line: sugg || orig || '',
        type: 'both',
        originalLine: orig,
        suggestedLine: sugg,
      });
    } else {
      result.push({
        line: orig || '',
        type: 'both',
        originalLine: orig,
        suggestedLine: sugg,
      });
    }
  }

  return result;
}

export function DiffPreview({
  originalCode,
  suggestedCode,
}: DiffPreviewProps) {
  const lines = diffLines(originalCode, suggestedCode);

  return (
    <div className="grid grid-cols-2 gap-4 border border-gray-700 rounded-lg overflow-hidden bg-gray-900">
      {/* Original column */}
      <div className="flex flex-col">
        <div className="px-3 py-2 bg-gray-800 border-b border-gray-700">
          <span className="text-xs font-medium text-gray-400">Original</span>
        </div>
        <div className="overflow-x-auto">
          <div className="font-mono text-sm">
            {lines.map((item, idx) => {
              const isChanged = item.type === 'original' || (item.type === 'both' && item.originalLine !== item.suggestedLine);
              return (
                <div
                  key={`orig-${idx}`}
                  className={`flex items-start ${
                    isChanged ? 'bg-red-500/10' : ''
                  }`}
                >
                  <span className="text-gray-500 px-2 py-1 text-xs select-none">
                    {idx + 1}
                  </span>
                  <span
                    className={`flex-1 px-2 py-1 ${
                      isChanged ? 'text-red-400 line-through' : 'text-gray-300'
                    }`}
                  >
                    {item.originalLine ?? ''}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Suggested column */}
      <div className="flex flex-col">
        <div className="px-3 py-2 bg-gray-800 border-b border-gray-700">
          <span className="text-xs font-medium text-gray-400">Suggested</span>
        </div>
        <div className="overflow-x-auto">
          <div className="font-mono text-sm">
            {lines.map((item, idx) => {
              const isChanged = item.type === 'suggested' || (item.type === 'both' && item.originalLine !== item.suggestedLine);
              return (
                <div
                  key={`sugg-${idx}`}
                  className={`flex items-start ${
                    isChanged ? 'bg-green-500/10' : ''
                  }`}
                >
                  <span className="text-gray-500 px-2 py-1 text-xs select-none">
                    {idx + 1}
                  </span>
                  <span
                    className={`flex-1 px-2 py-1 ${
                      isChanged ? 'text-green-400' : 'text-gray-300'
                    }`}
                  >
                    {item.suggestedLine ?? ''}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
