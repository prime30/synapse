import { describe, it, expect } from "vitest";
import { formatLiquid, FormatOptions } from "../formatter";

describe("formatLiquid", () => {
  it("indents block tags (if, for, unless)", () => {
    const input = `{% if product %}x{% endif %}`;
    const out = formatLiquid(input);
    expect(out).toBe(`{% if product %}\n  x\n{% endif %}\n`);
  });

  it("normalizes whitespace in {{ }} outputs", () => {
    const input = `{{  product.title  }}`;
    const out = formatLiquid(input);
    expect(out).toBe(`{{ product.title }}\n`);
  });

  it("normalizes whitespace in {% %} tags", () => {
    const input = `{%   if   condition   %}`;
    const out = formatLiquid(input);
    expect(out).toBe(`{% if condition %}\n`);
  });

  it("preserves raw blocks", () => {
    const input = `{% raw %}\n  {{  keep  }}\n{% endraw %}`;
    const out = formatLiquid(input);
    expect(out).toBe(`{% raw %}\n  {{  keep  }}\n{% endraw %}\n`);
  });

  it("preserves comment blocks", () => {
    const input = `{% comment %}do not touch{% endcomment %}`;
    const out = formatLiquid(input);
    expect(out).toBe(`{% comment %}do not touch{% endcomment %}\n`);
  });

  it("formats schema JSON with 2-space indent", () => {
    const input = `{% schema %}\n{"name":"Test"}\n{% endschema %}`;
    const out = formatLiquid(input);
    expect(out).toContain("  \"name\": \"Test\"");
    expect(out).toContain("{% schema %}");
    expect(out).toContain("{% endschema %}");
  });

  it("places elsif/else/when at same level as opening tag", () => {
    const input = `{% if a %}x{% else %}y{% endif %}`;
    const out = formatLiquid(input);
    expect(out).toBe(`{% if a %}\n  x\n{% else %}\n  y\n{% endif %}\n`);
  });

  it("preserves whitespace-trimmed tags {%- and -%}", () => {
    const input = `{%- if x -%}y{%- endif -%}`;
    const out = formatLiquid(input);
    expect(out).toContain("{%-");
    expect(out).toContain("-%}");
  });

  it("respects tabSize option", () => {
    const input = `{% if x %}y{% endif %}`;
    const out = formatLiquid(input, { tabSize: 4 });
    expect(out).toBe(`{% if x %}\n    y\n{% endif %}\n`);
  });

  it("respects insertFinalNewline: false", () => {
    const input = `{{ x }}`;
    const out = formatLiquid(input, { insertFinalNewline: false });
    expect(out).toBe(`{{ x }}`);
  });

  it("handles nested blocks", () => {
    const input = `{% if a %}{% for b in x %}y{% endfor %}{% endif %}`;
    const out = formatLiquid(input);
    expect(out).toBe(
      `{% if a %}\n  {% for b in x %}\n    y\n  {% endfor %}\n{% endif %}\n`
    );
  });

  it("does not re-indent HTML", () => {
    const input = `<div>{% if x %}<span>y</span>{% endif %}</div>`;
    const out = formatLiquid(input);
    expect(out).toBe(`<div>{% if x %}\n  <span>y</span>\n{% endif %}</div>\n`);
  });
});
