'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import type { Components } from 'react-markdown';
import type { ReactNode } from 'react';
import { MermaidDiagram } from './MermaidDiagram';
import { DocCodeBlock } from './DocCodeBlock';

// ── Heading slug generation ──────────────────────────────────────────

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

function extractText(children: ReactNode): string {
  if (typeof children === 'string') return children;
  if (Array.isArray(children)) return children.map(extractText).join('');
  if (children && typeof children === 'object' && 'props' in children) {
    return extractText((children as { props: { children?: ReactNode } }).props.children);
  }
  return '';
}

// ── Anchor heading component ─────────────────────────────────────────

function AnchorHeading({
  level,
  children,
  className,
}: {
  level: 1 | 2 | 3 | 4;
  children: ReactNode;
  className: string;
}) {
  const text = extractText(children);
  const id = slugify(text);
  const Tag = `h${level}` as const;

  return (
    <Tag id={id} className={`group relative ${className}`}>
      <a
        href={`#${id}`}
        className="absolute -left-6 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity text-stone-300 dark:text-white/20 hover:text-accent dark:hover:text-accent no-underline"
        aria-label={`Link to ${text}`}
      >
        #
      </a>
      {children}
    </Tag>
  );
}

// ── Component overrides ──────────────────────────────────────────────

const components: Components = {
  // ── Code blocks ────────────────────────────────────────────────────
  code({ className, children, ...props }) {
    const match = /language-(\w+)/.exec(className || '');
    const language = match ? match[1] : undefined;
    const code = String(children).replace(/\n$/, '');

    // Inline code (no language class, short content)
    const isInline = !className && !code.includes('\n');
    if (isInline) {
      return (
        <code
          className="bg-stone-100 dark:bg-white/10 text-stone-800 dark:text-white/80 px-1.5 py-0.5 rounded text-sm font-[family-name:var(--font-geist-mono)]"
          {...props}
        >
          {children}
        </code>
      );
    }

    // Mermaid diagram
    if (language === 'mermaid') {
      return <MermaidDiagram chart={code} />;
    }

    // Fenced code block
    return <DocCodeBlock code={code} language={language} />;
  },

  // react-markdown wraps fenced blocks in <pre><code>. We handle everything
  // in the `code` override above, so strip the <pre> wrapper.
  pre({ children }) {
    return <>{children}</>;
  },

  // ── Headings with anchor links ─────────────────────────────────────
  h1({ children }) {
    return (
      <AnchorHeading level={1} className="text-3xl md:text-4xl font-bold text-stone-900 dark:text-white tracking-[-0.02em] mt-16 mb-6 first:mt-0">
        {children}
      </AnchorHeading>
    );
  },
  h2({ children }) {
    return (
      <AnchorHeading level={2} className="text-2xl font-semibold text-stone-900 dark:text-white mt-14 mb-4 pb-2 border-b border-stone-200 dark:border-white/10">
        {children}
      </AnchorHeading>
    );
  },
  h3({ children }) {
    return (
      <AnchorHeading level={3} className="text-lg font-semibold text-stone-900 dark:text-white mt-10 mb-3">
        {children}
      </AnchorHeading>
    );
  },
  h4({ children }) {
    return (
      <AnchorHeading level={4} className="text-base font-semibold text-stone-900 dark:text-white mt-8 mb-2">
        {children}
      </AnchorHeading>
    );
  },

  // ── Paragraphs ─────────────────────────────────────────────────────
  p({ children }) {
    return (
      <p className="text-stone-500 dark:text-white/50 leading-relaxed mb-4">
        {children}
      </p>
    );
  },

  // ── Links ──────────────────────────────────────────────────────────
  a({ href, children }) {
    const isExternal = href?.startsWith('http');
    return (
      <a
        href={href}
        className="text-accent dark:text-accent hover:underline underline-offset-2"
        {...(isExternal ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
      >
        {children}
      </a>
    );
  },

  // ── Tables ─────────────────────────────────────────────────────────
  table({ children }) {
    return (
      <div className="overflow-x-auto my-6 rounded-lg border border-stone-200 dark:border-white/10">
        <table className="w-full text-sm border-collapse">
          {children}
        </table>
      </div>
    );
  },
  thead({ children }) {
    return (
      <thead className="bg-stone-100 dark:bg-white/10">
        {children}
      </thead>
    );
  },
  th({ children }) {
    return (
      <th className="text-left px-4 py-2.5 text-stone-900 dark:text-white font-semibold text-xs uppercase tracking-wider border-b border-stone-200 dark:border-white/10">
        {children}
      </th>
    );
  },
  td({ children }) {
    return (
      <td className="px-4 py-2.5 text-stone-500 dark:text-white/50 border-b border-stone-100 dark:border-white/5">
        {children}
      </td>
    );
  },
  tr({ children }) {
    return (
      <tr className="even:bg-stone-50 dark:even:bg-white/[0.02]">
        {children}
      </tr>
    );
  },

  // ── Lists ──────────────────────────────────────────────────────────
  ul({ children }) {
    return (
      <ul className="text-stone-500 dark:text-white/50 space-y-1.5 ml-6 mb-4 list-disc marker:text-stone-300 dark:marker:text-white/20">
        {children}
      </ul>
    );
  },
  ol({ children }) {
    return (
      <ol className="text-stone-500 dark:text-white/50 space-y-1.5 ml-6 mb-4 list-decimal marker:text-stone-400 dark:marker:text-white/30">
        {children}
      </ol>
    );
  },
  li({ children }) {
    return (
      <li className="leading-relaxed pl-1">
        {children}
      </li>
    );
  },

  // ── Blockquotes ────────────────────────────────────────────────────
  blockquote({ children }) {
    return (
      <blockquote className="border-l-4 border-accent bg-accent/5 dark:bg-accent/10 pl-4 py-2 rounded-r-lg my-4 [&>p]:mb-0 [&>p]:text-stone-900 dark:[&>p]:text-stone-200">
        {children}
      </blockquote>
    );
  },

  // ── Horizontal rules ───────────────────────────────────────────────
  hr() {
    return <hr className="border-stone-200 dark:border-white/10 my-12" />;
  },

  // ── Strong / emphasis ──────────────────────────────────────────────
  strong({ children }) {
    return (
      <strong className="text-stone-900 dark:text-white font-semibold">
        {children}
      </strong>
    );
  },
  em({ children }) {
    return <em className="italic">{children}</em>;
  },
};

// ── Main renderer ────────────────────────────────────────────────────

interface DocRendererProps {
  content: string;
}

export function DocRenderer({ content }: DocRendererProps) {
  return (
    <div className="doc-renderer">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw]}
        components={components}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}





