import { describe, it, expect } from 'vitest';
import {
  classifyThemePath,
  getThemeContext,
  THEME_DIRECTORIES,
  THEME_STRUCTURE_DOC,
} from '../theme-structure';

describe('theme-structure', () => {
  describe('classifyThemePath', () => {
    it('classifies layout files', () => {
      expect(classifyThemePath('layout/theme.liquid')).toEqual({
        path: 'layout/theme.liquid',
        role: 'layout',
        directory: 'layout',
        baseName: 'theme.liquid',
        extension: 'liquid',
      });
      expect(classifyThemePath('Layout/theme.liquid').directory).toBe('layout');
    });

    it('classifies template files', () => {
      expect(classifyThemePath('templates/index.json').role).toBe('template');
      expect(classifyThemePath('templates/product.liquid').role).toBe('template');
    });

    it('classifies section files', () => {
      expect(classifyThemePath('sections/header.liquid')).toMatchObject({
        role: 'section',
        directory: 'sections',
        baseName: 'header.liquid',
      });
    });

    it('classifies snippet files', () => {
      expect(classifyThemePath('snippets/icon.liquid')).toMatchObject({
        role: 'snippet',
        directory: 'snippets',
      });
    });

    it('classifies asset files', () => {
      expect(classifyThemePath('assets/theme.js').role).toBe('asset');
      expect(classifyThemePath('assets/theme.css').role).toBe('asset');
      expect(classifyThemePath('assets/logo.png').role).toBe('asset');
    });

    it('classifies config and locale files', () => {
      expect(classifyThemePath('config/settings_data.json').role).toBe('config');
      expect(classifyThemePath('locales/en.default.json').role).toBe('locale');
    });

    it('normalizes backslashes and leading slash', () => {
      const c = classifyThemePath('\\sections\\header.liquid');
      expect(c.path).toBe('sections/header.liquid');
      expect(c.role).toBe('section');
      expect(classifyThemePath('/layout/theme.liquid').path).toBe(
        'layout/theme.liquid'
      );
    });

    it('returns unknown for non-theme paths', () => {
      expect(classifyThemePath('random/file.liquid').role).toBe('unknown');
      expect(classifyThemePath('product.liquid').role).toBe('unknown');
      expect(classifyThemePath('product.liquid').directory).toBe(null);
    });
  });

  describe('getThemeContext', () => {
    it('returns empty summary when no files', () => {
      const ctx = getThemeContext([]);
      expect(ctx.summary).toContain('No theme structure detected');
      expect(ctx.layoutPath).toBeNull();
      expect(ctx.templatePaths).toEqual([]);
      expect(ctx.sectionPaths).toEqual([]);
      expect(ctx.snippetPaths).toEqual([]);
    });

    it('aggregates by role and populates path lists', () => {
      const files = [
        { path: 'layout/theme.liquid' },
        { path: 'templates/index.json' },
        { path: 'templates/product.json' },
        { path: 'sections/header.liquid' },
        { path: 'snippets/icon.liquid' },
        { path: 'assets/theme.js' },
      ];
      const ctx = getThemeContext(files);
      expect(ctx.layoutPath).toBe('layout/theme.liquid');
      expect(ctx.templatePaths).toHaveLength(2);
      expect(ctx.templatePaths).toContain('templates/index.json');
      expect(ctx.sectionPaths).toEqual(['sections/header.liquid']);
      expect(ctx.snippetPaths).toEqual(['snippets/icon.liquid']);
      expect(ctx.assetPaths).toEqual(['assets/theme.js']);
      expect(ctx.byRole.layout).toEqual(['layout/theme.liquid']);
      expect(ctx.summary).toContain('Layout: layout/theme.liquid');
      expect(ctx.summary).toContain('Templates: 2');
      expect(ctx.summary).toContain('Sections: 1');
      expect(ctx.summary).toContain('Snippets: 1');
      expect(ctx.summary).toContain('Assets: 1');
    });

    it('sorts classifications by path', () => {
      const ctx = getThemeContext([
        { path: 'snippets/z.liquid' },
        { path: 'sections/a.liquid' },
      ]);
      expect(ctx.classifications[0].path).toBe('sections/a.liquid');
      expect(ctx.classifications[1].path).toBe('snippets/z.liquid');
    });
  });

  describe('constants', () => {
    it('THEME_DIRECTORIES includes all canonical dirs', () => {
      expect(THEME_DIRECTORIES).toContain('layout');
      expect(THEME_DIRECTORIES).toContain('templates');
      expect(THEME_DIRECTORIES).toContain('sections');
      expect(THEME_DIRECTORIES).toContain('snippets');
      expect(THEME_DIRECTORIES).toContain('assets');
      expect(THEME_DIRECTORIES).toContain('config');
      expect(THEME_DIRECTORIES).toContain('locales');
    });

    it('THEME_STRUCTURE_DOC describes relationships', () => {
      expect(THEME_STRUCTURE_DOC).toContain('layout');
      expect(THEME_STRUCTURE_DOC).toContain('templates');
      expect(THEME_STRUCTURE_DOC).toContain('sections');
      expect(THEME_STRUCTURE_DOC).toContain('snippets');
      expect(THEME_STRUCTURE_DOC).toContain('render');
    });
  });
});
