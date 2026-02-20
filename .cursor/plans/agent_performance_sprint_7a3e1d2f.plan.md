---
name: Agent Performance Sprint
overview: Seven high-impact optimizations to make the Synapse agent faster and more token-efficient, organized into three phases - quick wins (config + small code), context/history efficiency, and architectural improvements. Three items from the original 10 were cut after the architecture challenge pass identified them as low-value or infeasible.
todos:
  - id: prompt-caching
    content: Enable ENABLE_PROMPT_CACHING=true in .env.example (already wired in feature-flags.ts and anthropic.ts)
    status: completed
  - id: conditional-summary
    content: Enable ENABLE_CONDITIONAL_SUMMARY=true in .env.example (already wired in feature-flags.ts and route.ts)
    status: completed
  - id: grep-optimize
    content: Move filePattern glob filtering before loadAllContent() in search-tools.ts so only matching files are hydrated
    status: completed
  - id: parallelize-prestream
    content: Restructure loadStreamContext in route.ts to run file loading, preferences, and memory queries in parallel
    status: completed
  - id: smart-truncation
    content: Add truncateForPreload() helper in coordinator.ts buildSignalContext to cap pre-loaded files at 200 lines with head/cursor/tail strategy
    status: completed
  - id: compress-history
    content: Add compressOldToolResults() in coordinator.ts streamAgentLoop to summarize tool results older than 2 iterations into one-line summaries
    status: completed
  - id: skip-review
    content: "Add review-skip gate in coordinator.ts _executeInner: skip review for single-file edits with <50 lines changed and no dangerous ops"
    status: completed
  - id: verify-lint
    content: Run eslint on all modified files, confirm no new errors
    status: completed
isProject: false
---

# Agent Performance Sprint

## Scope Reduction (Pass 1 Results)

The original 10-item list was reduced to **7 items** after architectural review:

- **Cut: Eager tool execution** — The model stops generating at `tool_use`, so there is no text generation happening in parallel with tool execution. Savings would be ~100-500ms at best, not worth the coordination complexity.
- **Cut: Cache signal analysis** — Signals depend on per-request inputs (`activeFilePath`, `openTabs`, `elementHint`, `explicitFiles`) that change every request. Cache hits would be rare. `buildSignalContext` is already fast (~100-200ms) since it is mostly Set operations.
- **Cut: Streaming tool execution pipeline** — Anthropic's API requires all tool results before continuing generation. This is an API constraint, not an implementation gap.

---

## Phase 1: Quick Wins

### 1. Enable Prompt Caching

**File:** [.env.example](.env.example), deployment env vars

The wiring already exists:

- `lib/ai/feature-flags.ts` line 8: `promptCaching: process.env.ENABLE_PROMPT_CACHING === 'true'`
- `lib/ai/providers/anthropic.ts` lines 76-90: `buildSystemField()` applies `cache_control` when flag is enabled
- Anthropic beta header already sent: `anthropic-beta: prompt-caching-2024-07-31`

**Change:** Add `ENABLE_PROMPT_CACHING=true` to `.env.example` and production env.

**Impact:** ~90% reduction in input token cost for the ~5-6k token system prompt that is identical across requests. Reduces first-token latency by avoiding re-processing cached prefix.

**Risk:** None — the code path is already tested, just gated behind the flag.

---

### 2. Enable Conditional Summary

**File:** [.env.example](.env.example), deployment env vars

The wiring already exists:

- `lib/ai/feature-flags.ts` line 29: `conditionalSummary: process.env.ENABLE_CONDITIONAL_SUMMARY === 'true'`
- `app/api/agents/stream/route.ts` lines 630-645: Skips the summary LLM call when the PM already explored via tools and found no changes; emits the PM's `result.analysis` directly instead.

**Change:** Add `ENABLE_CONDITIONAL_SUMMARY=true` to `.env.example` and production env.

**Impact:** Saves 1-3 seconds and 2-5k tokens on exploration-heavy requests where the PM already produced a complete analysis via tool use.

**Risk:** Medium — if the PM's analysis is shallow, the user sees raw PM output instead of a polished summary. Pass 4 flagged this: the summary phase formats tool cards and conversational responses. Monitor response quality after enabling.

---

### 3. Optimize grep_content: Filter Before Hydrating

**File:** [lib/agents/tools/search-tools.ts](lib/agents/tools/search-tools.ts)

**Current flow (lines 61-83):**

1. `loadAllContent(ctx.files, ctx.loadContent)` — hydrates ALL 150+ files
2. `picomatch(filePattern)` — filters hydrated files by glob
3. Search filtered files

**Optimized flow:**

1. `picomatch(filePattern)` — filter file stubs by glob (no hydration)
2. `loadAllContent(filteredFiles, ctx.loadContent)` — hydrate only matching files (typically 10-30)
3. Search hydrated files

**Exact change:** Move the `filePattern` glob filtering block (lines 71-83) above the `loadAllContent` call (line 64). Apply the filter to `ctx.files` first, then hydrate the filtered subset.

```typescript
// Before hydration: filter by glob pattern to avoid hydrating all files
let filesToHydrate = ctx.files;
if (filePattern) {
  let isMatch: (path: string) => boolean;
  try {
    isMatch = picomatch(filePattern, { bash: true });
  } catch {
    return { tool_use_id: '', content: `Invalid glob pattern "${filePattern}".`, is_error: true };
  }
  filesToHydrate = ctx.files.filter(f => isMatch(f.path ?? f.fileName));
}

let filesToSearch: FileContext[];
if (ctx.loadContent) {
  filesToSearch = await loadAllContent(filesToHydrate, ctx.loadContent);
} else {
  filesToSearch = filesToHydrate.filter(f => !f.content.startsWith('['));
}
```

**Impact:** Reduces `grep_content` from 500-2000ms to ~100-400ms by hydrating 10-30 files instead of 150+.

**Edge case:** When `filePattern` is not provided, all files are still hydrated (existing behavior). Consider adding a default filter for common patterns (e.g., exclude `assets/*.js.map`).

---

## Phase 2: Context and History Efficiency

### 4. Parallelize Pre-Stream Work

**File:** [app/api/agents/stream/route.ts](app/api/agents/stream/route.ts), `loadStreamContext` (lines 136-192)

**Current sequence:**

```
loadProjectFiles()          -> sequential (~200-500ms)
  yieldToEventLoop()
    [prefResult, memoryContext]  -> parallel (~200-400ms)
      yieldToEventLoop()
        buildDiagnosticContext()  -> sequential (~100-300ms)
```

Total: ~500-1200ms (sequential chain)

**Optimized sequence:**

```
loadProjectFiles()  ----------------------+
prefResult (user_preferences query)  -----+  All start in parallel
memoryContext (developer_memory query)  ---+
                                          v
buildDiagnosticContext(fileContexts)  <- waits for loadProjectFiles only
```

**Exact change:** Start `prefResult` and `memoryContext` queries in parallel with `loadProjectFiles`. Then run `buildDiagnosticContext` after `loadProjectFiles` completes (it depends on `fileContexts`), while `prefResult`/`memoryContext` may already be done.

```typescript
// Start all independent queries in parallel
const filePromise = loadProjectFiles(projectId, supabase, serviceClient);
const prefPromise = serviceClient.from('user_preferences').select('*').eq('user_id', userId);
const memoryPromise = supabase.from('developer_memory').select('*').eq('project_id', projectId)
  .order('updated_at', { ascending: false }).limit(20);

// File loading must complete before diagnostic context
const { allFiles, loadContent } = await filePromise;
const fileContexts = allFiles.map(f => ({ ...f }));

// These can resolve whenever
const [prefResult, memoryResult] = await Promise.all([prefPromise, memoryPromise]);
const diagnosticContext = buildDiagnosticContext(fileContexts);
```

**Impact:** Saves 200-500ms by overlapping file loading with preference/memory queries. `buildDiagnosticContext` (CPU-bound, ~100-300ms) runs immediately after `filePromise` resolves, not after memory queries.

---

### 5. Smart File Truncation for Pre-Loading

**File:** [lib/agents/coordinator.ts](lib/agents/coordinator.ts), `buildSignalContext` (lines 533-611)

**Current behavior:** Pre-loaded files (max 8) include full content with no per-file size cap. A single `layout/theme.liquid` (500+ lines) can consume 5-8k tokens.

**Optimization:** For files exceeding 200 lines, include a smart truncation:

- First 80 lines (imports, declarations, opening structure)
- Lines around the user's cursor position (if `activeFilePath` matches), +/- 30 lines
- Last 30 lines (closing structure)
- A `[... N lines omitted -- use read_file for full content ...]` indicator

**Implementation location:** After hydration (line 576-587) and before building the manifest (line 590). Add a `truncateForPreload(file, options)` helper.

```typescript
const MAX_PRELOAD_LINES = 200;

function truncateForPreload(content: string, cursorLine?: number): string {
  const lines = content.split('\n');
  if (lines.length <= MAX_PRELOAD_LINES) return content;

  const head = lines.slice(0, 80);
  const tail = lines.slice(-30);
  const omitted = lines.length - 80 - 30;

  if (cursorLine && cursorLine > 80 && cursorLine < lines.length - 30) {
    const cursorStart = Math.max(80, cursorLine - 30);
    const cursorEnd = Math.min(lines.length - 30, cursorLine + 30);
    const cursorSection = lines.slice(cursorStart, cursorEnd);
    const omitted1 = cursorStart - 80;
    const omitted2 = (lines.length - 30) - cursorEnd;
    return [
      ...head,
      `\n[... ${omitted1} lines omitted -- use read_file for full content ...]\n`,
      ...cursorSection,
      `\n[... ${omitted2} lines omitted ...]\n`,
      ...tail,
    ].join('\n');
  }

  return [...head, `\n[... ${omitted} lines omitted -- use read_file for full content ...]\n`, ...tail].join('\n');
}
```

**Impact:** Saves 2-8k tokens per request on large files. The agent can always `read_file` for full content when needed.

**Risk (Pass 4):** Could cause the model to miss important context in large files. Mitigated by: (a) preserving head/tail/cursor sections, (b) the agent having `read_file` available, (c) the omission indicator telling the model content was truncated.

---

### 6. Compress Conversation History Between Iterations

**File:** [lib/agents/coordinator.ts](lib/agents/coordinator.ts), `streamAgentLoop` (after tool results are fed back, ~line 3250)

**Current behavior:** Each iteration appends the full assistant message (with raw `__toolCalls` content blocks) and full tool result blocks to the `messages` array. After 5 iterations with 3-4 tool calls each, this is 15-20 full tool results still in context.

**Optimization:** After each iteration, compress tool results older than 2 iterations into a compact summary. Keep only the tool name, file path (if applicable), and a one-line summary of the result.

**Implementation:** Add a `compressOldToolResults(messages, currentIteration)` function that runs after line ~3253 (where tool results are appended):

```typescript
function compressOldToolResults(messages: AIMessage[], keepRecentIterations: number = 2): void {
  // Find tool result messages older than keepRecentIterations
  // Replace their content with a compact summary:
  // "read_file(sections/header.liquid): 245 lines loaded"
  // "grep_content('opacity', *.css): 3 matches in 2 files"
  // "search_replace(sections/header.liquid): replaced 5 lines"
}
```

The compressed format per tool result:

- `read_file`: `"read_file({fileName}): {lineCount} lines"`
- `grep_content`: `"grep_content('{query}', {pattern}): {matchCount} matches in {fileCount} files"`
- `search_replace`: `"search_replace({filePath}): replaced {oldLines} -> {newLines} lines"`
- `propose_code_edit`: `"propose_code_edit({filePath}): {lineCount} lines written"`
- Other tools: `"{toolName}({firstArg}): {resultLength} chars"`

**Impact:** Saves 5-15k tokens in later iterations. Reduces model latency (less to read). The model retains awareness of what tools were called and their outcomes without the full raw output.

**Risk (Pass 4):** If the model needs to reference an old tool result (e.g., re-reading grep output from 3 iterations ago), the compressed summary won't have the detail. Mitigated by: the model can re-call the tool if it needs the full result.

---

## Phase 3: Architectural

### 7. Reduce Multi-Agent Sequential Phases

**File:** [lib/agents/coordinator.ts](lib/agents/coordinator.ts), `_executeInner` (orchestrated path)

**Current flow:** PM call -> specialist calls (parallel) -> review call -> optional refinement = 3+ sequential LLM round-trips (7-18s total).

**Optimization:** Skip the review phase for simple edits based on clear criteria:

- Single file changed
- Less than 50 lines changed total
- No security-sensitive operations (no `push_to_shopify`, no `delete_file`)
- Specialist confidence is high (no `needs_review` flag)

**Implementation:** After specialists complete and before the review agent is invoked (~line 2168), add a gate:

```typescript
const totalLinesChanged = specialistResults
  .flatMap(r => r.changes ?? [])
  .reduce((sum, c) => sum + Math.abs(
    c.proposedContent.split('\n').length - c.originalContent.split('\n').length
  ), 0);
const uniqueFilesChanged = new Set(
  specialistResults.flatMap(r => (r.changes ?? []).map(c => c.fileName))
).size;
const hasDangerousOps = specialistResults.some(r =>
  r.toolsUsed?.some(t => ['push_to_shopify', 'delete_file'].includes(t))
);

const skipReview = uniqueFilesChanged <= 1
  && totalLinesChanged < 50
  && !hasDangerousOps;

if (!skipReview) {
  // Run review agent as before
}
```

**Impact:** Saves 2-5s on simple edits by eliminating the review LLM round-trip. Most Shopify theme edits (CSS tweaks, text changes, single-section updates) qualify.

**Risk (Pass 4):** Fewer thinking steps visible in the UI (`ThinkingBlock`, `ProgressRail`). The review phase provides quality assurance; skipping it could miss errors. Mitigated by: strict criteria (single file, small change, no dangerous ops). Consider emitting a "Review skipped (simple edit)" thinking event so the UI doesn't look broken.

---

## Files to Modify


| Phase | File                               | Change                                                                                                  |
| ----- | ---------------------------------- | ------------------------------------------------------------------------------------------------------- |
| 1     | `.env.example`                     | Add `ENABLE_PROMPT_CACHING=true`, `ENABLE_CONDITIONAL_SUMMARY=true`                                     |
| 1     | `lib/agents/tools/search-tools.ts` | Move `filePattern` filtering before `loadAllContent()`                                                  |
| 2     | `app/api/agents/stream/route.ts`   | Restructure `loadStreamContext` for parallel queries                                                    |
| 2     | `lib/agents/coordinator.ts`        | Add `truncateForPreload()` in `buildSignalContext`; add `compressOldToolResults()` in `streamAgentLoop` |
| 3     | `lib/agents/coordinator.ts`        | Add review-skip gate in `_executeInner`                                                                 |


## No UI Changes Required

Pass 4 confirmed that all optimizations are backend/infrastructure. Synthetic results are not displayed in tool cards (tool cards derive labels from tool input, not result content). The only user-visible effects are: (a) faster responses, (b) potentially fewer thinking steps when review is skipped. Consider emitting a "Review skipped" thinking event for transparency.

---

## Acceptance Criteria

- `ENABLE_PROMPT_CACHING=true` in `.env.example`; Anthropic requests include `cache_control` on system messages
- `ENABLE_CONDITIONAL_SUMMARY=true` in `.env.example`; summary LLM call skipped when PM explored and found no changes
- `grep_content` with a `filePattern` hydrates only matching files, not all 150+
- `loadStreamContext` runs file loading, preferences, and memory queries in parallel; total pre-stream time reduced
- Pre-loaded files >200 lines are truncated with head/cursor/tail strategy; omission indicator included
- Tool results older than 2 iterations are compressed to one-line summaries; total history tokens reduced
- Review phase skipped for single-file edits with <50 lines changed and no dangerous operations
- ESLint passes with no new errors on all modified files

---

## Implementation Order

1. Prompt caching (env var)
2. Conditional summary (env var)
3. grep_content optimization (search-tools.ts)
4. Parallelize pre-stream work (route.ts)
5. Smart file truncation (coordinator.ts)
6. Compress conversation history (coordinator.ts)
7. Skip review gate (coordinator.ts)
8. Verify lint

