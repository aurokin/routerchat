# W5 · Testing Infrastructure

**Goal:** real component coverage in Vitest, real E2E in Playwright, dead-code gate via Knip. Bun Test → Vitest migration across all workspaces.

**Wave:** 1 (Vitest migration, Knip wiring) → 2 (component tests, E2E happy paths).
**Status:** [~] Wave 1 shipped (Vitest + Knip). Wave 2 (RTL, Playwright, MSW, Convex test, coverage) deferred.
**Depends on:** W0 bumps. Parallelizable with W3 + W4.

## Current state (post-Wave-1)

- 747 unit tests now run under Vitest 4 (`vitest run`) — same Bun-driven entrypoint, just a different runner.
- Workspace-aware Vitest config: `vitest.workspace.ts` at the repo root, per-workspace `vitest.config.ts` in each of `apps/web`, `packages/shared`, `packages/convex`.
- Test scripts (`bun run test`) updated in all three workspaces to invoke `vitest run`.
- Knip wired with workspace-aware config; flags unused exports/types and runs in CI as `continue-on-error: true` (informational).
- Removed during Knip cleanup: `apps/web/src/components/chat/ImageViewer.tsx`, `apps/web/src/components/sync/MissingImagePlaceholder.tsx`, `apps/web/src/components/sync/index.ts`, `apps/web/src/lib/sync/index.ts`, `react-hook-form`, `zod`, `eslint-config-next`, `@fsouza/prettierd`.
- Zero E2E / browser / integration tests yet. No `playwright` deps.
- No coverage tooling beyond the `@vitest/coverage-v8` install (config not wired).

## Tasks

### Bun Test → Vitest 4 migration — landed

- [x] Install Vitest 4: `vitest` + `@vitest/coverage-v8` at the repo root.
- [x] Root `vitest.workspace.ts` listing each workspace as a test project.
- [x] Per-workspace `vitest.config.ts` (apps/web, packages/shared, packages/convex). Per-workspace `name` set so reports identify the project.
- [x] `apps/web` config carries the path aliases (`@`, `@shared`, `@convex`) so test files resolve the same way as the production build.
- [x] Test imports migrated: `from "bun:test"` → `from "vitest"` across all 129 files.
- [x] `mock(...)` → `vi.fn(...)`, `mock.module(...)` → `vi.mock(...)`, `ReturnType<typeof mock>` → `ReturnType<typeof vi.fn>` everywhere.
- [x] Workspace test scripts updated: `bun test` → `vitest run`. Root `bun run test` continues to work.
- [x] One CommonJS smoke test (`skeletons.test.ts`) converted from `require()` to `await import(...)` for ESM compatibility.
- [x] Verified: 747 tests pass under Vitest (589 web + 98 shared + 60 convex).
- [x] tsconfigs include `vitest.config.ts` so eslint's `projectService` covers them.

### Knip (dead-code detection) — landed

- [x] Installed `knip` at the root.
- [x] `knip.config.ts` with workspace-aware config: web, shared, convex.
- [x] Ran once, fixed real findings:
    - 4 orphan files deleted.
    - 4 unused dependencies removed (`react-hook-form`, `zod`, `eslint-config-next`, `@fsouza/prettierd`).
    - Tailwind 4 plugins (`tailwindcss`, `@tailwindcss/typography`) listed in `ignoreDependencies` — they're consumed via the CSS `@plugin` / `@import` directives that Knip can't see.
- [x] Root `bun run knip` script.
- [x] CI step added (`continue-on-error: true` for now — 30 unused-export/type findings remain that are mostly API-design "in case someone needs it" rather than true dead code; pruning them is a follow-up).

### Component tests (jsdom + React Testing Library) — DEFERRED

- [ ] Install `@testing-library/react`, `@testing-library/jest-dom`, `jsdom`.
- [ ] Vitest project for `apps/web` test config gets `environment: "jsdom"` for `*.test.tsx`.
- [ ] `setup.ts` importing jest-dom matchers.
- [ ] Component tests for `MessageInput`, `MessageList`, `ModelSelector`, `Sidebar`, `ChatWindow` (post-W6 split).

### MSW for fetch mocking — DEFERRED

- [ ] Install `msw`. Wire shared OpenRouter handlers, swap hand-rolled `as unknown as Response` casts.

### Convex testing — DEFERRED

- [ ] Install `convex-test`. Migrate `convex/__tests__/*` to use the in-memory runtime so we can exercise real auth, schema validators, and `apiKeyAccess` audit rows.

### Playwright E2E (happy paths only) — DEFERRED

- [ ] Install `@playwright/test`, `@axe-core/playwright`.
- [ ] `playwright.config.ts`, happy-path specs for local-only, cloud-sync, settings, clone-to-local.
- [ ] CI: cache Playwright browsers, run on PRs.

### E2E test API key — DEFERRED

- [ ] Add `apps/web/.env.test.local.example` documenting `OPENROUTER_TEST_API_KEY`.
- [ ] CI reads from `secrets.OPENROUTER_TEST_API_KEY`.

### Coverage — DEFERRED

- [ ] Configure Vitest `v8` coverage provider (already installed).
- [ ] Output `coverage/lcov.info`. Report-only initially.

### Remaining Knip findings (Wave 2 cleanup)

- 16 unused exports + 14 unused types — mostly hooks (`useIsDesktop`, `useBreakpoint`), helper functions, and Convex-adapter type aliases that may be deletion candidates. Triage when the surrounding code lands in W6.

### Drop redundant tooling — landed

- [x] Test runtime no longer relies on `bun:test`. `@types/bun` is still pulled in for the runtime globals (Bun.serve etc.); we can drop it once those are migrated too, but it's not blocking.

## Files affected

- All `*.test.ts` / `*.test.tsx` files (~38): import + mock migration.
- New: `vitest.workspace.ts`, three `vitest.config.ts` files, `knip.config.ts`.
- `.github/workflows/ci.yml` — added `Knip` step.
- `package.json` (root + 3 workspaces) — script updates, dep cleanup.

## Validation

- [x] Vitest passes all migrated tests (747 / 747).
- [x] Typecheck clean across all 3 workspaces.
- [x] Lint clean (0 errors, warnings only).
- [x] Web build succeeds.
- [x] `bun run knip` runs and reports informational findings only.
- [ ] Component tests, E2E, coverage thresholds — deferred to Wave 2.

## Risks

- Knip ESM/CJS edge cases: `next.config.ts` and `middleware.ts` get picked up by the apps/web glob, but Knip's redundancy hints noted them as such — current config is intentionally explicit even when redundant (defense against future glob changes).
- Bun → Vitest migration left `@types/bun` in devDeps because the app itself still uses Bun's runtime globals; revisit only if it causes type pollution.

## Smoke-test API key drop

Still documented for the deferred Playwright phase. Place your OpenRouter test key at:

```
apps/web/.env.test.local
```

```
OPENROUTER_TEST_API_KEY=sk-or-...
```

Confirmed gitignored by `.env*.local`. CI will read from `secrets.OPENROUTER_TEST_API_KEY` once Wave 2 wires Playwright.
