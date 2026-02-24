import type { ThemeStyles } from './types';

/**
 * Replace hardcoded default colors/fonts in template HTML with theme-specific values.
 * Works by swapping the known default placeholder colors used in templates.
 */
export function formatInlineHTML(html: string, styles: ThemeStyles): string {
  let result = html;

  // Heading color: #1a1a1a -> primaryColor
  result = result.replace(/color:\s*#1a1a1a/g, `color: ${styles.primaryColor}`);
  // Body text color: #444 or #444444 -> textColor
  result = result.replace(/color:\s*#444(?:444)?(?=[;"\s])/g, `color: ${styles.textColor}`);
  // Link/accent color: #0066cc -> accentColor
  result = result.replace(/color:\s*#0066cc/g, `color: ${styles.accentColor}`);
  // Footer muted color: #888 -> secondaryColor
  result = result.replace(/color:\s*#888(?=[;"\s])/g, `color: ${styles.secondaryColor}`);

  // Font-family replacements (if body/heading fonts differ from system defaults)
  const systemFontPrefix = '-apple-system';
  if (!styles.bodyFont.startsWith(systemFontPrefix)) {
    result = result.replace(
      /font-family:\s*[^;"]+/g,
      `font-family: ${styles.bodyFont}`,
    );
  }

  return result;
}

/**
 * Wrap HTML in a container div with CSS custom properties for easy downstream theming.
 */
export function formatCSSMatchedHTML(html: string, styles: ThemeStyles): string {
  return `<div style="
    --policy-primary: ${styles.primaryColor};
    --policy-text: ${styles.textColor};
    --policy-accent: ${styles.accentColor};
    --policy-bg: ${styles.backgroundColor};
    --policy-body-font: ${styles.bodyFont};
    --policy-heading-font: ${styles.headingFont};
    font-family: var(--policy-body-font);
    color: var(--policy-text);
    max-width: 800px;
    line-height: 1.6;
  ">\n${html}\n</div>`;
}

/**
 * Replace placeholder tokens in template HTML with actual store info.
 */
export function applyStoreInfo(
  html: string,
  info: {
    storeName?: string;
    email?: string;
    url?: string;
    state?: string;
    returnDays?: number;
  },
): string {
  let result = html;

  if (info.storeName) {
    result = result.replace(/\[STORE_NAME\]/g, info.storeName);
  }
  if (info.email) {
    result = result.replace(/\[STORE_EMAIL\]/g, info.email);
  }
  if (info.url) {
    result = result.replace(/\[STORE_URL\]/g, info.url);
  }
  if (info.state) {
    result = result.replace(/\[YOUR_STATE\]/g, info.state);
  }
  if (info.returnDays !== undefined) {
    result = result.replace(/\[RETURN_WINDOW_DAYS\]/g, String(info.returnDays));
  }

  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  result = result.replace(/\[CURRENT_DATE\]/g, dateStr);

  return result;
}
