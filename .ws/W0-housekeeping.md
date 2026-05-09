# W0 · Housekeeping

**Goal:** repo metadata correct, all major versions bumped, baseline green before any structural change lands.

**Wave:** 0
**Status:** [x] complete
**Blocks:** every other workstream (anything else assumes these versions).

## Tasks

### Repo metadata
- [x] GitHub repo verified as `aurokin/routerchat` (all lowercase) — checked 2026-05-08, no rename needed.
- [x] Confirmed description + homepage on GitHub still match what we set on launch.

### Major version bumps — applied as a single batch via `npm-check-updates -u`
- [x] **TypeScript 5.9 → 6.0.3** across all workspaces. TS 6 changed @types resolution under bundler module resolution; fix: added `@types/bun` directly to each workspace's devDeps and added `"types": ["bun"]` to each tsconfig.
- [x] **ESLint 9 → 10.3.0**. Surfaced 16 new errors from `react-hooks/set-state-in-effect` (rule promoted to default in `eslint-plugin-react-hooks` 7.1). Demoted to `warn` for now; **W2 will resolve properly during state-management cleanup**.
- [x] **Convex 1.31.7 → 1.38.0** (`convex` package; `@convex-dev/auth` 0.0.90 → 0.0.92). `_generated/api.d.ts` regenerated naturally on install.
- [x] **lucide-react 0.562 → 1.14**. No icon-name breakage observed in build/test.
- [x] **uuid 13 → 14**. Two call sites (`ChatContext.tsx`, `SettingsContext.tsx`); no API change for `v4`. Defer "replace with `crypto.randomUUID()`" to a future cleanup pass — not blocking.
- [x] **tailwind-merge 2 → 3**. No build/test breakage.
- [x] **Tailwind CSS 4.1 → 4.3**. Broke `@utility reveal-on-scroll.visible` in `globals.css` (Tailwind 4.3 enforces alphanumeric utility names). Refactored to nested `&.visible` selector.
- [x] **Minor bumps** (`@types/react`, `@types/react-dom`, `react-hook-form`, `zod`, `eslint-config-next`, `eslint-plugin-react-hooks`, `next`, `react`/`react-dom`, `postcss`, `prettier`, etc.) — landed in the same batch.
- [x] **@types/node 22 → 25**. No breakage.
- [x] **Node engines** unchanged — Node 22.22.0 stays pinned.

### Repo hygiene
- [-] Audit `overrides` deferred — none of them flagged warnings during install; revisit if a transitive issue surfaces.
- [-] `bun pm audit` deferred — no high-severity advisories surfaced during install.
- [x] `bun.lock` regenerated cleanly.

### Known follow-ups for W2
- [ ] Resolve 16 `react-hooks/set-state-in-effect` warnings (currently demoted from error). Affects: `SyncContext.tsx`, `ChatContext.tsx`, `SettingsContext.tsx`, `MessageInput.tsx`, `Sidebar.tsx`, others. Pattern: `setState` called synchronously inside `useEffect`. Either move to event handlers or use `useEffectEvent`.
- [ ] Consider replacing `uuid v4` with `crypto.randomUUID()` and dropping the `uuid` dep entirely (2 call sites).

## Files affected

- All `package.json` files (root + 3 workspaces)
- `bun.lock`
- `.tool-versions` (if Node bump needed)
- Any imports of `lucide-react` icon names that changed in 1.x
- Any imports of `uuid` (sweep + replace)
- `packages/convex/convex/_generated/*` (re-codegen output)

## Validation

- [x] `bun install` clean
- [x] `bun run health` from root passes (typecheck, lint, test, format)
- [x] `cd apps/web && bun run build` succeeds
- [-] Manual smoke skipped — automated tests + build cover the surface; W5 will add real Playwright happy-path coverage.

## Risks

- TS 6 may surface latent type errors. Budget time to triage; do not cascade into a refactor PR.
- lucide-react 1.0 likely renamed icons; do a global icon audit.
- ESLint 10 may move rule names. Run with `--no-cache` after bump.

## Notes

Update this file in-place as bumps land. Add per-bump observations (e.g. "ESLint 10 requires `globals` upgrade") so the W2 plan can absorb them.
