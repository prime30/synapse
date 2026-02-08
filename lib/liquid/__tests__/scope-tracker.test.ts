import { describe, it, expect } from "vitest";
import { ScopeTracker } from "../scope-tracker";

describe("ScopeTracker", () => {
  it("starts at depth 0 (global scope)", () => {
    const tracker = new ScopeTracker();
    expect(tracker.getCurrentDepth()).toBe(0);
  });

  it("pushScope increases depth and popScope decreases it", () => {
    const tracker = new ScopeTracker();
    expect(tracker.getCurrentDepth()).toBe(0);

    tracker.pushScope();
    expect(tracker.getCurrentDepth()).toBe(1);

    tracker.pushScope();
    expect(tracker.getCurrentDepth()).toBe(2);

    tracker.popScope();
    expect(tracker.getCurrentDepth()).toBe(1);

    tracker.popScope();
    expect(tracker.getCurrentDepth()).toBe(0);
  });

  it("does not pop below the global scope", () => {
    const tracker = new ScopeTracker();
    tracker.popScope();
    tracker.popScope();
    expect(tracker.getCurrentDepth()).toBe(0);
  });

  it("adds and retrieves a variable in the current scope", () => {
    const tracker = new ScopeTracker();
    tracker.addVariable("x", "string");

    const result = tracker.getVariable("x");
    expect(result).not.toBeNull();
    expect(result!.name).toBe("x");
    expect(result!.type).toBe("string");
  });

  it("returns null for an unknown variable", () => {
    const tracker = new ScopeTracker();
    expect(tracker.getVariable("unknown")).toBeNull();
  });

  it("variable is visible in outer scope from inner scope", () => {
    const tracker = new ScopeTracker();
    tracker.addVariable("outer", "number");

    tracker.pushScope();
    const result = tracker.getVariable("outer");
    expect(result).not.toBeNull();
    expect(result!.name).toBe("outer");
    expect(result!.type).toBe("number");
  });

  it("inner scope variable shadows outer variable with same name", () => {
    const tracker = new ScopeTracker();
    tracker.addVariable("x", "string");

    tracker.pushScope();
    tracker.addVariable("x", "number");

    const result = tracker.getVariable("x");
    expect(result).not.toBeNull();
    expect(result!.type).toBe("number");
  });

  it("variable is NOT visible after its scope is popped", () => {
    const tracker = new ScopeTracker();

    tracker.pushScope();
    tracker.addVariable("temp", "boolean");
    expect(tracker.getVariable("temp")).not.toBeNull();

    tracker.popScope();
    expect(tracker.getVariable("temp")).toBeNull();
  });

  it("deeply nested scopes resolve variables correctly", () => {
    const tracker = new ScopeTracker();
    tracker.addVariable("a", "string");

    tracker.pushScope();
    tracker.addVariable("b", "number");

    tracker.pushScope();
    tracker.addVariable("c", "boolean");

    // All three should be visible at depth 2
    expect(tracker.getVariable("a")).not.toBeNull();
    expect(tracker.getVariable("b")).not.toBeNull();
    expect(tracker.getVariable("c")).not.toBeNull();

    tracker.popScope();
    // "c" gone, "a" and "b" still visible
    expect(tracker.getVariable("a")).not.toBeNull();
    expect(tracker.getVariable("b")).not.toBeNull();
    expect(tracker.getVariable("c")).toBeNull();

    tracker.popScope();
    // Only "a" visible
    expect(tracker.getVariable("a")).not.toBeNull();
    expect(tracker.getVariable("b")).toBeNull();
  });
});
