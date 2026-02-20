'use client';

import React, { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import { CodeBlock } from './CodeBlock';
import { DiffPreview } from '@/components/features/suggestions/DiffPreview';
import { detectFilePaths } from '@/lib/ai/file-path-detector';
import { FileText } from 'lucide-react';
import type { Components } from 'react-markdown';

// ── Types ──────────────────────────────────────────────────────────────────────

interface MarkdownRendererProps {
  content: string;
  /** True when the parent message is still being streamed by the agent. */
  isStreaming?: boolean;
  onOpenFile?: (filePath: string) => void;
  onApplyCode?: (code: string, fileId: string, fileName: string) => void;
  onSaveCode?: (code: string, fileName: string) => void;
  resolveFileId?: (path: string) => string | null;
}

// ── Diff detection (mirrors ChatInterface logic) ───────────────────────────────

function isDiffContent(code: string, language?: string): boolean {
  if (language === 'diff') return true;
  const lines = code.split('\n');
  const diffLines = lines.filter(l => l.startsWith('+') || l.startsWith('-'));
  const nonEmpty = lines.filter(l => l.trim().length > 0);
  return nonEmpty.length > 2 && diffLines.length / nonEmpty.length > 0.3;
}

function parseDiffContent(code: string): { original: string; suggested: string } {
  const lines = code.split('\n');
  const originalLines: string[] = [];
  const suggestedLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith('---') || line.startsWith('+++') || line.startsWith('@@')) continue;
    if (line.startsWith('-')) {
      originalLines.push(line.slice(1));
    } else if (line.startsWith('+')) {
      suggestedLines.push(line.slice(1));
    } else {
      const clean = line.startsWith(' ') ? line.slice(1) : line;
      originalLines.push(clean);
      suggestedLines.push(clean);
    }
  }

  return { original: originalLines.join('\n'), suggested: suggestedLines.join('\n') };
}

// ── File name detection from code ──────────────────────────────────────────────

function detectFileNameFromCode(code: string): string | undefined {
  const firstLine = code.split('\n')[0]?.trim();
  if (!firstLine) return undefined;
  const commentRe = /^(?:\/\/|\/\*|#|{%-?\s*comment\s*-?%}|<!--)\s*((?:sections|templates|snippets|assets|config|layout|locales|blocks)\/[\w./-]+)/;
  const m = firstLine.match(commentRe);
  return m?.[1] ?? undefined;
}

// ── Streaming fence buffer ─────────────────────────────────────────────────────
// If content ends with an unclosed code fence, split it so react-markdown
// only receives complete blocks. The incomplete tail is shown as a loading hint.

interface BufferedContent {
  /** Markdown safe to render (all code fences are closed). */
  safeContent: string;
  /** True when the content ends with an unclosed fence (code is still streaming). */
  hasIncompleteFence: boolean;
}

function bufferIncompleteFences(content: string): BufferedContent {
  // Count opening and closing triple-backtick fences
  const fenceRe = /```/g;
  let count = 0;
  let lastFenceIndex = -1;
  let match: RegExpExecArray | null;
  while ((match = fenceRe.exec(content)) !== null) {
    lastFenceIndex = match.index;
    count++;
  }

  // Odd count means there's an unclosed fence — close it synthetically
  // so the code block renders progressively while the LLM is still streaming.
  if (count % 2 !== 0 && lastFenceIndex >= 0) {
    return {
      safeContent: content + '\n```',
      hasIncompleteFence: true,
    };
  }

  return { safeContent: content, hasIncompleteFence: false };
}

// ── File path chip in paragraphs ───────────────────────────────────────────────

function ParagraphWithFilePaths({
  children,
  onOpenFile,
}: {
  children: React.ReactNode;
  onOpenFile?: (path: string) => void;
}) {
  if (!onOpenFile) {
    return <p className="mb-2 ide-text leading-relaxed last:mb-0">{children}</p>;
  }

  // Extract the text content from children to detect file paths
  const textContent = React.Children.toArray(children)
    .map(child => (typeof child === 'string' ? child : ''))
    .join('');

  const filePaths = detectFilePaths(textContent);
  if (filePaths.length === 0) {
    return <p className="mb-2 ide-text leading-relaxed last:mb-0">{children}</p>;
  }

  // Rebuild children with file path chips spliced in
  const parts: React.ReactNode[] = [];
  let cursor = 0;

  for (const fp of filePaths) {
    if (fp.start > cursor) {
      parts.push(textContent.slice(cursor, fp.start));
    }
    const fileName = fp.path.split('/').pop() ?? fp.path;
    parts.push(
      <button
        key={`fp-${fp.start}`}
        type="button"
        onClick={(e) => { e.stopPropagation(); onOpenFile(fp.path); }}
        className="inline-flex items-center gap-1 rounded-md bg-sky-50 dark:bg-sky-500/10 border border-sky-200 dark:border-sky-500/20 px-1.5 py-0.5 text-[11px] font-medium text-sky-600 dark:text-sky-400 hover:bg-sky-100 dark:hover:bg-sky-500/20 transition-colors cursor-pointer mx-0.5 align-middle"
        title={`Open ${fp.path}`}
      >
        <FileText className="h-3 w-3" />
        {fileName}
      </button>,
    );
    cursor = fp.end;
  }

  if (cursor < textContent.length) {
    parts.push(textContent.slice(cursor));
  }

  return <p className="mb-2 ide-text leading-relaxed last:mb-0">{parts}</p>;
}

// ── Component ──────────────────────────────────────────────────────────────────

function MarkdownRendererInner({
  content,
  isStreaming = false,
  onOpenFile,
  onApplyCode,
  onSaveCode,
  resolveFileId,
}: MarkdownRendererProps) {
  // Buffer incomplete fences during streaming.
  // Only treat a fence as "incomplete" when the agent is actually still streaming;
  // otherwise a finished message with an odd number of ``` will get stuck.
  const { safeContent, hasIncompleteFence: rawIncompleteFence } = useMemo(
    () => bufferIncompleteFences(content ?? ''),
    [content],
  );
  const hasIncompleteFence = rawIncompleteFence && isStreaming;

  // Count fenced code blocks so we know which one is the "last" (streaming) block.
  const fencedBlockCount = useMemo(() => {
    const m = safeContent.match(/```/g);
    return m ? Math.floor(m.length / 2) : 0;
  }, [safeContent]);

  // Pre-process: extract diff code blocks and replace with placeholders
  // We'll handle diffs by detecting them in the code renderer override
  // The counter tracks which fenced block we're rendering (reset per useMemo recompute).
  const components: Components = useMemo(() => {
  let fencedBlockIdx = 0;
  return ({
    // ── Headings ────────────────────────────────────────────────────────
    h1: ({ children }) => (
      <h1 className="text-base font-semibold ide-text mb-2 mt-3 first:mt-0">{children}</h1>
    ),
    h2: ({ children }) => (
      <h2 className="text-sm font-semibold ide-text mb-1.5 mt-2.5 first:mt-0">{children}</h2>
    ),
    h3: ({ children }) => (
      <h3 className="text-sm font-medium ide-text-2 mb-1 mt-2 first:mt-0">{children}</h3>
    ),
    h4: ({ children }) => (
      <h4 className="text-xs font-medium ide-text-2 mb-1 mt-2 first:mt-0">{children}</h4>
    ),

    // ── Paragraph (with file path detection) ────────────────────────────
    p: ({ children }) => (
      <ParagraphWithFilePaths onOpenFile={onOpenFile}>{children}</ParagraphWithFilePaths>
    ),

    // ── Lists ───────────────────────────────────────────────────────────
    ul: ({ children }) => (
      <ul className="list-disc list-inside space-y-0.5 my-1.5 ide-text ml-2">{children}</ul>
    ),
    ol: ({ children }) => (
      <ol className="list-decimal list-inside space-y-0.5 my-1.5 ide-text ml-2">{children}</ol>
    ),

    // ── Blockquote ──────────────────────────────────────────────────────
    blockquote: ({ children }) => (
      <blockquote className="border-l-2 border-stone-300 dark:border-white/20 pl-4 py-1 my-2 ide-text-2 italic">
        {children}
      </blockquote>
    ),

    // ── Table ───────────────────────────────────────────────────────────
    table: ({ children }) => (
      <div className="overflow-x-auto my-2">
        <table className="w-full border-collapse">{children}</table>
      </div>
    ),
    thead: ({ children }) => (
      <thead className="ide-surface-inset">{children}</thead>
    ),
    th: ({ children }) => (
      <th className="border ide-border-subtle px-2 py-1.5 text-left text-xs font-semibold ide-text">
        {children}
      </th>
    ),
    td: ({ children }) => (
      <td className="border ide-border-subtle px-2 py-1.5 text-xs ide-text-2">{children}</td>
    ),

    // ── Links ───────────────────────────────────────────────────────────
    a: ({ href, children }) => (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-sky-600 dark:text-sky-400 hover:text-sky-700 dark:hover:text-sky-300 underline underline-offset-2 transition-colors"
      >
        {children}
      </a>
    ),

    // ── Inline elements ─────────────────────────────────────────────────
    strong: ({ children }) => (
      <strong className="font-semibold ide-text">{children}</strong>
    ),
    em: ({ children }) => <em className="italic">{children}</em>,
    hr: () => <hr className="my-3 border-t ide-border-subtle" />,

    // ── Code (inline + fenced) ──────────────────────────────────────────
    code: ({ className: codeClassName, children }) => {
      const codeString = String(children).replace(/\n$/, '');
      const langMatch = /language-(\w+)/.exec(codeClassName || '');
      const language = langMatch?.[1];

      // Inline code: no language class and no newlines
      const isInline = !langMatch && !codeString.includes('\n');
      if (isInline) {
        return (
          <code className="rounded bg-stone-100 dark:bg-white/10 px-1 py-0.5 text-[0.8em] font-mono text-sky-600 dark:text-sky-300">
            {codeString}
          </code>
        );
      }

      // Check for diff content
      if (isDiffContent(codeString, language)) {
        const { original, suggested } = parseDiffContent(codeString);
        return (
          <div className="my-2">
            <DiffPreview originalCode={original} suggestedCode={suggested} />
          </div>
        );
      }

      // Fenced code block — use CodeBlock component
      const fn = detectFileNameFromCode(codeString);
      // Parse language:filepath syntax (e.g., ```liquid:sections/header.liquid)
      let resolvedFileName = fn;
      let resolvedLanguage = language;
      if (language?.includes(':')) {
        const [langPart, ...rest] = language.split(':');
        resolvedLanguage = langPart || undefined;
        resolvedFileName = rest.join(':').trim() || fn;
      }

      const fId = resolvedFileName && resolveFileId ? resolveFileId(resolvedFileName) : undefined;

      // Track block index to detect the last (streaming) block
      const blockIdx = fencedBlockIdx++;
      const isStreamingBlock = hasIncompleteFence && blockIdx === fencedBlockCount - 1;

      return (
        <CodeBlock
          code={codeString}
          language={resolvedLanguage}
          fileName={resolvedFileName}
          fileId={fId ?? undefined}
          onApply={onApplyCode}
          onSave={onSaveCode}
          streaming={isStreamingBlock}
        />
      );
    },

    // ── Pre — pass through so code blocks render correctly ──────────────
    pre: ({ children }) => <>{children}</>,
  });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onOpenFile, onApplyCode, onSaveCode, resolveFileId, hasIncompleteFence, fencedBlockCount]);

  // Handle empty/whitespace content (after hooks to satisfy rules-of-hooks)
  if (!content?.trim()) return null;

  return (
    <div className="markdown-renderer">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw, rehypeSanitize]}
        components={components}
      >
        {safeContent}
      </ReactMarkdown>
      {hasIncompleteFence && (
        <div className="flex items-center gap-1 px-2 py-0.5 -mt-1">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-sky-500 animate-pulse" />
          <span className="text-[10px] ide-text-muted italic">writing...</span>
        </div>
      )}
    </div>
  );
}

export const MarkdownRenderer = React.memo(MarkdownRendererInner);
