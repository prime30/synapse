/**
 * Expands "keep existing code" markers by replacing them with the actual
 * content from the original file. Supports:
 * - // ... keep existing code
 * - block comment (slash-star ... keep existing code star-slash)
 * - {%- comment -%}... keep existing code{%- endcomment -%}
 */
export function expandKeepExisting(proposedContent: string, originalContent: string): string {
  const MARKERS = [
    /\/\/\s*\.{3}\s*keep existing code[^\n]*/gi,
    /\/\*\s*\.{3}\s*keep existing code[\s\S]*?\*\//gi,
    /\{%-?\s*comment\s*-?%\}\s*\.{3}\s*keep existing code[\s\S]*?\{%-?\s*endcomment\s*-?%\}/gi,
  ];

  const originalLines = originalContent.split('\n');
  const proposedLines = proposedContent.split('\n');

  const expandedLines: string[] = [];
  let origIdx = 0;

  for (let i = 0; i < proposedLines.length; i++) {
    const line = proposedLines[i];
    const isMarker = MARKERS.some(re => {
      re.lastIndex = 0;
      return re.test(line);
    });

    if (isMarker) {
      // Find the matching section in original by looking at surrounding lines
      const prevLine = i > 0 ? proposedLines[i - 1].trim() : '';
      const nextLine = i < proposedLines.length - 1 ? proposedLines[i + 1].trim() : '';

      // Find prevLine in original
      let startIdx = -1;
      for (let j = origIdx; j < originalLines.length; j++) {
        if (originalLines[j].trim() === prevLine) {
          startIdx = j + 1;
          break;
        }
      }

      // Find nextLine in original after startIdx
      let endIdx = originalLines.length;
      if (nextLine && startIdx >= 0) {
        for (let j = startIdx; j < originalLines.length; j++) {
          if (originalLines[j].trim() === nextLine) {
            endIdx = j;
            break;
          }
        }
      }

      // Insert original lines between start and end
      if (startIdx >= 0 && endIdx > startIdx) {
        expandedLines.push(...originalLines.slice(startIdx, endIdx));
        origIdx = endIdx;
      } else {
        // Couldn't match — keep the marker as a comment
        expandedLines.push(line);
      }
    } else {
      expandedLines.push(line);
      // Track position in original
      if (line.trim() && origIdx < originalLines.length) {
        for (let j = origIdx; j < originalLines.length; j++) {
          if (originalLines[j].trim() === line.trim()) {
            origIdx = j + 1;
            break;
          }
        }
      }
    }
  }

  return expandedLines.join('\n');
}
