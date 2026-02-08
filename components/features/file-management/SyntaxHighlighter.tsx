'use client';

import { Prism as SyntaxHighlighterLib } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import type { FileType } from '@/lib/types/files';

interface SyntaxHighlighterProps {
  code: string;
  language: FileType;
  showLineNumbers?: boolean;
}

const LANGUAGE_MAP: Record<FileType, string> = {
  liquid: 'liquid',
  javascript: 'javascript',
  css: 'css',
  other: 'text',
};

export function SyntaxHighlighter({
  code,
  language,
  showLineNumbers = true,
}: SyntaxHighlighterProps) {
  const prismLang = LANGUAGE_MAP[language] ?? 'text';

  return (
    <SyntaxHighlighterLib
      language={prismLang === 'liquid' ? 'markup' : prismLang}
      style={vscDarkPlus}
      showLineNumbers={showLineNumbers}
      customStyle={{
        margin: 0,
        padding: '1rem',
        background: 'transparent',
        fontSize: '14px',
      }}
      lineNumberStyle={{ minWidth: '2.5em' }}
      PreTag="div"
    >
      {code}
    </SyntaxHighlighterLib>
  );
}
