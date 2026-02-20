'use client';

import { Fragment } from 'react';
import { cn } from '@/lib/utils';

const TOKEN_CLASSES = {
  liquid: 'text-purple-600 dark:text-purple-400',
  output: 'text-amber-600 dark:text-amber-400',
  tag: 'text-accent dark:text-accent',
  string: 'text-emerald-600 dark:text-emerald-400',
  key: 'text-blue-600 dark:text-blue-400',
  comment: 'text-stone-400 dark:text-white/30',
  default: 'text-stone-600 dark:text-white/50',
} as const;

type TokenType = keyof typeof TOKEN_CLASSES;

interface Token {
  type: TokenType;
  value: string;
}

/** Find earliest match at or after startIndex; return [type, fullMatch] or null */
function findEarliest(
  str: string,
  startIndex: number,
  patterns: { regex: RegExp; type: TokenType }[],
): { type: TokenType; value: string; index: number } | null {
  let best: { type: TokenType; value: string; index: number } | null = null;
  for (const { regex, type } of patterns) {
    regex.lastIndex = startIndex;
    const m = regex.exec(str);
    if (m && m.index === startIndex && (!best || m[0].length > 0)) {
      if (!best || m[0].length > best.value.length) {
        best = { type, value: m[0], index: m.index };
      }
    }
  }
  return best;
}

/**
 * Regex-based tokenizer for Liquid + HTML + JSON lines.
 * Emits tokens for IDE-like syntax highlighting in marketing mocks.
 */
function tokenizeLine(line: string): Token[] {
  if (!line.trim()) {
    return [{ type: 'default', value: line || '\u00A0' }];
  }

  const tokens: Token[] = [];
  const patterns: { regex: RegExp; type: TokenType }[] = [
    { regex: /\{%[\s\S]*?%\}/g, type: 'liquid' },
    { regex: /\{\{[\s\S]*?\}\}/g, type: 'output' },
    { regex: /<\/?[\w-]+(\s[^>]*)?>?/g, type: 'tag' },
    { regex: /"(?:[^"\\]|\\.)*"/g, type: 'string' },
    { regex: /\{#[\s\S]*?#\}/g, type: 'comment' },
    { regex: /<!--[\s\S]*?-->/g, type: 'comment' },
  ];

  let i = 0;
  while (i < line.length) {
    const found = findEarliest(line, i, patterns);
    if (found && found.index === i) {
      tokens.push({ type: found.type, value: found.value });
      i += found.value.length;
    } else {
      const rest = line.slice(i);
      const next = rest.search(/\{%|\{\{|<[\w-]|"|\{#|<!--/);
      const end = next < 0 ? line.length : i + next;
      const chunk = line.slice(i, end) || '\u00A0';
      tokens.push({ type: 'default', value: chunk });
      i = end;
    }
  }

  return tokens.length ? tokens : [{ type: 'default', value: '\u00A0' }];
}

export interface LiquidCodeLineProps {
  line?: string | null;
  className?: string;
  compact?: boolean;
}

/**
 * Renders a single line of Liquid/HTML/JSON code with IDE-like syntax colors.
 * Use in code editor mocks for consistent highlighting.
 */
export function LiquidCodeLine({ line, className, compact }: LiquidCodeLineProps) {
  const safeLine = typeof line === 'string' ? line : '';
  const tokens = tokenizeLine(safeLine);
  const baseClass = compact !== false ? 'font-mono text-[10px] leading-5' : 'font-mono text-[12px] leading-6';

  return (
    <span className={cn(baseClass, className)}>
      {tokens.map((token, i) => (
        <Fragment key={i}>
          <span className={TOKEN_CLASSES[token.type]}>{token.value}</span>
        </Fragment>
      ))}
    </span>
  );
}

