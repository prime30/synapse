'use client';

import { useParams } from 'next/navigation';
import { useThemeGapProfile } from '@/hooks/useThemeGapProfile';

/**
 * Fetches theme gap profile for the current project.
 * Results feed into NextStepChips (wired by W1).
 * Renders nothing — just triggers the fetch.
 */
export function ProjectGapProfileFetcher() {
  const params = useParams();
  const projectId = params?.projectId as string | undefined;
  useThemeGapProfile({ projectId: projectId ?? '', enabled: !!projectId });
  return null;
}
