'use client';

import { useState, useCallback } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';

interface DocCodeBlockProps {
  code: string;
  language?: string;
}

/**
 * Lightweight syntax-highlighted code block for documentation pages.
 * Includes copy-to-clipboard and language badge. Styled to match the
 * marketing design system (stone/white tokens, Geist Mono font).
 */
export function DocCodeBlock({ code, language }: DocCodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: no-op if clipboard unavailable
    }
  }, [code]);

  const displayLang = language || 'text';

  return (
    <div className="group relative my-6 rounded-lg border border-stone-200 dark:border-white/10 overflow-hidden">
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-stone-900 dark:bg-white/10 border-b border-stone-800 dark:border-white/5">
        <span className="text-[11px] font-medium uppercase tracking-wider text-stone-400 dark:text-white/40 font-[family-name:var(--font-geist-mono)]">
          {displayLang}
        </span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 text-[11px] font-medium text-stone-400 dark:text-white/40 hover:text-white transition-colors"
          aria-label={copied ? 'Copied' : 'Copy code'}
        >
          {copied ? (
            <>
              <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              Copied!
            </>
          ) : (
            <>
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              Copy
            </>
          )}
        </button>
      </div>

      {/* Code content */}
      <SyntaxHighlighter
        language={displayLang}
        style={oneDark}
        customStyle={{
          margin: 0,
          padding: '1rem',
          background: 'transparent',
          fontSize: '0.8125rem',
          lineHeight: '1.7',
        }}
        className="!bg-stone-950 dark:!bg-[#0d0d0d] font-[family-name:var(--font-geist-mono)]"
        wrapLongLines
      >
        {code}
      </SyntaxHighlighter>
    </div>
  );
}
