import { describe, it, expect } from "vitest";
import type { ConflictInfo, ConflictDetails } from "../conflict-detector";

describe("ConflictInfo structure", () => {
  it("has the required fields", () => {
    const info: ConflictInfo = {
      latestVersion: 3,
      expectedVersion: 2,
      conflictingUserId: "user-123",
      conflictingAt: "2026-02-07T12:00:00Z",
    };

    expect(info.latestVersion).toBe(3);
    expect(info.expectedVersion).toBe(2);
    expect(info.conflictingUserId).toBe("user-123");
    expect(info.conflictingAt).toBe("2026-02-07T12:00:00Z");
  });

  it("indicates a version mismatch when latestVersion differs from expectedVersion", () => {
    const info: ConflictInfo = {
      latestVersion: 5,
      expectedVersion: 3,
      conflictingUserId: "user-456",
      conflictingAt: "2026-02-07T14:00:00Z",
    };

    expect(info.latestVersion).not.toBe(info.expectedVersion);
  });
});

describe("ConflictDetails extends ConflictInfo", () => {
  it("has all ConflictInfo fields plus latestContent", () => {
    const details: ConflictDetails = {
      latestVersion: 4,
      expectedVersion: 3,
      conflictingUserId: "user-789",
      conflictingAt: "2026-02-07T16:00:00Z",
      latestContent: "Updated file content from another user",
    };

    expect(details.latestVersion).toBe(4);
    expect(details.expectedVersion).toBe(3);
    expect(details.conflictingUserId).toBe("user-789");
    expect(details.conflictingAt).toBe("2026-02-07T16:00:00Z");
    expect(details.latestContent).toBe(
      "Updated file content from another user"
    );
  });

  it("can be assigned to a ConflictInfo variable", () => {
    const details: ConflictDetails = {
      latestVersion: 2,
      expectedVersion: 1,
      conflictingUserId: "user-abc",
      conflictingAt: "2026-02-07T18:00:00Z",
      latestContent: "some content",
    };

    const info: ConflictInfo = details;
    expect(info.latestVersion).toBe(2);
    expect(info.expectedVersion).toBe(1);
  });
});
