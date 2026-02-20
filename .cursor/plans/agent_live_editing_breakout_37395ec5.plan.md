---
name: Agent live editing breakout
overview: When agents identify files to work on, auto-open those tabs and scroll to the relevant code section; add a design-system-compliant floating breakout viewer that shows live edits with the active agent indicated and colored by agent type.
todos:
  - id: backend-metadata
    content: "Emit affectedFiles and agentType in coordinator thinking/worker_progress metadata when phase is executing"
    status: completed
  - id: editor-reveal
    content: "Expose revealLine(line) on MonacoEditor and FileEditorHandle; wire from page with timing guard when active file matches edited file"
    status: completed
  - id: diff-util
    content: "Add getFirstChangedLineRange(original, newContent) util and use on propose_code_edit to compute scroll target"
    status: completed
  - id: auto-open
    content: "Page handleOpenFiles(paths); AgentPromptPanel on thinking metadata.affectedFiles call onOpenFiles; throttle/debounce; skip when empty or resolve fails"
    status: completed
  - id: auto-scroll
    content: "On propose_code_edit pass scroll target to page; call revealLine after file is open (delay or effect when activeFileId matches)"
    status: completed
  - id: agent-colors
    content: "Centralize agent color map in lib/agents/agent-colors.ts with dark variants; reuse in ThinkingBlock, ContextMeter, Breakout"
    status: completed
  - id: breakout-component
    content: "Build AgentLiveBreakout (floating panel, ide-* classes, z-overlay, agent header+border, live code); integrate state from AgentPromptPanel/page"
    status: completed
  - id: polish
    content: "Optional main-editor line decoration with agent color; persist breakout position/size; a11y (keyboard close, focus trap)"
    status: completed
isProject: false
---

# Agent Live Editing Breakout (Refined)

## Goal

- When the agent identifies which files to work with, **open those tabs automatically** and **auto-scroll** the editor to the code section being edited.
- Show **live editing** in a **breakout viewer** (floating panel) that indicates **which agent** is working and uses the **agent's color**; all UI **compliant with the design system** (ide-* tokens, dark mode, no hardcoded chrome colors).

## Design System Compliance (Pass 3)

All new or changed UI **must** follow [app/globals.css](app/globals.css) and [lib/tailwind/polish.css](lib/tailwind/polish.css):

- **Surfaces**: `ide-surface`, `ide-surface-panel`, `ide-surface-pop` for backgrounds (never raw hex for chrome).
- **Borders**: `ide-border` or `border-stone-200 dark:border-white/10` (always pair light/dark).
- **Typography**: `ide-text` (primary), `ide-text-2` / `ide-text-3` (secondary), or `text-stone-900 dark:text-white` and `text-stone-600 dark:text-gray-400`.
- **Accent**: Use `#28CD56` (--color-accent) only for primary CTAs; sky for interactive highlights; agent semantic colors (amber, emerald, etc.) with **dark: variants** where custom.
- **Floating panel**: Reference [UndoToast](components/ui/UndoToast.tsx) — `fixed bottom-4 right-4`, `z-[var(--z-modal)]` or `z-50`, `rounded-lg`, `ide-border`, `ide-surface-pop`, `shadow-xl`.
- **Z-index**: Breakout uses `--z-modal` (40) or `--z-overlay` (30) so it sits above editor; avoid arbitrary z without design token.
- **Glass**: If breakout uses glass, use `GlassCard` with `theme="light"` or `glass-light` / `glass-dark` from globals.

---

## Current State

- **Thinking events**: Coordinator emits `phase: 'executing'` with `label` (e.g. "liquid agent"); `phase: 'change_ready'` has `metadata: { agentType, changeCount }`. **affectedFiles** are not yet in the event payload.
- **File opening**: Page has `handleOpenFile(filePath)`; no batch open from agent events.
- **Scroll**: MonacoEditor uses `revealLine` internally; FileEditorHandle exposes only `save`/`cancel`.
- **Live edits**: `propose_code_edit` sends `filePath`, `newContent`; `onLiveChange` exists; no breakout UI.
- **Agent colors**: Defined in ThinkingBlock and ContextMeter; no single source of truth with dark variants.

---

## 1. Backend: Emit affected files in thinking events

**File:** [lib/agents/coordinator.ts](lib/agents/coordinator.ts)

- When calling `onProgress` for `phase: 'executing'` (single delegation), add to **metadata**: `affectedFiles: delegation.affectedFiles`, `agentType: delegation.agent`.
- When emitting `worker_progress` with `status: 'running'`, include **metadata**: `affectedFiles: delegations[idx].affectedFiles`, `agentType: delegations[idx].agent` so the client can open tabs per specialist.
- Ensure `ThinkingEvent.metadata` is documented or typed to include `affectedFiles?: string[]` and `agentType?: string`.

**Acceptance criteria:** For any SSE event with `phase: 'executing'` or `type: 'worker_progress'` and status `running`, the payload includes `metadata.affectedFiles` (array of file paths/names) and `metadata.agentType` when applicable.

---

## 2. Frontend: Auto-open tabs when agent identifies files

**File:** [app/projects/[projectId]/page.tsx](app/projects/[projectId]/page.tsx)

- Add **handleOpenFiles(paths: string[])**:
  - Resolve each path with `resolveFileId(path, rawFiles)`.
  - Collect all resolved fileIds (skip nulls).
  - If non-empty, call `tabs.openMultiple(fileIds)`; optionally set active tab to first.
- Pass this callback into the agent chat panel (e.g. `onOpenFiles`).

**File:** [components/features/agents/AgentPromptPanel.tsx](components/features/agents/AgentPromptPanel.tsx)

- In the SSE handler, when processing a **thinking** event with `metadata?.affectedFiles` (array):
  - **Guard**: If `affectedFiles` is empty or missing, skip.
  - Call `onOpenFiles?.(metadata.affectedFiles)` (throttle or debounce: e.g. once per phase 'executing' per request, or at most every 500ms).
- Optional: also trigger on **worker_progress** with metadata.affectedFiles when status is `running`.

**Edge cases:** If path does not resolve to a fileId, skip that path (no-op). Do not open tabs when the stream has finished (e.g. phase 'complete') to avoid redundant opens.

**Acceptance criteria:** When the coordinator sends a thinking event with `metadata.affectedFiles` and at least one path, the UI opens tabs for all resolved files that are not already open; unresolved paths are skipped without error.

---

## 3. Editor: Expose scroll-to-line (revealLine)

**File:** [components/editor/MonacoEditor.tsx](components/editor/MonacoEditor.tsx)

- Expose **revealLine(lineNumber: number)** to the parent: either via a ref (e.g. `useImperativeHandle` with `revealLine`) or by calling a prop (e.g. `onEditorMount` passes the instance so the parent can call `editor.revealLineInCenter(line)`).
- Prefer **ref** so the contract is `editorRef.current.revealLine(line)`.

**File:** [components/features/file-management/FileEditor.tsx](components/features/file-management/FileEditor.tsx)

- Extend **FileEditorHandle** with `revealLine(lineNumber: number): void`.
- Store a ref to the Monaco editor instance (from MonacoEditor’s callback or ref). In `useImperativeHandle`, implement `revealLine` by calling that instance’s `revealLine` / `revealLineInCenter`; **no-op if the ref is null** (editor not mounted).

**File:** [app/projects/[projectId]/page.tsx](app/projects/[projectId]/page.tsx)

- When the agent chat reports a file edit with a target line (see §4), **after** the file is open and the editor shows that file: call `editorRef.current?.revealLine?.(line)`. Use a short delay (e.g. requestAnimationFrame or 100ms) or an effect that runs when `activeFileId === editedFileId` to avoid calling before the editor has mounted that file.

**Acceptance criteria:** When a propose_code_edit is applied and a scroll target line is provided, the main editor scrolls to that line for the edited file; if the editor is not showing that file or is not mounted, the call is a no-op and does not throw.

---

## 4. Compute target line for scroll (diff-based)

**New util:** e.g. [lib/ai/diff-utils.ts](lib/ai/diff-utils.ts) or [lib/versions/scroll-target.ts](lib/versions/scroll-target.ts)

- **Function:** `getFirstChangedLineRange(originalContent: string, newContent: string): { startLine: number; endLine?: number } | null`.
- Use the existing `diff` package (e.g. `createTwoFilesPatch` or `diffLines`) to find the first hunk and map it to a line number in the **new** content. Return `startLine` (1-based) and optionally `endLine`.
- Return **null** if content is identical or diff parsing fails (caller will fall back to line 1 or no scroll).

**File:** [components/features/agents/AgentPromptPanel.tsx](components/features/agents/AgentPromptPanel.tsx)

- When handling **propose_code_edit**: compute `getFirstChangedLineRange(originalContent, newContent)`. Pass the result (filePath + startLine) to the page via a callback (e.g. `onScrollToEdit?.(filePath, startLine)`).

**Acceptance criteria:** For a non-identical edit, the util returns the 1-based start line of the first changed region; otherwise null. The panel invokes the scroll callback with that line when propose_code_edit is processed.

---

## 5. Breakout “video player” component (live editing + agent indicator)

**New component:** [components/features/agents/AgentLiveBreakout.tsx](components/features/agents/AgentLiveBreakout.tsx)

- **Visibility:** Shown when there is an active agent (e.g. phase 'executing' or we have a recent propose_code_edit in code/debug mode). Can be toggled or auto-shown on first propose_code_edit; **minimize** option (collapse to a small pill) instead of only close.
- **Layout:** Floating panel, PiP-style (e.g. bottom-right), **draggable** and optionally resizable. Use **design system**:
  - Container: `ide-surface-panel`, `ide-border`, `rounded-lg`, `shadow-xl`, `z-[var(--z-modal)]` or equivalent.
  - Title bar: `ide-text` for “Liquid agent” (or current agent), `ide-text-3` for file name; left border or strip using **agent color** (from shared map) with **dark: variant** for the strip.
- **Content:** Show the **file currently being edited** (last propose_code_edit or first of opened affected files). Read-only code view (e.g. `<pre>` with syntax highlighting or a small read-only Monaco) that updates when live content is pushed for that file.
- **State:** Parent passes: `currentAgentType`, `currentFilePath`, `liveContent`, `agentColor` (from shared map), `onClose` / `onMinimize`. When agent completes or user closes, hide or minimize.

**Design system checklist for AgentLiveBreakout:**

- Background: `ide-surface-panel` (or `ide-surface-pop`).
- Border: `ide-border` (or `border-stone-200 dark:border-white/10`).
- Text: `ide-text` (title), `ide-text-2` or `ide-text-3` (file path, secondary).
- Agent accent: Use centralized agent color map; ensure each entry has a `dark:` variant (e.g. border/background strip).
- No hardcoded `#hex` for panel chrome; use CSS variables or ide-* / Tailwind theme colors only.

**Integration:** AgentPromptPanel or project page holds state for `currentAgent`, `currentLiveFile`, `liveContent`. On thinking with phase 'executing' and metadata.agentType + metadata.affectedFiles, set current agent and optionally first affected file. On propose_code_edit, set current file and push content to breakout; onLiveChange updates content. Render AgentLiveBreakout with that state and design-system-compliant props.

**Acceptance criteria:** Breakout appears when an agent is executing/editing; shows agent label and file name; live-updating code; border/title use agent color with dark mode; panel uses only ide-* / design tokens; can be closed or minimized.

---

## 6. Agent-colored code highlight and shared color map

**New file:** [lib/agents/agent-colors.ts](lib/agents/agent-colors.ts)

- Export **AGENT_COLORS**: `Record<string, { border: string; bg: string; text: string }>` (Tailwind class names). Include **dark: variants** for each agent (e.g. `border-amber-300 dark:border-amber-600`, `bg-amber-50 dark:bg-amber-950`). Keys: `project_manager`, `liquid`, `javascript`, `css`, `json`, `review`.
- Import this in [ThinkingBlock.tsx](components/ai-sidebar/ThinkingBlock.tsx), [ContextMeter.tsx](components/ai-sidebar/ContextMeter.tsx), and AgentLiveBreakout so all UIs stay consistent.

**Breakout:** Use agent color for the panel’s **left border or title strip** and optional header background tint only; no need to color individual code lines in the breakout.

**Main editor (optional):** When the main FileEditor is showing the file currently being edited, add a Monaco decoration (e.g. line highlight or margin) for the changed line range using the agent color (via CSS class that reads a variable set from agent-colors). Lower priority than the breakout.

---

## 7. Future phases (not in scope for this plan)

- **Persist breakout position/size** in localStorage.
- **Multiple breakouts** (one per agent) if product demands it.
- **Accessibility:** Keyboard shortcut to close breakout, focus trap when breakout is open, aria-label and role.
- **Optional startLine/endLine** in propose_code_edit from the model to avoid client-side diff for scroll target.

---

## Implementation order

1. **Backend:** Coordinator – add affectedFiles and agentType to thinking/worker_progress metadata.
2. **Agent colors:** Add lib/agents/agent-colors.ts with dark variants; refactor ThinkingBlock/ContextMeter to use it.
3. **Editor API:** MonacoEditor + FileEditor – expose revealLine with no-op when unmounted; page wires callback and timing.
4. **Diff util:** getFirstChangedLineRange(original, newContent); use in AgentPromptPanel on propose_code_edit.
5. **Auto-open:** Page – handleOpenFiles(paths); AgentPromptPanel – on thinking metadata.affectedFiles (guards + throttle).
6. **Auto-scroll:** Pass scroll target from propose_code_edit to page; call revealLine when active file matches edited file (with delay/effect).
7. **Breakout:** Build AgentLiveBreakout (design-system compliant); integrate state and live content.
8. **Polish:** Optional main-editor line decoration; persist position; a11y.

---

## Files to add

- `lib/ai/diff-utils.ts` (or `lib/versions/scroll-target.ts`) – getFirstChangedLineRange.
- `lib/agents/agent-colors.ts` – shared agent color map with dark variants.
- `components/features/agents/AgentLiveBreakout.tsx` – floating live-editing panel (ide-*, z-modal, agent strip).

## Files to modify

- [lib/agents/coordinator.ts](lib/agents/coordinator.ts) – emit affectedFiles and agentType in executing/worker_progress.
- [components/editor/MonacoEditor.tsx](components/editor/MonacoEditor.tsx) – expose revealLine (ref or callback).
- [components/features/file-management/FileEditor.tsx](components/features/file-management/FileEditor.tsx) – FileEditorHandle.revealLine.
- [app/projects/[projectId]/page.tsx](app/projects/[projectId]/page.tsx) – handleOpenFiles, wire revealLine and breakout state.
- [components/features/agents/AgentPromptPanel.tsx](components/features/agents/AgentPromptPanel.tsx) – handle metadata.affectedFiles (onOpenFiles with guards), propose_code_edit → scroll target + breakout state.
- [components/ai-sidebar/ThinkingBlock.tsx](components/ai-sidebar/ThinkingBlock.tsx), [ContextMeter.tsx](components/ai-sidebar/ContextMeter.tsx) – import shared agent-colors (optional refactor).

---

## Acceptance criteria (summary)

- When the coordinator sends a thinking event with `metadata.affectedFiles`, the UI **opens those files in tabs** (resolved paths only; no-op for empty or unresolved).
- When a propose_code_edit is streamed, the **main editor scrolls to the first changed line** for that file (with safe timing and no-op when editor not ready).
- A **floating breakout panel** appears during agent execution/editing, shows **live-updating code** and **agent label + colored strip**, and uses **only design-system tokens** (ide-*, dark: pairs, no hardcoded chrome).
- **Agent colors** are consistent and have dark variants (single source of truth in agent-colors.ts).
