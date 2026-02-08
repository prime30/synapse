import type { AICompletionResult } from '@/lib/ai/types';

export function buildCompletionItems(result: AICompletionResult) {
  return [
    {
      label: 'AI Suggestion',
      insertText: result.content,
    },
  ];
}
