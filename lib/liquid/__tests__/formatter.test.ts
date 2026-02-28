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

  it("formats embedded JS inside {% javascript %} block", () => {
    const input = [
      '{% javascript %}',
      'document.addEventListener("DOMContentLoaded", function() {',
      'var x = 1;',
      'if (x > 0) {',
      'console.log(x);',
      '}',
      '});',
      '{% endjavascript %}',
    ].join('\n');
    const out = formatLiquid(input);
    expect(out).toBe(
      [
        '{% javascript %}',
        '  document.addEventListener("DOMContentLoaded", function() {',
        '    var x = 1;',
        '    if (x > 0) {',
        '      console.log(x);',
        '    }',
        '  });',
        '{% endjavascript %}',
        '',
      ].join('\n')
    );
  });

  it("formats embedded CSS inside {% style %} block", () => {
    const input = [
      '{% style %}',
      '.product-card {',
      'display: flex;',
      'color: red;',
      '}',
      '@media (min-width: 768px) {',
      '.product-card {',
      'display: grid;',
      '}',
      '}',
      '{% endstyle %}',
    ].join('\n');
    const out = formatLiquid(input);
    expect(out).toBe(
      [
        '{% style %}',
        '  .product-card {',
        '    display: flex;',
        '    color: red;',
        '  }',
        '  @media (min-width: 768px) {',
        '    .product-card {',
        '      display: grid;',
        '    }',
        '  }',
        '{% endstyle %}',
        '',
      ].join('\n')
    );
  });

  it("formats JS inside <script> tags", () => {
    const input = [
      '<script>',
      'var items = [',
      '1,',
      '2,',
      '];',
      '</script>',
    ].join('\n');
    const out = formatLiquid(input);
    expect(out).toBe(
      [
        '<script>',
        '  var items = [',
        '    1,',
        '    2,',
        '  ];',
        '</script>',
        '',
      ].join('\n')
    );
  });

  it("formats CSS inside <style> tags", () => {
    const input = [
      '<style>',
      '.btn {',
      'background: blue;',
      '}',
      '</style>',
    ].join('\n');
    const out = formatLiquid(input);
    expect(out).toBe(
      [
        '<style>',
        '  .btn {',
        '    background: blue;',
        '  }',
        '</style>',
        '',
      ].join('\n')
    );
  });

  it("nests embedded JS indent inside Liquid blocks", () => {
    const input = [
      '{% if settings.enable_js %}',
      '{% javascript %}',
      'console.log("hello");',
      '{% endjavascript %}',
      '{% endif %}',
    ].join('\n');
    const out = formatLiquid(input);
    expect(out).toBe(
      [
        '{% if settings.enable_js %}',
        '  {% javascript %}',
        '    console.log("hello");',
        '  {% endjavascript %}',
        '{% endif %}',
        '',
      ].join('\n')
    );
  });

  it("handles <script> with attributes", () => {
    const input = [
      '<script type="text/javascript">',
      'var x = 1;',
      '</script>',
    ].join('\n');
    const out = formatLiquid(input);
    expect(out).toBe(
      [
        '<script type="text/javascript">',
        '  var x = 1;',
        '</script>',
        '',
      ].join('\n')
    );
  });

  it("does not enter embedded mode for self-closing script tags", () => {
    const input = '<script src="app.js"></script>';
    const out = formatLiquid(input);
    expect(out).toBe('<script src="app.js"></script>\n');
  });

  it("preserves blank lines inside embedded blocks", () => {
    const input = [
      '{% javascript %}',
      'var a = 1;',
      '',
      'var b = 2;',
      '{% endjavascript %}',
    ].join('\n');
    const out = formatLiquid(input);
    expect(out).toBe(
      [
        '{% javascript %}',
        '  var a = 1;',
        '',
        '  var b = 2;',
        '{% endjavascript %}',
        '',
      ].join('\n')
    );
  });
});
