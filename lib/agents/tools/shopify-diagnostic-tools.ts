/**
 * Shopify Diagnostic Tools — E3
 *
 * Three diagnostic tools for debugging Shopify theme rendering issues:
 * 1. traceRenderingChain — maps symptom → file chain
 * 2. checkThemeSetting — audits a single setting across schema, data, and Liquid
 * 3. diagnoseVisibility — checks CSS + Liquid + settings for "not showing" bugs
 */

// ── Types ──────────────────────────────────────────────────────────────

export interface RenderingChainResult {
  chain: Array<{
    layer: 'layout' | 'template' | 'section' | 'snippet' | 'asset';
    file: string;
    role: string;
    relevance: 'high' | 'medium' | 'low';
  }>;
  suggestedChecks: string[];
}

export interface SettingCheckResult {
  existsInSchema: boolean;
  schemaFile: string;
  schemaType?: string;
  schemaDefault?: unknown;
  currentValue?: unknown;
  referencedIn: Array<{ file: string; line: number }>;
  diagnosis: string;
}

export interface VisibilityDiagnosis {
  cssCheck: { hidden: boolean; rule?: string; file?: string; line?: number } | null;
  liquidCheck: { conditional?: string; evaluatesTo?: boolean; file?: string; line?: number } | null;
  settingsCheck: Record<string, { value: unknown; source: string }>;
  suggestedFix: string;
  diagnosis: string;
}

// ── Constants ──────────────────────────────────────────────────────────

const PAGE_KEYWORDS: Record<string, string[]> = {
  'templates/product.json': ['product', 'pdp', 'add to cart', 'variant', 'price', 'buy'],
  'templates/collection.json': ['collection', 'catalog', 'products', 'grid', 'filter'],
  'templates/cart.json': ['cart', 'checkout', 'quantity', 'mini-cart', 'drawer'],
  'templates/index.json': ['home', 'homepage', 'hero', 'banner', 'landing'],
  'templates/blog.json': ['blog', 'article', 'post'],
  'templates/page.json': ['page', 'about', 'contact'],
};

const SYMPTOM_CHECKS: Record<string, string[]> = {
  'not showing': [
    'Check CSS for display:none, opacity:0, visibility:hidden, height:0',
    'Check Liquid conditionals wrapping the element ({% if settings.show_X %})',
    'Check settings_data.json for feature toggles that may be disabled',
    'Check JS lazy-loaders or sliders that may fail to initialize',
    'Check asset_url references for 404s (wrong filename or missing file)',
  ],
  broken: [
    'Check browser console for JS errors',
    'Check for missing JS/CSS dependencies (jQuery, slider libs)',
    'Check Liquid syntax: unclosed tags, wrong variable scope',
    'Check JSON syntax in template and schema files',
  ],
  wrong: [
    'Check Liquid variable assignments ({% assign %}, {% capture %})',
    'Check section schema settings and their defaults',
    'Check for incorrect forloop variable names',
    'Check locale/translation keys if text is wrong',
  ],
  slow: [
    'Check for synchronous script_tag loads in layout/theme.liquid',
    'Check for unoptimized image_url calls (missing width parameter)',
    'Check for excessive Liquid loops or nested includes',
  ],
  flickering: [
    'Check JS that manipulates display/opacity after page load',
    'Check CSS transitions that may fire before content is ready',
    'Check lazy-load libraries (lazySizes, lozad) configuration',
  ],
};

const CSS_HIDING_PATTERNS = [
  { regex: /display\s*:\s*none/gi, rule: 'display:none' },
  { regex: /opacity\s*:\s*0(?!\.\d)/gi, rule: 'opacity:0' },
  { regex: /visibility\s*:\s*hidden/gi, rule: 'visibility:hidden' },
  { regex: /height\s*:\s*0(?:px)?(?:\s*!important)?(?:\s*;|\s*})/gi, rule: 'height:0' },
  { regex: /max-height\s*:\s*0(?:px)?/gi, rule: 'max-height:0' },
  { regex: /overflow\s*:\s*hidden/gi, rule: 'overflow:hidden' },
  { regex: /clip-path\s*:\s*inset\(50%\)/gi, rule: 'clip-path:inset(50%)' },
  { regex: /position\s*:\s*absolute[^}]*left\s*:\s*-\d+/gi, rule: 'off-screen positioning' },
];

// ── Helpers ────────────────────────────────────────────────────────────

type ThemeFile = { path: string; content: string };

function extractKeywords(symptom: string): string[] {
  return symptom.toLowerCase().split(/\s+/).filter(w => w.length > 2);
}

function matchesTemplate(symptomWords: string[]): string[] {
  const matched: string[] = [];
  for (const [template, keywords] of Object.entries(PAGE_KEYWORDS)) {
    for (const kw of keywords) {
      if (symptomWords.some(w => kw.includes(w) || w.includes(kw))) {
        matched.push(template);
        break;
      }
    }
  }
  return matched;
}

function findFile(files: ThemeFile[], partialPath: string): ThemeFile | undefined {
  return files.find(
    f => f.path === partialPath || f.path.endsWith(`/${partialPath}`) || f.path.endsWith(partialPath),
  );
}

function findFilesByGlob(files: ThemeFile[], pattern: string): ThemeFile[] {
  const prefix = pattern.replace('*', '');
  return files.filter(f => f.path.startsWith(prefix) || f.path.includes(prefix));
}

function extractSectionsFromTemplate(templateContent: string): string[] {
  const sections: string[] = [];
  try {
    const json = JSON.parse(templateContent);
    const order: string[] = json.order ?? [];
    const sectionMap: Record<string, { type?: string }> = json.sections ?? {};
    for (const key of order) {
      const sec = sectionMap[key];
      if (sec?.type) sections.push(sec.type);
    }
    if (sections.length === 0) {
      for (const sec of Object.values(sectionMap)) {
        if (sec?.type) sections.push(sec.type);
      }
    }
  } catch {
    // Not valid JSON — try Liquid section tags
    const re = /\{%[-\s]*section\s+['"]([^'"]+)['"]/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(templateContent)) !== null) {
      sections.push(m[1]);
    }
  }
  return sections;
}

function extractRenderReferences(liquidContent: string): string[] {
  const refs: string[] = [];
  const re = /\{%[-\s]*render\s+['"]([^'"]+)['"]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(liquidContent)) !== null) {
    refs.push(m[1]);
  }
  const includeRe = /\{%[-\s]*include\s+['"]([^'"]+)['"]/g;
  while ((m = includeRe.exec(liquidContent)) !== null) {
    refs.push(m[1]);
  }
  return [...new Set(refs)];
}

function findRelatedAssets(files: ThemeFile[], sectionName: string): ThemeFile[] {
  const baseName = sectionName.replace(/^(main-|featured-|custom-)/, '').replace(/\.liquid$/, '');
  return files.filter(f => {
    if (!f.path.startsWith('assets/') && !f.path.includes('/assets/')) return false;
    const fileName = f.path.split('/').pop() ?? '';
    return (
      fileName.includes(baseName) ||
      fileName.includes(sectionName.replace('.liquid', ''))
    );
  });
}

function getSymptomType(symptom: string): string {
  const lower = symptom.toLowerCase();
  if (lower.includes('not showing') || lower.includes('missing') || lower.includes('invisible') || lower.includes('disappeared') || lower.includes('hidden') || lower.includes("can't see") || lower.includes('not visible') || lower.includes('not appearing')) return 'not showing';
  if (lower.includes('broken') || lower.includes('error') || lower.includes('crash') || lower.includes('not working') || lower.includes('failed')) return 'broken';
  if (lower.includes('wrong') || lower.includes('incorrect') || lower.includes('unexpected') || lower.includes('instead of')) return 'wrong';
  if (lower.includes('slow') || lower.includes('performance') || lower.includes('loading')) return 'slow';
  if (lower.includes('flicker') || lower.includes('flash') || lower.includes('blink')) return 'flickering';
  return 'broken';
}

function selectorToClassOrId(selector: string): string[] {
  const tokens: string[] = [];
  const classRe = /\.([a-zA-Z_-][\w-]*)/g;
  const idRe = /#([a-zA-Z_-][\w-]*)/g;
  let m: RegExpExecArray | null;
  while ((m = classRe.exec(selector)) !== null) tokens.push(m[1]);
  while ((m = idRe.exec(selector)) !== null) tokens.push(m[1]);
  if (tokens.length === 0) tokens.push(selector.replace(/[^a-zA-Z0-9_-]/g, ''));
  return tokens;
}

// ── Tool 1: traceRenderingChain ────────────────────────────────────────

export function traceRenderingChain(
  symptom: string,
  allFiles: ThemeFile[],
): RenderingChainResult {
  const chain: RenderingChainResult['chain'] = [];
  const symptomWords = extractKeywords(symptom);
  const symptomType = getSymptomType(symptom);

  // Layout is always in the chain
  const layout = findFile(allFiles, 'layout/theme.liquid');
  if (layout) {
    chain.push({ layer: 'layout', file: layout.path, role: 'Global wrapper', relevance: 'low' });
  }

  // Identify template(s) from keywords
  const templates = matchesTemplate(symptomWords);
  if (templates.length === 0) {
    templates.push('templates/index.json');
  }

  const allSections: string[] = [];
  for (const tmplPath of templates) {
    const tmplFile = findFile(allFiles, tmplPath);
    // Fall back to .liquid if .json not found
    const liquidPath = tmplPath.replace('.json', '.liquid');
    const file = tmplFile ?? findFile(allFiles, liquidPath);
    if (file) {
      chain.push({ layer: 'template', file: file.path, role: `Page template`, relevance: 'high' });
      const sections = extractSectionsFromTemplate(file.content);
      allSections.push(...sections);
    }
  }

  // Trace sections → snippets → assets
  const processedSnippets = new Set<string>();
  for (const sectionType of [...new Set(allSections)]) {
    const sectionFile = findFile(allFiles, `sections/${sectionType}.liquid`);
    if (sectionFile) {
      chain.push({
        layer: 'section',
        file: sectionFile.path,
        role: `Section: ${sectionType}`,
        relevance: 'high',
      });

      const snippetRefs = extractRenderReferences(sectionFile.content);
      for (const ref of snippetRefs) {
        if (processedSnippets.has(ref)) continue;
        processedSnippets.add(ref);
        const snippetFile = findFile(allFiles, `snippets/${ref}.liquid`);
        if (snippetFile) {
          chain.push({
            layer: 'snippet',
            file: snippetFile.path,
            role: `Snippet rendered by ${sectionType}`,
            relevance: 'medium',
          });
        }
      }

      const assets = findRelatedAssets(allFiles, sectionType);
      for (const asset of assets) {
        chain.push({
          layer: 'asset',
          file: asset.path,
          role: `Asset related to ${sectionType}`,
          relevance: 'medium',
        });
      }
    }
  }

  // Also check for keyword matches in snippet/asset file names
  for (const word of symptomWords) {
    if (word.length < 4) continue;
    for (const f of allFiles) {
      const fileName = f.path.split('/').pop() ?? '';
      if (!fileName.includes(word)) continue;
      if (chain.some(c => c.file === f.path)) continue;

      if (f.path.startsWith('snippets/') || f.path.includes('/snippets/')) {
        chain.push({ layer: 'snippet', file: f.path, role: `Name matches "${word}"`, relevance: 'low' });
      } else if (f.path.startsWith('assets/') || f.path.includes('/assets/')) {
        chain.push({ layer: 'asset', file: f.path, role: `Name matches "${word}"`, relevance: 'low' });
      }
    }
  }

  const suggestedChecks = SYMPTOM_CHECKS[symptomType] ?? SYMPTOM_CHECKS['broken'];

  return { chain, suggestedChecks };
}

// ── Tool 2: checkThemeSetting ──────────────────────────────────────────

export function checkThemeSetting(
  settingId: string,
  allFiles: ThemeFile[],
): SettingCheckResult {
  let existsInSchema = false;
  let schemaFile = '';
  let schemaType: string | undefined;
  let schemaDefault: unknown;
  let currentValue: unknown;
  const referencedIn: Array<{ file: string; line: number }> = [];

  // 1. Search settings_schema.json
  const settingsSchema = findFile(allFiles, 'config/settings_schema.json');
  if (settingsSchema) {
    try {
      const schema = JSON.parse(settingsSchema.content);
      for (const group of schema) {
        const settings: Array<{ id?: string; type?: string; default?: unknown }> = group.settings ?? [];
        for (const s of settings) {
          if (s.id === settingId) {
            existsInSchema = true;
            schemaFile = settingsSchema.path;
            schemaType = s.type;
            schemaDefault = s.default;
            break;
          }
        }
        if (existsInSchema) break;
      }
    } catch { /* invalid JSON */ }
  }

  // Also check section schemas for section-level settings
  if (!existsInSchema) {
    for (const f of allFiles) {
      if (!f.path.includes('sections/') || !f.path.endsWith('.liquid')) continue;
      const schemaMatch = f.content.match(/\{%[-\s]*schema[-\s]*%\}([\s\S]*?)\{%[-\s]*endschema[-\s]*%\}/);
      if (!schemaMatch) continue;
      try {
        const sectionSchema = JSON.parse(schemaMatch[1]);
        const settings: Array<{ id?: string; type?: string; default?: unknown }> = sectionSchema.settings ?? [];
        for (const s of settings) {
          if (s.id === settingId) {
            existsInSchema = true;
            schemaFile = f.path;
            schemaType = s.type;
            schemaDefault = s.default;
            break;
          }
        }
        // Also check block settings
        if (!existsInSchema && Array.isArray(sectionSchema.blocks)) {
          for (const block of sectionSchema.blocks) {
            for (const s of (block.settings ?? [])) {
              if (s.id === settingId) {
                existsInSchema = true;
                schemaFile = f.path;
                schemaType = s.type;
                schemaDefault = s.default;
                break;
              }
            }
            if (existsInSchema) break;
          }
        }
      } catch { /* invalid schema JSON */ }
      if (existsInSchema) break;
    }
  }

  // 2. Search settings_data.json for current value
  const settingsData = findFile(allFiles, 'config/settings_data.json');
  if (settingsData) {
    try {
      const data = JSON.parse(settingsData.content);
      const current = data.current ?? data;
      if (current && settingId in current) {
        currentValue = current[settingId];
      }
      // Deep search in sections
      if (currentValue === undefined && current?.sections) {
        for (const section of Object.values(current.sections) as Array<Record<string, unknown>>) {
          const sectionSettings = section?.settings as Record<string, unknown> | undefined;
          if (sectionSettings && settingId in sectionSettings) {
            currentValue = sectionSettings[settingId];
            break;
          }
        }
      }
    } catch { /* invalid JSON */ }
  }

  // 3. Grep .liquid files for references
  const settingPatterns = [
    new RegExp(`settings\\.${settingId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'g'),
    new RegExp(`section\\.settings\\.${settingId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'g'),
    new RegExp(`block\\.settings\\.${settingId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'g'),
  ];

  for (const f of allFiles) {
    if (!f.path.endsWith('.liquid')) continue;
    const lines = f.content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      for (const pattern of settingPatterns) {
        pattern.lastIndex = 0;
        if (pattern.test(lines[i])) {
          referencedIn.push({ file: f.path, line: i + 1 });
          break;
        }
      }
    }
  }

  // 4. Generate diagnosis
  let diagnosis: string;
  if (existsInSchema && referencedIn.length > 0) {
    if (currentValue !== undefined) {
      const isFalsy = currentValue === false || currentValue === '' || currentValue === null || currentValue === 0;
      diagnosis = isFalsy
        ? `Setting "${settingId}" exists and is currently disabled/empty (value: ${JSON.stringify(currentValue)}). Referenced in ${referencedIn.length} file(s).`
        : `Setting "${settingId}" exists and is enabled (value: ${JSON.stringify(currentValue)}). Referenced in ${referencedIn.length} file(s).`;
    } else {
      diagnosis = `Setting "${settingId}" exists in schema (type: ${schemaType}, default: ${JSON.stringify(schemaDefault)}) but has no explicit value in settings_data.json. The default will be used. Referenced in ${referencedIn.length} file(s).`;
    }
  } else if (existsInSchema && referencedIn.length === 0) {
    diagnosis = `Setting "${settingId}" exists in schema (${schemaFile}) but is never referenced in any Liquid file (orphaned setting).`;
  } else if (!existsInSchema && referencedIn.length > 0) {
    diagnosis = `Setting "${settingId}" is referenced in ${referencedIn.length} Liquid file(s) but is missing from all schemas. This will always evaluate to nil/false.`;
  } else {
    diagnosis = `Setting "${settingId}" was not found in any schema or Liquid file.`;
  }

  return { existsInSchema, schemaFile, schemaType, schemaDefault, currentValue, referencedIn, diagnosis };
}

// ── Tool 3: diagnoseVisibility ─────────────────────────────────────────

export function diagnoseVisibility(
  elementSelector: string,
  pageType: string,
  allFiles: ThemeFile[],
): VisibilityDiagnosis {
  let cssCheck: VisibilityDiagnosis['cssCheck'] = null;
  let liquidCheck: VisibilityDiagnosis['liquidCheck'] = null;
  const settingsCheck: Record<string, { value: unknown; source: string }> = {};
  const issues: string[] = [];

  const searchTokens = selectorToClassOrId(elementSelector);

  // 1. CSS check — search assets for hiding rules targeting the selector
  const cssFiles = allFiles.filter(
    f => f.path.endsWith('.css') || f.path.endsWith('.scss') || f.path.endsWith('.css.liquid'),
  );
  for (const f of cssFiles) {
    const lines = f.content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineContainsSelector = searchTokens.some(token => line.includes(token));
      if (!lineContainsSelector) continue;

      // Scan the surrounding block (up to 10 lines after) for hiding rules
      const blockEnd = Math.min(i + 10, lines.length);
      const block = lines.slice(i, blockEnd).join('\n');
      for (const pattern of CSS_HIDING_PATTERNS) {
        pattern.regex.lastIndex = 0;
        if (pattern.regex.test(block)) {
          cssCheck = { hidden: true, rule: pattern.rule, file: f.path, line: i + 1 };
          issues.push(`CSS hiding rule "${pattern.rule}" found in ${f.path}:${i + 1}`);
          break;
        }
      }
      if (cssCheck) break;
    }
    if (cssCheck) break;
  }
  if (!cssCheck) {
    cssCheck = { hidden: false };
  }

  // 2. Liquid check — search for conditionals wrapping the element
  const templatePath = `templates/${pageType}.json`;
  const tmpl = findFile(allFiles, templatePath) ?? findFile(allFiles, templatePath.replace('.json', '.liquid'));
  const sectionTypes: string[] = [];
  if (tmpl) {
    sectionTypes.push(...extractSectionsFromTemplate(tmpl.content));
  }

  const liquidFiles = [
    ...sectionTypes.map(s => findFile(allFiles, `sections/${s}.liquid`)).filter(Boolean) as ThemeFile[],
    ...allFiles.filter(f => f.path.endsWith('.liquid') && (f.path.includes('snippets/') || f.path.includes('layout/'))),
  ];

  for (const f of liquidFiles) {
    const lines = f.content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const hasSelector = searchTokens.some(token => line.includes(token));
      if (!hasSelector) continue;

      // Look backwards for the nearest {% if %} conditional
      for (let j = i - 1; j >= Math.max(0, i - 15); j--) {
        const prevLine = lines[j];
        const ifMatch = prevLine.match(/\{%[-\s]*if\s+(.*?)[-\s]*%\}/);
        if (ifMatch) {
          const conditional = ifMatch[1].trim();
          liquidCheck = { conditional, file: f.path, line: j + 1 };

          // Check if the conditional references a setting
          const settingMatch = conditional.match(/settings\.(\w+)/);
          if (settingMatch) {
            const settingId = settingMatch[1];
            const settingResult = checkThemeSetting(settingId, allFiles);
            settingsCheck[settingId] = {
              value: settingResult.currentValue ?? settingResult.schemaDefault ?? null,
              source: settingResult.schemaFile || 'settings_data.json',
            };
            const val = settingResult.currentValue ?? settingResult.schemaDefault;
            const isFalsy = val === false || val === '' || val === null || val === undefined || val === 0;
            if (isFalsy) {
              liquidCheck.evaluatesTo = false;
              issues.push(`Liquid conditional "${conditional}" at ${f.path}:${j + 1} evaluates to false (setting "${settingId}" = ${JSON.stringify(val)})`);
            } else {
              liquidCheck.evaluatesTo = true;
            }
          }
          break;
        }
        // Stop if we hit an endif (different block)
        if (prevLine.includes('endif')) break;
      }
      if (liquidCheck) break;
    }
    if (liquidCheck) break;
  }

  // 3. Settings check — look for any settings mentioning "show" or "enable" + the element
  const settingsData = findFile(allFiles, 'config/settings_data.json');
  if (settingsData) {
    try {
      const data = JSON.parse(settingsData.content);
      const current = data.current ?? data;
      for (const token of searchTokens) {
        const normalizedToken = token.replace(/-/g, '_');
        for (const key of Object.keys(current)) {
          if (key.includes(normalizedToken) && (key.includes('show') || key.includes('enable') || key.includes('visible'))) {
            settingsCheck[key] = { value: current[key], source: 'config/settings_data.json' };
            if (!current[key]) {
              issues.push(`Setting "${key}" is ${JSON.stringify(current[key])} in settings_data.json`);
            }
          }
        }
      }
    } catch { /* invalid JSON */ }
  }

  // Build diagnosis and suggested fix
  const diagnosis = issues.length > 0
    ? `Found ${issues.length} potential cause(s):\n${issues.map((iss, i) => `${i + 1}. ${iss}`).join('\n')}`
    : `No obvious hiding causes found for "${elementSelector}" on ${pageType} page. Check JS lazy-loaders, third-party scripts, or browser-specific issues.`;

  let suggestedFix: string;
  if (cssCheck?.hidden && cssCheck.file) {
    suggestedFix = `Remove or override "${cssCheck.rule}" in ${cssCheck.file}:${cssCheck.line}`;
  } else if (liquidCheck?.evaluatesTo === false && liquidCheck.conditional) {
    const settingMatch = liquidCheck.conditional.match(/settings\.(\w+)/);
    suggestedFix = settingMatch
      ? `Enable setting "${settingMatch[1]}" in the theme customizer, or set it to true in settings_data.json`
      : `Review the conditional "{% if ${liquidCheck.conditional} %}" at ${liquidCheck.file}:${liquidCheck.line}`;
  } else if (issues.length > 0) {
    suggestedFix = `Address the issues listed in the diagnosis above, starting with the first one.`;
  } else {
    suggestedFix = `Use browser DevTools to inspect the element and check computed styles. Also check the browser console for JS errors that may prevent rendering.`;
  }

  return { cssCheck, liquidCheck, settingsCheck, suggestedFix, diagnosis };
}

// ── Formatting helpers (for tool executor output) ──────────────────────

export function formatRenderingChainResult(result: RenderingChainResult): string {
  const lines: string[] = ['## Rendering Chain\n'];

  if (result.chain.length === 0) {
    lines.push('No files found in the rendering chain.');
  } else {
    for (const entry of result.chain) {
      const relevanceTag = entry.relevance === 'high' ? '🔴' : entry.relevance === 'medium' ? '🟡' : '⚪';
      lines.push(`${relevanceTag} **[${entry.layer}]** \`${entry.file}\` — ${entry.role}`);
    }
  }

  if (result.suggestedChecks.length > 0) {
    lines.push('\n## Suggested Checks\n');
    for (const check of result.suggestedChecks) {
      lines.push(`- ${check}`);
    }
  }

  return lines.join('\n');
}

export function formatSettingCheckResult(result: SettingCheckResult): string {
  const lines: string[] = ['## Setting Check\n'];
  lines.push(`**Exists in schema:** ${result.existsInSchema ? 'Yes' : 'No'}`);
  if (result.schemaFile) lines.push(`**Schema file:** \`${result.schemaFile}\``);
  if (result.schemaType) lines.push(`**Type:** ${result.schemaType}`);
  if (result.schemaDefault !== undefined) lines.push(`**Default:** ${JSON.stringify(result.schemaDefault)}`);
  if (result.currentValue !== undefined) lines.push(`**Current value:** ${JSON.stringify(result.currentValue)}`);
  lines.push(`**Referenced in:** ${result.referencedIn.length} file(s)`);
  if (result.referencedIn.length > 0) {
    for (const ref of result.referencedIn.slice(0, 10)) {
      lines.push(`  - \`${ref.file}\`:${ref.line}`);
    }
    if (result.referencedIn.length > 10) lines.push(`  ... and ${result.referencedIn.length - 10} more`);
  }
  lines.push(`\n**Diagnosis:** ${result.diagnosis}`);
  return lines.join('\n');
}

export function formatVisibilityDiagnosis(result: VisibilityDiagnosis): string {
  const lines: string[] = ['## Visibility Diagnosis\n'];

  lines.push('### CSS Check');
  if (result.cssCheck?.hidden) {
    lines.push(`⚠️ Hidden by **${result.cssCheck.rule}** in \`${result.cssCheck.file}\`:${result.cssCheck.line}`);
  } else {
    lines.push('✅ No CSS hiding rules found');
  }

  lines.push('\n### Liquid Check');
  if (result.liquidCheck?.conditional) {
    const evalStr = result.liquidCheck.evaluatesTo === false ? '❌ evaluates to false' : result.liquidCheck.evaluatesTo === true ? '✅ evaluates to true' : '❓ unknown';
    lines.push(`Conditional: \`{% if ${result.liquidCheck.conditional} %}\` at \`${result.liquidCheck.file}\`:${result.liquidCheck.line} — ${evalStr}`);
  } else {
    lines.push('No wrapping conditional found');
  }

  const settingKeys = Object.keys(result.settingsCheck);
  if (settingKeys.length > 0) {
    lines.push('\n### Settings');
    for (const key of settingKeys) {
      const s = result.settingsCheck[key];
      lines.push(`- \`${key}\` = ${JSON.stringify(s.value)} (from ${s.source})`);
    }
  }

  lines.push(`\n### Diagnosis\n${result.diagnosis}`);
  lines.push(`\n### Suggested Fix\n${result.suggestedFix}`);
  return lines.join('\n');
}
