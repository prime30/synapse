'use client';

import { useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';

type CheckId =
  | 'map'
  | 'targets'
  | 'contracts'
  | 'enact'
  | 'verify'
  | 'loop_guard';

const CHECKS: Array<{ id: CheckId; label: string }> = [
  { id: 'map', label: 'Theme map created (templates -> sections -> snippets -> assets -> config/locales)' },
  { id: 'targets', label: 'Target file matrix frozen before editing (with ownership + rationale)' },
  { id: 'contracts', label: 'Cross-file contracts listed (schema keys, render targets, selectors, locale keys)' },
  { id: 'enact', label: 'Edits planned in dependency order with bounded batches (2-5 files per batch)' },
  { id: 'verify', label: 'Verification gates defined (lint/theme checks + preview paths + breakpoints + dynamic states)' },
  { id: 'loop_guard', label: 'Loop guard active (single discovery pass, then enact-or-clarify only)' },
];

export default function PlanPage() {
  const searchParams = useSearchParams();
  const titleParam = searchParams.get('title') ?? '';
  const descriptionParam = searchParams.get('description') ?? '';
  const stepsParam = searchParams.get('steps') ?? '';

  const [objective, setObjective] = useState(
    [titleParam, descriptionParam].filter(Boolean).join(' — ')
  );
  const [scope, setScope] = useState(() => {
    try {
      const parsed = JSON.parse(stepsParam) as Array<{ files?: string[] }>;
      const files = new Set<string>();
      for (const step of parsed) {
        for (const f of step.files ?? []) files.add(f);
      }
      return Array.from(files).join(', ');
    } catch {
      return '';
    }
  });
  const [checks, setChecks] = useState<Record<CheckId, boolean>>({
    map: true,
    targets: true,
    contracts: true,
    enact: true,
    verify: true,
    loop_guard: true,
  });

  const toggle = (id: CheckId) => {
    setChecks((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const md = useMemo(() => {
    const selectedChecks = CHECKS.filter((c) => checks[c.id]).map((c) => `- [x] ${c.label}`);
    const unchecked = CHECKS.filter((c) => !checks[c.id]).map((c) => `- [ ] ${c.label}`);
    const allChecks = [...selectedChecks, ...unchecked].join('\n');

    return `# Shopify Theme Execution Plan

## Goal
${objective.trim() || '<describe the exact outcome>'}

## Scope
${scope.trim() || '<list templates/sections/snippets/assets/config/locales in scope>'}

## 1) Discovery (Read-only)
- Build dependency map for the feature path.
- Identify every touchpoint before edits.
- Freeze target file matrix.

## 2) File Matrix
| File | Why touched | Change type | Batch |
|---|---|---|---|
| <path> | <reason> | <edit/create/delete> | <1..N> |

## 3) Cross-file Contracts
- Schema keys referenced in Liquid exist.
- All \`{% render %}\` targets exist.
- JS selectors/hooks align with markup/classes.
- Locale/config keys exist for introduced text.

## 4) Enactment Strategy
- Edit in bounded batches (2-5 files).
- Apply dependency order: schema/config -> markup -> JS/CSS -> locales.
- Prefer deterministic anchored edits over broad rewrites.

## 5) Verification Gates
- Syntax/lint/theme checks pass.
- Preview routes checked: product, collection, cart, search (and affected custom pages).
- Breakpoints checked: desktop + mobile.
- Dynamic states checked: variant switch, out-of-stock, cart mutations, app fragment responses.

## 6) Loop Prevention Policy
- One discovery pass max, then enact-or-clarify only.
- Redundant lookup calls blocked unless file state changes.
- Fail fast if repeated lookup-only actions occur before first edit.

## Acceptance Checklist
${allChecks}
`;
  }, [checks, objective, scope]);

  const copyPlan = async () => {
    try {
      await navigator.clipboard.writeText(md);
    } catch {
      // noop
    }
  };

  return (
    <main className="min-h-screen bg-[#fafaf9] dark:bg-[#0a0a0a]">
      <div className="mx-auto w-full max-w-5xl px-6 py-10">
        <h1 className="text-2xl font-semibold text-stone-900 dark:text-white">/plan</h1>
        <p className="mt-2 text-sm text-stone-600 dark:text-gray-400">
          Formalized workflow for large, multi-file Shopify theme changes.
        </p>

        <section className="mt-6 rounded-xl border border-stone-200 dark:border-white/10 bg-white dark:bg-white/5 p-4">
          <label className="block text-xs font-medium text-stone-700 dark:text-gray-300">Objective</label>
          <textarea
            value={objective}
            onChange={(e) => setObjective(e.target.value)}
            className="mt-1 w-full rounded-lg border border-stone-300 dark:border-white/10 bg-white dark:bg-white/5 px-3 py-2 text-sm text-stone-900 dark:text-white"
            rows={3}
            placeholder="Example: Add variant-specific out-of-stock badge secondary line with contrast-aware text."
          />

          <label className="mt-3 block text-xs font-medium text-stone-700 dark:text-gray-300">Scope</label>
          <textarea
            value={scope}
            onChange={(e) => setScope(e.target.value)}
            className="mt-1 w-full rounded-lg border border-stone-300 dark:border-white/10 bg-white dark:bg-white/5 px-3 py-2 text-sm text-stone-900 dark:text-white"
            rows={3}
            placeholder="Example: sections/main-product.liquid, snippets/product-badge.liquid, assets/product-form-dynamic.js, assets/theme.css, locales/en.default.json"
          />
        </section>

        <section className="mt-4 rounded-xl border border-stone-200 dark:border-white/10 bg-white dark:bg-white/5 p-4">
          <p className="text-xs font-medium text-stone-700 dark:text-gray-300">Acceptance Checklist</p>
          <div className="mt-2 space-y-2">
            {CHECKS.map((item) => (
              <label key={item.id} className="flex items-start gap-2 text-sm text-stone-700 dark:text-gray-300">
                <input
                  type="checkbox"
                  checked={checks[item.id]}
                  onChange={() => toggle(item.id)}
                  className="mt-0.5"
                />
                <span>{item.label}</span>
              </label>
            ))}
          </div>
        </section>

        <section className="mt-4 rounded-xl border border-stone-200 dark:border-white/10 bg-white dark:bg-white/5 p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-stone-700 dark:text-gray-300">Generated Plan Artifact</p>
            <button
              type="button"
              onClick={copyPlan}
              className="rounded-md bg-[#28CD56] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
            >
              Copy Markdown
            </button>
          </div>
          <pre className="mt-2 max-h-[460px] overflow-auto rounded-lg bg-stone-100 dark:bg-black/40 p-3 text-xs text-stone-700 dark:text-gray-300 whitespace-pre-wrap">
            {md}
          </pre>
        </section>
      </div>
    </main>
  );
}
