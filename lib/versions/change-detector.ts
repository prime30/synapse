export class ChangeDetector {
  generateChangeSummary(
    oldContent: string | null,
    newContent: string
  ): string {
    if (oldContent === null) {
      return "Initial version";
    }

    const oldLines = oldContent.split("\n");
    const newLines = newContent.split("\n");

    let added = 0;
    let removed = 0;
    let modified = 0;

    const maxLen = Math.max(oldLines.length, newLines.length);
    const minLen = Math.min(oldLines.length, newLines.length);

    for (let i = 0; i < minLen; i++) {
      if (oldLines[i] !== newLines[i]) {
        modified++;
      }
    }

    if (newLines.length > oldLines.length) {
      added = newLines.length - oldLines.length;
    } else if (oldLines.length > newLines.length) {
      removed = oldLines.length - newLines.length;
    }

    const parts: string[] = [];

    if (modified > 0) {
      parts.push(`Modified ${modified} line${modified !== 1 ? "s" : ""}`);
    }
    if (added > 0) {
      parts.push(`added ${added} line${added !== 1 ? "s" : ""}`);
    }
    if (removed > 0) {
      parts.push(`removed ${removed} line${removed !== 1 ? "s" : ""}`);
    }

    if (parts.length === 0) {
      return "No changes detected";
    }

    return parts.join(", ");
  }

  detectChangeType(
    oldContent: string | null,
    newContent: string
  ): "create" | "edit" | "restore" {
    if (oldContent === null) {
      return "create";
    }

    return "edit";
  }
}
