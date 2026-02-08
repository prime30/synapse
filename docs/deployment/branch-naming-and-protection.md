# Branch Naming and Protection

## Branch naming convention

Use `feature/req-{number}` for requirement work.

**Examples:**
- `feature/req-77` – REQ-77
- `feature/req-123` – REQ-123

Other branch types:
- `fix/` – Bug fixes
- `chore/` – Maintenance, dependencies
- `docs/` – Documentation only

## Branch protection rules (main)

Configure in **GitHub → Settings → Branches → Add rule** for `main`:

| Setting | Recommended |
|--------|-------------|
| Require pull request before merging | ✓ |
| Require approvals | 1 |
| Dismiss stale reviews when new commits pushed | ✓ |
| Require status checks to pass | ✓ (see below) |
| Require branches to be up to date | ✓ |
| Do not allow bypassing | ✓ (for admins too, if strict) |

### Required status checks

Add these workflow checks when CI is configured:

- `quality` (or equivalent: test, lint, type-check)
- `coverage` (if separate)

## Setup

1. Go to **Repository → Settings → Branches**
2. Click **Add rule**
3. Branch name pattern: `main`
4. Enable the options above
5. Add required status checks from your GitHub Actions workflows
