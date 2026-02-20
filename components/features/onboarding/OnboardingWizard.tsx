'use client';

/**
 * OnboardingWizard -- multi-step container with progress indicator,
 * navigation, skip button, and AnimatePresence step transitions.
 *
 * Includes a smart entry gate: on mount it checks store + project state
 * and either auto-redirects returning users to the IDE or starts the
 * wizard at the appropriate step.
 */

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { useTheme } from '@/hooks/useTheme';
import { ThemeToggle, SynapseLogo } from '@/components/marketing/nav';
import { useActiveStore } from '@/hooks/useActiveStore';
import { useProjects, type Project } from '@/hooks/useProjects';
import { WelcomeStep } from './WelcomeStep';
import { ConnectStoreStep } from './ConnectStoreStep';
import { ImportThemeStep } from './ImportThemeStep';
import { MeetAgentsStep } from './MeetAgentsStep';

// ── Step definitions ──────────────────────────────────────────────────

const STEPS = [
  { id: 'welcome', label: 'Welcome' },
  { id: 'connect', label: 'Connect Store' },
  { id: 'import', label: 'Import Theme' },
  { id: 'agents', label: 'Meet Your Agents' },
] as const;

type StepId = (typeof STEPS)[number]['id'];

const LAST_PROJECT_KEY = 'synapse-last-project';

// ── Transition variants ───────────────────────────────────────────────

const stepVariants = {
  enter: (direction: number) => ({
    x: direction > 0 ? 80 : -80,
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
  },
  exit: (direction: number) => ({
    x: direction > 0 ? -80 : 80,
    opacity: 0,
  }),
};

const stepTransition = { duration: 0.35, ease: [0.22, 1, 0.36, 1] as const };

// ── Gate Skeleton (shown while checking user state) ──────────────────

function GateSkeleton() {
  return (
    <div className="min-h-screen bg-[#fafaf9] dark:bg-[#0a0a0a] flex flex-col" role="presentation" aria-hidden="true">
      {/* Top bar skeleton */}
      <div className="shrink-0 px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between border-b border-stone-200/60 dark:border-white/5">
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
          <div className="h-5 w-96 max-w-full bg-stone-100 dark:bg-white/5 rounded animate-pulse mx-auto" />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-8">
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

// ── Progress Indicator ────────────────────────────────────────────────

function ProgressIndicator({
  steps,
  currentIndex,
  highestUnlocked,
  onStepClick,
}: {
  steps: typeof STEPS;
  currentIndex: number;
  highestUnlocked: number;
  onStepClick: (index: number) => void;
}) {
  return (
    <nav aria-label="Onboarding progress" className="flex items-center justify-center gap-1">
      {steps.map((step, i) => {
        const isActive = i === currentIndex;
        const isCompleted = i < currentIndex;
        const isClickable = i <= highestUnlocked && i !== currentIndex;

        return (
          <div key={step.id} className="flex items-center">
            {/* Step pill — clickable for previously visited steps */}
            <button
              type="button"
              onClick={isClickable ? () => onStepClick(i) : undefined}
              disabled={!isClickable}
              aria-label={`Step ${i + 1}: ${step.label}${isCompleted ? ' (completed)' : isActive ? ' (current)' : ''}`}
              aria-current={isActive ? 'step' : undefined}
              className={`flex items-center gap-1.5 ${isClickable ? 'cursor-pointer group' : 'cursor-default'}`}
            >
              <div
                className={`
                  w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium transition-all duration-300
                  ${isActive
                    ? 'bg-emerald-500 text-white shadow-[0_0_12px_rgba(16,185,129,0.4)]'
                    : isCompleted
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      : 'bg-stone-100 dark:bg-white/5 ide-text-muted border ide-border'
                  }
                  ${isClickable ? 'group-hover:ring-2 group-hover:ring-emerald-500/30' : ''}
                `}
              >
                {isCompleted ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ) : (
                  i + 1
                )}
              </div>
              <span
                className={`text-xs font-medium transition-colors duration-300 hidden sm:block ${
                  isActive ? 'ide-text' : isCompleted ? 'text-emerald-400/70' : 'ide-text-quiet'
                } ${isClickable ? 'group-hover:text-emerald-300' : ''}`}
              >
                {step.label}
              </span>
            </button>

            {/* Connector line */}
            {i < steps.length - 1 && (
              <div
                className={`w-8 h-px mx-2 transition-colors duration-300 ${
                  isCompleted ? 'bg-emerald-500/40' : 'bg-stone-200 dark:bg-white/10'
                }`}
              />
            )}
          </div>
        );
      })}
    </nav>
  );
}

// ── Main Wizard ───────────────────────────────────────────────────────

interface OnboardingWizardProps {
  /** Override initial step (bypasses the smart gate) */
  initialStep?: StepId;
  /** True when returning from a successful Shopify OAuth flow */
  shopifyConnected?: boolean;
  /** Called when wizard completes */
  onComplete?: (projectId?: string) => void;
}

export function OnboardingWizard({ initialStep, shopifyConnected, onComplete }: OnboardingWizardProps) {
  const router = useRouter();
  const { isDark, toggle: toggleTheme } = useTheme();

  // ── Smart gate: detect user state and decide starting step ────────
  const { connection, isLoading: storeLoading } = useActiveStore();
  const { activeProjects, archivedProjects, isLoading: projectsLoading } = useProjects(connection?.id ?? null);

  const gateResolved = useRef(false);
  const [gateStep, setGateStep] = useState<StepId | null>(initialStep ?? null);
  const initialHighestFromProps = initialStep
    ? (shopifyConnected && initialStep === 'import'
        ? STEPS.findIndex((s) => s.id === 'import')
        : STEPS.findIndex((s) => s.id === initialStep))
    : null;
  const [gateHighest, setGateHighest] = useState<number | null>(initialHighestFromProps);
  const [gateProjects, setGateProjects] = useState<{ active: Project[]; archived: Project[] }>({ active: [], archived: [] });

  useEffect(() => {
    if (gateResolved.current) return;
    if (initialStep) {
      // Explicit step override — skip gate logic.
      // gateHighest was already set in useState initializer.
      gateResolved.current = true;
      return;
    }
    if (storeLoading || projectsLoading) return;

    gateResolved.current = true;

    // If both queries finished but errored, still show the wizard
    // at the welcome step so the user can proceed manually.

    if (connection && activeProjects.length > 0) {
      // Returning user with projects — redirect to IDE
      let targetId = activeProjects[0].id;
      try {
        const lastId = localStorage.getItem(LAST_PROJECT_KEY);
        if (lastId && activeProjects.some((p) => p.id === lastId)) {
          targetId = lastId;
        }
      } catch { /* localStorage unavailable */ }
      router.replace(`/projects/${targetId}`);
      return;
    }

    if (connection) {
      // Store connected but no active projects — start at import step
      setGateStep('import');
      setGateHighest(2); // unlock up to import step
      setGateProjects({ active: activeProjects, archived: archivedProjects });
      return;
    }

    // No store — start at welcome
    setGateStep('welcome');
    setGateHighest(0);
  }, [storeLoading, projectsLoading, connection, activeProjects, archivedProjects, initialStep, router]);

  // Show skeleton while gate is resolving
  if (!gateStep) {
    return <GateSkeleton />;
  }

  // ── Wizard state ──────────────────────────────────────────────────
  return (
    <WizardInner
      initialStep={gateStep}
      initialHighest={gateHighest ?? 0}
      activeProjects={gateProjects.active}
      archivedProjects={gateProjects.archived}
      onComplete={onComplete}
    />
  );
}

// ── Inner wizard (rendered after gate resolves) ─────────────────────

interface WizardInnerProps {
  initialStep: StepId;
  initialHighest: number;
  activeProjects: Project[];
  archivedProjects: Project[];
  onComplete?: (projectId?: string) => void;
}

function WizardInner({
  initialStep,
  initialHighest,
  activeProjects,
  archivedProjects,
  onComplete,
}: WizardInnerProps) {
  const router = useRouter();
  const { isDark, toggle: toggleTheme } = useTheme();
  const initialIndex = STEPS.findIndex((s) => s.id === initialStep);
  const [currentIndex, setCurrentIndex] = useState(initialIndex >= 0 ? initialIndex : 0);
  const [highestUnlocked, setHighestUnlocked] = useState(Math.max(initialIndex >= 0 ? initialIndex : 0, initialHighest));
  const [direction, setDirection] = useState(1);
  const [createdProjectId, setCreatedProjectId] = useState<string | null>(null);

  const goNext = useCallback(() => {
    if (currentIndex < STEPS.length - 1) {
      setDirection(1);
      setCurrentIndex((prev) => {
        const next = prev + 1;
        setHighestUnlocked((h) => Math.max(h, next));
        return next;
      });
    }
  }, [currentIndex]);

  const goBack = useCallback(() => {
    if (currentIndex > 0) {
      setDirection(-1);
      setCurrentIndex((prev) => prev - 1);
    }
  }, [currentIndex]);

  const goToStep = useCallback((index: number) => {
    if (index < 0 || index >= STEPS.length) return;
    if (index > highestUnlocked) return;
    setDirection(index > currentIndex ? 1 : -1);
    setCurrentIndex(index);
  }, [currentIndex, highestUnlocked]);

  const handleSkip = useCallback(() => {
    if (createdProjectId) {
      router.push(`/projects/${createdProjectId}`);
    } else {
      router.push('/');
    }
  }, [router, createdProjectId]);

  const handleComplete = useCallback(() => {
    if (onComplete) {
      onComplete(createdProjectId ?? undefined);
    } else if (createdProjectId) {
      router.push(`/projects/${createdProjectId}`);
    } else {
      router.push('/');
    }
  }, [onComplete, createdProjectId, router]);

  const handleStoreConnected = useCallback(() => {
    goNext();
  }, [goNext]);

  const handleThemeImported = useCallback((projectId: string) => {
    setCreatedProjectId(projectId);
    goNext();
  }, [goNext]);

  const currentStep = useMemo(() => STEPS[currentIndex], [currentIndex]);

  return (
    <div className="min-h-screen bg-[#fafaf9] dark:bg-[#0a0a0a] flex flex-col">
      {/* Top bar with progress + skip */}
      <header className="shrink-0 px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between border-b border-stone-200/60 dark:border-white/5">
        {/* Logo + theme toggle */}
        <div className="flex items-center gap-3">
          <SynapseLogo className="text-sm text-stone-900 dark:text-white" />
          <ThemeToggle isDark={isDark} onToggle={toggleTheme} variant={isDark ? 'dark' : 'light'} />
        </div>

        {/* Progress */}
        <ProgressIndicator steps={STEPS} currentIndex={currentIndex} highestUnlocked={highestUnlocked} onStepClick={goToStep} />

        {/* Skip */}
        <button
          type="button"
          onClick={handleSkip}
          aria-label={currentIndex === 0 ? 'Skip onboarding and set up later' : 'Skip this step'}
          className="text-xs ide-text-muted hover:text-stone-600 dark:hover:text-white/70 transition-colors"
        >
          {currentIndex === 0 ? "I'll set up later" : 'Skip'}
        </button>
      </header>

      {/* Step content */}
      <main className="flex-1 flex items-center justify-center px-4 sm:px-6 py-6 sm:py-8 overflow-hidden" aria-live="polite">
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={currentStep.id}
            custom={direction}
            variants={stepVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={stepTransition}
            className="w-full max-w-2xl"
          >
            {currentStep.id === 'welcome' && (
              <WelcomeStep onNext={goNext} />
            )}
            {currentStep.id === 'connect' && (
              <ConnectStoreStep
                onConnected={handleStoreConnected}
                onBack={goBack}
              />
            )}
            {currentStep.id === 'import' && (
              <ImportThemeStep
                onImported={handleThemeImported}
                onSkip={goNext}
                onBack={goBack}
                activeProjects={activeProjects}
                archivedProjects={archivedProjects}
              />
            )}
            {currentStep.id === 'agents' && (
              <MeetAgentsStep
                projectId={createdProjectId}
                onComplete={handleComplete}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Bottom navigation (Back button for steps 2+) */}
      {currentIndex > 0 && currentIndex < STEPS.length - 1 && (
        <footer className="shrink-0 px-6 py-3 border-t border-stone-200/60 dark:border-white/5 flex justify-start">
          <button
            type="button"
            onClick={goBack}
            aria-label="Go to previous step"
            className="flex items-center gap-1.5 text-xs ide-text-muted hover:text-stone-600 dark:hover:text-white/70 transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            Back
          </button>
        </footer>
      )}
    </div>
  );
}
