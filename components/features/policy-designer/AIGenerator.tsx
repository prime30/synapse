'use client';

import { useState, useCallback } from 'react';
import { LambdaDots } from '@/components/ui/LambdaDots';
import type { PolicyType, PolicyContent } from '@/lib/policy-designer/types';
import { POLICY_LABELS } from '@/lib/policy-designer/types';

interface AIGeneratorProps {
  projectId: string;
  onGenerate: (policy: PolicyContent) => void;
}

const INDUSTRIES = [
  { value: 'apparel', label: 'Apparel & Fashion' },
  { value: 'beauty', label: 'Beauty & Cosmetics' },
  { value: 'food', label: 'Food & Beverage' },
  { value: 'electronics', label: 'Electronics' },
  { value: 'general', label: 'General Retail' },
  { value: 'custom', label: 'Custom / Other' },
];

const POLICY_TYPES: PolicyType[] = ['return', 'privacy', 'terms', 'shipping', 'contact'];

export function AIGenerator({ projectId, onGenerate }: AIGeneratorProps) {
  const [storeName, setStoreName] = useState('');
  const [email, setEmail] = useState('');
  const [industry, setIndustry] = useState('general');
  const [policyType, setPolicyType] = useState<PolicyType>('return');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = useCallback(async () => {
    if (!storeName.trim()) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/projects/${projectId}/policy-designer/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeName, email, industry, policyType, notes }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Generation failed (${res.status})`);
      }

      const policy: PolicyContent = await res.json();
      onGenerate(policy);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }, [storeName, email, industry, policyType, notes, projectId, onGenerate]);

  const inputClass =
    'w-full rounded-lg border border-stone-300 dark:border-[#2a2a2a] bg-white dark:bg-[#141414] px-3 py-2 text-sm text-stone-900 dark:text-white placeholder:text-stone-400 dark:placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-accent/40';

  return (
    <div className="max-w-xl space-y-5">
      <div>
        <label className="block text-sm font-medium text-stone-700 dark:text-white/70 mb-1">
          Store Name <span className="text-rose-500">*</span>
        </label>
        <input
          type="text"
          value={storeName}
          onChange={(e) => setStoreName(e.target.value)}
          placeholder="My Awesome Store"
          className={inputClass}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-stone-700 dark:text-white/70 mb-1">
          Contact Email
        </label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="support@example.com"
          className={inputClass}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-stone-700 dark:text-white/70 mb-1">Industry</label>
        <select value={industry} onChange={(e) => setIndustry(e.target.value)} className={inputClass}>
          {INDUSTRIES.map((ind) => (
            <option key={ind.value} value={ind.value}>
              {ind.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-stone-700 dark:text-white/70 mb-2">Policy Type</label>
        <div className="flex flex-wrap gap-3">
          {POLICY_TYPES.map((type) => (
            <label
              key={type}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm cursor-pointer transition-colors ${
                policyType === type
                  ? 'border-accent bg-accent/10 text-stone-900 dark:text-white'
                  : 'border-stone-200 dark:border-[#2a2a2a] text-stone-600 dark:text-[#807a74] hover:border-stone-300 dark:hover:border-[#333333]'
              }`}
            >
              <input
                type="radio"
                name="policyType"
                value={type}
                checked={policyType === type}
                onChange={() => setPolicyType(type)}
                className="sr-only"
              />
              {POLICY_LABELS[type]}
            </label>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-stone-700 dark:text-white/70 mb-1">
          Special Notes <span className="text-stone-400 dark:text-[#4a4a4a] font-normal">(optional)</span>
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value.slice(0, 500))}
          placeholder="e.g. 30-day return window, no international shipping…"
          rows={3}
          className={inputClass + ' resize-y'}
        />
        <p className="mt-1 text-xs text-stone-400 dark:text-[#4a4a4a]">{notes.length}/500</p>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-500/20 bg-rose-500/5 dark:bg-rose-500/10 px-4 py-3">
          <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>
        </div>
      )}

      <button
        onClick={handleGenerate}
        disabled={loading || !storeName.trim()}
        className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium rounded-lg bg-accent hover:bg-accent-hover text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading && <LambdaDots size={16} />}
        {loading ? 'Generating…' : 'Generate Policy'}
      </button>
    </div>
  );
}
