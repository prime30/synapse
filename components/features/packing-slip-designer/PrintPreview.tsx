'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Printer, ZoomIn, ZoomOut, AlertCircle, Loader2 } from 'lucide-react';
import { renderPackingSlip } from '@/lib/packing-slip-designer/renderer';

interface PrintPreviewProps {
  template: string;
}

const ZOOM_LEVELS = [50, 75, 100, 125] as const;
const PAGE_WIDTH = 816;
const PAGE_HEIGHT = 1056;

export function PrintPreview({ template }: PrintPreviewProps) {
  const [html, setHtml] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [zoom, setZoom] = useState<number>(75);
  const [viewMode, setViewMode] = useState<'single' | 'multipage'>('single');
  const [pageCount, setPageCount] = useState(1);
  const printRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    if (!template.trim()) {
      setHtml('');
      setError(null);
      return;
    }

    setLoading(true);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      const result = await renderPackingSlip(template);
      if (result.error !== null) {
        setError(result.error);
        setHtml('');
      } else {
        setError(null);
        setHtml(result.html);
      }
      setLoading(false);
    }, 400);

    return () => clearTimeout(debounceRef.current);
  }, [template]);

  useEffect(() => {
    if (viewMode !== 'multipage') {
      setPageCount(1);
      return;
    }
    const el = printRef.current;
    if (!el) return;

    const update = () => {
      const contentHeight = Math.max(PAGE_HEIGHT, el.scrollHeight || 0);
      setPageCount(Math.max(1, Math.ceil(contentHeight / PAGE_HEIGHT)));
    };

    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener('resize', update);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [viewMode, html]);

  const handlePrint = useCallback(() => {
    if (!printRef.current) return;
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
<body>${html}</body>
</html>`);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 300);
  }, [html]);

  const cycleZoom = useCallback((direction: 'in' | 'out') => {
    setZoom((prev) => {
      const idx = ZOOM_LEVELS.indexOf(prev as typeof ZOOM_LEVELS[number]);
      if (direction === 'in' && idx < ZOOM_LEVELS.length - 1) return ZOOM_LEVELS[idx + 1];
      if (direction === 'out' && idx > 0) return ZOOM_LEVELS[idx - 1];
      return prev;
    });
  }, []);

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
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={() => cycleZoom('out')}
            disabled={zoom === ZOOM_LEVELS[0]}
            className="p-1.5 rounded-md border border-stone-200 dark:border-white/10 text-stone-600 dark:text-white/60 hover:bg-stone-50 dark:hover:bg-white/5 transition-colors disabled:opacity-30"
            aria-label="Zoom out"
          >
            <ZoomOut size={14} />
          </button>
          <span className="text-xs font-medium text-stone-600 dark:text-gray-400 w-10 text-center">
            {zoom}%
          </span>
          <button
            onClick={() => cycleZoom('in')}
            disabled={zoom === ZOOM_LEVELS[ZOOM_LEVELS.length - 1]}
            className="p-1.5 rounded-md border border-stone-200 dark:border-white/10 text-stone-600 dark:text-white/60 hover:bg-stone-50 dark:hover:bg-white/5 transition-colors disabled:opacity-30"
            aria-label="Zoom in"
          >
            <ZoomIn size={14} />
          </button>
          <span className="text-xs text-stone-400 dark:text-white/30 ml-2">
            8.5 &times; 11 in (US Letter)
          </span>
          <div className="ml-3 inline-flex items-center rounded-md border border-stone-200 dark:border-white/10 overflow-hidden">
            <button
              onClick={() => setViewMode('single')}
              className={`px-2.5 py-1 text-[11px] transition-colors ${
                viewMode === 'single'
                  ? 'bg-stone-900 text-white dark:bg-white dark:text-stone-900'
                  : 'bg-white text-stone-600 hover:bg-stone-50 dark:bg-transparent dark:text-gray-400 dark:hover:bg-white/5'
              }`}
            >
              Single
            </button>
            <button
              onClick={() => setViewMode('multipage')}
              className={`px-2.5 py-1 text-[11px] transition-colors ${
                viewMode === 'multipage'
                  ? 'bg-stone-900 text-white dark:bg-white dark:text-stone-900'
                  : 'bg-white text-stone-600 hover:bg-stone-50 dark:bg-transparent dark:text-gray-400 dark:hover:bg-white/5'
              }`}
            >
              Multi-page
            </button>
          </div>
          {viewMode === 'multipage' && (
            <span className="ml-2 text-[11px] text-stone-500 dark:text-gray-400">
              {pageCount} page{pageCount > 1 ? 's' : ''}
            </span>
          )}
        </div>
        <button
          onClick={handlePrint}
          disabled={!html}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-accent hover:bg-accent-hover text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Printer size={14} />
          Print
        </button>
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-300 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10 px-4 py-3">
          <AlertCircle size={16} className="text-red-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-medium text-red-700 dark:text-red-400">Liquid Render Error</p>
            <p className="text-xs text-red-600 dark:text-red-400/80 mt-1 font-mono">{error}</p>
          </div>
        </div>
      )}

      {/* Page preview */}
      <div className="rounded-lg bg-stone-200 dark:bg-white/5 p-8 flex justify-center overflow-auto">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-stone-500 dark:text-[#636059]">
            <Loader2 size={16} className="animate-spin" />
            Rendering preview...
          </div>
        ) : (
          <div
            style={{
              width: PAGE_WIDTH,
              transform: `scale(${zoom / 100})`,
              transformOrigin: 'top center',
            }}
          >
            <div
              style={{
                position: 'relative',
                width: PAGE_WIDTH,
                minHeight: viewMode === 'multipage' ? pageCount * PAGE_HEIGHT : PAGE_HEIGHT,
              }}
            >
              {viewMode === 'multipage' &&
                Array.from({ length: pageCount }, (_, idx) => (
                  <div
                    key={`page-guide-${idx + 1}`}
                    style={{
                      position: 'absolute',
                      top: idx * PAGE_HEIGHT,
                      left: 0,
                      right: 0,
                      height: PAGE_HEIGHT,
                      borderTop: idx === 0 ? 'none' : '1px dashed rgba(148, 163, 184, 0.7)',
                      borderBottom: '1px solid rgba(148, 163, 184, 0.45)',
                      pointerEvents: 'none',
                      zIndex: 1,
                    }}
                  >
                    <div
                      style={{
                        position: 'absolute',
                        top: 8,
                        right: 10,
                        fontSize: 10,
                        color: '#64748b',
                        background: 'rgba(255,255,255,0.75)',
                        padding: '2px 6px',
                        borderRadius: 4,
                        border: '1px solid rgba(148, 163, 184, 0.35)',
                      }}
                    >
                      Page {idx + 1}
                    </div>
                  </div>
                ))}
            <div
              ref={printRef}
              className="bg-white shadow-2xl"
              style={{
                width: PAGE_WIDTH,
                minHeight: PAGE_HEIGHT,
                height: viewMode === 'single' ? PAGE_HEIGHT : 'auto',
                overflow: viewMode === 'single' ? 'hidden' : 'visible',
                position: 'relative',
                zIndex: 2,
              }}
              dangerouslySetInnerHTML={{
                __html:
                  viewMode === 'multipage'
                    ? `<style>
                         html, body { height: auto !important; overflow: visible !important; }
                         .wrapper, .page, .container { height: auto !important; min-height: 0 !important; overflow: visible !important; }
                       </style>${html}`
                    : html,
              }}
            />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
