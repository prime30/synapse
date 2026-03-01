import { NextRequest } from 'next/server';
import { requireProjectAccess } from '@/lib/middleware/auth';
import { successResponse } from '@/lib/api/response';
import { handleAPIError } from '@/lib/errors/handler';
import { getProjectDesignRules } from '@/lib/design-tokens/agent-integration/context-provider';

interface RouteParams {
  params: Promise<{ projectId: string }>;
}

/**
 * GET /api/projects/[projectId]/design-tokens/rules
 *
 * Returns per-category design rules generated from the project's
 * extracted tokens and components.
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId } = await params;
    await requireProjectAccess(request, projectId);

    const { rules, tokens, components } = await getProjectDesignRules(projectId);

    const categoryMap = new Map<string, string[]>();
    if (rules) {
      let currentCategory = '';
      for (const line of rules.split('\n')) {
        if (line.startsWith('**') && line.endsWith('**')) {
          currentCategory = line.replace(/\*\*/g, '');
          categoryMap.set(currentCategory, []);
        } else if (line.startsWith('- ') && currentCategory) {
          categoryMap.get(currentCategory)?.push(line.slice(2));
        }
      }
    }

    const categories = Array.from(categoryMap.entries()).map(
      ([name, items]) => ({ name, rules: items }),
    );

    return successResponse({
      rules: rules || '',
      categories,
      tokenCount: tokens.length,
      componentCount: components.length,
    });
  } catch (error) {
    return handleAPIError(error);
  }
}
