'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import type { TemplateEntry } from '@/lib/preview/template-classifier';

interface CreateTemplateModalProps {
  templateType: string;
  existingTemplates: TemplateEntry[];
  projectId: string;
  onCreated: (newFilePath: string) => void;
  onClose: () => void;
}

/**
 * Modal dialog for creating a new Shopify theme template.
 * Matches the Shopify customizer's "Create a template" pattern.
 */
export function CreateTemplateModal({
  templateType,
  existingTemplates,
  projectId,
  onCreated,
  onClose,
}: CreateTemplateModalProps) {
  const [name, setName] = useState('');
  const [basedOn, setBasedOn] = useState<string>(
    // Pre-select the default (variant=null) or first entry
    existingTemplates.find((t) => t.variant === null)?.fileId ??
      existingTemplates[0]?.fileId ??
      ''
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  // Auto-focus name input
  useEffect(() => {
    setTimeout(() => nameRef.current?.focus(), 100);
  }, []);

  // Validate name: alphanumeric, hyphens, underscores only
  const sanitizedName = name.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  const isValid = sanitizedName.length > 0 && sanitizedName.length <= 25 && basedOn;
  const newFilePath = `templates/${templateType}.${sanitizedName}.json`;

  const handleSubmit = useCallback(async () => {
    if (!isValid || loading) return;
    setLoading(true);
    setError(null);

    try {
      // 1. Fetch base template content
      let baseContent = '{}';
      if (basedOn) {
        const contentRes = await fetch(`/api/files/${basedOn}`);
        if (contentRes.ok) {
          const contentJson = await contentRes.json();
          baseContent = contentJson.data?.content ?? '{}';
        }
      }

      // 2. Create the new file
      const createRes = await fetch(`/api/projects/${projectId}/files`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newFilePath,
          content: baseContent,
        }),
      });

      if (createRes.status === 409) {
        setError('A template with this name already exists.');
        setLoading(false);
        return;
      }

      if (!createRes.ok) {
        const errJson = await createRes.json().catch(() => null);
        setError(errJson?.error ?? 'Failed to create template.');
        setLoading(false);
        return;
      }

      // 3. Success
      onCreated(newFilePath);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred.');
      setLoading(false);
    }
  }, [isValid, loading, basedOn, projectId, newFilePath, onCreated]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    } else if (e.key === 'Enter' && isValid && !loading) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center ide-overlay backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={handleKeyDown}
    >
      <div
        className="relative ide-surface-pop rounded-xl shadow-2xl max-w-lg w-full mx-4 border ide-border flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-label="Create a template"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4">
          <h2 className="text-lg font-semibold ide-text">Create a template</h2>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-md ide-text-3 hover:ide-text ide-hover transition-colors"
            aria-label="Close"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 min-h-0 space-y-4">
          <p className="text-sm ide-text-2">
            Create a template to customize how your content is displayed.
            After it&apos;s published, assign it in the Shopify admin.
          </p>

          {/* Name input */}
          <div className="space-y-1.5">
            <label htmlFor="template-name" className="text-xs font-medium ide-text-muted">
              Name
            </label>
            <div className="relative">
              <input
                ref={nameRef}
                id="template-name"
                type="text"
                value={name}
                onChange={(e) => {
                  if (e.target.value.length <= 25) setName(e.target.value);
                }}
                maxLength={25}
                placeholder="e.g. my-custom"
                className="w-full ide-input px-3 py-2 text-sm pr-12"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs ide-text-muted tabular-nums">
                {name.length}/25
              </span>
            </div>
          </div>

          {/* Based on dropdown */}
          <div className="space-y-1.5">
            <label htmlFor="template-based-on" className="text-xs font-medium ide-text-muted">
              Based on
            </label>
            <select
              id="template-based-on"
              value={basedOn}
              onChange={(e) => setBasedOn(e.target.value)}
              className="w-full rounded-md ide-surface-input border ide-border px-3 py-1.5 text-sm ide-text focus:outline-none focus:border-sky-500 dark:focus:border-sky-400 transition-colors"
            >
              {existingTemplates.map((t) => (
                <option key={t.fileId ?? t.filePath} value={t.fileId ?? ''}>
                  {t.variant === null ? `Default ${t.label.toLowerCase()}` : t.variant.replace(/[_-]/g, ' ')}
                </option>
              ))}
            </select>
          </div>

          {/* Error */}
          {error && (
            <p className="text-sm text-red-500 dark:text-red-400">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t ide-border">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-sm rounded-md ide-surface-input ide-text-2 hover:ide-text ide-hover transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!isValid || loading}
            className="px-4 py-1.5 text-sm rounded-md bg-sky-500 text-white hover:bg-sky-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'Creating...' : 'Create template'}
          </button>
        </div>
      </div>
    </div>
  );
}
