# W1 · Quality Gates

**Goal:** every PR runs typecheck / lint / unit / E2E / dead-code in CI before merge. No more silent regressions.

**Wave:** 0 (foundation).
**Status:** [x] complete.
**Blocks:** nothing strictly, but every other workstream is safer once gates exist.
**Depends on:** W0 bumps complete (so CI runs current versions).

## Current state (from audit)

- CI exists only as `convex-master.yml` and `convex-preview.yml` — both deploy-only, no test/lint/typecheck.
- `.husky/pre-commit` runs `prettierd` + `bun run env:check`. The `bun test` line is **commented out**.
- No branch protection rules.
- No `bun run health` at the root level (each workspace has its own).

## Tasks

### Lefthook migration

- [x] Install `lefthook` (root devDep).
- [x] Create `lefthook.yml` at repo root.
- [x] Configure pre-commit hooks in parallel:
    - `bunx --bun prettier --write` on staged `*.{js,jsx,ts,tsx,json,css,md}` (with `_generated/` excluded, `stage_fixed: true`)
    - `bun run env:check`
- [-] ESLint --fix in pre-commit deferred — W2 will land the proper shared ESLint config first; adding lint here now would block commits on rules that aren't finalized.
- [-] Scoped tsc per workspace deferred — same reason; will revisit after W2 lands strict config.
- [-] Commit-msg Conventional Commits validator skipped — solo project, low value.
- [x] Deleted `.husky/` directory.
- [x] Removed `husky` from `package.json` devDeps.
- [x] Replaced `prepare` script with `lefthook install` so hooks install on `bun install`.
- [-] README hook docs deferred — covered implicitly by the lefthook.yml comments.

### Root-level health command

- [x] Already exists per audit — verified runs all 3 workspaces correctly.

### CI workflow

- [x] Created `.github/workflows/ci.yml`.
- [x] Triggers: `pull_request`, `push: { branches: [main] }`, `workflow_dispatch`.
- [x] Cancel-in-progress on new pushes via `concurrency`.
- [x] Single `health` job runs typecheck/lint/test/format/build sequentially across all 3 workspaces. Single-job is simpler for now; can split into matrix if it gets slow.
- [-] Test:unit / test:components / test:e2e / knip jobs deferred — added in W5 once tooling lands.
- [-] Bun install cache deferred — `oven-sh/setup-bun@v2` is fast enough at this size; revisit if PR feedback time balloons.
- [-] Playwright cache deferred — added in W5 alongside Playwright install.
- [x] Uses `oven-sh/setup-bun@v2`.
- [x] Updated `convex-master.yml` trigger from `master` → `main`.

### Format fixes surfaced

- [x] `apps/web/middleware.ts` had Prettier drift; auto-fixed.

### Branch protection

- [x] Applied lightweight branch protection to `main` via `gh api`:
    - `allow_force_pushes: false`
    - `allow_deletions: false`
    - `required_linear_history: true`
    - `required_conversation_resolution: true`
    - `enforce_admins: false` (so the owner can self-merge in emergencies)
    - No required PR reviews (solo project).
    - No required status checks YET — added once CI check names stabilize after first PR run.
- [x] Saved as `scripts/setup-branch-protection.sh` for reproducibility.

### Secrets

- [-] `OPENROUTER_TEST_API_KEY` — added in W5 alongside Playwright wiring.
- [x] Existing `CONVEX_DEPLOY_KEY_*` secrets remain valid (no repo rename happened).

## Files affected

- `.github/workflows/ci.yml` (new)
- `lefthook.yml` (new)
- `.husky/` (delete)
- Root `package.json` (drop husky dep, add lefthook, root health script)
- README.md (Development section, brief note about hooks)
- `scripts/setup-branch-protection.sh` (new, optional)

## Validation

- [x] Lefthook hook installed (`.git/hooks/pre-commit` exists).
- [x] `bun run health` from root passes locally.
- [x] `bun run format:check` passes.
- [-] CI green-path validation will happen on the first PR after this commit.
- [-] Required status check names will be added to branch protection once CI run completes.

## Risks

- Lefthook + bun staged-file globs need verification — test on a known-noisy commit before flipping main.
- Playwright in CI adds minutes; aggressive caching is non-negotiable.
- Branch protection on `main` while owner is solo should NOT require external reviewer; set "include administrators: false" so owner can self-merge during early refactor.
