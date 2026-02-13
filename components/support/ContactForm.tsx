'use client';

import { useState, useCallback } from 'react';
import { useAuth } from '@/components/features/auth/AuthProvider';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ContactFormProps {
  className?: string;
}

type FormStatus = 'idle' | 'submitting' | 'success' | 'error';

const SUBJECT_OPTIONS = [
  { value: '', label: 'Select a topic...' },
  { value: 'bug', label: 'Bug report' },
  { value: 'feature', label: 'Feature request' },
  { value: 'shopify', label: 'Shopify integration issue' },
  { value: 'account', label: 'Account & billing' },
  { value: 'other', label: 'Other' },
] as const;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * ContactForm — support ticket form that POSTs to /api/support/ticket.
 * Pre-fills the user's email from auth context.
 */
export function ContactForm({ className = '' }: ContactFormProps) {
  const { user } = useAuth();
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState<FormStatus>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const email = user?.email ?? '';

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      if (!subject || !message.trim()) return;

      setStatus('submitting');
      setErrorMessage('');

      try {
        const res = await fetch('/api/support/ticket', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email,
            subject,
            message: message.trim(),
          }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || `Request failed (${res.status})`);
        }

        setStatus('success');
        setSubject('');
        setMessage('');
      } catch (err) {
        setStatus('error');
        setErrorMessage(
          err instanceof Error ? err.message : 'Something went wrong. Please try again.',
        );
      }
    },
    [email, subject, message],
  );

  // Success state
  if (status === 'success') {
    return (
      <div className={`flex flex-col items-center justify-center py-8 px-4 ${className}`}>
        <div className="w-10 h-10 rounded-full bg-green-500/10 border border-green-500/20 flex items-center justify-center mb-3">
          <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h3 className="text-sm font-medium ide-text mb-1">Message sent!</h3>
        <p className="text-xs ide-text-muted text-center mb-4">
          We&apos;ll get back to you as soon as possible.
        </p>
        <button
          type="button"
          onClick={() => setStatus('idle')}
          className="text-xs text-sky-500 dark:text-sky-400 hover:text-sky-400 transition-colors"
        >
          Send another message
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className={`flex flex-col gap-3 px-3 ${className}`}>
      {/* Email (read-only, pre-filled) */}
      <div>
        <label htmlFor="support-email" className="block text-[10px] font-medium ide-text-muted mb-1">
          Email
        </label>
        <input
          id="support-email"
          type="email"
          value={email}
          readOnly
          className="w-full px-2.5 py-1.5 text-xs rounded ide-surface-input border ide-border ide-text-muted cursor-not-allowed"
        />
      </div>

      {/* Subject dropdown */}
      <div>
        <label htmlFor="support-subject" className="block text-[10px] font-medium ide-text-muted mb-1">
          Topic
        </label>
        <select
          id="support-subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          required
          className="w-full px-2.5 py-1.5 text-xs rounded ide-input appearance-none"
        >
          {SUBJECT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value} disabled={!opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Message textarea */}
      <div>
        <label htmlFor="support-message" className="block text-[10px] font-medium ide-text-muted mb-1">
          Message
        </label>
        <textarea
          id="support-message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          required
          rows={5}
          placeholder="Describe your issue or question..."
          className="w-full px-2.5 py-1.5 text-xs rounded ide-input resize-none"
        />
      </div>

      {/* Error message */}
      {status === 'error' && errorMessage && (
        <p className="text-xs text-red-400">{errorMessage}</p>
      )}

      {/* Submit button */}
      <button
        type="submit"
        disabled={!subject || !message.trim() || status === 'submitting'}
        className="w-full px-3 py-2 text-xs font-medium rounded bg-white ide-text hover:bg-stone-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {status === 'submitting' ? 'Sending...' : 'Send message'}
      </button>

      <p className="text-[10px] ide-text-quiet text-center">
        Or email us directly at{' '}
        <a href="mailto:support@synapse.shop" className="text-sky-500 dark:text-sky-400 hover:text-sky-400">
          support@synapse.shop
        </a>
      </p>
    </form>
  );
}
