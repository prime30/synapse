'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { GlassCard } from '@/components/marketing/glass';
import { Navbar } from '@/components/marketing/nav';

type SignupState = 'idle' | 'submitting' | 'success' | 'error';

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
    return raw;
  return raw;
}

export default function SignupPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [state, setState] = useState<SignupState>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!email.trim() || !password || password.length < 8) return;

      setState('submitting');
      setErrorMessage('');
      setSuccessMessage('');

      try {
        const res = await fetch('/api/auth/signup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: email.trim(),
            password,
            full_name: fullName.trim() || undefined,
          }),
        });

        const body = await res.json();

        if (!res.ok) {
          throw new Error(body.error ?? 'Failed to create account');
        }

        setState('success');
        if (body.data?.needsEmailConfirmation) {
          setSuccessMessage(
            'Account created! Check your email to confirm your account, then sign in.'
          );
        } else {
          setSuccessMessage('Account created. Redirecting you to Synapse...');
          router.push('/welcome');
          router.refresh();
        }
      } catch (err) {
        setState('error');
        setErrorMessage(
          friendlyAuthError(err instanceof Error ? err.message : 'Something went wrong')
        );
      }
    },
    [email, password, fullName, router]
  );

  return (
    <div className="relative min-h-screen film-grain">
      <Navbar />

      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#0a0a0a] via-[#0a0a0a] to-[#141414]" />

      <main className="relative pt-32 pb-24 flex items-center justify-center min-h-screen px-6">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] as const }}
          className="w-full max-w-md"
        >
          <GlassCard padding="lg" hoverScale={false}>
            {state === 'success' ? (
              /* ── Success state ── */
              <div className="text-center py-4">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-900/50">
                  <svg className="h-6 w-6 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h2 className="text-xl font-semibold text-white mb-2">Account created</h2>
                <p className="text-white/60 text-sm">{successMessage}</p>
              </div>
            ) : (
              <>
                {/* Header */}
                <div className="text-center mb-8">
                  <span className="inline-block rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-medium tracking-widest uppercase text-white/50 mb-3">
                    GET STARTED
                  </span>
                  <h1 className="text-3xl font-semibold text-white mb-2">
                    Create your account
                  </h1>
                  <p className="text-white/70 text-sm">
                    Free forever for solo projects. No credit card required.
                  </p>
                </div>

                {/* Error banner */}
                {errorMessage && (
                  <div className="mb-6 rounded-lg border border-red-800 bg-red-950 px-4 py-3 text-sm text-red-300" role="alert">
                    {errorMessage}
                  </div>
                )}

                {/* Email form */}
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="text-sm text-white/70 block mb-1.5">Full name</label>
                    <input
                      type="text"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white text-sm placeholder:text-white/40 focus:outline-none focus:border-accent/50 transition-colors"
                      placeholder="Jane Smith"
                      autoFocus
                    />
                  </div>
                  <div>
                    <label className="text-sm text-white/70 block mb-1.5">Email</label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white text-sm placeholder:text-white/40 focus:outline-none focus:border-accent/50 transition-colors"
                      placeholder="you@company.com"
                      required
                    />
                  </div>
                  <div>
                    <label className="text-sm text-white/70 block mb-1.5">Password</label>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white text-sm placeholder:text-white/40 focus:outline-none focus:border-accent/50 transition-colors"
                      placeholder="Min. 8 characters"
                      required
                      minLength={8}
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={state === 'submitting' || !email.trim() || password.length < 8}
                    className="w-full py-3 bg-accent hover:bg-accent-hover text-white font-semibold rounded-lg transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {state === 'submitting' ? 'Creating account...' : 'Create Account'}
                  </button>
                </form>

                <p className="text-white/50 text-xs text-center mt-6">
                  Already have an account?{' '}
                  <Link href="/auth/signin" className="text-accent hover:underline">
                    Sign in
                  </Link>
                </p>
              </>
            )}
          </GlassCard>
        </motion.div>
      </main>
    </div>
  );
}
