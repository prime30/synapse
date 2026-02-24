/**
 * Theme Health Scanner – orchestrates a11y, performance, and CX gap analyzers.
 * V2-8: Proactive Theme Health Monitoring.
 */

import { detectThemeGaps } from './theme-gap-detector';
import { getHighImpactPatterns } from './cx-patterns';

export interface HealthFinding {
  id: string;
  type: 'a11y' | 'performance' | 'cx_gap';
  severity: 'error' | 'warning' | 'info';
  message: string;
  file?: string;
  line?: number;
  fixPrompt: string;
}

export interface HealthScanResult {
  findings: HealthFinding[];
  overallSeverity: 'error' | 'warning' | 'info' | 'pass';
  scanDurationMs: number;
  fileCount: number;
}

const INLINE_SCRIPT_THRESHOLD = 500;
const LARGE_CSS_BYTES = 50 * 1024; // 50KB

function makeId(prefix: string, file: string, index: number): string {
  return `${prefix}-${file.replace(/[^a-z0-9]/gi, '_')}-${index}`;
}

// ── A11y checks ─────────────────────────────────────────────────────────────

function checkAccessibility(fileContents: Map<string, string>): HealthFinding[] {
  const findings: HealthFinding[] = [];

  for (const [path, content] of fileContents) {
    if (!path.match(/\.(liquid|html)$/i)) continue;

    // Images without alt
    const imgRegex = /<img[^>]*>/gi;
    let match: RegExpExecArray | null;
    let idx = 0;
    while ((match = imgRegex.exec(content)) !== null) {
      const tag = match[0];
      if (!/alt\s*=\s*["'][^"']*["']/i.test(tag) && !/alt\s*=\s*\{\{/i.test(tag)) {
        const line = content.slice(0, match.index).split('\n').length;
        findings.push({
          id: makeId('a11y-img-alt', path, idx++),
          type: 'a11y',
          severity: 'error',
          message: `Image without alt text in ${path}`,
          file: path,
          line,
          fixPrompt: `Add alt text to all images in ${path}`,
        });
      }
    }

    // Inputs without label or aria-label
    const inputRegex = /<input[^>]*>/gi;
    idx = 0;
    while ((match = inputRegex.exec(content)) !== null) {
      const tag = match[0];
      const hasAriaLabel = /aria-label\s*=\s*["'][^"']*["']/i.test(tag) || /aria-labelledby\s*=/i.test(tag);
      const idMatch = tag.match(/id\s*=\s*["']([^"']+)["']/i);
      const hasLabelFor = idMatch && new RegExp(`<label[^>]*for\\s*=\\s*["']${idMatch[1]}["']`, 'i').test(content);
      if (!hasAriaLabel && !hasLabelFor) {
        const type = tag.match(/type\s*=\s*["']([^"']+)["']/i)?.[1] || 'text';
        if (type !== 'hidden' && type !== 'submit' && type !== 'button') {
          const line = content.slice(0, match.index).split('\n').length;
          findings.push({
            id: makeId('a11y-input-label', path, idx++),
            type: 'a11y',
            severity: 'warning',
            message: `Input without associated label or aria-label in ${path}`,
            file: path,
            line,
            fixPrompt: `Add labels or aria-label to form inputs in ${path}`,
          });
        }
      }
    }

    // Interactive elements without text or aria-label
    const buttonRegex = /<button[^>]*>[\s]*<\/button>/gi;
    idx = 0;
    while ((match = buttonRegex.exec(content)) !== null) {
      const line = content.slice(0, match.index).split('\n').length;
      findings.push({
        id: makeId('a11y-button-empty', path, idx++),
        type: 'a11y',
        severity: 'warning',
        message: `Empty button without accessible name in ${path}`,
        file: path,
        line,
        fixPrompt: `Add text content or aria-label to buttons in ${path}`,
      });
    }

    // Heading hierarchy
    const headingRegex = /<h([1-6])[^>]*>/gi;
    const levels: number[] = [];
    let lastLevel = 0;
    while ((match = headingRegex.exec(content)) !== null) {
      const level = parseInt(match[1], 10);
      if (lastLevel > 0 && level > lastLevel + 1) {
        const line = content.slice(0, match.index).split('\n').length;
        findings.push({
          id: makeId('a11y-heading-skip', path, levels.length),
          type: 'a11y',
          severity: 'info',
          message: `Heading skips level (h${lastLevel} to h${level}) in ${path}`,
          file: path,
          line,
          fixPrompt: `Fix heading hierarchy in ${path} to avoid skipping levels`,
        });
      }
      lastLevel = level;
      levels.push(level);
    }
  }

  return findings;
}

// ── Performance checks ──────────────────────────────────────────────────────

function checkPerformance(fileContents: Map<string, string>): HealthFinding[] {
  const findings: HealthFinding[] = [];

  for (const [path, content] of fileContents) {
    if (!path.match(/\.(liquid|html|css)$/i)) continue;

    // Large inline scripts
    const scriptRegex = /<script[^>]*>([\s\S]*?)<\/script>/gi;
    let match: RegExpExecArray | null;
    let idx = 0;
    while ((match = scriptRegex.exec(content)) !== null) {
      const inner = match[1]?.trim() ?? '';
      if (inner.length > INLINE_SCRIPT_THRESHOLD) {
        const line = content.slice(0, match.index).split('\n').length;
        findings.push({
          id: makeId('perf-inline-script', path, idx++),
          type: 'performance',
          severity: 'warning',
          message: `Large inline script (${inner.length} chars) in ${path}`,
          file: path,
          line,
          fixPrompt: `Move inline script to external file in ${path}`,
        });
      }
    }

    // Render-blocking CSS in head (link rel=stylesheet without media)
    if (path.match(/layout|theme\.liquid$/i) || path.includes('head')) {
      const linkRegex = /<link[^>]*rel\s*=\s*["']stylesheet["'][^>]*>/gi;
      idx = 0;
      while ((match = linkRegex.exec(content)) !== null) {
        const tag = match[0];
        if (!/media\s*=/.test(tag) && !/media\s*:/.test(tag)) {
          const line = content.slice(0, match.index).split('\n').length;
          findings.push({
            id: makeId('perf-render-block', path, idx++),
            type: 'performance',
            severity: 'info',
            message: `Render-blocking stylesheet in ${path}`,
            file: path,
            line,
            fixPrompt: `Add media attribute or defer non-critical CSS in ${path}`,
          });
        }
      }
    }

    // Images without lazy loading (except first)
    const imgRegex = /<img[^>]*>/gi;
    idx = 0;
    let imgCount = 0;
    while ((match = imgRegex.exec(content)) !== null) {
      imgCount++;
      const tag = match[0];
      const hasLazy = /loading\s*=\s*["']lazy["']/i.test(tag) || /loading\s*=\s*\{\{/i.test(tag);
      if (!hasLazy && imgCount > 1) {
        const line = content.slice(0, match.index).split('\n').length;
        findings.push({
          id: makeId('perf-lazy-load', path, idx++),
          type: 'performance',
          severity: 'info',
          message: `Image without lazy loading in ${path}`,
          file: path,
          line,
          fixPrompt: `Add lazy loading to images in ${path}`,
        });
      }
    }

    // Large CSS files
    if (path.match(/\.css$/i)) {
      const bytes = new TextEncoder().encode(content).length;
      if (bytes > LARGE_CSS_BYTES) {
        findings.push({
          id: makeId('perf-large-css', path, 0),
          type: 'performance',
          severity: 'info',
          message: `Large CSS file (${(bytes / 1024).toFixed(1)}KB) in ${path}`,
          file: path,
          fixPrompt: `Split or optimize CSS in ${path}`,
        });
      }
    }
  }

  return findings;
}

// ── CX gap checks ─────────────────────────────────────────────────────────────

async function checkCXGaps(fileContents: Map<string, string>): Promise<HealthFinding[]> {
  const findings: HealthFinding[] = [];
  const result = await detectThemeGaps(fileContents);

  // Only convert missing high-impact patterns to findings
  const highImpact = getHighImpactPatterns();
  const missingHigh = result.missing.filter((p) => highImpact.some((h) => h.id === p.id));

  for (const pattern of missingHigh) {
    findings.push({
      id: `cx-gap-${pattern.id}`,
      type: 'cx_gap',
      severity: 'info',
      message: `Missing: ${pattern.name} – ${pattern.description}`,
      fixPrompt: pattern.promptTemplate,
    });
  }

  return findings;
}

// ── Main orchestrator ────────────────────────────────────────────────────────

export async function scanThemeHealth(
  fileContents: Map<string, string>
): Promise<HealthScanResult> {
  const start = Date.now();
  const findings: HealthFinding[] = [];

  findings.push(...checkAccessibility(fileContents));
  findings.push(...checkPerformance(fileContents));
  findings.push(...(await checkCXGaps(fileContents)));

  const overallSeverity = findings.some((f) => f.severity === 'error')
    ? 'error'
    : findings.some((f) => f.severity === 'warning')
      ? 'warning'
      : findings.length > 0
        ? 'info'
        : 'pass';

  return {
    findings,
    overallSeverity,
    scanDurationMs: Date.now() - start,
    fileCount: fileContents.size,
  };
}
