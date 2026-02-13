# Parallel EPIC Execution Prompts

Copy-paste these prompts into separate Cursor Agent conversations to build all EPICs.
Run waves in order -- each wave can have multiple conversations running simultaneously.
Source of truth: `.cursor/plans/synapse_epic_execution_0e0c3b0e.plan.md`

---

## WAVE 1 -- Foundation (1 conversation, must complete first)

### Conversation 1: EPIC 1a

```
Build EPIC 1a: AI Plumbing.

Read the full EPIC 1a section from .cursor/plans/synapse_epic_execution_0e0c3b0e.plan.md -- that is your spec. Follow the epic-executor protocol.

Summary of what to build:
- New: lib/agents/model-router.ts (MODEL_MAP record mapping AIAction -> model string, resolveModel function with priority: action override > user preference > agent default > system default)
- New: lib/agents/providers/google-client.ts (@google/generative-ai SDK implementing AIProviderClient interface, needs GOOGLE_AI_API_KEY env var)
- New: lib/preview/dom-context-formatter.ts (formatDOMContext: receives raw DOM snapshot, returns LLM-friendly string capped at ~3500 tokens)
- Modify: lib/agents/base.ts (accept model + action params, timeoutMs: 120000, rate limit wait 15000)
- Modify: lib/agents/providers/anthropic-client.ts (default to claude-sonnet-4-20250514)
- Modify: lib/agents/coordinator.ts (action routing via model-router, enforce p0 principles: File Context Rule -- reject changes to files not in context; Scope Assessment Gate -- PM returns needsClarification for broad requests; Verification First-Class -- review agent mandatory in orchestrated mode; Parallel over Sequential -- Promise.all for context loading)
- Modify: app/api/agents/stream/route.ts (accept { action, model, mode, domContext } in request body)
- Modify: app/api/agents/execute/route.ts (accept domContext, pass through to coordinator)
- Modify: components/preview/PreviewPanel.tsx (forwardRef + useImperativeHandle exposing getDOMContext)
- Modify: components/features/agents/AgentPromptPanel.tsx (getPreviewSnapshot prop, call with 3s timeout before every send)
- Modify: app/projects/[projectId]/page.tsx (create ref for PreviewPanel, pass to AgentPromptPanel)
- Modify: lib/agents/prompts.ts (PM prompt: DOM context awareness, Discussion Default principle, Testing Always First -- "Verify this works" chip auto-injected after code_change)
- Add GOOGLE_AI_API_KEY to .env.example (with optional GOOGLE_CLOUD_PROJECT + GOOGLE_APPLICATION_CREDENTIALS for future Vertex AI upgrade)

Execute in dependency tiers:
- Tier 0: model-router.ts, google-client.ts, dom-context-formatter.ts (new files, no deps on each other)
- Tier 1: base.ts, anthropic-client.ts (import model-router)
- Tier 2: coordinator.ts, prompts.ts (import base.ts changes)
- Tier 3: API routes -- stream/route.ts, execute/route.ts (import coordinator)
- Tier 4: PreviewPanel.tsx, AgentPromptPanel.tsx, page.tsx (UI wiring)

Run npm run lint and npm run test:run after each tier. Fix regressions before proceeding.
Commit: feat(epic-1a): multi-model routing, preview bridge wiring, architectural principles
Don't stop until every acceptance criterion from the plan passes.
```

---

## WAVE 2 -- After EPIC 1a completes (3 parallel conversations)

### Conversation 2: EPIC 1b + 1c (sequential, Track A)

```
Build EPIC 1b then EPIC 1c, in sequence.

Read the full EPIC 1b and EPIC 1c sections from .cursor/plans/synapse_epic_execution_0e0c3b0e.plan.md -- that is your spec.

EPIC 1b -- Context Engine + Solo Mode:
- New: lib/ai/context-engine.ts (unified system: file indexing with metadata, fuzzy file matching, dependency graph auto-includes, token budgeting expanded from ~4000 to ~16000)
- Delete: lib/ai/context-builder.ts (32 lines, dead code, never imported)
- Modify: lib/agents/coordinator.ts (use ContextEngine instead of existing context loading, add executeSolo() method, PM output includes referencedFiles field)
- Modify: lib/agents/project-manager.ts (add formatSoloPrompt() for single-pass code generation)
- New: hooks/useAgentSettings.ts (persists { mode: 'orchestrated' | 'solo', model: string } to localStorage)
- Modify: lib/agents/prompts.ts (add SOLO_PM_PROMPT -- full system prompt for solo mode)

EPIC 1c -- Chat UX Foundation:
- New: components/ai-sidebar/CodeBlock.tsx (syntax highlighting via Prism/Shiki, line numbers, Copy/Apply/Save action bar)
- Modify: components/ai-sidebar/ChatInterface.tsx (replace renderMarkdown with CodeBlock renderer for code fences; redesign input bar: file count badge showing N files in context, Stop button wired to abortRef.current?.abort(), Review button, model picker dropdown, orchestrated/solo toggle, attachment button)
- Modify: components/features/agents/AgentPromptPanel.tsx (pass useAgentSettings values, wire stop handler via abortRef, wire review handler)
- Modify: lib/ai/prompt-suggestions.ts (add reason field to Suggestion interface, add code_block and plan detection signals)

CRITICAL acceptance criteria for EPIC 1c (do not skip):
- Apply action on code blocks shows INLINE DIFF PREVIEW; user must confirm before write (P4 Verification enforcement)
- Selected editor text is auto-included as context when user sends a chat message (selection injection)
- Stop button calls abortRef.current?.abort() immediately, shows "Stopped" state

Run npm run lint and npm run test:run between EPICs.
Commit each separately:
- feat(epic-1b): context engine, solo PM mode
- feat(epic-1c): code block rendering, cursor-style input bar, selection injection
Don't stop until every acceptance criterion passes.
```

### Conversation 3: EPIC 3 (Track B -- Editor/IDE)

```
Build EPIC 3: IDE Polish -- 14 editor improvements.

Read the full EPIC 3 section from .cursor/plans/synapse_epic_execution_0e0c3b0e.plan.md -- that is your spec.

Build ALL 14 features:
1. New: components/editor/FileBreadcrumb.tsx -- clickable path segments above editor (sections / hero-banner.liquid > {% schema %} > blocks > image)
2. Modify: FileExplorer.tsx -- last-edited relative timestamps ("2m ago", "yesterday") next to modified files
3. Verify existing unsaved changes amber dot on FileTab.tsx works correctly
4. Modify: MonacoEditor.tsx -- matching Liquid tag highlights ({% if %} highlights its {% endif %}, {% for %} highlights {% endfor %}) via custom decoration provider
5. Modify: MonacoEditor.tsx -- schema auto-fold on Liquid file open via editor.setModelFolding()
6. Modify: FileTabs.tsx -- drag-to-reorder tabs (draggable + drop handlers)
7. New: components/editor/CommandPalette.tsx -- Ctrl+P opens palette with "Recent Files" section at top (last 5 with timestamps, tracked via useFileTabs)
8. Modify: MonacoEditor.tsx -- color swatches inline for hex/rgb/hsl values (12x12 Monaco inline decoration)
9. Modify: MonacoEditor.tsx -- schema setting preview on hover ("type": "color" shows mini color preview)
10. Modify: FileExplorer.tsx -- snippet usage count badges (e.g. price.liquid (x4)) sourced from dependency parser
11. Modify: MonacoEditor.tsx -- double-click selects full Liquid object path via custom wordSeparators config
12. Modify: MonacoEditor.tsx -- paste image handler offers "Add as asset file" or "Inline as base64"
13. Modify: MonacoEditor.tsx -- right-click "Find All References" pre-fills search with selected word/symbol
14. New: components/editor/StatusBar.tsx -- shows filename | N lines | X KB | Language for active file

New files: FileBreadcrumb.tsx, StatusBar.tsx, CommandPalette.tsx
Modified files: MonacoEditor.tsx, FileTabs.tsx, FileTab.tsx, FileExplorer.tsx, hooks/useFileTabs.ts

Use sub-agents -- group independent features that touch different files (e.g. FileExplorer items together, MonacoEditor items together, new components separately).
Run npm run lint and npm run test:run after completing all features.
Commit: feat(epic-3): 14 IDE polish improvements
Don't stop until every acceptance criterion passes.
```

### Conversation 4: EPIC 4 (Track D -- Foundations)

```
Build EPIC 4: Liquid AST Parser -- full recursive-descent parser.

Read the full EPIC 4 section from .cursor/plans/synapse_epic_execution_0e0c3b0e.plan.md -- that is your spec.

This is a foundational EPIC (2-4 weeks scope). Build incrementally in this exact order:
1. Lexer: tokenize Liquid delimiters ({{ }}, {% %}, {%- -%}), strings, identifiers, operators, whitespace
2. Core AST nodes: Text, Output, Assign, If/Unless, For, Case -- with source locations { line, column, offset, length }
3. Filter chains: | filter: arg1, arg2 parsing with proper string argument handling
4. Block tags: Capture, Raw, Comment, Section, Render/Include with nested block support
5. Schema block: parse {% schema %} content as embedded JSON AST node
6. Error recovery: produce partial AST on malformed input (collect errors array, don't crash)
7. AST walker: lib/liquid/ast-walker.ts with visitor pattern (replace existing flat walker)
8. Wire into existing: modify lib/liquid/scope-tracker.ts to consume AST nodes instead of regex matches, modify lib/liquid/type-checker.ts to walk AST for type inference

New files: lib/liquid/liquid-ast.ts (parser + all AST node type definitions), lib/liquid/ast-walker.ts
Modified files: lib/liquid/scope-tracker.ts, lib/liquid/type-checker.ts

Write comprehensive tests covering:
- All standard Liquid constructs (if/elsif/else/endif, for/endfor, case/when, assign, capture, render, include)
- Whitespace trimming ({%- -%})
- Nested blocks (for inside if inside capture)
- Filter chains with string args (| replace: 'old', 'new')
- Malformed input (error recovery produces partial AST)
- Source location accuracy (every node's line/column/offset is correct)

Acceptance criteria:
- Parses all Dawn theme section files without errors
- Every node has accurate source location
- Round-trip: ast_to_string(parse(source)) ~= source (whitespace-normalized)
- Existing LiquidValidator can be refactored to use AST (verify as possible, don't implement)
- npm run test:run passes with edge case coverage

Commit: feat(epic-4): liquid AST parser with source locations and error recovery
Don't stop until the parser handles all standard Liquid constructs.
```

---

## WAVE 3 -- After Wave 2 completes (4 parallel conversations)

### Conversation 5: EPIC M (Standalone)

```
Build EPIC M: Motion-First AI Generation -- update all 5 agent prompts.

Read the full EPIC M section from .cursor/plans/synapse_epic_execution_0e0c3b0e.plan.md -- that is your spec.

IMPORTANT: lib/agents/prompts.ts was modified in Wave 2 (EPIC 1b added SOLO_PM_PROMPT). Read the current file state before editing.

This is a single-file change to lib/agents/prompts.ts. Update ALL 5 agent prompts:

1. Liquid agent prompt: Add IntersectionObserver + data-animate pattern. Generated sections must include a standard <script> block that uses IntersectionObserver to add .is-visible class on scroll. Schema must include enable_animations (checkbox) and animation_style (select: fade/slide/scale).
2. CSS agent prompt: Add @keyframes library (fadeIn, slideUp, scaleIn, staggerReveal), hover micro-interactions (scale transform, shadow lift, underline sweep), staggered children (each child delays 0.1s * index), and @media (prefers-reduced-motion: no-preference) wrapping ALL animations.
3. JavaScript agent prompt: Add observer recipe for scroll-triggered animations using data-animate attributes.
4. PM agent prompt: Add motion delegation instructions (always request animations from CSS/JS agents when generating sections).
5. Review agent prompt: Add motion quality checks (flag missing prefers-reduced-motion, flag missing schema animation toggle, flag missing data-animate on animated elements).

Run npm run lint after changes.
Commit: feat(epic-m): motion-first AI generation prompts
```

### Conversation 6: EPIC 2 + EPIC 5 (sequential, Track A continues)

```
Build EPIC 2 (Quick Wins) then EPIC 5 (AI Intelligence), in sequence.

Read both EPIC sections from .cursor/plans/synapse_epic_execution_0e0c3b0e.plan.md -- that is your spec.

EPIC 2 -- 8 micro-features:
1. Modify ChatInterface.tsx: Action-specific thinking label ("Generating schema...", "Reviewing 3 files..." based on AIAction type)
2. Modify SuggestionChips.tsx: Keyboard nav (Tab cycles, Enter selects, 1-5 number shortcuts)
3. Modify SuggestionChips.tsx + AgentPromptPanel.tsx: "Retry with full file context" chip on short AI responses. AgentPromptPanel detects [RETRY_WITH_FULL_CONTEXT] prefix in chip action and includes full active file content in request body.
4. Modify SuggestionChips.tsx: "Why this suggestion?" tooltip on hover (reads reason field added in EPIC 1c)
5. Modify ChatInterface.tsx: Pin message (click pin icon -> message floats at top of chat thread)
6. Modify status bar area in page.tsx: Token count display (input + output tokens from last response)
7. Modify ChatInterface.tsx: "Copy as reusable prompt" button on AI response messages
8. Modify ChatInterface.tsx: Session summary auto-generated on chat clear (summarize key decisions, code changes, open questions)

EPIC 5 -- AI Intelligence (Phases 2-3):
- New: lib/ai/signal-detector.ts (DetectedSignal interface with type, confidence, metadata; detect code_block, plan, error, suggestion, refactor signals)
- New: lib/ai/conversation-arc.ts (ConversationArc class tracking turn count, loop detection, escalation triggers)
- New: components/ai-sidebar/PlanApprovalModal.tsx (numbered steps, Approve/Modify/Cancel buttons)
- New: components/editor/QuickActionsToolbar.tsx (floating toolbar above Monaco selection with Explain/Refactor/Document/Fix buttons)
- Modify: lib/ai/prompt-suggestions.ts (weighted scoring: relevance x recency x novelty x escalation; turn-count gating: simple at turns 1-2, intermediate 3-4, advanced 5+; frequency dampening)
- Modify: lib/ai/action-history.ts (add shownCount/usedCount tracking per suggestion)
- Modify: lib/agents/summary-prompt.ts (SYSTEM_PROMPT adapts output format per mode: chat, plan, review, fix, generate, document)
- Modify: components/ai-sidebar/ChatInterface.tsx (output mode rendering -- different layouts per outputMode: code shows CodeBlock, plan shows PlanApprovalModal, review shows scored report)
- Modify: components/editor/MonacoEditor.tsx (CodeActionProvider for "Fix with AI" on Liquid diagnostics, onSelectionChange for quick actions toolbar positioning)

Commit each separately:
- feat(epic-2): 8 quick win AI micro-features
- feat(epic-5): signal detection, plan mode, quick actions, conversation arc
Don't stop until all acceptance criteria pass.
```

### Conversation 7: EPIC 15 (Spatial Canvas)

```
Build EPIC 15: Spatial Canvas -- React Flow graph of theme dependencies.

Read the full EPIC 15 section from .cursor/plans/synapse_epic_execution_0e0c3b0e.plan.md -- that is your spec.

First: npm install @xyflow/react dagre @types/dagre

Build:
- New: lib/ai/canvas-data-provider.ts (convert DependencyDetector output to React Flow nodes/edges array, use dagre for auto-layout positioning)
- New: components/canvas/FileNode.tsx (custom React Flow node: file type icon, diagnostics count badge, modified indicator dot, file size)
- New: components/canvas/DependencyEdge.tsx (custom edge: color-coded by type -- blue for liquid_include, green for asset_reference, orange for css_import; reference count shown on hover)
- New: components/canvas/CanvasView.tsx (top-level view: Editor|Canvas|Preview toggle in toolbar, pan/zoom/minimap controls)
- Drop zone at bottom of canvas: "Drag files here to create a refactoring context" for ad-hoc file grouping
- Canvas-specific compact chat input: sends only selected/grouped file context, not the full sidebar chat
- AI suggestion nodes: float near file clusters (e.g. "These 3 snippets share duplicate code -- extract?"), dismissible, feed into nudge-feedback system from EPIC 12

Performance requirements:
- All @xyflow/react imports MUST be dynamic (React.lazy + dynamic import) -- no bundle bloat for non-canvas users
- For large themes (200+ files): use React Flow node virtualization (only render visible viewport nodes)
- Cluster files by directory (sections/, snippets/, assets/) with expand-on-click
- Initial view shows ONLY active file's direct dependencies, not full graph

Commit: feat(epic-15): spatial code canvas with dependency graph and AI suggestions
Don't stop until all acceptance criteria pass.
```

### Conversation 8: EPIC 16 (Visual Experience)

```
Build EPIC 16: Visual Experience -- Chromatic IDE + Liquid Flow Visualizer.

Read the full EPIC 16 section from .cursor/plans/synapse_epic_execution_0e0c3b0e.plan.md -- that is your spec.

Phase 9 -- Chromatic IDE:
- New: lib/design-tokens/chromatic-engine.ts (extract top 3 dominant colors from theme CSS/settings, generate CSS custom properties: --ide-ambient-primary, --ide-ambient-secondary, --ide-ambient-accent)
- New: components/providers/ChromaticProvider.tsx (inject --ide-ambient-* variables into document :root, observe theme file changes)
- New: hooks/useChromaticSettings.ts (enabled boolean, intensity 0-100, granular per-region controls, persisted to localStorage)
- Modify: app/globals.css (add --ide-ambient-* variable declarations with fallback values)
- Ambient radial gradient (3-5% opacity, follows active panel focus)
- 1.2s oklch color transitions on project switch (browser fallback: oklch -> hsl for browsers without @property support)
- Modify: SettingsModal.tsx > add Appearance tab (Chromatic toggle, intensity slider, granular controls per region)

Phase 10 -- Liquid Flow Visualizer (10 checkpoints -- build in order):
- CP1: Import existing liquid-ast.ts from EPIC 4 (must exist from Wave 2)
- CP2: New: lib/liquid/flow-analyzer.ts (build DataFlowGraph from AST: track variable assignments, filter chains, output references)
- CP3: New: lib/liquid/flow-graph-builder.ts (convert DataFlowGraph to FlowPath[] with line positions mapped to Monaco editor coordinates)
- CP4: New: components/editor/FlowCanvas.tsx (HTML5 Canvas element positioned behind Monaco editor, scroll-synced via editor.onDidScrollChange)
- CP5: Static flow lines rendered on canvas (bezier curves connecting assignment -> usage nodes, node indicators at source locations)
- CP6: New: lib/liquid/particle-system.ts (60fps requestAnimationFrame particle animation along flow paths, devicePixelRatio-aware rendering)
- CP7: Full visual language (color coding by data type, glow on active path, frosted glass badges for variable values, branch dimming for inactive paths)
- CP8: Flow toggle button in editor gutter + hover tooltips showing variable values at each node
- CP9: Bridge preview data for real runtime values (connect to preview iframe snapshot for actual rendered values)
- CP10: Performance validation (target <16ms per frame, >=55fps, off-screen culling for nodes outside viewport)

RISK: Canvas-behind-Monaco scroll sync is the hardest UI challenge. Build CP4-CP5 first and validate scroll alignment accuracy before investing in CP6-CP7 particles. If scroll sync proves too janky, fall back to side-panel visualization instead of overlay.

Commit: feat(epic-16): chromatic IDE theming + liquid flow visualizer
Don't stop until all acceptance criteria pass.
```

---

## WAVE 4 -- After Wave 3 completes (2 conversations)

### Conversation 9: EPIC 6 + EPIC 7 (sequential -- both modify MonacoEditor.tsx)

```
Build EPIC 6 (Language Intelligence) then EPIC 7 (Platform Resilience), in sequence. These are combined into one conversation because both heavily modify MonacoEditor.tsx.

Read both EPIC sections from .cursor/plans/synapse_epic_execution_0e0c3b0e.plan.md -- that is your spec.

EPIC 6 -- Language Intelligence (10 LSP-level features):

PREREQUISITE: First expand lib/liquid/shopify-schema.json from ~128 lines (11 objects) to cover ~40+ Shopify objects with nested property chains and return types. Reference https://github.com/Shopify/theme-liquid-docs for machine-readable object definitions. Add: product (with .title, .price, .variants, .images, .type, .tags, .vendor, .available, .handle, .url), collection, order, customer, cart, line_item, address, linklists, metafields, localization, routes, theme, request, section, block, settings, all_products, collections, pages, blogs, articles, etc. Include property return types (e.g. product.variants returns Array<Variant>).

Then build all 10 features:
1. New: lib/monaco/liquid-completion-provider.ts (object-aware completions using expanded schema JSON; also handles schema-setting completions by parsing current file's {% schema %} for section.settings.* and block.settings.*)
2. New: lib/monaco/liquid-definition-provider.ts (Ctrl+Click go-to-definition: {% render 'x' %} -> snippets/x.liquid, {% section 'x' %} -> sections/x.liquid, {{ 'x.css' | asset_url }} -> assets/x.css)
3. New: lib/monaco/translation-provider.ts (locale key completions inside {{ '...' | t }} patterns)
4. New: lib/liquid/locale-parser.ts (parse + flatten locales/en.default.json into dot-notation key list)
5. Auto-close Liquid pairs: onDidType listener in MonacoEditor.tsx (detect {% if %} -> auto-insert {% endif %}, {% for %} -> {% endfor %}, etc.)
6. New: lib/liquid/unused-detector.ts (cross-reference {% assign %} declarations against usage across file; cross-reference snippets/ files against {% render %} calls for orphan detection)
7. Deprecated tag/filter warnings: flag {% include %} (suggest {% render %}), | img_tag, | json without | escape
8. New: lib/monaco/linked-editing-provider.ts (HTML tag auto-rename: edit <div> -> </div> auto-updates)
9. New: lib/liquid/formatter.ts (rule-based Liquid formatting: indent block tags, normalize whitespace around delimiters, format embedded schema JSON with 2-space indent)
10. Register ALL new providers in MonacoEditor.tsx (currently has NO completion or hover providers, only diagnostics and code actions)

EPIC 7 -- Platform Resilience (6 features):
- New: hooks/useOfflineQueue.ts (queue failed API writes to localStorage, retry on reconnect with exponential backoff)
- Modify: hooks/useAutoSave.ts (integrate offline queue, detect connection state, conflict detection on reconnect)
- New: components/editor/ThemeConsole.tsx + hooks/useThemeConsole.ts + lib/editor/console-stream.ts (tabbed panel: Diagnostics tab, Push Log tab, Theme Check tab)
- New: lib/editor/keyboard-config.ts (central keyboard shortcut configuration)
- Modify: MonacoEditor.tsx (Ctrl+D selects next occurrence, multi-cursor via Alt+Click config, Ctrl+Shift+P opens command palette from EPIC 3)
- Modify: SettingsModal.tsx (add "Keys" tab with keybinding editor showing current shortcuts with rebind)

StatusBar integration (from EPIC 3): show "Offline -- changes saved locally" when disconnected.
Ctrl+backtick toggles ThemeConsole panel.

Commit each separately:
- feat(epic-6): language intelligence -- completions, go-to-def, formatting, diagnostics
- feat(epic-7): offline queue, keyboard workflow, theme console
Don't stop until all acceptance criteria pass.
```

### Conversation 10: EPIC 8 (Track A continues)

```
Build EPIC 8: Advanced AI -- Phase 4.

Read the full EPIC 8 section from .cursor/plans/synapse_epic_execution_0e0c3b0e.plan.md -- that is your spec.

Build:
- New: hooks/useApplyWithUndo.ts (wraps file write with 10-second undo window; BatchOperation class for multi-file undo as single unit)
- New: components/ui/UndoToast.tsx (countdown timer, Undo button, auto-dismiss after 10s)
- New: lib/ai/theme-reviewer.ts (full theme audit: scans all files, scores categories -- performance, accessibility, SEO, best practices, Liquid quality -- outputs structured report)
- New: components/ai-sidebar/ThemeReviewReport.tsx (renders scored category report with expandable details per file)
- New: lib/ai/batch-operations.ts (fix-all-similar: find pattern across files and apply fix; bulk localization; bulk schema generation)
- New: app/api/agents/upload/route.ts (multipart image upload for multi-modal AI input, forwards to Gemini vision)
- Modify: components/ai-sidebar/ChatInterface.tsx (image paste/drop handler -> upload -> include in context; split-diff rendering in code blocks using existing DiffPreview component)
- Modify: app/api/projects/[projectId]/shopify/sync/route.ts (wire theme-reviewer.ts as rule-based quick scan before push)
- Modify: components/features/shopify/ShopifyConnectPanel.tsx (show pre-flight scan results before deploy, add "Review Theme" button for full AI review)

Deploy pre-flight is TWO-TIER (critical architecture):
1. Quick rule-based scan (<2s) runs on EVERY push: check for broken {% render %} references, missing asset files, unclosed Liquid tags -- blocks deploy if critical issues found
2. Full AI review (30-60s) runs ON-DEMAND only: triggered by "Review Theme" button or automatically before publish-to-live. Uses theme-reviewer.ts for scored report.

Commit: feat(epic-8): multi-modal input, theme review, batch ops, undo safety, deploy pre-flight
Don't stop until all acceptance criteria pass.
```

---

## WAVE 5 -- After Wave 4 completes (3 conversations)

### Conversation 11: EPIC 9 (1.0 Completeness)

```
Build EPIC 9: 1.0 Completeness -- 10 features.

Read the full EPIC 9 section from .cursor/plans/synapse_epic_execution_0e0c3b0e.plan.md -- that is your spec.

Build ALL 10 features:
1. Asset browser: New components/features/assets/AssetBrowserPanel.tsx (grid view of theme assets from Shopify assets/ folder with upload, delete, and drag-to-insert-reference into editor) + hooks/useShopifyAssets.ts + app/api/stores/[connectionId]/themes/[themeId]/assets/route.ts
2. Template composer: New components/features/templates/TemplateComposer.tsx + SectionSlot.tsx + hooks/useTemplateLayout.ts (reads templates/*.json, shows drag-reorderable section list, PLUS block reordering within sections, writes changes back to template JSON)
3. Preview controls: New lib/preview/mock-data-provider.ts (customer presets: Anonymous/Logged-In/VIP; cart presets: Empty/With-Items; discount mock) + Modify components/preview/PreviewControls.tsx (add locale dropdown, viewport size buttons 375/768/1024/full, mock data dropdown)
4. Inline comments: New components/editor/InlineComments.tsx + CommentThread.tsx + hooks/useCodeComments.ts + supabase/migrations/028_code_comments.sql (stored in Supabase, rendered as Monaco gutter icons, threaded replies)
5. Deploy approval: New components/features/shopify/PublishRequestPanel.tsx + hooks/usePublishRequests.ts + supabase/migrations/029_publish_requests.sql (role-based: members require admin approval to publish to live theme, integrates with EPIC 8's AI pre-flight gate)
6. Metafield CRUD: New components/features/content/MetafieldExplorer.tsx + MetafieldForm.tsx + hooks/useMetafields.ts + app/api/stores/[connectionId]/metafields/route.ts (type-aware form inputs: text, number, json, date, color, etc.)
7. Performance scoring: New lib/quality/theme-performance.ts + lib/quality/asset-analyzer.ts + components/features/quality/PerformanceDashboard.tsx (0-100 score with breakdown: asset weight, render-blocking resources, image optimization)
8. Image optimization: New lib/quality/image-optimizer.ts + components/features/quality/ImageOptPanel.tsx (auto-detect unoptimized images, recommend WebP/srcset/lazy-loading, show size savings per image)
9. A11y checker: New lib/quality/a11y-checker.ts + components/features/quality/A11yPanel.tsx (rule-based scanner on rendered preview: missing alt, form labels, heading order, link text, color contrast)
10. Locale preview: lib/liquid/locale-parser.ts (if not already created by EPIC 6, create here; otherwise reuse) + wire PreviewControls locale toggle to switch language in preview panel

Use sub-agents heavily -- these 10 features are largely independent.
Commit: feat(epic-9): asset browser, template composer, comments, deploy approval, quality tools
Don't stop until all 10 acceptance criteria pass.
```

### Conversation 12: EPIC 12 + 13 (sequential, Ambient + Intent)

```
Build EPIC 12 (Ambient Intelligence) then EPIC 13 (Intent Completion), in sequence.

Read both EPIC sections from .cursor/plans/synapse_epic_execution_0e0c3b0e.plan.md -- that is your spec.

EPIC 12 -- Ambient Intelligence:
- New: lib/ai/session-intent.ts (SessionIntent type, BehaviorEvent stream tracking file opens/edits/preview interactions, 60s rolling window for pattern detection)
- New: hooks/useAmbientIntelligence.ts (6 signal types with confidence scoring: missing-schema, unused-variable, broken-reference, style-inconsistency, performance-issue, accessibility-gap)
- New: components/ai-sidebar/AmbientBar.tsx (non-intrusive strip below chat, shows highest-confidence nudge with "Yes" -> one-click resolution and "X" -> dismiss, auto-expires after configured timeout)
- New: lib/ai/nudge-feedback.ts (track Yes/Dismiss outcomes per signal type, auto-tune confidence thresholds -- dismissed signals dampened in future)
- Wire one-click resolutions for all 6 signal types (e.g. "Generate schema?" -> calls schema generation, "Fix reference?" -> shows fix diff)

EPIC 13 -- Intent Completion:
- New: lib/ai/action-stream.ts (typed event stream capturing file operations: rename, create, delete, edit with change type)
- New: lib/ai/workflow-patterns.ts (define 4 patterns: rename propagation, section creation flow, component extraction, locale sync)
- New: lib/ai/intent-matcher.ts (match incoming action-stream events against workflow patterns, compute remaining steps as checkbox tree)
- New: hooks/useIntentCompletion.ts (subscribe to action-stream, run intent-matcher, surface IntentCompletionPanel when match confidence > threshold)
- New: components/ai-sidebar/IntentCompletionPanel.tsx (checkbox tree of remaining steps, "Preview All" button, "Apply All" button)
- New: components/ai-sidebar/BatchDiffModal.tsx (multi-file diff view with per-file accept/reject checkboxes, "Apply All" uses batch undo from EPIC 8 so single undo reverts all)

Commit each separately:
- feat(epic-12): ambient intelligence bar with proactive nudges
- feat(epic-13): intent completion engine with workflow pattern matching
Don't stop until all acceptance criteria pass.
```

### Conversation 13: EPIC 14 (Developer Memory)

```
Build EPIC 14: Developer Memory -- AI remembers conventions across sessions.

Read the full EPIC 14 section from .cursor/plans/synapse_epic_execution_0e0c3b0e.plan.md -- that is your spec.

Build:
- New: lib/ai/developer-memory.ts (Convention interface: pattern, confidence, examples, source; Decision interface: context, choice, reasoning, timestamp; MemoryPreferences interface)
- New: supabase/migrations/026_developer_memory.sql (developer_memory table: id, project_id, user_id, type enum(convention/decision/preference), content jsonb, confidence float, created_at, updated_at, feedback enum(correct/wrong/null))
- New: lib/ai/convention-detector.ts (analyze theme files for patterns: naming conventions like BEM/kebab-case, schema patterns like consistent setting IDs, color approaches like CSS vars vs inline, with confidence scores)
- New: lib/ai/decision-extractor.ts (parse agent execution logs and chat history for explicit decisions: "I chose X because Y", "Let's use Z approach")
- New: lib/ai/preference-learner.ts (learn from user actions: accept/reject/edit patterns on AI suggestions, build preference model)
- New: app/api/projects/[projectId]/memory/route.ts (GET: list memories, POST: create, PATCH: update feedback, DELETE: forget)
- Modify: lib/ai/context-engine.ts (add Layer 8: developer memory injection -- load project conventions/decisions and prepend to all agent system prompts)
- New: components/features/memory/MemoryPanel.tsx (three tabs: Conventions, Decisions, Preferences; each item shows confidence score, examples, Correct/Wrong feedback buttons, Forget button, Edit button)
- StatusBar memory indicator: brain icon + count of active conventions (e.g. "3 conventions learned")

Commit: feat(epic-14): persistent developer memory with convention detection
Don't stop until all acceptance criteria pass.
```

---

## WAVE 6 -- After Wave 5 completes (1 conversation)

### Conversation 14: EPIC 10 + EPIC 11 (sequential)

```
Build EPIC 10 (Store Management) then EPIC 11 (Customizer Mode), in sequence.

Read both EPIC sections from .cursor/plans/synapse_epic_execution_0e0c3b0e.plan.md -- that is your spec.

EPIC 10 -- Store Management:
- Modify: lib/shopify/oauth.ts (Phase 1 scopes: read_themes, write_themes, read_content, write_content, read_online_store_navigation, write_online_store_navigation, read_discounts, write_discounts, read_files, write_files, read_products, read_inventory)
- Modify: lib/shopify/admin-api.ts (add graphql<T>() method for GraphQL Admin API queries)
- OAuth re-authorization flow: detect when existing connections are missing new Phase 1 scopes, show "Additional permissions needed" banner, redirect to OAuth re-auth
- New: components/features/store/StoreDataPanel.tsx (tabbed container in ActivityBar)
- New panels (each with hook + API route):
  - NavigationPanel.tsx + useShopifyNavigation.ts + app/api/stores/[connectionId]/navigation/route.ts (menu items with drag-reorder and "Copy as Liquid" button)
  - FilesPanel.tsx + useShopifyFiles.ts + app/api/stores/[connectionId]/files/route.ts (browse/upload/delete Shopify CDN files, extends EPIC 9 asset browser)
  - InventoryPanel.tsx + useShopifyInventory.ts + app/api/stores/[connectionId]/inventory/route.ts (variant x location stock matrix with inline edit via GraphQL inventoryLevels)
  - DiscountsPanel.tsx + useShopifyDiscounts.ts + app/api/stores/[connectionId]/discounts/route.ts (CRUD price rules and discount codes)
  - PagesPanel.tsx + useShopifyPages.ts + app/api/stores/[connectionId]/pages/route.ts (create/edit/delete static pages)
- New: lib/preview/storefront-data-bridge.ts + app/api/stores/[connectionId]/storefront/route.ts (fetch real product data via Storefront API for preview)
- NOTE: Orders panel is DEFERRED to Phase 2 scopes (read_orders requires Shopify app review)

EPIC 11 -- Customizer Mode:
- New: hooks/useSchemaParser.ts (parse {% schema %} blocks, expose structured settings/blocks data + mutation methods)
- New: contexts/PreviewSyncContext.tsx (real-time settings -> preview synchronization)
- New: components/features/customizer/CustomizerMode.tsx (top-level layout replacing editor view, toggle via toolbar button)
- New: components/features/customizer/SectionListSidebar.tsx (reads templates/*.json, shows ordered section list with drag-reorder, add/remove sections)
- New: components/features/customizer/TemplateSelector.tsx (dropdown switching between index.json, product.json, collection.json templates)
- New: components/features/customizer/SchemaSettingInput.tsx (master input component for 20+ Shopify setting types: text, color, image_picker, video_url, richtext, font_picker, select, range, checkbox, url, collection, product, article, blog, page, link_list, html, liquid, number, radio)
- New: components/features/customizer/BlockInstanceManager.tsx (add/remove/reorder block instances within sections)
- New: components/features/customizer/SectionHighlighter.tsx (blue overlay on section hover in preview, uses synapse-bridge.js inspect capability)
- New: components/features/customizer/SchemaBuilderInline.tsx (inline schema editor: drag-to-reorder settings, visual type picker, live validation for duplicate IDs/missing labels/unreferenced settings, dependency rules "show when X is true", auto-generate Liquid from new settings)
- New: components/features/customizer/PresetPanel.tsx (apply/save/export/import section presets)

Preview strategy (SAME-ORIGIN via proxy):
- V1 (default): Server-rendered preview. Push settings to Shopify via Admin API PUT /themes/{id}/assets (update settings_data.json), reload proxied iframe. 2-5s latency but pixel-perfect.
- V2 (enhancement, NOT required for ship): local-renderer.ts for <200ms feedback. Defer to future EPIC.
- "Accurate Preview" toggle switches between local (if available) and server-rendered.

Setting type V1 scoping:
- richtext: plain textarea (WYSIWYG via TipTap/Lexical is V2)
- font_picker: Google Fonts API dropdown with live preview (Shopify proprietary font parity is deferred)
- video_url: URL input + YouTube/Vimeo oEmbed preview
- image_picker: thumbnail preview + "Select image" button (uses EPIC 9 asset browser)

Commit each separately:
- feat(epic-10): store management -- navigation, files, inventory, discounts, pages, storefront bridge
- feat(epic-11): customizer mode -- visual theme editor with section management
Don't stop until all acceptance criteria pass.
```

---

## Execution Timeline Summary

| Wave | Conversations | EPICs | Starts After | File Conflicts |
|------|--------------|-------|-------------|----------------|
| 1 | 1 | 1a | Immediately | n/a |
| 2 | 3 parallel | 1b+1c, 3, 4 | Wave 1 | None verified |
| 3 | 4 parallel | M, 2+5, 15, 16 | Wave 2 | None verified |
| 4 | 2 parallel | 6+7, 8 | Wave 3 | None verified |
| 5 | 3 parallel | 9, 12+13, 14 | Wave 4 | None verified |
| 6 | 1 | 10+11 | Wave 5 | None (sequential) |

**Total: 14 conversations across 6 waves. Max parallelism: 4 (Wave 3).**
