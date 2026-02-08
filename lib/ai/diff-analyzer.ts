export interface DiffSummary {
  added: number;
  removed: number;
  modified: number;
}

export function analyzeDiff(oldContent: string, newContent: string): DiffSummary {
  const oldLines = oldContent.split('\n');
  const newLines = newContent.split('\n');
  const max = Math.max(oldLines.length, newLines.length);

  let added = 0;
  let removed = 0;
  let modified = 0;

  for (let i = 0; i < max; i += 1) {
    const oldLine = oldLines[i];
    const newLine = newLines[i];
    if (oldLine === undefined && newLine !== undefined) {
      added += 1;
    } else if (newLine === undefined && oldLine !== undefined) {
      removed += 1;
    } else if (oldLine !== newLine) {
      modified += 1;
    }
  }

  return { added, removed, modified };
}
