'use client';

import { useState, useCallback } from 'react';
import { Bug, X, AlertTriangle, ChevronDown } from 'lucide-react';
import type { BugSeverity } from '@/lib/types/database';

interface BugReportModalProps {
  projectId: string;
  onClose: () => void;
  onSubmitted?: () => void;
}

const SEVERITY_OPTIONS: { value: BugSeverity; label: string; color: string }[] = [
  { value: 'low', label: 'Low', color: 'text-stone-500' },
  { value: 'medium', label: 'Medium', color: 'text-amber-500' },
  { value: 'high', label: 'High', color: 'text-orange-500' },
  { value: 'critical', label: 'Critical', color: 'text-red-500' },
];

export function BugReportModal({ projectId, onClose, onSubmitted }: BugReportModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState<BugSeverity>('medium');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = useCallback(async () => {
    if (!title.trim()) {
      setError('Title is required');
      return;
    }
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/bug-reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          title: title.trim(),
          description: description.trim(),
          severity,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error?.message ?? 'Failed to submit');
      }

      setSuccess(true);
      onSubmitted?.();
      setTimeout(onClose, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit');
    } finally {
      setSubmitting(false);
    }
  }, [title, description, severity, projectId, onClose, onSubmitted]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-md mx-4 bg-[#fafaf9] dark:bg-[#0a0a0a] border border-stone-200 dark:border-white/10 rounded-xl shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-stone-200 dark:border-white/5">
          <div className="flex items-center gap-2">
            <Bug className="h-4 w-4 text-red-500" />
            <h2 className="text-sm font-semibold text-stone-900 dark:text-white">Report a Bug</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md hover:bg-stone-100 dark:hover:bg-white/5 transition-colors"
          >
            <X className="h-4 w-4 text-stone-500 dark:text-gray-400" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {success ? (
            <div className="text-center py-6">
              <div className="text-[#28CD56] text-lg font-medium">Bug report submitted</div>
              <p className="text-sm text-stone-500 dark:text-gray-400 mt-1">
                We&apos;ll look into it.
              </p>
            </div>
          ) : (
            <>
              <div>
                <label className="block text-xs font-medium text-stone-600 dark:text-gray-400 mb-1.5">
                  Title
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="What went wrong?"
                  maxLength={200}
                  className="w-full px-3 py-2 text-sm bg-white dark:bg-white/5 border border-stone-300 dark:border-white/10 rounded-lg text-stone-900 dark:text-white placeholder:text-stone-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-stone-600 dark:text-gray-400 mb-1.5">
                  Description
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Steps to reproduce, expected behavior, what actually happened..."
                  rows={4}
                  maxLength={5000}
                  className="w-full px-3 py-2 text-sm bg-white dark:bg-white/5 border border-stone-300 dark:border-white/10 rounded-lg text-stone-900 dark:text-white placeholder:text-stone-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-sky-500/40 resize-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-stone-600 dark:text-gray-400 mb-1.5">
                  Severity
                </label>
                <div className="relative">
                  <select
                    value={severity}
                    onChange={(e) => setSeverity(e.target.value as BugSeverity)}
                    className="w-full appearance-none px-3 py-2 pr-8 text-sm bg-white dark:bg-white/5 border border-stone-300 dark:border-white/10 rounded-lg text-stone-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                  >
                    {SEVERITY_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-stone-400 pointer-events-none" />
                </div>
              </div>

              {error && (
                <div className="flex items-center gap-2 text-sm text-red-500">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  {error}
                </div>
              )}
            </>
          )}
        </div>

        {!success && (
          <div className="flex justify-end gap-2 px-5 py-3 border-t border-stone-200 dark:border-white/5">
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-sm text-stone-600 dark:text-gray-400 hover:bg-stone-100 dark:hover:bg-white/5 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting || !title.trim()}
              className="px-4 py-1.5 text-sm font-medium text-white bg-red-500 hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
            >
              {submitting ? 'Submitting...' : 'Submit Bug'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export function BugReportButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title="Report a bug"
      className="p-1.5 rounded-md text-stone-500 dark:text-gray-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-stone-100 dark:hover:bg-white/5 transition-colors"
    >
      <Bug className="h-4 w-4" />
    </button>
  );
}
