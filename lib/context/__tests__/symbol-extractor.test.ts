import { describe, it, expect } from 'vitest';
import { SymbolExtractor } from '../symbol-extractor';

describe('SymbolExtractor', () => {
  const extractor = new SymbolExtractor();

  describe('extractCssClasses', () => {
    it('should extract single CSS class', () => {
      const css = '.header { color: red; }';
      expect(extractor.extractCssClasses(css)).toEqual(['header']);
    });

    it('should extract multiple CSS classes', () => {
      const css = `
        .header { color: red; }
        .footer { color: blue; }
        .nav-item { display: flex; }
      `;
      expect(extractor.extractCssClasses(css)).toEqual([
        'header',
        'footer',
        'nav-item',
      ]);
    });

    it('should handle classes with underscores and hyphens', () => {
      const css = `
        .my-class { }
        .my_class { }
        ._private { }
        .-negative { }
      `;
      expect(extractor.extractCssClasses(css)).toEqual([
        'my-class',
        'my_class',
        '_private',
        '-negative',
      ]);
    });

    it('should deduplicate classes', () => {
      const css = `
        .header { color: red; }
        .header { font-size: 16px; }
      `;
      expect(extractor.extractCssClasses(css)).toEqual(['header']);
    });

    it('should return empty array for content with no classes', () => {
      const css = 'body { margin: 0; }';
      expect(extractor.extractCssClasses(css)).toEqual([]);
    });
  });

  describe('extractJsFunctions', () => {
    it('should extract function declarations', () => {
      const js = `
        function handleClick() { }
        function submitForm(data) { }
      `;
      expect(extractor.extractJsFunctions(js)).toEqual([
        'handleClick',
        'submitForm',
      ]);
    });

    it('should extract arrow functions assigned to const', () => {
      const js = `
        const handleClick = () => { };
        const processData = (data) => data;
      `;
      expect(extractor.extractJsFunctions(js)).toEqual([
        'handleClick',
        'processData',
      ]);
    });

    it('should extract arrow functions with single parameter (no parens)', () => {
      const js = `const transform = x => x * 2;`;
      expect(extractor.extractJsFunctions(js)).toEqual(['transform']);
    });

    it('should extract arrow functions assigned to let/var', () => {
      const js = `
        let onClick = () => { };
        var onSubmit = (e) => { };
      `;
      expect(extractor.extractJsFunctions(js)).toEqual([
        'onClick',
        'onSubmit',
      ]);
    });

    it('should extract both function types together', () => {
      const js = `
        function init() { }
        const cleanup = () => { };
      `;
      expect(extractor.extractJsFunctions(js)).toEqual([
        'init',
        'cleanup',
      ]);
    });

    it('should deduplicate function names', () => {
      const js = `
        function handleClick() { }
        function handleClick() { }
      `;
      expect(extractor.extractJsFunctions(js)).toEqual([
        'handleClick',
      ]);
    });

    it('should return empty array for no functions', () => {
      const js = 'const x = 42;';
      expect(extractor.extractJsFunctions(js)).toEqual([]);
    });
  });

  describe('extractLiquidIncludes', () => {
    it('should extract include statements with single quotes', () => {
      const liquid = "{% include 'header' %}";
      expect(extractor.extractLiquidIncludes(liquid)).toEqual([
        'header',
      ]);
    });

    it('should extract include statements with double quotes', () => {
      const liquid = '{% include "header" %}';
      expect(extractor.extractLiquidIncludes(liquid)).toEqual([
        'header',
      ]);
    });

    it('should extract render statements', () => {
      const liquid = "{% render 'product-card' %}";
      expect(extractor.extractLiquidIncludes(liquid)).toEqual([
        'product-card',
      ]);
    });

    it('should extract multiple includes', () => {
      const liquid = `
        {% include 'header' %}
        {% render 'footer' %}
        {% include 'sidebar' %}
      `;
      expect(extractor.extractLiquidIncludes(liquid)).toEqual([
        'header',
        'footer',
        'sidebar',
      ]);
    });

    it('should handle whitespace-trimming tags', () => {
      const liquid = "{%- include 'header' -%}";
      expect(extractor.extractLiquidIncludes(liquid)).toEqual([
        'header',
      ]);
    });

    it('should deduplicate includes', () => {
      const liquid = `
        {% include 'header' %}
        {% include 'header' %}
      `;
      expect(extractor.extractLiquidIncludes(liquid)).toEqual([
        'header',
      ]);
    });

    it('should return empty array for no includes', () => {
      const liquid = '<div>{{ product.title }}</div>';
      expect(extractor.extractLiquidIncludes(liquid)).toEqual([]);
    });
  });

  describe('getLineNumber', () => {
    it('should return line 1, column 1 for index 0', () => {
      const content = 'hello world';
      expect(extractor.getLineNumber(content, 0)).toEqual({
        line: 1,
        column: 1,
      });
    });

    it('should return correct line and column for single line', () => {
      const content = 'hello world';
      expect(extractor.getLineNumber(content, 6)).toEqual({
        line: 1,
        column: 7,
      });
    });

    it('should return correct line for multiline content', () => {
      const content = 'line one\nline two\nline three';
      // 'line two' starts at index 9
      expect(extractor.getLineNumber(content, 9)).toEqual({
        line: 2,
        column: 1,
      });
    });

    it('should return correct line and column in middle of line', () => {
      const content = 'first\nsecond\nthird';
      // 'third' starts at index 13
      expect(extractor.getLineNumber(content, 13)).toEqual({
        line: 3,
        column: 1,
      });
    });
  });

  describe('getContextSnippet', () => {
    it('should return a snippet starting at the given index', () => {
      const content = 'hello world, this is a test';
      expect(extractor.getContextSnippet(content, 6, 5)).toBe(
        'world'
      );
    });

    it('should not exceed content bounds', () => {
      const content = 'short';
      expect(extractor.getContextSnippet(content, 0, 100)).toBe(
        'short'
      );
    });

    it('should handle index at end of content', () => {
      const content = 'hello';
      expect(extractor.getContextSnippet(content, 5, 10)).toBe('');
    });

    it('should use default length when not provided', () => {
      const content = 'a'.repeat(100);
      const snippet = extractor.getContextSnippet(content, 0);
      expect(snippet.length).toBe(50);
    });
  });
});
