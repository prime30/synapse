'use client';

import { useMemo } from 'react';

interface Token {
  text: string;
  type: 'keyword' | 'string' | 'comment' | 'tag' | 'attribute' | 'plain';
}

const TOKEN_COLORS: Record<Token['type'], string> = {
  keyword: '#06b6d4',    // cyan-500
  string: '#0ea5e9',     // sky-500
  comment: '#44403c',    // dark stone
  tag: '#0284c7',        // sky-600
  attribute: '#78716c',  // stone-500
  plain: '#57534e',      // stone-600
};

// Simple tokenizer for Liquid-like code
function tokenize(code: string): Token[][] {
  return code.split('\n').map((line) => {
    const tokens: Token[] = [];
    let remaining = line;

    while (remaining.length > 0) {
      // Comments
      const commentMatch = remaining.match(/^(\/\/.*|\/\*.*?\*\/|{%\s*comment\s*%}.*?{%\s*endcomment\s*%})/);
      if (commentMatch) {
        tokens.push({ text: commentMatch[0], type: 'comment' });
        remaining = remaining.slice(commentMatch[0].length);
        continue;
      }

      // Strings
      const stringMatch = remaining.match(/^("[^"]*"|'[^']*')/);
      if (stringMatch) {
        tokens.push({ text: stringMatch[0], type: 'string' });
        remaining = remaining.slice(stringMatch[0].length);
        continue;
      }

      // Liquid tags
      const tagMatch = remaining.match(/^({%.*?%}|{{.*?}})/);
      if (tagMatch) {
        tokens.push({ text: tagMatch[0], type: 'tag' });
        remaining = remaining.slice(tagMatch[0].length);
        continue;
      }

      // Keywords
      const kwMatch = remaining.match(/^(const|let|var|function|async|await|return|if|else|for|import|export|class|extends)\b/);
      if (kwMatch) {
        tokens.push({ text: kwMatch[0], type: 'keyword' });
        remaining = remaining.slice(kwMatch[0].length);
        continue;
      }

      // HTML attributes
      const attrMatch = remaining.match(/^(\w+)(?==)/);
      if (attrMatch) {
        tokens.push({ text: attrMatch[0], type: 'attribute' });
        remaining = remaining.slice(attrMatch[0].length);
        continue;
      }

      // Plain text (single char fallback)
      tokens.push({ text: remaining[0], type: 'plain' });
      remaining = remaining.slice(1);
    }

    return tokens;
  });
}

const SAMPLE_CODE = `{% schema %}
  { "name": "Featured Collection" }
{% endschema %}

{% for product in collection.products %}
  <div class="product-card">
    <h3>{{ product.title }}</h3>
    <span>{{ product.price | money }}</span>
  </div>
{% endfor %}

// AI Agent: optimizing layout
const layout = await agent.analyze();
export default layout;`;

interface SyntaxHighlightTextureProps {
  code?: string;
  opacity?: number;
  className?: string;
}

export function SyntaxHighlightTexture({
  code = SAMPLE_CODE,
  opacity = 0.04,
  className = '',
}: SyntaxHighlightTextureProps) {
  const tokenized = useMemo(() => tokenize(code), [code]);

  return (
    <div
      className={`absolute inset-0 overflow-hidden pointer-events-none select-none ${className}`}
      aria-hidden="true"
      style={{ opacity, mixBlendMode: 'soft-light' as const }}
    >
      <pre className="font-mono text-[9px] leading-[13px] whitespace-pre p-4">
        {tokenized.map((line, i) => (
          <div key={i}>
            {line.map((token, j) => (
              <span key={j} style={{ color: TOKEN_COLORS[token.type] }}>
                {token.text}
              </span>
            ))}
          </div>
        ))}
      </pre>
    </div>
  );
}
