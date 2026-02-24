/**
 * Gap analyzer — analyzes module load logs to find requests where no modules
 * matched but the agent struggled, and modules with low effectiveness.
 */

export interface ModuleLoadLog {
  userMessage: string;
  modulesLoaded: string[];
  toolCallsUsed: number;
  hadClarification: boolean;
  feedbackRating?: 'thumbs_up' | 'thumbs_down';
  timestamp: number;
}

export interface GapAnalysisResult {
  unmatchedRequests: Array<{
    userMessage: string;
    toolCallsUsed: number;
    hadClarification: boolean;
    suggestedModule: string;
    suggestedKeywords: string[];
  }>;
  lowEffectivenessModules: Array<{
    moduleId: string;
    loadCount: number;
    negativeFeeback: number;
    effectivenessScore: number;
  }>;
  suggestions: string[];
}

function extractKeywords(message: string): string[] {
  const stopWords = new Set([
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'to', 'of', 'and', 'in', 'that',
    'it', 'for', 'on', 'with', 'as', 'at', 'by', 'from', 'or', 'but', 'not', 'can', 'my', 'i', 'me',
    'we', 'you', 'do', 'does', 'did', 'have', 'has', 'had', 'this', 'these', 'those',
  ]);
  return message
    .toLowerCase()
    .split(/\W+/)
    .filter((w) => w.length > 2 && !stopWords.has(w))
    .slice(0, 10);
}

function suggestModuleName(keywords: string[]): string {
  return keywords.slice(0, 3).join('-') + '-patterns';
}

function getTopKeywords(
  requests: GapAnalysisResult['unmatchedRequests']
): string[] {
  const counts = new Map<string, number>();
  for (const req of requests) {
    for (const kw of req.suggestedKeywords) {
      counts.set(kw, (counts.get(kw) || 0) + 1);
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([kw]) => kw);
}

export function analyzeGaps(logs: ModuleLoadLog[]): GapAnalysisResult {
  const unmatchedRequests: GapAnalysisResult['unmatchedRequests'] = [];
  const moduleStats = new Map<string, { loads: number; negative: number }>();

  for (const log of logs) {
    if (
      log.modulesLoaded.length <= 1 &&
      log.modulesLoaded[0] === 'theme-architecture'
    ) {
      if (log.toolCallsUsed > 10 || log.hadClarification) {
        const keywords = extractKeywords(log.userMessage);
        unmatchedRequests.push({
          userMessage: log.userMessage,
          toolCallsUsed: log.toolCallsUsed,
          hadClarification: log.hadClarification,
          suggestedModule: suggestModuleName(keywords),
          suggestedKeywords: keywords,
        });
      }
    }

    for (const moduleId of log.modulesLoaded) {
      const stats = moduleStats.get(moduleId) || { loads: 0, negative: 0 };
      stats.loads += 1;
      if (log.feedbackRating === 'thumbs_down') stats.negative += 1;
      moduleStats.set(moduleId, stats);
    }
  }

  const lowEffectivenessModules: GapAnalysisResult['lowEffectivenessModules'] = [];
  for (const [moduleId, stats] of moduleStats) {
    const effectiveness = stats.loads > 5 ? 1 - stats.negative / stats.loads : 1;
    if (effectiveness < 0.7 && stats.loads >= 5) {
      lowEffectivenessModules.push({
        moduleId,
        loadCount: stats.loads,
        negativeFeeback: stats.negative,
        effectivenessScore: effectiveness,
      });
    }
  }

  const suggestions: string[] = [];
  if (unmatchedRequests.length > 3) {
    const topKeywords = getTopKeywords(unmatchedRequests);
    suggestions.push(
      `Consider creating a knowledge module for: ${topKeywords.join(', ')} (${unmatchedRequests.length} unmatched requests)`
    );
  }
  for (const mod of lowEffectivenessModules) {
    suggestions.push(
      `Module "${mod.moduleId}" has ${Math.round(mod.effectivenessScore * 100)}% effectiveness (${mod.negativeFeeback}/${mod.loadCount} negative) — review content`
    );
  }

  return { unmatchedRequests, lowEffectivenessModules, suggestions };
}
