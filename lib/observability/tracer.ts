/**
 * Lightweight span-based tracer -- EPIC B
 *
 * Traces contain ordered spans. Persisted to Supabase agent_traces on completion.
 */

import { createServiceClient } from '@/lib/supabase/admin';
import { createModuleLogger } from './logger';

const log = createModuleLogger('tracer');

export interface Span {
  spanId: string;
  parentSpanId: string | null;
  operation: string;
  startTime: number;
  endTime: number | null;
  durationMs: number | null;
  tags: Record<string, string | number | boolean>;
}

export interface Trace {
  traceId: string;
  userId: string | null;
  projectId: string | null;
  spans: Span[];
  startTime: number;
  endTime: number | null;
  totalDurationMs: number | null;
}

function generateId(): string {
  return crypto.randomUUID();
}

export class Tracer {
  private trace: Trace;
  private spanStack: string[] = [];

  constructor(traceId?: string) {
    this.trace = {
      traceId: traceId ?? generateId(),
      userId: null, projectId: null,
      spans: [], startTime: Date.now(),
      endTime: null, totalDurationMs: null,
    };
  }

  get traceId(): string { return this.trace.traceId; }

  setContext(userId: string | null, projectId: string | null): void {
    this.trace.userId = userId;
    this.trace.projectId = projectId;
  }

  startSpan(operation: string, tags: Record<string, string | number | boolean> = {}): string {
    const spanId = generateId();
    const parentSpanId = this.spanStack.length > 0 ? this.spanStack[this.spanStack.length - 1] : null;
    this.trace.spans.push({ spanId, parentSpanId, operation, startTime: Date.now(), endTime: null, durationMs: null, tags });
    this.spanStack.push(spanId);
    return spanId;
  }

  endSpan(additionalTags?: Record<string, string | number | boolean>): void {
    const spanId = this.spanStack.pop();
    if (!spanId) return;
    const span = this.trace.spans.find(s => s.spanId === spanId);
    if (span) {
      span.endTime = Date.now();
      span.durationMs = span.endTime - span.startTime;
      if (additionalTags) Object.assign(span.tags, additionalTags);
    }
  }

  endSpanById(spanId: string, additionalTags?: Record<string, string | number | boolean>): void {
    const span = this.trace.spans.find(s => s.spanId === spanId);
    if (span) {
      span.endTime = Date.now();
      span.durationMs = span.endTime - span.startTime;
      if (additionalTags) Object.assign(span.tags, additionalTags);
    }
    const idx = this.spanStack.indexOf(spanId);
    if (idx !== -1) this.spanStack.splice(idx, 1);
  }

  async endTrace(): Promise<Trace> {
    this.trace.endTime = Date.now();
    this.trace.totalDurationMs = this.trace.endTime - this.trace.startTime;
    for (const span of this.trace.spans) {
      if (span.endTime === null) {
        span.endTime = this.trace.endTime;
        span.durationMs = span.endTime - span.startTime;
      }
    }
    try { await this.persist(); } catch (err) {
      log.warn({ traceId: this.trace.traceId, err }, 'Failed to persist trace');
    }
    return this.trace;
  }

  getTrace(): Trace { return { ...this.trace }; }

  private async persist(): Promise<void> {
    if (!this.trace.userId && !this.trace.projectId) return;
    const supabase = createServiceClient();
    const { error } = await supabase.from('agent_traces').insert({
      trace_id: this.trace.traceId,
      user_id: this.trace.userId,
      project_id: this.trace.projectId,
      total_duration_ms: this.trace.totalDurationMs,
      span_count: this.trace.spans.length,
      spans: this.trace.spans,
      created_at: new Date(this.trace.startTime).toISOString(),
    });
    if (error) log.warn({ traceId: this.trace.traceId, error: error.message }, 'Trace persistence failed');
  }
}

export function startTrace(traceId?: string): Tracer {
  return new Tracer(traceId);
}