# W1 · Quality Gates

**Goal:** every PR runs typecheck / lint / unit / E2E / dead-code in CI before merge. No more silent regressions.

**Wave:** 0 (foundation).
**Status:** not started.
**Blocks:** nothing strictly, but every other workstream is safer once gates exist.
**Depends on:** W0 bumps complete (so CI runs current versions).

## Current state (from audit)

- CI exists only as `convex-master.yml` and `convex-preview.yml` — both deploy-only, no test/lint/typecheck.
- `.husky/pre-commit` runs `prettierd` + `bun run env:check`. The `bun test` line is **commented out**.
- No branch protection rules.
- No `bun run health` at the root level (each workspace has its own).

## Tasks

### Lefthook migration
- [ ] Install `lefthook` (root devDep).
- [ ] Create `lefthook.yml` at repo root.
- [ ] Configure pre-commit hooks in parallel:
  - `prettierd` on staged `*.{ts,tsx,js,jsx,json,css,md}`
  - `eslint --fix` on staged `*.{ts,tsx,js,jsx}`
  - `tsc --noEmit -p <workspace>` scoped to the changed workspace only (use `lefthook` glob filtering)
  - `bun run env:check` (keep)
- [ ] Configure commit-msg hook — Conventional Commits validator (optional, low priority).
- [ ] Delete `.husky/` directory and remove `husky` from package.json.
- [ ] Add `lefthook install` to root postinstall script.
- [ ] Document hooks in README's Development section.

### Root-level health command
- [ ] Add `bun run health` to root `package.json` that fans out to every workspace's `health` (apps/web, packages/convex, packages/shared).
- [ ] Already exists per audit — verify it actually runs all 3 workspaces correctly.

### CI workflow
- [ ] Create `.github/workflows/ci.yml`.
- [ ] Triggers: `pull_request`, `push: { branches: [main] }`.
- [ ] Cancel-in-progress on new pushes (`concurrency: { group: ci-${{ github.ref }}, cancel-in-progress: true }`).
- [ ] Job: `typecheck` — matrix per workspace, runs `tsc --noEmit`.
- [ ] Job: `lint` — runs `bun run lint` per workspace.
- [ ] Job: `test:unit` — Vitest unit tests across all workspaces (post-W5).
- [ ] Job: `test:components` — Vitest jsdom + RTL (post-W5).
- [ ] Job: `test:e2e` — Playwright happy paths (post-W5).
- [ ] Job: `knip` — dead-code check (post-W5).
- [ ] Job: `format` — `bun run format:check` per workspace (use `prettier --check` not `prettierd`).
- [ ] Job: `build` — `cd apps/web && bun run build`.
- [ ] Cache `~/.bun/install/cache` keyed on `bun.lock`.
- [ ] Cache `~/.cache/ms-playwright` keyed on `bun.lock` hash + Playwright version.
- [ ] Use `oven-sh/setup-bun@v2` action.

### Branch protection
- [ ] Configure branch protection on `main` via `gh api`:
  - Require all CI checks (`typecheck`, `lint`, `test:unit`, `test:components`, `test:e2e`, `knip`, `format`, `build`).
  - Require 1 review (acceptable for solo project; can relax to 0 if owner-only).
  - Disallow force-pushes.
  - Require linear history (no merge commits).
- [ ] Add `gh repo edit` command to a `scripts/setup-branch-protection.sh` for reproducibility.

### Secrets
- [ ] Add repo secret `OPENROUTER_TEST_API_KEY` for E2E happy paths.
- [ ] Confirm existing `CONVEX_DEPLOY_KEY_PREVIEW` / `CONVEX_DEPLOY_KEY_PROD` still work post-rename.

## Files affected

- `.github/workflows/ci.yml` (new)
- `lefthook.yml` (new)
- `.husky/` (delete)
- Root `package.json` (drop husky dep, add lefthook, root health script)
- README.md (Development section, brief note about hooks)
- `scripts/setup-branch-protection.sh` (new, optional)

## Validation

- [ ] Push a noisy throwaway PR that intentionally fails one check; confirm CI blocks merge.
- [ ] Push a clean PR; confirm green path takes < 5 min including E2E.
- [ ] Verify Lefthook fires correctly on a real commit.

## Risks

- Lefthook + bun staged-file globs need verification — test on a known-noisy commit before flipping main.
- Playwright in CI adds minutes; aggressive caching is non-negotiable.
- Branch protection on `main` while owner is solo should NOT require external reviewer; set "include administrators: false" so owner can self-merge during early refactor.
