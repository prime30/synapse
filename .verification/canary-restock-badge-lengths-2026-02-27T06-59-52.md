# Canary Report: restock-badge-lengths
**Date:** 2026-02-27T06:59:52.277Z
**Project:** 838e7498-6dc5-4268-9fcd-e6f6148f65ad
**Runs:** 1
**Pass Rate:** 0/1 (0%)

## Results
| Run | Pass | Reason | Tools | Time | Cost |
|-----|------|--------|-------|------|------|
| 1 | FAIL | No code change made | 28 | 205s | $0.000 |

## Aggregate Diagnosis
**Summary:** Agent executed 28 consecutive read_lines operations without any edits or tool diversity, resulting in zero file modifications. The agent entered a read-only loop, gathering information but never transitioning to execution phase. All read_lines calls returned no results, suggesting either file path resolution failures or premature context exhaustion.

**Root Cause:** The coordinator's iteration loop lacks a forced transition mechanism from information-gathering (read phase) to execution (edit phase). When read_lines returns empty results repeatedly, the agent should either: (1) trigger strategy escalation, (2) invoke run_specialist for execution, or (3) fail-fast with validation error. Instead, it continues looping indefinitely until hitting iteration limit (80 max, but stopped at 28 tools = likely context window exhaustion before reaching hard limit).

**Agent Behavior:** Agent classified the task, began structural reconnaissance (reading files), but never committed to editing. The PM prompt's tool instructions may not include a decision threshold for 'when to stop reading and start editing' or 'how many failed reads before escalating.' The tool executor (run_specialist, run_review) was never invoked despite the task requiring implementation across three files (Liquid, CSS, JS).

## Patterns
**Consistent Failure Mode:** Read-only loop with no execution: Agent repeatedly calls read_lines without receiving results, never transitions to edit_lines or run_specialist, exhausts token budget before completing any modifications.
**Intermittent Issues:**
- read_lines returns no result: Could indicate file paths are incorrect, theme map lookup failed, or scout brief did not properly target files
- No tool diversity: Only read_lines used suggests PM prompt did not activate edit or specialist tools despite having them available
**Tool Anti-Patterns:**
- 28 consecutive read_lines calls with no edit_lines or run_specialist invocation
- No attempt to call run_specialist despite task explicitly requiring implementation in three layers (Liquid, CSS, JS)
- No run_review or get_second_opinion invoked to validate approach
- No error recovery: When read_lines fails, agent retries same operation rather than escalating strategy
**Context Gaps:**
- snippets/product-form-dynamic.liquid — Never read or edited
- assets/product-form-dynamic.css — Never read or edited
- assets/product-form-dynamic.js — Never read or edited
- product metafield schema (custom_values) — Never consulted
- variant option1 structure — Never explored
- Theme map file index — May not have been populated or consulted correctly

## Recommendations
### [CRITICAL] Implement execution gate with read-count threshold
**Category:** coordinator | **File:** `lib/agents/coordinator-v2.ts` | **Area:** Main loop, after tool execution, before next iteration

Add a coordinator-level check: if agent executes >N read operations (e.g., 5-8) without invoking edit_lines, run_specialist, or run_review, force strategy escalation or fail with validation error. This prevents infinite read loops.

```
Track consecutive read-only tool calls. If count exceeds threshold and task involves edits, either (1) invoke run_specialist automatically with current context, (2) escalate to HYBRID/GOD_MODE strategy, or (3) emit validation error with 'unable to locate target files' message.
```

### [CRITICAL] Validate scout brief and theme map before read loop
**Category:** context | **File:** `lib/agents/scout/structural-scout.ts` | **Area:** Scout brief generation, file targeting logic

The scout (structural-scout.ts) or theme map (lookup.ts) may have failed to identify target files. Add pre-execution validation: confirm that files identified by scout exist and are readable before entering main loop.

```
After scout generates brief, validate that all target files in brief are resolvable in theme map. If any critical files (product-form-dynamic.liquid, .css, .js) are missing, emit warning and optionally trigger LLM brief augmentation or fail-fast.
```

### [CRITICAL] Add explicit decision logic to PM prompt for read-to-edit transition
**Category:** prompt | **File:** `lib/agents/prompts/v2-pm-prompt.ts` | **Area:** Tool usage instructions, decision-making guidance

The PM prompt (v2-pm-prompt.ts) must include clear instructions on when to stop reading and start editing. For multi-file implementation tasks, provide decision criteria: 'After reading 2-3 target files, invoke run_specialist to implement changes' or 'If read_lines returns empty, check theme map or escalate.'

```
Add section: 'For implementation tasks requiring edits to multiple files: (1) Read target file structures once, (2) Immediately invoke run_specialist with implementation details, (3) Do not read same file multiple times. If read_lines returns no result, use get_second_opinion or escalate strategy.'
```

### [CRITICAL] Add stagnation detection for read-only loops
**Category:** coordinator | **File:** `lib/agents/coordinator-v2.ts` | **Area:** Main loop iteration logic, post-tool-execution observation phase

Implement sliding-window stagnation detection in coordinator-v2.ts. If N consecutive iterations (suggest N=3) produce only read_lines calls with zero edit_lines or specialist/review calls, force strategy escalation or emit diagnostic error. Currently, the agent can loop indefinitely reading files without attempting edits.

```
Add state tracking: `readOnlyIterationCount`. After each iteration, if toolCall.type === 'read_lines' and no edit/specialist/review in last 3 iterations, increment counter. If counter >= 3, call `forceStrategyEscalation()` or `emitDiagnostic('read-only-stagnation')` and break loop with error. Reset counter on any edit/specialist/review call.
```

### [CRITICAL] Fix malformed tool invocation JSON serialization
**Category:** tools | **File:** `lib/agents/tools/v2-tool-executor.ts` | **Area:** Tool invocation parsing and validation

The final tool call (28) failed with 'Failed to parse tool input JSON'. This suggests the PM constructed an invalid tool call object. Add defensive validation in v2-tool-executor.ts and v2-tool-definitions.ts to catch and report malformed invocations before JSON.parse, with fallback recovery.

```
Wrap JSON.parse(toolInputStr) in try-catch. On parse error, log the raw input, call PM with diagnostic context ('Your last tool call was malformed: [raw input]. Please retry with valid JSON.'), and continue loop instead of crashing. Add schema validation via ajv or similar before execution.
```

### [HIGH] Add validation and error recovery to read_lines tool
**Category:** tools | **File:** `lib/agents/tools/v2-tool-executor.ts` | **Area:** read_lines implementation, result handling

When read_lines returns no result, the tool should emit a diagnostic error (e.g., 'file not found', 'invalid path') rather than silent failure. This helps coordinator detect and respond to file resolution issues.

```
If read_lines returns empty, return error object with reason (file not found, path invalid, etc.). Coordinator can then decide to retry with corrected path or escalate.
```

### [HIGH] Implement stagnation detection for repeated empty results
**Category:** coordinator | **File:** `lib/agents/coordinator-v2.ts` | **Area:** Iteration loop, after tool execution

If the same tool (e.g., read_lines) is called 3+ times in a row with no result change, coordinator should detect stagnation and trigger escalation or fail-fast.

```
Track last N tool results. If same tool called consecutively with identical empty/null results, increment stagnation counter. At threshold (e.g., 3), invoke run_specialist or emit validation error.
```

### [HIGH] Add pre-execution validation gate for multi-file edit tasks
**Category:** validation | **File:** `lib/agents/orchestration-policy.ts` | **Area:** Context gates, validation rules

For tasks that explicitly require edits to 3+ files (Liquid, CSS, JS), validate that all target files are identifiable before entering main loop. Use orchestration-policy.ts to enforce this gate.

```
Add gate: 'For multi-file implementation tasks, require successful read of all target files before permitting edit phase. If any target file unresolvable, fail-fast with clear error message listing missing files.'
```

### [HIGH] Escalate multi-file edit tasks to HYBRID or GOD_MODE by default
**Category:** strategy | **File:** `lib/agents/strategy.ts` | **Area:** Strategy selection logic

The task requires coordinated edits across 3 files (Liquid, CSS, JS) with cross-file dependencies (variant data, metafield exclusions, styling). SIMPLE strategy may be insufficient. Default multi-file tasks to HYBRID or use tier-aware escalation.

```
If task involves edits to 3+ files or cross-file dependencies, automatically select HYBRID (or tier-appropriate strategy). Do not allow SIMPLE strategy for multi-file implementation without explicit override.
```

### [HIGH] Add explicit edit decision gate to PM prompt
**Category:** prompt | **File:** `lib/agents/prompts/v2-pm-prompt.ts` | **Area:** Tool usage instructions and decision logic

The PM prompt (v2-pm-prompt.ts) lacks a clear decision gate for when to transition from analysis to edit_lines. For multi-file tasks, the PM should explicitly reason about readiness before each tool call. Add a structured instruction: 'After reading files, if you have sufficient context to make edits, call edit_lines. If you need more info, read more. Never read the same file twice in a row.'

```
Add section: 'EDIT DECISION GATE: After reading a file, evaluate: (1) Do I understand the current structure? (2) Can I identify the exact lines to modify? (3) Have I read this file before? If yes to 1&2 and no to 3, call edit_lines. Otherwise, read a different file or call run_specialist if unsure. Never loop on the same file.'
```

### [HIGH] Enforce tool diversity in orchestration policy
**Category:** validation | **File:** `lib/agents/orchestration-policy.ts` | **Area:** Context gates and policy enforcement rules

The orchestration-policy.ts should validate that in GOD_MODE with COMPLEX tier, after reading all target files once, at least one edit_lines or run_specialist call must occur within N iterations. This prevents analysis-only loops.

```
Add policy rule: 'If toolSequence.filter(t => t.type === 'read_lines').length >= targetFileCount * 2 and toolSequence.filter(t => t.type in ['edit_lines', 'run_specialist', 'run_review']).length === 0, reject next read_lines call and return validation error forcing edit/specialist attempt.'
```

### [HIGH] Add explicit iteration budget enforcement
**Category:** coordinator | **File:** `lib/agents/coordinator-v2.ts` | **Area:** Iteration counting and budget enforcement

Although max 80 iterations exists, the agent hit 28 with zero progress. Add a stricter budget for analysis-only iterations (e.g., max 5 read_lines per file before forcing edit/specialist). Emit diagnostic at iteration 20 if no edits attempted.

```
Track `analysisIterationCount`. After each read_lines, increment. If analysisIterationCount > 5 and editCount === 0, emit warning. If analysisIterationCount > 10 and editCount === 0, call `forceRunSpecialist()` with current context. Reset analysisIterationCount on any edit/specialist call.
```

### [HIGH] Add multi-file coordination strategy to PM prompt
**Category:** prompt | **File:** `lib/agents/prompts/v2-pm-prompt.ts` | **Area:** Task decomposition and multi-file strategy

For this three-file task (liquid, css, js), the PM should have explicit guidance on coordinating changes across layers. The prompt should include a template for multi-file edits that ensures all three files are targeted in a single coordinated pass, not in separate analysis loops.

```
Add section: 'MULTI-FILE TASKS: For tasks spanning 3+ files, plan edits in this order: (1) Read all files once to understand structure. (2) Identify all edit locations across all files. (3) Call edit_lines for each file in sequence (liquid, css, js). (4) Call run_review to validate consistency. Never re-read a file after identifying edit locations.'
```

### [MEDIUM] Add Shopify-specific guidance for variant and metafield data handling
**Category:** prompt | **File:** `lib/agents/prompts/v2-pm-prompt.ts` | **Area:** Shopify knowledge section

The PM prompt should include explicit knowledge about: (1) How to query variant option1 availability, (2) How to access product metafield custom_values, (3) How to exclude lengths from metafield list. This guides read and edit phases.

```
Add: 'Variant data is in Liquid via product.variants. option1 contains length values. Product metafields are accessed via product.metafields.custom_values. When filtering lengths, iterate product.variants, collect option1 values, then subtract custom_values list.'
```

### [MEDIUM] Ensure theme map includes all three target files with correct paths
**Category:** context | **File:** `lib/agents/theme-map/cache.ts` | **Area:** Theme map initialization, file indexing

Theme map (cache.ts, lookup.ts) must have pre-indexed paths for snippets/product-form-dynamic.liquid, assets/product-form-dynamic.css, assets/product-form-dynamic.js. If any are missing, scout brief cannot target them.

```
Verify theme map includes all three files. Add debug logging to confirm file paths are correctly resolved. If files missing, emit warning or trigger fallback file discovery.
```

### [MEDIUM] Add run_specialist invocation guidance to PM prompt
**Category:** tools | **File:** `lib/agents/prompts/v2-pm-prompt.ts` | **Area:** Tool usage examples

PM prompt should include clear examples of when and how to invoke run_specialist for implementation. For this task, run_specialist should be called once per file (or once for all three with clear instructions).

```
Add example: 'For multi-file Liquid/CSS/JS tasks, call run_specialist with detailed implementation plan: (1) Liquid changes with exact code, (2) CSS changes with selectors, (3) JS changes with event handlers. Provide variant data and metafield exclusion logic in specialist context.'
```

### [MEDIUM] Pre-populate file edit locations in structural brief
**Category:** context | **File:** `lib/agents/scout/structural-scout.ts` | **Area:** Structural brief generation for multi-file tasks

The scout/structural-scout.ts could provide hint locations in the brief (e.g., 'Line 45-60 in liquid contains swatch rendering; Line 120-150 in css contains swatch styles'). This would help PM skip to relevant sections faster and reduce redundant reads.

```
For each target file, include a 'suggested_edit_zones' array with line ranges and brief descriptions. Example: { file: 'product-form-dynamic.liquid', suggested_edit_zones: [{ lines: '45-60', description: 'Swatch rendering loop' }] }. Pass to PM context.
```

### [MEDIUM] Add run_specialist fallback for read-only detection
**Category:** tools | **File:** `lib/agents/tools/v2-tool-executor.ts` | **Area:** Specialist invocation and fallback logic

When stagnation detection triggers (recommendation 1), automatically call run_specialist with the accumulated context instead of crashing. This gives the agent a recovery path.

```
If stagnation is detected, construct a run_specialist call with accumulated file contents and task prompt. Pass to specialist model (Sonnet) with instruction: 'You have read-only context for these files. Plan and execute all edits in one pass.' Return specialist's edit_lines calls to coordinator.
```

### [MEDIUM] Adjust GOD_MODE strategy to enforce edit enforcement
**Category:** strategy | **File:** `lib/agents/strategy.ts` | **Area:** GOD_MODE strategy definition and enforcement rules

GOD_MODE should guarantee at least one edit or specialist call per 5 iterations. Currently, strategy.ts selects GOD_MODE but doesn't enforce action-oriented behavior.

```
Add to GOD_MODE: 'enforceEditFrequency: true, maxReadOnlyIterations: 5'. Coordinator checks this flag and escalates if violated.
```

## Per-Run Details
### Run 1 — FAIL
**Reason:** No code change made
**Tier:** COMPLEX | **Strategy:** GOD_MODE
**Tools:** 28 (0 edits, 28 reads, 0 searches)

**Diagnosis:** Agent executed 28 tool calls (all read_lines, zero edits) over 205s without producing any changes. The final tool call (28) failed with JSON parse error. Agent loaded context, classified as COMPLEX tier with GOD_MODE strategy, but never transitioned from analysis to execution. No edit_lines or specialist/review calls were attempted despite having adequate context and strategy.

**Tool Sequence:**
- `read_lines` (0ms)
- `read_lines` (0ms)
- `read_lines` (0ms)
- `read_lines` (0ms)
- `read_lines` (0ms)
- `read_lines` (0ms)
- `read_lines` (0ms)
- `read_lines` (0ms)
- `read_lines` (0ms)
- `read_lines` (0ms)
- `read_lines` (0ms)
- `read_lines` (0ms)
- `read_lines` (1ms)
- `read_lines` (0ms)
- `read_lines` (0ms)
- `read_lines` (0ms)
- `read_lines` (0ms)
- `read_lines` (0ms)
- `read_lines` (0ms)
- `read_lines` (0ms)
- ... and 8 more
