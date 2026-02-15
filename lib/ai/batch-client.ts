/**
 * Anthropic Message Batches API client.
 * Wraps the /v1/messages/batches endpoint for bulk operations at 50% cost.
 *
 * Only active when ENABLE_BATCH_PROCESSING=true.
 */

import { AI_FEATURES } from './feature-flags';
import type { AIMessage, AICompletionOptions } from './types';

// ── Types ─────────────────────────────────────────────────────────────

export interface BatchRequest {
  custom_id: string;
  params: {
    model: string;
    max_tokens: number;
    messages: Array<{ role: string; content: string }>;
    system?: string;
    temperature?: number;
  };
}

export interface BatchJob {
  id: string;
  type: 'message_batch';
  processing_status: 'in_progress' | 'ended' | 'canceling';
  request_counts: {
    processing: number;
    succeeded: number;
    errored: number;
    canceled: number;
    expired: number;
  };
  created_at: string;
  ended_at?: string;
  results_url?: string;
}

export interface BatchResultItem {
  custom_id: string;
  result: {
    type: 'succeeded' | 'errored' | 'expired' | 'canceled';
    message?: {
      content: Array<{ type: string; text?: string }>;
      usage?: { input_tokens: number; output_tokens: number };
    };
    error?: { type: string; message: string };
  };
}

// ── Client ────────────────────────────────────────────────────────────

const API_BASE = 'https://api.anthropic.com/v1/messages/batches';

function getApiKey(): string {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY is not set');
  return key;
}

function baseHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'x-api-key': getApiKey(),
    'anthropic-version': '2023-06-01',
  };
}

/**
 * Create a batch of message requests.
 * Returns the batch job with an ID for polling.
 */
export async function createBatch(requests: BatchRequest[]): Promise<BatchJob> {
  if (!AI_FEATURES.batchProcessing) {
    throw new Error('Batch processing is not enabled');
  }

  const res = await fetch(API_BASE, {
    method: 'POST',
    headers: baseHeaders(),
    body: JSON.stringify({ requests }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Batch creation failed (${res.status}): ${err}`);
  }

  return res.json() as Promise<BatchJob>;
}

/**
 * Poll a batch job by ID.
 * Returns the current status.
 */
export async function pollBatch(batchId: string): Promise<BatchJob> {
  const res = await fetch(`${API_BASE}/${batchId}`, {
    method: 'GET',
    headers: baseHeaders(),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Batch poll failed (${res.status}): ${err}`);
  }

  return res.json() as Promise<BatchJob>;
}

/**
 * Retrieve results for a completed batch.
 */
export async function getBatchResults(batchId: string): Promise<BatchResultItem[]> {
  const job = await pollBatch(batchId);
  if (!job.results_url) {
    throw new Error(`Batch ${batchId} has no results URL (status: ${job.processing_status})`);
  }

  const res = await fetch(job.results_url, {
    headers: { 'x-api-key': getApiKey() },
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Batch results fetch failed (${res.status}): ${err}`);
  }

  // JSONL format: one JSON object per line
  const text = await res.text();
  return text
    .split('\n')
    .filter(Boolean)
    .map(line => JSON.parse(line) as BatchResultItem);
}

/**
 * Cancel a running batch.
 */
export async function cancelBatch(batchId: string): Promise<BatchJob> {
  const res = await fetch(`${API_BASE}/${batchId}/cancel`, {
    method: 'POST',
    headers: baseHeaders(),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Batch cancel failed (${res.status}): ${err}`);
  }

  return res.json() as Promise<BatchJob>;
}

/**
 * Helper: Convert AIMessage array to a BatchRequest entry.
 */
export function messagesToBatchRequest(
  customId: string,
  messages: AIMessage[],
  options?: Partial<AICompletionOptions>,
): BatchRequest {
  const systemMessage = messages.find(m => m.role === 'system');
  const chatMessages = messages.filter(m => m.role !== 'system');

  return {
    custom_id: customId,
    params: {
      model: options?.model ?? 'claude-sonnet-4-5-20250929',
      max_tokens: options?.maxTokens ?? 4096,
      temperature: options?.temperature ?? 0.7,
      messages: chatMessages.map(m => ({ role: m.role, content: m.content })),
      ...(systemMessage ? { system: systemMessage.content } : {}),
    },
  };
}
