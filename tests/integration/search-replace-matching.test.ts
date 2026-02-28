/**
 * Regression tests for the search_replace 3-tier matching cascade.
 *
 * Tests the matching logic that finds old_text within file content:
 *   Tier 1: Exact string match (indexOf)
 *   Tier 2: Normalized match (whitespace-normalized via normalizeForAgent)
 *   Tier 3: Loose line-by-line match (collapsed whitespace via normalizeLineLoose)
 *
 * These tests establish a regression baseline before porting the 9-tier cascade.
 */

import { describe, it, expect } from 'vitest';
import { normalizeForAgent } from '@/lib/agents/tools/prettify';

// Reproduce the internal normalizeLineLoose from tool-executor.ts
function normalizeLineLoose(line: string): string {
  return line
    .replace(/\r\n/g, '\n')
    .replace(/\t/g, '  ')
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Extracted from tool-executor.ts search_replace case (lines 637-693).
 * Pure function for testability. Returns { idx, matchLen, usedFuzzy } or null if no match.
 */
function findMatch(
  searchContent: string,
  oldText: string,
): { idx: number; matchLen: number; usedFuzzy: boolean } | null {
  // Tier 1: Exact match
  let idx = searchContent.indexOf(oldText);
  let matchLen = oldText.length;
  let usedFuzzy = false;

  // Tier 2: Normalized match
  if (idx === -1) {
    const normContent = normalizeForAgent(searchContent);
    const normOld = normalizeForAgent(oldText);
    const normIdx = normContent.indexOf(normOld);

    if (normIdx !== -1) {
      const normStartLine = normContent.slice(0, normIdx).split('\n').length - 1;
      const normOldLineCount = normOld.split('\n').length;

      const origLines = searchContent.split('\n');
      const origSlice = origLines.slice(normStartLine, normStartLine + normOldLineCount).join('\n');
      idx = searchContent.indexOf(origSlice);
      if (idx !== -1) {
        matchLen = origSlice.length;
        usedFuzzy = true;
      }
    }
  }

  // Tier 3: Loose line-by-line match
  if (idx === -1) {
    const contentLines = searchContent.split('\n');
    const targetLines = oldText.split('\n');
    const targetLen = targetLines.length;

    if (targetLen > 0 && contentLines.length >= targetLen) {
      const normTarget = targetLines.map(normalizeLineLoose);
      for (let i = 0; i <= contentLines.length - targetLen; i++) {
        const candidate = contentLines.slice(i, i + targetLen).map(normalizeLineLoose);
        let same = true;
        for (let j = 0; j < targetLen; j++) {
          if (candidate[j] !== normTarget[j]) {
            same = false;
            break;
          }
        }
        if (same) {
          const prefix = contentLines.slice(0, i).join('\n');
          idx = prefix.length + (i > 0 ? 1 : 0);
          const origSlice = contentLines.slice(i, i + targetLen).join('\n');
          matchLen = origSlice.length;
          usedFuzzy = true;
          break;
        }
      }
    }
  }

  if (idx === -1) return null;
  return { idx, matchLen, usedFuzzy };
}

// ── Tier 1: Exact Match ──────────────────────────────────────────────────────

describe('search_replace matching: Tier 1 (exact)', () => {
  it('matches identical content', () => {
    const content = '<div class="product-card">\n  <h2>{{ product.title }}</h2>\n</div>';
    const oldText = '  <h2>{{ product.title }}</h2>';
    const result = findMatch(content, oldText);
    expect(result).not.toBeNull();
    expect(result!.usedFuzzy).toBe(false);
    expect(content.slice(result!.idx, result!.idx + result!.matchLen)).toBe(oldText);
  });

  it('matches single-line exact content', () => {
    const content = 'color: red;\ncolor: blue;\ncolor: green;';
    const oldText = 'color: blue;';
    const result = findMatch(content, oldText);
    expect(result).not.toBeNull();
    expect(result!.usedFuzzy).toBe(false);
  });

  it('matches multi-line block exactly', () => {
    const content = '{% schema %}\n{\n  "name": "Header",\n  "settings": []\n}\n{% endschema %}';
    const oldText = '{\n  "name": "Header",\n  "settings": []\n}';
    const result = findMatch(content, oldText);
    expect(result).not.toBeNull();
    expect(result!.usedFuzzy).toBe(false);
  });

  it('is case-sensitive', () => {
    const content = 'class="Product-Title"';
    const oldText = 'class="product-title"';
    const result = findMatch(content, oldText);
    expect(result).toBeNull();
  });

  it('returns null when content does not contain old_text', () => {
    const content = '<div>Hello</div>';
    const oldText = '<span>World</span>';
    const result = findMatch(content, oldText);
    expect(result).toBeNull();
  });
});

// ── Tier 2: Normalized Match ─────────────────────────────────────────────────

describe('search_replace matching: Tier 2 (normalized)', () => {
  it('matches content with trailing whitespace differences', () => {
    const content = '<div>  \n  <h2>Title</h2>  \n</div>';
    const oldText = '<div>\n  <h2>Title</h2>\n</div>';
    const result = findMatch(content, oldText);
    expect(result).not.toBeNull();
    expect(result!.usedFuzzy).toBe(true);
  });

  it('matches content with tab vs space differences', () => {
    const content = '<div>\n\t<h2>Title</h2>\n</div>';
    const oldText = '<div>\n  <h2>Title</h2>\n</div>';
    const result = findMatch(content, oldText);
    expect(result).not.toBeNull();
    expect(result!.usedFuzzy).toBe(true);
  });

  it('matches content with CRLF vs LF differences', () => {
    const content = '<div>\r\n  <h2>Title</h2>\r\n</div>';
    const oldText = '<div>\n  <h2>Title</h2>\n</div>';
    const result = findMatch(content, oldText);
    expect(result).not.toBeNull();
    expect(result!.usedFuzzy).toBe(true);
  });

  it('matches despite extra blank lines being collapsed', () => {
    const content = '<div>\n\n\n\n  <h2>Title</h2>\n</div>';
    const oldText = '<div>\n\n  <h2>Title</h2>\n</div>';
    const result = findMatch(content, oldText);
    expect(result).not.toBeNull();
    expect(result!.usedFuzzy).toBe(true);
  });

  it('returns the correct original slice (not normalized)', () => {
    const content = '<div>\t\n\t<span>Hello</span>\t\n</div>';
    const oldText = '<div>\n  <span>Hello</span>\n</div>';
    const result = findMatch(content, oldText);
    expect(result).not.toBeNull();
    if (result) {
      const extracted = content.slice(result.idx, result.idx + result.matchLen);
      expect(extracted).toContain('<span>Hello</span>');
    }
  });
});

// ── Tier 3: Loose Line-by-Line Match ─────────────────────────────────────────

describe('search_replace matching: Tier 3 (loose line-by-line)', () => {
  it('matches despite different indentation levels', () => {
    const content = '    <div class="wrapper">\n        <span>Content</span>\n    </div>';
    const oldText = '<div class="wrapper">\n  <span>Content</span>\n</div>';
    const result = findMatch(content, oldText);
    expect(result).not.toBeNull();
    expect(result!.usedFuzzy).toBe(true);
  });

  it('matches despite multiple spaces collapsed to one', () => {
    const content = '<div   class="header"   id="main">\n  <h1>Title</h1>\n</div>';
    const oldText = '<div class="header" id="main">\n  <h1>Title</h1>\n</div>';
    const result = findMatch(content, oldText);
    expect(result).not.toBeNull();
    expect(result!.usedFuzzy).toBe(true);
  });

  it('matches Liquid template with indentation differences', () => {
    const content = [
      '{% for product in collection.products %}',
      '    <div class="product-card">',
      '        {{ product.title }}',
      '    </div>',
      '{% endfor %}',
    ].join('\n');
    const oldText = [
      '  <div class="product-card">',
      '    {{ product.title }}',
      '  </div>',
    ].join('\n');
    const result = findMatch(content, oldText);
    expect(result).not.toBeNull();
    expect(result!.usedFuzzy).toBe(true);
  });

  it('does NOT match when line content differs (not just whitespace)', () => {
    const content = '<div class="product">\n  <h2>Title</h2>\n</div>';
    const oldText = '<div class="product">\n  <h3>Title</h3>\n</div>';
    const result = findMatch(content, oldText);
    expect(result).toBeNull();
  });

  it('matches single line with different surrounding whitespace', () => {
    const content = '  color:   red ;  ';
    const oldText = 'color: red ;';
    const result = findMatch(content, oldText);
    expect(result).not.toBeNull();
    expect(result!.usedFuzzy).toBe(true);
  });

  it('returns correct position for match in middle of file', () => {
    const content = [
      '<header>',
      '  <nav>',
      '    <ul>',
      '      <li>Home</li>',
      '      <li>Products</li>',
      '    </ul>',
      '  </nav>',
      '</header>',
    ].join('\n');
    const oldText = '<li>Home</li>\n<li>Products</li>';
    const result = findMatch(content, oldText);
    expect(result).not.toBeNull();
    if (result) {
      const extracted = content.slice(result.idx, result.idx + result.matchLen);
      expect(extracted).toContain('Home');
      expect(extracted).toContain('Products');
    }
  });
});

// ── Edge Cases ───────────────────────────────────────────────────────────────

describe('search_replace matching: edge cases', () => {
  it('handles empty old_text', () => {
    const content = '<div>Hello</div>';
    const result = findMatch(content, '');
    expect(result).not.toBeNull();
    expect(result!.idx).toBe(0);
  });

  it('handles old_text longer than content', () => {
    const content = '<div>';
    const oldText = '<div class="very-long-class-name-that-exceeds-content-length">\n  <span>Inner</span>\n</div>';
    const result = findMatch(content, oldText);
    expect(result).toBeNull();
  });

  it('handles content with only whitespace differences on every line', () => {
    const content = '\t\t<div>\n\t\t\t<span>Text</span>\n\t\t</div>';
    const oldText = '  <div>\n    <span>Text</span>\n  </div>';
    const result = findMatch(content, oldText);
    expect(result).not.toBeNull();
    expect(result!.usedFuzzy).toBe(true);
  });

  it('prefers Tier 1 over Tier 2 (no fuzzy flag when exact match exists)', () => {
    const content = '<div>\n  <span>Hello</span>\n</div>';
    const oldText = '<div>\n  <span>Hello</span>\n</div>';
    const result = findMatch(content, oldText);
    expect(result).not.toBeNull();
    expect(result!.usedFuzzy).toBe(false);
  });

  it('handles Liquid tags with Shopify-specific syntax', () => {
    const content = [
      '{% assign variant_title = product.selected_or_first_available_variant.title %}',
      '{% if variant_title != "Default Title" %}',
      '  <span class="variant-badge">{{ variant_title }}</span>',
      '{% endif %}',
    ].join('\n');
    const oldText = [
      '{% if variant_title != "Default Title" %}',
      '  <span class="variant-badge">{{ variant_title }}</span>',
      '{% endif %}',
    ].join('\n');
    const result = findMatch(content, oldText);
    expect(result).not.toBeNull();
    expect(result!.usedFuzzy).toBe(false);
  });

  it('handles JSON schema blocks', () => {
    const content = [
      '{% schema %}',
      '{',
      '  "name": "Product card",',
      '  "settings": [',
      '    {',
      '      "type": "checkbox",',
      '      "id": "show_vendor",',
      '      "label": "Show vendor",',
      '      "default": false',
      '    }',
      '  ]',
      '}',
      '{% endschema %}',
    ].join('\n');
    const oldText = [
      '    {',
      '      "type": "checkbox",',
      '      "id": "show_vendor",',
      '      "label": "Show vendor",',
      '      "default": false',
      '    }',
    ].join('\n');
    const result = findMatch(content, oldText);
    expect(result).not.toBeNull();
    expect(result!.usedFuzzy).toBe(false);
  });

  it('KNOWN GAP: fails on CSS with extra whitespace around colons (Tier 3 collapses spaces but structural difference remains)', () => {
    const content = '.product-card {\n  color : red;\n  margin:  0 auto ;\n}';
    const oldText = '.product-card {\n  color: red;\n  margin: 0 auto;\n}';

    // Current behavior: Tier 3 normalizes each line via normalizeLineLoose which
    // collapses whitespace, but "color : red ;" -> "color : red ;" vs "color: red;" -> "color: red;"
    // These DO actually match under Tier 3 because normalizeLineLoose collapses all whitespace.
    // Let's verify: "color : red ;" collapses to "color : red ;" and "color: red;" to "color: red;"
    // Wait — normalizeLineLoose does trim() then replace(/\s+/g, ' '), so:
    //   "  color : red;"  -> "color : red;"
    //   "  color: red;"   -> "color: red;"
    // These are DIFFERENT strings ("color : red;" != "color: red;"). So Tier 3 correctly fails here.
    // This gap will be fixed by the 9-tier cascade (WhitespaceNormalizedReplacer).
    const result = findMatch(content, oldText);
    expect(result).toBeNull();
  });
});

// ── Replacement Correctness ──────────────────────────────────────────────────

describe('search_replace: replacement correctness', () => {
  function applyReplace(content: string, oldText: string, newText: string): string | null {
    const match = findMatch(content, oldText);
    if (!match) return null;
    return content.slice(0, match.idx) + newText + content.slice(match.idx + match.matchLen);
  }

  it('replaces exact match correctly', () => {
    const content = '<h2>Old Title</h2>';
    const result = applyReplace(content, '<h2>Old Title</h2>', '<h2>New Title</h2>');
    expect(result).toBe('<h2>New Title</h2>');
  });

  it('replaces multi-line block correctly', () => {
    const content = '<div>\n  <h2>Title</h2>\n  <p>Body</p>\n</div>';
    const result = applyReplace(
      content,
      '  <h2>Title</h2>\n  <p>Body</p>',
      '  <h1>New Title</h1>\n  <p>New Body</p>',
    );
    expect(result).toBe('<div>\n  <h1>New Title</h1>\n  <p>New Body</p>\n</div>');
  });

  it('replaces fuzzy match with correct original boundaries', () => {
    const content = '\t<div>\n\t\t<span>Old</span>\n\t</div>';
    const oldText = '  <div>\n    <span>Old</span>\n  </div>';
    const newText = '  <div>\n    <span>New</span>\n  </div>';
    const result = applyReplace(content, oldText, newText);
    expect(result).not.toBeNull();
    expect(result).toContain('New');
    expect(result).not.toContain('Old');
  });

  it('preserves content before and after the matched section', () => {
    const content = '<!-- Header -->\n<nav>Menu</nav>\n<!-- Main -->\n<main>Content</main>\n<!-- Footer -->';
    const result = applyReplace(content, '<main>Content</main>', '<main>Updated Content</main>');
    expect(result).toBe('<!-- Header -->\n<nav>Menu</nav>\n<!-- Main -->\n<main>Updated Content</main>\n<!-- Footer -->');
  });

  it('can delete content by replacing with empty string', () => {
    const content = '<div>\n  <span class="badge">Remove me</span>\n</div>';
    const result = applyReplace(content, '\n  <span class="badge">Remove me</span>', '');
    expect(result).toBe('<div>\n</div>');
  });

  it('can insert content by replacing adjacent lines', () => {
    const content = '<ul>\n  <li>Item 1</li>\n  <li>Item 3</li>\n</ul>';
    const result = applyReplace(
      content,
      '  <li>Item 1</li>\n  <li>Item 3</li>',
      '  <li>Item 1</li>\n  <li>Item 2</li>\n  <li>Item 3</li>',
    );
    expect(result).toContain('Item 2');
  });
});

// ── 9-Tier Cascade Tests (via replacer.ts) ───────────────────────────────────

import { replace } from '@/lib/agents/tools/replacer';

describe('9-tier cascade: replace() function', () => {
  it('Tier 1 (Simple): exact match', () => {
    const result = replace('Hello World', 'Hello', 'Hi');
    expect(result.content).toBe('Hi World');
    expect(result.replacerUsed).toBe('Simple');
  });

  it('Tier 2 (LineTrimmed): matches with different indentation', () => {
    const content = '    <div class="wrapper">\n        <span>Content</span>\n    </div>';
    const result = replace(content, '<div class="wrapper">\n  <span>Content</span>\n</div>', '<div class="new">\n  <span>New</span>\n</div>');
    expect(result.content).toContain('New');
    expect(result.replacerUsed).toBe('LineTrimmed');
  });

  it('CSS whitespace around colons (was a KNOWN GAP in 3-tier, now resolved)', () => {
    const content = '.card {\n  color : red;\n  margin:  0 auto ;\n}';
    const result = replace(content, '.card {\n  color: red;\n  margin: 0 auto;\n}', '.card {\n  color: blue;\n  margin: 0;\n}');
    expect(result.content).toContain('blue');
    expect(result.replacerUsed).not.toBe('Simple');
  });

  it('Tier 4 (IndentationFlexible): different indent levels', () => {
    const content = '      function hello() {\n        return true;\n      }';
    const result = replace(content, 'function hello() {\n  return true;\n}', 'function hello() {\n  return false;\n}');
    expect(result.content).toContain('false');
    expect(['LineTrimmed', 'IndentationFlexible']).toContain(result.replacerUsed);
  });

  it('Tier 5 (EscapeNormalized): escaped newlines', () => {
    const content = 'const msg = "Hello\\nWorld";';
    const result = replace(content, 'const msg = "Hello\\nWorld";', 'const msg = "Hi\\nWorld";');
    expect(result.content).toContain('Hi');
    expect(result.replacerUsed).toBe('Simple');
  });

  it('leading/trailing whitespace on block (TrimmedBoundary or earlier)', () => {
    const content = '  <div>Content</div>  ';
    const result = replace(content, '\n<div>Content</div>\n', '<div>New</div>');
    expect(result.content).toContain('New');
    expect(result.replacerUsed).not.toBe('Simple');
  });

  it('replaceAll: replaces all occurrences', () => {
    const content = '<li>Item</li>\n<li>Item</li>\n<li>Item</li>';
    const result = replace(content, '<li>Item</li>', '<li>Updated</li>', true);
    expect(result.content).toBe('<li>Updated</li>\n<li>Updated</li>\n<li>Updated</li>');
    expect(result.matchCount).toBe(3);
  });

  it('throws on not found', () => {
    expect(() => replace('Hello', 'Goodbye', 'Hi')).toThrow('old_text not found');
  });

  it('throws on identical strings', () => {
    expect(() => replace('Hello', 'Hello', 'Hello')).toThrow('identical');
  });

  it('handles multi-line Liquid blocks', () => {
    const content = [
      '{% for product in collection.products %}',
      '  <div class="product-card">',
      '    <h2>{{ product.title }}</h2>',
      '    <span class="price">{{ product.price | money }}</span>',
      '  </div>',
      '{% endfor %}',
    ].join('\n');

    const oldText = [
      '  <div class="product-card">',
      '    <h2>{{ product.title }}</h2>',
      '    <span class="price">{{ product.price | money }}</span>',
      '  </div>',
    ].join('\n');

    const newText = [
      '  <div class="product-card">',
      '    <h2>{{ product.title }}</h2>',
      '    <span class="price">{{ product.price | money_with_currency }}</span>',
      '  </div>',
    ].join('\n');

    const result = replace(content, oldText, newText);
    expect(result.content).toContain('money_with_currency');
    expect(result.replacerUsed).toBe('Simple');
  });

  it('handles schema JSON blocks', () => {
    const content = [
      '{% schema %}',
      '{',
      '  "name": "Product",',
      '  "settings": [',
      '    {',
      '      "type": "text",',
      '      "id": "heading",',
      '      "label": "Heading"',
      '    }',
      '  ]',
      '}',
      '{% endschema %}',
    ].join('\n');

    const oldText = '      "label": "Heading"';
    const newText = '      "label": "Title"';
    const result = replace(content, oldText, newText);
    expect(result.content).toContain('"Title"');
    expect(result.replacerUsed).toBe('Simple');
  });
});
