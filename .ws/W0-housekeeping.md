# W0 · Housekeeping

**Goal:** repo metadata correct, all major versions bumped, baseline green before any structural change lands.

**Wave:** 0
**Status:** not started
**Blocks:** every other workstream (anything else assumes these versions).

## Tasks

### Repo metadata
- [x] GitHub repo verified as `aurokin/routerchat` (all lowercase) — checked 2026-05-08, no rename needed.
- [ ] Confirm description + homepage on GitHub still match what we set on launch.

### Major version bumps (each its own focused PR with health passing)
- [ ] **TypeScript 5.9 → 6.x** across all workspaces. Read `tsc --version` after install. Skim release notes for syntax changes that affect us. Re-run `bun health` per workspace.
- [ ] **ESLint 9 → 10**. Re-run lint, fix any rule-set drift. Confirm flat-config compatibility.
- [ ] **Convex 1.31 → 1.38** (`convex` package; `@convex-dev/auth` 0.0.90 → 0.0.92). Read changelog for every minor crossed. Re-codegen.
- [ ] **lucide-react 0.x → 1.x** — skim breaking icon-name changes; sweep imports.
- [ ] **uuid 13 → 14** — or, simpler: delete the dep entirely and replace with `crypto.randomUUID()` everywhere. Audit usages first; if all browser-only, drop the package.
- [ ] **tailwind-merge 2 → 3** — re-run app, eyeball component renderings, run E2E once it exists.
- [ ] **Minor bumps** (`@types/*`, `react-hook-form`, `zod`, `prettier`, etc.) — single sweep PR. Run health.
- [ ] **Node engines** — `.tool-versions` pins `node 22.22.0`. If TS 6 / ESLint 10 demand newer, bump.

### Repo hygiene
- [ ] Audit root `package.json` `overrides` section (`@isaacs/brace-expansion`, `markdown-it`, `tar`) — are these still needed after bumps?
- [ ] Run `bun pm audit` (or equivalent); resolve any high-severity advisories.
- [ ] Confirm `bun.lock` regenerated cleanly after all bumps.

## Files affected

- All `package.json` files (root + 3 workspaces)
- `bun.lock`
- `.tool-versions` (if Node bump needed)
- Any imports of `lucide-react` icon names that changed in 1.x
- Any imports of `uuid` (sweep + replace)
- `packages/convex/convex/_generated/*` (re-codegen output)

## Validation

After each bump PR:
- [ ] `bun install` clean
- [ ] `bun run health` from root passes (typecheck, lint, test, format)
- [ ] `cd apps/web && bun run build` succeeds
- [ ] Manual smoke: `bun dev`, send one message in local-only mode

## Risks

- TS 6 may surface latent type errors. Budget time to triage; do not cascade into a refactor PR.
- lucide-react 1.0 likely renamed icons; do a global icon audit.
- ESLint 10 may move rule names. Run with `--no-cache` after bump.

## Notes

Update this file in-place as bumps land. Add per-bump observations (e.g. "ESLint 10 requires `globals` upgrade") so the W2 plan can absorb them.
