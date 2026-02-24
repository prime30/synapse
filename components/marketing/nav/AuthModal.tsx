'use client';

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter, usePathname } from 'next/navigation';
import { GoogleSignInButton } from '@/components/features/auth/GoogleSignInButton';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialView?: 'login' | 'signup';
}

/** Map raw Supabase/API error codes to friendly user-facing messages. */
function friendlyAuthError(raw: string): string {
  const lower = raw.toLowerCase();
  if (lower.includes('invalid login credentials') || lower.includes('invalid_credentials'))
    return 'Incorrect email or password. Please try again.';
  if (lower.includes('email not confirmed') || lower.includes('email_not_confirmed'))
    return 'Please confirm your email address before signing in. Check your inbox.';
  if (lower.includes('user already registered') || lower.includes('user_already_exists'))
    return 'An account with this email already exists. Try signing in instead.';
  if (lower.includes('rate limit') || lower.includes('over_email_send_rate_limit'))
    return 'Too many attempts. Please wait a minute and try again.';
  if (lower.includes('password') && lower.includes('at least'))
    return raw; // keep validation messages as-is
  return raw;
}

export function AuthModal({ isOpen, onClose, initialView = 'login' }: AuthModalProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [view, setView] = useState<'login' | 'signup'>(initialView);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [infoMessage, setInfoMessage] = useState('');
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetEmailSent, setResetEmailSent] = useState(false);
  const isDev = process.env.NODE_ENV === 'development';

  const switchView = useCallback((newView: 'login' | 'signup') => {
    setView(newView);
    setEmail('');
    setPassword('');
    setFullName('');
    setErrorMessage('');
    setInfoMessage('');
    setShowForgotPassword(false);
    setResetEmailSent(false);
  }, []);

  // Sync initialView when modal opens
  const [prevInitialView, setPrevInitialView] = useState(initialView);
  if (initialView !== prevInitialView) {
    setPrevInitialView(initialView);
    switchView(initialView);
  }

  // ── Password login (primary) ─────────────────────────────────────
  const handlePasswordLogin = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setLoading(true);
      setErrorMessage('');
      setInfoMessage('');

      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        });

        if (!res.ok) {
          const body = await res.json();
          throw new Error(body.error || 'Login failed');
        }

        onClose();
        router.push('/onboarding?signed_in=1');
        router.refresh();
      } catch (err) {
        setErrorMessage(
          friendlyAuthError(err instanceof Error ? err.message : 'Login failed')
        );
      } finally {
        setLoading(false);
      }
    },
    [email, password, onClose, router]
  );

  // ── Forgot password (fallback) ───────────────────────────────────
  const handleForgotPassword = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!email.trim()) {
        setErrorMessage('Enter your email address.');
        return;
      }
      setLoading(true);
      setErrorMessage('');
      setInfoMessage('');

      try {
        const res = await fetch('/api/auth/forgot-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email }),
        });

        if (!res.ok) {
          const body = await res.json();
          throw new Error(body.error || 'Failed to send reset email');
        }

        setResetEmailSent(true);
      } catch (err) {
        setErrorMessage(
          friendlyAuthError(err instanceof Error ? err.message : 'Failed to send reset email')
        );
      } finally {
        setLoading(false);
      }
    },
    [email]
  );

  // ── Dev quick sign-in (dev only) ─────────────────────────────────
  const handleDevLogin = useCallback(async () => {
    if (!email.trim()) {
      setErrorMessage('Enter your email to use dev quick sign-in.');
      return;
    }
    if (!password.trim()) {
      setErrorMessage('Enter your password to use dev quick sign-in.');
      return;
    }

    setLoading(true);
    setErrorMessage('');
    setInfoMessage('');
    try {
      const callbackUrl = window.location.pathname || '/';
      const res = await fetch('/api/auth/dev-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callbackUrl, email: email.trim(), password }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? 'Dev login failed');
      }

      onClose();
      router.push(data.redirectTo ?? callbackUrl);
      router.refresh();
    } catch (err) {
      setErrorMessage(
        friendlyAuthError(err instanceof Error ? err.message : 'Dev login failed')
      );
    } finally {
      setLoading(false);
    }
  }, [email, onClose, password, router]);

  // ── Signup ───────────────────────────────────────────────────────
  const handleSignup = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setLoading(true);
      setErrorMessage('');
      setInfoMessage('');

      try {
        const res = await fetch('/api/auth/signup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password, full_name: fullName }),
        });

        const body = await res.json();

        if (!res.ok) {
          throw new Error(body.error || 'Signup failed');
        }

        if (body.data?.needsEmailConfirmation) {
          setView('login');
          setPassword('');
          setInfoMessage(
            'Account created! Check your email to confirm, then sign in with your password.'
          );
          return;
        }

        onClose();
        router.push('/onboarding?signed_in=1');
        router.refresh();
      } catch (err) {
        setErrorMessage(
          friendlyAuthError(err instanceof Error ? err.message : 'Signup failed')
        );
      } finally {
        setLoading(false);
      }
    },
    [email, password, fullName, onClose, router]
  );

  const inputClass =
    'w-full rounded-lg border px-4 py-3 text-sm focus:outline-none transition-colors border-stone-200 bg-white text-stone-900 placeholder:text-stone-400 focus:border-accent/50 dark:bg-white/5 dark:border-white/10 dark:text-white dark:placeholder:text-white/30';

  const primaryBtnClass =
    'w-full rounded-lg bg-accent py-3 text-sm font-medium text-white hover:bg-accent-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed';

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-md dark:bg-black/60 dark:backdrop-blur-lg"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
          />

          {/* Modal container */}
          <div className="fixed inset-0 z-[61] flex items-center justify-center p-4" onClick={onClose}>
            <motion.div
              className="relative w-full max-w-sm rounded-2xl border backdrop-blur-2xl shadow-2xl overflow-hidden border-stone-200 bg-white/95 shadow-stone-200/20 dark:border-white/10 dark:bg-[oklch(0.145_0_0)]/90 dark:shadow-black/20"
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Subtle accent glow */}
              <div className="absolute -top-20 left-1/2 -translate-x-1/2 w-[300px] h-[200px] rounded-full bg-accent/5 dark:bg-accent/10 blur-3xl pointer-events-none" aria-hidden="true" />

              <div className="relative p-6">
                {/* Tabs */}
                <div className="mb-6 flex rounded-xl p-1 bg-stone-100 dark:bg-white/5">
                  <button
                    type="button"
                    onClick={() => switchView('login')}
                    className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${
                      view === 'login'
                        ? 'bg-white text-stone-900 shadow-sm dark:bg-white/10 dark:text-white'
                        : 'text-stone-500 hover:text-stone-700 dark:text-white/50 dark:hover:text-white/70'
                    }`}
                  >
                    Sign in
                  </button>
                  <button
                    type="button"
                    onClick={() => switchView('signup')}
                    className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${
                      view === 'signup'
                        ? 'bg-white text-stone-900 shadow-sm dark:bg-white/10 dark:text-white'
                        : 'text-stone-500 hover:text-stone-700 dark:text-white/50 dark:hover:text-white/70'
                    }`}
                  >
                    Create account
                  </button>
                </div>

                {/* Error banner */}
                {errorMessage && (
                  <div className="mb-4 rounded-lg px-4 py-2.5 text-sm bg-red-50 border border-red-200 text-red-600 dark:bg-red-500/10 dark:border-red-500/20 dark:text-red-400">
                    {errorMessage}
                  </div>
                )}
                {/* Info banner */}
                {infoMessage && (
                  <div className="mb-4 rounded-lg border px-4 py-2.5 text-sm bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-500/10 dark:border-emerald-500/30 dark:text-emerald-300">
                    {infoMessage}
                  </div>
                )}

                {/* ── Sign in tab ── */}
                {view === 'login' && !showForgotPassword && (
                  <div className="space-y-4">
                    <GoogleSignInButton
                      callbackUrl={
                        pathname?.startsWith('/projects/')
                          ? `${pathname}?signed_in=1`
                          : '/onboarding?signed_in=1'
                      }
                      className="rounded-lg border-stone-200 bg-white text-stone-900 hover:bg-stone-50 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
                    />
                    <div className="relative">
                      <div className="absolute inset-0 flex items-center">
                        <span className="w-full border-t border-stone-200 dark:border-white/10" />
                      </div>
                      <div className="relative flex justify-center text-xs">
                        <span className="bg-white px-2 text-stone-500 dark:bg-[oklch(0.145_0_0)] dark:text-white/50">
                          or continue with email
                        </span>
                      </div>
                    </div>
                    <form onSubmit={handlePasswordLogin} className="space-y-4">
                      <input
                        type="email"
                        placeholder="Email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className={inputClass}
                        required
                        autoFocus
                      />
                      <input
                        type="password"
                        placeholder="Password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className={inputClass}
                        required
                      />
                      <button type="submit" disabled={loading} className={primaryBtnClass}>
                        {loading ? 'Signing in...' : 'Sign in'}
                      </button>
                    </form>

                    {/* Dev quick sign-in */}
                    {isDev && (
                      <button
                        type="button"
                        disabled={loading}
                        onClick={handleDevLogin}
                        className="w-full rounded-lg border py-2.5 text-sm font-medium transition-colors disabled:opacity-50 border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300 dark:hover:bg-amber-500/20"
                      >
                        {loading ? 'Signing in...' : 'Dev quick sign-in'}
                      </button>
                    )}

                    {/* Forgot password */}
                    <p className="text-center text-xs text-stone-400 dark:text-white/40">
                      Forgot your password?{' '}
                      <button
                        type="button"
                        onClick={() => {
                          setShowForgotPassword(true);
                          setErrorMessage('');
                          setInfoMessage('');
                        }}
                        className="text-accent hover:text-accent-hover"
                      >
                        Reset it
                      </button>
                    </p>
                  </div>
                )}

                {/* ── Forgot password sub-view ── */}
                {view === 'login' && showForgotPassword && (
                  <div className="space-y-4">
                    {resetEmailSent ? (
                      <div className="text-center py-2">
                        <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/50">
                          <svg className="h-5 w-5 text-emerald-600 dark:text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                          </svg>
                        </div>
                        <p className="text-sm text-stone-900 dark:text-white mb-1">Check your inbox</p>
                        <p className="text-xs text-stone-500 dark:text-white/50">
                          We sent a password reset link to{' '}
                          <span className="text-stone-700 dark:text-white/70">{email}</span>
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            setResetEmailSent(false);
                            setShowForgotPassword(false);
                          }}
                          className="mt-4 text-xs text-accent hover:text-accent-hover"
                        >
                          Back to password sign-in
                        </button>
                      </div>
                    ) : (
                      <form onSubmit={handleForgotPassword} className="space-y-4">
                        <p className="text-sm text-stone-500 dark:text-white/60">
                          Enter your email and we&apos;ll send you a link to reset your password.
                        </p>
                        <input
                          type="email"
                          placeholder="Email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          className={inputClass}
                          required
                          autoFocus
                        />
                        <button type="submit" disabled={loading} className={primaryBtnClass}>
                          {loading ? 'Sending...' : 'Send reset link'}
                        </button>
                        <p className="text-center text-xs text-stone-400 dark:text-white/40">
                          <button
                            type="button"
                            onClick={() => {
                              setShowForgotPassword(false);
                              setErrorMessage('');
                            }}
                            className="text-accent hover:text-accent-hover"
                          >
                            Back to password sign-in
                          </button>
                        </p>
                      </form>
                    )}
                  </div>
                )}

                {/* ── Sign up tab ── */}
                {view === 'signup' && (
                  <form onSubmit={handleSignup} className="space-y-4">
                    <input
                      type="text"
                      placeholder="Full name"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className={inputClass}
                      required
                    />
                    <input
                      type="email"
                      placeholder="Email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className={inputClass}
                      required
                    />
                    <input
                      type="password"
                      placeholder="Password (min 8 characters)"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className={inputClass}
                      required
                      minLength={8}
                    />
                    <button
                      type="submit"
                      disabled={loading || !email.trim() || password.length < 8}
                      className={primaryBtnClass}
                    >
                      {loading ? 'Creating account...' : 'Create account'}
                    </button>
                  </form>
                )}
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
