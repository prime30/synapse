import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/middleware/auth';
import { successResponse, errorResponse } from '@/lib/api/response';
import { handleAPIError } from '@/lib/errors/handler';
import { createClient } from '@/lib/supabase/server';
import { PatternLearning } from '@/lib/agents/pattern-learning';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/** Get execution details */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    await requireAuth(request);
    const { id } = await params;
    const supabase = await createClient();

    const { data, error } = await supabase
      .from('agent_executions')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) {
      return errorResponse('Execution not found', 'NOT_FOUND', 404);
    }

    return successResponse(data);
  } catch (error) {
    return handleAPIError(error);
  }
}

/** Approve or reject execution changes */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const userId = await requireAuth(request);
    const { id } = await params;
    const body = await request.json();
    const action = body.action as 'approve' | 'reject';

    if (action === 'approve') {
      // Learn patterns from approved changes
      const supabase = await createClient();
      const { data: execution } = await supabase
        .from('agent_executions')
        .select('proposed_changes')
        .eq('id', id)
        .single();

      if (execution?.proposed_changes) {
        const patternLearning = new PatternLearning();
        for (const change of execution.proposed_changes as Array<{
          fileId: string;
          fileName: string;
          originalContent: string;
          proposedContent: string;
          reasoning: string;
          agentType: string;
        }>) {
          const pattern = patternLearning.extractPattern({
            ...change,
            agentType: change.agentType as 'liquid' | 'javascript' | 'css' | 'review' | 'project_manager',
          });
          if (pattern) {
            await patternLearning.storePattern(userId, pattern);
          }
        }
      }

      return successResponse({ message: 'Changes approved', executionId: id });
    }

    return successResponse({ message: 'Changes rejected', executionId: id });
  } catch (error) {
    return handleAPIError(error);
  }
}
