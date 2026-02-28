'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface PlanTodo {
  id: string;
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
  sortOrder: number;
  version: number;
}

interface Plan {
  id: string;
  projectId: string;
  name: string;
  content: string;
  status: 'draft' | 'active' | 'archived';
  version: number;
  todos: PlanTodo[];
  createdAt: string;
  updatedAt: string;
}

type ContentMode = 'view' | 'edit';

/* ------------------------------------------------------------------ */
/*  Status badge config                                                */
/* ------------------------------------------------------------------ */

const STATUS_STYLES: Record<Plan['status'], string> = {
  draft: 'bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300',
  active: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
  archived: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
};

const TODO_STATUS_STYLES: Record<PlanTodo['status'], string> = {
  pending: 'bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-400',
  in_progress: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
  completed: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
};

const STATUS_OPTIONS: Plan['status'][] = ['draft', 'active', 'archived'];

/* ------------------------------------------------------------------ */
/*  Inline SVG icons                                                   */
/* ------------------------------------------------------------------ */

function ChevronLeftIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={2}
      stroke="currentColor"
      className={className}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
    </svg>
  );
}

function EllipsisIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={2}
      stroke="currentColor"
      className={className}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M6.75 12a.75.75 0 11-1.5 0 .75.75 0 011.5 0zM12.75 12a.75.75 0 11-1.5 0 .75.75 0 011.5 0zM18.75 12a.75.75 0 11-1.5 0 .75.75 0 011.5 0z"
      />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={2.5}
      stroke="currentColor"
      className={className}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  );
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={2}
      stroke="currentColor"
      className={className}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/*  Main page component                                                */
/* ------------------------------------------------------------------ */

export default function PlanPage() {
  const params = useParams<{ projectId: string; planId: string }>();
  const router = useRouter();
  const projectId = params.projectId;
  const planId = params.planId;

  const [plan, setPlan] = useState<Plan | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<{ currentVersion: number } | null>(null);

  const [draftName, setDraftName] = useState('');
  const [draftContent, setDraftContent] = useState('');
  const [draftStatus, setDraftStatus] = useState<Plan['status']>('draft');
  const [editingName, setEditingName] = useState(false);
  const [contentMode, setContentMode] = useState<ContentMode>('view');
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);
  const [showMenu, setShowMenu] = useState(false);

  const [editingTodoId, setEditingTodoId] = useState<string | null>(null);
  const [editingTodoContent, setEditingTodoContent] = useState('');
  const [addingTodo, setAddingTodo] = useState(false);
  const [newTodoContent, setNewTodoContent] = useState('');

  const nameInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const statusDropdownRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  /* -- Fetch plan ------------------------------------------------- */

  const fetchPlan = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/projects/${projectId}/plans/${planId}`);
      if (!res.ok) throw new Error(`Failed to load plan (${res.status})`);
      const json = await res.json();
      const fetched: Plan = json.data.plan;
      setPlan(fetched);
      setDraftName(fetched.name);
      setDraftContent(fetched.content);
      setDraftStatus(fetched.status);
      setConflict(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [projectId, planId]);

  useEffect(() => {
    fetchPlan();
  }, [fetchPlan]);

  /* -- Save plan -------------------------------------------------- */

  const savePlan = useCallback(
    async (overrideVersion?: number) => {
      if (!plan) return;
      try {
        setSaving(true);
        setError(null);
        const res = await fetch(`/api/projects/${projectId}/plans/${planId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: draftName,
            content: draftContent,
            status: draftStatus,
            expectedVersion: overrideVersion ?? plan.version,
          }),
        });

        if (res.status === 409) {
          const body = await res.json();
          setConflict({ currentVersion: body.currentVersion });
          return;
        }

        if (!res.ok) throw new Error(`Save failed (${res.status})`);

        const json = await res.json();
        const saved: Plan = json.data.plan;
        setPlan(saved);
        setDraftName(saved.name);
        setDraftContent(saved.content);
        setDraftStatus(saved.status);
        setConflict(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Save failed');
      } finally {
        setSaving(false);
      }
    },
    [plan, projectId, planId, draftName, draftContent, draftStatus],
  );

  /* -- Delete / Archive ------------------------------------------- */

  const deletePlan = useCallback(async () => {
    if (!confirm('Are you sure you want to delete this plan?')) return;
    try {
      const res = await fetch(`/api/projects/${projectId}/plans/${planId}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Delete failed');
      router.back();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    }
  }, [projectId, planId, router]);

  const archivePlan = useCallback(async () => {
    setDraftStatus('archived');
    if (!plan) return;
    try {
      setSaving(true);
      const res = await fetch(`/api/projects/${projectId}/plans/${planId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'archived',
          expectedVersion: plan.version,
        }),
      });
      if (!res.ok) throw new Error('Archive failed');
      const json = await res.json();
      const saved: Plan = json.data.plan;
      setPlan(saved);
      setDraftStatus(saved.status);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Archive failed');
    } finally {
      setSaving(false);
      setShowMenu(false);
    }
  }, [plan, projectId, planId]);

  /* -- Toggle todo status ----------------------------------------- */

  const toggleTodo = useCallback(
    async (todo: PlanTodo) => {
      const nextStatus: PlanTodo['status'] =
        todo.status === 'completed' ? 'pending' : 'completed';

      // Optimistic update
      setPlan((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          todos: prev.todos.map((t) =>
            t.id === todo.id ? { ...t, status: nextStatus } : t,
          ),
        };
      });

      try {
        const res = await fetch(
          `/api/projects/${projectId}/plans/${planId}/todos/${todo.id}`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: nextStatus }),
          },
        );
        if (!res.ok) throw new Error('Failed to update todo');
        const json = await res.json();
        const updated: Plan = json.data.plan;
        setPlan(updated);
      } catch (err) {
        // Revert on failure
        setPlan((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            todos: prev.todos.map((t) =>
              t.id === todo.id ? { ...t, status: todo.status } : t,
            ),
          };
        });
        setError(err instanceof Error ? err.message : 'Todo update failed');
      }
    },
    [projectId, planId],
  );

  /* -- Textarea auto-resize --------------------------------------- */

  const resizeTextarea = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, []);

  useEffect(() => {
    if (contentMode === 'edit') resizeTextarea();
  }, [contentMode, draftContent, resizeTextarea]);

  /* -- Click-outside handlers ------------------------------------- */

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        statusDropdownRef.current &&
        !statusDropdownRef.current.contains(e.target as Node)
      ) {
        setShowStatusDropdown(false);
      }
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (editingName) nameInputRef.current?.select();
  }, [editingName]);

  /* -- Derived values --------------------------------------------- */

  const completedCount = plan?.todos.filter((t) => t.status === 'completed').length ?? 0;
  const totalCount = plan?.todos.length ?? 0;
  const progressPct = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

  const isDirty =
    plan !== null &&
    (draftName !== plan.name ||
      draftContent !== plan.content ||
      draftStatus !== plan.status);

  /* -- Loading / Error states ------------------------------------- */

  if (loading) {
    return (
      <div className="min-h-screen bg-[oklch(0.985_0.001_106)] dark:bg-[oklch(0.145_0_0)] flex items-center justify-center">
        <div className="text-sm text-stone-500 dark:text-gray-400">Loading plan...</div>
      </div>
    );
  }

  if (error && !plan) {
    return (
      <div className="min-h-screen bg-[oklch(0.985_0.001_106)] dark:bg-[oklch(0.145_0_0)] flex items-center justify-center">
        <div className="text-center space-y-3">
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          <button
            type="button"
            onClick={() => router.back()}
            className="text-sm text-stone-600 dark:text-gray-400 underline hover:no-underline"
          >
            Go back
          </button>
        </div>
      </div>
    );
  }

  if (!plan) return null;

  /* -- Render ----------------------------------------------------- */

  return (
    <div className="min-h-screen bg-[oklch(0.985_0.001_106)] dark:bg-[oklch(0.145_0_0)]">
      {/* Conflict banner */}
      {conflict && (
        <div className="bg-amber-50 dark:bg-amber-900/30 border-b border-amber-200 dark:border-amber-700 px-6 py-3 flex items-center justify-between">
          <span className="text-sm text-amber-800 dark:text-amber-200">
            This plan was updated elsewhere (v{conflict.currentVersion}).
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={fetchPlan}
              className="text-sm font-medium text-amber-700 dark:text-amber-300 hover:underline"
            >
              Refresh
            </button>
            <button
              type="button"
              onClick={() => savePlan(conflict.currentVersion)}
              className="text-sm font-medium text-amber-700 dark:text-amber-300 hover:underline"
            >
              Overwrite
            </button>
          </div>
        </div>
      )}

      {/* Error banner (when plan is loaded but an action failed) */}
      {error && plan && (
        <div className="bg-red-50 dark:bg-red-900/30 border-b border-red-200 dark:border-red-700 px-6 py-3">
          <span className="text-sm text-red-700 dark:text-red-300">{error}</span>
        </div>
      )}

      {/* Header */}
      <header className="border-b border-stone-200 dark:border-[#2a2a2a] px-6 py-4 flex items-center gap-4">
        <button
          type="button"
          onClick={() => router.back()}
          className="flex items-center gap-1.5 text-sm text-stone-500 dark:text-gray-400 hover:text-stone-900 dark:hover:text-white transition-colors"
          aria-label="Go back"
        >
          <ChevronLeftIcon className="w-4 h-4" />
          Back
        </button>

        <div className="h-5 w-px bg-stone-200 dark:bg-[#1e1e1e]" aria-hidden />

        {editingName ? (
          <input
            ref={nameInputRef}
            type="text"
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onBlur={() => setEditingName(false)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') setEditingName(false);
              if (e.key === 'Escape') {
                setDraftName(plan.name);
                setEditingName(false);
              }
            }}
            className="text-lg font-semibold text-stone-900 dark:text-white bg-transparent border-b-2 border-[oklch(0.745_0.189_148)] outline-none px-1 min-w-[200px]"
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditingName(true)}
            className="text-lg font-semibold text-stone-900 dark:text-white hover:text-[oklch(0.745_0.189_148)] transition-colors cursor-text text-left"
            title="Click to rename"
          >
            {draftName}
          </button>
        )}

        <div className="flex-1" />

        {/* Status badge / dropdown */}
        <div className="relative" ref={statusDropdownRef}>
          <button
            type="button"
            onClick={() => setShowStatusDropdown(!showStatusDropdown)}
            className={`px-2.5 py-1 rounded-full text-xs font-medium capitalize cursor-pointer ${STATUS_STYLES[draftStatus]}`}
          >
            {draftStatus}
          </button>
          {showStatusDropdown && (
            <div className="absolute right-0 top-full mt-1 bg-white dark:bg-[oklch(0.21_0_0)] border border-stone-200 dark:border-[#2a2a2a] rounded-lg shadow-lg py-1 z-20 min-w-[120px]">
              {STATUS_OPTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => {
                    setDraftStatus(s);
                    setShowStatusDropdown(false);
                  }}
                  className={`w-full text-left px-3 py-1.5 text-sm capitalize hover:bg-stone-50 dark:hover:bg-white/5 transition-colors ${
                    s === draftStatus
                      ? 'text-[oklch(0.745_0.189_148)] font-medium'
                      : 'text-stone-700 dark:text-gray-300'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Save button */}
        <button
          type="button"
          onClick={() => savePlan()}
          disabled={saving || !isDirty}
          className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            isDirty
              ? 'bg-[oklch(0.745_0.189_148)] text-white hover:bg-[oklch(0.684_0.178_149)] shadow-sm'
              : 'bg-stone-100 text-stone-400 dark:bg-[#141414] dark:text-gray-500 cursor-not-allowed'
          }`}
        >
          {saving ? 'Saving...' : 'Save'}
        </button>

        {/* Menu (archive / delete) */}
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setShowMenu(!showMenu)}
            className="p-1.5 rounded-lg hover:bg-stone-100 dark:hover:bg-white/5 transition-colors text-stone-500 dark:text-gray-400"
            aria-label="Plan actions"
          >
            <EllipsisIcon className="w-5 h-5" />
          </button>
          {showMenu && (
            <div className="absolute right-0 top-full mt-1 bg-white dark:bg-[oklch(0.21_0_0)] border border-stone-200 dark:border-[#2a2a2a] rounded-lg shadow-lg py-1 z-20 min-w-[150px]">
              <button
                type="button"
                onClick={archivePlan}
                className="w-full text-left px-3 py-1.5 text-sm text-stone-700 dark:text-gray-300 hover:bg-stone-50 dark:hover:bg-white/5 transition-colors"
              >
                Archive plan
              </button>
              <button
                type="button"
                onClick={deletePlan}
                className="w-full text-left px-3 py-1.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
              >
                Delete plan
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Progress bar */}
      {totalCount > 0 && (
        <div className="px-6 py-3 border-b border-stone-200 dark:border-[#2a2a2a]">
          <div className="flex items-center gap-3">
            <div className="flex-1 h-2 bg-stone-200 dark:bg-[#1e1e1e] rounded-full overflow-hidden">
              <div
                className="h-full bg-[oklch(0.745_0.189_148)] rounded-full transition-all duration-300"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <span className="text-xs text-stone-500 dark:text-gray-400 whitespace-nowrap">
              {completedCount}/{totalCount} completed
            </span>
          </div>
        </div>
      )}

      {/* Content area */}
      <div className="px-6 py-6 max-w-4xl mx-auto">
        {/* View/Edit toggle */}
        <div className="flex gap-1 mb-4">
          {(['view', 'edit'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setContentMode(mode)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium capitalize transition-colors ${
                contentMode === mode
                  ? 'bg-stone-200 dark:bg-[#1e1e1e] text-stone-900 dark:text-white'
                  : 'text-stone-500 dark:text-gray-400 hover:text-stone-700 dark:hover:text-gray-200 hover:bg-stone-100 dark:hover:bg-white/5'
              }`}
            >
              {mode}
            </button>
          ))}
        </div>

        {contentMode === 'view' ? (
          <div className="prose prose-stone dark:prose-invert max-w-none prose-headings:text-stone-900 dark:prose-headings:text-white prose-p:text-stone-600 dark:prose-p:text-gray-400 prose-a:text-[oklch(0.745_0.189_148)] prose-code:text-sm prose-code:bg-stone-100 dark:prose-code:bg-white/10 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded">
            {draftContent ? (
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{draftContent}</ReactMarkdown>
            ) : (
              <p className="text-stone-400 dark:text-gray-500 italic">
                No content yet. Switch to Edit to start writing.
              </p>
            )}
          </div>
        ) : (
          <textarea
            ref={textareaRef}
            value={draftContent}
            onChange={(e) => {
              setDraftContent(e.target.value);
              resizeTextarea();
            }}
            placeholder="Write your plan in Markdown..."
            className="w-full min-h-[300px] bg-white dark:bg-[oklch(0.176_0_0)] border border-stone-200 dark:border-[#2a2a2a] rounded-lg p-4 text-sm text-stone-900 dark:text-white font-mono leading-relaxed placeholder:text-stone-400 dark:placeholder:text-gray-500 outline-none focus:ring-2 focus:ring-[oklch(0.745_0.189_148)]/30 focus:border-[oklch(0.745_0.189_148)] resize-none"
          />
        )}
      </div>

      {/* Todos section */}
      <div className="px-6 pb-12 max-w-4xl mx-auto">
        <div className="border-t border-stone-200 dark:border-[#2a2a2a] pt-6">
          <h2 className="text-base font-semibold text-stone-900 dark:text-white mb-4">
            Todos
          </h2>

          {plan.todos.length === 0 && !addingTodo && (
            <p className="text-sm text-stone-400 dark:text-gray-500 mb-4">
              No todos yet.
            </p>
          )}

          <div className="space-y-1">
            {plan.todos.map((todo) => (
              <div
                key={todo.id}
                className="group flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-stone-50 dark:hover:bg-white/[0.03] transition-colors"
              >
                {/* Checkbox */}
                <button
                  type="button"
                  onClick={() => toggleTodo(todo)}
                  className={`flex-shrink-0 w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors ${
                    todo.status === 'completed'
                      ? 'bg-[oklch(0.745_0.189_148)] border-[oklch(0.745_0.189_148)] text-white'
                      : 'border-stone-300 dark:border-[#333333] hover:border-[oklch(0.745_0.189_148)]'
                  }`}
                  aria-label={`Toggle "${todo.content}"`}
                >
                  {todo.status === 'completed' && <CheckIcon className="w-3 h-3" />}
                </button>

                {/* Content (double-click to edit inline) */}
                {editingTodoId === todo.id ? (
                  <input
                    type="text"
                    value={editingTodoContent}
                    onChange={(e) => setEditingTodoContent(e.target.value)}
                    onBlur={() => setEditingTodoId(null)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') setEditingTodoId(null);
                      if (e.key === 'Escape') setEditingTodoId(null);
                    }}
                    autoFocus
                    className="flex-1 text-sm bg-transparent border-b border-[oklch(0.745_0.189_148)] outline-none text-stone-900 dark:text-white px-1"
                  />
                ) : (
                  <span
                    onDoubleClick={() => {
                      setEditingTodoId(todo.id);
                      setEditingTodoContent(todo.content);
                    }}
                    className={`flex-1 text-sm select-none ${
                      todo.status === 'completed'
                        ? 'line-through text-stone-400 dark:text-gray-500'
                        : 'text-stone-700 dark:text-gray-300'
                    }`}
                  >
                    {todo.content}
                  </span>
                )}

                {/* Status pill */}
                <span
                  className={`px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${TODO_STATUS_STYLES[todo.status]}`}
                >
                  {todo.status.replace('_', ' ')}
                </span>
              </div>
            ))}

            {/* Add todo inline input */}
            {addingTodo && (
              <div className="flex items-center gap-3 py-2 px-3">
                <div className="w-5 h-5 rounded-md border-2 border-stone-300 dark:border-[#333333] flex-shrink-0" />
                <input
                  type="text"
                  value={newTodoContent}
                  onChange={(e) => setNewTodoContent(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newTodoContent.trim()) {
                      setNewTodoContent('');
                      setAddingTodo(false);
                    }
                    if (e.key === 'Escape') {
                      setNewTodoContent('');
                      setAddingTodo(false);
                    }
                  }}
                  onBlur={() => {
                    setNewTodoContent('');
                    setAddingTodo(false);
                  }}
                  autoFocus
                  placeholder="What needs to be done?"
                  className="flex-1 text-sm bg-transparent border-b border-stone-300 dark:border-[#333333] outline-none text-stone-900 dark:text-white placeholder:text-stone-400 dark:placeholder:text-gray-500 px-1 focus:border-[oklch(0.745_0.189_148)]"
                />
              </div>
            )}
          </div>

          {/* Add todo button */}
          {!addingTodo && (
            <button
              type="button"
              onClick={() => setAddingTodo(true)}
              className="mt-3 flex items-center gap-1.5 text-sm text-stone-500 dark:text-gray-400 hover:text-[oklch(0.745_0.189_148)] transition-colors"
            >
              <PlusIcon className="w-4 h-4" />
              Add todo
            </button>
          )}
        </div>
      </div>
    </div>
  );
}