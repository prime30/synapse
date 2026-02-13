'use client';

import { useState, useCallback } from 'react';
import { useShopifyPages } from '@/hooks/useShopifyPages';

// ── Types ─────────────────────────────────────────────────────────────

interface PagesPanelProps {
  connectionId: string;
}

// ── Loading skeleton ──────────────────────────────────────────────────

function SkeletonPage() {
  return (
    <div className="px-3 py-3 animate-pulse space-y-2">
      <div className="h-4 ide-surface-inset rounded w-48" />
      <div className="flex gap-2">
        <div className="h-3 ide-surface-inset rounded w-20" />
        <div className="h-3 ide-surface-inset rounded w-16" />
      </div>
    </div>
  );
}

// ── Published badge ───────────────────────────────────────────────────

function PublishedBadge({ publishedAt }: { publishedAt: string | null }) {
  const isPublished = !!publishedAt;

  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium uppercase ${
        isPublished
          ? 'text-green-400 bg-green-400/10'
          : 'ide-text-muted bg-stone-500/20'
      }`}
    >
      {isPublished ? 'Published' : 'Draft'}
    </span>
  );
}

// ── New / Edit page form ──────────────────────────────────────────────

function PageForm({
  initialTitle,
  initialBody,
  submitLabel,
  onSubmit,
  onCancel,
  isLoading,
}: {
  initialTitle?: string;
  initialBody?: string;
  submitLabel: string;
  onSubmit: (data: { title: string; body_html: string }) => void;
  onCancel: () => void;
  isLoading: boolean;
}) {
  const [title, setTitle] = useState(initialTitle ?? '');
  const [body, setBody] = useState(initialBody ?? '');

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!title.trim()) return;
      onSubmit({ title: title.trim(), body_html: body });
    },
    [title, body, onSubmit],
  );

  return (
    <form onSubmit={handleSubmit} className="px-3 py-3 border-b ide-border ide-surface-panel space-y-2.5">
      <input
        type="text"
        placeholder="Page title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="w-full px-2.5 py-1.5 text-xs rounded-md ide-input"
      />
      <textarea
        placeholder="Page content (HTML)"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={4}
        className="w-full px-2.5 py-1.5 text-xs rounded-md ide-input resize-y font-mono"
      />
      <div className="flex items-center gap-2 pt-1">
        <button
          type="submit"
          disabled={isLoading || !title.trim()}
          className="px-3 py-1.5 text-xs font-medium rounded-md bg-sky-500 text-white hover:bg-sky-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? 'Saving...' : submitLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1.5 text-xs font-medium rounded-md ide-surface-panel ide-text-muted hover:ide-text border ide-border transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

// ── Page row ──────────────────────────────────────────────────────────

function PageRow({
  page,
  onEdit,
  onDelete,
}: {
  page: {
    id: string;
    title: string;
    handle: string;
    body_html: string;
    published_at: string | null;
    updated_at: string;
  };
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5 border-b ide-border last:border-b-0 ide-hover transition-colors">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-sm ide-text font-medium truncate">
            {page.title}
          </span>
          <PublishedBadge publishedAt={page.published_at} />
        </div>
        <div className="flex items-center gap-2 text-[10px] ide-text-quiet">
          <code className="font-mono">/{page.handle}</code>
          <span>·</span>
          <span>
            Updated{' '}
            {new Date(page.updated_at).toLocaleDateString(undefined, {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        {/* Edit */}
        <button
          type="button"
          onClick={() => onEdit(page.id)}
          className="p-1 rounded ide-text-muted hover:text-sky-500 dark:hover:text-sky-400 hover:bg-sky-500/10 transition-colors"
          title="Edit page"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
        </button>

        {/* Delete */}
        <button
          type="button"
          onClick={() => onDelete(page.id)}
          className="p-1 rounded ide-text-muted hover:text-red-400 hover:bg-red-400/10 transition-colors"
          title="Delete page"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </svg>
        </button>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────

export function PagesPanel({ connectionId }: PagesPanelProps) {
  const { pages, isLoading, error, refetch, createPage, updatePage, deletePage } =
    useShopifyPages(connectionId);
  const [showNewForm, setShowNewForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const handleCreate = useCallback(
    async (data: { title: string; body_html: string }) => {
      await createPage({ title: data.title, body_html: data.body_html, published: true });
      setShowNewForm(false);
    },
    [createPage],
  );

  const handleUpdate = useCallback(
    async (pageId: string, data: { title: string; body_html: string }) => {
      await updatePage(pageId, { title: data.title, body_html: data.body_html });
      setEditingId(null);
    },
    [updatePage],
  );

  const handleDelete = useCallback(
    async (pageId: string) => {
      await deletePage(pageId);
      setConfirmDeleteId(null);
    },
    [deletePage],
  );

  // ── Loading state ───────────────────────────────────────────────────

  if (isLoading && pages.length === 0) {
    return (
      <div className="divide-y ide-border">
        <SkeletonPage />
        <SkeletonPage />
        <SkeletonPage />
      </div>
    );
  }

  // ── Error state ─────────────────────────────────────────────────────

  if (error) {
    return (
      <div className="flex flex-col items-center py-8 px-4 text-center">
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-red-400 mb-2"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
        <p className="text-sm text-red-400 mb-1">{error}</p>
        <button
          type="button"
          onClick={() => refetch()}
          className="text-xs ide-text-muted hover:ide-text underline transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  // ── Pages list ──────────────────────────────────────────────────────

  return (
    <div>
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 border-b ide-border">
        <span className="text-[11px] ide-text-muted">
          {pages.length} page{pages.length !== 1 ? 's' : ''}
        </span>
        <button
          type="button"
          onClick={() => {
            setShowNewForm(!showNewForm);
            setEditingId(null);
          }}
          className="px-2.5 py-1 text-[11px] font-medium rounded-md ide-active text-sky-500 dark:text-sky-400 hover:bg-sky-500/20 border border-sky-500/30 transition-colors"
        >
          {showNewForm ? 'Cancel' : 'New Page'}
        </button>
      </div>

      {/* New page form */}
      {showNewForm && (
        <PageForm
          submitLabel="Create Page"
          onSubmit={handleCreate}
          onCancel={() => setShowNewForm(false)}
          isLoading={isLoading}
        />
      )}

      {/* Empty state */}
      {pages.length === 0 && !showNewForm && (
        <div className="flex flex-col items-center py-8 px-4 text-center">
          <span className="text-2xl mb-2">📄</span>
          <p className="text-sm ide-text-muted font-medium">No pages</p>
          <p className="text-[11px] ide-text-quiet mt-1 max-w-[240px]">
            Create a page to add content like About Us, Contact, or FAQ.
          </p>
        </div>
      )}

      {/* Page list */}
      {pages.map((page) => (
        <div key={page.id}>
          {editingId === page.id ? (
            <PageForm
              initialTitle={page.title}
              initialBody={page.body_html}
              submitLabel="Save Changes"
              onSubmit={(data) => handleUpdate(page.id, data)}
              onCancel={() => setEditingId(null)}
              isLoading={isLoading}
            />
          ) : confirmDeleteId === page.id ? (
            /* Delete confirmation */
            <div className="flex items-center gap-3 px-3 py-2.5 border-b ide-border bg-red-400/5">
              <span className="text-xs ide-text-2 flex-1">
                Delete &ldquo;{page.title}&rdquo;?
              </span>
              <button
                type="button"
                onClick={() => handleDelete(page.id)}
                className="px-2.5 py-1 text-[11px] font-medium rounded-md bg-red-600 text-white hover:bg-red-500 transition-colors"
              >
                Delete
              </button>
              <button
                type="button"
                onClick={() => setConfirmDeleteId(null)}
                className="px-2.5 py-1 text-[11px] font-medium rounded-md ide-surface-panel ide-text-muted hover:ide-text border ide-border transition-colors"
              >
                Cancel
              </button>
            </div>
          ) : (
            <PageRow
              page={page}
              onEdit={(id) => {
                setEditingId(id);
                setShowNewForm(false);
              }}
              onDelete={(id) => setConfirmDeleteId(id)}
            />
          )}
        </div>
      ))}
    </div>
  );
}
