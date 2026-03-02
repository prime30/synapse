import type { ToolRegistry } from './registry.js';
import { readThemeFiles, readThemeFile } from '../local/file-reader.js';
import { logger } from '../logger.js';

function ok(data: unknown) {
  return { content: [{ type: 'text' as const, text: typeof data === 'string' ? data : JSON.stringify(data, null, 2) }] };
}

function err(message: string) {
  return { content: [{ type: 'text' as const, text: JSON.stringify({ error: message }) }], isError: true as const };
}

async function sidecarGet(sidecarUrl: string, path: string): Promise<unknown> {
  const res = await fetch(`${sidecarUrl}${path}`);
  if (!res.ok) throw new Error(`Sidecar returned ${res.status}: ${await res.text()}`);
  return res.json();
}

async function sidecarPost(sidecarUrl: string, path: string, body: unknown): Promise<unknown> {
  const res = await fetch(`${sidecarUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Sidecar returned ${res.status}: ${await res.text()}`);
  return res.json();
}

function sidecarUnavailableMessage(): string {
  return 'Preview sidecar is not running. Start it with: synapse-theme dev';
}

function isSidecarError(e: unknown): boolean {
  if (e instanceof TypeError && String(e).includes('fetch')) return true;
  if (e instanceof Error && /ECONNREFUSED|ENOTFOUND|EHOSTUNREACH|fetch failed/.test(e.message)) return true;
  return false;
}

// --- File-based analysis helpers ---

interface VisibilityHypothesis {
  category: 'css_visibility' | 'liquid_rendering' | 'js_interference' | 'asset_loading';
  file: string;
  line: number;
  detail: string;
}

function diagnoseSelector(workspacePath: string, selector: string): VisibilityHypothesis[] {
  const hypotheses: VisibilityHypothesis[] = [];
  const files = readThemeFiles(workspacePath);

  const selectorParts = selector.replace(/^[.#]/, '').split(/[.#\s>+~[\]:]/);
  const keywords = selectorParts.filter(Boolean);

  for (const file of files) {
    const lines = file.content.split('\n');

    if (file.path.endsWith('.css') || file.path.endsWith('.scss')) {
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const hasSelector = keywords.some((kw) => line.includes(kw));
        if (!hasSelector) continue;

        if (/display\s*:\s*none/.test(line) || /visibility\s*:\s*hidden/.test(line) ||
            /opacity\s*:\s*0\b/.test(line) || /height\s*:\s*0\b/.test(line)) {
          hypotheses.push({
            category: 'css_visibility',
            file: file.path,
            line: i + 1,
            detail: line.trim(),
          });
        }
      }
    }

    if (file.path.endsWith('.liquid')) {
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const hasSelector = keywords.some((kw) => line.includes(kw));
        if (!hasSelector) continue;

        if (/{%[-\s]*(?:if|unless|case)\b/.test(line) || /{%[-\s]*(?:else|elsif)\b/.test(line)) {
          hypotheses.push({
            category: 'liquid_rendering',
            file: file.path,
            line: i + 1,
            detail: line.trim(),
          });
        }
      }
    }

    if (file.path.endsWith('.js')) {
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const hasSelector = keywords.some((kw) => line.includes(kw));
        if (!hasSelector) continue;

        if (/\.style\./.test(line) || /\.classList\./.test(line) || /\.hidden\b/.test(line) ||
            /display\s*=/.test(line) || /visibility\s*=/.test(line) || /opacity\s*=/.test(line) ||
            /\.remove\(\)/.test(line) || /\.removeChild\(/.test(line)) {
          hypotheses.push({
            category: 'js_interference',
            file: file.path,
            line: i + 1,
            detail: line.trim(),
          });
        }
      }
    }
  }

  return hypotheses;
}

interface VariantAnalysis {
  variantSelectors: Array<{ file: string; line: number; snippet: string }>;
  optionHandling: Array<{ file: string; line: number; snippet: string }>;
  priceUpdates: Array<{ file: string; line: number; snippet: string }>;
}

function analyzeVariants(workspacePath: string): VariantAnalysis {
  const files = readThemeFiles(workspacePath);
  const analysis: VariantAnalysis = { variantSelectors: [], optionHandling: [], priceUpdates: [] };

  const productFiles = files.filter((f) =>
    /product/.test(f.path) || f.path.startsWith('sections/') || f.path.startsWith('snippets/') || f.path.startsWith('assets/')
  );

  for (const file of productFiles) {
    const lines = file.content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;

      if (/variant[-_]?select|variant[-_]?picker|option[-_]?select|variant-radios|variant-selects/i.test(line)) {
        analysis.variantSelectors.push({ file: file.path, line: lineNum, snippet: line.trim().slice(0, 120) });
      }

      if (/selected_or_first_available_variant|current_variant|option_selection|option\.values/i.test(line) ||
          /product\.options|variant\.option[123]/i.test(line)) {
        analysis.optionHandling.push({ file: file.path, line: lineNum, snippet: line.trim().slice(0, 120) });
      }

      if (/variant\.price|variant\.compare_at_price|price[-_]?update|updatePrice|\.price\b.*variant/i.test(line)) {
        analysis.priceUpdates.push({ file: file.path, line: lineNum, snippet: line.trim().slice(0, 120) });
      }
    }
  }

  return analysis;
}

interface PerformanceIssue {
  file: string;
  line: number;
  severity: 'error' | 'warning' | 'info';
  message: string;
}

function checkPerformance(workspacePath: string, filterFiles?: string[]): PerformanceIssue[] {
  const files = filterFiles
    ? filterFiles.map((f) => readThemeFile(workspacePath, f)).filter(Boolean) as Array<{ path: string; content: string }>
    : readThemeFiles(workspacePath);

  const issues: PerformanceIssue[] = [];

  for (const file of files) {
    const lines = file.content.split('\n');

    if (file.path.endsWith('.liquid')) {
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const lineNum = i + 1;

        if (/<img\b/.test(line) && !/width=/.test(line)) {
          issues.push({ file: file.path, line: lineNum, severity: 'warning', message: 'Image tag missing width attribute — causes layout shift' });
        }

        if (/<img\b/.test(line) && !/loading\s*=\s*["']lazy["']/.test(line) && !/eager/.test(line)) {
          issues.push({ file: file.path, line: lineNum, severity: 'info', message: 'Image tag missing lazy loading attribute' });
        }

        if (/{%[-\s]*for\b/.test(line) && /product\.images|collection\.products|all_products/.test(line) && !/limit/.test(line)) {
          issues.push({ file: file.path, line: lineNum, severity: 'warning', message: 'Unbounded loop — consider adding a limit filter' });
        }
      }
    }

    if (file.path.endsWith('.liquid') || file.path.endsWith('.html')) {
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const lineNum = i + 1;

        if (/<script\b/.test(line) && !/async/.test(line) && !/defer/.test(line) && !/type\s*=\s*["']application\/json["']/.test(line)) {
          issues.push({ file: file.path, line: lineNum, severity: 'warning', message: 'Render-blocking script — consider adding async or defer' });
        }
      }
    }
  }

  return issues;
}

// --- Tool registration ---

export function registerLocalPreviewTools(registry: ToolRegistry, sidecarUrl: string, workspacePath?: string): void {

  registry.register({
    definition: {
      name: 'shopify_preview_snapshot',
      description: 'Get a snapshot of the current Shopify preview page — URL, title, and basic page info. Use this to see what page the user has open.',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
    async handler() {
      try {
        const data = await sidecarGet(sidecarUrl, '/context/snapshot');
        return ok(data);
      } catch (e) {
        if (isSidecarError(e)) return err(sidecarUnavailableMessage());
        logger.error('shopify_preview_snapshot failed', e);
        return err(String(e));
      }
    },
  });

  registry.register({
    definition: {
      name: 'shopify_preview_inspect',
      description: 'Get details of the last selected element in the Shopify preview — tag, classes, computed styles, bounding rect, and source trace. The user Alt+clicks an element in the preview to select it.',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
    async handler() {
      try {
        const data = await sidecarGet(sidecarUrl, '/context/current');
        return ok(data);
      } catch (e) {
        if (isSidecarError(e)) return err(sidecarUnavailableMessage());
        logger.error('shopify_preview_inspect failed', e);
        return err(String(e));
      }
    },
  });

  registry.register({
    definition: {
      name: 'shopify_get_preview_context',
      description: 'Get what the user is looking at in the Shopify preview. Call this when the user references a visual issue or says "fix this" without specifying a file. Returns the selected element, source file trace, and page URL.',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
    async handler() {
      try {
        const snapshot = await sidecarGet(sidecarUrl, '/context/snapshot') as { url?: string; title?: string } | null;
        const element = await sidecarGet(sidecarUrl, '/context/current') as {
          empty?: boolean;
          tag?: string;
          id?: string;
          classes?: string[];
          text?: string;
          selector?: string;
          styles?: Record<string, string>;
          rect?: { top: number; left: number; width: number; height: number };
          sourceTrace?: Array<{ file: string; line: number; context: string }>;
        } | null;

        let output = 'Preview Context:\n';
        output += `- Page: ${snapshot?.url ?? 'unknown'}\n`;

        if (element && !element.empty) {
          const tag = element.tag ?? 'unknown';
          const classes = element.classes?.join('.') ?? '';
          output += `- Selected element: ${tag}${classes ? '.' + classes : ''}`;
          if (element.id) output += ` #${element.id}`;
          output += '\n';
          if (element.selector) output += `- Selector: ${element.selector}\n`;
          if (element.text) output += `- Text: "${element.text.slice(0, 80)}"\n`;
          if (element.rect) output += `- Position: top=${element.rect.top} left=${element.rect.left} ${element.rect.width}x${element.rect.height}\n`;
          if (element.styles) {
            const relevant = Object.entries(element.styles).filter(([, v]) => v !== '');
            if (relevant.length > 0) output += `- Styles: ${relevant.map(([k, v]) => `${k}: ${v}`).join('; ')}\n`;
          }

          if (element.sourceTrace && element.sourceTrace.length > 0) {
            output += '- Source files (matched by class names):\n';
            for (const entry of element.sourceTrace) {
              output += `    ${entry.file}:${entry.line}\n`;
              if (entry.context) output += `      ${entry.context.split('\n')[0].trim()}\n`;
            }
          }
        } else {
          output += '- Selected element: none (user can Alt+click in preview to select an element)\n';
        }

        return ok(output);
      } catch (e) {
        if (isSidecarError(e)) return err(sidecarUnavailableMessage());
        logger.error('shopify_get_preview_context failed', e);
        return err(String(e));
      }
    },
  });

  registry.register({
    definition: {
      name: 'shopify_preview_console',
      description: 'Get captured console logs (errors, warnings) from the Shopify preview. Optionally filter by search text. Useful for diagnosing JavaScript errors affecting the theme.',
      inputSchema: {
        type: 'object',
        properties: {
          search: {
            type: 'string',
            description: 'Optional text to filter console logs. Only logs containing this text are returned.',
          },
        },
      },
    },
    async handler(args) {
      try {
        const data = await sidecarGet(sidecarUrl, '/context/console') as { logs?: Array<{ level: string; message: string; timestamp?: string }> };
        let logs = data.logs ?? [];

        const search = args.search as string | undefined;
        if (search) {
          const lower = search.toLowerCase();
          logs = logs.filter((log) => log.message.toLowerCase().includes(lower));
        }

        return ok({ logCount: logs.length, logs });
      } catch (e) {
        if (isSidecarError(e)) return err(sidecarUnavailableMessage());
        logger.error('shopify_preview_console failed', e);
        return err(String(e));
      }
    },
  });

  registry.register({
    definition: {
      name: 'shopify_preview_inject_css',
      description: 'Inject CSS into the live Shopify preview for instant visual debugging. The CSS takes effect immediately in the browser. Use this to test style fixes before editing theme files.',
      inputSchema: {
        type: 'object',
        properties: {
          css: {
            type: 'string',
            description: 'CSS to inject into the preview page.',
          },
        },
        required: ['css'],
      },
    },
    async handler(args) {
      try {
        const css = args.css as string;
        await sidecarPost(sidecarUrl, '/context/inject-css', { css });
        return ok({ injected: true, cssLength: css.length });
      } catch (e) {
        if (isSidecarError(e)) return err(sidecarUnavailableMessage());
        logger.error('shopify_preview_inject_css failed', e);
        return err(String(e));
      }
    },
  });

  registry.register({
    definition: {
      name: 'shopify_diagnose_visibility',
      description: 'Diagnose why an element might be hidden or invisible. Searches CSS for visibility rules, Liquid for conditional rendering, and JS for DOM manipulation affecting the given selector. Returns categorized hypotheses.',
      inputSchema: {
        type: 'object',
        properties: {
          selector: {
            type: 'string',
            description: 'CSS selector or class name to diagnose (e.g. ".product-form__submit", "#shopify-section-header")',
          },
        },
        required: ['selector'],
      },
    },
    async handler(args) {
      try {
        if (!workspacePath) return err('No workspace path configured. Cannot read theme files.');
        const selector = args.selector as string;
        const hypotheses = diagnoseSelector(workspacePath, selector);

        const grouped: Record<string, VisibilityHypothesis[]> = {};
        for (const h of hypotheses) {
          (grouped[h.category] ??= []).push(h);
        }

        return ok({
          selector,
          hypothesisCount: hypotheses.length,
          css_visibility: grouped.css_visibility ?? [],
          liquid_rendering: grouped.liquid_rendering ?? [],
          js_interference: grouped.js_interference ?? [],
          asset_loading: grouped.asset_loading ?? [],
        });
      } catch (e) {
        logger.error('shopify_diagnose_visibility failed', e);
        return err(String(e));
      }
    },
  });

  registry.register({
    definition: {
      name: 'shopify_analyze_variants',
      description: 'Analyze how the current theme handles product variants — variant selectors, option handling, and price update methods. Useful for debugging variant-related issues.',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
    async handler() {
      try {
        if (!workspacePath) return err('No workspace path configured. Cannot read theme files.');
        const analysis = analyzeVariants(workspacePath);
        return ok({
          variantSelectorCount: analysis.variantSelectors.length,
          variantSelectors: analysis.variantSelectors,
          optionHandlingCount: analysis.optionHandling.length,
          optionHandling: analysis.optionHandling,
          priceUpdateCount: analysis.priceUpdates.length,
          priceUpdates: analysis.priceUpdates,
        });
      } catch (e) {
        logger.error('shopify_analyze_variants failed', e);
        return err(String(e));
      }
    },
  });

  registry.register({
    definition: {
      name: 'shopify_check_performance',
      description: 'Check theme files for common performance issues: missing image widths, no lazy loading, unbounded loops, render-blocking scripts. Returns issues with file, line, severity, and message.',
      inputSchema: {
        type: 'object',
        properties: {
          files: {
            type: 'array',
            items: { type: 'string' },
            description: 'Optional list of file paths to check (relative to workspace). Defaults to all theme files.',
          },
        },
      },
    },
    async handler(args) {
      try {
        if (!workspacePath) return err('No workspace path configured. Cannot read theme files.');
        const files = args.files as string[] | undefined;
        const issues = checkPerformance(workspacePath, files);
        return ok({ issueCount: issues.length, issues });
      } catch (e) {
        logger.error('shopify_check_performance failed', e);
        return err(String(e));
      }
    },
  });

  logger.info('Registered local preview tools', { sidecarUrl, workspacePath: workspacePath ?? 'none' });
}
