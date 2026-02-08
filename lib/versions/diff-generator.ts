export interface DiffResult {
  unified: string;
  added: number;
  removed: number;
}

export function generateUnifiedDiff(
  oldContent: string,
  newContent: string
): DiffResult {
  const oldLines = oldContent.split('\n');
  const newLines = newContent.split('\n');
  const max = Math.max(oldLines.length, newLines.length);

  const lines: string[] = [];
  let added = 0;
  let removed = 0;

  for (let i = 0; i < max; i += 1) {
    const oldLine = oldLines[i];
    const newLine = newLines[i];

    if (oldLine === newLine) {
      if (oldLine !== undefined) lines.push(` ${oldLine}`);
      continue;
    }

    if (oldLine !== undefined) {
      lines.push(`-${oldLine}`);
      removed += 1;
    }
    if (newLine !== undefined) {
      lines.push(`+${newLine}`);
      added += 1;
    }
  }

  const header = `@@ -1,${oldLines.length} +1,${newLines.length} @@`;
  return {
    unified: [header, ...lines].join('\n'),
    added,
    removed,
  };
}
