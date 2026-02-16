# Cursor-Like Features in Synapse

Plan to bring Cursor-style capabilities into Synapse: inline completions (Tab), reliable apply, and codebase-aware context. We use existing APIs and infra where possible; custom-trained models are out of scope.

---

## 1. What Cursor Does (Research Summary)

### Tab (inline completions)
- **Custom sparse LM** trained on edit prediction (not generic completion). ~13k token context, ~260ms p50 latency.
- **Multi-line ghost text**: suggests edits 1 line above to 2 lines below cursor; can modify existing code.
- **Online RL**: accept/reject signals improve when to suggest vs abstain.
- **UX**: Tab to accept, Esc to reject, optional word-by-word acceptance.

### Fast Apply
- **Full-file rewrite** (not diffs): model outputs entire new file content conditioned on instruction + current file + conversation.
- **Custom 70B “fast-apply” model** with **speculative edits** (deterministic draft + verify) → ~1000 tok/s, ~13x faster than vanilla Llama-3-70b.
- **Why not diffs**: LMs are better at full-file output; line numbers are brittle; fewer “thinking” tokens in diff format.
- **Reliability**: deterministic merge strategy, scoped apply (target span), validation after apply.

### Indexing / retrieval
- Codebase indexing and semantic search feed Tab and chat context (Cursor’s @codebase).

---

## 2. What Synapse Already Has

| Capability | Synapse today |
|------------|----------------|
| **Context** | `lib/ai/context-engine.ts`: file indexing, keyword/pattern matching, dependency graph, token budget (~16k for specialists), fuzzy file resolution. No embeddings/semantic search yet. |
| **Completions** | Monaco: Liquid (object/schema), translation, definition, linked editing. **No** inline AI ghost-text. |
| **Apply** | CodeBlock Apply → `handleApplyCode`: full-file PUT (replace entire file with AI block content). Diff preview before apply. Optional undo toast. |
| **Suggestions DB** | `SuggestionApplicationService`: replace `original_code` with `suggested_code` (simple string replace). |

---

## 3. Proposed Build Tracks

### Track A: Tab-like inline completions (ghost text)

**Goal**: As the user types in Monaco, show grey ghost text suggesting the next few lines (or edit); Tab accepts, Esc rejects.

**Approach (no custom model)**:
- Use **Monaco `InlineCompletionsProvider`** (ghost text API).
- Back the provider with an **API route** that calls a **fast model** (e.g. Claude Haiku or Gemini Flash) with:
  - Current file content
  - Cursor position (prefix/suffix around cursor, e.g. 2k chars prefix, 500 suffix)
  - Optional: active project id, file path for “next line” or “complete block” prompts
- **Debounce** (e.g. 300–500 ms) and **cancel** previous request on typing.
- **Prompt**: “Complete the following Liquid/JS/CSS at the cursor. Output only the completion text, no explanation.”
- **Context**: Keep to single file + small window for latency (< 3s target).

**Deliverables**:
- `lib/monaco/inline-completion-provider.ts`: provider that calls API and returns `InlineCompletions`.
- `app/api/ai/complete-inline/route.ts`: accepts `{ fileContent, path, language, prefix, suffix }`, returns `{ completion }`.
- Wire provider in `MonacoEditor` for `liquid` (and optionally `javascript`, `css`).
- Settings: enable/disable inline completions, optional debounce.

**Limitations**: Latency will be higher than Cursor Tab (~1–3 s vs ~260 ms) unless we use a very small/fast model or a dedicated completion API. Quality will be “next line / complete block” rather than full edit prediction.

---

### Track B: Apply improvements (reliable merge, no custom model)

**Goal**: More reliable apply from AI code blocks: avoid full-file replace when only a region changed; validate after apply.

**Approach**:
- **Scoped apply**: When the AI returns a code block that corresponds to a **known region** (e.g. “replace lines 45–80”), apply only that region: replace the span in the file instead of entire file. Requires parsing “file + range” from the agent or from the CodeBlock metadata (e.g. fileId + optional range).
- **Merge strategy**: Keep “full-file replace” as default for simplicity; add optional “replace range” when the UI or agent provides a range (e.g. from diff or from selection).
- **Validation**: After apply, run existing Liquid/JS/CSS diagnostics (or a quick parse); if errors, show warning and optionally offer “Undo” or “Edit”.
- **Diff preview**: Already present in CodeBlock; keep and optionally expand to show range-based diff when range is available.

**Deliverables**:
- Optional `range?: { startLine, endLine }` (or start/end offset) in Apply payload; `handleApplyCode` and API support replacing only that range.
- Post-apply validation hook (e.g. run diagnostics on the modified file) and surface result in UI (toast or inline).
- Docs for agent prompts: “when suggesting a small edit, output the range to replace if possible.”

**No custom “fast-apply” model**: We continue using the same frontier model for the code block content; improvements are in merge logic and validation.

---

### Track C: Better indexing for completions and chat

**Goal**: Use ContextEngine and (optionally) embeddings so inline completions and chat get “relevant files” rather than only the current file.

**Approach**:
- **Inline completions**: Optionally pass a “context summary” from ContextEngine (e.g. related file paths or a short summary of related files) to the complete-inline API. Keep payload small for latency.
- **Chat**: Already uses ContextEngine for agent context; ensure file resolution and token budget are used for apply and for suggestions.
- **Optional**: Add embedding-based retrieval (e.g. Supabase pgvector or a small embedding API) for “similar code” or “relevant sections” and feed into completion/chat later.

**Deliverables**:
- Complete-inline API accepts optional `projectId` and uses ContextEngine to resolve “related files” or a 200-token summary for the current file; append to prompt.
- Optional: `lib/ai/codebase-embeddings.ts` + API for indexing file chunks and querying; integrate into context assembly (Phase 2).

---

## 4. Implementation Order

1. **Track A (inline completions)** – Highest UX impact; well-scoped; uses existing Monaco + API.
2. **Track B (apply improvements)** – Improves correctness and safety of existing Apply flow.
3. **Track C (indexing)** – Enhance completion and chat quality; embeddings optional.

---

## 5. References

- Cursor Tab: [Cursor Docs – Tab](https://docs.cursor.com/en/tab/overview), [Tab RL blog](https://cursor.com/blog/tab-rl).
- Cursor Apply: [Instant Apply blog](https://www.cursor.com/blog/instant-apply), [Morph “Fast Apply”](https://morphllm.com/cursor-fast-apply).
- Monaco: [InlineCompletionsProvider](https://microsoft.github.io/monaco-editor/typedoc/interfaces/languages.InlineCompletionsProvider.html), [registerInlineCompletionsProvider](https://microsoft.github.io/monaco-editor/typedoc/functions/languages.registerInlineCompletionsProvider.html).
