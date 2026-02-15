import { describe, it, expect, beforeEach } from 'vitest';
import { ContextCache } from '../cache';
import { setCacheAdapter, MemoryAdapter } from '@/lib/cache/cache-adapter';
import { DependencyDetector } from '../detector';
import { SymbolExtractor } from '../symbol-extractor';
import { ClaudeContextPackager, CodexContextPackager } from '../packager';
import type { ProjectContext, FileContext } from '../types';

function makeFile(
  id: string,
  name: string,
  type: FileContext['fileType'],
  content: string
): FileContext {
  return {
    fileId: id,
    fileName: name,
    fileType: type,
    content,
    sizeBytes: new TextEncoder().encode(content).length,
    lastModified: new Date(),
    dependencies: { imports: [], exports: [], usedBy: [] },
  };
}

describe('Context System Integration', () => {
  it('detects dependencies and packages context end-to-end', () => {
    const files: FileContext[] = [
      makeFile(
        'f1',
        'product.liquid',
        'liquid',
        '<div class="product-grid">{% render \'card\' %}</div>'
      ),
      makeFile('f2', 'card.liquid', 'liquid', '<div class="card">{{ product.title }}</div>'),
      makeFile('f3', 'theme.css', 'css', '.product-grid { display: grid; }\n.card { padding: 1rem; }'),
    ];

    const detector = new DependencyDetector();
    const deps = detector.detectDependencies(files);

    // product.liquid → theme.css (css_class: product-grid)
    // product.liquid → card.liquid (liquid_include: card)
    expect(deps.length).toBeGreaterThanOrEqual(2);

    const context: ProjectContext = {
      projectId: 'proj-1',
      files,
      dependencies: deps,
      loadedAt: new Date(),
      totalSizeBytes: files.reduce((s, f) => s + f.sizeBytes, 0),
    };

    const claude = new ClaudeContextPackager();
    const formatted = claude.packageForAgent(context, 'Update the grid layout', 'project_manager');
    expect(formatted).toContain('product.liquid');
    expect(formatted).toContain('product-grid');
    expect(formatted).toContain('Update the grid layout');
  });

  it('cache stores and retrieves context with dependencies', async () => {
    setCacheAdapter(new MemoryAdapter());
    const cache = new ContextCache();
    const context: ProjectContext = {
      projectId: 'proj-test',
      files: [makeFile('f1', 'a.liquid', 'liquid', '<div>hello</div>')],
      dependencies: [],
      loadedAt: new Date(),
      totalSizeBytes: 100,
    };

    await cache.set('proj-test', context);
    const cached = await cache.get('proj-test');
    expect(cached).toBeDefined();
    expect(cached!.projectId).toBe('proj-test');
    expect(cached!.files).toHaveLength(1);
  });

  it('symbol extractor feeds into dependency detector', () => {
    const extractor = new SymbolExtractor();
    const cssClasses = extractor.extractCssClasses('.btn { } .card { } .hero { }');
    expect(cssClasses).toContain('btn');
    expect(cssClasses).toContain('card');
    expect(cssClasses).toContain('hero');

    const includes = extractor.extractLiquidIncludes("{% render 'header' %}{% include 'footer' %}");
    expect(includes).toContain('header');
    expect(includes).toContain('footer');
  });
});
