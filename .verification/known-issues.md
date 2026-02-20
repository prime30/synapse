# Known Issues — Non-Blocking

## NOT_WIRED Components (exist but not connected)

### HIGH PRIORITY — Should wire before next release

1. **Extended Tool Cards** (FileSearchCard, GrepResultCard, LintResultCard, FilePreviewCard)
   - Components exist in `components/ai-sidebar/` with full implementation
   - NOT imported or rendered in ChatInterface.tsx or ToolActionItem.tsx
   - ContentBlock type in ChatInterface does not include their event types
   - **Fix**: Add import + render logic for these card types in ChatInterface.tsx, add corresponding SSE event types

### MEDIUM PRIORITY — Wire when feature is needed

2. **FlowCanvas** (`components/editor/FlowCanvas.tsx`)
   - Component exists with @xyflow/react integration
   - Not mounted in any route
   - **Fix**: Add route or tab in project page (e.g., `/projects/[projectId]/design-system`)

3. **useOfflineQueue** (`hooks/useOfflineQueue.ts`)
   - Hook exists with full queue implementation
   - Not imported or used anywhere
   - **Fix**: Wire into project page or file operations for offline support

## PARTIAL Items

4. **Live Editing Breakout** — Coordinator tracks affectedFiles internally but may not emit them in SSE thinking events. The breakout panel check in AgentPromptPanel relies on `metadata.affectedFiles` in thinking events.

5. **Auth Flow** — Uses server-side route guards (middleware.ts) instead of client-side useRequireAuth. This is functionally correct and arguably more secure, but differs from the expected pattern.

6. **Dark Mode** — Custom useTheme implementation using localStorage + useSyncExternalStore instead of next-themes. Works correctly but is non-standard.

## Data Gaps

7. **Benchmarks Page** — Synapse V2 metrics are placeholder/zero. Need real benchmark data after V2 stabilizes.

8. **V2 Agent** — Behind feature flag (ENABLE_V2_AGENT=false). Pipeline 3 test confirms it is not production-ready yet. Has graceful fallback to V1.

## Pre-Existing Warnings

9. **ESLint Warnings (173)** — Mostly unused variables in test files and React Compiler hints (setState-in-effect, purity, refs-in-render). These are non-blocking and can be cleaned up incrementally.

10. **Live Integration Tests** — cursor-vs-synapse-live.test.ts takes 10+ minutes with real API calls. Stream timeouts occur intermittently. Not blocking but should be optimized.
