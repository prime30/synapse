import { describe, it, expect } from "vitest";
import type { ConflictInfo, ConflictDetails } from "../conflict-detector";

describe("ConflictInfo type", () => {
  it("can be constructed with all required fields", () => {
    const info: ConflictInfo = {
      latestVersion: 5,
      expectedVersion: 4,
      conflictingUserId: "user-100",
      conflictingAt: "2026-02-07T10:00:00Z",
    };

    expect(info).toEqual({
      latestVersion: 5,
      expectedVersion: 4,
      conflictingUserId: "user-100",
      conflictingAt: "2026-02-07T10:00:00Z",
    });
  });

  it("latestVersion and expectedVersion are numbers", () => {
    const info: ConflictInfo = {
      latestVersion: 10,
      expectedVersion: 8,
      conflictingUserId: "user-200",
      conflictingAt: "2026-02-07T11:00:00Z",
    };

    expect(typeof info.latestVersion).toBe("number");
    expect(typeof info.expectedVersion).toBe("number");
  });

  it("conflictingUserId and conflictingAt are strings", () => {
    const info: ConflictInfo = {
      latestVersion: 1,
      expectedVersion: 1,
      conflictingUserId: "user-300",
      conflictingAt: "2026-02-07T12:00:00Z",
    };

    expect(typeof info.conflictingUserId).toBe("string");
    expect(typeof info.conflictingAt).toBe("string");
  });
});

describe("ConflictDetails type", () => {
  it("extends ConflictInfo with latestContent field", () => {
    const details: ConflictDetails = {
      latestVersion: 3,
      expectedVersion: 2,
      conflictingUserId: "user-400",
      conflictingAt: "2026-02-07T13:00:00Z",
      latestContent: "The latest file content",
    };

    expect(details).toEqual({
      latestVersion: 3,
      expectedVersion: 2,
      conflictingUserId: "user-400",
      conflictingAt: "2026-02-07T13:00:00Z",
      latestContent: "The latest file content",
    });
  });

  it("latestContent is a string", () => {
    const details: ConflictDetails = {
      latestVersion: 7,
      expectedVersion: 5,
      conflictingUserId: "user-500",
      conflictingAt: "2026-02-07T14:00:00Z",
      latestContent: "content here",
    };

    expect(typeof details.latestContent).toBe("string");
  });

  it("is assignable to ConflictInfo", () => {
    const details: ConflictDetails = {
      latestVersion: 6,
      expectedVersion: 4,
      conflictingUserId: "user-600",
      conflictingAt: "2026-02-07T15:00:00Z",
      latestContent: "some file content",
    };

    const asInfo: ConflictInfo = details;
    expect(asInfo.latestVersion).toBe(6);
    expect(asInfo.expectedVersion).toBe(4);
    expect(asInfo.conflictingUserId).toBe("user-600");
    expect(asInfo.conflictingAt).toBe("2026-02-07T15:00:00Z");
  });
});
