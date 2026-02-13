'use client';

import { OnboardingWizard } from '@/components/features/onboarding/OnboardingWizard';

export function DemoOnboardingView() {
  return <OnboardingWizard initialStep="welcome" />;
}
