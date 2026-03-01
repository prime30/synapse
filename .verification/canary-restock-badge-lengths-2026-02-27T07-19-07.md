# Canary Report: restock-badge-lengths
**Date:** 2026-02-27T07:19:07.689Z
**Project:** 838e7498-6dc5-4268-9fcd-e6f6148f65ad
**Runs:** 1
**Pass Rate:** 0/1 (0%)

## Results
| Run | Pass | Reason | Tools | Time | Cost |
|-----|------|--------|-------|------|------|
| 1 | FAIL | No done event — stream may have errored | 0 | 91s | $0.000 |

## Aggregate Diagnosis
**Summary:** The agent completed a single run in 91 seconds with zero file modifications and zero tool invocations. The coordinator loop appears to have terminated early without attempting any work on the multi-layer product form enhancement task.

**Root Cause:** The PM coordinator likely failed to generate any tool calls due to either: (1) a validation gate rejecting the task before strategy execution, (2) a prompt/context construction issue preventing the agent from understanding the task scope, or (3) an early termination in the think phase without progressing to tool invocation. No tools were called, indicating the agent never entered the execute phase.

**Agent Behavior:** The agent entered the coordinator loop, spent ~91 seconds in think/validation, but produced no strategy execution, no scout briefing, no file reads, and no edits. This suggests the task was either rejected by orchestration policy, failed to generate a valid tool plan, or encountered a silent failure before tool execution began.

## Patterns
**Consistent Failure Mode:** Zero tool invocation across the single run. The agent completed the think phase but never entered the tool execution phase, suggesting early rejection or silent failure in validation/planning.
**Tool Anti-Patterns:**
- No tools called at all — agent never progressed from think to execute phase
- No file reads before tool execution — context may have been insufficient or unavailable
**Context Gaps:**
- snippets/product-form-dynamic.liquid — target file for Liquid markup changes
- assets/product-form-dynamic.css — target file for styling changes
- assets/product-form-dynamic.js — target file for behavior/data handling
- Product metafield structure (custom_values) — needed to understand exclusion logic
- Variant option1 structure — needed to understand length availability data

## Recommendations
### [CRITICAL] Add explicit logging and early-termination diagnostics
**Category:** coordinator | **File:** `lib/agents/coordinator-v2.ts` | **Area:** Main loop iteration, validation gates, tool plan generation

The coordinator loop completed without tool invocation but also without reported errors. Add detailed logging at each gate: (1) orchestration policy validation entry/exit with reason codes, (2) strategy selection with tier/budget details, (3) tool plan generation success/failure, (4) stagnation detection triggers. This will expose whether the task was rejected, deprioritized, or silently failed.

```
Inject console.debug/logger.info calls at: (a) orchestrationPolicy.validate() entry and exit with reason, (b) strategy selection with reasoning, (c) PM prompt construction completion, (d) tool plan parsing from model response, (e) each gate rejection. Log the full PM response when tools are not generated.
```

### [CRITICAL] Review orchestration policy gates for multi-file, multi-layer tasks
**Category:** validation | **File:** `lib/agents/orchestration-policy.ts` | **Area:** Context gates, file count limits, complexity validation

The task requires edits across 3 files (Liquid, CSS, JS) in a coordinated way. The orchestration policy may be rejecting complex cross-file tasks or enforcing overly strict context budgets. A 91-second run with no tools suggests the task failed policy validation before strategy execution.

```
Verify that: (1) multi-file tasks (3+ files) are not auto-rejected, (2) file count thresholds are appropriate for theme modifications, (3) task complexity scoring does not penalize coordinated cross-file edits, (4) the policy explicitly allows 'implement all three layers' type instructions. Log policy decision rationale.
```

### [CRITICAL] Add initialization and early-stage logging to coordinator-v2.ts
**Category:** coordinator | **File:** `lib/agents/coordinator-v2.ts` | **Area:** Main loop initialization and iteration entry points

The coordinator loop is not logging its entry point, context building, or first PM invocation. Without visibility into whether the loop started, whether context was built, or whether the PM was called, debugging is impossible. Add console.log/debug statements at: (1) coordinator entry, (2) after context building, (3) before first PM call, (4) after PM response, (5) before/after each validation gate.

```
Add logging:
```
logger.debug('Coordinator starting', { tier, strategy, maxIterations });
logger.debug('Context built', { contextSize, fileCount, lineCount });
logger.debug('Calling PM', { iterationNum, contextTokens });
logger.debug('PM response', { thinkLength, toolCallCount, toolNames });
logger.debug('Validation gate', { gateName, passed, reason });
```
```

### [CRITICAL] Verify context building does not fail silently in orchestration-policy.ts
**Category:** context | **File:** `lib/agents/orchestration-policy.ts` | **Area:** Context gate evaluation and rejection logic

The 0 tokens in/out suggests the PM was never invoked. The orchestration-policy context gates may be rejecting the request before the PM is called. Add validation that context is non-empty and gates are not over-filtering. Verify that the policy does not reject multi-layer (Liquid + CSS + JS) edits as too complex.

```
Add checks:
```
if (context.files.length === 0) {
  logger.error('Context gate blocked: no files selected', { reason, policy });
  throw new Error('Context validation failed: empty file set');
}
if (gates.complexity > threshold) {
  logger.warn('Complexity gate triggered', { complexity, threshold, recommendation: 'consider HYBRID or GOD_MODE' });
}
```
```

### [CRITICAL] Enhance PM prompt with multi-file orchestration guidance
**Category:** prompt | **File:** `lib/agents/prompts/v2-pm-prompt.ts` | **Area:** Tool usage instructions and strategy guidance section

The task requires coordinated changes across 3 files (Liquid, CSS, JS) with data dependencies (variant option1 → available lengths, metafield custom_values exclusion). The PM prompt may not have explicit guidance on multi-layer edits, data flow between files, or how to structure a single-pass implementation. Add examples and constraints for cross-file consistency.

```
Add to prompt:
```
When implementing multi-layer features (Liquid + CSS + JS):
1. Map data flow: identify which file provides data (Liquid: variant data) and which consumes it (JS: filtering logic).
2. Plan edits in dependency order: Liquid (data structure) → CSS (styling) → JS (behavior).
3. Use run_specialist for each layer with explicit cross-file context.
4. Validate that Liquid data structure matches JS expectations (e.g., data attributes, JSON format).
5. For metafield exclusions: ensure Liquid passes custom_values to JS via data attributes or JSON.
```
```

### [HIGH] Ensure PM prompt explicitly handles multi-layer, multi-file coordination
**Category:** prompt | **File:** `lib/agents/prompts/v2-pm-prompt.ts` | **Area:** Tool usage instructions, multi-file coordination, task decomposition

The task requires coordinating changes across Liquid markup, CSS, and JavaScript. The PM prompt may not have clear instructions for this type of multi-layer work or may treat each file as independent. The agent may have failed to construct a coherent plan.

```
Add explicit guidance: (1) 'When a task requires coordinated changes across multiple files (e.g., Liquid + CSS + JS), plan all edits in a single strategy before executing tools', (2) 'Use run_specialist with a unified brief that connects the three files and their dependencies', (3) 'Example: For product form enhancements, structure the brief as: [Liquid structure changes] -> [CSS styling impacts] -> [JS data/behavior handling]'.
```

### [HIGH] Verify scout and theme map correctly identified target files
**Category:** context | **File:** `lib/agents/scout/structural-scout.ts` | **Area:** File targeting logic, theme map integration, context building

The task specifies three exact files: snippets/product-form-dynamic.liquid, assets/product-form-dynamic.css, assets/product-form-dynamic.js. If the scout or theme map failed to locate these files or return them in the context, the PM would have no targets to work with.

```
Verify that: (1) scout.brief() correctly identifies the three target files from the task description, (2) theme map lookup returns accurate line ranges for each file, (3) context includes file existence checks and initial read of each target file before PM execution, (4) if any target file is missing, the scout logs a warning and attempts fallback strategies.
```

### [HIGH] Add pre-execution validation that target files exist and are readable
**Category:** tools | **File:** `lib/agents/tools/v2-tool-definitions.ts` | **Area:** Tool schemas, pre-execution validation

If the three target files do not exist in the theme, the agent should fail fast with a clear error rather than silently producing no tools. The 91-second runtime suggests the agent may have stalled waiting for file data that never arrived.

```
Add a validation step before PM execution: (1) call read_lines on each target file with a small range (e.g., lines 1-5) to confirm existence, (2) if any file is not found, return an error to the PM with suggestions (e.g., 'product-form-dynamic.liquid not found; did you mean product-form.liquid?'), (3) log file existence check results.
```

### [HIGH] Implement explicit timeout and stagnation detection with fallback strategy
**Category:** coordinator | **File:** `lib/agents/coordinator-v2.ts` | **Area:** Iteration loop, stagnation detection, timeout handling

A 91-second run with zero tools suggests the agent may have entered a loop or stalled. The coordinator should detect stagnation (repeated same state without progress) and either escalate, retry, or return a clear error.

```
Add: (1) a stagnation detector that tracks the last N iterations' tool calls and state; if no new tools are called for 3+ iterations, flag as stagnant, (2) a timeout per iteration (e.g., 30s for think, 20s for tool execution), (3) if stagnation or timeout occurs, log the state and either retry with GOD_MODE or return a clear error message to the user.
```

### [HIGH] Verify scout and theme-map correctly identify target files
**Category:** tools | **File:** `lib/agents/scout/structural-scout.ts` | **Area:** File targeting and brief generation logic

With 0 tool calls, the scout may have failed to identify the 3 target files (product-form-dynamic.liquid, .css, .js). If scout returns empty file list, context building will fail. Verify scout's structural and optional LLM brief correctly target Liquid snippets and asset files.

```
Add validation:
```
const targetFiles = await scout.brief(query);
if (targetFiles.length === 0) {
  logger.error('Scout returned empty file list', { query, theme });
  // Fallback: search for 'product-form-dynamic' in snippets and assets
  const fallback = await themeMap.search('product-form-dynamic');
  logger.info('Scout fallback triggered', { fallbackCount: fallback.length });
}
```
```

### [HIGH] Ensure strategy selection defaults to HYBRID or GOD_MODE for multi-layer tasks
**Category:** strategy | **File:** `lib/agents/strategy.ts` | **Area:** Strategy selection logic based on task complexity

The task requires implementing 3 layers with data dependencies. If the agent is on SIMPLE strategy (Haiku PM, single specialist), it may be insufficient. Verify strategy.ts selects HYBRID (Opus PM + multiple specialists) or GOD_MODE based on task complexity, not just tier.

```
Add complexity heuristic:
```
const complexity = {
  fileCount: targetFiles.length,
  layerCount: (hasLiquid ? 1 : 0) + (hasCSS ? 1 : 0) + (hasJS ? 1 : 0),
  dataFlowDeps: query.includes('metafield') || query.includes('variant') ? 1 : 0,
};
if (complexity.layerCount >= 3 || complexity.dataFlowDeps > 0) {
  return HYBRID; // or GOD_MODE for tier >= PREMIUM
}
```
```

### [HIGH] Add iteration watchdog and stagnation detection
**Category:** coordinator | **File:** `lib/agents/coordinator-v2.ts` | **Area:** Iteration loop and tool call validation

Agent produced 0 tool calls in 91 seconds. Either the PM was never called, or the PM produced no tool calls (empty response). Add a check: if iteration N completes with 0 tools called, log it and decide whether to retry, escalate strategy, or fail fast.

```
Add after each PM response:
```
if (response.toolCalls.length === 0) {
  logger.warn('No tool calls in iteration', { iterationNum, thinkLength: response.thinking.length });
  if (iterationNum === 1) {
    logger.error('First iteration produced no tools. PM may have declined task.');
    throw new Error('PM refused to generate tools on first iteration.');
  }
  // Stagnation: if repeated, escalate or exit
  stagnationCount++;
  if (stagnationCount > 2) {
    logger.error('Stagnation detected. Exiting.');
    break;
  }
}
```
```

### [HIGH] Ensure PM response validation does not silently reject valid tool calls
**Category:** validation | **File:** `lib/agents/tools/v2-tool-executor.ts` | **Area:** PM response parsing and validation

If the PM was invoked but produced an invalid or unexpected response format, validation gates may reject it without logging. Add explicit validation and error messages for PM response parsing.

```
Add validation:
```
if (!response || typeof response !== 'object') {
  logger.error('Invalid PM response format', { responseType: typeof response });
  throw new Error('PM returned invalid response.');
}
if (!Array.isArray(response.toolCalls)) {
  logger.error('PM response missing toolCalls array', { keys: Object.keys(response) });
  throw new Error('PM response missing toolCalls.');
}
```
```

### [MEDIUM] Add explicit task decomposition example for out-of-stock swatch enhancements
**Category:** prompt | **File:** `lib/agents/prompts/v2-pm-prompt.ts` | **Area:** Examples, Shopify-specific task patterns

The task involves specific Shopify product form logic (out-of-stock swatches, length availability, variant option1, metafield exclusion). The PM may benefit from a worked example in the system prompt showing how to decompose such a task.

```
Add a section: 'Example: Enhancing Product Form Swatches' that shows: (1) Step 1: Read product-form-dynamic.liquid to understand current markup structure, (2) Step 2: Read product-form-dynamic.css to identify swatch styling, (3) Step 3: Read product-form-dynamic.js to understand variant data handling, (4) Step 4: Plan edits to markup, styling, and JS in a coordinated way, (5) Step 5: Execute all three edits in a single run_specialist call with a unified brief.'
```

### [MEDIUM] Ensure context budget is sufficient for 3-file product form tasks
**Category:** validation | **File:** `lib/agents/orchestration-policy.ts` | **Area:** Context budget calculation, file size limits

Three files (Liquid, CSS, JS) for a product form component could exceed 5-10KB total. If context budget is too tight, the agent may reject the task before attempting it.

```
Verify that: (1) context budget for SIMPLE/HYBRID strategies allows at least 15-20KB for multi-file theme tasks, (2) file size validation does not reject files under 50KB, (3) if budget is exceeded, the policy escalates to GOD_MODE rather than rejecting the task.
```

### [MEDIUM] Add explicit guidance for metafield and variant data handling
**Category:** prompt | **File:** `lib/agents/prompts/v2-pm-prompt.ts` | **Area:** Shopify-specific knowledge and examples section

The task requires filtering available lengths by excluding metafield custom_values. The PM prompt should include examples of how to (1) access variant option1 data in Liquid, (2) pass it to JS, (3) exclude metafield values, (4) render the second line with contrast-aware styling.

```
Add example:
```
Example: Rendering available lengths with metafield exclusion
Liquid: {% assign available_lengths = variant.option1_values | where: 'available', true %}
        {% assign excluded = product.metafields.custom.custom_values.value | split: ',' %}
        {% assign filtered = available_lengths | where_not: 'name', excluded %}
JS: const excluded = JSON.parse(element.dataset.excludedLengths);
    const available = data.lengths.filter(l => !excluded.includes(l));
CSS: Use `background-color` to determine contrast ratio for text color.
```
```

### [MEDIUM] Add explicit tool for reading metafield and variant data structures
**Category:** tools | **File:** `lib/agents/tools/v2-tool-definitions.ts` | **Area:** Tool definitions section

The task requires understanding the shape of variant.option1 and product.metafields.custom.custom_values. A specialized tool to inspect these structures would help the PM plan the implementation.

```
Add tool:
```
{
  name: 'inspect_variant_schema',
  description: 'Inspect variant and metafield structure for a product',
  input: { productId, theme },
  output: { variantStructure, metafieldSchema, exampleValues }
}
```
```

## Per-Run Details
### Run 1 — FAIL
**Reason:** No done event — stream may have errored
**Tier:** unknown | **Strategy:** unknown
**Tools:** 0 (0 edits, 0 reads, 0 searches)

**Diagnosis:** Agent made zero tool calls and produced no output in 91 seconds. No reasoning blocks were captured, indicating the coordinator loop either failed to initialize, failed to invoke the PM, or exited prematurely before generating any thinking or tool execution.

**Tool Sequence:**
