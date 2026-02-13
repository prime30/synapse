import { describe, it, expect } from 'vitest';
import {
  parseLiquidAST,
  astToString,
  type LiquidASTNode,
  type OutputNode,
  type AssignNode,
  type IfNode,
  type ForNode,
  type CaseNode,
  type CaptureNode,
  type RawNode,
  type CommentNode,
  type SchemaNode,
  type RenderNode,
  type IncludeNode,
  type UnlessNode,
  type TextNode,
  type FormNode,
  type PaginateNode,
  type TableRowNode,
  type LayoutNode,
  type StyleNode,
  type JavaScriptNode,
  type IncrementNode,
  type DecrementNode,
} from '../liquid-ast';
import { walkLiquidAST } from '../ast-walker';
import { ScopeTracker } from '../scope-tracker';
import { TypeChecker } from '../type-checker';

// ── Helper ───────────────────────────────────────────────────────────────────

function parse(template: string) {
  return parseLiquidAST(template);
}

function firstNode(template: string): LiquidASTNode {
  const { ast } = parse(template);
  return ast[0];
}

// ── Text ─────────────────────────────────────────────────────────────────────

describe('Text nodes', () => {
  it('parses plain text', () => {
    const { ast, errors } = parse('Hello World');
    expect(errors).toHaveLength(0);
    expect(ast).toHaveLength(1);
    expect(ast[0].type).toBe('Text');
    expect((ast[0] as TextNode).value).toBe('Hello World');
  });

  it('handles empty template', () => {
    const { ast, errors } = parse('');
    expect(errors).toHaveLength(0);
    expect(ast).toHaveLength(0);
  });

  it('preserves text between tags', () => {
    const { ast } = parse('before{% if true %}middle{% endif %}after');
    expect(ast).toHaveLength(3);
    expect((ast[0] as TextNode).value).toBe('before');
    expect(ast[1].type).toBe('If');
    expect((ast[2] as TextNode).value).toBe('after');
  });
});

// ── Output ───────────────────────────────────────────────────────────────────

describe('Output nodes', () => {
  it('parses simple variable output', () => {
    const { ast, errors } = parse('{{ product.title }}');
    expect(errors).toHaveLength(0);
    expect(ast).toHaveLength(1);
    const output = ast[0] as OutputNode;
    expect(output.type).toBe('Output');
    expect(output.expression.type).toBe('VariableLookup');
    if (output.expression.type === 'VariableLookup') {
      expect(output.expression.name).toBe('product');
      expect(output.expression.lookups).toEqual(['title']);
    }
  });

  it('parses string literal output', () => {
    const output = firstNode("{{ 'hello' }}") as OutputNode;
    expect(output.expression.type).toBe('StringLiteral');
    if (output.expression.type === 'StringLiteral') {
      expect(output.expression.value).toBe('hello');
    }
  });

  it('parses number literal output', () => {
    const output = firstNode('{{ 42 }}') as OutputNode;
    expect(output.expression.type).toBe('NumberLiteral');
    if (output.expression.type === 'NumberLiteral') {
      expect(output.expression.value).toBe(42);
    }
  });

  it('parses float number literal', () => {
    const output = firstNode('{{ 3.14 }}') as OutputNode;
    expect(output.expression.type).toBe('NumberLiteral');
    if (output.expression.type === 'NumberLiteral') {
      expect(output.expression.value).toBe(3.14);
    }
  });

  it('parses boolean literal', () => {
    const output = firstNode('{{ true }}') as OutputNode;
    expect(output.expression.type).toBe('BooleanLiteral');
    if (output.expression.type === 'BooleanLiteral') {
      expect(output.expression.value).toBe(true);
    }
  });

  it('parses nil literal', () => {
    const output = firstNode('{{ nil }}') as OutputNode;
    expect(output.expression.type).toBe('NilLiteral');
  });

  it('parses variable with bracket access', () => {
    const output = firstNode('{{ product["title"] }}') as OutputNode;
    expect(output.expression.type).toBe('VariableLookup');
    if (output.expression.type === 'VariableLookup') {
      expect(output.expression.name).toBe('product');
      expect(output.expression.lookups).toHaveLength(1);
    }
  });

  it('parses deeply nested variable', () => {
    const output = firstNode('{{ product.variants.first.price }}') as OutputNode;
    if (output.expression.type === 'VariableLookup') {
      expect(output.expression.name).toBe('product');
      expect(output.expression.lookups).toEqual(['variants', 'first', 'price']);
    }
  });
});

// ── Filters ──────────────────────────────────────────────────────────────────

describe('Filter chains', () => {
  it('parses single filter', () => {
    const output = firstNode('{{ product.title | upcase }}') as OutputNode;
    expect(output.filters).toHaveLength(1);
    expect(output.filters[0].name).toBe('upcase');
    expect(output.filters[0].args).toHaveLength(0);
  });

  it('parses filter with single argument', () => {
    const output = firstNode('{{ product.title | truncate: 20 }}') as OutputNode;
    expect(output.filters).toHaveLength(1);
    expect(output.filters[0].name).toBe('truncate');
    expect(output.filters[0].args).toHaveLength(1);
    if (output.filters[0].args[0].type === 'NumberLiteral') {
      expect(output.filters[0].args[0].value).toBe(20);
    }
  });

  it('parses filter with string arguments', () => {
    const output = firstNode("{{ 'hello world' | replace: 'hello', 'goodbye' }}") as OutputNode;
    expect(output.filters).toHaveLength(1);
    expect(output.filters[0].name).toBe('replace');
    expect(output.filters[0].args).toHaveLength(2);
    if (output.filters[0].args[0].type === 'StringLiteral') {
      expect(output.filters[0].args[0].value).toBe('hello');
    }
    if (output.filters[0].args[1].type === 'StringLiteral') {
      expect(output.filters[0].args[1].value).toBe('goodbye');
    }
  });

  it('parses multiple filters', () => {
    const output = firstNode('{{ product.title | upcase | truncate: 10 }}') as OutputNode;
    expect(output.filters).toHaveLength(2);
    expect(output.filters[0].name).toBe('upcase');
    expect(output.filters[1].name).toBe('truncate');
  });

  it('parses filter chain with complex args', () => {
    const output = firstNode("{{ product.price | money_with_currency }}") as OutputNode;
    expect(output.filters).toHaveLength(1);
    expect(output.filters[0].name).toBe('money_with_currency');
  });
});

// ── Whitespace trimming ──────────────────────────────────────────────────────

describe('Whitespace trimming', () => {
  it('detects left trim on output', () => {
    const output = firstNode('{{- product.title }}') as OutputNode;
    expect(output.trimLeft).toBe(true);
    expect(output.trimRight).toBe(false);
  });

  it('detects right trim on output', () => {
    const output = firstNode('{{ product.title -}}') as OutputNode;
    expect(output.trimLeft).toBe(false);
    expect(output.trimRight).toBe(true);
  });

  it('detects both trims on output', () => {
    const output = firstNode('{{- product.title -}}') as OutputNode;
    expect(output.trimLeft).toBe(true);
    expect(output.trimRight).toBe(true);
  });

  it('handles whitespace trim on tags', () => {
    const { ast, errors } = parse('{%- if true -%}yes{%- endif -%}');
    expect(errors).toHaveLength(0);
    expect(ast).toHaveLength(1);
    expect(ast[0].type).toBe('If');
  });
});

// ── If / Elsif / Else ────────────────────────────────────────────────────────

describe('If/Elsif/Else', () => {
  it('parses simple if', () => {
    const { ast, errors } = parse('{% if product.available %}In stock{% endif %}');
    expect(errors).toHaveLength(0);
    const ifNode = ast[0] as IfNode;
    expect(ifNode.type).toBe('If');
    expect(ifNode.branches).toHaveLength(1);
    expect(ifNode.branches[0].condition).not.toBeNull();
    expect(ifNode.branches[0].body).toHaveLength(1);
  });

  it('parses if/else', () => {
    const { ast, errors } = parse('{% if x %}yes{% else %}no{% endif %}');
    expect(errors).toHaveLength(0);
    const ifNode = ast[0] as IfNode;
    expect(ifNode.branches).toHaveLength(2);
    expect(ifNode.branches[0].condition).not.toBeNull();
    expect(ifNode.branches[1].condition).toBeNull();
  });

  it('parses if/elsif/else', () => {
    const { ast, errors } = parse('{% if a == 1 %}one{% elsif a == 2 %}two{% else %}other{% endif %}');
    expect(errors).toHaveLength(0);
    const ifNode = ast[0] as IfNode;
    expect(ifNode.branches).toHaveLength(3);
    expect(ifNode.branches[0].condition?.type).toBe('BinaryExpression');
    expect(ifNode.branches[1].condition?.type).toBe('BinaryExpression');
    expect(ifNode.branches[2].condition).toBeNull();
  });

  it('parses conditions with and/or', () => {
    const { ast } = parse('{% if a and b or c %}yes{% endif %}');
    const ifNode = ast[0] as IfNode;
    const cond = ifNode.branches[0].condition!;
    expect(cond.type).toBe('BinaryExpression');
    // Should be ((a and b) or c) due to left-to-right
    if (cond.type === 'BinaryExpression') {
      expect(cond.operator).toBe('or');
      expect(cond.left.type).toBe('BinaryExpression');
    }
  });

  it('parses conditions with comparison operators', () => {
    const { ast } = parse('{% if product.price > 100 %}expensive{% endif %}');
    const ifNode = ast[0] as IfNode;
    const cond = ifNode.branches[0].condition!;
    expect(cond.type).toBe('BinaryExpression');
    if (cond.type === 'BinaryExpression') {
      expect(cond.operator).toBe('>');
    }
  });

  it('parses contains operator', () => {
    const { ast } = parse("{% if product.title contains 'sale' %}on sale{% endif %}");
    const ifNode = ast[0] as IfNode;
    const cond = ifNode.branches[0].condition!;
    if (cond.type === 'BinaryExpression') {
      expect(cond.operator).toBe('contains');
    }
  });
});

// ── Unless ───────────────────────────────────────────────────────────────────

describe('Unless', () => {
  it('parses simple unless', () => {
    const { ast, errors } = parse('{% unless product.available %}Out of stock{% endunless %}');
    expect(errors).toHaveLength(0);
    const node = ast[0] as UnlessNode;
    expect(node.type).toBe('Unless');
    expect(node.consequent).toHaveLength(1);
    expect(node.alternate).toHaveLength(0);
  });

  it('parses unless/else', () => {
    const { ast } = parse('{% unless x %}no{% else %}yes{% endunless %}');
    const node = ast[0] as UnlessNode;
    expect(node.consequent).toHaveLength(1);
    expect(node.alternate).toHaveLength(1);
  });
});

// ── For loops ────────────────────────────────────────────────────────────────

describe('For loops', () => {
  it('parses simple for', () => {
    const { ast, errors } = parse('{% for item in collection.products %}{{ item.title }}{% endfor %}');
    expect(errors).toHaveLength(0);
    const forNode = ast[0] as ForNode;
    expect(forNode.type).toBe('For');
    expect(forNode.variable).toBe('item');
    expect(forNode.body).toHaveLength(1);
    expect(forNode.reversed).toBe(false);
    expect(forNode.limit).toBeNull();
    expect(forNode.offset).toBeNull();
  });

  it('parses for with limit and offset', () => {
    const { ast } = parse('{% for item in products limit:5 offset:2 %}{{ item }}{% endfor %}');
    const forNode = ast[0] as ForNode;
    expect(forNode.limit).not.toBeNull();
    expect(forNode.offset).not.toBeNull();
    if (forNode.limit?.type === 'NumberLiteral') {
      expect(forNode.limit.value).toBe(5);
    }
    if (forNode.offset?.type === 'NumberLiteral') {
      expect(forNode.offset.value).toBe(2);
    }
  });

  it('parses for with reversed', () => {
    const { ast } = parse('{% for item in products reversed %}{{ item }}{% endfor %}');
    const forNode = ast[0] as ForNode;
    expect(forNode.reversed).toBe(true);
  });

  it('parses for with range', () => {
    const { ast } = parse('{% for i in (1..5) %}{{ i }}{% endfor %}');
    const forNode = ast[0] as ForNode;
    expect(forNode.collection.type).toBe('Range');
  });

  it('parses for/else', () => {
    const { ast } = parse('{% for item in products %}{{ item }}{% else %}No products{% endfor %}');
    const forNode = ast[0] as ForNode;
    expect(forNode.body).toHaveLength(1);
    expect(forNode.elseBody).toHaveLength(1);
  });
});

// ── Case/When ────────────────────────────────────────────────────────────────

describe('Case/When', () => {
  it('parses simple case', () => {
    const { ast, errors } = parse(
      '{% case x %}{% when 1 %}one{% when 2 %}two{% else %}other{% endcase %}'
    );
    expect(errors).toHaveLength(0);
    const caseNode = ast[0] as CaseNode;
    expect(caseNode.type).toBe('Case');
    expect(caseNode.whens).toHaveLength(2);
    expect(caseNode.elseBody).toHaveLength(1);
  });

  it('parses when with multiple values', () => {
    const { ast } = parse(
      "{% case x %}{% when 'a', 'b' %}ab{% endcase %}"
    );
    const caseNode = ast[0] as CaseNode;
    expect(caseNode.whens[0].values).toHaveLength(2);
  });
});

// ── Capture ──────────────────────────────────────────────────────────────────

describe('Capture', () => {
  it('parses capture block', () => {
    const { ast, errors } = parse('{% capture my_var %}Hello {{ name }}{% endcapture %}');
    expect(errors).toHaveLength(0);
    const node = ast[0] as CaptureNode;
    expect(node.type).toBe('Capture');
    expect(node.name).toBe('my_var');
    expect(node.body).toHaveLength(2); // text + output
  });
});

// ── Assign ───────────────────────────────────────────────────────────────────

describe('Assign', () => {
  it('parses simple assign', () => {
    const { ast, errors } = parse("{% assign greeting = 'Hello' %}");
    expect(errors).toHaveLength(0);
    const node = ast[0] as AssignNode;
    expect(node.type).toBe('Assign');
    expect(node.name).toBe('greeting');
    if (node.value.type === 'StringLiteral') {
      expect(node.value.value).toBe('Hello');
    }
  });

  it('parses assign with filter', () => {
    const { ast } = parse("{% assign slug = product.title | downcase | replace: ' ', '-' %}");
    const node = ast[0] as AssignNode;
    expect(node.name).toBe('slug');
    expect(node.filters).toHaveLength(2);
    expect(node.filters[0].name).toBe('downcase');
    expect(node.filters[1].name).toBe('replace');
    expect(node.filters[1].args).toHaveLength(2);
  });

  it('parses assign with number', () => {
    const { ast } = parse('{% assign count = 42 %}');
    const node = ast[0] as AssignNode;
    expect(node.value.type).toBe('NumberLiteral');
  });
});

// ── Raw ──────────────────────────────────────────────────────────────────────

describe('Raw', () => {
  it('parses raw block', () => {
    const { ast, errors } = parse('{% raw %}{{ not_parsed }}{% endraw %}');
    expect(errors).toHaveLength(0);
    const node = ast[0] as RawNode;
    expect(node.type).toBe('Raw');
    expect(node.value).toBe('{{ not_parsed }}');
  });

  it('preserves Liquid syntax inside raw', () => {
    const { ast } = parse('{% raw %}{% if true %}hello{% endif %}{% endraw %}');
    const node = ast[0] as RawNode;
    expect(node.value).toBe('{% if true %}hello{% endif %}');
  });
});

// ── Comment ──────────────────────────────────────────────────────────────────

describe('Comment', () => {
  it('parses comment block', () => {
    const { ast, errors } = parse('{% comment %}This is a comment{% endcomment %}');
    expect(errors).toHaveLength(0);
    const node = ast[0] as CommentNode;
    expect(node.type).toBe('Comment');
    expect(node.value).toBe('This is a comment');
  });
});

// ── Schema ───────────────────────────────────────────────────────────────────

describe('Schema', () => {
  it('parses schema with valid JSON', () => {
    const json = '{"name": "test", "settings": []}';
    const { ast, errors } = parse(`{% schema %}${json}{% endschema %}`);
    expect(errors).toHaveLength(0);
    const node = ast[0] as SchemaNode;
    expect(node.type).toBe('Schema');
    expect(node.jsonContent).toBe(json);
    expect(node.parsedJSON).toEqual({ name: 'test', settings: [] });
  });

  it('reports error for invalid JSON but still produces node', () => {
    const { ast, errors } = parse('{% schema %}{invalid json{% endschema %}');
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].message).toContain('Invalid JSON');
    const node = ast[0] as SchemaNode;
    expect(node.type).toBe('Schema');
    expect(node.parsedJSON).toBeNull();
  });

  it('parses real-world schema block', () => {
    const schema = `
{
  "name": "Hero Banner",
  "tag": "section",
  "class": "hero-banner",
  "settings": [
    {
      "type": "text",
      "id": "heading",
      "label": "Heading",
      "default": "Welcome"
    },
    {
      "type": "color",
      "id": "bg_color",
      "label": "Background Color",
      "default": "#000000"
    }
  ],
  "blocks": [
    {
      "type": "image",
      "name": "Image",
      "settings": [
        {
          "type": "image_picker",
          "id": "image",
          "label": "Image"
        }
      ]
    }
  ],
  "presets": [
    {
      "name": "Default Hero"
    }
  ]
}`;
    const { ast, errors } = parse(`{% schema %}${schema}{% endschema %}`);
    expect(errors).toHaveLength(0);
    const node = ast[0] as SchemaNode;
    expect(node.parsedJSON).not.toBeNull();
    const parsed = node.parsedJSON as Record<string, unknown>;
    expect(parsed.name).toBe('Hero Banner');
    expect((parsed.settings as unknown[]).length).toBe(2);
  });
});

// ── Render ───────────────────────────────────────────────────────────────────

describe('Render', () => {
  it('parses simple render', () => {
    const { ast, errors } = parse("{% render 'price-card' %}");
    expect(errors).toHaveLength(0);
    const node = ast[0] as RenderNode;
    expect(node.type).toBe('Render');
    expect(node.snippetName).toBe('price-card');
  });

  it('parses render with "with"', () => {
    const { ast } = parse("{% render 'product-card' with featured_product as product %}");
    const node = ast[0] as RenderNode;
    expect(node.snippetName).toBe('product-card');
    expect(node.variable).not.toBeNull();
    expect(node.alias).toBe('product');
    expect(node.isFor).toBe(false);
  });

  it('parses render with "for"', () => {
    const { ast } = parse("{% render 'product-card' for collection.products as product %}");
    const node = ast[0] as RenderNode;
    expect(node.isFor).toBe(true);
    expect(node.alias).toBe('product');
  });

  it('parses render with keyword args', () => {
    const { ast } = parse("{% render 'icon', icon: 'search', size: 24 %}");
    const node = ast[0] as RenderNode;
    expect(node.args).toHaveLength(2);
    expect(node.args[0].name).toBe('icon');
    expect(node.args[1].name).toBe('size');
  });
});

// ── Include ──────────────────────────────────────────────────────────────────

describe('Include', () => {
  it('parses simple include', () => {
    const { ast, errors } = parse("{% include 'header' %}");
    expect(errors).toHaveLength(0);
    const node = ast[0] as IncludeNode;
    expect(node.type).toBe('Include');
    expect(node.snippetName).toBe('header');
  });
});

// ── Section tag ──────────────────────────────────────────────────────────────

describe('Section tag', () => {
  it('parses section tag', () => {
    const { ast } = parse("{% section 'hero-banner' %}");
    const node = ast[0];
    expect(node.type).toBe('SectionTag');
    if (node.type === 'SectionTag') {
      expect(node.name).toBe('hero-banner');
    }
  });
});

// ── Form ─────────────────────────────────────────────────────────────────────

describe('Form', () => {
  it('parses form block', () => {
    const { ast, errors } = parse("{% form 'product', product %}Add to cart{% endform %}");
    expect(errors).toHaveLength(0);
    const node = ast[0] as FormNode;
    expect(node.type).toBe('Form');
    expect(node.body).toHaveLength(1);
  });
});

// ── Paginate ─────────────────────────────────────────────────────────────────

describe('Paginate', () => {
  it('parses paginate block', () => {
    const { ast, errors } = parse('{% paginate collection.products by 12 %}{{ paginate }}{% endpaginate %}');
    expect(errors).toHaveLength(0);
    const node = ast[0] as PaginateNode;
    expect(node.type).toBe('Paginate');
    expect(node.body).toHaveLength(1);
  });
});

// ── TableRow ─────────────────────────────────────────────────────────────────

describe('TableRow', () => {
  it('parses tablerow', () => {
    const { ast, errors } = parse('{% tablerow item in products cols:3 %}{{ item }}{% endtablerow %}');
    expect(errors).toHaveLength(0);
    const node = ast[0] as TableRowNode;
    expect(node.type).toBe('TableRow');
    expect(node.variable).toBe('item');
    if (node.cols?.type === 'NumberLiteral') {
      expect(node.cols.value).toBe(3);
    }
  });
});

// ── Layout ───────────────────────────────────────────────────────────────────

describe('Layout', () => {
  it('parses layout tag', () => {
    const { ast } = parse("{% layout 'theme' %}");
    const node = ast[0] as LayoutNode;
    expect(node.type).toBe('Layout');
    if (node.name.type === 'StringLiteral') {
      expect(node.name.value).toBe('theme');
    }
  });

  it('parses layout none', () => {
    const { ast } = parse('{% layout none %}');
    const node = ast[0] as LayoutNode;
    expect(node.type).toBe('Layout');
  });
});

// ── Style / JavaScript / Stylesheet ──────────────────────────────────────────

describe('Style/JavaScript/Stylesheet', () => {
  it('parses style block', () => {
    const css = '.hero { color: red; }';
    const { ast, errors } = parse(`{% style %}${css}{% endstyle %}`);
    expect(errors).toHaveLength(0);
    const node = ast[0] as StyleNode;
    expect(node.type).toBe('Style');
    expect(node.value).toBe(css);
  });

  it('parses javascript block', () => {
    const js = 'console.log("hello");';
    const { ast } = parse(`{% javascript %}${js}{% endjavascript %}`);
    const node = ast[0] as JavaScriptNode;
    expect(node.type).toBe('JavaScript');
    expect(node.value).toBe(js);
  });
});

// ── Increment / Decrement ────────────────────────────────────────────────────

describe('Increment/Decrement', () => {
  it('parses increment', () => {
    const { ast } = parse('{% increment counter %}');
    const node = ast[0] as IncrementNode;
    expect(node.type).toBe('Increment');
    expect(node.name).toBe('counter');
  });

  it('parses decrement', () => {
    const { ast } = parse('{% decrement counter %}');
    const node = ast[0] as DecrementNode;
    expect(node.type).toBe('Decrement');
    expect(node.name).toBe('counter');
  });
});

// ── Break / Continue ─────────────────────────────────────────────────────────

describe('Break/Continue', () => {
  it('parses break inside for', () => {
    const { ast } = parse('{% for item in products %}{% if item.sold_out %}{% break %}{% endif %}{% endfor %}');
    const forNode = ast[0] as ForNode;
    const ifNode = forNode.body[0] as IfNode;
    expect(ifNode.branches[0].body[0].type).toBe('Break');
  });

  it('parses continue inside for', () => {
    const { ast } = parse('{% for item in products %}{% if item.hidden %}{% continue %}{% endif %}{% endfor %}');
    const forNode = ast[0] as ForNode;
    const ifNode = forNode.body[0] as IfNode;
    expect(ifNode.branches[0].body[0].type).toBe('Continue');
  });
});

// ── Nested blocks ────────────────────────────────────────────────────────────

describe('Nested blocks', () => {
  it('parses for inside if', () => {
    const { ast, errors } = parse(
      '{% if products.size > 0 %}{% for item in products %}{{ item.title }}{% endfor %}{% endif %}'
    );
    expect(errors).toHaveLength(0);
    const ifNode = ast[0] as IfNode;
    expect(ifNode.branches[0].body).toHaveLength(1);
    expect(ifNode.branches[0].body[0].type).toBe('For');
  });

  it('parses for inside if inside capture', () => {
    const { ast, errors } = parse(
      '{% capture output %}{% if show %}{% for item in list %}{{ item }}{% endfor %}{% endif %}{% endcapture %}'
    );
    expect(errors).toHaveLength(0);
    const capture = ast[0] as CaptureNode;
    const ifNode = capture.body[0] as IfNode;
    const forNode = ifNode.branches[0].body[0] as ForNode;
    expect(forNode.body).toHaveLength(1);
  });

  it('parses deeply nested blocks', () => {
    const { ast, errors } = parse(`
      {% if a %}
        {% for item in items %}
          {% if item.active %}
            {% case item.type %}
              {% when 'text' %}
                {{ item.content }}
              {% when 'image' %}
                {{ item.url }}
            {% endcase %}
          {% endif %}
        {% endfor %}
      {% endif %}
    `);
    expect(errors).toHaveLength(0);
    // Navigate the tree
    const ifA = ast.find(n => n.type === 'If') as IfNode;
    expect(ifA).toBeDefined();
    const forItem = ifA.branches[0].body.find(n => n.type === 'For') as ForNode;
    expect(forItem).toBeDefined();
    const ifActive = forItem.body.find(n => n.type === 'If') as IfNode;
    expect(ifActive).toBeDefined();
    const caseType = ifActive.branches[0].body.find(n => n.type === 'Case') as CaseNode;
    expect(caseType).toBeDefined();
    expect(caseType.whens).toHaveLength(2);
  });
});

// ── Source locations ─────────────────────────────────────────────────────────

describe('Source locations', () => {
  it('tracks correct offset for first node', () => {
    const template = '{{ product.title }}';
    const { ast } = parse(template);
    expect(ast[0].loc.offset).toBe(0);
    expect(ast[0].loc.length).toBe(template.length);
  });

  it('tracks correct line/column', () => {
    const { ast } = parse('line1\n{{ x }}');
    const output = ast[1] as OutputNode;
    expect(output.loc.line).toBe(2);
    expect(output.loc.offset).toBe(6);
  });

  it('tracks correct line for multi-line template', () => {
    const template = 'line1\nline2\n{% if true %}\nline4\n{% endif %}';
    const { ast } = parse(template);
    const ifNode = ast.find(n => n.type === 'If') as IfNode;
    expect(ifNode.loc.line).toBe(3);
  });

  it('every node has a location', () => {
    const { ast } = parse(
      '{% assign x = 1 %}{{ x | plus: 2 }}{% for i in (1..3) %}{{ i }}{% endfor %}'
    );
    function checkLoc(nodes: LiquidASTNode[]) {
      for (const node of nodes) {
        expect(node.loc).toBeDefined();
        expect(node.loc.offset).toBeGreaterThanOrEqual(0);
        expect(node.loc.length).toBeGreaterThanOrEqual(0);
        expect(node.loc.line).toBeGreaterThanOrEqual(1);
        expect(node.loc.column).toBeGreaterThanOrEqual(1);
        if (node.type === 'For') checkLoc(node.body);
        if (node.type === 'If') {
          for (const branch of node.branches) checkLoc(branch.body);
        }
      }
    }
    checkLoc(ast);
  });

  it('expressions have source locations', () => {
    const { ast } = parse('{{ product.title | upcase }}');
    const output = ast[0] as OutputNode;
    expect(output.expression.loc).toBeDefined();
    expect(output.expression.loc.offset).toBeGreaterThanOrEqual(0);
    expect(output.filters[0].loc).toBeDefined();
  });
});

// ── Round-trip (AST to string) ───────────────────────────────────────────────

describe('Round-trip: astToString', () => {
  const cases = [
    '{{ product.title }}',
    '{{ product.title | upcase }}',
    "{{ 'hello' | replace: 'h', 'H' }}",
    "{% assign x = 'hello' %}",
    "{% assign slug = title | downcase | replace: ' ', '-' %}",
    '{% if true %}yes{% endif %}',
    '{% if a %}yes{% else %}no{% endif %}',
    '{% if a == 1 %}one{% elsif a == 2 %}two{% else %}other{% endif %}',
    '{% unless sold_out %}Available{% endunless %}',
    '{% for item in products %}{{ item.title }}{% endfor %}',
    '{% for i in (1..5) %}{{ i }}{% endfor %}',
    '{% for item in products limit:5 offset:2 reversed %}{{ item }}{% endfor %}',
    "{% case x %}{% when 1 %}one{% when 2 %}two{% else %}other{% endcase %}",
    '{% capture my_var %}Hello{% endcapture %}',
    '{% raw %}{{ not_parsed }}{% endraw %}',
    '{% comment %}A comment{% endcomment %}',
    "{% render 'icon' %}",
    "{% include 'header' %}",
    "{% section 'hero' %}",
    "{% layout 'theme' %}",
    '{% increment counter %}',
    '{% decrement counter %}',
    '{% break %}',
    '{% continue %}',
  ];

  for (const template of cases) {
    it(`round-trips: ${template}`, () => {
      const { ast, errors } = parse(template);
      expect(errors).toHaveLength(0);
      const result = astToString(ast);
      // Normalize whitespace for comparison
      const normalize = (s: string) => s.replace(/\s+/g, ' ').trim();
      expect(normalize(result)).toBe(normalize(template));
    });
  }
});

// ── Error recovery ───────────────────────────────────────────────────────────

describe('Error recovery', () => {
  it('produces partial AST on unclosed if', () => {
    const result = parse('{% if true %}hello');
    // Should still get an If node and have errors
    expect(result.ast.length).toBeGreaterThanOrEqual(1);
    // The parser should have detected the unclosed if
    // Even with an error, the AST should be usable
    const ifNode = result.ast.find(n => n.type === 'If');
    expect(ifNode).toBeDefined();
  });

  it('produces partial AST on mismatched tags', () => {
    const result = parse('{% if true %}hello{% endfor %}');
    expect(result.errors.length).toBeGreaterThanOrEqual(1);
    expect(result.ast.length).toBeGreaterThanOrEqual(1);
  });

  it('produces partial AST on invalid output expression', () => {
    const result = parse('{{ }}');
    expect(result.ast.length).toBeGreaterThanOrEqual(1);
  });

  it('handles orphaned closing tags gracefully', () => {
    const result = parse('{% endif %}');
    expect(result.errors.length).toBeGreaterThanOrEqual(1);
  });

  it('handles orphaned else gracefully', () => {
    const result = parse('{% else %}content');
    expect(result.errors.length).toBeGreaterThanOrEqual(1);
  });

  it('handles unclosed output block', () => {
    const { ast } = parse('{{ product.title');
    // Should treat as text since no closing }}
    expect(ast.length).toBeGreaterThanOrEqual(1);
  });
});

// ── AST Walker ───────────────────────────────────────────────────────────────

describe('AST Walker', () => {
  it('visits all node types', () => {
    const template = `
      {{ product.title }}
      {% assign x = 1 %}
      {% if true %}
        {% for item in items %}
          {{ item }}
        {% endfor %}
      {% endif %}
      {% comment %}test{% endcomment %}
      {% render 'card' %}
    `;
    const { ast } = parse(template);
    const visited: string[] = [];

    walkLiquidAST(ast, {
      visitText: () => { visited.push('Text'); },
      visitOutput: () => { visited.push('Output'); },
      visitAssign: () => { visited.push('Assign'); },
      visitIf: () => { visited.push('If'); },
      visitFor: () => { visited.push('For'); },
      visitComment: () => { visited.push('Comment'); },
      visitRender: () => { visited.push('Render'); },
    });

    expect(visited).toContain('Text');
    expect(visited).toContain('Output');
    expect(visited).toContain('Assign');
    expect(visited).toContain('If');
    expect(visited).toContain('For');
    expect(visited).toContain('Comment');
    expect(visited).toContain('Render');
  });

  it('visits expressions inside outputs', () => {
    const { ast } = parse('{{ product.title | upcase }}');
    const expressions: string[] = [];

    walkLiquidAST(ast, {
      visitExpression: (expr) => {
        expressions.push(expr.type);
      },
    });

    expect(expressions).toContain('VariableLookup');
  });

  it('visits filters', () => {
    const { ast } = parse('{{ x | upcase | downcase }}');
    const filters: string[] = [];

    walkLiquidAST(ast, {
      visitFilter: (filter) => {
        filters.push(filter.name);
      },
    });

    expect(filters).toEqual(['upcase', 'downcase']);
  });

  it('can prevent recursion into children', () => {
    const { ast } = parse('{% if true %}{% for i in items %}{{ i }}{% endfor %}{% endif %}');
    const visited: string[] = [];

    walkLiquidAST(ast, {
      visitIf: () => {
        visited.push('If');
        return false; // prevent descending into branches
      },
      visitFor: () => {
        visited.push('For');
      },
    });

    expect(visited).toEqual(['If']); // For should NOT be visited
  });
});

// ── ScopeTracker AST integration ─────────────────────────────────────────────

describe('ScopeTracker AST integration', () => {
  it('processes assign nodes', () => {
    const { ast } = parse("{% assign greeting = 'hello' %}");
    const tracker = new ScopeTracker();
    const assignNode = ast[0] as AssignNode;
    tracker.processAssign(assignNode);
    expect(tracker.getVariable('greeting')).not.toBeNull();
    expect(tracker.getVariable('greeting')?.type).toBe('string');
  });

  it('processes for nodes with scope push/pop', () => {
    const { ast } = parse('{% for item in products %}{{ item }}{% endfor %}');
    const tracker = new ScopeTracker();
    const forNode = ast[0] as ForNode;
    tracker.processFor(forNode);
    expect(tracker.getVariable('item')).not.toBeNull();
    expect(tracker.getVariable('forloop')).not.toBeNull();
    expect(tracker.getCurrentDepth()).toBe(1);
    tracker.popScope();
    expect(tracker.getCurrentDepth()).toBe(0);
    expect(tracker.getVariable('item')).toBeNull();
  });

  it('processes capture nodes', () => {
    const { ast } = parse('{% capture html %}content{% endcapture %}');
    const tracker = new ScopeTracker();
    const captureNode = ast[0] as CaptureNode;
    tracker.processCapture(captureNode);
    expect(tracker.getVariable('html')).not.toBeNull();
    expect(tracker.getVariable('html')?.type).toBe('string');
  });

  it('builds scopes from full AST', () => {
    const { ast } = parse(`
      {% assign x = 'hello' %}
      {% assign y = 42 %}
      {% for item in products %}
        {{ item.title }}
      {% endfor %}
    `);
    const tracker = new ScopeTracker();
    tracker.buildFromAST(ast);
    expect(tracker.getVariable('x')).not.toBeNull();
    expect(tracker.getVariable('y')).not.toBeNull();
  });
});

// ── TypeChecker AST integration ──────────────────────────────────────────────

describe('TypeChecker AST integration', () => {
  it('infers expression types', () => {
    const checker = new TypeChecker();

    const { ast: ast1 } = parse("{{ 'hello' }}");
    const output1 = ast1[0] as OutputNode;
    expect(checker.inferExpressionType(output1.expression)).toBe('string');

    const { ast: ast2 } = parse('{{ 42 }}');
    const output2 = ast2[0] as OutputNode;
    expect(checker.inferExpressionType(output2.expression)).toBe('number');

    const { ast: ast3 } = parse('{{ true }}');
    const output3 = ast3[0] as OutputNode;
    expect(checker.inferExpressionType(output3.expression)).toBe('boolean');
  });

  it('infers variable lookup types from schema', () => {
    const checker = new TypeChecker();
    const { ast } = parse('{{ product.title }}');
    const output = ast[0] as OutputNode;
    const type = checker.inferExpressionType(output.expression);
    // product.title should be "string" if product is in the schema
    // The exact result depends on shopify-schema.json content
    expect(typeof type).toBe('string');
  });

  it('infers filtered type', () => {
    const checker = new TypeChecker();
    const result = checker.inferFilteredType('string', [
      { name: 'split', args: [], loc: { line: 1, column: 1, offset: 0, length: 5 } },
    ]);
    expect(result).toBe('array');
  });

  it('walks AST and checks types', () => {
    const checker = new TypeChecker();
    const { ast } = parse('{{ product.title | upcase }}');
    const issues = checker.walkAndCheck(ast);
    // upcase accepts string input, product.title is likely string -> no issues
    expect(Array.isArray(issues)).toBe(true);
  });
});

// ── Real-world template ──────────────────────────────────────────────────────

describe('Real-world Shopify templates', () => {
  it('parses a typical section file', () => {
    const template = `
<section class="hero-banner" data-section-id="{{ section.id }}">
  {% if section.settings.heading != blank %}
    <h1>{{ section.settings.heading }}</h1>
  {% endif %}

  {% for block in section.blocks %}
    {% case block.type %}
      {% when 'image' %}
        <img src="{{ block.settings.image | img_url: 'master' }}" alt="{{ block.settings.alt }}">
      {% when 'text' %}
        <p>{{ block.settings.text }}</p>
    {% endcase %}
  {% endfor %}

  {% if section.settings.show_button %}
    <a href="{{ section.settings.button_url }}" class="btn">
      {{ section.settings.button_text }}
    </a>
  {% endif %}
</section>

{% schema %}
{
  "name": "Hero Banner",
  "settings": [
    { "type": "text", "id": "heading", "label": "Heading" },
    { "type": "checkbox", "id": "show_button", "label": "Show Button", "default": false },
    { "type": "text", "id": "button_text", "label": "Button Text" },
    { "type": "url", "id": "button_url", "label": "Button URL" }
  ],
  "blocks": [
    {
      "type": "image",
      "name": "Image",
      "settings": [
        { "type": "image_picker", "id": "image", "label": "Image" },
        { "type": "text", "id": "alt", "label": "Alt Text" }
      ]
    },
    {
      "type": "text",
      "name": "Text",
      "settings": [
        { "type": "richtext", "id": "text", "label": "Text" }
      ]
    }
  ]
}
{% endschema %}
    `;

    const { ast, errors } = parse(template);
    expect(errors).toHaveLength(0);

    // Find the schema node
    const schemaNode = ast.find(n => n.type === 'Schema') as SchemaNode;
    expect(schemaNode).toBeDefined();
    expect(schemaNode.parsedJSON).not.toBeNull();

    // Find the for loop
    const walker: string[] = [];
    walkLiquidAST(ast, {
      visitFor: () => { walker.push('For'); },
      visitIf: () => { walker.push('If'); },
      visitCase: () => { walker.push('Case'); },
      visitOutput: () => { walker.push('Output'); },
      visitSchema: () => { walker.push('Schema'); },
    });

    expect(walker).toContain('For');
    expect(walker).toContain('If');
    expect(walker).toContain('Case');
    expect(walker).toContain('Output');
    expect(walker).toContain('Schema');
  });

  it('parses a product card snippet', () => {
    const template = `
{% comment %}
  Renders a product card.
  Accepts: product (product), show_price (boolean)
{% endcomment %}

<div class="product-card" data-product-id="{{ product.id }}">
  {% if product.featured_image %}
    <img
      src="{{ product.featured_image | img_url: '300x300' }}"
      alt="{{ product.featured_image.alt | escape }}"
      loading="lazy"
    >
  {% endif %}

  <h3>
    <a href="{{ product.url }}">{{ product.title }}</a>
  </h3>

  {% if show_price %}
    {% if product.compare_at_price > product.price %}
      <s>{{ product.compare_at_price | money }}</s>
    {% endif %}
    <span class="price">{{ product.price | money }}</span>
  {% endif %}

  {% unless product.available %}
    <span class="sold-out">{{ 'products.sold_out' | t }}</span>
  {% endunless %}

  {% for tag in product.tags %}
    {% if tag contains 'badge:' %}
      {% assign badge_text = tag | replace: 'badge:', '' %}
      <span class="badge">{{ badge_text }}</span>
    {% endif %}
  {% endfor %}
</div>
    `;

    const { ast, errors } = parse(template);
    expect(errors).toHaveLength(0);

    // Count node types
    const counts: Record<string, number> = {};
    walkLiquidAST(ast, {
      visitText: () => { counts['Text'] = (counts['Text'] ?? 0) + 1; },
      visitOutput: () => { counts['Output'] = (counts['Output'] ?? 0) + 1; },
      visitIf: () => { counts['If'] = (counts['If'] ?? 0) + 1; },
      visitUnless: () => { counts['Unless'] = (counts['Unless'] ?? 0) + 1; },
      visitFor: () => { counts['For'] = (counts['For'] ?? 0) + 1; },
      visitAssign: () => { counts['Assign'] = (counts['Assign'] ?? 0) + 1; },
      visitComment: () => { counts['Comment'] = (counts['Comment'] ?? 0) + 1; },
    });

    expect(counts['Comment']).toBe(1);
    expect(counts['Unless']).toBe(1);
    expect(counts['For']).toBe(1);
    expect(counts['Assign']).toBe(1);
    expect((counts['If'] ?? 0)).toBeGreaterThanOrEqual(3);
    expect((counts['Output'] ?? 0)).toBeGreaterThanOrEqual(5);
  });
});
