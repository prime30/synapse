'use client';

import { useState, useCallback, useEffect } from 'react';
import { LambdaDots } from '@/components/ui/LambdaDots';

interface PlansListProps {
  projectId: string;
  onOpenPlan?: (plan: { id: string; name: string; content: string }) => void;
}

interface PlanSummary {
  id: string;
  name: string;
  todoProgress: { completed: number; total: number };
  createdAt: string;
  updatedAt: string;
}

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffSeconds = Math.floor((now - then) / 1000);

  if (diffSeconds < 60) return 'just now';
  const mins = Math.floor(diffSeconds / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

function SkeletonCard() {
  return (
    <div className="border ide-border-subtle rounded-md ide-surface p-3 animate-pulse space-y-2">
      <div className="h-4 ide-surface-inset rounded w-28" />
      <div className="flex items-center gap-3">
        <div className="h-3 ide-surface-inset rounded w-12" />
        <div className="h-3 ide-surface-inset rounded w-14" />
      </div>
    </div>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      className={`w-4 h-4 ide-text-muted transition-transform ${open ? 'rotate-180' : ''}`}
    >
      <path
        fillRule="evenodd"
        d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
        clipRule="evenodd"
      />
    </svg>
  );
}

export function PlansList({ projectId, onOpenPlan }: PlansListProps) {
  const [isOpen, setIsOpen] = useState(true);
  const [plans, setPlans] = useState<PlanSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [newPlanName, setNewPlanName] = useState('');
  const [loadingPlanId, setLoadingPlanId] = useState<string | null>(null);

  const fetchPlans = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/plans`);
      if (!res.ok) throw new Error('Failed to fetch plans');
      const data = await res.json();
      setPlans(data.plans ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load plans');
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchPlans();
  }, [fetchPlans]);

  const handleCreatePlan = useCallback(async () => {
    const name = newPlanName.trim();
    if (!name) return;

    try {
      const res = await fetch(`/api/projects/${projectId}/plans`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, content: '' }),
      });
      if (!res.ok) throw new Error('Failed to create plan');
      const data = await res.json();
      const created = data.plan;
      setPlans((prev) => [
        {
          id: created.id,
          name: created.name,
          todoProgress: { completed: 0, total: 0 },
          createdAt: created.createdAt,
          updatedAt: created.updatedAt,
        },
        ...prev,
      ]);
      setNewPlanName('');
      setIsCreating(false);
    } catch (err) {
      console.error('Failed to create plan:', err);
    }
  }, [projectId, newPlanName]);

  const handleOpenPlan = useCallback(
    async (summary: PlanSummary) => {
      if (!onOpenPlan) return;
      setLoadingPlanId(summary.id);
      try {
        const res = await fetch(`/api/projects/${projectId}/plans/${summary.id}`);
        if (!res.ok) throw new Error('Failed to fetch plan');
        const data = await res.json();
        const plan = data.plan;
        onOpenPlan({ id: plan.id, name: plan.name, content: plan.content });
      } catch (err) {
        console.error('Failed to open plan:', err);
      } finally {
        setLoadingPlanId(null);
      }
    },
    [projectId, onOpenPlan],
  );

  return (
    <div className="border ide-border-subtle rounded-lg ide-surface-panel">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-2 text-sm font-medium ide-text ide-hover rounded transition-colors"
        >
          <ChevronIcon open={isOpen} />
          <span>Plans</span>
        </button>
        <button
          type="button"
          onClick={() => {
            if (!isOpen) setIsOpen(true);
            setIsCreating(true);
          }}
          className="px-2.5 py-1 text-xs font-medium rounded transition-colors text-white"
          style={{ backgroundColor: 'var(--color-accent)' }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'var(--color-accent-hover)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'var(--color-accent)';
          }}
        >
          New plan
        </button>
      </div>

      {/* Collapsible content */}
      {isOpen && (
        <div className="px-4 pb-4 space-y-2">
          {/* Inline create form */}
          {isCreating && (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={newPlanName}
                onChange={(e) => setNewPlanName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreatePlan();
                  if (e.key === 'Escape') {
                    setIsCreating(false);
                    setNewPlanName('');
                  }
                }}
                placeholder="Plan name..."
                autoFocus
                className="flex-1 px-2.5 py-1.5 text-sm rounded border ide-border-subtle bg-white dark:bg-white/5 ide-text placeholder:ide-text-muted focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
              />
              <button
                type="button"
                onClick={handleCreatePlan}
                disabled={!newPlanName.trim()}
                className="px-2.5 py-1.5 text-xs font-medium rounded text-white disabled:opacity-40 transition-colors"
                style={{ backgroundColor: 'var(--color-accent)' }}
              >
                Create
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsCreating(false);
                  setNewPlanName('');
                }}
                className="px-2 py-1.5 text-xs ide-text-muted ide-hover rounded transition-colors"
              >
                Cancel
              </button>
            </div>
          )}

          {/* Loading state */}
          {isLoading && (
            <div className="space-y-2">
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
            </div>
          )}

          {/* Error state */}
          {!isLoading && error && (
            <div className="text-center py-4 text-sm text-red-500">
              <p>{error}</p>
              <button
                type="button"
                onClick={fetchPlans}
                className="mt-2 text-xs ide-text-muted hover:ide-text underline transition-colors"
              >
                Retry
              </button>
            </div>
          )}

          {/* Empty state */}
          {!isLoading && !error && plans.length === 0 && !isCreating && (
            <div className="text-center py-6">
              <p className="text-sm ide-text-muted mb-3">
                No plans yet. Create one to track your work.
              </p>
              <button
                type="button"
                onClick={() => setIsCreating(true)}
                className="px-3 py-1.5 text-xs font-medium rounded text-white transition-colors"
                style={{ backgroundColor: 'var(--color-accent)' }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--color-accent-hover)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--color-accent)';
                }}
              >
                Create plan
              </button>
            </div>
          )}

          {/* Plan cards */}
          {!isLoading && !error && plans.length > 0 && (
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {plans.map((plan) => {
                const { completed, total } = plan.todoProgress;
                const progressPct = total > 0 ? (completed / total) * 100 : 0;
                const isOpening = loadingPlanId === plan.id;

                return (
                  <button
                    key={plan.id}
                    type="button"
                    onClick={() => handleOpenPlan(plan)}
                    disabled={isOpening}
                    className="w-full text-left border ide-border-subtle rounded-md ide-surface p-3 ide-hover transition-colors group"
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sm font-medium ide-text truncate pr-2">
                        {plan.name}
                      </span>
                      {isOpening && (
                        <LambdaDots size={14} className="ide-text-muted flex-shrink-0" />
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      {total > 0 && (
                        <div className="flex items-center gap-1.5">
                          <div
                            className="w-16 h-1.5 rounded-full overflow-hidden"
                            style={{ backgroundColor: 'oklch(0 0 0 / 0.08)' }}
                          >
                            <div
                              className="h-full rounded-full transition-all"
                              style={{
                                width: `${progressPct}%`,
                                backgroundColor: 'var(--color-accent)',
                              }}
                            />
                          </div>
                          <span
                            className="ide-text-muted"
                            style={
                              completed === total && total > 0
                                ? { color: 'var(--color-accent)' }
                                : undefined
                            }
                          >
                            {completed}/{total}
                          </span>
                        </div>
                      )}
                      <span className="ide-text-muted">
                        {relativeTime(plan.updatedAt)}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
