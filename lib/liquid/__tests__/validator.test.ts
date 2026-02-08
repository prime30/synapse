import { describe, it, expect } from "vitest";
import { LiquidValidator } from "../validator";

describe("LiquidValidator", () => {
  const validator = new LiquidValidator();

  // ── Syntax validation ───────────────────────────────────────────────────

  describe("validateSyntax", () => {
    it("detects an unclosed if tag", () => {
      const template = `{% if product.available %}
        <p>In stock</p>`;

      const errors = validator.validateSyntax(template);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].type).toBe("syntax");
      expect(errors[0].severity).toBe("error");
      expect(errors[0].message).toContain("if");
      expect(errors[0].message).toContain("endif");
    });

    it("passes valid Liquid with properly closed tags", () => {
      const template = `{% if product.available %}
        <p>In stock</p>
      {% endif %}`;

      const errors = validator.validateSyntax(template);
      expect(errors).toHaveLength(0);
    });

    it("detects mismatched tags", () => {
      const template = `{% if product.available %}
        <p>In stock</p>
      {% endfor %}`;

      const errors = validator.validateSyntax(template);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].type).toBe("syntax");
      expect(errors[0].message).toContain("Mismatched");
    });

    it("handles nested block tags correctly", () => {
      const template = `{% if product.available %}
        {% for variant in product.variants %}
          <p>{{ variant.title }}</p>
        {% endfor %}
      {% endif %}`;

      const errors = validator.validateSyntax(template);
      expect(errors).toHaveLength(0);
    });

    it("detects an unexpected closing tag with no opener", () => {
      const template = `<p>Hello</p>{% endif %}`;

      const errors = validator.validateSyntax(template);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].message).toContain("Unexpected closing tag");
    });

    it("handles elsif and else without errors", () => {
      const template = `{% if product.available %}
        <p>In stock</p>
      {% elsif product.compare_at_price %}
        <p>Compare</p>
      {% else %}
        <p>Out of stock</p>
      {% endif %}`;

      const errors = validator.validateSyntax(template);
      expect(errors).toHaveLength(0);
    });

    it("handles multiple block tags", () => {
      const template = `{% if true %}a{% endif %}{% for x in y %}b{% endfor %}{% unless false %}c{% endunless %}`;

      const errors = validator.validateSyntax(template);
      expect(errors).toHaveLength(0);
    });
  });

  // ── Semantic validation ─────────────────────────────────────────────────

  describe("validateSemantics", () => {
    it("detects an undefined variable and suggests a close match", () => {
      const template = `{{ prodcut.title }}`;

      const errors = validator.validateSemantics(template);
      expect(errors.length).toBeGreaterThan(0);

      const varError = errors.find(
        (e) => e.type === "semantic" && e.message.includes("prodcut"),
      );
      expect(varError).toBeDefined();
      expect(varError!.suggestion).toContain("product");
    });

    it("does not flag known Shopify objects", () => {
      const template = `{{ product.title }}{{ collection.handle }}{{ cart.item_count }}`;

      const errors = validator.validateSemantics(template);
      const varErrors = errors.filter(
        (e) => e.type === "semantic" && e.message.includes("Unknown variable"),
      );
      expect(varErrors).toHaveLength(0);
    });

    it("does not flag assigned variables", () => {
      const template = `{% assign greeting = "hello" %}{{ greeting }}`;

      const errors = validator.validateSemantics(template);
      const varErrors = errors.filter(
        (e) => e.type === "semantic" && e.message.includes("greeting"),
      );
      expect(varErrors).toHaveLength(0);
    });

    it("detects an unknown filter", () => {
      const template = `{{ product.title | upcasee }}`;

      const errors = validator.validateSemantics(template);
      const filterError = errors.find(
        (e) => e.type === "semantic" && e.message.includes("upcasee"),
      );
      expect(filterError).toBeDefined();
      expect(filterError!.suggestion).toContain("upcase");
    });

    it("does not flag known filters", () => {
      const template = `{{ product.title | upcase | escape }}`;

      const errors = validator.validateSemantics(template);
      const filterErrors = errors.filter(
        (e) => e.type === "semantic" && e.message.includes("Unknown filter"),
      );
      expect(filterErrors).toHaveLength(0);
    });

    it("treats custom tags as valid when provided", () => {
      const template = `{% my_custom_tag %}`;

      const errorsWithout = validator.validateSemantics(template);
      const tagErrorWithout = errorsWithout.find(
        (e) => e.message.includes("my_custom_tag"),
      );
      expect(tagErrorWithout).toBeDefined();

      const errorsWith = validator.validateSemantics(
        template,
        ["my_custom_tag"],
        [],
      );
      const tagErrorWith = errorsWith.find(
        (e) => e.message.includes("my_custom_tag"),
      );
      expect(tagErrorWith).toBeUndefined();
    });

    it("treats custom filters as valid when provided", () => {
      const template = `{{ product.title | my_filter }}`;

      const errorsWithout = validator.validateSemantics(template);
      const filterErrorWithout = errorsWithout.find(
        (e) => e.message.includes("my_filter"),
      );
      expect(filterErrorWithout).toBeDefined();

      const errorsWith = validator.validateSemantics(
        template,
        [],
        ["my_filter"],
      );
      const filterErrorWith = errorsWith.find(
        (e) => e.message.includes("my_filter"),
      );
      expect(filterErrorWith).toBeUndefined();
    });

    it("does not flag for-loop iterator variables", () => {
      const template = `{% for item in product.variants %}{{ item.title }}{% endfor %}`;

      const errors = validator.validateSemantics(template);
      const varErrors = errors.filter(
        (e) => e.type === "semantic" && e.message.includes('"item"'),
      );
      expect(varErrors).toHaveLength(0);
    });

    it("does not flag string literals", () => {
      const template = `{{ "hello world" | upcase }}`;

      const errors = validator.validateSemantics(template);
      const varErrors = errors.filter(
        (e) => e.type === "semantic" && e.message.includes("Unknown variable"),
      );
      expect(varErrors).toHaveLength(0);
    });
  });

  // ── Security validation ─────────────────────────────────────────────────

  describe("validateSecurity", () => {
    it("flags unescaped request output", () => {
      const template = `{{ request.path }}`;

      const errors = validator.validateSecurity(template);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].type).toBe("security");
      expect(errors[0].message).toContain("request");
      expect(errors[0].message).toContain("XSS");
    });

    it("does not flag escaped request output", () => {
      const template = `{{ request.path | escape }}`;

      const errors = validator.validateSecurity(template);
      const securityErrors = errors.filter(
        (e) => e.type === "security" && e.message.includes("request"),
      );
      expect(securityErrors).toHaveLength(0);
    });

    it("flags unescaped form output", () => {
      const template = `{{ form.errors }}`;

      const errors = validator.validateSecurity(template);
      const formError = errors.find(
        (e) => e.type === "security" && e.message.includes("form"),
      );
      expect(formError).toBeDefined();
    });

    it("flags unescaped customer output", () => {
      const template = `{{ customer.email }}`;

      const errors = validator.validateSecurity(template);
      const customerError = errors.find(
        (e) => e.type === "security" && e.message.includes("customer"),
      );
      expect(customerError).toBeDefined();
    });

    it("reports raw tag usage as info", () => {
      const template = `{% raw %}{{ user_input }}{% endraw %}`;

      const errors = validator.validateSecurity(template);
      const rawWarning = errors.find(
        (e) => e.type === "security" && e.message.includes("raw"),
      );
      expect(rawWarning).toBeDefined();
      expect(rawWarning!.severity).toBe("info");
    });

    it("does not flag safe templates", () => {
      const template = `{{ product.title | escape }}`;

      const errors = validator.validateSecurity(template);
      expect(errors).toHaveLength(0);
    });
  });

  // ── Full validation (async) ─────────────────────────────────────────────

  describe("validate (full async)", () => {
    it("returns valid: true for a correct template", async () => {
      const template = `{% if product.available %}
        <p>{{ product.title | escape }}</p>
      {% endif %}`;

      const result = await validator.validate(template);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("returns valid: false when there are syntax errors", async () => {
      const template = `{% if product.available %}
        <p>{{ product.title }}</p>`;

      const result = await validator.validate(template);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it("collects warnings from semantic checks", async () => {
      const template = `{% if product.available %}
        {{ prodcut.title | upcase }}
      {% endif %}`;

      const result = await validator.validate(template);
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it("handles projectId gracefully when DB is unavailable", async () => {
      const template = `{{ product.title }}`;

      // Should not throw even with a projectId
      const result = await validator.validate(template, "some-project-id");
      expect(result).toBeDefined();
      expect(result.valid).toBeDefined();
    });
  });
});
