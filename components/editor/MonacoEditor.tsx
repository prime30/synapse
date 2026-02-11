'use client';

import { useCallback, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import type { editor, Range, languages, CancellationToken } from 'monaco-editor';
import { getLiquidDiagnostics } from '@/lib/monaco/diagnostics-provider';
import { getLiquidCodeActions } from '@/lib/monaco/code-action-provider';
import { useEditorSettings } from '@/hooks/useEditorSettings';

const MonacoEditorReact = dynamic(
  () => import('@monaco-editor/react').then((mod) => mod.Editor),
  { ssr: false, loading: () => <div className="flex items-center justify-center h-64 text-gray-500">Loading editor…</div> }
);

export type EditorLanguage = 'liquid' | 'javascript' | 'css' | 'other';

interface MonacoEditorProps {
  value: string;
  onChange: (value: string) => void;
  language: EditorLanguage;
  /** Called when user presses Cmd+S / Ctrl+S (handled inside Monaco) */
  onSaveKeyDown?: () => void;
  /** When true, the editor is read-only (file locked) */
  readOnly?: boolean;
  height?: string | number;
  className?: string;
  /** Called when the user's text selection changes in the editor */
  onSelectionChange?: (selectedText: string | null) => void;
}

const MONACO_LANGUAGE_MAP: Record<EditorLanguage, string> = {
  liquid: 'html',
  javascript: 'javascript',
  css: 'css',
  other: 'plaintext',
};

export function MonacoEditor({
  value,
  onChange,
  language,
  onSaveKeyDown,
  readOnly = false,
  height = '100%',
  className,
  onSelectionChange,
}: MonacoEditorProps) {
  const { settings } = useEditorSettings();
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof import('monaco-editor') | null>(null);
  const onSaveKeyDownRef = useRef(onSaveKeyDown);
  useEffect(() => {
    onSaveKeyDownRef.current = onSaveKeyDown;
  }, [onSaveKeyDown]);

  const onSelectionChangeRef = useRef(onSelectionChange);
  useEffect(() => {
    onSelectionChangeRef.current = onSelectionChange;
  }, [onSelectionChange]);

  const handleEditorDidMount = useCallback(
    (editorInstance: editor.IStandaloneCodeEditor, monaco: typeof import('monaco-editor')) => {
      editorRef.current = editorInstance;
      monacoRef.current = monaco;

      if (onSaveKeyDownRef.current) {
        editorInstance.addCommand(
          monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS,
          () => { onSaveKeyDownRef.current?.(); }
        );
      }

      // Selection change tracking (EPIC 1c: selection injection)
      editorInstance.onDidChangeCursorSelection(() => {
        const model = editorInstance.getModel();
        if (!model || !onSelectionChangeRef.current) return;

        const selection = editorInstance.getSelection();
        if (!selection || selection.isEmpty()) {
          onSelectionChangeRef.current(null);
          return;
        }

        const text = model.getValueInRange(selection);
        onSelectionChangeRef.current(text || null);
      });

      if (language === 'liquid') {
        monaco.languages.registerCodeActionProvider('html', {
          provideCodeActions: (
            model: editor.ITextModel,
            _range: Range,
            _context: languages.CodeActionContext,
            _token: CancellationToken
          ) => {
            const fixes = getLiquidCodeActions();
            const actions = fixes.map((fix) => {
              const start = model.getPositionAt(fix.range.start);
              const end = model.getPositionAt(fix.range.end);
              if (!start || !end) return null;
              return {
                title: fix.title,
                kind: 'quickfix.liquid' as const,
                edit: {
                  edits: [
                    {
                      resource: model.uri,
                      textEdit: {
                        range: monaco.Range.fromPositions(start, end),
                        text: fix.newText,
                      },
                      versionId: model.getVersionId(),
                    },
                  ],
                },
              };
            }).filter((x): x is NonNullable<typeof x> => x != null);
            return { actions, dispose: () => {} };
          },
        });
      }
    },
    [language]
  );

  useEffect(() => {
    if (language !== 'liquid') return;
    const monaco = monacoRef.current;
    const model = editorRef.current?.getModel();
    if (!monaco || !model) return;
    let cancelled = false;

    getLiquidDiagnostics(value).then((diagnostics) => {
      if (cancelled) return;
      const markers = diagnostics.map((d) => ({
        severity: d.severity === 'error' ? monaco.MarkerSeverity.Error : d.severity === 'warning' ? monaco.MarkerSeverity.Warning : monaco.MarkerSeverity.Info,
        message: d.message,
        startLineNumber: d.line,
        startColumn: d.column,
        endLineNumber: d.line,
        endColumn: Math.max(d.column, 1),
      }));
      monaco.editor.setModelMarkers(model, 'liquid', markers);
    });

    return () => {
      cancelled = true;
      const m = monacoRef.current;
      const mod = editorRef.current?.getModel();
      if (m && mod) m.editor.setModelMarkers(mod, 'liquid', []);
    };
  }, [value, language]);

  return (
    <MonacoEditorReact
      height={height}
      language={MONACO_LANGUAGE_MAP[language]}
      value={value}
      onChange={(v) => onChange(v ?? '')}
      onMount={handleEditorDidMount}
      theme="vs-dark"
      options={{
        minimap: { enabled: settings.minimap },
        fontSize: settings.fontSize,
        tabSize: settings.tabSize,
        wordWrap: settings.wordWrap ? 'on' : 'off',
        lineNumbers: settings.lineNumbers ? 'on' : 'off',
        bracketPairColorization: { enabled: settings.bracketMatching },
        scrollBeyondLastLine: false,
        padding: { top: 16 },
        readOnly,
      }}
      className={className}
    />
  );
}
