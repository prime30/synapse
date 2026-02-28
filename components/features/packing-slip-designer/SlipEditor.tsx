'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { ChevronRight, ChevronDown, Copy, Check } from 'lucide-react';
import { SHOPIFY_VARIABLE_GROUPS } from '@/lib/packing-slip-designer/types';

interface SlipEditorProps {
  value: string;
  onChange: (value: string) => void;
}

let MonacoEditor: React.ComponentType<{
  height: string;
  language: string;
  theme: string;
  value: string;
  onChange?: (value: string | undefined) => void;
  options?: Record<string, unknown>;
}> | null = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let registerLiquidLanguage: ((monaco: any) => void) | null = null;

export function SlipEditor({ value, onChange }: SlipEditorProps) {
  const [monacoReady, setMonacoReady] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [expandedGroup, setExpandedGroup] = useState<string | null>('Order');
  const [copiedVar, setCopiedVar] = useState<string | null>(null);
  const monacoRef = useRef<unknown>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      import('@monaco-editor/react'),
      import('@/lib/liquid/monaco-liquid-language'),
    ]).then(([editorModule, liquidModule]) => {
      if (cancelled) return;
      MonacoEditor = editorModule.default;
      registerLiquidLanguage = liquidModule.registerLiquidLanguage;
      setMonacoReady(true);
    });
    return () => { cancelled = true; };
  }, []);

  const handleEditorMount = useCallback((_editor: unknown, monaco: unknown) => {
    monacoRef.current = monaco;
    if (registerLiquidLanguage) {
      registerLiquidLanguage(monaco);
    }
  }, []);

  const handleChange = useCallback(
    (val: string | undefined) => {
      onChange(val ?? '');
    },
    [onChange],
  );

  const copyVariable = useCallback(async (variable: string) => {
    try {
      await navigator.clipboard.writeText(variable);
      setCopiedVar(variable);
      setTimeout(() => setCopiedVar(null), 1500);
    } catch {
      /* clipboard may not be available */
    }
  }, []);

  const toggleGroup = useCallback((label: string) => {
    setExpandedGroup((prev) => (prev === label ? null : label));
  }, []);

  if (!value.trim()) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <p className="text-sm text-stone-500 dark:text-[#636059]">
          No template loaded. Select a template or import one first.
        </p>
      </div>
    );
  }

  return (
    <div className="flex gap-4" style={{ minHeight: '600px' }}>
      {/* Editor */}
      <div className="flex-1 rounded-lg border border-stone-200 dark:border-white/10 overflow-hidden bg-white dark:bg-[#1e1e1e]">
        {monacoReady && MonacoEditor ? (
          <MonacoEditor
            height="600px"
            language="liquid"
            theme="vs-dark"
            value={value}
            onChange={handleChange}
            options={{
              fontSize: 13,
              lineNumbers: 'on',
              minimap: { enabled: false },
              wordWrap: 'on',
              scrollBeyondLastLine: false,
              automaticLayout: true,
              tabSize: 2,
              padding: { top: 12 },
            }}
            // @ts-expect-error -- onMount signature mismatch with dynamic import
            onMount={handleEditorMount}
          />
        ) : (
          <div className="flex items-center justify-center h-[600px]">
            <div className="animate-pulse text-sm text-stone-500 dark:text-[#636059]">Loading editor...</div>
          </div>
        )}
      </div>

      {/* Variable reference sidebar */}
      <div
        className={`shrink-0 transition-all duration-200 ${
          sidebarOpen ? 'w-64' : 'w-8'
        }`}
      >
        {sidebarOpen ? (
          <div className="rounded-lg border border-stone-200 dark:border-white/10 bg-white dark:bg-[#141414] h-[600px] flex flex-col">
            <div className="flex items-center justify-between px-3 py-2.5 border-b border-stone-200 dark:border-white/10">
              <span className="text-xs font-semibold text-stone-900 dark:text-white">
                Shopify Variables
              </span>
              <button
                onClick={() => setSidebarOpen(false)}
                className="p-0.5 rounded hover:bg-stone-100 dark:hover:bg-white/10 transition-colors"
                aria-label="Collapse sidebar"
              >
                <ChevronRight size={14} className="text-stone-400 dark:text-white/40" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {SHOPIFY_VARIABLE_GROUPS.map((group) => (
                <div key={group.label}>
                  <button
                    onClick={() => toggleGroup(group.label)}
                    className="w-full flex items-center gap-1.5 px-2 py-1.5 text-xs font-medium text-stone-700 dark:text-white/70 hover:bg-stone-50 dark:hover:bg-white/5 rounded transition-colors"
                  >
                    {expandedGroup === group.label ? (
                      <ChevronDown size={12} />
                    ) : (
                      <ChevronRight size={12} />
                    )}
                    {group.label}
                  </button>
                  {expandedGroup === group.label && (
                    <div className="ml-3 space-y-0.5">
                      {group.variables.map((v) => (
                        <button
                          key={v}
                          onClick={() => copyVariable(v)}
                          className="w-full flex items-center justify-between gap-1 px-2 py-1 text-[11px] font-mono text-stone-600 dark:text-gray-400 hover:bg-stone-50 dark:hover:bg-white/5 rounded transition-colors group"
                          title={`Click to copy: ${v}`}
                        >
                          <span className="truncate">{v}</span>
                          {copiedVar === v ? (
                            <Check size={10} className="shrink-0 text-emerald-500" />
                          ) : (
                            <Copy
                              size={10}
                              className="shrink-0 text-stone-300 dark:text-white/20 opacity-0 group-hover:opacity-100 transition-opacity"
                            />
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <button
            onClick={() => setSidebarOpen(true)}
            className="w-8 h-[600px] rounded-lg border border-stone-200 dark:border-white/10 bg-white dark:bg-[#141414] flex items-center justify-center hover:bg-stone-50 dark:hover:bg-white/5 transition-colors"
            aria-label="Expand variable reference"
          >
            <ChevronRight
              size={14}
              className="text-stone-400 dark:text-white/40 rotate-180"
            />
          </button>
        )}
      </div>
    </div>
  );
}
