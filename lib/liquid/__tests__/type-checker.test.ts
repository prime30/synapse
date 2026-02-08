import { describe, it, expect } from "vitest";
import { TypeChecker } from "../type-checker";

describe("TypeChecker", () => {
  const checker = new TypeChecker();

  describe("inferType", () => {
    it('infers product.title as "string"', () => {
      expect(checker.inferType("product.title")).toBe("string");
    });

    it('infers product.price as "number"', () => {
      expect(checker.inferType("product.price")).toBe("number");
    });

    it('infers product.available as "boolean"', () => {
      expect(checker.inferType("product.available")).toBe("boolean");
    });

    it('infers product.tags as "array"', () => {
      expect(checker.inferType("product.tags")).toBe("array");
    });

    it('infers product as "object"', () => {
      expect(checker.inferType("product")).toBe("object");
    });

    it('infers product.featured_image.src as "string"', () => {
      expect(checker.inferType("product.featured_image.src")).toBe("string");
    });

    it('returns "unknown" for a non-existent root object', () => {
      expect(checker.inferType("foobar")).toBe("unknown");
    });

    it('returns "unknown" for a non-existent property', () => {
      expect(checker.inferType("product.nonexistent")).toBe("unknown");
    });

    it('infers cart.total_price as "number"', () => {
      expect(checker.inferType("cart.total_price")).toBe("number");
    });

    it('infers customer.email as "string"', () => {
      expect(checker.inferType("customer.email")).toBe("string");
    });
  });

  describe("checkFilterType", () => {
    it("passes when filter input type matches", () => {
      const result = checker.checkFilterType("upcase", "string");
      expect(result.valid).toBe(true);
    });

    it("fails when filter input type does not match", () => {
      const result = checker.checkFilterType("upcase", "number");
      expect(result.valid).toBe(false);
      expect(result.message).toBeDefined();
      expect(result.message).toContain("upcase");
      expect(result.message).toContain("string");
    });

    it("passes for filters accepting any input type", () => {
      const result = checker.checkFilterType("json", "number");
      expect(result.valid).toBe(true);
    });

    it("fails for unknown filters", () => {
      const result = checker.checkFilterType("nonexistent_filter", "string");
      expect(result.valid).toBe(false);
      expect(result.message).toContain("Unknown filter");
    });

    it("passes array filters with array input", () => {
      const result = checker.checkFilterType("join", "array");
      expect(result.valid).toBe(true);
    });

    it("passes array filters with typed array input", () => {
      const result = checker.checkFilterType("join", "array<string>");
      expect(result.valid).toBe(true);
    });

    it("fails number filter with string input", () => {
      const result = checker.checkFilterType("plus", "string");
      expect(result.valid).toBe(false);
    });

    it("passes when input type is any", () => {
      const result = checker.checkFilterType("upcase", "any");
      expect(result.valid).toBe(true);
    });
  });

  describe("getFilterOutputType", () => {
    it("returns the output type of a known filter", () => {
      expect(checker.getFilterOutputType("upcase")).toBe("string");
      expect(checker.getFilterOutputType("plus")).toBe("number");
      expect(checker.getFilterOutputType("split")).toBe("array");
    });

    it("returns null for an unknown filter", () => {
      expect(checker.getFilterOutputType("nonexistent")).toBeNull();
    });
  });
});
