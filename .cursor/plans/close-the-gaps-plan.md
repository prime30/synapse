# Close the Gaps — Capability Matrix Planned Items

Plan to deliver every **Planned** item from the benchmarks capability matrix so Synapse matches or exceeds Cursor for Shopify theme editing. Each item below is a gap we committed to closing (see `app/(marketing)/benchmarks/client.tsx` → Capability Matrix, “Editor & workflow (Cursor today — we’re closing the gap)”).

**Source:** This plan is the single place that tracks all matrix “Planned” items. Update the matrix when an item ships.

---

## 1. Planned Items (from matrix)

| # | Capability | Status |
|---|------------|--------|
| 1 | Inline completions (Tab / ghost text) | Shipped |
| 2 | Codebase semantic search (@codebase) | Shipped |
| 3 | Scoped apply & post-apply validation | Shipped |
| 4 | Run terminal commands in-agent | Shipped |
| 5 | Checkpoints / in-session revert | Shipped |
| 6 | Full desktop IDE (VS Code, extensions, debugger) | Shipped |
| 7 | Local theme dev server in same window | Shipped |

---

## 2. Per-item goals and approach

### 1. Inline completions (Tab / ghost text)

**Goal:** As the user types in Monaco, show grey ghost text suggesting the next few lines or completion; Tab accepts, Esc rejects.

**Approach:** Use Monaco `InlineCompletionsProvider`; back it with an API that calls a fast model (Haiku or Gemini Flash) with current file + cursor prefix/suffix. Debounce and cancel on typing. Single-file context first for latency.

**Existing plan:** `.cursor/plans/cursor-like-features-plan.md` → **Track A**.

**Deliverables:**
- `lib/monaco/inline-completion-provider.ts` — provider that calls API and returns `InlineCompletions`
- `app/api/ai/complete-inline/route.ts` — accepts `{ fileContent, path, language, prefix, suffix }`, returns `{ completion }`
- Wire provider in `MonacoEditor` for `liquid` (and optionally `javascript`, `css`)
- Settings: enable/disable, debounce

**Key files:** `components/editor/MonacoEditor.tsx`, `lib/ai/context-engine.ts` (optional context summary later)

---

### 2. Codebase semantic search (@codebase)

**Goal:** Agents and (optionally) inline completions get “relevant files” via semantic search, not only keyword/pattern/dependency graph.

**Approach:** Add embedding-based retrieval (e.g. Supabase pgvector or small embedding API). Index file chunks; query for “similar code” or “relevant sections”; feed into context assembly and optionally into complete-inline API.

**Existing plan:** `.cursor/plans/cursor-like-features-plan.md` → **Track C**.

**Deliverables:**
- `lib/ai/codebase-embeddings.ts` (or equivalent) — index file chunks, query by embedding
- API route for “semantic search in project” (used by agent context and/or completions)
- Integrate into `lib/ai/context-engine.ts` or agent context assembly so chat/composer can pull @codebase-style context
- Optional: pass short “related files” summary into complete-inline for Track A

**Key files:** `lib/ai/context-engine.ts`, `lib/ai/vector-store.ts` (if exists), agent stream route

---

### 3. Scoped apply & post-apply validation

**Goal:** When the AI suggests a small edit, apply only the changed region when possible; after any apply, run validation and surface errors (with optional Undo).

**Approach:** Support optional `range?: { startLine, endLine }` (or offsets) in Apply payload; `handleApplyCode` replaces only that span when provided. After apply, run Liquid/JS/CSS diagnostics on the modified file; show warning/toast and optionally offer Undo or Edit.

**Existing plan:** `.cursor/plans/cursor-like-features-plan.md` → **Track B**.

**Deliverables:**
- Apply payload and API support `range` for scoped replace
- `handleApplyCode` (and API) replace span when range is present; full-file replace remains default
- Post-apply hook: run diagnostics on modified file; surface result in UI (toast / inline)
- Agent prompt guidance: “when suggesting a small edit, output the range to replace if possible”

**Key files:** `components/ai-sidebar/ChatInterface.tsx` (or wherever Apply is handled), `lib/agents/tools/diagnostics-tool.ts`, file editor apply logic

---

### 4. Run terminal commands in-agent

**Goal:** Allow the agent to run terminal commands (e.g. `shopify theme dev`, `npm run build`, `theme check`) in a controlled way so users get “run this in your repo” behavior without leaving Synapse.

**Approach:** Define a **sandboxed command execution** path: e.g. allowlist of commands (or command patterns) the agent can request; execution runs in a project-scoped environment (e.g. server-side job or a trusted runner). Return stdout/stderr to the agent. No arbitrary shell in the browser.

**Deliverables:**
- Allowlist of permitted commands (e.g. `shopify theme *`, `npm run *`, `npx theme-check *`) and a way to extend it
- API route or job runner that executes a single command in project context and returns output
- New agent tool (e.g. `run_command`) that takes command + args; backend validates against allowlist and runs; result streamed back into agent context
- UI: show “Agent ran: shopify theme dev” and output in chat or a collapsible block

**Key files:** New: `lib/agents/tools/run-command.ts`, `app/api/projects/[projectId]/run-command/route.ts` (or similar). Agent tool definitions and executor.

**Risks:** Security and resource limits (timeout, memory). Start with a narrow allowlist and optional feature flag.

---

### 5. Checkpoints / in-session revert

**Goal:** User can create a “checkpoint” during an agent session and revert to it (e.g. “undo all changes since this point”) without leaving the session.

**Approach:** Persist a snapshot of affected files (or deltas) at checkpoint time; “revert to checkpoint” restores those files to the snapshot state. Can be implemented as a dedicated checkpoint entity (e.g. project_id, session_id, checkpoint_id, file_ids, snapshot payload) or by reusing existing versioning if it fits.

**Deliverables:**
- Model and API for checkpoints: create checkpoint (capture current state of files-in-session or project), list checkpoints for session, revert to checkpoint (write back snapshot)
- UI: “Create checkpoint” and “Revert to checkpoint” in agent chat or project toolbar; show checkpoint list for current session
- Agent can optionally suggest “I’ve created a checkpoint; say ‘revert’ to go back” after large edits

**Key files:** New: checkpoint service and API; `components/ai-sidebar/` or session UI for checkpoint controls; possibly `lib/services/files.ts` or version history if we reuse it.

---

### 6. Full desktop IDE (VS Code, extensions, debugger)

**Goal:** Close the gap with “full desktop IDE” by making Synapse usable inside the environment users already have (VS Code/Cursor), rather than building a full IDE in the browser.

**Approach:** 
- **Primary:** Strengthen **Cursor/VS Code integration** so “use Synapse from Cursor” is first-class: e.g. Synapse MCP (already present), Cursor rules, and optional “Synapse for VS Code” extension that opens Synapse flows (preview, agent, file sync) from the sidebar or palette.
- **Optional:** Lightweight “Synapse for VS Code” extension: open Synapse web app in a webview or browser, pass project/path context; or run theme commands from VS Code (e.g. “Sync to Synapse”, “Open Synapse preview”).
- Do **not** scope “build a full IDE” in the browser; scope “best-in-class Cursor/VS Code integration” so power users stay in one place.

**Deliverables:**
- Document and promote “Synapse + Cursor” workflow (MCP, rules, theme dev in terminal; Synapse for preview/agent/compare).
- Optional: VS Code extension (minimal) that opens Synapse with context (project, file) and/or triggers sync/preview.
- Ensure MCP and API support “open this file in Synapse”, “run agent on this selection”, “compare with Synapse preview” so Cursor feels like the front-end and Synapse the brain.

**Key files:** `mcp-server/`, `docs/cursor-setup.md`, `.cursorrules`; new: optional `synapse-vscode` or similar repo/package if we ship an extension.

---

### 7. Local theme dev server in same window

**Goal:** Offer an experience comparable to “run `shopify theme dev` in the same window”: live preview, hot reload, and theme commands in one place.

**Approach:**
- **Option A (agent + terminal):** Combine “Run terminal commands in-agent” (item 4) with docs and prompts so the agent can suggest “Run `shopify theme dev` in your terminal” and surface output; user runs it locally, Synapse preview can point at local URL if we support it.
- **Option B (cloud dev server):** Provide a Synapse-hosted “theme dev” mode: start a theme dev server in our infra for the user’s theme, stream preview to the Synapse UI (complex, infra-heavy).
- **Option C (preview parity):** Improve the existing Synapse preview (live reload on save, faster sync, optional “theme check” in the pipeline) so “no local dev server” still feels good.

**Recommendation:** Start with **Option A + C**: (1) Ship “run terminal commands in-agent” and document “run theme dev locally and use Synapse for agent + preview elsewhere”; (2) improve preview (reload, sync speed) so most users don’t need local dev server. Option B only if we explicitly commit to hosted dev servers.

**Deliverables:**
- Item 4 (run terminal commands) delivered so agent can run `shopify theme dev` (or user can, with agent guidance).
- Docs: “Local theme dev with Synapse” — run `shopify theme dev` in Cursor/terminal; use Synapse for agent, compare, or deploy.
- Preview: document or implement “preview from local URL” if we support it (optional).
- Improve preview UX (reload on save, clarity of “last synced”) so “no local server” is acceptable for many flows.

**Key files:** Preview and sync code (`components/preview/`, `lib/shopify/`, sync flows); docs; item 4 deliverables.

---

## 3. Implementation order (phased)

| Phase | Items | Rationale |
|-------|--------|-----------|
| **1** | 1 (Inline completions), 3 (Scoped apply) | Already specified in cursor-like-features-plan; high impact and well-scoped. |
| **2** | 2 (Codebase semantic search) | Improves both completions and chat; depends on infra (embeddings). |
| **3** | 5 (Checkpoints) | Pure product/UX; unblocks “safe experimentation” without version chaos. |
| **4** | 4 (Run terminal commands) | Unlocks “run theme dev” and CLI workflows; needs security and allowlist design. |
| **5** | 7 (Local theme dev server) | Leverage item 4 + preview improvements; mostly docs and optional “preview from local URL”. |
| **6** | 6 (Full desktop IDE) | Cursor/VS Code integration and optional extension; can run in parallel with 4/5. |

---

## 4. Definition of done (per item)

- [ ] **1. Inline completions:** Ghost text in Monaco for Liquid (and optionally JS/CSS); Tab/Esc; API + provider wired; settings to toggle.
- [ ] **2. Codebase semantic search:** Embedding index + query API; integrated into agent context (and optionally complete-inline); documented.
- [ ] **3. Scoped apply & validation:** Range in Apply payload and backend; post-apply diagnostics and UI feedback; agent prompt updated.
- [ ] **4. Run terminal commands:** Allowlist, execution API, `run_command` (or similar) tool, UI for “agent ran X” and output.
- [ ] **5. Checkpoints:** Create/list/revert API and UI; checkpoints tied to session (or project); revert restores file state.
- [ ] **6. Full desktop IDE:** Cursor/VS Code integration documented and promoted; optional extension if scoped.
- [ ] **7. Local theme dev server:** Item 4 shipped; “Local theme dev with Synapse” docs; preview improvements (reload, sync) and optional “preview from local URL” if scoped.

When an item is done, update the capability matrix in `app/(marketing)/benchmarks/client.tsx`: set `synapse: true` and remove `synapsePlanned` for that row.

---

## 5. References

- Capability matrix: `app/(marketing)/benchmarks/client.tsx` (FEATURE_GROUPS, “Editor & workflow (Cursor today — we’re closing the gap)”).
- Cursor-like features (Tracks A–C): `.cursor/plans/cursor-like-features-plan.md`.
- Cursor Tab/Apply: [Cursor Docs – Tab](https://docs.cursor.com/en/tab/overview), [Instant Apply](https://www.cursor.com/blog/instant-apply).
