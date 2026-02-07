# Merge Checklist: Phase 2 to Main

## Pre-merge Checks

- [ ] All integration tests pass
- [ ] Staging deployment successful
- [ ] Health checks all green (`/api/health`)
- [ ] Manual testing completed on staging:
  - [ ] Can create user and authenticate
  - [ ] Can create organization and project
  - [ ] Can upload and manage files
  - [ ] AI providers respond correctly
- [ ] No breaking changes identified
- [ ] Code review approved

## Merge Process

1. Ensure `integration/phase-2` is up to date with `main`
2. Run final test suite: `npm run test:run`
3. Create PR from `integration/phase-2` to `main`
4. Get required approvals
5. Merge PR
6. Tag release: `git tag v1.0.0-phase-2`
7. Verify main branch builds and deploys successfully

## Post-merge

- [ ] Verify production deployment (if auto-deploy enabled)
- [ ] Run health checks on production
- [ ] Update project documentation if needed
- [ ] Notify team of successful merge
