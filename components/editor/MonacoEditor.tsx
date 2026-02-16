'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTheme } from '@/hooks/useTheme';
import dynamic from 'next/dynamic';
import type { editor, Range, languages, CancellationToken } from 'monaco-editor';
import { registerLiquidLanguage } from '@/lib/liquid/monaco-liquid-language';
import { useEditorSettings } from '@/hooks/useEditorSettings';
import type { FileResolver } from '@/lib/monaco/liquid-definition-provider';

// Lazy-loaded provider modules (populated asynchronously after editor mounts).
// Using module-level cache so repeat mounts don't re-import.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _lazyProviders: Record<string, any> | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _lazyProviderPromise: Promise<Record<string, any>> | null = null;

function loadProviders() {
  if (_lazyProviders) return Promise.resolve(_lazyProviders);
  if (!_lazyProviderPromise) {
    _lazyProviderPromise = Promise.all([
      import('@/lib/monaco/diagnostics-provider'),
      import('@/lib/monaco/code-action-provider'),
      import('@/lib/monaco/liquid-completion-provider'),
      import('@/lib/monaco/liquid-definition-provider'),
      import('@/lib/monaco/translation-provider'),
      import('@/lib/monaco/linked-editing-provider'),
      import('@/lib/monaco/inline-completion-provider'),
      import('@/lib/liquid/formatter'),
      import('@/lib/liquid/unused-detector'),
    ]).then(([diag, codeAction, completion, definition, translation, linked, inline, formatter, unused]) => {
      _lazyProviders = {
        getLiquidDiagnostics: diag.getLiquidDiagnostics,
        getLiquidCodeActions: codeAction.getLiquidCodeActions,
        createLiquidCompletionProvider: completion.createLiquidCompletionProvider,
        createLiquidDefinitionProvider: definition.createLiquidDefinitionProvider,
        createTranslationProvider: translation.createTranslationProvider,
        createLinkedEditingProvider: linked.createLinkedEditingProvider,
        createInlineCompletionProvider: inline.createInlineCompletionProvider,
        formatLiquid: formatter.formatLiquid,
        detectUnusedVariables: unused.detectUnusedVariables,
      };
      return _lazyProviders;
    });
  }
  return _lazyProviderPromise;
}

const MonacoEditorReact = dynamic(
  () => import('@monaco-editor/react').then((mod) => mod.Editor),
  { ssr: false, loading: () => <div className="flex items-center justify-center h-64 ide-text-3">Loading editor…</div> }
);

export type EditorLanguage = 'liquid' | 'javascript' | 'css' | 'other';

interface MonacoEditorProps {
  value?: string;
  onChange: (value: string) => void;
  language: EditorLanguage;
  /** Called when user presses Cmd+S / Ctrl+S (handled inside Monaco) */
  onSaveKeyDown?: () => void;
  /** When true, the editor is read-only (file locked) */
  readOnly?: boolean;
  height?: string | number;
  className?: string;
  /** Called when the user's text selection changes (text + line range for chat pill) */
  onSelectionChange?: (selection: { text: string; startLine: number; endLine: number } | null) => void;
  /** Called when user pastes an image – parent can handle "Add as asset" */
  onImagePaste?: (file: File) => void;
  /** EPIC 5: Called when user triggers "Fix with AI" on a diagnostic */
  onFixWithAI?: (message: string, line: number) => void;
  /** EPIC 5: Called with selection position info for quick actions toolbar */
  onSelectionPosition?: (position: { top: number; left: number; text: string } | null) => void;
  /** EPIC 6: File resolver for go-to-definition (render/section/asset references) */
  fileResolver?: FileResolver;
  /** EPIC 6: Getter for locale entries (for translation completions inside {{ 'key' | t }}) */
  getLocaleEntries?: () => Array<{ key: string; value: string }>;
  /** EPIC 7: Called when Ctrl+backtick is pressed to toggle console */
  onToggleConsole?: () => void;
  /** Called after editor mounts with the editor instance (for Yjs binding) */
  onEditorMount?: (editor: import('monaco-editor').editor.IStandaloneCodeEditor) => void;
  /** Enable Cursor-like inline (ghost) completions via /api/ai/complete-inline */
  enableInlineCompletions?: boolean;
  /** File path for completion context (e.g. sections/hero.liquid). */
  filePathForCompletions?: string | null;
}

const MONACO_LANGUAGE_MAP: Record<EditorLanguage, string> = {
  liquid: 'liquid',
  javascript: 'javascript',
  css: 'css',
  other: 'plaintext',
};

/* ── Feature 11: exclude '.' so double-click selects full Liquid object paths ── */
const CUSTOM_WORD_SEPARATORS = '`~!@#$%^&*()-=+[{]}\\|;:\'",<>/?';

/* ── Feature 4 helpers: stack-based matching of Liquid block tags ─────────── */
const LIQUID_OPEN_TO_CLOSE: Record<string, string> = {
  if: 'endif',
  for: 'endfor',
  unless: 'endunless',
  case: 'endcase',
  capture: 'endcapture',
};
const LIQUID_CLOSE_TO_OPEN: Record<string, string> = Object.fromEntries(
  Object.entries(LIQUID_OPEN_TO_CLOSE).map(([k, v]) => [v, k]),
);

/* ── Feature: Auto-close Liquid block tags ─────────────────────────────── */
const AUTO_CLOSE_TAGS: Record<string, string> = {
  if: 'endif',
  for: 'endfor',
  unless: 'endunless',
  case: 'endcase',
  capture: 'endcapture',
  form: 'endform',
  paginate: 'endpaginate',
  tablerow: 'endtablerow',
  comment: 'endcomment',
  raw: 'endraw',
};

/* ── Deprecated tags/filters (EPIC 6 feature 7) ───────────────────────── */
const DEPRECATED_TAGS: Record<string, string> = {
  include: 'Deprecated: Use {% render %} instead of {% include %}',
};

const DEPRECATED_FILTERS: Record<string, string> = {
  img_tag: 'Deprecated: Use the image_tag filter or manual <img> tag instead of | img_tag',
  img_url: 'Deprecated: Use the image_url filter instead of | img_url',
  currency_selector: 'Deprecated: Use the localization form instead of | currency_selector',
  script_tag: 'Deprecated: Use a <script> tag instead of | script_tag',
  stylesheet_tag: 'Deprecated: Use a <link> tag instead of | stylesheet_tag',
};

function findMatchingLiquidTag(
  content: string,
  tagName: string,
  tagOffset: number,
): { start: number; end: number } | null {
  const isClosing = tagName.startsWith('end');
  const openTag = isClosing ? LIQUID_CLOSE_TO_OPEN[tagName] : tagName;
  const closeTag = isClosing ? tagName : LIQUID_OPEN_TO_CLOSE[tagName];
  if (!openTag || !closeTag) return null;

  const re = new RegExp(`\\{%[-\\s]*(${openTag}|${closeTag})[\\s%-]*%\\}`, 'g');

  if (!isClosing) {
    re.lastIndex = tagOffset + 1;
    let depth = 1;
    let m: RegExpExecArray | null;
    while ((m = re.exec(content)) !== null) {
      if (m[1] === openTag) depth++;
      else if (m[1] === closeTag) {
        depth--;
        if (depth === 0) return { start: m.index, end: m.index + m[0].length };
      }
    }
  } else {
    const tags: { name: string; start: number; end: number }[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(content)) !== null) {
      if (m.index >= tagOffset) break;
      tags.push({ name: m[1], start: m.index, end: m.index + m[0].length });
    }
    let depth = 1;
    for (let i = tags.length - 1; i >= 0; i--) {
      const t = tags[i];
      if (t.name === closeTag) depth++;
      else if (t.name === openTag) {
        depth--;
        if (depth === 0) return { start: t.start, end: t.end };
      }
    }
  }
  return null;
}

/* ── Feature 8 helper: deterministic hash for unique CSS class names ──────── */
function hashColor(color: string): string {
  let h = 0;
  for (let i = 0; i < color.length; i++) {
    h = ((h << 5) - h) + color.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h).toString(36);
}

/* ═════════════════════════════════════════════════════════════════════════════
   Component
   ═════════════════════════════════════════════════════════════════════════════ */

export function MonacoEditor({
  value,
  onChange,
  language,
  onSaveKeyDown,
  readOnly = false,
  height = '100%',
  className,
  onSelectionChange,
  onImagePaste,
  onFixWithAI,
  onSelectionPosition,
  fileResolver,
  getLocaleEntries,
  onToggleConsole,
  onEditorMount,
  enableInlineCompletions = false,
  filePathForCompletions = null,
}: MonacoEditorProps) {
  const { settings } = useEditorSettings();
  const { isDark } = useTheme();
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof import('monaco-editor') | null>(null);

  /* Stable refs for callbacks consumed inside handleEditorDidMount */
  const onSaveKeyDownRef = useRef(onSaveKeyDown);
  useEffect(() => { onSaveKeyDownRef.current = onSaveKeyDown; }, [onSaveKeyDown]);

  const onSelectionChangeRef = useRef(onSelectionChange);
  useEffect(() => { onSelectionChangeRef.current = onSelectionChange; }, [onSelectionChange]);

  const onFixWithAIRef = useRef(onFixWithAI);
  useEffect(() => { onFixWithAIRef.current = onFixWithAI; }, [onFixWithAI]);

  const onSelectionPositionRef = useRef(onSelectionPosition);
  useEffect(() => { onSelectionPositionRef.current = onSelectionPosition; }, [onSelectionPosition]);

  const onEditorMountRef = useRef(onEditorMount);
  useEffect(() => { onEditorMountRef.current = onEditorMount; }, [onEditorMount]);

  const enableInlineCompletionsRef = useRef(enableInlineCompletions);
  const filePathForCompletionsRef = useRef(filePathForCompletions);
  useEffect(() => {
    enableInlineCompletionsRef.current = enableInlineCompletions;
    filePathForCompletionsRef.current = filePathForCompletions;
  }, [enableInlineCompletions, filePathForCompletions]);

  /* Feature 12 – paste-dialog state */
  const [pasteDialog, setPasteDialog] = useState<{
    file: File;
    base64: string;
    position: { x: number; y: number };
  } | null>(null);

  /* Refs for decoration collections & injected <style> (cleaned up on unmount) */
  const tagDecorationsRef = useRef<editor.IEditorDecorationsCollection | null>(null);
  const colorDecorationsRef = useRef<editor.IEditorDecorationsCollection | null>(null);
  const styleElRef = useRef<HTMLStyleElement | null>(null);
  const inlineCompletionDisposableRef = useRef<import('monaco-editor').IDisposable | null>(null);

  /* ── Main mount handler ────────────────────────────────────────────────── */
  const handleEditorDidMount = useCallback(
    (editorInstance: editor.IStandaloneCodeEditor, monaco: typeof import('monaco-editor')) => {
      editorRef.current = editorInstance;
      monacoRef.current = monaco;

      /* EPIC 4: Register Liquid language for syntax highlighting */
      registerLiquidLanguage(monaco);

      /* Ctrl+S / Cmd+S save binding */
      if (onSaveKeyDownRef.current) {
        editorInstance.addCommand(
          monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS,
          () => { onSaveKeyDownRef.current?.(); },
        );
      }

      /* ═══════════════════════════════════════════════════════════════════
         EPIC 7 – Keyboard Workflow
         ═══════════════════════════════════════════════════════════════════ */

      /* Ctrl+D: Select next occurrence */
      editorInstance.addAction({
        id: 'synapse.selectNextOccurrence',
        label: 'Select Next Occurrence',
        keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyD],
        run: (ed) => {
          ed.trigger('keyboard', 'editor.action.addSelectionToNextFindMatch', null);
        },
      });

      /* Ctrl+Backtick: Toggle theme console */
      if (onToggleConsole) {
        editorInstance.addCommand(
          monaco.KeyMod.CtrlCmd | monaco.KeyCode.Backquote,
          () => { onToggleConsole(); },
        );
      }

      /* Selection change tracking (EPIC 1c: selection injection + line range for chat pill) */
      editorInstance.onDidChangeCursorSelection(() => {
        const model = editorInstance.getModel();
        if (!model || !onSelectionChangeRef.current) return;
        const selection = editorInstance.getSelection();
        if (!selection || selection.isEmpty()) {
          onSelectionChangeRef.current(null);
          return;
        }
        const text = model.getValueInRange(selection);
        const startLine = selection.startLineNumber;
        const endLine = selection.endLineNumber;
        onSelectionChangeRef.current(text ? { text, startLine, endLine } : null);

        // EPIC 5: Report position for quick actions toolbar
        if (onSelectionPositionRef.current) {
          if (!selection || selection.isEmpty()) {
            onSelectionPositionRef.current(null);
          } else {
            if (text && text.trim().length > 0) {
              const coords = editorInstance.getScrolledVisiblePosition(selection.getStartPosition());
              if (coords) {
                onSelectionPositionRef.current({
                  top: coords.top,
                  left: coords.left,
                  text,
                });
              }
            } else {
              onSelectionPositionRef.current(null);
            }
          }
        }
      });

      /* Notify parent of editor mount (e.g. Yjs collaborative binding) — synchronous */
      onEditorMountRef.current?.(editorInstance);

      // ── Async: lazy-load language providers after the editor is interactive ──
      loadProviders().then((providers) => {
        // Guard: editor may have been disposed during the async gap
        if (!editorRef.current || editorRef.current !== editorInstance) return;

      /* Liquid code-action provider */
      if (language === 'liquid') {
        monaco.languages.registerCodeActionProvider('liquid', {
          provideCodeActions: (
            model: editor.ITextModel,
            _range: Range,
            _context: languages.CodeActionContext,
            _token: CancellationToken,
          ) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const fixes = providers.getLiquidCodeActions() as any[];
            const actions: languages.CodeAction[] = [];
            for (const fix of fixes) {
              const start = model.getPositionAt(fix.range.start);
              const end = model.getPositionAt(fix.range.end);
              if (!start || !end) continue;
              actions.push({
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
              });
            }

            // EPIC 5: "Fix with AI" code action on Liquid diagnostics
            const markers = monaco.editor.getModelMarkers({ resource: model.uri });
            const lineMarkers = markers.filter(m =>
              _range.containsRange(new monaco.Range(m.startLineNumber, m.startColumn, m.endLineNumber, m.endColumn)) ||
              (m.startLineNumber >= _range.startLineNumber && m.startLineNumber <= _range.endLineNumber)
            );

            for (const marker of lineMarkers) {
              actions.push({
                title: `Fix with AI: ${marker.message.slice(0, 60)}`,
                kind: 'refactor.ai' as const,
                diagnostics: [marker],
                command: {
                  id: 'synapse.fixWithAI',
                  title: 'Fix with AI',
                  arguments: [marker.message, marker.startLineNumber, model.uri.toString()],
                },
              });
            }

            return { actions, dispose: () => {} };
          },
        });

        // EPIC 5: Register "Fix with AI" command handler
        editorInstance.addAction({
          id: 'synapse.fixWithAI',
          label: 'Fix with AI',
          run: (_ed, ...args: unknown[]) => {
            if (onFixWithAIRef.current && args.length >= 1) {
              const message = args[0] as string;
              const line = (args[1] as number) ?? 0;
              onFixWithAIRef.current(message, line);
            }
          },
        });
      }

      /* ═══════════════════════════════════════════════════════════════════
         Feature 4 – Matching Liquid Tag Highlights
         ═══════════════════════════════════════════════════════════════════ */
      const styleEl = document.createElement('style');
      styleEl.setAttribute('data-synapse', 'monaco-extras');
      styleEl.textContent =
        '.liquid-tag-highlight{background-color:rgba(86,156,214,.15);border:1px solid rgba(86,156,214,.3);border-radius:2px}';
      document.head.appendChild(styleEl);
      styleElRef.current = styleEl;

      const tagDecs = editorInstance.createDecorationsCollection([]);
      tagDecorationsRef.current = tagDecs;

      editorInstance.onDidChangeCursorPosition((e) => {
        const model = editorInstance.getModel();
        if (!model) {
          tagDecs.clear();
          return;
        }

        const { lineNumber, column } = e.position;
        const lineContent = model.getLineContent(lineNumber);

        const tagRe =
          /\{%[-\s]*(if|elsif|else|endif|for|endfor|unless|endunless|case|when|endcase|capture|endcapture)[\s%-]*%\}/g;
        let found: { name: string; colStart: number; colEnd: number } | null = null;
        let m: RegExpExecArray | null;
        while ((m = tagRe.exec(lineContent)) !== null) {
          const cStart = m.index + 1; // 1-based column
          const cEnd = m.index + m[0].length + 1;
          if (column >= cStart && column <= cEnd) {
            found = { name: m[1], colStart: cStart, colEnd: cEnd };
            break;
          }
        }

        // Skip middle tags (elsif, else, when) – nothing to pair
        if (!found || ['elsif', 'else', 'when'].includes(found.name)) {
          tagDecs.clear();
          return;
        }

        const content = model.getValue();
        const offset = model.getOffsetAt({ lineNumber, column: found.colStart });
        const matchResult = findMatchingLiquidTag(content, found.name, offset);
        if (!matchResult) {
          tagDecs.clear();
          return;
        }

        const mStart = model.getPositionAt(matchResult.start);
        const mEnd = model.getPositionAt(matchResult.end);

        tagDecs.set([
          {
            range: new monaco.Range(lineNumber, found.colStart, lineNumber, found.colEnd),
            options: { isWholeLine: false, className: 'liquid-tag-highlight' },
          },
          {
            range: new monaco.Range(mStart.lineNumber, mStart.column, mEnd.lineNumber, mEnd.column),
            options: { isWholeLine: false, className: 'liquid-tag-highlight' },
          },
        ]);
      });

      /* ═══════════════════════════════════════════════════════════════════
         Feature 5 – Schema Auto-Fold on Liquid File Open
         ═══════════════════════════════════════════════════════════════════ */
      if (language === 'liquid') {
        setTimeout(() => {
          const model = editorInstance.getModel();
          if (!model) return;
          const text = model.getValue();
          const sStart = text.indexOf('{% schema %}');
          const sEnd = text.indexOf('{% endschema %}');
          if (sStart === -1 || sEnd === -1) return;

          const startPos = model.getPositionAt(sStart);
          const endPos = model.getPositionAt(sEnd + '{% endschema %}'.length);
          editorInstance.setSelection(
            new monaco.Selection(startPos.lineNumber, 1, endPos.lineNumber, 1),
          );
          editorInstance.trigger('keyboard', 'editor.createFoldingRangeFromSelection', null);
          editorInstance.setPosition({ lineNumber: 1, column: 1 });
          editorInstance.revealLine(1);
        }, 150);
      }

      /* ═══════════════════════════════════════════════════════════════════
         Feature 8 – Color Swatches Inline (skip for CSS/SCSS/LESS: Monaco provides one)
         ═══════════════════════════════════════════════════════════════════ */
      const hasBuiltInColorProvider = language === 'css';
      if (!hasBuiltInColorProvider) {
        const colorDecs = editorInstance.createDecorationsCollection([]);
        colorDecorationsRef.current = colorDecs;
        let colorTimer: ReturnType<typeof setTimeout> | null = null;

        const scanColors = () => {
          const model = editorInstance.getModel();
          if (!model) return;

          const text = model.getValue();
          const lines = text.split('\n');
          const maxLines = Math.min(lines.length, 1000);
          const colorRe =
            /#[0-9a-fA-F]{3,8}\b|rgb\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\)|hsl\(\s*\d+\s*,\s*\d+%?\s*,\s*\d+%?\s*\)/g;

          const decs: editor.IModelDeltaDecoration[] = [];
          const cssRules: string[] = [];
          const seen = new Set<string>();

          for (let i = 0; i < maxLines; i++) {
            colorRe.lastIndex = 0;
            let cm: RegExpExecArray | null;
            while ((cm = colorRe.exec(lines[i])) !== null) {
              const color = cm[0];
              const h = hashColor(color);
              const cls = `color-swatch-${h}`;
              if (!seen.has(h)) {
                seen.add(h);
                cssRules.push(
                  `.${cls}::before{content:'';display:inline-block;width:12px;height:12px;` +
                  `background-color:${color};border:1px solid rgba(255,255,255,.3);` +
                  `border-radius:2px;margin-right:4px;vertical-align:middle}`,
                );
              }
              decs.push({
                range: new monaco.Range(i + 1, cm.index + 1, i + 1, cm.index + color.length + 1),
                options: { isWholeLine: false, beforeContentClassName: cls },
              });
            }
          }

          /* Merge: keep liquid-tag-highlight base rule + append swatch rules */
          if (styleElRef.current) {
            styleElRef.current.textContent =
              '.liquid-tag-highlight{background-color:rgba(86,156,214,.15);border:1px solid rgba(86,156,214,.3);border-radius:2px}\n' +
              cssRules.join('\n');
          }
          colorDecs.set(decs);
        };

        scanColors(); // initial pass
        editorInstance.onDidChangeModelContent(() => {
          if (colorTimer) clearTimeout(colorTimer);
          colorTimer = setTimeout(scanColors, 300);
        });
      } else {
        colorDecorationsRef.current = null;
      }

      /* ═══════════════════════════════════════════════════════════════════
         Feature 9 – Schema Setting Preview on Hover
         ═══════════════════════════════════════════════════════════════════ */
      monaco.languages.registerHoverProvider('liquid', {
        provideHover(model, position) {
          const text = model.getValue();
          const sStartIdx = text.indexOf('{% schema %}');
          const sEndIdx = text.indexOf('{% endschema %}');
          if (sStartIdx === -1 || sEndIdx === -1) return null;

          const sStartPos = model.getPositionAt(sStartIdx);
          const sEndPos = model.getPositionAt(sEndIdx);
          if (position.lineNumber < sStartPos.lineNumber || position.lineNumber > sEndPos.lineNumber)
            return null;

          const jsonText = text.substring(sStartIdx + '{% schema %}'.length, sEndIdx).trim();
          let schema: Record<string, unknown>;
          try {
            schema = JSON.parse(jsonText);
          } catch {
            return null;
          }

          /* Gather all settings (top-level + inside blocks) */
          const allSettings: Record<string, unknown>[] = [
            ...((schema.settings as Record<string, unknown>[]) ?? []),
          ];
          for (const block of (schema.blocks as Record<string, unknown>[]) ?? []) {
            if (Array.isArray(block.settings))
              allSettings.push(...(block.settings as Record<string, unknown>[]));
          }
          if (allSettings.length === 0) return null;

          const word = model.getWordAtPosition(position);
          if (!word) return null;
          const lineContent = model.getLineContent(position.lineNumber);

          for (const setting of allSettings) {
            const id = setting.id as string | undefined;
            const type = setting.type as string | undefined;
            if (!id && !type) continue;
            if (
              (id && !lineContent.includes(`"${id}"`)) &&
              (type && !lineContent.includes(`"${type}"`))
            )
              continue;

            let md = '';
            switch (type) {
              case 'color':
                md = `**Color setting** — Renders a color picker${setting.default ? `\n\nDefault: \`${setting.default}\`` : ''}`;
                break;
              case 'range':
                md =
                  `**Range setting** — min: ${(setting.min as number) ?? '?'}, ` +
                  `max: ${(setting.max as number) ?? '?'}, step: ${(setting.step as number) ?? 1}` +
                  `${setting.default != null ? `\n\nDefault: \`${setting.default}\`` : ''}`;
                break;
              case 'select': {
                const opts = (
                  (setting.options as Array<string | { label?: string; value: string }>) ?? []
                )
                  .map((o) => (typeof o === 'string' ? o : o.label ?? o.value))
                  .join(', ');
                md = `**Select setting** — Options: ${opts || 'none'}`;
                break;
              }
              default:
                md =
                  `**${type ?? 'Unknown'} setting**` +
                  `${setting.info ? ` — ${setting.info}` : ''}` +
                  `${setting.label ? `\n\nLabel: "${setting.label}"` : ''}`;
            }

            return {
              range: new monaco.Range(
                position.lineNumber,
                word.startColumn,
                position.lineNumber,
                word.endColumn,
              ),
              contents: [{ value: md }],
            };
          }
          return null;
        },
      });

      /* ═══════════════════════════════════════════════════════════════════
         Feature 12 – Paste Image Handler
         ═══════════════════════════════════════════════════════════════════ */
      const editorDomNode = editorInstance.getDomNode();
      if (editorDomNode) {
        editorDomNode.addEventListener('paste', (e: Event) => {
          const ce = e as ClipboardEvent;
          const items = ce.clipboardData?.items;
          if (!items) return;

          for (const item of Array.from(items)) {
            if (item.type.startsWith('image/')) {
              ce.preventDefault();
              const file = item.getAsFile();
              if (!file) return;

              const reader = new FileReader();
              reader.onload = () => {
                const base64 = reader.result as string;
                const pos = editorInstance.getPosition();
                const coords = pos ? editorInstance.getScrolledVisiblePosition(pos) : null;
                const rect = editorDomNode.getBoundingClientRect();
                setPasteDialog({
                  file,
                  base64,
                  position: {
                    x: rect.left + (coords?.left ?? 100),
                    y: rect.top + (coords?.top ?? 100) + 20,
                  },
                });
              };
              reader.readAsDataURL(file);
              return;
            }
          }
        });
      }

      /* ═══════════════════════════════════════════════════════════════════
         Feature 13 – Right-Click "Find All References"
         ═══════════════════════════════════════════════════════════════════ */
      editorInstance.addAction({
        id: 'synapse.findAllReferences',
        label: 'Find All References',
        contextMenuGroupId: '1_modification',
        contextMenuOrder: 10,
        keybindings: [monaco.KeyMod.Shift | monaco.KeyCode.F12],
        run: (ed) => {
          const sel = ed.getSelection();
          const mdl = ed.getModel();
          if (!sel || !mdl) return;
          const selectedText = mdl.getValueInRange(sel);
          const word = selectedText || mdl.getWordAtPosition(ed.getPosition()!)?.word;
          if (!word) return;

          /* Pre-fill find widget with the word */
          const fc = ed.getContribution('editor.contrib.findController') as
            | { setSearchString: (s: string) => void }
            | null;
          if (fc) fc.setSearchString(word);
          ed.trigger('keyboard', 'actions.find', null);
          setTimeout(() => {
            ed.trigger('keyboard', 'editor.action.nextMatchFindAction', null);
          }, 50);
        },
      });

      /* ═══════════════════════════════════════════════════════════════════
         EPIC 6 – Language Intelligence Providers
         ═══════════════════════════════════════════════════════════════════ */
      if (language === 'liquid') {
        /* 1. Object-aware + schema-setting completions */
        monaco.languages.registerCompletionItemProvider(
          'liquid',
          providers.createLiquidCompletionProvider(monaco),
        );

        /* 2. Go-to-definition (render, section, include, asset_url) */
        if (fileResolver) {
          monaco.languages.registerDefinitionProvider(
            'liquid',
            providers.createLiquidDefinitionProvider(monaco, fileResolver),
          );
        }

        /* 3. Translation completions {{ 'key' | t }} */
        if (getLocaleEntries) {
          monaco.languages.registerCompletionItemProvider(
            'liquid',
            providers.createTranslationProvider(monaco, getLocaleEntries),
          );
        }

        /* 5. Auto-close Liquid block pairs on typing %} */
        const model = editorInstance.getModel();
        if (model) {
          model.onDidChangeContent((e) => {
            const insert = e.changes.find((c) => c.text.length > 0);
            const text = insert?.text ?? '';
            if (!text.endsWith('}')) return;
            const pos = editorInstance.getPosition();
            if (!pos) return;

            const lineContent = model.getLineContent(pos.lineNumber);
            const beforeCursor = lineContent.substring(0, pos.column - 1);

            /* Match opening block tag: {% if ... %} or {%- for ... -%} */
            const tagMatch = beforeCursor.match(
              /\{%-?\s*(if|for|unless|case|capture|form|paginate|tablerow|comment|raw)\b[^%]*[-%]?\}$/,
            );
            if (!tagMatch) return;

            const tagName = tagMatch[1];
            const closeTag = AUTO_CLOSE_TAGS[tagName];
            if (!closeTag) return;

            /* Don't auto-close if there's already content after cursor on this line */
            const afterCursor = lineContent.substring(pos.column - 1).trim();
            if (afterCursor.length > 0) return;

            /* Insert newline + cursor position + closing tag */
            const insertText = `\n\n{% ${closeTag} %}`;
            editorInstance.executeEdits('auto-close-liquid', [
              {
                range: new monaco.Range(pos.lineNumber, pos.column, pos.lineNumber, pos.column),
                text: insertText,
              },
            ]);
            /* Move cursor to the blank line between tags */
            editorInstance.setPosition({
              lineNumber: pos.lineNumber + 1,
              column: 1,
            });
          });
        }

        /* 10. Liquid formatting (Format Document action) */
        editorInstance.addAction({
          id: 'synapse.formatLiquid',
          label: 'Format Liquid Document',
          keybindings: [
            monaco.KeyMod.Shift | monaco.KeyMod.Alt | monaco.KeyCode.KeyF,
          ],
          contextMenuGroupId: '1_modification',
          contextMenuOrder: 15,
          run: (ed) => {
            const model = ed.getModel();
            if (!model) return;
            const source = model.getValue();
            const formatted = providers.formatLiquid(source, { tabSize: settings.tabSize });
            if (formatted !== source) {
              ed.pushUndoStop();
              model.pushEditOperations(
                [],
                [
                  {
                    range: model.getFullModelRange(),
                    text: formatted,
                  },
                ],
                () => null,
              );
              ed.pushUndoStop();
            }
          },
        });
      }

      /* 9. HTML tag auto-rename (linked editing) – works for liquid and html */
      monaco.languages.registerLinkedEditingRangeProvider(
        'liquid',
        providers.createLinkedEditingProvider(monaco),
      );

      /* Inline (ghost) completions – Cursor Tab–like, see cursor-like-features-plan.md */
      if (language === 'liquid' || language === 'javascript' || language === 'css') {
        inlineCompletionDisposableRef.current?.dispose();
        inlineCompletionDisposableRef.current = monaco.languages.registerInlineCompletionsProvider(
          { language: MONACO_LANGUAGE_MAP[language] },
          providers.createInlineCompletionProvider(monaco, {
            getFilePath: () => filePathForCompletionsRef.current ?? null,
            language,
            debounceDelayMs: 400,
            enabled: () => enableInlineCompletionsRef.current ?? false,
          }),
        );
      }

      }); // end loadProviders().then(...)
    },
    [language, fileResolver, getLocaleEntries, settings.tabSize, onToggleConsole],
  );

  /* Clean up inline completion provider on unmount */
  useEffect(() => {
    return () => {
      inlineCompletionDisposableRef.current?.dispose();
      inlineCompletionDisposableRef.current = null;
    };
  }, []);

  /* ── Cleanup injected <style> on unmount ────────────────────────────── */
  useEffect(() => {
    return () => {
      styleElRef.current?.remove();
      styleElRef.current = null;
    };
  }, []);

  /* ── Liquid diagnostics (+ EPIC 6: deprecated warnings, unused vars) ── */
  /* Deferred via requestIdleCallback so the editor is interactive before diagnostics run. */
  useEffect(() => {
    if (language !== 'liquid') return;
    const monaco = monacoRef.current;
    const model = editorRef.current?.getModel();
    if (!monaco || !model) return;
    let cancelled = false;

    const scheduleIdle = typeof requestIdleCallback === 'function' ? requestIdleCallback : (cb: () => void) => setTimeout(cb, 80);
    const cancelIdle = typeof cancelIdleCallback === 'function' ? cancelIdleCallback : clearTimeout;

    const idleHandle = scheduleIdle(() => {
      if (cancelled) return;
      loadProviders().then((providers) => {
        if (cancelled) return;
        return (providers.getLiquidDiagnostics(value ?? '') as Promise<Array<{ severity: string; message: string; line: number; column: number }>>).then((diagnostics) => {
          if (cancelled) return;
          const markers = diagnostics.map((d: { severity: string; message: string; line: number; column: number }) => ({
            severity:
              d.severity === 'error'
                ? monaco.MarkerSeverity.Error
                : d.severity === 'warning'
                  ? monaco.MarkerSeverity.Warning
                  : monaco.MarkerSeverity.Info,
            message: d.message,
            startLineNumber: d.line,
            startColumn: d.column,
            endLineNumber: d.line,
            endColumn: Math.max(d.column, 1),
          }));

          /* EPIC 6 Feature 7: Deprecated tag warnings */
          const lines = (value ?? '').split('\n');
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            /* Deprecated tags */
            for (const [tag, message] of Object.entries(DEPRECATED_TAGS)) {
              const tagRe = new RegExp(`\\{%-?\\s*${tag}\\b`, 'g');
              let m: RegExpExecArray | null;
              while ((m = tagRe.exec(line)) !== null) {
                markers.push({
                  severity: monaco.MarkerSeverity.Warning,
                  message,
                  startLineNumber: i + 1,
                  startColumn: m.index + 1,
                  endLineNumber: i + 1,
                  endColumn: m.index + m[0].length + 1,
                });
              }
            }
            /* Deprecated filters */
            for (const [filter, message] of Object.entries(DEPRECATED_FILTERS)) {
              const filterRe = new RegExp(`\\|\\s*${filter}\\b`, 'g');
              let m: RegExpExecArray | null;
              while ((m = filterRe.exec(line)) !== null) {
                markers.push({
                  severity: monaco.MarkerSeverity.Warning,
                  message,
                  startLineNumber: i + 1,
                  startColumn: m.index + 1,
                  endLineNumber: i + 1,
                  endColumn: m.index + m[0].length + 1,
                });
              }
            }
          }

          /* EPIC 6 Feature 6: Unused variable detection (yellow warnings) */
          const unusedVars = providers.detectUnusedVariables(value ?? '') as Array<{ name: string; line: number; column: number }>;
          for (const uv of unusedVars) {
            markers.push({
              severity: monaco.MarkerSeverity.Warning,
              message: `Unused variable: "${uv.name}" is assigned but never used`,
              startLineNumber: uv.line,
              startColumn: uv.column,
              endLineNumber: uv.line,
              endColumn: uv.column + uv.name.length + 10,
            });
          }

          monaco.editor.setModelMarkers(model, 'liquid', markers);
        });
      });
    });

    return () => {
      cancelled = true;
      cancelIdle(idleHandle as number);
      const m = monacoRef.current;
      const mod = editorRef.current?.getModel();
      if (m && mod) m.editor.setModelMarkers(mod, 'liquid', []);
    };
  }, [value, language]);

  /* ── Feature 12: paste dialog action handlers ───────────────────────── */
  const handleInlineBase64 = useCallback(() => {
    if (!pasteDialog || !editorRef.current || !monacoRef.current) return;
    const ed = editorRef.current;
    const pos = ed.getPosition();
    if (pos) {
      ed.executeEdits('paste-image', [
        {
          range: new monacoRef.current.Range(
            pos.lineNumber,
            pos.column,
            pos.lineNumber,
            pos.column,
          ),
          text: `<img src="${pasteDialog.base64}" alt="pasted image" />`,
        },
      ]);
    }
    setPasteDialog(null);
  }, [pasteDialog]);

  const handleAddAsAsset = useCallback(() => {
    if (!pasteDialog) return;
    if (onImagePaste) {
      onImagePaste(pasteDialog.file);
    } else {
      // eslint-disable-next-line no-console
      console.log('[Synapse] Add as asset not yet wired. File:', pasteDialog.file.name);
    }
    setPasteDialog(null);
  }, [pasteDialog, onImagePaste]);

  /* ═════════════════════════════════════════════════════════════════════
     Render
     ═════════════════════════════════════════════════════════════════════ */
  return (
    <div className="relative" style={{ height }}>
      <MonacoEditorReact
        height="100%"
        language={MONACO_LANGUAGE_MAP[language]}
        value={value}
        onChange={(v) => onChange(v ?? '')}
        onMount={handleEditorDidMount}
        theme={isDark ? 'vs-dark' : 'light'}
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
          wordSeparators: CUSTOM_WORD_SEPARATORS, // Feature 11
          inlineSuggest: { enabled: enableInlineCompletions },
        }}
        className={className}
      />

      {/* Feature 12 – Image-paste dialog */}
      {pasteDialog && (
        <div
          className="fixed z-50 rounded-lg border ide-border ide-surface-pop p-4 shadow-2xl"
          style={{ left: pasteDialog.position.x, top: pasteDialog.position.y, minWidth: 240 }}
        >
          <p className="mb-3 text-sm ide-text-2">
            Image pasted &mdash; what would you like to do?
          </p>
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={handleInlineBase64}
              className="rounded border border-sky-500 bg-sky-500/20 dark:bg-sky-500/20 px-3 py-1.5 text-xs text-sky-600 dark:text-sky-300 transition hover:bg-sky-500/30"
            >
              Inline as base64
            </button>
            <button
              type="button"
              onClick={handleAddAsAsset}
              className="rounded border border-accent bg-accent/20 px-3 py-1.5 text-xs text-accent transition hover:bg-accent/30"
            >
              Add as asset file
            </button>
            <button
              type="button"
              onClick={() => setPasteDialog(null)}
              className="rounded border ide-border px-3 py-1.5 text-xs ide-text-3 ide-hover transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
