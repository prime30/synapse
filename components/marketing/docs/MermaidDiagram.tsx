'use client';

import { useEffect, useId, useState } from 'react';

interface MermaidDiagramProps {
  chart: string;
}

/**
 * Client-side mermaid diagram renderer.
 *
 * Uses dynamic import to avoid SSR issues (mermaid requires DOM).
 * Detects dark mode from the document root class and applies appropriate theme.
 * Falls back to raw code display on render error.
 */
export function MermaidDiagram({ chart }: MermaidDiagramProps) {
  const uniqueId = useId();
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function renderDiagram() {
      try {
        const mermaid = (await import('mermaid')).default;

        const isDark = document.documentElement.classList.contains('dark');

        mermaid.initialize({
          startOnLoad: false,
          theme: isDark ? 'dark' : 'neutral',
          fontFamily: 'var(--font-geist-sans), system-ui, sans-serif',
          flowchart: { htmlLabels: true, curve: 'basis' },
          securityLevel: 'strict',
        });

        // mermaid.render needs a valid DOM id (no colons from useId)
        const safeId = `mermaid-${uniqueId.replace(/:/g, '-')}`;
        const { svg: rendered } = await mermaid.render(safeId, chart.trim());

        if (!cancelled) {
          setSvg(rendered);
        }
      } catch (err) {
        console.warn('[MermaidDiagram] Render failed:', err);
        if (!cancelled) {
          setError(true);
        }
      }
    }

    renderDiagram();

    return () => {
      cancelled = true;
    };
  }, [chart, uniqueId]);

  // Error fallback: show raw mermaid source
  if (error) {
    return (
      <div className="overflow-x-auto rounded-lg border border-stone-200 dark:border-white/10 bg-stone-950 dark:bg-white/5 p-4 my-6">
        <pre className="text-sm text-stone-300 dark:text-white/60 font-[family-name:var(--font-geist-mono)]">
          <code>{chart}</code>
        </pre>
      </div>
    );
  }

  // Loading skeleton
  if (!svg) {
    return (
      <div className="my-6 h-64 rounded-lg bg-stone-100 dark:bg-white/5 animate-pulse border border-stone-200 dark:border-white/10" />
    );
  }

  // Rendered diagram
  return (
    <div className="my-6 overflow-x-auto rounded-lg border border-stone-200 dark:border-white/10 bg-white dark:bg-white/5 p-4">
      <div
        className="flex justify-center [&_svg]:max-w-full"
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    </div>
  );
}
