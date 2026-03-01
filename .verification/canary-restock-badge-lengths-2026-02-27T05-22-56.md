# Canary Report: restock-badge-lengths
**Date:** 2026-02-27T05:22:56.939Z
**Project:** 838e7498-6dc5-4268-9fcd-e6f6148f65ad
**Runs:** 1
**Pass Rate:** 0/1 (0%)

## Results
| Run | Pass | Reason | Tools | Time | Cost |
|-----|------|--------|-------|------|------|
| 1 | FAIL | No code change made | 0 | 19s | $0.000 |

## Aggregate Diagnosis
**Summary:** Agent completed single iteration with no tool invocations and no file modifications. Task required identifying UI component locations and adding conditional text rendering logic, but agent produced no-change output after 19 seconds.

**Root Cause:** Agent failed to enter tool execution loop. Either the PM prompt did not generate tool calls, or coordinator validation gates prevented tool execution. The task requires code comprehension and modification but agent exited without attempting any analysis or edits.

**Agent Behavior:** Agent ran for 19 seconds (minimal time for meaningful analysis), produced zero tool invocations, and returned no-change result. This suggests either: (1) PM prompt generated no tool calls in initial think step, (2) validation gates rejected all proposed tools before execution, or (3) early termination due to stagnation/iteration limit with no progress.

## Patterns
**Consistent Failure Mode:** Zero tool invocation on first iteration - agent does not attempt to read relevant files or understand codebase structure before claiming task completion
**Tool Anti-Patterns:**
- No tools called at all - suggests PM prompt may not be generating tool use for exploratory tasks
- No scout/structural analysis before tool execution - agent should use scout to identify relevant files for this UI modification task
**Context Gaps:**
- Agent did not read product component files (likely in components/ or pages/ for product display)
- Agent did not search for 'Awaiting Restock' badge implementation
- Agent did not examine length/color variant logic
- Agent did not inspect theme or component structure to understand where to add conditional rendering

## Recommendations
### [CRITICAL] Add mandatory scout briefing before tool execution gates
**Category:** coordinator | **File:** `lib/agents/coordinator-v2.ts` | **Area:** Main loop, before first validation gate

Coordinator should invoke structural scout for all non-trivial tasks before validation gates. Scout should identify relevant files (product components, variant logic, badge rendering) and provide briefing to PM. This ensures agent has file context before deciding whether to proceed.

```
After strategy selection, invoke scout.brief() to identify relevant files. Pass scout output to PM context. Only apply validation gates after scout briefing and PM tool generation, not before.
```

### [CRITICAL] Add explicit tool invocation requirement for exploratory tasks
**Category:** prompt | **File:** `lib/agents/prompts/v2-pm-prompt.ts` | **Area:** Tool usage instructions section

PM prompt should explicitly state that for any task involving code modification or feature addition, MUST invoke read_lines or grep_content on relevant files before deciding task feasibility. Current prompt may allow agent to skip exploration entirely.

```
Add rule: 'For any task requiring code changes or feature additions: (1) Use scout briefing to identify files, (2) Read or grep relevant files to understand current implementation, (3) Plan modifications, (4) Execute edits. Do not claim task completion without reading relevant source files first.'
```

### [CRITICAL] Fix early-exit condition in coordinator loop
**Category:** coordinator | **File:** `lib/agents/coordinator-v2.ts` | **Area:** Main loop (think → tool → observe), iteration control, response handling

The coordinator-v2 main loop is exiting before executing any tools. Either the PM response is being discarded, or a validation gate is blocking tool execution. Add explicit logging to detect: (1) whether PM response contains tool_use blocks, (2) whether orchestration-policy validation is rejecting tool calls, (3) whether the loop counter is being reset unexpectedly.

```
Add debug logging before and after PM call:
```
const pmResponse = await callPM(...);
logger.debug('PM response blocks:', pmResponse.content.filter(b => b.type === 'tool_use').length);
if (pmResponse.content.filter(b => b.type === 'tool_use').length === 0) {
  logger.warn('PM did not request any tools. Prompt may be insufficient.');
  // Consider forcing COMPLEX tier or escalating
}
```
Also verify that tool execution is not being short-circuited by early returns in the loop.
```

### [CRITICAL] Disable or fix overly restrictive orchestration-policy gates
**Category:** validation | **File:** `lib/agents/orchestration-policy.ts` | **Area:** Context gates, validation rules, tool call approval logic

The orchestration-policy may be blocking tool execution due to overly conservative context gates or validation rules. With 606 files and 5 prefs available, there is sufficient context. The policy may be rejecting the PM's tool calls due to a false-positive stagnation check or tier mismatch.

```
Review and log all validation checks:
```
if (!policy.validateToolCall(toolCall, context)) {
  logger.warn('Tool call rejected by policy:', toolCall.name, policy.lastFailureReason);
}
```
Temporarily relax gates for COMPLEX tier requests, or add explicit override for domain-specific tools (read_lines, grep_content, edit_lines).
```

### [HIGH] Prevent premature task completion without tool invocation
**Category:** validation | **File:** `lib/agents/orchestration-policy.ts` | **Area:** Validation rules for task types

Orchestration policy should reject any iteration that produces no tool calls on exploratory/modification tasks. Current gates may allow agent to exit without attempting any work.

```
Add validation: If task_type is 'feature_addition' or 'code_modification' and iteration_count < 3 and tool_calls.length == 0, reject and force scout + tool invocation.
```

### [HIGH] Enhance task classification to trigger scout for UI modifications
**Category:** context | **File:** `lib/agents/coordinator-v2.ts` | **Area:** Strategy selection logic

Task classifier should recognize 'Add text under badge when condition X' as UI modification requiring file exploration. Currently agent may classify this as non-actionable without investigation.

```
Add task pattern matching: if task contains 'add', 'show', 'display', 'render', 'badge', 'condition' → classify as HYBRID or GOD_MODE (not SIMPLE) and force scout briefing.
```

### [HIGH] Add scout-aware tool suggestions to PM
**Category:** tools | **File:** `lib/agents/tools/v2-tool-executor.ts` | **Area:** Context building before PM invocation

PM should receive scout briefing output and use it to suggest specific files for read_lines. Currently PM may not know which files to examine.

```
Pass scout.identified_files and scout.file_purposes to PM system prompt as 'Files to examine: [list with purposes]'. This guides PM toward relevant tools.
```

### [HIGH] Raise classifier confidence threshold for COMPLEX escalation
**Category:** strategy | **File:** `lib/agents/strategy.ts` | **Area:** Strategy selection logic, confidence threshold

Classifier confidence of 0.5 is borderline and should trigger COMPLEX tier, not SIMPLE. The request involves UI state (color/length/stock), conditional rendering, and badge placement—inherently complex domain logic. Current logic is too permissive in defaulting to SIMPLE.

```
Increase threshold:
```
if (classifierConfidence < 0.7) {
  // Borderline cases: default to COMPLEX, not SIMPLE
  return HYBRID or COMPLEX;
}
```
Also add domain keyword detection in strategy.ts to catch 'badge', 'stock', 'color', 'length' as complexity signals.
```

### [HIGH] Enhance PM prompt with explicit tool-invocation guardrails
**Category:** prompt | **File:** `lib/agents/prompts/v2-pm-prompt.ts` | **Area:** System prompt, tool instruction section, examples

The PM prompt (v2-pm-prompt.ts) may not be clearly instructing the model when and how to invoke tools. The 'Single agent — generating changes directly' message suggests the PM is attempting to reason through the entire task without tools, which is ineffective for code modification. The prompt must mandate tool use for any request involving file changes.

```
Add explicit mandate:
```
"For ANY request involving code changes, UI modifications, or file edits:
1. ALWAYS use read_lines or grep_content to locate relevant files first.
2. NEVER attempt to generate changes without reading the actual code.
3. Use run_specialist to delegate implementation to domain experts.
4. If you cannot locate files, escalate via get_second_opinion.

Do NOT attempt to generate changes directly without tool invocation."
```
Include a concrete example of the read→edit→verify flow.
```

### [HIGH] Scout must provide specific file targets for badge/stock logic
**Category:** context | **File:** `lib/agents/scout/structural-scout.ts` | **Area:** Scout brief generation, file targeting logic

The scout (structural-scout.ts) should identify key files for 'Awaiting Restock' badge, color/length/stock state management, and product option rendering. Without explicit file targets, the PM has no anchor point and defaults to reasoning-only mode. Scout brief must include file paths and line ranges.

```
Add specific targeting:
```
const badgeFiles = await themeMap.search('Awaiting Restock', 'badge');
const stockFiles = await themeMap.search('stock', 'color', 'length');
brief.fileTargets = [
  { path: badgeFiles[0], purpose: 'Badge component' },
  { path: stockFiles[0], purpose: 'Stock/color/length logic' }
];
brief.mustReadFirst = badgeFiles.concat(stockFiles);
```
```

### [HIGH] Verify tool executor actually executes run_specialist
**Category:** tools | **File:** `lib/agents/tools/v2-tool-executor.ts` | **Area:** Tool execution, error handling, logging

The tool executor (v2-tool-executor.ts) may be receiving tool calls but failing silently. With 0 tool calls logged, either the PM never requested tools, or the executor is swallowing errors. Add explicit error handling and logging.

```
Wrap all tool execution:
```
try {
  const result = await executor.execute(toolCall);
  logger.info('Tool executed:', toolCall.name, 'result length:', result.length);
  return result;
} catch (err) {
  logger.error('Tool execution failed:', toolCall.name, err.message);
  throw err; // Do not silently fail
}
```
```

### [MEDIUM] Add iteration logging for no-tool-invocation detection
**Category:** coordinator | **File:** `lib/agents/coordinator-v2.ts` | **Area:** Iteration loop, after PM response parsing

Coordinator should log when an iteration produces zero tools. This helps identify when agent is silently failing to engage with codebase.

```
Log warning if iteration N produces tool_calls.length == 0 and iteration < max_iterations. Include PM response excerpt to diagnose why tools weren't generated.
```

### [MEDIUM] Add Shopify product variant structure context
**Category:** prompt | **File:** `lib/agents/prompts/v2-pm-prompt.ts` | **Area:** Shopify knowledge section

PM prompt should include knowledge about how Shopify product pages handle length/color variants and where badge logic typically lives. This helps agent recognize relevant files.

```
Add: 'Product variants (length, color, etc.) are typically rendered in components/ProductVariants or pages/products/[id]. Badge conditional logic is usually in components/Badge or inline in variant rendering. Search these locations for variant-related code.'
```

### [MEDIUM] Add stagnation detection and recovery
**Category:** coordinator | **File:** `lib/agents/coordinator-v2.ts` | **Area:** Retry logic, stagnation detection, error recovery

The agent logged 'Upgrading to COMPLEX analysis (Error occurred — retrying with stronger model)' twice but then fell back to SIMPLE. This suggests a retry loop that is not recovering. Add explicit stagnation detection: if 2+ retries occur with 0 tool calls, force escalation to GOD_MODE or abort with diagnostic error.

```
Track retries:
```
let retryCount = 0;
while (retryCount < MAX_RETRIES) {
  const response = await callPM(...);
  const toolCalls = response.content.filter(b => b.type === 'tool_use');
  if (toolCalls.length === 0) {
    retryCount++;
    if (retryCount >= 2) {
      logger.error('Stagnation detected: PM not using tools after 2 retries.');
      escalateToGodMode();
      break;
    }
  }
}
```
```

### [MEDIUM] Add Shopify-specific examples for stock/color/length patterns
**Category:** prompt | **File:** `lib/agents/prompts/v2-pm-prompt.ts` | **Area:** Shopify knowledge section, examples

The PM prompt should include concrete examples of Shopify stock/option/color/length patterns to help the model understand the domain. The prompt may be too generic and not recognizing the specific request as a Shopify product variant problem.

```
Add example:
```
"Shopify Product Stock Patterns:
- Product has variants (color + length combinations)
- When a color is out of stock in the selected length, show 'Awaiting Restock' badge
- Also show which non-color options (sizes, styles) are still available for that color
- Common files: product-form.tsx, variant-selector.tsx, stock-badge.tsx
- Look for: selectedOptions, availableForSale, variantAvailability"
```
```

### [MEDIUM] Ensure theme map cache is populated with badge/stock keywords
**Category:** context | **File:** `lib/agents/theme-map/cache.ts` | **Area:** Cache population, keyword indexing, refresh logic

The theme map (theme-map/cache.ts) may not have indexed 'Awaiting Restock', 'badge', or stock-related files. If the cache is stale or incomplete, scout cannot find targets and PM cannot be guided.

```
Verify cache includes:
```
const keywords = ['Awaiting Restock', 'badge', 'stock', 'color', 'length', 'variant', 'available'];
for (const kw of keywords) {
  const indexed = cache.search(kw);
  if (indexed.length === 0) {
    logger.warn('Keyword not indexed:', kw);
    // Trigger cache refresh
  }
}
```
```

## Per-Run Details
### Run 1 — FAIL
**Reason:** No code change made
**Tier:** SIMPLE | **Strategy:** unknown
**Tools:** 0 (0 edits, 0 reads, 0 searches)

**Diagnosis:** Agent executed 0 tool calls and produced no changes. The request was classified as SIMPLE (0.5 confidence), routed through Sonnet, but the PM never invoked any tools to read files, search for relevant code, or make edits. The agent entered a 'Single agent — generating changes directly' mode twice but failed to materialize any actual work. No reasoning blocks were captured, suggesting the coordinator loop either stalled, hit an early exit condition, or the PM response was malformed/empty.

**Tool Sequence:**
