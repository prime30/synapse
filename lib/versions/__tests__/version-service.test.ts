import { describe, it, expect } from "vitest";
import { ChangeDetector } from "../change-detector";

describe("ChangeDetector", () => {
  const detector = new ChangeDetector();

  describe("generateChangeSummary", () => {
    it('returns "Initial version" when oldContent is null', () => {
      const summary = detector.generateChangeSummary(null, "new content");
      expect(summary).toBe("Initial version");
    });

    it('returns "No changes detected" when content is identical', () => {
      const content = "line 1\nline 2\nline 3";
      const summary = detector.generateChangeSummary(content, content);
      expect(summary).toBe("No changes detected");
    });

    it("describes modified lines when content differs", () => {
      const oldContent = "line 1\nline 2\nline 3";
      const newContent = "line 1\nchanged line\nline 3";
      const summary = detector.generateChangeSummary(oldContent, newContent);
      expect(summary).toContain("Modified 1 line");
    });

    it("describes multiple modified lines", () => {
      const oldContent = "line 1\nline 2\nline 3";
      const newContent = "changed 1\nchanged 2\nchanged 3";
      const summary = detector.generateChangeSummary(oldContent, newContent);
      expect(summary).toContain("Modified 3 lines");
    });

    it("describes added lines", () => {
      const oldContent = "line 1";
      const newContent = "line 1\nline 2\nline 3";
      const summary = detector.generateChangeSummary(oldContent, newContent);
      expect(summary).toContain("added 2 lines");
    });

    it("describes removed lines", () => {
      const oldContent = "line 1\nline 2\nline 3";
      const newContent = "line 1";
      const summary = detector.generateChangeSummary(oldContent, newContent);
      expect(summary).toContain("removed 2 lines");
    });

    it("describes both modified and added lines", () => {
      const oldContent = "line 1\nline 2";
      const newContent = "changed\nline 2\nline 3\nline 4";
      const summary = detector.generateChangeSummary(oldContent, newContent);
      expect(summary).toContain("Modified 1 line");
      expect(summary).toContain("added 2 lines");
    });
  });

  describe("detectChangeType", () => {
    it('returns "create" when oldContent is null', () => {
      const changeType = detector.detectChangeType(null, "new content");
      expect(changeType).toBe("create");
    });

    it('returns "edit" when oldContent differs from newContent', () => {
      const changeType = detector.detectChangeType("old", "new");
      expect(changeType).toBe("edit");
    });

    it('returns "edit" when content is the same', () => {
      const changeType = detector.detectChangeType("same", "same");
      expect(changeType).toBe("edit");
    });
  });
});
