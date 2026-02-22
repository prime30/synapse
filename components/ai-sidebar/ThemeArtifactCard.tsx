'use client';

import React from 'react';
import { AlertTriangle, CheckCircle2, Clipboard, ClipboardCheck, FileText, GitBranch, Layers3, ShieldCheck } from 'lucide-react';

interface ThemeArtifactCardProps {
  markdown: string;
}

interface Section {
  title: string;
  lines: string[];
}

interface MatrixRow {
  file: string;
  tier: string;
  change: string;
  intent: string;
  batch: string;
}

function parseSections(markdown: string): { title: string; sections: Section[] } {
  const lines = markdown.split(/\r?\n/);
  let title = 'Theme-wide Plan Artifact';
  const sections: Section[] = [];
  let current: Section | null = null;

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (line.startsWith('## ')) {
      title = line.replace(/^##\s+/, '').trim() || title;
      continue;
    }
    if (line.startsWith('### ')) {
      current = { title: line.replace(/^###\s+/, '').trim(), lines: [] };
      sections.push(current);
      continue;
    }
    if (current) current.lines.push(line);
  }

  return { title, sections };
}

function parseListItem(line: string): string | null {
  const match = line.match(/^- (.+)$/);
  return match ? match[1].trim() : null;
}

function parseTouchedMatrix(lines: string[]): MatrixRow[] {
  const rows: MatrixRow[] = [];
  for (const line of lines) {
    if (!line.startsWith('|') || line.includes('|---')) continue;
    const cols = line.split('|').map(p => p.trim()).filter(Boolean);
    if (cols.length !== 5 || cols[0] === 'File') continue;
    rows.push({
      file: cols[0],
      tier: cols[1],
      change: cols[2],
      intent: cols[3],
      batch: cols[4],
    });
  }
  return rows;
}

function splitCommaList(input: string): string[] {
  if (!input || input === '(none)') return [];
  return input.split(',').map(p => p.trim()).filter(Boolean);
}

function Pill({ text, tone = 'neutral' }: { text: string; tone?: 'neutral' | 'good' | 'warn' }) {
  const toneClass =
    tone === 'good'
      ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
      : tone === 'warn'
        ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300'
        : 'ide-surface-inset ide-text-2';
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] ${toneClass}`}>
      {text}
    </span>
  );
}

export function ThemeArtifactCard({ markdown }: ThemeArtifactCardProps) {
  const [copied, setCopied] = React.useState(false);
  const [showRaw, setShowRaw] = React.useState(false);

  const parsed = React.useMemo(() => parseSections(markdown), [markdown]);
  const sectionMap = React.useMemo(
    () => new Map(parsed.sections.map(s => [s.title, s])),
    [parsed.sections],
  );

  const dependencyMapItems = React.useMemo(() => {
    const sec = sectionMap.get('Dependency Map');
    if (!sec) return [] as Array<{ tier: string; files: string[] }>;
    return sec.lines
      .map(parseListItem)
      .filter((v): v is string => Boolean(v))
      .map(item => {
        const idx = item.indexOf(':');
        const tier = idx > -1 ? item.slice(0, idx).trim() : item;
        const files = idx > -1 ? splitCommaList(item.slice(idx + 1).trim()) : [];
        return { tier, files };
      });
  }, [sectionMap]);

  const matrixRows = React.useMemo(() => {
    const sec = sectionMap.get('Touched File Matrix');
    return sec ? parseTouchedMatrix(sec.lines) : [];
  }, [sectionMap]);

  const dependencyEdges = React.useMemo(() => {
    const sec = sectionMap.get('Dependency Edges (sample)');
    if (!sec) return [] as string[];
    return sec.lines.map(parseListItem).filter((v): v is string => Boolean(v));
  }, [sectionMap]);

  const impactExpansion = React.useMemo(() => {
    const sec = sectionMap.get('Impact Expansion');
    if (!sec) return [] as string[];
    return sec.lines.map(parseListItem).filter((v): v is string => Boolean(v));
  }, [sectionMap]);

  const batchPlan = React.useMemo(() => {
    const sec = sectionMap.get('Batch Plan');
    if (!sec) return [] as string[];
    return sec.lines.map(parseListItem).filter((v): v is string => Boolean(v));
  }, [sectionMap]);

  const policyItems = React.useMemo(() => {
    const sec = sectionMap.get('Policy');
    if (!sec) return [] as Array<{ text: string; ok: boolean }>;
    return sec.lines
      .map(parseListItem)
      .filter((v): v is string => Boolean(v))
      .map(item => ({
        text: item.replace(/^\[(ok|!)\]\s*/i, ''),
        ok: /^\[ok\]/i.test(item),
      }));
  }, [sectionMap]);

  const handleCopy = React.useCallback(async () => {
    try {
      await navigator.clipboard.writeText(markdown);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  }, [markdown]);

  return (
    <div className="p-3">
      <div className="rounded-lg border ide-border-subtle ide-surface-inset overflow-hidden">
        <div className="px-3 py-2 border-b ide-border-subtle flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h4 className="text-xs font-semibold ide-text-1 truncate">{parsed.title}</h4>
            <p className="text-[11px] ide-text-3">Plan overview with dependencies, batches, and policy checks</p>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={setShowRaw.bind(null, !showRaw)}
              className="h-7 px-2 rounded border ide-border-subtle ide-hover text-[11px] ide-text-2"
            >
              {showRaw ? 'Formatted' : 'Raw'}
            </button>
            <button
              type="button"
              onClick={handleCopy}
              className="h-7 px-2 rounded border ide-border-subtle ide-hover text-[11px] ide-text-2 inline-flex items-center gap-1"
            >
              {copied ? <ClipboardCheck className="h-3.5 w-3.5" aria-hidden /> : <Clipboard className="h-3.5 w-3.5" aria-hidden />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        </div>

        {showRaw ? (
          <div className="p-2">
            <pre className="max-h-[360px] overflow-auto rounded-md border ide-border-subtle p-2 text-[11px] ide-text-2 whitespace-pre-wrap">
              {markdown}
            </pre>
          </div>
        ) : (
          <div className="p-3 space-y-3">
            {dependencyMapItems.length > 0 && (
              <section className="rounded-md border ide-border-subtle p-2.5">
                <div className="text-[11px] font-medium ide-text-1 mb-2 inline-flex items-center gap-1.5">
                  <GitBranch className="h-3.5 w-3.5" aria-hidden />
                  Dependency Map
                </div>
                <div className="space-y-1.5">
                  {dependencyMapItems.map(item => (
                    <div key={item.tier} className="text-[11px]">
                      <span className="ide-text-3 mr-1">{item.tier}:</span>
                      {item.files.length === 0 ? (
                        <Pill text="none" />
                      ) : (
                        <span className="inline-flex flex-wrap gap-1">
                          {item.files.slice(0, 6).map(file => <Pill key={file} text={file} />)}
                          {item.files.length > 6 && <Pill text={`+${item.files.length - 6} more`} />}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {matrixRows.length > 0 && (
              <section className="rounded-md border ide-border-subtle p-2.5">
                <div className="text-[11px] font-medium ide-text-1 mb-2 inline-flex items-center gap-1.5">
                  <FileText className="h-3.5 w-3.5" aria-hidden />
                  Touched Files
                </div>
                <div className="max-h-48 overflow-auto rounded border ide-border-subtle">
                  <table className="w-full text-[11px]">
                    <thead className="ide-surface-inset">
                      <tr className="ide-text-3">
                        <th className="text-left px-2 py-1.5 font-medium">File</th>
                        <th className="text-left px-2 py-1.5 font-medium">Tier</th>
                        <th className="text-left px-2 py-1.5 font-medium">Change</th>
                        <th className="text-left px-2 py-1.5 font-medium">Batch</th>
                      </tr>
                    </thead>
                    <tbody>
                      {matrixRows.map((r, idx) => (
                        <tr key={`${r.file}-${idx}`} className="border-t ide-border-subtle">
                          <td className="px-2 py-1.5 ide-text-2 max-w-[220px] truncate" title={r.file}>{r.file}</td>
                          <td className="px-2 py-1.5 ide-text-3">{r.tier}</td>
                          <td className="px-2 py-1.5">
                            <Pill text={r.change} tone={r.change === 'create' ? 'good' : 'neutral'} />
                          </td>
                          <td className="px-2 py-1.5 ide-text-3">{r.batch}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {(dependencyEdges.length > 0 || impactExpansion.length > 0) && (
              <section className="rounded-md border ide-border-subtle p-2.5 grid gap-2">
                {dependencyEdges.length > 0 && (
                  <div>
                    <div className="text-[11px] font-medium ide-text-1 mb-1.5">Dependency Edges</div>
                    <div className="text-[11px] ide-text-2 space-y-1 max-h-24 overflow-auto">
                      {dependencyEdges.slice(0, 12).map(edge => (
                        <div key={edge} className="truncate">{edge}</div>
                      ))}
                    </div>
                  </div>
                )}
                {impactExpansion.length > 0 && (
                  <div>
                    <div className="text-[11px] font-medium ide-text-1 mb-1.5 inline-flex items-center gap-1.5">
                      <Layers3 className="h-3.5 w-3.5" aria-hidden />
                      Impact Expansion
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {impactExpansion.slice(0, 10).map(file => <Pill key={file} text={file} />)}
                      {impactExpansion.length > 10 && <Pill text={`+${impactExpansion.length - 10} more`} />}
                    </div>
                  </div>
                )}
              </section>
            )}

            {batchPlan.length > 0 && (
              <section className="rounded-md border ide-border-subtle p-2.5">
                <div className="text-[11px] font-medium ide-text-1 mb-1.5 inline-flex items-center gap-1.5">
                  <Layers3 className="h-3.5 w-3.5" aria-hidden />
                  Batch Plan
                </div>
                <div className="text-[11px] ide-text-2 space-y-1">
                  {batchPlan.map(line => (
                    <div key={line}>{line}</div>
                  ))}
                </div>
              </section>
            )}

            {policyItems.length > 0 && (
              <section className="rounded-md border ide-border-subtle p-2.5">
                <div className="text-[11px] font-medium ide-text-1 mb-1.5 inline-flex items-center gap-1.5">
                  <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
                  Policy
                </div>
                <div className="space-y-1.5 text-[11px]">
                  {policyItems.map((item, idx) => (
                    <div key={`${item.text}-${idx}`} className="flex items-start gap-1.5">
                      {item.ok ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 mt-0.5" aria-hidden />
                      ) : (
                        <AlertTriangle className="h-3.5 w-3.5 text-amber-500 mt-0.5" aria-hidden />
                      )}
                      <span className="ide-text-2">{item.text}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
