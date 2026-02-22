/**
 * Training dataset schema for LlamaFactory fine-tuning.
 *
 * Supports three dataset formats:
 *   1. SFT (Supervised Fine-Tuning) — prompt/response pairs
 *   2. DPO (Direct Preference Optimization) — chosen/rejected pairs
 *   3. ORPO (Odds Ratio Preference Optimization) — same format as DPO
 *
 * All examples carry mode labels, quality scores, and provenance metadata
 * for reproducible training and evaluation.
 */

import type { IntentMode } from './behavior-spec';

// ── Conversation Turn ────────────────────────────────────────────────────────

export interface ConversationTurn {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCalls?: Array<{ name: string; arguments: Record<string, unknown> }>;
  toolResult?: { name: string; content: string };
}

// ── Quality Labels ───────────────────────────────────────────────────────────

export interface QualityLabels {
  /** Overall quality 0-1 */
  overall: number;
  /** Shopify domain specificity 0-1 */
  shopifySpecificity: number;
  /** Response clarity 0-1 */
  clarity: number;
  /** Factual accuracy 0-1 */
  accuracy: number;
  /** Anti-pattern IDs triggered (empty = clean) */
  antiPatternsTriggered: string[];
  /** Whether the model hallucinated files or APIs */
  hallucinated: boolean;
  /** Whether the response used deprecated Shopify APIs */
  usedDeprecatedApis: boolean;
}

// ── SFT Example ──────────────────────────────────────────────────────────────

export interface SFTExample {
  id: string;
  format: 'sft';
  mode: IntentMode;
  promptFamily: string;
  conversations: ConversationTurn[];
  quality: QualityLabels;
  provenance: ExampleProvenance;
  split: 'train' | 'val' | 'test';
}

// ── Preference Example (DPO / ORPO) ─────────────────────────────────────────

export interface PreferenceExample {
  id: string;
  format: 'dpo' | 'orpo';
  mode: IntentMode;
  promptFamily: string;
  prompt: ConversationTurn[];
  chosen: ConversationTurn[];
  rejected: ConversationTurn[];
  chosenQuality: QualityLabels;
  rejectedQuality: QualityLabels;
  provenance: ExampleProvenance;
  split: 'train' | 'val' | 'test';
}

// ── Provenance ───────────────────────────────────────────────────────────────

export interface ExampleProvenance {
  source: 'transcript' | 'harness' | 'synthetic' | 'adversarial' | 'manual';
  sourceId?: string;
  generatedAt: string;
  datasetVersion: string;
  redactionApplied: boolean;
}

// ── Dataset Manifest ─────────────────────────────────────────────────────────

export interface DatasetManifest {
  version: string;
  generatedAt: string;
  baseModel: string;
  counts: {
    sft: { train: number; val: number; test: number };
    preference: { train: number; val: number; test: number };
  };
  modeDistribution: Record<IntentMode, number>;
  promptFamilyDistribution: Record<string, number>;
  adversarialCount: number;
  contentHash: string;
}

// ── LlamaFactory-Compatible Formats ─────────────────────────────────────────

/**
 * LlamaFactory alpaca format for SFT.
 * See: https://github.com/hiyouga/LlamaFactory/blob/main/data/README.md
 */
export interface LlamaFactoryAlpacaRow {
  instruction: string;
  input: string;
  output: string;
  system?: string;
  history?: Array<[string, string]>;
}

/**
 * LlamaFactory ShareGPT format for multi-turn SFT.
 */
export interface LlamaFactoryShareGPTRow {
  conversations: Array<{
    from: 'human' | 'gpt' | 'system';
    value: string;
  }>;
}

/**
 * LlamaFactory preference format for DPO/ORPO.
 */
export interface LlamaFactoryPreferenceRow {
  conversations: Array<{
    from: 'human' | 'gpt' | 'system';
    value: string;
  }>;
  chosen: {
    from: 'gpt';
    value: string;
  };
  rejected: {
    from: 'gpt';
    value: string;
  };
}

// ── Conversion Utilities ─────────────────────────────────────────────────────

export function sftToShareGPT(example: SFTExample): LlamaFactoryShareGPTRow {
  const conversations: LlamaFactoryShareGPTRow['conversations'] = [];

  for (const turn of example.conversations) {
    if (turn.role === 'system') {
      conversations.push({ from: 'system', value: turn.content });
    } else if (turn.role === 'user') {
      conversations.push({ from: 'human', value: turn.content });
    } else if (turn.role === 'assistant') {
      let content = turn.content;
      if (turn.toolCalls?.length) {
        content +=
          '\n\n[Tool Calls]\n' +
          turn.toolCalls
            .map((tc) => `${tc.name}(${JSON.stringify(tc.arguments)})`)
            .join('\n');
      }
      conversations.push({ from: 'gpt', value: content });
    }
  }

  return { conversations };
}

export function preferenceToLlamaFactory(
  example: PreferenceExample,
): LlamaFactoryPreferenceRow {
  const conversations: LlamaFactoryPreferenceRow['conversations'] = [];

  for (const turn of example.prompt) {
    if (turn.role === 'system') {
      conversations.push({ from: 'system', value: turn.content });
    } else if (turn.role === 'user') {
      conversations.push({ from: 'human', value: turn.content });
    }
  }

  const chosenText = example.chosen.map((t) => t.content).join('\n');
  const rejectedText = example.rejected.map((t) => t.content).join('\n');

  return {
    conversations,
    chosen: { from: 'gpt', value: chosenText },
    rejected: { from: 'gpt', value: rejectedText },
  };
}

export function sftToAlpaca(example: SFTExample): LlamaFactoryAlpacaRow {
  const systemTurn = example.conversations.find((t) => t.role === 'system');
  const userTurns = example.conversations.filter((t) => t.role === 'user');
  const assistantTurns = example.conversations.filter((t) => t.role === 'assistant');

  const history: Array<[string, string]> = [];
  for (let i = 0; i < userTurns.length - 1; i++) {
    history.push([userTurns[i].content, assistantTurns[i]?.content ?? '']);
  }

  const lastUser = userTurns[userTurns.length - 1];
  const lastAssistant = assistantTurns[assistantTurns.length - 1];

  return {
    instruction: lastUser?.content ?? '',
    input: '',
    output: lastAssistant?.content ?? '',
    system: systemTurn?.content,
    history: history.length > 0 ? history : undefined,
  };
}
