'use client';

import { useState, useCallback } from 'react';
import { Copy, Check, Download } from 'lucide-react';
import type { PolicyContent, ThemeStyles } from '@/lib/policy-designer/types';
import { POLICY_LABELS } from '@/lib/policy-designer/types';

interface OutputPanelProps {
  content: PolicyContent | null;
  styles: ThemeStyles | null;
}

type OutputTab = 'inline' | 'css-matched';

function buildCSSMatchedHTML(content: PolicyContent, styles: ThemeStyles): string {
  const css = `<style>
  .policy-page { font-family: ${styles.bodyFont}; color: ${styles.textColor}; background: ${styles.backgroundColor}; max-width: 720px; margin: 0 auto; padding: 2rem 1rem; }
  .policy-page h1, .policy-page h2, .policy-page h3 { font-family: ${styles.headingFont}; color: ${styles.primaryColor}; }
  .policy-page a { color: ${styles.accentColor}; }
  .policy-page table { border-collapse: collapse; width: 100%; }
  .policy-page th, .policy-page td { border: 1px solid ${styles.secondaryColor}; padding: 0.5rem 0.75rem; text-align: left; }
</style>`;
  return `${css}\n<div class="policy-page">\n${content.html}\n</div>`;
}

export function OutputPanel({ content, styles }: OutputPanelProps) {
  const [tab, setTab] = useState<OutputTab>('inline');
  const [copied, setCopied] = useState(false);

  const outputHTML = content
    ? tab === 'css-matched' && styles
      ? buildCSSMatchedHTML(content, styles)
      : content.html
    : '';

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(outputHTML);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard may be blocked in some contexts */
    }
  }, [outputHTML]);

  const handleDownload = useCallback(() => {
    if (!content) return;
    const blob = new Blob([outputHTML], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${content.type}-policy.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [content, outputHTML]);

  if (!content) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <p className="text-sm text-stone-500 dark:text-white/40">
          No content to output. Select a template or generate with AI first.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Sub-tabs */}
      <div className="flex gap-2">
        {([['inline', 'Inline HTML'], ['css-matched', 'CSS-Matched HTML']] as const).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              tab === id
                ? 'bg-stone-200 dark:bg-white/10 text-stone-900 dark:text-white'
                : 'text-stone-500 dark:text-white/40 hover:text-stone-700 dark:hover:text-white/60'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Code block */}
      <div className="rounded-lg border border-stone-200 dark:border-white/10 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2 bg-stone-100 dark:bg-white/5 border-b border-stone-200 dark:border-white/10">
          <span className="text-xs text-stone-500 dark:text-white/40">
            {tab === 'inline' ? 'Inline HTML' : 'CSS-Matched HTML'} — {POLICY_LABELS[content.type]}
          </span>
          <button
            onClick={handleCopy}
            className="inline-flex items-center gap-1.5 text-xs text-stone-500 dark:text-white/40 hover:text-stone-700 dark:hover:text-white/60 transition-colors"
          >
            {copied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
        <pre className="p-4 overflow-x-auto bg-stone-950 dark:bg-[oklch(0.162_0_0)] max-h-[400px] overflow-y-auto">
          <code className="text-xs font-mono text-stone-300 whitespace-pre-wrap break-words">{outputHTML}</code>
        </pre>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={handleDownload}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border border-stone-200 dark:border-white/10 text-stone-700 dark:text-white/70 hover:bg-stone-50 dark:hover:bg-white/5 transition-colors"
        >
          <Download size={14} />
          Download HTML
        </button>
        <button
          disabled
          title="Coming soon — requires Shopify app review"
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-stone-100 dark:bg-white/5 text-stone-400 dark:text-white/25 cursor-not-allowed"
        >
          Push to Shopify
        </button>
      </div>

      {/* Instructions */}
      <div className="rounded-lg border border-stone-200 dark:border-white/10 bg-white dark:bg-white/5 px-4 py-3">
        <p className="text-xs text-stone-600 dark:text-gray-400 leading-relaxed">
          <strong>How to use:</strong> Copy the HTML above, then go to{' '}
          <span className="font-medium">Shopify Admin → Settings → Policies → {POLICY_LABELS[content.type]}</span>.
          Click the <code className="px-1 py-0.5 rounded bg-stone-100 dark:bg-white/10 text-xs">&lt;/&gt;</code> HTML
          button and paste the content.
        </p>
      </div>
    </div>
  );
}
