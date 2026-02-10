# Parallel Tracks — Subagent Assignment Plan

**BrainGrid-first (enforced):** Active backlog is limited to BrainGrid PROJ-1 requirements only:
- **REQ-21** Lovable-Style AI Sidebar with Context Awareness
- **REQ-2** Multi-agent orchestration system with specialized roles
- **REQ-EPIC-2** Production-Grade IDE (child requirements: REQ-10–REQ-15, REQ-17–REQ-21)

All other tracks (lint-only, test-only, E2E audit, REQ-52, etc.) are **paused** until the above requirements are delivered. Execute only BrainGrid-defined tasks in dependency order; update task status in BrainGrid (IN_PROGRESS → COMPLETED) per task.

**Goal:** Accomplish BrainGrid REQ-21 + REQ-2 + REQ-EPIC-2 scope; then re-enable parallel tracks for lint/tests/E2E/REQ-52.

**Coordination:** Each track is independent. No track should edit the same files as another; if overlap is discovered, that track pauses and reports. After all tracks complete, run full build + test + lint once to verify.

---

## Track A: Fix Lint (0 errors)

**Owner:** Subagent A  
**Scope:** Fix all 28 ESLint/React Compiler errors so `npm run lint` exits with 0 errors.

**Known error locations (from audit):**
- `middleware.ts` — prefer-const (response → const)
- `components/marketing/cursor/CustomCursor.tsx` — setState in effect
- `components/marketing/glass/CausticBackground.tsx` — immutability (uniforms)
- `components/marketing/glass/GlowText.tsx` — component created during render (MotionTag)
- `components/marketing/nav/Navbar.tsx` — setState in effect
- `components/marketing/sections/AgentHubDiagram.tsx` — setState in effect (multiple)
- `components/marketing/sections/FeatureCards.tsx` — setState in effect
- `components/features/file-management/CopyPasteUpload.tsx` — react-hooks/incompatible-library (watch)
- `hooks/__tests__/useFileOperations.test.ts` — no-explicit-any (2), afterEach unused
- `lib/auth/oauth-callbacks.ts` — no-explicit-any (multiple)
- `lib/preview/resource-fetcher.ts` — no-explicit-any
- `lib/shopify/__tests__/admin-api.test.ts`, `sync-service.test.ts` — no-explicit-any
- Unused vars across: MonacoEditor, LoginTransition, FileListItem.test, FileOperations.test, SuggestionPanel.test, CodeEditorMockup, HowItWorksSection, Preloader, lib/agents, lib/context, lib/liquid, lib/orchestrator, lib/shopify, lib/versions, mcp-server, tests/integration, etc.

**Approach:** Fix errors first (not just warnings). For React Compiler: use startTransition for setState-in-effect where appropriate, or move to event handlers; for GlowText, define MotionTag outside render. For no-explicit-any, add proper types. Remove or prefix unused vars with `_`.

**Deliverable:** `npm run lint` reports 0 errors. Warnings may remain but document count.

---

## Track B: Fix Failing Tests (0 failures)

**Owner:** Subagent B  
**Scope:** Fix all 9 failing tests so `npm run test:run` passes.

**Failures:**
1. **__tests__/middleware.test.ts** — "should redirect authenticated users from /auth/signin to /" expects `pathname === '/'` but app redirects to `'/projects'`. Update test to expect `/projects` (or read from config).
2. **app/auth/signin/__tests__/page.test.tsx** — No "useRouter" export on next/navigation mock. Add useRouter to the vi.mock for next/navigation (return useRouter: () => ({ push, replace, ... })).
3. **app/__tests__/page.test.tsx** — "invariant expected app router to be mounted" from Navbar's useRouter(). Wrap the page (or Navbar) in a Next.js router provider in the test, or mock next/navigation so useRouter is available.

**Approach:** Do not change production behavior for tests; change only test files or test setup. Prefer mocks over changing app code.

**Deliverable:** `npm run test:run` — 0 failed tests.

---

## Track C: Browser E2E Verification

**Owner:** Subagent C  
**Scope:** Re-run Phase 3 browser walkthrough and document results.

**Steps:**
1. Ensure dev server is running (or start it).
2. Navigate to `/` — confirm marketing page loads.
3. Click Log in — confirm auth modal with Dev quick sign-in.
4. Navigate to `/auth/signin`, click "Dev Quick Login (auto-create account)" — confirm redirect to `/projects` (or signed-in state).
5. On `/projects`, click "Create Project" — confirm redirect to `/projects/[id]`.
6. On IDE page: confirm file sidebar loads, create or select a file, confirm Monaco editor and (if visible) suggestion panel, version history panel, Shopify panel.
7. Document: GREEN / YELLOW / RED for each step. If any step fails, note the failure and screenshot or error message.
8. Update `E2E-AUDIT-REPORT.md` Phase 3 section with "Post-fix verification" and the results.

**Deliverable:** E2E-AUDIT-REPORT.md updated with browser verification results; any new issues listed.

---

## Track D: Wire Context System into Agents

**Owner:** Subagent D  
**Scope:** Integrate `lib/context` (DependencyDetector, packager, loader) into the agent execution path so agents receive cross-file context.

**Steps:**
1. Locate agent execution entry: `app/api/agents/execute/route.ts` → coordinator → `lib/agents/project-manager.ts` (and any specialists).
2. Identify where project/file context is needed: e.g. before calling AI, load context for the project (or open files).
3. Use `lib/context`: `ProjectContextLoader` or `DependencyDetector` + `ClaudeContextPackager` / `CodexContextPackager` to get a context string (or structured payload).
4. Pass context into the agent prompt or execution payload (see `lib/agents/prompts.ts` or project-manager).
5. Ensure no duplicate loading; cache if appropriate (lib/context has cache).
6. Run `npm run test:run` for agents/context-related tests; fix any regressions.

**Files to touch:** Likely `app/api/agents/execute/route.ts`, `lib/agents/coordinator.ts` or `project-manager.ts`, possibly `lib/context/index.ts` (exports). Do not change lint or test files from Track A/B.

**Deliverable:** Agent execution uses real context from lib/context; existing tests pass.

---

## Track E: REQ-52 Design System Analysis & Token Management

**Owner:** Subagent E  
**Scope:** Implement design token extraction from theme files and expose via API (foundation for style guide).

**Steps:**
1. **Token extraction:** Add a module (e.g. `lib/design-tokens/` or under `lib/ai/`) that:
   - Reads theme file content (CSS, Liquid with CSS, config/settings_schema.json if present).
   - Extracts colors (hex, rgb, var(--)), font families, font sizes, spacing (margin/padding values or variables), border-radius, shadows.
   - Returns a structured object (e.g. `{ colors: string[], fonts: string[], spacing: number[], ... }`).
2. **API:** Add route e.g. `GET /api/projects/[projectId]/design-tokens` or `POST /api/projects/[projectId]/design-tokens/extract` that:
   - Uses project access auth.
   - Lists or reads project files (via existing file service), runs extractor on relevant files (assets/*.css, config/*.json, snippets/sections that contain style).
   - Returns extracted tokens as JSON.
3. **Optional (if time):** Minimal UI to show tokens (e.g. in project/IDE settings or a "Design" tab). Can be a simple read-only list/table.
4. Add unit tests for the extractor; ensure build and test pass.

**Do not:** Change existing lint/test behavior or Context System wiring. Avoid editing the same files as Track A/B/D.

**Deliverable:** Design token extraction works; API returns tokens for a project; tests and build pass.

---

## Post–parallel verification

After all tracks report done:
1. Run `npm run lint` — expect 0 errors (Track A).
2. Run `npm run test:run` — expect 0 failures (Track B).
3. Run `npm run build` — expect success.
4. If any track could not complete (e.g. conflict or blocker), document in this plan and leave a short "Unfinished" section for follow-up.
