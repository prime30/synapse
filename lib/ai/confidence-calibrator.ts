/**
 * Feedback-driven confidence calibration for the Synapse IDE.
 * Analyzes feedback_rating vs confidence correlation per project and computes adjusted thresholds.
 */

export interface CalibrationResult {
  thresholds: { high: number; medium: number };
  sampleSize: number;
  lastCalibrated: string; // ISO date
  adjustmentReason: string;
}

const MIN_SAMPLES = 20;
const DEFAULT_HIGH = 0.8;
const DEFAULT_MEDIUM = 0.6;
const MIN_POSITIVE_RATE = 0.7;
const HIGH_CLAMP = { min: 0.6, max: 0.95 };
const MEDIUM_CLAMP = { min: 0.4, max: 0.8 };
const MEDIUM_OFFSET = 0.2;

/** Extract confidence from message content by parsing JSON blocks. */
function extractConfidenceFromContent(content: string | null): number | null {
  if (!content || typeof content !== 'string') return null;
  const confidences: number[] = [];
  // Match JSON objects that may contain "confidence": number
  const jsonPattern = /\{[^{}]*(?:"confidence"\s*:\s*(\d+(?:\.\d+)?))[^{}]*\}/g;
  let m: RegExpExecArray | null;
  while ((m = jsonPattern.exec(content)) !== null) {
    const val = parseFloat(m[1]);
    if (!Number.isNaN(val) && val >= 0 && val <= 1) confidences.push(val);
  }
  // Also try loose pattern for nested objects
  const loosePattern = /"confidence"\s*:\s*(\d+(?:\.\d+)?)/g;
  while ((m = loosePattern.exec(content)) !== null) {
    const val = parseFloat(m[1]);
    if (!Number.isNaN(val) && val >= 0 && val <= 1) confidences.push(val);
  }
  if (confidences.length === 0) return null;
  return Math.max(...confidences);
}

/** Get confidence for a message: prefer stored column, fallback to content parse. */
function getMessageConfidence(
  row: { confidence?: number | null; content?: string | null }
): number | null {
  if (typeof row.confidence === 'number' && !Number.isNaN(row.confidence)) {
    return Math.max(0, Math.min(1, row.confidence));
  }
  return extractConfidenceFromContent(row.content ?? null);
}

/**
 * Calibrate confidence thresholds from feedback data.
 * Uses bracket-based approach: group by confidence bracket, compute positive rate per bracket,
 * set high threshold = lowest bracket boundary where positive rate >= 0.7.
 */
export async function calibrateConfidence(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  projectId: string
): Promise<CalibrationResult> {
  // Get session IDs for this project
  const { data: sessions, error: sessError } = await supabase
    .from('ai_sessions')
    .select('id')
    .eq('project_id', projectId);

  if (sessError) throw sessError;
  const sessionIds = (sessions ?? []).map((s: { id: string }) => s.id);
  if (sessionIds.length === 0) {
    return {
      thresholds: { high: DEFAULT_HIGH, medium: DEFAULT_MEDIUM },
      sampleSize: 0,
      lastCalibrated: new Date().toISOString(),
      adjustmentReason: 'No sessions for project',
    };
  }

  // Fetch messages with feedback for these sessions
  const { data: projectMessages, error: msgError } = await supabase
    .from('ai_messages')
    .select('id, feedback_rating, confidence, content')
    .in('session_id', sessionIds)
    .not('feedback_rating', 'is', null)
    .in('feedback_rating', ['thumbs_up', 'thumbs_down']);

  if (msgError) throw msgError;

  const events: Array<{ confidence: number; positive: boolean }> = [];
  for (const m of projectMessages) {
    const conf = getMessageConfidence(m);
    if (conf === null) continue;
    events.push({
      confidence: conf,
      positive: m.feedback_rating === 'thumbs_up',
    });
  }

  if (events.length < MIN_SAMPLES) {
    return {
      thresholds: { high: DEFAULT_HIGH, medium: DEFAULT_MEDIUM },
      sampleSize: events.length,
      lastCalibrated: new Date().toISOString(),
      adjustmentReason: `Insufficient samples (${events.length} < ${MIN_SAMPLES})`,
    };
  }

  // Group by confidence bracket (0.0-0.2, 0.2-0.4, ..., 0.8-1.0)
  const bracketBounds = [0, 0.2, 0.4, 0.6, 0.8, 1.0];
  const bracketStats: Array<{ boundary: number; positiveRate: number; total: number }> = [];
  for (let i = 0; i < bracketBounds.length - 1; i++) {
    const low = bracketBounds[i];
    const high = bracketBounds[i + 1];
    const inBracket = events.filter(
      (e) => e.confidence >= low && (high >= 1 ? e.confidence <= 1 : e.confidence < high)
    );
    if (inBracket.length > 0) {
      const positives = inBracket.filter((e) => e.positive).length;
      bracketStats.push({
        boundary: high,
        positiveRate: positives / inBracket.length,
        total: inBracket.length,
      });
    }
  }

  // High threshold = lowest bracket boundary where positive rate >= 0.7
  // Sort by boundary ascending, find first with positiveRate >= 0.7
  bracketStats.sort((a, b) => a.boundary - b.boundary);
  let highThreshold = DEFAULT_HIGH;
  for (const b of bracketStats) {
    if (b.positiveRate >= MIN_POSITIVE_RATE) {
      highThreshold = b.boundary;
      break;
    }
  }

  highThreshold = Math.max(HIGH_CLAMP.min, Math.min(HIGH_CLAMP.max, highThreshold));
  let mediumThreshold = highThreshold - MEDIUM_OFFSET;
  mediumThreshold = Math.max(MEDIUM_CLAMP.min, Math.min(MEDIUM_CLAMP.max, mediumThreshold));

  return {
    thresholds: { high: highThreshold, medium: mediumThreshold },
    sampleSize: events.length,
    lastCalibrated: new Date().toISOString(),
    adjustmentReason: `Calibrated from ${events.length} feedback events`,
  };
}

/**
 * Read stored calibration from project_settings.
 */
export async function getProjectCalibration(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  projectId: string
): Promise<CalibrationResult | null> {
  const { data, error } = await supabase
    .from('project_settings')
    .select('settings')
    .eq('project_id', projectId)
    .eq('category', 'confidence_calibration')
    .maybeSingle();

  if (error) throw error;
  if (!data?.settings) return null;

  const s = data.settings as Record<string, unknown>;
  const thresholds = s.thresholds as { high?: number; medium?: number } | undefined;
  if (!thresholds || typeof thresholds.high !== 'number' || typeof thresholds.medium !== 'number') {
    return null;
  }

  return {
    thresholds: { high: thresholds.high, medium: thresholds.medium },
    sampleSize: (s.sampleSize as number) ?? 0,
    lastCalibrated: (s.lastCalibrated as string) ?? new Date().toISOString(),
    adjustmentReason: (s.adjustmentReason as string) ?? 'Stored',
  };
}

/**
 * Save calibration result to project_settings.
 */
export async function saveCalibration(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  projectId: string,
  result: CalibrationResult
): Promise<void> {
  const { error } = await supabase.from('project_settings').upsert(
    {
      project_id: projectId,
      category: 'confidence_calibration',
      settings: {
        thresholds: result.thresholds,
        sampleSize: result.sampleSize,
        lastCalibrated: result.lastCalibrated,
        adjustmentReason: result.adjustmentReason,
      },
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'project_id,category' }
  );

  if (error) throw error;
}
