# Future Automation Backlog

Items from manual verification that should become automated tests.

## Priority 1 — Convert to Playwright E2E Tests

1. **Agent chat end-to-end**: Open project, type prompt, see streaming response, verify tool calls appear
2. **Code block interaction**: Click copy button, verify clipboard. Click apply, verify file changes.
3. **Settings modal**: Open, change preference, close, reopen, verify persistence
4. **Onboarding flow**: Complete all 4 steps, verify project created
5. **Auth flow**: Sign in, access protected route, sign out, verify redirect

## Priority 2 — Convert to Vitest Integration Tests

6. **Tool action card rendering**: Mock SSE events, verify PlanCard/CodeEditCard/ClarificationCard render
7. **Live editing breakout**: Mock affectedFiles metadata, verify breakout panel appears
8. **File operations**: Test create/edit/rename/delete via API routes
9. **V2 agent fallback**: Test V2 failure triggers V1 fallback
10. **Context engine**: Test file indexing, token budgeting, fuzzy matching

## Priority 3 — Add as CI Checks

11. **Export verification**: Run scripts/verify-exports.ts in CI (already written)
12. **Feature flag consistency**: Run scripts/verify-flags.ts in CI (already written)
13. **Dark mode spot check**: Automated check that all `bg-*` classes have `dark:bg-*` counterparts
14. **API route health**: Hit every route with basic request after build
15. **Bundle size tracking**: Track .next/ size over time for regressions

## Tech Debt to Track

- ~30 hooks lack any test coverage
- No component-level tests (React Testing Library)
- No accessibility tests (axe-core)
- Email system, media generation, batch operations need dedicated tests
- Offline queue and canvas view need wiring before they can be tested
