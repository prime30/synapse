// ---------------------------------------------------------------------------
// Accessibility Checker – rule-based a11y scanner
// ---------------------------------------------------------------------------

/** Severity levels for accessibility issues. */
export type A11ySeverity = 'error' | 'warning' | 'info';

/** A single accessibility issue found during scanning. */
export interface A11yIssue {
  rule: string;
  severity: A11ySeverity;
  /** The HTML element (or a truncated snippet) that triggered the issue. */
  element: string;
  message: string;
  line?: number;
  recommendation: string;
}

/** Full accessibility report. */
export interface A11yReport {
  issues: A11yIssue[];
  passed: number;
  failed: number;
  warnings: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Return 1-indexed line number for a character offset. */
function lineAt(html: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset && i < html.length; i++) {
    if (html[i] === '\n') line++;
  }
  return line;
}

/** Truncate an element string to a readable length. */
function snippet(tag: string, max = 120): string {
  return tag.length > max ? tag.slice(0, max) + '…' : tag;
}

function getAttr(tag: string, attr: string): string | null {
  const re = new RegExp(`${attr}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i');
  const m = tag.match(re);
  return m ? m[1] ?? m[2] ?? null : null;
}

function hasAttr(tag: string, attr: string): boolean {
  return new RegExp(`\\b${attr}\\s*=`, 'i').test(tag);
}

// ---------------------------------------------------------------------------
// Individual rules
// ---------------------------------------------------------------------------

type RuleFn = (html: string) => A11yIssue[];

/** Images must have alt text. */
const imgAlt: RuleFn = (html) => {
  const issues: A11yIssue[] = [];
  const re = /<img\b[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const tag = m[0];
    if (!hasAttr(tag, 'alt')) {
      issues.push({
        rule: 'img-alt',
        severity: 'error',
        element: snippet(tag),
        message: '<img> is missing an alt attribute.',
        line: lineAt(html, m.index),
        recommendation: 'Add a descriptive alt attribute, or alt="" for decorative images.',
      });
    }
  }
  return issues;
};

/** Links must have accessible text. */
const linkText: RuleFn = (html) => {
  const issues: A11yIssue[] = [];
  const re = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const attrs = m[1];
    const inner = m[2].trim();
    // Empty link or link with only an image and no aria-label
    const hasText = inner.replace(/<[^>]*>/g, '').trim().length > 0;
    const hasAriaLabel = hasAttr(attrs, 'aria-label');
    const hasAriaLabelledBy = hasAttr(attrs, 'aria-labelledby');

    if (!hasText && !hasAriaLabel && !hasAriaLabelledBy) {
      issues.push({
        rule: 'link-text',
        severity: 'error',
        element: snippet(m[0]),
        message: '<a> has no accessible text content.',
        line: lineAt(html, m.index),
        recommendation: 'Add text content or an aria-label to the link.',
      });
    }
  }
  return issues;
};

/** Form inputs must have associated labels. */
const formLabels: RuleFn = (html) => {
  const issues: A11yIssue[] = [];
  const re = /<input\b[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const tag = m[0];
    const type = getAttr(tag, 'type')?.toLowerCase();
    // Skip hidden, submit, button, reset, image — they don't need visible labels
    if (type && ['hidden', 'submit', 'button', 'reset', 'image'].includes(type)) continue;

    const hasAriaLabel = hasAttr(tag, 'aria-label');
    const hasAriaLabelledBy = hasAttr(tag, 'aria-labelledby');
    const id = getAttr(tag, 'id');
    const hasLabelFor = id ? new RegExp(`<label[^>]*\\bfor\\s*=\\s*["']${id}["']`, 'i').test(html) : false;

    if (!hasAriaLabel && !hasAriaLabelledBy && !hasLabelFor) {
      issues.push({
        rule: 'form-label',
        severity: 'error',
        element: snippet(tag),
        message: '<input> has no associated label, aria-label, or aria-labelledby.',
        line: lineAt(html, m.index),
        recommendation: 'Associate a <label for="..."> or add an aria-label attribute.',
      });
    }
  }
  return issues;
};

/** Heading levels should not skip (e.g. h1 -> h3). */
const headingOrder: RuleFn = (html) => {
  const issues: A11yIssue[] = [];
  const re = /<h([1-6])\b[^>]*>/gi;
  let prevLevel = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const level = parseInt(m[1], 10);
    if (prevLevel > 0 && level > prevLevel + 1) {
      issues.push({
        rule: 'heading-order',
        severity: 'warning',
        element: snippet(m[0]),
        message: `Heading level skipped: <h${prevLevel}> followed by <h${level}>.`,
        line: lineAt(html, m.index),
        recommendation: `Use <h${prevLevel + 1}> instead, or restructure heading hierarchy.`,
      });
    }
    prevLevel = level;
  }
  return issues;
};

/** Buttons must have text content. */
const emptyButtons: RuleFn = (html) => {
  const issues: A11yIssue[] = [];
  const re = /<button\b([^>]*)>([\s\S]*?)<\/button>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const attrs = m[1];
    const inner = m[2].trim();
    const hasText = inner.replace(/<[^>]*>/g, '').trim().length > 0;
    const hasAriaLabel = hasAttr(attrs, 'aria-label');

    if (!hasText && !hasAriaLabel) {
      issues.push({
        rule: 'empty-button',
        severity: 'warning',
        element: snippet(m[0]),
        message: '<button> has no accessible text content.',
        line: lineAt(html, m.index),
        recommendation: 'Add text content or an aria-label to the button.',
      });
    }
  }
  return issues;
};

/** <html> tag should have a lang attribute. */
const htmlLang: RuleFn = (html) => {
  const issues: A11yIssue[] = [];
  const re = /<html\b([^>]*)>/i;
  const m = html.match(re);
  if (m && !hasAttr(m[1], 'lang')) {
    issues.push({
      rule: 'html-lang',
      severity: 'warning',
      element: snippet(m[0]),
      message: '<html> is missing a lang attribute.',
      line: 1,
      recommendation: 'Add lang="en" (or appropriate language) to the <html> element.',
    });
  }
  return issues;
};

/** Flag inline color styles that are likely low-contrast on light backgrounds. */
const colorContrast: RuleFn = (html) => {
  const issues: A11yIssue[] = [];
  // Match elements with inline style containing "color:"
  const re = /<[a-z][^>]*style\s*=\s*["'][^"']*color\s*:\s*([^;"']+)[^"']*["'][^>]*>/gi;
  const lightColors = /^(#f|#e|#d|white|#fff|ivory|snow|ghostwhite|floralwhite|linen|beige)/i;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const colorValue = m[1].trim();
    if (lightColors.test(colorValue)) {
      issues.push({
        rule: 'color-contrast',
        severity: 'info',
        element: snippet(m[0]),
        message: `Inline color "${colorValue}" may have low contrast on light backgrounds.`,
        line: lineAt(html, m.index),
        recommendation: 'Verify sufficient color contrast ratio (4.5:1 for normal text, 3:1 for large text).',
      });
    }
  }
  return issues;
};

/** Page should have a skip-navigation link. */
const skipNav: RuleFn = (html) => {
  const issues: A11yIssue[] = [];
  const hasSkipLink = /<a\b[^>]*href\s*=\s*["']#(main|content|skip)[^"']*["'][^>]*>/i.test(html);
  if (!hasSkipLink && /<body/i.test(html)) {
    issues.push({
      rule: 'skip-nav',
      severity: 'info',
      element: '<body>',
      message: 'Page has no skip-navigation link.',
      line: undefined,
      recommendation: 'Add a visually-hidden skip link as the first element inside <body> pointing to the main content area.',
    });
  }
  return issues;
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

const ALL_RULES: RuleFn[] = [
  imgAlt,
  linkText,
  formLabels,
  headingOrder,
  emptyButtons,
  htmlLang,
  colorContrast,
  skipNav,
];

/**
 * Run all accessibility rules against an HTML string (rendered preview).
 */
export function checkAccessibility(html: string): A11yReport {
  const issues: A11yIssue[] = [];

  for (const rule of ALL_RULES) {
    issues.push(...rule(html));
  }

  const failed = issues.filter((i) => i.severity === 'error').length;
  const warnings = issues.filter((i) => i.severity === 'warning').length;
  // "passed" = total rules minus distinct failing rules
  const failingRules = new Set(issues.map((i) => i.rule));
  const passed = ALL_RULES.length - failingRules.size;

  return { issues, passed, failed, warnings };
}
