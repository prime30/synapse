'use client';

import React, { useState, useMemo, useCallback } from 'react';
import {
  Database,
  Plus,
  Trash2,
  Pencil,
  Search,
  Tag,
  ChevronRight,
  Loader2,
  AlertCircle,
  X,
} from 'lucide-react';
import {
  useMetafields,
  METAFIELD_TYPE_LABELS,
  type ShopifyMetafield,
  type MetafieldType,
} from '@/hooks/useMetafields';
import { MetafieldForm } from './MetafieldForm';

// ── Props ───────────────────────────────────────────────────────────────────────

export interface MetafieldExplorerProps {
  connectionId: string;
}

// ── Helpers ─────────────────────────────────────────────────────────────────────

/** Truncate a value for the table preview. */
function truncateValue(value: string, max = 60): string {
  if (value.length <= max) return value;
  return value.slice(0, max) + '…';
}

/** Format an ISO date for display. */
function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

/** Get a color for a type badge. */
function typeBadgeColor(type: string): string {
  const colors: Record<string, string> = {
    single_line_text_field: 'bg-emerald-500/20 text-emerald-400',
    multi_line_text_field: 'bg-emerald-500/20 text-emerald-400',
    number_integer: 'bg-blue-500/20 text-blue-400',
    number_decimal: 'bg-blue-500/20 text-blue-400',
    json: 'bg-amber-500/20 text-amber-400',
    rich_text_field: 'bg-amber-500/20 text-amber-400',
    boolean: 'bg-purple-500/20 text-purple-400',
    date: 'bg-cyan-500/20 text-cyan-400',
    date_time: 'bg-cyan-500/20 text-cyan-400',
    color: 'bg-pink-500/20 text-pink-400',
    url: 'bg-indigo-500/20 text-indigo-400',
    money: 'bg-yellow-500/20 text-yellow-400',
    rating: 'bg-orange-500/20 text-orange-400',
    weight: 'bg-teal-500/20 text-teal-400',
    dimension: 'bg-teal-500/20 text-teal-400',
    volume: 'bg-teal-500/20 text-teal-400',
  };
  return colors[type] ?? 'bg-gray-500/20 text-gray-400';
}

// ── Component ───────────────────────────────────────────────────────────────────

export function MetafieldExplorer({ connectionId }: MetafieldExplorerProps) {
  // ── State ─────────────────────────────────────────────────────────────────
  const [namespaceFilter, setNamespaceFilter] = useState<string | undefined>(
    undefined
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingMetafield, setEditingMetafield] = useState<
    ShopifyMetafield | undefined
  >(undefined);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  // ── Data ──────────────────────────────────────────────────────────────────
  const {
    metafields,
    isLoading,
    error,
    createMetafield,
    updateMetafield,
    deleteMetafield,
    isCreating,
    isUpdating,
    isDeleting,
  } = useMetafields(connectionId, namespaceFilter);

  // ── Derived state ─────────────────────────────────────────────────────────

  // Extract unique namespaces for filter tabs
  const namespaces = useMemo(() => {
    const ns = new Set(metafields.map((m) => m.namespace));
    return Array.from(ns).sort();
  }, [metafields]);

  // Filter metafields by search query
  const filteredMetafields = useMemo(() => {
    if (!searchQuery.trim()) return metafields;
    const q = searchQuery.toLowerCase();
    return metafields.filter(
      (m) =>
        m.key.toLowerCase().includes(q) ||
        m.namespace.toLowerCase().includes(q) ||
        m.value.toLowerCase().includes(q)
    );
  }, [metafields, searchQuery]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleCreate = useCallback(() => {
    setEditingMetafield(undefined);
    setShowForm(true);
  }, []);

  const handleEdit = useCallback((metafield: ShopifyMetafield) => {
    setEditingMetafield(metafield);
    setShowForm(true);
  }, []);

  const handleFormCancel = useCallback(() => {
    setShowForm(false);
    setEditingMetafield(undefined);
  }, []);

  const handleSave = useCallback(
    async (data: {
      namespace: string;
      key: string;
      value: string;
      type: string;
      id?: number;
    }) => {
      try {
        if (data.id) {
          await updateMetafield({ id: data.id, value: data.value });
        } else {
          await createMetafield({
            namespace: data.namespace,
            key: data.key,
            value: data.value,
            type: data.type,
          });
        }
        setShowForm(false);
        setEditingMetafield(undefined);
      } catch {
        // Error is surfaced via hook state
      }
    },
    [createMetafield, updateMetafield]
  );

  const handleDelete = useCallback(
    async (id: number) => {
      try {
        await deleteMetafield(id);
        setDeletingId(null);
      } catch {
        // Error is surfaced via hook state
      }
    },
    [deleteMetafield]
  );

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full flex-col rounded-lg border border-gray-800 bg-gray-900/50">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between border-b border-gray-800 px-4 py-3">
        <div className="flex items-center gap-2">
          <Database className="h-5 w-5 text-gray-400" />
          <h2 className="text-sm font-semibold text-gray-100">Metafields</h2>
          {!isLoading && (
            <span className="rounded-full bg-gray-800 px-2 py-0.5 text-xs text-gray-400">
              {filteredMetafields.length}
            </span>
          )}
        </div>
        <button
          onClick={handleCreate}
          className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-blue-700 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          Create Metafield
        </button>
      </div>

      {/* ── Namespace filter tabs ───────────────────────────────────────── */}
      {namespaces.length > 0 && (
        <div className="flex items-center gap-1 overflow-x-auto border-b border-gray-800 px-4 py-2">
          <button
            onClick={() => setNamespaceFilter(undefined)}
            className={`shrink-0 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
              !namespaceFilter
                ? 'bg-blue-600/20 text-blue-400'
                : 'text-gray-400 hover:bg-gray-800 hover:text-gray-300'
            }`}
          >
            All
          </button>
          {namespaces.map((ns) => (
            <button
              key={ns}
              onClick={() =>
                setNamespaceFilter(namespaceFilter === ns ? undefined : ns)
              }
              className={`shrink-0 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                namespaceFilter === ns
                  ? 'bg-blue-600/20 text-blue-400'
                  : 'text-gray-400 hover:bg-gray-800 hover:text-gray-300'
              }`}
            >
              <Tag className="mr-1 inline h-3 w-3" />
              {ns}
            </button>
          ))}
        </div>
      )}

      {/* ── Search bar ──────────────────────────────────────────────────── */}
      <div className="border-b border-gray-800 px-4 py-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by key, namespace, or value…"
            className="w-full rounded-md border border-gray-700 bg-gray-800/60 py-1.5 pl-8 pr-3 text-sm text-gray-100 placeholder-gray-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* ── Slide-out form panel ────────────────────────────────────────── */}
      {showForm && (
        <div className="border-b border-gray-800 bg-gray-800/60 px-4 py-4">
          <MetafieldForm
            metafield={editingMetafield}
            onSave={handleSave}
            onCancel={handleFormCancel}
            isSaving={isCreating || isUpdating}
          />
        </div>
      )}

      {/* ── Content area ────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto">
        {/* Loading */}
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            <span className="ml-2 text-sm text-gray-400">
              Loading metafields…
            </span>
          </div>
        )}

        {/* Error */}
        {error && !isLoading && (
          <div className="flex items-center gap-2 px-4 py-8 text-sm text-red-400">
            <AlertCircle className="h-5 w-5 shrink-0" />
            <span>{error.message}</span>
          </div>
        )}

        {/* Empty state */}
        {!isLoading && !error && filteredMetafields.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Database className="mb-3 h-10 w-10 text-gray-600" />
            <p className="text-sm font-medium text-gray-400">
              {searchQuery
                ? 'No metafields match your search'
                : 'No metafields found'}
            </p>
            <p className="mt-1 text-xs text-gray-500">
              {searchQuery
                ? 'Try a different search term'
                : 'Create your first metafield to get started'}
            </p>
          </div>
        )}

        {/* Metafield list / table */}
        {!isLoading && !error && filteredMetafields.length > 0 && (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                <th className="px-4 py-2">Namespace / Key</th>
                <th className="px-4 py-2">Type</th>
                <th className="px-4 py-2">Value</th>
                <th className="hidden px-4 py-2 md:table-cell">Updated</th>
                <th className="px-4 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/60">
              {filteredMetafields.map((mf) => (
                <tr
                  key={mf.id}
                  className="group cursor-pointer hover:bg-gray-800/40 transition-colors"
                  onClick={() => handleEdit(mf)}
                >
                  {/* Namespace / Key */}
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-1.5">
                      <ChevronRight className="h-3.5 w-3.5 text-gray-600 group-hover:text-gray-400 transition-colors" />
                      <span className="text-gray-500">{mf.namespace}</span>
                      <span className="text-gray-600">.</span>
                      <span className="font-medium text-gray-200">
                        {mf.key}
                      </span>
                    </div>
                  </td>

                  {/* Type badge */}
                  <td className="px-4 py-2.5">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${typeBadgeColor(mf.type)}`}
                    >
                      {METAFIELD_TYPE_LABELS[mf.type as MetafieldType] ??
                        mf.type}
                    </span>
                  </td>

                  {/* Value preview */}
                  <td className="max-w-[200px] truncate px-4 py-2.5 text-gray-400">
                    {mf.type === 'color' && /^#[0-9a-fA-F]{6}$/.test(mf.value) ? (
                      <div className="flex items-center gap-2">
                        <span
                          className="inline-block h-4 w-4 rounded border border-gray-700"
                          style={{ backgroundColor: mf.value }}
                        />
                        <span>{mf.value}</span>
                      </div>
                    ) : mf.type === 'boolean' ? (
                      <span
                        className={
                          mf.value === 'true'
                            ? 'text-emerald-400'
                            : 'text-gray-500'
                        }
                      >
                        {mf.value === 'true' ? 'True' : 'False'}
                      </span>
                    ) : (
                      truncateValue(mf.value)
                    )}
                  </td>

                  {/* Updated */}
                  <td className="hidden px-4 py-2.5 text-gray-500 md:table-cell">
                    {formatDate(mf.updated_at)}
                  </td>

                  {/* Actions */}
                  <td className="px-4 py-2.5 text-right">
                    <div
                      className="flex items-center justify-end gap-1"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        onClick={() => handleEdit(mf)}
                        title="Edit metafield"
                        className="rounded p-1 text-gray-500 hover:bg-gray-700 hover:text-gray-300 transition-colors"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>

                      {deletingId === mf.id ? (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleDelete(mf.id)}
                            disabled={isDeleting}
                            className="rounded bg-red-600/20 px-2 py-0.5 text-xs text-red-400 hover:bg-red-600/30 disabled:opacity-50 transition-colors"
                          >
                            {isDeleting ? 'Deleting…' : 'Confirm'}
                          </button>
                          <button
                            onClick={() => setDeletingId(null)}
                            className="rounded p-0.5 text-gray-500 hover:text-gray-300"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setDeletingId(mf.id)}
                          title="Delete metafield"
                          className="rounded p-1 text-gray-500 hover:bg-red-900/30 hover:text-red-400 transition-colors"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
