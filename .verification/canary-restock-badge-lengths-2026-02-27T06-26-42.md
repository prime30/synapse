# Canary Report: restock-badge-lengths
**Date:** 2026-02-27T06:26:42.750Z
**Project:** 838e7498-6dc5-4268-9fcd-e6f6148f65ad
**Runs:** 1
**Pass Rate:** 0/1 (0%)

## Results
| Run | Pass | Reason | Tools | Time | Cost |
|-----|------|--------|-------|------|------|
| 1 | FAIL | No done event — stream may have errored | 0 | 150s | $0.000 |

## Aggregate Diagnosis
**Summary:** Agent completed 150s iteration with zero file changes and zero tool invocations. No errors reported, but no work performed. Agent appears to have stalled in planning phase without executing any substantive actions.

**Root Cause:** Coordinator likely entered a state where the PM model declined to invoke tools or the strategy selection/validation gates prevented tool execution. With no tools called and no errors surfaced, the most probable cause is either: (1) PM prompt did not generate valid tool invocations for a complex multi-file task, (2) orchestration policy validation gates rejected all proposed actions before execution, or (3) coordinator hit iteration limit or stagnation detection without attempting work.

**Agent Behavior:** Agent ran for full 150s budget without reading files, calling specialists, or modifying any code. The scenario requires coordinated changes across 3 files (Liquid, CSS, JS) with cross-file dependencies (variant data, metafield exclusion, contrast logic). Zero tool invocation suggests the agent either: (a) failed to decompose the task into actionable steps, (b) determined via policy gates that the task was out-of-scope, or (c) stalled waiting for clarification that never came.

## Patterns
**Consistent Failure Mode:** Zero tool invocation across single run. Agent completes iteration budget without reading any files or calling any tools, indicating either PM prompt failure to generate tool invocations or policy gates over-rejecting all proposed actions.
**Tool Anti-Patterns:**
- No tools called at all — suggests PM either declined to invoke tools or all invocations were rejected by validation gates before executor ran
**Context Gaps:**
- Target files never read: snippets/product-form-dynamic.liquid, assets/product-form-dynamic.css, assets/product-form-dynamic.js
- No scout pass on multi-file task — agent should have immediately identified all three target files and their current structure
- Cross-file dependency context missing: variant data flow, metafield exclusion logic, contrast handling integration points never mapped
- Shopify integration patterns not established: no reference to how JS variant data flows to Liquid, how CSS classes are applied dynamically

## Recommendations
### [CRITICAL] Enhance PM prompt with explicit multi-file task decomposition
**Category:** prompt | **File:** `lib/agents/prompts/v2-pm-prompt.ts` | **Area:** Task decomposition and multi-file coordination section

The PM prompt must explicitly guide the agent to decompose complex tasks spanning multiple file types (Liquid, CSS, JS) into sequential tool calls. For tasks with cross-file dependencies, the prompt should outline: (1) read all target files first to understand current structure, (2) identify dependency points (variant data, metafield references), (3) plan edits in dependency order, (4) call run_specialist for each file with explicit context about other files' changes.

```
Add explicit instruction block: 'For tasks requiring changes to multiple files (Liquid, CSS, JS): (1) Always read all target files first via read_lines to map current structure and cross-file dependencies. (2) Identify data flow: which file provides data (JS), which consumes it (Liquid), which styles it (CSS). (3) Plan edit sequence respecting dependencies. (4) For each file, call run_specialist with full context of changes to other files. (5) Use grep_content to verify integration points exist before editing.'
```

### [CRITICAL] Add explicit stagnation detection and recovery for zero-tool runs
**Category:** coordinator | **File:** `lib/agents/coordinator-v2.ts` | **Area:** Main loop iteration tracking and termination logic

Coordinator must detect when an iteration completes with zero tool invocations and no error, which indicates either a prompt failure or policy over-rejection. Current behavior silently completes with no work done. Add a gate that: (1) tracks consecutive iterations with zero tool calls, (2) after 2-3 such iterations, forces a strategy shift (e.g., SIMPLE→HYBRID or HYBRID→GOD_MODE), (3) logs this as a coordinator-level alert, (4) optionally re-prompts with simplified instructions.

```
After each iteration, check: if (toolsInvokedThisIteration === 0 && noErrorsReported && iterationCount > 1) { consecutiveZeroToolIterations++; if (consecutiveZeroToolIterations >= 2) { escalateStrategy(); logAlert('Zero-tool stagnation detected'); } } This prevents silent failures on complex tasks.
```

### [CRITICAL] Add pre-execution diagnostics and early-exit logging
**Category:** coordinator | **File:** `lib/agents/coordinator-v2.ts` | **Area:** Main loop initialization and validation gates (lines ~50-150)

The coordinator-v2 loop must log state before attempting the first think step. If no tool calls occur, capture: (1) strategy selected, (2) context size, (3) validation gate failures, (4) model response shape. Add explicit logging at loop entry, after strategy selection, after context build, and after each validation gate.

```
```typescript
const strategy = selectStrategy(tier);
logger.info(`[Coordinator] Strategy selected: ${strategy}`, { tier, contextSize: context.length });

const validated = orchestrationPolicy.validate(context, strategy);
if (!validated.pass) {
  logger.error(`[Coordinator] Validation gate failed`, { gate: validated.gate, reason: validated.reason });
  return { success: false, reason: validated.reason, toolCalls: [] };
}

logger.info(`[Coordinator] Starting main loop`, { maxIterations: 80, strategy });
// ... loop body with iteration logging
```
```

### [CRITICAL] Ensure scout/theme-map produces file targets for 3-layer tasks
**Category:** context | **File:** `lib/agents/scout/structural-scout.ts` | **Area:** File targeting logic for pattern-based queries (lines ~80-150)

For multi-file tasks (Liquid + CSS + JS), scout must identify all three files. If theme-map lookup fails or scout returns empty targets, the PM prompt receives no file context and cannot generate tool calls. Verify scout is called with correct file patterns for product-form-dynamic.*

```
```typescript
const filePatterns = [
  'snippets/product-form-dynamic.liquid',
  'assets/product-form-dynamic.css',
  'assets/product-form-dynamic.js'
];

const targets = await themeMap.lookup(filePatterns);
if (targets.length === 0) {
  logger.warn(`[Scout] No files found for patterns`, { patterns: filePatterns });
  // Fallback: programmatic scan for product-form-dynamic
  const fallback = await scanFilesystem('product-form-dynamic');
  return fallback.length > 0 ? fallback : [];
}
return targets;
```
```

### [CRITICAL] Add multi-layer task decomposition to PM prompt
**Category:** prompt | **File:** `lib/agents/prompts/v2-pm-prompt.ts` | **Area:** Task interpretation and tool planning section (lines ~100-200)

The PM prompt must recognize 3-layer tasks (Liquid + CSS + JS) and explicitly plan tool calls for each layer. Current prompt may not have instructions for coordinating edits across multiple file types. Add a section that: (1) identifies layer count, (2) reads all files first, (3) plans edits per layer, (4) executes in dependency order.

```
```typescript
const multiLayerPrompt = `
## Multi-Layer Task Strategy
If the task involves multiple file types (Liquid + CSS + JS), follow this pattern:
1. Use read_lines to load ALL three files first
2. Analyze cross-layer dependencies (e.g., CSS classes used in Liquid)
3. Plan edits per layer in a single thinking block
4. Execute edits in order: Liquid → CSS → JS
5. Use run_specialist for complex logic (variant filtering, metafield exclusion)

Example for product-form-dynamic:
- Read snippets/product-form-dynamic.liquid (markup layer)
- Read assets/product-form-dynamic.css (style layer)
- Read assets/product-form-dynamic.js (behavior layer)
- Plan: Add data attribute in Liquid, add CSS rule, add JS handler
`;
// Inject into system prompt before tool definitions
```
```

### [HIGH] Audit orchestration policy gates for over-rejection on multi-file tasks
**Category:** validation | **File:** `lib/agents/orchestration-policy.ts` | **Area:** Context gates and validation rules for tool execution

Orchestration policy may be rejecting multi-file edits due to overly conservative validation rules. The scenario requires edits to 3 files with shared context (variant data, metafield exclusion). If policy gates require each edit to be independently justified without cross-file context, they will block valid coordinated changes. Audit and relax gates for tasks explicitly marked as multi-file coordinated work.

```
Add a multi-file coordination mode: if task description explicitly references multiple files (e.g., 'Implement all three layers: Liquid, CSS, JS'), set a flag that relaxes per-file validation and instead validates the coordinated edit plan as a whole. Allow run_specialist calls for each file without requiring independent full justification for each.
```

### [HIGH] Pre-populate context with target file list and structure scout
**Category:** context | **File:** `lib/agents/scout/structural-scout.ts` | **Area:** Scout brief generation for multi-file scenarios

For multi-file tasks, the agent should begin with a scout pass that reads all target files' structures (first 20 lines, grep key patterns). Currently, agent must discover file locations and structure through trial. For this scenario, scout should immediately identify: snippets/product-form-dynamic.liquid (Liquid structure), assets/product-form-dynamic.css (CSS selectors), assets/product-form-dynamic.js (JS functions). This context should be baked into the initial coordinator context before PM thinking begins.

```
When task mentions multiple file types or 'all three layers', automatically run scout on all identified file paths and include in PM context: file structure summary, current key patterns (e.g., CSS class names, JS function names, Liquid variable references). This gives PM immediate visibility into integration points.
```

### [HIGH] Add explicit 'plan_edit_sequence' tool for complex multi-file tasks
**Category:** tools | **File:** `lib/agents/tools/v2-tool-definitions.ts` | **Area:** Tool schema definitions

For tasks requiring coordinated edits across multiple files, agent lacks a tool to explicitly plan and validate the edit sequence before execution. Add a tool that accepts task description + file list, returns a structured plan showing: (1) read order, (2) dependency graph, (3) edit sequence, (4) integration points to verify. PM can use this to validate its decomposition before calling run_specialist.

```
Add tool: 'plan_edit_sequence': { description: 'For multi-file coordinated tasks, generate and validate edit plan', input: { task, files: [path], dependencies: [string] }, output: { readOrder: [path], editSequence: [{ file, changes, rationale }], integrationPoints: [{ file1, file2, checkPoint }] } }. Call this before run_specialist for complex scenarios.
```

### [HIGH] Relax validation gates for multi-file Shopify theme tasks
**Category:** validation | **File:** `lib/agents/orchestration-policy.ts` | **Area:** Validation rules for file count and context size (lines ~50-100)

Orchestration policy may be rejecting 3-layer tasks due to context size or complexity thresholds. Theme modifications legitimately require reading multiple files. Adjust policy to allow multi-file reads for theme-related tasks and increase context budgets for Shopify domain.

```
```typescript
const validateContext = (context, task) => {
  // Allow up to 5 files for Shopify theme tasks
  if (task.domain === 'shopify' && task.type === 'theme-modification') {
    if (context.fileCount > 5) return { pass: false, gate: 'file_count' };
  } else {
    if (context.fileCount > 3) return { pass: false, gate: 'file_count' };
  }
  // Increase context budget for multi-layer tasks
  const contextBudget = task.layers ? task.layers * 8000 : 5000;
  if (context.tokenEstimate > contextBudget) return { pass: false, gate: 'context_size' };
  return { pass: true };
};
```
```

### [HIGH] Add explicit multi-file read tool or batch read capability
**Category:** tools | **File:** `lib/agents/tools/v2-tool-definitions.ts` | **Area:** Tool schema definitions (lines ~1-50)

PM prompt should have a tool to read multiple files in one call (e.g., read_lines with array input). Currently, reading 3 files requires 3 separate calls. A batch read tool would reduce iteration count and make multi-file tasks more efficient.

```
```typescript
const readMultipleFilesTool = {
  name: 'read_multiple_files',
  description: 'Read multiple files in a single call for multi-layer tasks',
  inputSchema: {
    type: 'object',
    properties: {
      files: {
        type: 'array',
        items: { type: 'string' },
        description: 'Array of file paths to read'
      },
      maxLines: { type: 'number', description: 'Max lines per file' }
    },
    required: ['files']
  }
};
// Add to tool definitions export
```
```

### [HIGH] Upgrade strategy selection for multi-layer Shopify tasks
**Category:** strategy | **File:** `lib/agents/strategy.ts` | **Area:** Strategy selection logic (lines ~30-80)

Strategy selection may default to SIMPLE for this task, which limits tool availability. Multi-layer theme tasks should trigger HYBRID or GOD_MODE to enable specialist calls and cross-file validation. Add heuristic: if task mentions 3+ file types or layers, force HYBRID minimum.

```
```typescript
const selectStrategy = (tier, task) => {
  // Detect multi-layer tasks
  const layerCount = (task.description.match(/liquid|css|js|json/gi) || []).length;
  const isMultiLayer = layerCount >= 3 || task.layers >= 3;
  
  if (isMultiLayer) {
    return tier >= 2 ? 'HYBRID' : 'SIMPLE'; // Upgrade SIMPLE to HYBRID for multi-layer
  }
  
  if (tier === 'free') return 'SIMPLE';
  if (tier === 'pro') return 'HYBRID';
  if (tier === 'enterprise') return 'GOD_MODE';
  return 'SIMPLE';
};
```
```

### [HIGH] Add Shopify-specific domain knowledge for variant/metafield logic
**Category:** prompt | **File:** `lib/agents/prompts/v2-pm-prompt.ts` | **Area:** Shopify domain knowledge section (lines ~300-400)

The task requires filtering variants by option1 availability and excluding lengths in custom_values metafield. PM prompt must have explicit knowledge of: (1) how variant options work, (2) how metafields are accessed in Liquid/JS, (3) how to safely parse variant data. Add a Shopify reference section to the prompt.

```
```typescript
const shopifyKnowledge = `
## Shopify Variant & Metafield Patterns

### Variant Data Access
- Liquid: product.variants[].option1, product.variants[].available
- JS: window.Shopify.Product.variants array
- Filter available: variants.filter(v => v.available && v.option1 === colorName)

### Metafield Access
- Liquid: product.metafields.custom.custom_values.value (JSON string)
- JS: product.metafields.custom_values (if exposed in product data)
- Parse: JSON.parse(metafieldValue) to get array of excluded lengths

### Swatch + Text Overlay Pattern
- CSS: Use background-color with rgba for opacity over image
- Calculate contrast: if background is dark, use light text; if light, use dark text
- Use CSS filter or mix-blend-mode for text readability
`;
```
```

### [MEDIUM] Add explicit Shopify Liquid + JS integration patterns to PM knowledge
**Category:** prompt | **File:** `lib/agents/prompts/v2-pm-prompt.ts` | **Area:** Shopify knowledge and integration patterns section

Scenario requires understanding of Shopify variant data flow (JS reads variant availability, Liquid consumes it, CSS styles result). PM prompt should include concrete patterns for: (1) variant option access in JS (product.variants, option_values), (2) Liquid variable passing from included snippets, (3) CSS class naming conventions for dynamic content. This reduces agent's need to infer integration patterns.

```
Add section: 'Shopify Multi-File Integration Patterns: (1) Variant Data Flow: JS reads product.variants and option_values, passes via data-* attributes to Liquid. Liquid accesses via {{ product.variants }} or passed variables. (2) Liquid-JS Sync: Use data-* attributes and JSON in script tags for bidirectional sync. (3) CSS: Use BEM naming for dynamic classes added by JS. (4) Metafield Access: In Liquid use {{ product.metafields.namespace.key }}, in JS via product.metafields or AJAX.'
```

### [MEDIUM] Default to HYBRID or GOD_MODE for multi-file coordinated tasks
**Category:** strategy | **File:** `lib/agents/strategy.ts` | **Area:** Strategy selection logic based on task characteristics

Current strategy selection may default to SIMPLE for tasks that require HYBRID or higher. Multi-file coordinated work with cross-file dependencies (like this scenario) should never use SIMPLE strategy, which lacks run_review and context building. Adjust strategy router to detect multi-file indicators and escalate.

```
Add heuristic: if (taskDescription.includes('all three') || taskDescription.includes('layers') || files.length >= 3 || mentionsCrossDependencies) { minStrategy = HYBRID; } This ensures complex tasks get adequate tool access.
```

### [MEDIUM] Add iteration 0 validation: confirm PM received valid task before main loop
**Category:** coordinator | **File:** `lib/agents/coordinator-v2.ts` | **Area:** Initialization and pre-loop validation

Before entering main loop, coordinator should do a quick validation: does the task description parse as valid? Are file paths resolvable? Is the task within scope? If validation fails, fail fast with clear error rather than silently iterating to zero tools.

```
Add pre-loop checks: (1) parse task for file references and verify paths exist, (2) check task complexity vs strategy tier, (3) validate PM can access required tools for strategy. If checks fail, return early with diagnostic error rather than entering loop.
```

### [MEDIUM] Add stagnation detection and recovery for multi-iteration tasks
**Category:** coordinator | **File:** `lib/agents/coordinator-v2.ts` | **Area:** Main loop iteration tracking (lines ~200-250)

If the agent enters the loop but makes no progress after 5 iterations, it should log stagnation and attempt recovery (e.g., retry with different strategy, simplify task). Current code may silently timeout.

```
```typescript
let successfulToolCalls = 0;
for (let i = 0; i < 80; i++) {
  const beforeCount = successfulToolCalls;
  // ... think, tool, observe cycle
  if (successfulToolCalls === beforeCount && i > 5) {
    logger.warn(`[Coordinator] Stagnation detected at iteration ${i}`);
    if (strategy === 'SIMPLE') {
      logger.info(`[Coordinator] Upgrading to HYBRID to recover`);
      strategy = 'HYBRID';
    } else {
      logger.error(`[Coordinator] Stagnation unrecoverable, exiting`);
      break;
    }
  }
}
```
```

### [MEDIUM] Verify theme-map cache is populated and query is correct
**Category:** context | **File:** `lib/agents/theme-map/cache.ts` | **Area:** Cache initialization and lookup (lines ~1-50)

If theme-map cache is empty or stale, scout will return no files. Ensure cache is built at startup and includes product-form-dynamic.* entries. Add a health check to coordinator.

```
```typescript
const initializeCache = async (themeDir) => {
  const files = await scanTheme(themeDir);
  const cache = {};
  files.forEach(f => {
    const key = f.replace(/.*\//g, ''); // e.g., 'product-form-dynamic.liquid'
    if (!cache[key]) cache[key] = [];
    cache[key].push(f);
  });
  logger.info(`[ThemeMap] Cache initialized`, { fileCount: files.length, uniqueNames: Object.keys(cache).length });
  if (cache['product-form-dynamic.liquid'] === undefined) {
    logger.warn(`[ThemeMap] product-form-dynamic files not found in theme`);
  }
  return cache;
};
```
```

## Per-Run Details
### Run 1 — FAIL
**Reason:** No done event — stream may have errored
**Tier:** unknown | **Strategy:** unknown
**Tools:** 0 (0 edits, 0 reads, 0 searches)

**Diagnosis:** Agent executed zero tool calls and made zero file changes despite a complex multi-layer Shopify theme modification request. The agent entered the loop but never invoked any read, edit, grep, or specialist tools. No reasoning blocks were captured, indicating the agent either failed to initialize properly, rejected the task at a validation gate, or exited prematurely without attempting work.

**Tool Sequence:**
