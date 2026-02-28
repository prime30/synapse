'use client';

import { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { LambdaDots } from '@/components/ui/LambdaDots';

interface AdminUser {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  is_admin: boolean;
  created_at: string;
}

export function AdminPanel() {
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [isInviting, setIsInviting] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  const fetchAdmins = useCallback(async () => {
    try {
      const res = await fetch('/api/admin');
      if (!res.ok) return;
      const data = await res.json();
      setAdmins(data.admins ?? []);
    } catch {
      // silently fail
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAdmins();
  }, [fetchAdmins]);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    setIsInviting(true);
    setFeedback(null);

    try {
      const res = await fetch('/api/admin/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });

      const data = await res.json();

      if (!res.ok) {
        setFeedback({ type: 'error', message: data.error ?? 'Failed to invite admin.' });
        return;
      }

      setFeedback({ type: 'success', message: data.message });
      setEmail('');
      fetchAdmins();
    } catch {
      setFeedback({ type: 'error', message: 'Network error. Please try again.' });
    } finally {
      setIsInviting(false);
    }
  };

  const handleRemove = async (targetEmail: string) => {
    if (!confirm(`Remove admin access from ${targetEmail}?`)) return;

    try {
      const res = await fetch('/api/admin/invite', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: targetEmail }),
      });

      const data = await res.json();

      if (!res.ok) {
        setFeedback({ type: 'error', message: data.error ?? 'Failed to remove admin.' });
        return;
      }

      setFeedback({ type: 'success', message: data.message });
      fetchAdmins();
    } catch {
      setFeedback({ type: 'error', message: 'Network error. Please try again.' });
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-6 mb-10">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 text-xs font-medium tracking-widest uppercase text-stone-400 dark:text-white/30 hover:text-stone-600 dark:hover:text-white/60 transition-colors"
      >
        <svg
          className={`w-3.5 h-3.5 transition-transform ${isOpen ? 'rotate-90' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
        Admin Management
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="mt-4 rounded-xl border border-stone-200 dark:border-[#2a2a2a] bg-white dark:bg-[#141414] p-6">
              {/* Current Admins */}
              <h3 className="text-sm font-semibold text-stone-900 dark:text-white mb-4">
                Current Admins
              </h3>

              {isLoading ? (
                <div className="flex items-center gap-2 text-sm text-stone-400 dark:text-[#636059]">
                  <LambdaDots size={16} />
                  Loading...
                </div>
              ) : admins.length === 0 ? (
                <p className="text-sm text-stone-400 dark:text-[#636059]">No admins found.</p>
              ) : (
                <div className="space-y-2 mb-6">
                  {admins.map((admin) => (
                    <div
                      key={admin.id}
                      className="flex items-center justify-between gap-3 rounded-lg bg-stone-50 dark:bg-[#141414] px-4 py-3"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {admin.avatar_url ? (
                          <img
                            src={admin.avatar_url}
                            alt=""
                            className="w-8 h-8 rounded-full object-cover flex-shrink-0"
                          />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-stone-200 dark:bg-[#1e1e1e] flex items-center justify-center text-xs font-medium text-stone-500 dark:text-white/50 flex-shrink-0">
                            {(admin.full_name ?? admin.email)[0]?.toUpperCase()}
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-stone-900 dark:text-white truncate">
                            {admin.full_name ?? admin.email}
                          </p>
                          <p className="text-xs text-stone-400 dark:text-[#636059] truncate">
                            {admin.email}
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => handleRemove(admin.email)}
                        className="text-xs text-stone-400 dark:text-white/30 hover:text-red-500 dark:hover:text-red-400 transition-colors flex-shrink-0"
                        title="Remove admin"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Invite Form */}
              <div className="border-t border-stone-200 dark:border-[#2a2a2a] pt-5">
                <h3 className="text-sm font-semibold text-stone-900 dark:text-white mb-3">
                  Invite Admin
                </h3>
                <form onSubmit={handleInvite} className="flex gap-3">
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="user@example.com"
                    className="flex-1 rounded-lg border border-stone-200 dark:border-[#2a2a2a] bg-stone-50 dark:bg-[#141414] px-4 py-2.5 text-sm text-stone-900 dark:text-white placeholder-stone-400 dark:placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-sky-500/40 focus:border-sky-500 dark:focus:ring-sky-400/30 dark:focus:border-sky-400 transition-all"
                    disabled={isInviting}
                    required
                  />
                  <button
                    type="submit"
                    disabled={isInviting || !email.trim()}
                    className="rounded-lg bg-stone-900 dark:bg-white px-5 py-2.5 text-sm font-medium text-white dark:text-stone-900 hover:bg-stone-800 dark:hover:bg-white/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                  >
                    {isInviting ? 'Inviting...' : 'Invite'}
                  </button>
                </form>

                {/* Feedback */}
                <AnimatePresence>
                  {feedback && (
                    <motion.p
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className={`mt-3 text-sm ${
                        feedback.type === 'success'
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-red-600 dark:text-red-400'
                      }`}
                    >
                      {feedback.message}
                    </motion.p>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
