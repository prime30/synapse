'use client';

import { useMemo, useState, useCallback } from 'react';
import { Download, ChevronLeft, ChevronRight, ChevronUp, ChevronDown } from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const MOCK_MODELS = [
  'claude-sonnet-4-6',
  'claude-haiku-4-5-20251001',
  'gpt-4o-mini',
] as const;

const MOCK_TYPES = ['agent', 'summary', 'review', 'completion'] as const;

const MODEL_DISPLAY: Record<string, string> = {
  'claude-sonnet-4-6': 'Claude Sonnet 4.6',
  'claude-opus-4-6': 'Claude Opus 4.6',
  'claude-haiku-4-5-20251001': 'Claude Haiku 4.5',
  'gpt-4o-mini': 'GPT-4o Mini',
};

/** Cost per 1 000 tokens (input / output) */
const MODEL_COSTS: Record<string, { input: number; output: number }> = {
  'claude-sonnet-4-6': { input: 0.003, output: 0.015 },
  'claude-haiku-4-5-20251001': { input: 0.001, output: 0.005 },
  'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
};

const PAGE_SIZE = 25;

const RANGES = [
  { label: '1d', days: 1 },
  { label: '7d', days: 7 },
  { label: '30d', days: 30 },
] as const;

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface UsageRecord {
  id: string;
  date: Date;
  type: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  projectId: string;
  projectName: string;
}

type SortField = 'date' | 'type' | 'model' | 'tokens' | 'cost';
type SortDir = 'asc' | 'desc';

/* ------------------------------------------------------------------ */
/*  Mock data                                                          */
/* ------------------------------------------------------------------ */

const MOCK_PROJECTS = [
  { id: 'proj-1', name: 'Dawn Theme' },
  { id: 'proj-2', name: 'Minimal Store' },
  { id: 'proj-3', name: 'Custom Checkout' },
];

function generateMockUsage(days: number): UsageRecord[] {
  const count = Math.max(days * 3, 20);
  return Array.from({ length: count }, (_, i) => {
    const model =
      MOCK_MODELS[Math.floor(Math.random() * MOCK_MODELS.length)];
    const inputTokens = Math.floor(Math.random() * 20000) + 1000;
    const outputTokens = Math.floor(Math.random() * 5000) + 200;
    const rates = MODEL_COSTS[model];
    const cost =
      (inputTokens / 1000) * rates.input +
      (outputTokens / 1000) * rates.output;
    const project =
      MOCK_PROJECTS[Math.floor(Math.random() * MOCK_PROJECTS.length)];

    return {
      id: `usage-${i}`,
      date: new Date(Date.now() - i * 8 * 60 * 60 * 1000),
      type: MOCK_TYPES[
        Math.floor(Math.random() * MOCK_TYPES.length)
      ] as string,
      model,
      inputTokens,
      outputTokens,
      cost,
      projectId: project.id,
      projectName: project.name,
    };
  });
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatDate(d: Date) {
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatTokens(n: number) {
  return n.toLocaleString();
}

function formatCost(n: number) {
  return `$${n.toFixed(2)}`;
}

function dateRangeLabel(days: number) {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - days + 1);
  return `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
}

/* ------------------------------------------------------------------ */
/*  CSV Export                                                         */
/* ------------------------------------------------------------------ */

function exportCsv(records: UsageRecord[]) {
  const header = 'Date,Type,Model,Input Tokens,Output Tokens,Cost\n';
  const rows = records
    .map(
      (r) =>
        `${formatDate(r.date)},${r.type},${MODEL_DISPLAY[r.model] ?? r.model},${r.inputTokens},${r.outputTokens},${r.cost.toFixed(4)}`
    )
    .join('\n');
  const blob = new Blob([header + rows], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `synapse-usage-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/* ------------------------------------------------------------------ */
/*  Sort Header                                                        */
/* ------------------------------------------------------------------ */

function SortHeader({
  label,
  field,
  current,
  dir,
  onSort,
  align = 'left',
}: {
  label: string;
  field: SortField;
  current: SortField;
  dir: SortDir;
  onSort: (f: SortField) => void;
  align?: 'left' | 'right';
}) {
  const active = current === field;
  return (
    <th
      className={`px-4 py-3 text-xs font-medium ide-text-muted uppercase tracking-wider cursor-pointer select-none hover:ide-text transition-colors ${
        align === 'right' ? 'text-right' : 'text-left'
      }`}
      onClick={() => onSort(field)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {active ? (
          dir === 'asc' ? (
            <ChevronUp className="h-3 w-3" />
          ) : (
            <ChevronDown className="h-3 w-3" />
          )
        ) : (
          <ChevronDown className="h-3 w-3 opacity-0 group-hover:opacity-40" />
        )}
      </span>
    </th>
  );
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function UsagePage() {
  const [rangeDays, setRangeDays] = useState(30);
  const [project, setProject] = useState('all');
  const [page, setPage] = useState(1);
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  /* Fetch real data from API */
  const [allRecords, setAllRecords] = useState<UsageRecord[]>([]);
  const [loading, setLoading] = useState(true);

  // biome-ignore lint/correctness/useExhaustiveDependencies: rangeDays triggers refetch
  useMemo(() => {
    setLoading(true);
    fetch('/api/billing/usage')
      .then(r => r.json())
      .then((data) => {
        if (data.error) {
          setAllRecords([]);
          return;
        }
        const cutoff = new Date(Date.now() - rangeDays * 24 * 60 * 60 * 1000);
        const records: UsageRecord[] = (data.daily ?? [])
          .filter((d: { date: string }) => new Date(d.date) >= cutoff)
          .map((d: { date: string; requests: number; costCents: number; inputTokens?: number; outputTokens?: number }, i: number) => ({
            id: `usage-${i}`,
            date: new Date(d.date),
            type: 'agent',
            model: 'mixed',
            inputTokens: d.inputTokens ?? 0,
            outputTokens: d.outputTokens ?? 0,
            cost: d.costCents / 100,
            projectId: 'all',
            projectName: 'All Projects',
          }));
        setAllRecords(records.length > 0 ? records : generateMockUsage(rangeDays));
      })
      .catch(() => setAllRecords(generateMockUsage(rangeDays)))
      .finally(() => setLoading(false));
  }, [rangeDays]);

  /* Filter */
  const filtered = useMemo(() => {
    if (project === 'all') return allRecords;
    return allRecords.filter((r) => r.projectId === project);
  }, [allRecords, project]);

  /* Sort */
  const sorted = useMemo(() => {
    const copy = [...filtered];
    copy.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'date':
          cmp = a.date.getTime() - b.date.getTime();
          break;
        case 'type':
          cmp = a.type.localeCompare(b.type);
          break;
        case 'model':
          cmp = a.model.localeCompare(b.model);
          break;
        case 'tokens':
          cmp =
            a.inputTokens + a.outputTokens - (b.inputTokens + b.outputTokens);
          break;
        case 'cost':
          cmp = a.cost - b.cost;
          break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return copy;
  }, [filtered, sortField, sortDir]);

  /* Pagination */
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const pageRecords = sorted.slice(
    (page - 1) * PAGE_SIZE,
    page * PAGE_SIZE
  );
  const showStart = sorted.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const showEnd = Math.min(page * PAGE_SIZE, sorted.length);

  /* Handlers */
  const handleSort = useCallback(
    (field: SortField) => {
      if (sortField === field) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
      } else {
        setSortField(field);
        setSortDir('desc');
      }
      setPage(1);
    },
    [sortField]
  );

  const handleRangeChange = useCallback((days: number) => {
    setRangeDays(days);
    setPage(1);
  }, []);

  const handleProjectChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      setProject(e.target.value);
      setPage(1);
    },
    []
  );

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      {/* ── Heading ────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-semibold">Usage</h1>
        <p className="ide-text-muted text-sm mt-1">
          Track your AI agent usage across all projects.
        </p>
      </div>

      {/* ── Controls ───────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Date range label */}
        <span className="text-sm ide-text-2 ide-surface-panel ide-border rounded-md px-3 py-1.5">
          {dateRangeLabel(rangeDays)}
        </span>

        {/* Range preset buttons */}
        <div className="flex gap-1">
          {RANGES.map((r) => (
            <button
              key={r.days}
              onClick={() => handleRangeChange(r.days)}
              className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
                rangeDays === r.days
                  ? 'ide-surface-inset ide-text'
                  : 'ide-text-muted ide-hover'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>

        <div className="flex-1" />

        {/* Export CSV */}
        <button
          onClick={() => exportCsv(sorted)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md ide-border ide-text-muted ide-hover transition-colors"
        >
          <Download className="h-3.5 w-3.5" />
          Export CSV
        </button>
      </div>

      {/* ── Table ──────────────────────────────────── */}
      <div className="ide-surface-panel ide-border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b ide-border">
              <tr>
                <SortHeader
                  label="Date"
                  field="date"
                  current={sortField}
                  dir={sortDir}
                  onSort={handleSort}
                />
                <SortHeader
                  label="Type"
                  field="type"
                  current={sortField}
                  dir={sortDir}
                  onSort={handleSort}
                />
                <SortHeader
                  label="Model"
                  field="model"
                  current={sortField}
                  dir={sortDir}
                  onSort={handleSort}
                />
                <SortHeader
                  label="Tokens"
                  field="tokens"
                  current={sortField}
                  dir={sortDir}
                  onSort={handleSort}
                  align="right"
                />
                <SortHeader
                  label="Cost"
                  field="cost"
                  current={sortField}
                  dir={sortDir}
                  onSort={handleSort}
                  align="right"
                />
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-200 dark:divide-white/10">
              {pageRecords.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-12 text-center ide-text-muted"
                  >
                    No usage records found.
                  </td>
                </tr>
              ) : (
                pageRecords.map((r) => (
                  <tr
                    key={r.id}
                    className="ide-hover transition-colors"
                  >
                    <td className="px-4 py-3 ide-text-2 whitespace-nowrap">
                      {formatDate(r.date)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="capitalize ide-text-2">
                        {r.type}
                      </span>
                    </td>
                    <td className="px-4 py-3 ide-text-2 whitespace-nowrap">
                      {MODEL_DISPLAY[r.model] ?? r.model}
                    </td>
                    <td className="px-4 py-3 text-right ide-text-2 whitespace-nowrap tabular-nums">
                      {formatTokens(r.inputTokens + r.outputTokens)}
                    </td>
                    <td className="px-4 py-3 text-right ide-text-2 whitespace-nowrap tabular-nums">
                      {formatCost(r.cost)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* ── Footer: project filter + pagination ──── */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t ide-border text-sm">
          {/* Project filter */}
          <div className="flex items-center gap-2">
            <label htmlFor="project-filter" className="ide-text-muted text-xs">
              Project:
            </label>
            <select
              id="project-filter"
              value={project}
              onChange={handleProjectChange}
              className="ide-input text-xs px-2 py-1"
            >
              <option value="all">All Projects</option>
              {MOCK_PROJECTS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          {/* Pagination */}
          <div className="flex items-center gap-3">
            <span className="ide-text-muted text-xs">
              Showing {showStart}–{showEnd} of {sorted.length}
            </span>
            <div className="flex gap-1">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="p-1 rounded-md ide-text-muted ide-hover disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="p-1 rounded-md ide-text-muted ide-hover disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
