import { describe, it, expect } from 'vitest';
import type { FileContext } from '../types';
import { DependencyDetector } from '../detector';

function createMockFile(
  overrides: Partial<FileContext> & { fileId: string; fileName: string }
): FileContext {
  return {
    fileType: 'other',
    content: '',
    sizeBytes: 0,
    lastModified: new Date('2025-01-01'),
    dependencies: { imports: [], exports: [], usedBy: [] },
    ...overrides,
  };
}

describe('DependencyDetector', () => {
  const detector = new DependencyDetector();

  describe('detectDependencies', () => {
    it('should return empty array for no files', () => {
      expect(detector.detectDependencies([])).toEqual([]);
    });

    it('should return empty array for files with no cross-references', () => {
      const files: FileContext[] = [
        createMockFile({
          fileId: '1',
          fileName: 'template.liquid',
          fileType: 'liquid',
          content: '<div>Hello</div>',
        }),
        createMockFile({
          fileId: '2',
          fileName: 'styles.css',
          fileType: 'css',
          content: 'body { margin: 0; }',
        }),
      ];

      expect(detector.detectDependencies(files)).toEqual([]);
    });

    it('should detect dependencies across multiple file types', () => {
      const files: FileContext[] = [
        createMockFile({
          fileId: 'liquid-1',
          fileName: 'template.liquid',
          fileType: 'liquid',
          content: '<div class="header">Hello</div>',
        }),
        createMockFile({
          fileId: 'css-1',
          fileName: 'styles.css',
          fileType: 'css',
          content: '.header { color: red; }',
        }),
      ];

      const deps = detector.detectDependencies(files);
      expect(deps.length).toBe(1);
      expect(deps[0].dependencyType).toBe('css_class');
    });
  });

  describe('detectLiquidDependencies', () => {
    describe('CSS class references', () => {
      it('should detect CSS class usage in Liquid templates', () => {
        const liquidFile = createMockFile({
          fileId: 'liquid-1',
          fileName: 'template.liquid',
          fileType: 'liquid',
          content: '<div class="header">Content</div>',
        });

        const cssFile = createMockFile({
          fileId: 'css-1',
          fileName: 'styles.css',
          fileType: 'css',
          content: '.header { color: red; }',
        });

        const deps = detector.detectLiquidDependencies(liquidFile, [
          liquidFile,
          cssFile,
        ]);

        expect(deps.length).toBe(1);
        expect(deps[0].sourceFileId).toBe('liquid-1');
        expect(deps[0].targetFileId).toBe('css-1');
        expect(deps[0].dependencyType).toBe('css_class');
        expect(deps[0].references.length).toBe(1);
        expect(deps[0].references[0].symbol).toBe('header');
      });

      it('should detect multiple CSS classes in one attribute', () => {
        const liquidFile = createMockFile({
          fileId: 'liquid-1',
          fileName: 'template.liquid',
          fileType: 'liquid',
          content: '<div class="header footer">Content</div>',
        });

        const cssFile = createMockFile({
          fileId: 'css-1',
          fileName: 'styles.css',
          fileType: 'css',
          content: '.header { } .footer { }',
        });

        const deps = detector.detectLiquidDependencies(liquidFile, [
          liquidFile,
          cssFile,
        ]);

        expect(deps.length).toBe(1);
        expect(deps[0].references.length).toBe(2);
        expect(deps[0].references[0].symbol).toBe('header');
        expect(deps[0].references[1].symbol).toBe('footer');
      });

      it('should not create dependency if class is not found in CSS', () => {
        const liquidFile = createMockFile({
          fileId: 'liquid-1',
          fileName: 'template.liquid',
          fileType: 'liquid',
          content: '<div class="nonexistent">Content</div>',
        });

        const cssFile = createMockFile({
          fileId: 'css-1',
          fileName: 'styles.css',
          fileType: 'css',
          content: '.header { }',
        });

        const deps = detector.detectLiquidDependencies(liquidFile, [
          liquidFile,
          cssFile,
        ]);

        expect(deps.length).toBe(0);
      });
    });

    describe('JS function references', () => {
      it('should detect onclick function references', () => {
        const liquidFile = createMockFile({
          fileId: 'liquid-1',
          fileName: 'template.liquid',
          fileType: 'liquid',
          content: '<button onclick="handleClick()">Click</button>',
        });

        const jsFile = createMockFile({
          fileId: 'js-1',
          fileName: 'app.js',
          fileType: 'javascript',
          content: 'function handleClick() { alert("clicked"); }',
        });

        const deps = detector.detectLiquidDependencies(liquidFile, [
          liquidFile,
          jsFile,
        ]);

        expect(deps.length).toBe(1);
        expect(deps[0].dependencyType).toBe('js_function');
        expect(deps[0].references[0].symbol).toBe('handleClick');
      });

      it('should detect data-action function references', () => {
        const liquidFile = createMockFile({
          fileId: 'liquid-1',
          fileName: 'template.liquid',
          fileType: 'liquid',
          content: '<button data-action="submitForm">Submit</button>',
        });

        const jsFile = createMockFile({
          fileId: 'js-1',
          fileName: 'app.js',
          fileType: 'javascript',
          content: 'function submitForm() { }',
        });

        const deps = detector.detectLiquidDependencies(liquidFile, [
          liquidFile,
          jsFile,
        ]);

        expect(deps.length).toBe(1);
        expect(deps[0].dependencyType).toBe('js_function');
        expect(deps[0].references[0].symbol).toBe('submitForm');
      });
    });

    describe('Liquid includes', () => {
      it('should detect include statements', () => {
        const liquidFile = createMockFile({
          fileId: 'liquid-1',
          fileName: 'template.liquid',
          fileType: 'liquid',
          content: "{% include 'header' %}",
        });

        const headerFile = createMockFile({
          fileId: 'liquid-2',
          fileName: 'header.liquid',
          fileType: 'liquid',
          content: '<header>Site Header</header>',
        });

        const deps = detector.detectLiquidDependencies(liquidFile, [
          liquidFile,
          headerFile,
        ]);

        expect(deps.length).toBe(1);
        expect(deps[0].dependencyType).toBe('liquid_include');
        expect(deps[0].targetFileId).toBe('liquid-2');
        expect(deps[0].references[0].symbol).toBe('header');
      });

      it('should detect render statements', () => {
        const liquidFile = createMockFile({
          fileId: 'liquid-1',
          fileName: 'template.liquid',
          fileType: 'liquid',
          content: "{% render 'product-card' %}",
        });

        const cardFile = createMockFile({
          fileId: 'liquid-2',
          fileName: 'product-card.liquid',
          fileType: 'liquid',
          content: '<div>Product</div>',
        });

        const deps = detector.detectLiquidDependencies(liquidFile, [
          liquidFile,
          cardFile,
        ]);

        expect(deps.length).toBe(1);
        expect(deps[0].dependencyType).toBe('liquid_include');
        expect(deps[0].references[0].symbol).toBe('product-card');
      });

      it('should not create self-referencing dependency', () => {
        const liquidFile = createMockFile({
          fileId: 'liquid-1',
          fileName: 'template.liquid',
          fileType: 'liquid',
          content: "{% include 'template' %}",
        });

        const deps = detector.detectLiquidDependencies(liquidFile, [
          liquidFile,
        ]);

        expect(deps.length).toBe(0);
      });
    });

    describe('Data attributes', () => {
      it('should detect data attribute connections to JS files', () => {
        const liquidFile = createMockFile({
          fileId: 'liquid-1',
          fileName: 'template.liquid',
          fileType: 'liquid',
          content:
            '<div data-product-id="123">Product</div>',
        });

        const jsFile = createMockFile({
          fileId: 'js-1',
          fileName: 'app.js',
          fileType: 'javascript',
          content:
            'document.querySelector("[data-product-id]").addEventListener("click", fn);',
        });

        const deps = detector.detectLiquidDependencies(liquidFile, [
          liquidFile,
          jsFile,
        ]);

        expect(deps.length).toBe(1);
        expect(deps[0].dependencyType).toBe('data_attribute');
        expect(deps[0].references[0].symbol).toBe(
          'data-product-id=123'
        );
      });
    });

    describe('Asset references', () => {
      it('should detect asset_url references', () => {
        const liquidFile = createMockFile({
          fileId: 'liquid-1',
          fileName: 'template.liquid',
          fileType: 'liquid',
          content: "{{ 'theme.css' | asset_url }}",
        });

        const cssFile = createMockFile({
          fileId: 'css-1',
          fileName: 'theme.css',
          fileType: 'css',
          content: '.header { }',
        });

        const deps = detector.detectLiquidDependencies(liquidFile, [
          liquidFile,
          cssFile,
        ]);

        expect(deps.length).toBe(1);
        expect(deps[0].dependencyType).toBe('asset_reference');
        expect(deps[0].targetFileId).toBe('css-1');
        expect(deps[0].references[0].symbol).toBe('theme.css');
      });

      it('should not create dependency for missing assets', () => {
        const liquidFile = createMockFile({
          fileId: 'liquid-1',
          fileName: 'template.liquid',
          fileType: 'liquid',
          content: "{{ 'missing.css' | asset_url }}",
        });

        const deps = detector.detectLiquidDependencies(liquidFile, [
          liquidFile,
        ]);

        expect(deps.length).toBe(0);
      });
    });
  });

  describe('detectJavaScriptDependencies', () => {
    it('should detect import statements', () => {
      const jsFile = createMockFile({
        fileId: 'js-1',
        fileName: 'app.js',
        fileType: 'javascript',
        content: "import { helper } from './utils';",
      });

      const utilsFile = createMockFile({
        fileId: 'js-2',
        fileName: 'utils.js',
        fileType: 'javascript',
        content: 'export function helper() { }',
      });

      const deps = detector.detectJavaScriptDependencies(jsFile, [
        jsFile,
        utilsFile,
      ]);

      expect(deps.length).toBe(1);
      expect(deps[0].sourceFileId).toBe('js-1');
      expect(deps[0].targetFileId).toBe('js-2');
      expect(deps[0].dependencyType).toBe('js_import');
      expect(deps[0].references[0].symbol).toBe('./utils');
    });

    it('should detect default import statements', () => {
      const jsFile = createMockFile({
        fileId: 'js-1',
        fileName: 'app.js',
        fileType: 'javascript',
        content: "import React from 'react.js';",
      });

      const reactFile = createMockFile({
        fileId: 'js-2',
        fileName: 'react.js',
        fileType: 'javascript',
        content: 'export default {};',
      });

      const deps = detector.detectJavaScriptDependencies(jsFile, [
        jsFile,
        reactFile,
      ]);

      expect(deps.length).toBe(1);
      expect(deps[0].dependencyType).toBe('js_import');
    });

    it('should detect namespace import statements', () => {
      const jsFile = createMockFile({
        fileId: 'js-1',
        fileName: 'app.js',
        fileType: 'javascript',
        content: "import * as utils from 'utils.js';",
      });

      const utilsFile = createMockFile({
        fileId: 'js-2',
        fileName: 'utils.js',
        fileType: 'javascript',
        content: 'export function foo() { }',
      });

      const deps = detector.detectJavaScriptDependencies(jsFile, [
        jsFile,
        utilsFile,
      ]);

      expect(deps.length).toBe(1);
      expect(deps[0].dependencyType).toBe('js_import');
    });

    it('should return empty array when import target not found', () => {
      const jsFile = createMockFile({
        fileId: 'js-1',
        fileName: 'app.js',
        fileType: 'javascript',
        content: "import { something } from 'nonexistent';",
      });

      const deps = detector.detectJavaScriptDependencies(jsFile, [
        jsFile,
      ]);

      expect(deps.length).toBe(0);
    });

    it('should not self-reference', () => {
      const jsFile = createMockFile({
        fileId: 'js-1',
        fileName: 'app.js',
        fileType: 'javascript',
        content: "import { foo } from 'app.js';",
      });

      const deps = detector.detectJavaScriptDependencies(jsFile, [
        jsFile,
      ]);

      expect(deps.length).toBe(0);
    });
  });

  describe('detectCssDependencies', () => {
    it('should detect @import statements with single quotes', () => {
      const cssFile = createMockFile({
        fileId: 'css-1',
        fileName: 'main.css',
        fileType: 'css',
        content: "@import 'variables.css';",
      });

      const varsFile = createMockFile({
        fileId: 'css-2',
        fileName: 'variables.css',
        fileType: 'css',
        content: ':root { --color: red; }',
      });

      const deps = detector.detectCssDependencies(cssFile, [
        cssFile,
        varsFile,
      ]);

      expect(deps.length).toBe(1);
      expect(deps[0].sourceFileId).toBe('css-1');
      expect(deps[0].targetFileId).toBe('css-2');
      expect(deps[0].dependencyType).toBe('css_import');
      expect(deps[0].references[0].symbol).toBe('variables.css');
    });

    it('should detect @import url() statements', () => {
      const cssFile = createMockFile({
        fileId: 'css-1',
        fileName: 'main.css',
        fileType: 'css',
        content: "@import url('reset.css');",
      });

      const resetFile = createMockFile({
        fileId: 'css-2',
        fileName: 'reset.css',
        fileType: 'css',
        content: '* { margin: 0; }',
      });

      const deps = detector.detectCssDependencies(cssFile, [
        cssFile,
        resetFile,
      ]);

      expect(deps.length).toBe(1);
      expect(deps[0].dependencyType).toBe('css_import');
    });

    it('should return empty array when import target not found', () => {
      const cssFile = createMockFile({
        fileId: 'css-1',
        fileName: 'main.css',
        fileType: 'css',
        content: "@import 'nonexistent.css';",
      });

      const deps = detector.detectCssDependencies(cssFile, [
        cssFile,
      ]);

      expect(deps.length).toBe(0);
    });

    it('should detect multiple @import statements', () => {
      const cssFile = createMockFile({
        fileId: 'css-1',
        fileName: 'main.css',
        fileType: 'css',
        content: `
          @import 'variables.css';
          @import 'reset.css';
        `,
      });

      const varsFile = createMockFile({
        fileId: 'css-2',
        fileName: 'variables.css',
        fileType: 'css',
        content: ':root { }',
      });

      const resetFile = createMockFile({
        fileId: 'css-3',
        fileName: 'reset.css',
        fileType: 'css',
        content: '* { }',
      });

      const deps = detector.detectCssDependencies(cssFile, [
        cssFile,
        varsFile,
        resetFile,
      ]);

      expect(deps.length).toBe(2);
      expect(deps[0].targetFileId).toBe('css-2');
      expect(deps[1].targetFileId).toBe('css-3');
    });
  });

  describe('reference details', () => {
    it('should include correct source location in references', () => {
      const liquidFile = createMockFile({
        fileId: 'liquid-1',
        fileName: 'template.liquid',
        fileType: 'liquid',
        content: '<div class="header">Content</div>',
      });

      const cssFile = createMockFile({
        fileId: 'css-1',
        fileName: 'styles.css',
        fileType: 'css',
        content: '.header { color: red; }',
      });

      const deps = detector.detectLiquidDependencies(liquidFile, [
        liquidFile,
        cssFile,
      ]);

      expect(deps[0].references[0].sourceLocation).toBeDefined();
      expect(deps[0].references[0].sourceLocation.line).toBe(1);
      expect(
        deps[0].references[0].sourceLocation.column
      ).toBeGreaterThan(0);
    });

    it('should include context snippet in references', () => {
      const liquidFile = createMockFile({
        fileId: 'liquid-1',
        fileName: 'template.liquid',
        fileType: 'liquid',
        content: '<div class="header">Content</div>',
      });

      const cssFile = createMockFile({
        fileId: 'css-1',
        fileName: 'styles.css',
        fileType: 'css',
        content: '.header { color: red; }',
      });

      const deps = detector.detectLiquidDependencies(liquidFile, [
        liquidFile,
        cssFile,
      ]);

      expect(deps[0].references[0].context).toBeDefined();
      expect(deps[0].references[0].context.length).toBeGreaterThan(
        0
      );
      expect(deps[0].references[0].context).toContain('class=');
    });
  });
});
