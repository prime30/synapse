'use client';

import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Loader2 } from 'lucide-react';

const CATEGORIES = [
  { value: 'theme-type', label: 'Theme Type' },
  { value: 'task-type', label: 'Task Type' },
  { value: 'component', label: 'Component' },
  { value: 'workflow', label: 'Workflow' },
  { value: 'debugging', label: 'Debugging' },
  { value: 'performance', label: 'Performance' },
  { value: 'accessibility', label: 'Accessibility' },
  { value: 'cx-optimization', label: 'CX Optimization' },
  { value: 'migration', label: 'Migration' },
  { value: 'internationalization', label: 'Internationalization' },
] as const;

const THEME_OPTIONS = [
  { value: 'Dawn', label: 'Dawn' },
  { value: 'Debut', label: 'Debut' },
  { value: 'Impulse', label: 'Impulse' },
  { value: 'Custom', label: 'Custom' },
] as const;

interface PublishSkillModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function PublishSkillModal({
  isOpen,
  onClose,
  onSuccess,
}: PublishSkillModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [content, setContent] = useState('');
  const [keywords, setKeywords] = useState('');
  const [category, setCategory] = useState('workflow');
  const [themeCompatibility, setThemeCompatibility] = useState<string[]>([]);
  const [version, setVersion] = useState('1.0.0');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleTheme = (val: string) => {
    setThemeCompatibility((prev) =>
      prev.includes(val) ? prev.filter((t) => t !== val) : [...prev, val]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch('/api/skills/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim(),
          content: content.trim(),
          keywords: keywords
            .split(',')
            .map((k) => k.trim().toLowerCase())
            .filter(Boolean),
          category,
          themeCompatibility: themeCompatibility.length ? themeCompatibility : undefined,
          version: version.trim() || '1.0.0',
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error || 'Failed to publish skill');
      }
      setName('');
      setDescription('');
      setContent('');
      setKeywords('');
      setCategory('workflow');
      setThemeCompatibility([]);
      setVersion('1.0.0');
      onSuccess?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to publish');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Publish Skill"
      size="lg"
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {error && (
          <div className="rounded-md bg-red-50 dark:bg-red-900/20 px-3 py-2 text-sm text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-stone-700 dark:text-gray-300 mb-1">
            Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. liquid-schema-helper"
            required
            className="w-full px-3 py-2 rounded-md bg-white dark:bg-white/5 border border-stone-300 dark:border-white/10 text-stone-900 dark:text-white placeholder:text-stone-400"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-stone-700 dark:text-gray-300 mb-1">
            Description
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Brief description of what this skill does"
            required
            rows={2}
            className="w-full px-3 py-2 rounded-md bg-white dark:bg-white/5 border border-stone-300 dark:border-white/10 text-stone-900 dark:text-white placeholder:text-stone-400 resize-none"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-stone-700 dark:text-gray-300 mb-1">
            Content (SKILL.md format, 100–10000 chars)
          </label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="# Skill Name\n\n## Keywords\n- liquid, schema, ...\n\n## Content\n..."
            required
            rows={10}
            className="w-full px-3 py-2 rounded-md bg-white dark:bg-white/5 border border-stone-300 dark:border-white/10 text-stone-900 dark:text-white placeholder:text-stone-400 font-mono text-sm resize-y"
          />
          <p className="mt-1 text-xs text-stone-500 dark:text-gray-500">
            {content.length} / 10000 characters (min 100)
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-stone-700 dark:text-gray-300 mb-1">
            Keywords (comma-separated)
          </label>
          <input
            type="text"
            value={keywords}
            onChange={(e) => setKeywords(e.target.value)}
            placeholder="liquid, schema, section, shopify"
            className="w-full px-3 py-2 rounded-md bg-white dark:bg-white/5 border border-stone-300 dark:border-white/10 text-stone-900 dark:text-white placeholder:text-stone-400"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-stone-700 dark:text-gray-300 mb-1">
            Category
          </label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full px-3 py-2 rounded-md bg-white dark:bg-white/5 border border-stone-300 dark:border-white/10 text-stone-900 dark:text-white"
          >
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-stone-700 dark:text-gray-300 mb-2">
            Theme Compatibility
          </label>
          <div className="flex flex-wrap gap-2">
            {THEME_OPTIONS.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => toggleTheme(t.value)}
                className={`px-3 py-1.5 rounded-md text-sm transition-colors ${
                  themeCompatibility.includes(t.value)
                    ? 'bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300'
                    : 'bg-stone-100 dark:bg-white/5 text-stone-600 dark:text-gray-400 hover:bg-stone-200 dark:hover:bg-white/10'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-stone-700 dark:text-gray-300 mb-1">
            Version
          </label>
          <input
            type="text"
            value={version}
            onChange={(e) => setVersion(e.target.value)}
            placeholder="1.0.0"
            className="w-full px-3 py-2 rounded-md bg-white dark:bg-white/5 border border-stone-300 dark:border-white/10 text-stone-900 dark:text-white placeholder:text-stone-400"
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-md border border-stone-300 dark:border-white/10 text-stone-700 dark:text-gray-300 hover:bg-stone-100 dark:hover:bg-white/5"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting || content.length < 100 || content.length > 10000}
            className="px-4 py-2 rounded-md bg-[#28CD56] hover:bg-[#1FB849] text-white disabled:opacity-50 flex items-center gap-2"
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : null}
            Publish
          </button>
        </div>
      </form>
    </Modal>
  );
}
