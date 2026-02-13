'use client';

/**
 * /onboarding -- Unified entry point for authenticated users.
 *
 * The OnboardingWizard includes a smart gate that checks the user's
 * store/project state and either auto-redirects returning users to the
 * IDE or starts the wizard at the appropriate step.
 */

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { OnboardingWizard } from '@/components/features/onboarding/OnboardingWizard';
import { LoginTransition } from '@/components/features/auth/LoginTransition';

function OnboardingContent() {
  const searchParams = useSearchParams();

  // Support deep-linking to a specific step (e.g. from OAuth callback)
  const validSteps = ['welcome', 'connect', 'import', 'agents'] as const;
  type StepId = (typeof validSteps)[number];
  const stepParam = searchParams.get('step');
  const initialStep: StepId | undefined = validSteps.includes(stepParam as StepId)
    ? (stepParam as StepId)
    : undefined;

  // Did we just return from a successful Shopify OAuth flow?
  const shopifyConnected = searchParams.get('shopify') === 'connected';

  return (
    <>
      <Suspense fallback={null}>
        <LoginTransition />
      </Suspense>
      <OnboardingWizard
        initialStep={initialStep}
        shopifyConnected={shopifyConnected}
      />
    </>
  );
}

// ── Loading skeleton ──────────────────────────────────────────────────

function OnboardingSkeleton() {
  return (
    <div className="min-h-screen bg-[#fafaf9] dark:bg-[#0a0a0a] flex flex-col">
      {/* Top bar skeleton */}
      <div className="shrink-0 px-6 py-4 flex items-center justify-between border-b border-stone-200/60 dark:border-white/5">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-stone-200 dark:bg-white/10 animate-pulse" />
          <div className="h-4 w-16 bg-stone-200 dark:bg-white/10 rounded animate-pulse" />
        </div>
        <div className="flex items-center gap-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-1.5">
              <div className="w-7 h-7 rounded-full bg-stone-100 dark:bg-white/5 animate-pulse" />
              {i < 3 && <div className="w-8 h-px bg-stone-200 dark:bg-white/5" />}
            </div>
          ))}
        </div>
        <div className="h-3 w-16 bg-stone-100 dark:bg-white/5 rounded animate-pulse" />
      </div>

      {/* Content skeleton */}
      <div className="flex-1 flex items-center justify-center px-6">
        <div className="max-w-2xl w-full space-y-6">
          <div className="h-10 w-64 bg-stone-200 dark:bg-white/10 rounded animate-pulse mx-auto" />
          <div className="h-5 w-96 bg-stone-100 dark:bg-white/5 rounded animate-pulse mx-auto" />
          <div className="grid grid-cols-3 gap-4 mt-8">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-36 rounded-2xl bg-stone-100/50 dark:bg-white/[0.03] border border-stone-200 dark:border-white/5 animate-pulse"
                style={{ animationDelay: `${i * 150}ms` }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function OnboardingPage() {
  return (
    <Suspense fallback={<OnboardingSkeleton />}>
      <OnboardingContent />
    </Suspense>
  );
}
