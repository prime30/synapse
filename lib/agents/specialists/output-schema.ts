/**
 * Shared JSON Schema for specialist agent structured outputs.
 * All specialist agents (liquid, javascript, css) use the same output format.
 */
export const SPECIALIST_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    changes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          fileId: { type: 'string' },
          fileName: { type: 'string' },
          originalContent: { type: 'string' },
          proposedContent: { type: 'string' },
          reasoning: { type: 'string' },
        },
        required: ['fileName', 'proposedContent', 'reasoning'],
        additionalProperties: false,
      },
    },
  },
  required: ['changes'],
  additionalProperties: false,
} as const;
