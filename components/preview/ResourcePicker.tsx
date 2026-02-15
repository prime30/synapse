'use client';

import { useEffect, useMemo, useState } from 'react';
import type { PreviewResource, PreviewResourceType } from '@/lib/types/preview';

interface ResourcePickerProps {
  projectId: string;
  type: PreviewResourceType;
  label: string;
  onSelect: (resource: PreviewResource) => void;
}

export function ResourcePicker({
  projectId,
  type,
  label,
  onSelect,
}: ResourcePickerProps) {
  const [query, setQuery] = useState('');
  const [resources, setResources] = useState<PreviewResource[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const searchQuery = useMemo(() => query.trim(), [query]);

  useEffect(() => {
    const timeout = window.setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          projectId,
          type,
        });
        if (searchQuery) params.set('query', searchQuery);
        const res = await fetch(`/api/v1/preview/resources?${params.toString()}`);
        const json = await res.json();
        if (!res.ok) {
          setError(json.error ?? `Request failed (${res.status})`);
          setResources([]);
        } else {
          setResources((json.data?.resources ?? []) as PreviewResource[]);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load resources');
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => window.clearTimeout(timeout);
  }, [projectId, type, searchQuery]);

  return (
    <div className="space-y-2">
      <label className="text-xs ide-text-muted">{label}</label>
      <input
        type="text"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={`Search ${label.toLowerCase()}...`}
        className="w-full rounded ide-surface-input border ide-border px-3 py-2 text-sm ide-text placeholder-ide-text-muted"
      />

      {loading && <p className="text-xs ide-text-muted">Loading...</p>}
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}

      <ul className="max-h-64 overflow-y-auto space-y-2">
        {resources.map((resource) => (
          <li key={resource.id}>
            <button
              type="button"
              onClick={() => onSelect(resource)}
              className="flex w-full items-center gap-3 rounded border ide-border ide-surface-panel px-3 py-2 text-left text-sm ide-text-2 hover:ide-text ide-hover"
            >
              {resource.image ? (
                <img
                  src={resource.image}
                  alt={resource.title}
                  className="h-8 w-8 rounded object-cover"
                />
              ) : (
                <div className="h-8 w-8 rounded ide-surface-inset" />
              )}
              <div className="flex flex-col">
                <span className="font-medium">{resource.title}</span>
                <span className="text-xs ide-text-muted">{resource.handle}</span>
              </div>
            </button>
          </li>
        ))}
        {!loading && resources.length === 0 && (
          <li className="text-xs ide-text-muted">No results</li>
        )}
      </ul>
    </div>
  );
}
