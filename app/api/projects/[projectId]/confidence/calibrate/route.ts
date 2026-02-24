import { NextRequest } from 'next/server';
import { requireProjectAccess } from '@/lib/middleware/auth';
import { successResponse } from '@/lib/api/response';
import { handleAPIError } from '@/lib/errors/handler';
import { createClient } from '@/lib/supabase/server';
import {
  calibrateConfidence,
  saveCalibration,
} from '@/lib/ai/confidence-calibrator';

interface RouteParams {
  params: Promise<{ projectId: string }>;
}

/**
 * POST /api/projects/[projectId]/confidence/calibrate
 *
 * Triggers feedback-driven confidence calibration for the project.
 * Analyzes feedback_rating vs confidence correlation and saves adjusted thresholds.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId } = await params;
    await requireProjectAccess(request, projectId);

    const supabase = await createClient();
    const result = await calibrateConfidence(supabase, projectId);
    await saveCalibration(supabase, projectId, result);

    return successResponse(result);
  } catch (error) {
    return handleAPIError(error);
  }
}
