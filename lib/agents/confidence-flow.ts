/**
 * Confidence flow utilities for agent code application.
 * Used by ConfidenceBadge and card components to display advisory confidence.
 */

/**
 * Clamp a value to [0,1] if it's a number; otherwise return undefined.
 */
export function clampConfidence(value: unknown): number | undefined {
  if (typeof value !== 'number' || Number.isNaN(value)) return undefined;
  return Math.max(0, Math.min(1, value));
}

const DEFAULT_THRESHOLDS = { high: 0.8, medium: 0.6 };
const CALIBRATION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Get calibrated thresholds from project_settings.
 * Returns defaults if not found or calibration is older than 7 days.
 */
export async function getCalibratedThresholds(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  projectId: string
): Promise<{ high: number; medium: number }> {
  const { getProjectCalibration } = await import('@/lib/ai/confidence-calibrator');
  const result = await getProjectCalibration(supabase, projectId);
  if (!result) return DEFAULT_THRESHOLDS;

  const age = Date.now() - new Date(result.lastCalibrated).getTime();
  if (age > CALIBRATION_MAX_AGE_MS) return DEFAULT_THRESHOLDS;

  return result.thresholds;
}

/**
 * Get the confidence level tier for display logic.
 * Accepts optional dynamic thresholds (e.g. from calibration).
 */
export function getConfidenceLevel(
  confidence: number,
  thresholds?: { high: number; medium: number }
): 'high' | 'medium' | 'low' {
  const { high = 0.8, medium = 0.6 } = thresholds ?? {};
  if (confidence >= high) return 'high';
  if (confidence >= medium) return 'medium';
  return 'low';
}

/**
 * Get the advisory label for low-confidence items.
 * High and medium return empty string; low returns 'Review recommended'.
 */
export function getConfidenceLabel(confidence: number): string {
  const level = getConfidenceLevel(confidence);
  if (level === 'low') return 'Review recommended';
  return '';
}
