'use client';

import { useState, useCallback } from 'react';
import { Copy, Check, Download, Printer } from 'lucide-react';

interface OutputPanelProps {
  template: string;
}

export function OutputPanel({ template }: OutputPanelProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(template);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard may be blocked */
    }
  }, [template]);

  const handleDownload = useCallback(() => {
    if (!template) return;
    const blob = new Blob([template], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'packing-slip.liquid';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [template]);

  const handlePrint = useCallback(() => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    printWindow.document.write(`<!DOCTYPE html>
<html>
<head>
<title>Packing Slip</title>
<style>
  @page { size: letter; margin: 0; }
  body { margin: 0; padding: 0; }
</style>
</head>
<body>${template}</body>
</html>`);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 300);
  }, [template]);

  if (!template.trim()) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <p className="text-sm text-stone-500 dark:text-[#636059]">
          No template loaded. Select a template or import one first.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Code block */}
      <div className="rounded-lg border border-stone-200 dark:border-white/10 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2 bg-stone-100 dark:bg-[#141414] border-b border-stone-200 dark:border-white/10">
          <span className="text-xs text-stone-500 dark:text-[#636059]">
            Packing Slip Template (Liquid)
          </span>
          <button
            onClick={handleCopy}
            className="inline-flex items-center gap-1.5 text-xs text-stone-500 dark:text-[#636059] hover:text-stone-700 dark:hover:text-white/60 transition-colors"
          >
            {copied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
        <pre className="p-4 overflow-x-auto bg-stone-950 dark:bg-[oklch(0.162_0_0)] max-h-[400px] overflow-y-auto">
          <code className="text-xs font-mono text-stone-300 whitespace-pre-wrap break-words">
            {template}
          </code>
        </pre>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={handleCopy}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-accent hover:bg-accent-hover text-white transition-colors"
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
          {copied ? 'Copied!' : 'Copy to Clipboard'}
        </button>
        <button
          onClick={handleDownload}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border border-stone-200 dark:border-white/10 text-stone-700 dark:text-white/70 hover:bg-stone-50 dark:hover:bg-white/5 transition-colors"
        >
          <Download size={14} />
          Download .liquid
        </button>
        <button
          onClick={handlePrint}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border border-stone-200 dark:border-white/10 text-stone-700 dark:text-white/70 hover:bg-stone-50 dark:hover:bg-white/5 transition-colors"
        >
          <Printer size={14} />
          Print
        </button>
      </div>

      {/* Instructions */}
      <div className="rounded-lg border border-stone-200 dark:border-white/10 bg-white dark:bg-[#141414] px-5 py-4 space-y-3">
        <h3 className="text-sm font-semibold text-stone-900 dark:text-white">
          How to apply in Shopify
        </h3>
        <ol className="text-xs text-stone-600 dark:text-gray-400 leading-relaxed space-y-2 list-decimal list-inside">
          <li>
            Copy the template above using the <strong>Copy to Clipboard</strong> button.
          </li>
          <li>
            Open your Shopify Admin and go to{' '}
            <span className="font-medium text-stone-800 dark:text-white/80">
              Settings &rarr; Shipping and delivery
            </span>.
          </li>
          <li>
            Scroll down to <strong>Packing slip template</strong> and click{' '}
            <code className="px-1 py-0.5 rounded bg-stone-100 dark:bg-white/10 text-xs">Edit</code>.
          </li>
          <li>
            Select all existing content (<kbd className="px-1 py-0.5 rounded bg-stone-100 dark:bg-white/10 text-xs">Ctrl+A</kbd>)
            and paste your new template (<kbd className="px-1 py-0.5 rounded bg-stone-100 dark:bg-white/10 text-xs">Ctrl+V</kbd>).
          </li>
          <li>
            Click <strong>Save</strong>. Preview with a test order to confirm it looks correct.
          </li>
        </ol>
      </div>

      {/* Disclaimer */}
      <div
        className="rounded-lg border border-amber-500/20 bg-amber-500/5 dark:bg-amber-500/10 px-4 py-3"
        role="alert"
      >
        <p className="text-xs text-amber-700 dark:text-amber-400">
          <strong>Note:</strong> The preview uses mock order data. Actual output will use real order
          data from Shopify when printed from the admin.
        </p>
      </div>
    </div>
  );
}
