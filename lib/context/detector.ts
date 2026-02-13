/**
 * Cross-file dependency detector - REQ-5
 */

import type {
  FileContext,
  FileDependency,
  DependencyReference,
} from './types';
import { SymbolExtractor } from './symbol-extractor';
import { classifyThemePath } from '@/lib/shopify/theme-structure';

export class DependencyDetector {
  private extractor: SymbolExtractor;

  constructor() {
    this.extractor = new SymbolExtractor();
  }

  /**
   * Detect all cross-file dependencies across a set of files.
   */
  detectDependencies(files: FileContext[]): FileDependency[] {
    const dependencies: FileDependency[] = [];

    for (const file of files) {
      switch (file.fileType) {
        case 'liquid':
          dependencies.push(
            ...this.detectLiquidDependencies(file, files)
          );
          break;
        case 'javascript':
          dependencies.push(
            ...this.detectJavaScriptDependencies(file, files)
          );
          break;
        case 'css':
          dependencies.push(
            ...this.detectCssDependencies(file, files)
          );
          break;
        case 'other':
          dependencies.push(
            ...this.detectTemplateSectionDependencies(file, files)
          );
          break;
      }
    }

    return dependencies;
  }

  /**
   * Template → section chain: template JSON files reference sections by type.
   */
  private detectTemplateSectionDependencies(
    file: FileContext,
    allFiles: FileContext[]
  ): FileDependency[] {
    const path = file.fileName.replace(/\\/g, '/');
    const classification = classifyThemePath(path);
    if (classification.role !== 'template' || !path.endsWith('.json')) {
      return [];
    }
    const dependencies: FileDependency[] = [];
    try {
      const data = JSON.parse(file.content) as {
        sections?: Record<string, { type?: string }>;
      };
      const sections = data.sections ?? {};
      for (const sectionType of Object.values(sections).map((s) => s?.type).filter(Boolean)) {
        const sectionPath = (sectionType as string).endsWith('.liquid')
          ? `sections/${sectionType}`
          : `sections/${sectionType}.liquid`;
        const targetFile = allFiles.find(
          (f) =>
            f.fileId !== file.fileId &&
            (f.fileName === sectionPath ||
              f.fileName.replace(/\\/g, '/') === sectionPath ||
              f.fileName.endsWith(`/${sectionPath}`))
        );
        if (targetFile) {
          dependencies.push({
            sourceFileId: file.fileId,
            targetFileId: targetFile.fileId,
            dependencyType: 'template_section',
            references: [
              {
                sourceLocation: { line: 1, column: 1 },
                symbol: sectionType as string,
                context: `template references section ${sectionType}`,
              },
            ],
          });
        }
      }
    } catch {
      // ignore invalid JSON
    }
    return dependencies;
  }

  /**
   * Detect dependencies within a Liquid file:
   * - CSS class usage → links to CSS files defining those classes
   * - JS function references → links to JS files defining those functions
   * - Liquid includes/renders → links to referenced .liquid files
   * - Data attribute usage
   * - Asset references via {{ 'file' | asset_url }}
   */
  detectLiquidDependencies(
    file: FileContext,
    allFiles: FileContext[]
  ): FileDependency[] {
    const dependencies: FileDependency[] = [];
    const content = file.content;

    // --- CSS class references ---
    const cssFiles = allFiles.filter((f) => f.fileType === 'css');
    const classRegex = /class=["']([^"']+)["']/g;
    let match: RegExpExecArray | null;

    while ((match = classRegex.exec(content)) !== null) {
      const classNames = match[1].split(/\s+/).filter(Boolean);

      for (const className of classNames) {
        for (const cssFile of cssFiles) {
          const cssClasses =
            this.extractor.extractCssClasses(cssFile.content);
          if (cssClasses.includes(className)) {
            const sourceLocation = this.extractor.getLineNumber(
              content,
              match.index
            );
            const context = this.extractor.getContextSnippet(
              content,
              match.index,
              match[0].length
            );

            const existing = dependencies.find(
              (d) =>
                d.sourceFileId === file.fileId &&
                d.targetFileId === cssFile.fileId &&
                d.dependencyType === 'css_class'
            );

            const reference: DependencyReference = {
              sourceLocation,
              symbol: className,
              context,
            };

            if (existing) {
              existing.references.push(reference);
            } else {
              dependencies.push({
                sourceFileId: file.fileId,
                targetFileId: cssFile.fileId,
                dependencyType: 'css_class',
                references: [reference],
              });
            }
          }
        }
      }
    }

    // --- JS function references ---
    const jsFiles = allFiles.filter(
      (f) => f.fileType === 'javascript'
    );
    const onclickRegex =
      /(?:onclick|data-action)=["']([a-zA-Z_$][a-zA-Z0-9_$]*)\s*(?:\([^)]*\))?["']/g;

    while ((match = onclickRegex.exec(content)) !== null) {
      const funcName = match[1];

      for (const jsFile of jsFiles) {
        const jsFunctions = this.extractor.extractJsFunctions(
          jsFile.content
        );
        if (jsFunctions.includes(funcName)) {
          const sourceLocation = this.extractor.getLineNumber(
            content,
            match.index
          );
          const context = this.extractor.getContextSnippet(
            content,
            match.index,
            match[0].length
          );

          const existing = dependencies.find(
            (d) =>
              d.sourceFileId === file.fileId &&
              d.targetFileId === jsFile.fileId &&
              d.dependencyType === 'js_function'
          );

          const reference: DependencyReference = {
            sourceLocation,
            symbol: funcName,
            context,
          };

          if (existing) {
            existing.references.push(reference);
          } else {
            dependencies.push({
              sourceFileId: file.fileId,
              targetFileId: jsFile.fileId,
              dependencyType: 'js_function',
              references: [reference],
            });
          }
        }
      }
    }

    // --- Liquid includes/renders ---
    const liquidFiles = allFiles.filter(
      (f) => f.fileType === 'liquid'
    );
    const includeRegex =
      /\{%[-\s]*(?:include|render)\s+['"]([^'"]+)['"]/g;

    while ((match = includeRegex.exec(content)) !== null) {
      const includeName = match[1];
      const targetFile = liquidFiles.find(
        (f) =>
          f.fileName === includeName ||
          f.fileName === `${includeName}.liquid` ||
          f.fileName.endsWith(`/${includeName}`) ||
          f.fileName.endsWith(`/${includeName}.liquid`)
      );

      if (targetFile && targetFile.fileId !== file.fileId) {
        const sourceLocation = this.extractor.getLineNumber(
          content,
          match.index
        );
        const context = this.extractor.getContextSnippet(
          content,
          match.index,
          match[0].length
        );

        dependencies.push({
          sourceFileId: file.fileId,
          targetFileId: targetFile.fileId,
          dependencyType: 'liquid_include',
          references: [
            {
              sourceLocation,
              symbol: includeName,
              context,
            },
          ],
        });
      }
    }

    // --- Data attributes ---
    const dataAttrRegex = /data-([a-zA-Z0-9-]+)=["']([^"']+)["']/g;

    while ((match = dataAttrRegex.exec(content)) !== null) {
      const attrName = match[1];
      const attrValue = match[2];
      const sourceLocation = this.extractor.getLineNumber(
        content,
        match.index
      );
      const context = this.extractor.getContextSnippet(
        content,
        match.index,
        match[0].length
      );

      // Link data attributes to JS files that reference the same data attribute
      for (const jsFile of jsFiles) {
        if (jsFile.content.includes(`data-${attrName}`)) {
          const existing = dependencies.find(
            (d) =>
              d.sourceFileId === file.fileId &&
              d.targetFileId === jsFile.fileId &&
              d.dependencyType === 'data_attribute'
          );

          const reference: DependencyReference = {
            sourceLocation,
            symbol: `data-${attrName}=${attrValue}`,
            context,
          };

          if (existing) {
            existing.references.push(reference);
          } else {
            dependencies.push({
              sourceFileId: file.fileId,
              targetFileId: jsFile.fileId,
              dependencyType: 'data_attribute',
              references: [reference],
            });
          }
        }
      }
    }

    // --- Asset references: {{ 'file' | asset_url }} ---
    const assetRegex =
      /\{\{\s*['"]([^'"]+)['"]\s*\|\s*asset_url\s*\}\}/g;

    while ((match = assetRegex.exec(content)) !== null) {
      const assetName = match[1];
      const targetFile = allFiles.find(
        (f) =>
          f.fileName === assetName ||
          f.fileName.endsWith(`/${assetName}`)
      );

      if (targetFile && targetFile.fileId !== file.fileId) {
        const sourceLocation = this.extractor.getLineNumber(
          content,
          match.index
        );
        const context = this.extractor.getContextSnippet(
          content,
          match.index,
          match[0].length
        );

        dependencies.push({
          sourceFileId: file.fileId,
          targetFileId: targetFile.fileId,
          dependencyType: 'asset_reference',
          references: [
            {
              sourceLocation,
              symbol: assetName,
              context,
            },
          ],
        });
      }
    }

    // --- Schema-to-template, CSS-to-section, snippet variable contracts ---
    dependencies.push(
      ...this.detectSchemaSettingDependencies(file, allFiles),
      ...this.detectCssToSectionMapping(file, allFiles),
      ...this.detectSnippetVariableContracts(file, allFiles)
    );

    return dependencies;
  }

  /**
   * Schema-to-template: parse {% schema %} to extract setting IDs,
   * detect section.settings.X usage, validate template JSON settings match section schemas.
   */
  private detectSchemaSettingDependencies(
    file: FileContext,
    allFiles: FileContext[]
  ): FileDependency[] {
    if (file.fileType !== 'liquid') return [];

    const dependencies: FileDependency[] = [];
    const content = file.content;

    const schemaMatch = content.match(
      /\{%\s*schema\s*%\}([\s\S]*?)\{%\s*endschema\s*%\}/i
    );
    if (!schemaMatch) return [];

    const schemaJson = schemaMatch[1]?.trim();
    if (!schemaJson) return [];

    try {
      const schema = JSON.parse(schemaJson) as {
        settings?: Array<{ id?: string }>;
        blocks?: Array<{ type?: string; settings?: Array<{ id?: string }> }>;
      };
      const settingIds = new Set<string>();

      for (const s of schema.settings ?? []) {
        if (s?.id) settingIds.add(s.id);
      }
      for (const block of schema.blocks ?? []) {
        for (const s of block.settings ?? []) {
          if (s?.id) settingIds.add(s.id);
        }
      }

      const liquidContent = content.replace(
        /\{%\s*schema\s*%\}[\s\S]*?\{%\s*endschema\s*%\}/i,
        ''
      );
      const settingsUsageRegex = /section\.settings\.([a-zA-Z_][a-zA-Z0-9_]*)/g;
      let match: RegExpExecArray | null;

      while ((match = settingsUsageRegex.exec(liquidContent)) !== null) {
        const settingId = match[1];
        const sourceLocation = this.extractor.getLineNumber(
          content,
          match.index
        );
        const context = this.extractor.getContextSnippet(
          content,
          match.index,
          match[0].length
        );

        const existing = dependencies.find(
          (d) =>
            d.sourceFileId === file.fileId &&
            d.targetFileId === file.fileId &&
            d.dependencyType === 'schema_setting'
        );

        const reference: DependencyReference = {
          sourceLocation,
          symbol: settingId,
          context,
        };

        if (existing) {
          existing.references.push(reference);
        } else {
          dependencies.push({
            sourceFileId: file.fileId,
            targetFileId: file.fileId,
            dependencyType: 'schema_setting',
            references: [reference],
          });
        }
      }

      const path = file.fileName.replace(/\\/g, '/');
      const sectionType = path.includes('/')
        ? path.split('/').pop()?.replace(/\.liquid$/, '')
        : path.replace(/\.liquid$/, '');

      for (const templateFile of allFiles) {
        if (
          templateFile.fileType !== 'other' ||
          !templateFile.fileName.replace(/\\/g, '/').endsWith('.json')
        )
          continue;

        try {
          const data = JSON.parse(templateFile.content) as {
            sections?: Record<string, { type?: string; settings?: Record<string, unknown> }>;
          };
          const sections = data.sections ?? {};
          for (const [key, section] of Object.entries(sections)) {
            const st =
              (section?.type ?? '').endsWith('.liquid')
                ? section.type
                : `${section?.type ?? ''}.liquid`;
            const normalizedSection =
              st?.replace(/^sections\//, '')?.replace(/\.liquid$/, '') ?? '';
            if (normalizedSection !== sectionType) continue;

            const templateSettings = section?.settings ?? {};
            const matchingSettings = Object.keys(templateSettings).filter(
              (id) => settingIds.has(id)
            );
            if (matchingSettings.length > 0) {
              dependencies.push({
                sourceFileId: templateFile.fileId,
                targetFileId: file.fileId,
                dependencyType: 'schema_setting',
                references: matchingSettings.map((settingId) => ({
                  sourceLocation: { line: 1, column: 1 },
                  symbol: settingId,
                  context: `template section ${key} uses setting ${settingId}`,
                })),
              });
            }
          }
        } catch {
          // ignore invalid JSON
        }
      }
    } catch {
      // ignore invalid schema JSON
    }

    return dependencies;
  }

  /**
   * CSS-to-section mapping: detect {% stylesheet %} tags, map by naming convention,
   * track CSS custom properties.
   */
  private detectCssToSectionMapping(
    file: FileContext,
    allFiles: FileContext[]
  ): FileDependency[] {
    const dependencies: FileDependency[] = [];

    if (file.fileType === 'css') {
      const path = file.fileName.replace(/\\/g, '/');
      const baseName = path.split('/').pop() ?? path;
      const sectionMatch = baseName.match(/^section-(.+)\.css$/);

      if (sectionMatch) {
        const sectionBase = sectionMatch[1] ?? '';
        const sectionPath = `sections/${sectionBase}.liquid`;
        const targetFile = allFiles.find(
          (f) =>
            f.fileType === 'liquid' &&
            f.fileId !== file.fileId &&
            (f.fileName === sectionPath ||
              f.fileName.replace(/\\/g, '/') === sectionPath ||
              f.fileName.endsWith(`/${sectionPath}`))
        );
        if (targetFile) {
          const refs: DependencyReference[] = [
            {
              sourceLocation: { line: 1, column: 1 },
              symbol: sectionPath,
              context: `CSS maps to section by naming convention`,
            },
          ];
          const customPropRegex = /(--[a-zA-Z][a-zA-Z0-9_-]*)\s*:/g;
          let propMatch: RegExpExecArray | null;
          while ((propMatch = customPropRegex.exec(file.content)) !== null) {
            refs.push({
              sourceLocation: this.extractor.getLineNumber(
                file.content,
                propMatch.index
              ),
              symbol: propMatch[1],
              context: `CSS custom property`,
            });
          }
          dependencies.push({
            sourceFileId: file.fileId,
            targetFileId: targetFile.fileId,
            dependencyType: 'css_section',
            references: refs,
          });
        }
      } else if (baseName.endsWith('.css')) {
        const cssClasses = this.extractor.extractCssClasses(file.content);
        for (const liquidFile of allFiles) {
          if (
            liquidFile.fileType !== 'liquid' ||
            liquidFile.fileId === file.fileId
          )
            continue;
          const classRegex = /class=["']([^"']+)["']/g;
          let liquidMatch: RegExpExecArray | null;
          while ((liquidMatch = classRegex.exec(liquidFile.content)) !== null) {
            const usedClasses = liquidMatch[1].split(/\s+/).filter(Boolean);
            const overlap = usedClasses.filter((c) => cssClasses.includes(c));
            if (overlap.length > 0) {
              dependencies.push({
                sourceFileId: file.fileId,
                targetFileId: liquidFile.fileId,
                dependencyType: 'css_section',
                references: [
                  {
                    sourceLocation: { line: 1, column: 1 },
                    symbol: overlap.join(', '),
                    context: `liquid uses classes from this CSS`,
                  },
                ],
              });
              break;
            }
          }
        }
      }
    } else if (file.fileType === 'liquid') {
      const stylesheetRegex =
        /\{%\s*stylesheet\s*%\}([\s\S]*?)\{%\s*endstylesheet\s*%\}/gi;
      let stylesheetMatch: RegExpExecArray | null;

      while ((stylesheetMatch = stylesheetRegex.exec(file.content)) !== null) {
        const inlineCss = stylesheetMatch[1] ?? '';
        const sourceLocation = this.extractor.getLineNumber(
          file.content,
          stylesheetMatch.index
        );

        const refs: DependencyReference[] = [
          {
            sourceLocation,
            symbol: '{% stylesheet %}',
            context: `inline stylesheet block (${inlineCss.length} chars)`,
          },
        ];
        const customPropRegex = /(--[a-zA-Z][a-zA-Z0-9_-]*)\s*:/g;
        let propMatch: RegExpExecArray | null;
        while ((propMatch = customPropRegex.exec(inlineCss)) !== null) {
          refs.push({
            sourceLocation,
            symbol: propMatch[1],
            context: `CSS custom property in stylesheet block`,
          });
        }
        dependencies.push({
          sourceFileId: file.fileId,
          targetFileId: file.fileId,
          dependencyType: 'css_section',
          references: refs,
        });
      }
    }

    return dependencies;
  }

  /**
   * Snippet variable contracts: extract variables from {% render 'name', var: val %},
   * track what snippets expect vs receive.
   */
  private detectSnippetVariableContracts(
    file: FileContext,
    allFiles: FileContext[]
  ): FileDependency[] {
    if (file.fileType !== 'liquid') return [];

    const dependencies: FileDependency[] = [];
    const content = file.content;

    const renderRegex =
      /\{%[-\s]*render\s+['"]([^'"]+)['"]\s*(?:,\s*([^%]+))?\s*%\}/g;
    let match: RegExpExecArray | null;

    while ((match = renderRegex.exec(content)) !== null) {
      const snippetName = match[1];
      const varsBlock = match[2]?.trim() ?? '';

      const targetFile = allFiles.find(
        (f) =>
          f.fileType === 'liquid' &&
          f.fileId !== file.fileId &&
          (f.fileName === snippetName ||
            f.fileName === `${snippetName}.liquid` ||
            f.fileName.endsWith(`/${snippetName}`) ||
            f.fileName.endsWith(`/${snippetName}.liquid`))
      );

      const varNames: string[] = [];
      const varRegex = /([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g;
      let varMatch: RegExpExecArray | null;
      while ((varMatch = varRegex.exec(varsBlock)) !== null) {
        varNames.push(varMatch[1]);
      }

      if (!targetFile) continue;

      if (varNames.length > 0) {
        const sourceLocation = this.extractor.getLineNumber(
          content,
          match.index
        );
        const context = this.extractor.getContextSnippet(
          content,
          match.index,
          match[0].length
        );

        dependencies.push({
          sourceFileId: file.fileId,
          targetFileId: targetFile.fileId,
          dependencyType: 'snippet_variable',
          references: [
            {
              sourceLocation,
              symbol: varNames.join(', '),
              context,
            },
          ],
        });
      }
    }

    return dependencies;
  }

  /**
   * Build reverse index: Map<targetFileId, sourceFileIds[]>.
   * When editing a snippet, AI sees every section that renders it.
   */
  buildReverseIndex(files: FileContext[]): Map<string, string[]> {
    const deps = this.detectDependencies(files);
    const index = new Map<string, string[]>();

    for (const d of deps) {
      if (d.sourceFileId !== d.targetFileId) {
        const existing = index.get(d.targetFileId) ?? [];
        if (!existing.includes(d.sourceFileId)) {
          existing.push(d.sourceFileId);
          index.set(d.targetFileId, existing);
        }
      }
    }

    return index;
  }

  /**
   * Detect JS import dependencies.
   * Matches `import ... from '...'` statements.
   */
  detectJavaScriptDependencies(
    file: FileContext,
    allFiles: FileContext[]
  ): FileDependency[] {
    const dependencies: FileDependency[] = [];
    const content = file.content;

    const importRegex =
      /import\s+(?:(?:\{[^}]*\}|[a-zA-Z_$][a-zA-Z0-9_$]*|\*\s+as\s+[a-zA-Z_$][a-zA-Z0-9_$]*)(?:\s*,\s*(?:\{[^}]*\}|[a-zA-Z_$][a-zA-Z0-9_$]*))?\s+from\s+)?['"]([^'"]+)['"]/g;
    let match: RegExpExecArray | null;

    while ((match = importRegex.exec(content)) !== null) {
      const importPath = match[1];
      // Normalize relative path: strip leading ./ for matching
      const normalizedPath = importPath.replace(/^\.\//, '');
      const targetFile = allFiles.find(
        (f) =>
          f.fileId !== file.fileId &&
          (f.fileName === importPath ||
            f.fileName === normalizedPath ||
            f.fileName.endsWith(`/${importPath}`) ||
            f.fileName.endsWith(`/${normalizedPath}`) ||
            f.fileName === `${normalizedPath}.js` ||
            f.fileName.endsWith(`/${normalizedPath}.js`) ||
            f.fileName === `${normalizedPath}.ts` ||
            f.fileName.endsWith(`/${normalizedPath}.ts`))
      );

      if (targetFile) {
        const sourceLocation = this.extractor.getLineNumber(
          content,
          match.index
        );
        const context = this.extractor.getContextSnippet(
          content,
          match.index,
          match[0].length
        );

        dependencies.push({
          sourceFileId: file.fileId,
          targetFileId: targetFile.fileId,
          dependencyType: 'js_import',
          references: [
            {
              sourceLocation,
              symbol: importPath,
              context,
            },
          ],
        });
      }
    }

    return dependencies;
  }

  /**
   * Detect CSS @import dependencies.
   * Matches `@import '...'` and `@import url('...')`.
   */
  detectCssDependencies(
    file: FileContext,
    allFiles: FileContext[]
  ): FileDependency[] {
    const dependencies: FileDependency[] = [];
    const content = file.content;

    const importRegex =
      /@import\s+(?:url\(\s*)?['"]([^'"]+)['"]\s*\)?/g;
    let match: RegExpExecArray | null;

    while ((match = importRegex.exec(content)) !== null) {
      const importPath = match[1];
      const targetFile = allFiles.find(
        (f) =>
          f.fileId !== file.fileId &&
          (f.fileName === importPath ||
            f.fileName.endsWith(`/${importPath}`) ||
            f.fileName === `${importPath}.css` ||
            f.fileName.endsWith(`/${importPath}.css`))
      );

      if (targetFile) {
        const sourceLocation = this.extractor.getLineNumber(
          content,
          match.index
        );
        const context = this.extractor.getContextSnippet(
          content,
          match.index,
          match[0].length
        );

        dependencies.push({
          sourceFileId: file.fileId,
          targetFileId: targetFile.fileId,
          dependencyType: 'css_import',
          references: [
            {
              sourceLocation,
              symbol: importPath,
              context,
            },
          ],
        });
      }
    }

    dependencies.push(...this.detectCssToSectionMapping(file, allFiles));

    return dependencies;
  }
}
